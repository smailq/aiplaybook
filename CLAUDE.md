# CLAUDE.md - AI Playbook

Guidance for coding agents implementing this project. Read this, then `docs/phase-0-plan.md`, before writing code.

## What this is

AI Playbook is a cloud-hosted SaaS. Each customer gets a **living playbook** - a book they follow to grow - co-authored by an AI agent (the author), a human expert (the chief editor), and the customer (an active participant who reports results and gives feedback). The book evolves through **editions**. The platform is vertical-first (marketing is the first vertical); under the hood each agent is a hosted [Hermes](https://github.com/nousresearch/hermes-agent) agent.

Full product + architecture: `docs/saas-implementation-plan.md`.

## Current state and where to start

Greenfield: only docs, the first vertical's content, and a local dev harness (`tools/hermesctl`) exist. **No app code yet.**

The immediate build target is **Phase 0**, a thin walking skeleton, specified in `docs/phase-0-plan.md`. Build that first, end to end, before anything else. Do not build metering, Stripe, the editorial console, or the vertical-bundle abstraction yet - those are later phases.

Phase 0 in one line: a user logs in with Supabase, the Next.js UI calls that user's own Fly-hosted Hermes backend, and the backend verifies the Supabase JWT before returning the user's data.

## Intended structure

```
docs/        plans + first-vertical content (source of truth)
tools/       hermesctl (local dev harness)
web/         Next.js + Supabase frontend            (to build)
backend/     per-user Fly backend:                  (to build)
               gateway/  auth gateway (Node + jose): verifies Supabase JWT, proxies to Hermes
               image/    Dockerfile extending nousresearch/hermes-agent + s6 sidecar wiring
infra/       provisioning scripts (provision.sh), fly config    (to build)
```

## Phase 0 stack

- **Frontend**: Next.js (App Router) + `@supabase/supabase-js` + `@supabase/ssr`, on Vercel. Magic-link auth.
- **Backend**: one Fly Machine per user. The Hermes server runs on loopback; a small public auth gateway verifies the Supabase JWT and proxies to it. Each user gets their own backend URL, stored in a Supabase `user_backends` table (RLS-scoped).
- **Auth**: Supabase **asymmetric JWT signing keys**, verified at the backend against the public JWKS (`jose` + `createRemoteJWKSet`), scoped by `sub` so a user's token only reaches their own machine. No shared signing secret on backends.
- **Inference**: Hermes → OpenRouter directly (its native provider), capped by an OpenRouter key credit limit. No LLM proxy, no metering in Phase 0.

## Hermes facts you need (already verified - don't re-derive)

The agent runtime is the published image `nousresearch/hermes-agent:latest` (MIT-licensed; native `linux/arm64` + `amd64`).

- **Data dir is `HERMES_HOME=/opt/data`.** Give each agent its own `/opt/data` (a Fly volume in prod, a host folder locally) = full isolation of its memory, skills, sessions, and config.
- **`/opt/data/SOUL.md`** is the agent's identity/persona, injected into the system prompt every message. Seeded once; never overwritten once customized. This is where a vertical's operating prompt goes.
- **`/opt/data/memories/MEMORY.md` + `USER.md`** are agent-curated durable memory, always injected. Created when the agent first writes a memory.
- Auto-injected context files: `SOUL.md`, `AGENTS.md`, `MEMORY.md`/`USER.md`, and preloaded skills. Per-file cap scales with the model's context window (floor ~20K chars), so our multi-KB docs are not truncated.
- **Config** is `/opt/data/config.yaml`. Provider is `openrouter` via `OPENROUTER_API_KEY` (or `hermes setup` / `hermes model`).
- **Runtime**: the image runs s6-overlay as PID 1 (`/init` + `main-wrapper.sh`); it runs as the non-root `hermes` user (uid 10000). `HERMES_UID`/`HERMES_GID` remap the internal user so bind-mounted files stay owned by the host user. Do NOT bypass `/init` (it does uid remap, volume chown, config seeding).
- **CLI surfaces**: `hermes serve` (headless backend server), `hermes -z "<prompt>" --usage-file <path>` (scripted one-shot that also writes a JSON cost/token report, even on failure), `hermes send`, `hermes gateway`. The API server is gated by `API_SERVER_KEY` / `API_SERVER_HOST`; the dashboard binds loopback (port 9119).
- **Extend, don't fork**: add the auth gateway to the image as an s6 longrun service (see `docs/phase-0-plan.md` §4.3) rather than overriding the entrypoint.

## Local dev harness: `tools/hermesctl`

`tools/hermesctl` runs and seeds Hermes agents locally in Apple `container` (macOS), one persisted data folder per agent under `~/hermes-agents/<name>/data`. It is the reference for how the cloud backend provisions and seeds an agent (same `SOUL.md` + `knowledge/` + `/opt/data` mechanics). Use it to test the agent and the gateway locally before deploying to Fly.

Key commands: `hermesctl create <name>`, `hermesctl setup <name>` (provider + key), `hermesctl seed <name> --soul <file> --knowledge <file>`, `hermesctl run <name>`. Requires `brew install container` + `container system start`.

## Conventions

- Kyu's global rules in `~/.claude/CLAUDE.md` apply (they load automatically): no em dash (use `-`), one full sentence per line in long Markdown, never add the agent as a commit co-author, and prefer quality/simplicity/robustness/maintainability over dev-cost shortcuts.
- TypeScript throughout `web/` and `backend/gateway/`. Test what you build.
- Never expose Hermes's own dashboard/API publicly - the gateway is the only public surface and the sole auth chokepoint.
- Keep secrets (Hermes `API_SERVER_KEY`, OpenRouter key, Supabase service-role) in Fly secrets / server env - never in the browser bundle. The browser only ever holds the user's own short-lived Supabase token.
- Cap the OpenRouter key spend in the OpenRouter dashboard - that is the Phase 0 cost guardrail.

## Branding / licensing (non-negotiable)

- The product is **white-labeled as AI Playbook**. "Hermes" and "Nous Research" are trademarks: do not brand the product as Hermes, and do not imply Nous endorsement.
- Hermes is MIT (commercial use is fine) - keep the MIT notice where we ship substantial portions.
- Route inference through providers we choose (OpenRouter); avoid Nous Portal's hosted-data terms unless deliberately opted into and disclosed.
- Full licensing to-dos: `docs/saas-implementation-plan.md` (Licensing and compliance).

## External references

- Hermes agent: https://github.com/nousresearch/hermes-agent (MIT) - image `nousresearch/hermes-agent:latest`.
- Fly.io Machines + Volumes (per-user backend), Supabase (auth + Postgres + RLS), OpenRouter (inference), Vercel (frontend).
