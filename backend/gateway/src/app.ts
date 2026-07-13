/**
 * The gateway HTTP app.
 *
 * Public surface of a per-user backend. Every route except /health is
 * JWT-verified and scoped to this machine's user. On success it reads the
 * user's playbook off the volume or runs their agent - Hermes itself never
 * leaves loopback.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { AuthError, requireUser } from "./auth.js";
import type { Config } from "./config.js";
import type { HermesRunner } from "./hermes.js";
import { readPlaybook } from "./playbook.js";

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

  // Auth guard applied to everything below.
  app.use("/playbook", authGuard);
  app.use("/ask", authGuard);

  // Authenticated read of the user's own playbook.
  app.get("/playbook", async (c) => {
    const playbook = await readPlaybook(config.playbookDir);
    return c.json(playbook);
  });

  // Authenticated agent turn.
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

    const result = await hermes.ask(prompt);
    return c.json({ reply: result.reply });
  });

  return app;
}
