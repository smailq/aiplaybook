/**
 * Gateway configuration, loaded once from the environment.
 *
 * Every value here is provisioned per user as a Fly secret (see infra/provision.sh).
 * The gateway is the only public surface of a user's backend, so this config is
 * also the single place the machine learns *which* Supabase user it belongs to
 * (HERMES_USER_ID) and how to reach the loopback Hermes server.
 */

export interface Config {
  /** Public port the gateway listens on. */
  port: number;
  /** Bind address. Defaults to "::" (dual-stack) so Fly's proxy can reach it over IPv6. */
  host: string;
  /** Supabase project URL, e.g. https://abcd.supabase.co (used to build the JWT issuer). */
  supabaseUrl: string;
  /** JWKS endpoint that serves Supabase's public signing keys. */
  supabaseJwksUrl: string;
  /** The Supabase user id this machine was provisioned for. Tokens for any other `sub` are rejected. */
  hermesUserId: string;
  /** Browser origin allowed by CORS (the deployed frontend). */
  frontendOrigin: string;
  /** Directory on the Hermes volume holding the user's playbook markdown. */
  playbookDir: string;
  /** Path to the `hermes` CLI used to run the agent. */
  hermesBin: string;
  /** Working dir for the hermes CLI (its HERMES_HOME). */
  hermesHome: string;
  /** Inference provider passed to `hermes -z --provider`. */
  hermesProvider: string;
  /** Optional model id passed to `hermes -z -m`; empty = use the agent's config default. */
  hermesModel: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export function loadConfig(): Config {
  const supabaseUrl = required("SUPABASE_URL").replace(/\/+$/, "");
  return {
    port: Number(optional("PORT", "8787")),
    host: optional("HOST", "::"),
    supabaseUrl,
    supabaseJwksUrl: optional(
      "SUPABASE_JWKS_URL",
      `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    ),
    hermesUserId: required("HERMES_USER_ID"),
    frontendOrigin: required("FRONTEND_ORIGIN"),
    playbookDir: optional("PLAYBOOK_DIR", "/opt/data/awareness3"),
    hermesBin: optional("HERMES_BIN", "hermes"),
    hermesHome: optional("HERMES_HOME", "/opt/data"),
    hermesProvider: optional("HERMES_PROVIDER", "openrouter"),
    hermesModel: optional("HERMES_MODEL", ""),
  };
}
