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
let playbookDir: string;

const hermesStub: HermesRunner = {
  async ask(prompt: string) {
    return { reply: `echo: ${prompt}` };
  },
};

function makeConfig(): Config {
  return {
    port: 0,
    supabaseUrl: SUPABASE_URL,
    supabaseJwksUrl: "unused-in-tests",
    hermesUserId: USER_A,
    frontendOrigin: "https://app.example.com",
    playbookDir,
    hermesBin: "hermes",
    hermesHome: "/opt/data",
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

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  signKey = privateKey;
  const pub: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256" };
  jwks = createLocalJWKSet({ keys: [pub] });

  playbookDir = await mkdtemp(join(tmpdir(), "playbook-"));
  await mkdir(join(playbookDir, "sub"), { recursive: true });
  await writeFile(join(playbookDir, "01-intro.md"), "# Intro\n\nHello.\n");
  await writeFile(join(playbookDir, "sub", "02-more.md"), "no heading here\n");
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
    const res = await app().request("/playbook");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token with 401", async () => {
    const res = await app().request("/playbook", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const res = await app().request("/playbook", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A, expired: true })}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-issuer token with 401", async () => {
    const res = await app().request("/playbook", {
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A, issuer: "https://evil/auth/v1" })}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-audience token with 401", async () => {
    const res = await app().request("/playbook", {
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A, audience: "anon" })}`,
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects user B's valid token against user A's backend with 403", async () => {
    const res = await app().request("/playbook", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_B })}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /playbook", () => {
  it("returns the user's pages, sorted, with derived titles", async () => {
    const res = await app().request("/playbook", {
      headers: { Authorization: `Bearer ${await token({ sub: USER_A })}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pages: { path: string; title: string; content: string }[];
    };
    expect(body.pages.map((p) => p.path)).toEqual(["01-intro.md", "sub/02-more.md"]);
    expect(body.pages[0]!.title).toBe("Intro");
    expect(body.pages[1]!.title).toBe("sub/02-more.md"); // no heading -> filename
  });
});

describe("POST /ask", () => {
  it("runs the agent for an authed user", async () => {
    const res = await app().request("/ask", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await token({ sub: USER_A })}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "echo: hi" });
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

  it("still requires auth", async () => {
    const res = await app().request("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(res.status).toBe(401);
  });
});

