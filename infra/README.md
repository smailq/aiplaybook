# Phase 0 setup runbook

Everything a human does once to stand up the Phase 0 walking skeleton, plus how to provision a test user.
Build order and rationale live in `docs/phase-0-plan.md`; this is the operational checklist.

## 0. Accounts and tools you need

Sign up for these (all have free tiers that cover Phase 0):

| Service | Why | What to grab |
| --- | --- | --- |
| [Supabase](https://supabase.com) | Auth (magic links) + Postgres (`user_backends`) | project URL, publishable key, secret key, JWKS URL |
| [Fly.io](https://fly.io) | One per-user backend machine + volume | nothing yet - you deploy via CLI |
| [OpenRouter](https://openrouter.ai) | Inference for the agent | API key, and set a credit cap |
| [Vercel](https://vercel.com) | Hosts the Next.js frontend | nothing yet - you deploy via CLI/Git |

Install the CLIs locally:

```bash
# Fly
brew install flyctl && fly auth login
# Vercel (optional - you can also connect the repo in the dashboard)
npm i -g vercel && vercel login
```

## 1. Supabase

1. Create a project. From **Project Settings -> API Keys**, copy the **publishable** key (`sb_publishable_...`) and create/copy a **secret** key (`sb_secret_...`). From **Project Settings -> API**, copy the **Project URL**. (Publishable/secret are Supabase's current API keys; they replace the legacy `anon` / `service_role` JWTs. The publishable key is browser-safe; the secret key is server-side only and bypasses RLS.)
2. **Auth -> Providers -> Email**: enable it and turn on **magic links** (email OTP).
3. **Auth -> URL Configuration**: set the **Site URL** to your frontend origin (e.g. `https://aiplaybook.vercel.app`) and add `https://<origin>/auth/callback` to the **Redirect URLs**. Add `http://localhost:3000/**` too if you will run the frontend locally.
4. **Auth -> JWT signing keys**: rotate to an **asymmetric** key (ECC/RSA). This makes the public JWKS endpoint serve a verify-only key, so no signing secret ever lands on a backend. The JWKS URL is `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`.
5. Create the table + RLS: open the **SQL editor**, paste `infra/supabase/schema.sql`, and run it.

## 2. OpenRouter

1. Create an API key.
2. In the dashboard, set a **credit/spend limit** on that key. This is the entire Phase 0 cost guardrail - there is no metering yet, so the cap is what stops a runaway.

## 3. Frontend (Vercel)

Deploy `web/` to Vercel with these environment variables (both are public/browser-safe):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key, sb_publishable_...>
```

Either import the repo in the Vercel dashboard (set the **root directory** to `web`) or run `vercel` from `web/`.
Note the resulting origin - it must match the Supabase Site URL and `FRONTEND_ORIGIN` below.

To run the frontend locally instead: `cd web && cp .env.example .env.local` (fill it in), then `npm install && npm run dev`.

## 4. Create a test user

In Supabase **Auth -> Users**, either invite the tester by email or have them hit `/login` on the frontend once to create their account.
Copy their **user id** (a UUID) - `provision.sh` needs it.

## 5. Provision that user's backend

Put the config in an env file, then run the script. From the repo root:

```bash
cp infra/.env.example infra/.env
# edit infra/.env: SUPABASE_URL, SUPABASE_SECRET_KEY, FRONTEND_ORIGIN,
#                  OPENROUTER_API_KEY (+ optional HERMES_MODEL, FLY_REGION)
infra/provision.sh alice <supabase-user-id>
```

`infra/.env` is gitignored - never commit it. The script reads it by default
(override with `ENV_FILE=/path/to/env`), and any variable already set in your
shell wins over the file, so you can override ad hoc:
`HERMES_MODEL=... infra/provision.sh alice <id>`.

This creates `hermes-alice` on Fly (app + 3GB volume), generates `infra/machine_config.json` with the per-user config, deploys the image (Fly's remote builder builds `backend/image/Dockerfile`) as a multi-container machine, and upserts the user's `backend_url` into Supabase.
The image self-seeds the persona (`SOUL.md`), knowledge, and the starter playbook into the volume on first boot.

The backend runs as a **multi-container machine** so the Hermes image's s6-overlay init gets PID 1 in its own namespace (per Fly's Hermes blueprint).
Because Fly does not inject app secrets into an explicitly-configured container, the gateway's config - including the OpenRouter key - is passed as the container's `env` in the generated (gitignored) `machine_config.json`.
That key is therefore visible in the Fly machine config to the app owner; keep the OpenRouter spend cap on. (Hardening later: move the key to the volume's `config.yaml` via `hermes setup`.)

## 6. Verify end to end

```bash
curl https://hermes-alice.fly.dev/health          # -> {"ok":true}
curl -i https://hermes-alice.fly.dev/playbook      # -> 401 (no token)
```

Then, as the tester: open the frontend, sign in with the magic link, and land on `/app`.
You should see the playbook rendered from that user's own Fly backend, and the **Ask** box should return an agent reply.

Exit criteria (from `docs/phase-0-plan.md` §8):

- magic-link login -> `/app` shows the playbook from the user's own backend;
- `POST /ask` returns an agent reply;
- user B's token against user A's backend is **403**, no/invalid token is **401**;
- no secret ever lives in the browser (only the user's short-lived Supabase token).

## What lives where

- `supabase/schema.sql` - the `user_backends` table + RLS.
- `fly.toml` - shared Fly config for every per-user app.
- `provision.sh` - stand up one user's backend.
- `seed/playbook/` - the starter playbook baked into the image.
