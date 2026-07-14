/**
 * Exercises the gateway's auth guarantees end to end against the real Hono app,
 * using a locally-generated EC key pair to stand in for Supabase's asymmetric
 * signing keys. No network or real Supabase needed: we build a JWKS from the
 * local public key and sign our own tokens with the private key.
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { HermesRunner } from "../src/hermes.js";

const SUPABASE_URL = "https://proj.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

let signKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;
let bookDir: string;

const hermesStub: HermesRunner = {
  async ask(prompt: string) {
    return { reply: `echo: ${prompt}` };
  },
};

function makeConfig(): Config {
  return {
    port: 0,
    host: "::",
    supabaseUrl: SUPABASE_URL,
    supabaseJwksUrl: "unused-in-tests",
    hermesUserId: USER_A,
    frontendOrigin: "https://app.example.com",
    bookDir,
    hermesBin: "hermes",
    hermesHome: "/opt/data",
    hermesProvider: "openrouter",
    hermesModel: "",
    hermesTimeoutMs: 600_000,
  };
}

async function token(opts: {
  sub: string;
  issuer?: string;
  audience?: string;
  expired?: boolean;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? "authenticated")
    .setIssuedAt(opts.expired ? now - 7200 : now)
    .setExpirationTime(opts.expired ? now - 3600 : now + 3600)
    .sign(signKey);
}

function app() {
  return createApp({ config: makeConfig(), jwks, hermes: hermesStub });
}

function appWith(hermes: HermesRunner) {
  return createApp({ config: makeConfig(), jwks, hermes });
}

/** Poll GET /ask/:id on a specific app instance until it leaves "running". */
async function pollJob(
  a: ReturnType<typeof createApp>,
  id: string,
  authHeader: string,
): Promise<{ status: string; reply?: string; error?: string }> {
  for (let i = 0; i < 50; i++) {
    const res = await a.request(`/ask/${id}`, { headers: { Authorization: authHeader } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; reply?: string; error?: string };
    if (body.status !== "running") return body;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("job did not finish in time");
}

function appWithOrigins(frontendOrigin: string) {
  return createApp({
    config: { ...makeConfig(), frontendOrigin },
    jwks,
    hermes: hermesStub,
  });
}

/** Write a small but complete two-chapter book fixture to `dir`. */
async function seedBook(dir: string): Promise<void> {
  const metadata = {
    schemaVersion: 1,
    title: "Test Playbook",
    chapters: [
      {
        slug: "chapter-1",
        title: "Getting Started",
        sections: [
          { slug: "section-1", title: "Welcome" },
          { slug: "section-2", title: "How to Use This Book" },
        ],
      },
      {
        slug: "chapter-2",
        title: "Positioning",
        sections: [{ slug: "section-1", title: "Positioning" }],
      },
    ],
  };
  await writeFile(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
  const sections: [string, string, string][] = [
    ["chapter-1", "section-1", "Welcome to the book.\n"],
    ["chapter-1", "section-2", "Read, run, report.\n"],
    ["chapter-2", "section-1", "We help people who drown in paperwork.\n"],
  ];
  for (const [ch, sec, body] of sections) {
    await mkdir(join(dir, ch, sec), { recursive: true });
    await writeFile(join(dir, ch, sec, "content.md"), body);
  }
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  signKey = privateKey;
  const pub: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256" };
  jwks = createLocalJWKSet({ keys: [pub] });

  bookDir = await mkdtemp(join(tmpdir(), "book-"));
  await seedBook(bookDir);
});

describe("CORS", () => {
  it("allows each origin in a comma-separated list (tolerating trailing slashes)", async () => {
    const a = appWithOrigins("https://a.example.com, https://b.example.com/");
    for (const origin of ["https://a.example.com", "https://b.example.com"]) {
      const res = await a.request("/book", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    }
  });

  it("does not allow an origin outside the list", async () => {
    const a = appWithOrigins("https://a.example.com");
    const res = await a.request("/book", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).not.toBe(
      "https://evil.example.com",
    );
  });
});

describe("GET /health", () => {
  it("is public", async () => {
    const res = await app().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("auth on protected routes", () => {
  it("rejects a missing token with 401", async () => {
    const res = await app().request("/book");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token with 401", async () => {
    const res = await app().request("/book", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const res = await app().request("/book", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A, expired: true })}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-issuer token with 401", async () => {
    const res = await app().request("/book", {
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A, issuer: "https://evil/auth/v1" })}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-audience token with 401", async () => {
    const res = await app().request("/book", {
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A, audience: "anon" })}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects user B's valid token against user A's backend with 403", async () => {
    const res = await app().request("/book", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_B })}` },
    });
    expect(res.status).toBe(403);
  });

  it("guards the single-section route too", async () => {
    const res = await app().request("/book/chapter-1/section-1");
    expect(res.status).toBe(401);
  });
});

describe("GET /book", () => {
  it("returns the structured book in metadata order with content inlined", async () => {
    const res = await app().request("/book", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A })}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      title: string;
      chapters: {
        slug: string;
        title: string;
        sections: { slug: string; title: string; content: string; chapterSlug: string }[];
      }[];
    };
    expect(body.title).toBe("Test Playbook");
    expect(body.chapters.map((c) => c.slug)).toEqual(["chapter-1", "chapter-2"]);
    expect(body.chapters[0]!.sections.map((s) => s.title)).toEqual([
      "Welcome",
      "How to Use This Book",
    ]);
    expect(body.chapters[0]!.sections[0]!.content).toBe("Welcome to the book.\n");
    expect(body.chapters[0]!.sections[0]!.chapterSlug).toBe("chapter-1");
  });
});

describe("GET /book/:chapter/:section", () => {
  it("returns a single section", async () => {
    const res = await app().request("/book/chapter-2/section-1", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A })}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; content: string };
    expect(body.title).toBe("Positioning");
    expect(body.content).toBe("We help people who drown in paperwork.\n");
  });

  it("returns 404 for an unknown section", async () => {
    const res = await app().request("/book/chapter-1/nope", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A })}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /ask (async job)", () => {
  it("starts a job (202 + id) and the reply arrives via GET /ask/:id", async () => {
    const a = app();
    const auth = `Bearer ${await token({ sub: USER_A })}`;
    const res = await a.request("/ask", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(typeof id).toBe("string");

    const result = await pollJob(a, id, auth);
    expect(result.status).toBe("done");
    expect(result.reply).toBe("echo: hi");
  });

  it("reports a failed agent turn as status error (not an HTTP error)", async () => {
    const failing: HermesRunner = {
      async ask() {
        throw new Error("boom");
      },
    };
    const a = appWith(failing);
    const auth = `Bearer ${await token({ sub: USER_A })}`;
    const res = await a.request("/ask", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    const result = await pollJob(a, id, auth);
    expect(result.status).toBe("error");
  });

  it("returns 404 for an unknown job id", async () => {
    const res = await app().request("/ask/does-not-exist", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A })}` },
    });
    expect(res.status).toBe(404);
  });

  it("rejects an empty prompt with 400", async () => {
    const res = await app().request("/ask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A })}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "  " }),
    });
    expect(res.status).toBe(400);
  });

  it("still requires auth on POST /ask and GET /ask/:id", async () => {
    const post = await app().request("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(post.status).toBe(401);
    const get = await app().request("/ask/whatever");
    expect(get.status).toBe(401);
  });
});
