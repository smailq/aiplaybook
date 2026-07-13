/**
 * Gateway entry point. Wires the real dependencies (remote Supabase JWKS +
 * the hermes CLI) and starts the HTTP server on the public port.
 */
import { serve } from "@hono/node-server";
import { createRemoteJWKSet } from "jose";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createHermesRunner } from "./hermes.js";

const config = loadConfig();

const jwks = createRemoteJWKSet(new URL(config.supabaseJwksUrl));
const hermes = createHermesRunner({
  hermesBin: config.hermesBin,
  hermesHome: config.hermesHome,
  provider: config.hermesProvider,
  model: config.hermesModel,
});

const app = createApp({ config, jwks, hermes });

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`[gateway] listening on :${info.port} for user ${config.hermesUserId}`);
});
