/**
 * The gateway HTTP app.
 *
 * Public surface of a per-user backend. Every route except /health is
 * JWT-verified and scoped to this machine's user. On success it reads the
 * user's book off the volume or runs their agent - Hermes itself never
 * leaves loopback.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { AuthError, requireUser } from "./auth.js";
import type { Config } from "./config.js";
import type { HermesRunner } from "./hermes.js";
import { BookError, readBook, readSection } from "./book.js";
import { createJobStore } from "./jobs.js";

export interface AppDeps {
  config: Config;
  /** Key resolver for JWT verification (remote JWKS in prod, local in tests). */
  jwks: JWTVerifyGetKey;
  hermes: HermesRunner;
}

type Env = { Variables: { user: JWTPayload } };

export function createApp({ config, jwks, hermes }: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  const issuer = `${config.supabaseUrl}/auth/v1`;

  // FRONTEND_ORIGIN may be a comma-separated list (e.g. production + preview +
  // a custom domain). Hono echoes the request origin when it is in the list.
  const allowedOrigins = config.frontendOrigin
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, "")) // tolerate trailing slashes
    .filter(Boolean);

  app.use(
    "*",
    cors({
      origin: allowedOrigins,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );

  // Unauthenticated liveness probe (used by Fly health checks).
  app.get("/health", (c) => c.json({ ok: true }));

  const authGuard: MiddlewareHandler<Env> = async (c, next) => {
    try {
      const payload = await requireUser(c.req.header("Authorization"), {
        jwks,
        issuer,
        hermesUserId: config.hermesUserId,
      });
      c.set("user", payload);
      await next();
    } catch (err) {
      if (err instanceof AuthError) {
        return c.json({ error: err.message }, err.status);
      }
      throw err;
    }
  };

  // Async agent turns: POST /ask starts a job, GET /ask/:id polls it.
  const jobs = createJobStore();

  // Auth guard applied to everything below.
  app.use("/book", authGuard);
  app.use("/book/*", authGuard);
  app.use("/ask", authGuard);
  app.use("/ask/*", authGuard);

  // Authenticated read of the user's own book: the full TOC with each section's
  // markdown inlined, in metadata order. A malformed/missing book on the volume is
  // a 500 with a clear message (not a blank 200), so a bad seed is debuggable.
  app.get("/book", async (c) => {
    try {
      return c.json(await readBook(config.bookDir));
    } catch (err) {
      if (err instanceof BookError) {
        console.error(`[gateway] invalid book at ${config.bookDir}:`, err.errors);
        return c.json({ error: err.message, details: err.errors }, 500);
      }
      throw err;
    }
  });

  // Authenticated read of a single section (deep links / future lazy loading).
  app.get("/book/:chapter/:section", async (c) => {
    try {
      const section = await readSection(
        config.bookDir,
        c.req.param("chapter"),
        c.req.param("section"),
      );
      if (!section) return c.json({ error: "section not found" }, 404);
      return c.json(section);
    } catch (err) {
      if (err instanceof BookError) {
        console.error(`[gateway] invalid book at ${config.bookDir}:`, err.errors);
        return c.json({ error: err.message, details: err.errors }, 500);
      }
      throw err;
    }
  });

  // Start an agent turn. Returns 202 with a job id immediately; the turn runs in
  // the background (it can take minutes and may edit the book on the volume), and
  // the client polls GET /ask/:id for the result.
  app.post("/ask", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "expected JSON body" }, 400);
    }
    const prompt = (body as { prompt?: unknown })?.prompt;
    if (typeof prompt !== "string" || prompt.trim() === "") {
      return c.json({ error: "field 'prompt' (non-empty string) is required" }, 400);
    }

    const id = jobs.start(async () => (await hermes.ask(prompt)).reply);
    return c.json({ id }, 202);
  });

  // Poll an agent turn. `running` while in flight; then `done` with the reply or
  // `error`. A 404 means the id is unknown (never started, or pruned after TTL).
  app.get("/ask/:id", (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job) return c.json({ error: "job not found" }, 404);
    // The poll itself succeeded (200); the job's own outcome is in the body.
    if (job.status === "done") return c.json({ status: "done", reply: job.reply });
    if (job.status === "error") return c.json({ status: "error", error: job.error });
    return c.json({ status: "running" });
  });

  return app;
}
