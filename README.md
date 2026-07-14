# AI Playbook

A cloud-hosted SaaS that gives each customer a **living playbook** for their business - a book they follow to grow, co-authored by three parties:

- **An AI agent (the author)** researches, plans, and writes the chapters at machine scale.
- **A human expert (the guide)** edits the book and gives direction to both the AI and the customer - a collaborator working in the open, not an approval gate.
- **The customer (an active participant)** follows the plays, reports results, and gives feedback, which becomes source material for the next revision.

Everything is transparent: all three co-author in the open, with the whole book visible to everyone. The book is **living** and improves granularly - each learn-plan-act-measure-revise cycle revises specific pages or sections (each independently versioned, like software releases), not the whole book at once. The app should **feel like a real, designed book** - not a set of markdown files (detailed UI/UX comes later). The platform is vertical-first (marketing is the first vertical), and the agent is a hosted [Hermes](https://github.com/nousresearch/hermes-agent) agent under the hood.

## Status

Phase 0 (the walking skeleton) is built: the Next.js + Supabase frontend (`web/`), the per-user auth gateway + Hermes image (`backend/`), and the provisioning + schema (`infra/`).
To stand it up, follow `infra/README.md` (accounts, Supabase, and provisioning a user).

## Start here

1. `docs/saas-implementation-plan.md` - the master plan (architecture, data model, roadmap, pricing, economics, risks, licensing).
2. `docs/phase-0-plan.md` - the **current build target**: a thin walking skeleton (Next.js + Supabase + a per-user Fly backend running Hermes behind an auth gateway). Read this first before writing code.
3. `CLAUDE.md` - guidance for coding agents working in this repo.

## Repo layout (current + intended)

```
docs/                         plans + book/bundle formats
  saas-implementation-plan.md   the master plan
  phase-0-plan.md               the Phase 0 walking skeleton (build this first)
  book-format.md                the on-disk book data model (metadata.json + chapters)
verticals/                    vertical bundles: the productized playbook knowhow
  saas-marketing/             the first vertical (SaaS Marketing Playbook)
    bundle.json                 product/catalog metadata + status
    onboarding.json             onboarding question schema
    skills/                     vertical-specific Hermes skills
    seed/                       SOUL.md, AGENTS.md, knowledge/, book/ (baked into the image)
tools/
  hermesctl                   local dev harness: run/seed Hermes agents in Apple `container`
                              (the reference for how the cloud backend provisions + seeds an agent)

web/                          Next.js + Supabase frontend (landing + library + magic-link login -> book + ask)
backend/
  gateway/                    auth gateway (Node + Hono + jose): verifies the Supabase JWT, proxies to Hermes
  image/                      Dockerfile extending nousresearch/hermes-agent + s6 sidecar wiring + first-boot seed
infra/
  README.md                   the Phase 0 setup runbook (accounts + provisioning) - start here to deploy
  supabase/schema.sql         user_backends table + RLS
  provision.sh                stand up one per-user Fly backend
  fly.toml                    shared Fly config for every per-user app
```

## Phase 0 stack (the walking skeleton)

- **Frontend**: Next.js + Supabase (magic-link auth), on Vercel.
- **Backend**: one Fly Machine per user running the Hermes server on loopback behind a small auth gateway that verifies the Supabase JWT (public JWKS). Each user gets their own backend URL.
- **Inference**: OpenRouter directly (Hermes's native provider), capped by an OpenRouter key credit limit. No LLM proxy, no metering at this stage.

## License / branding note

The Hermes agent is MIT-licensed (commercial use is fine), but "Hermes"/"Nous Research" are trademarks - this product is **white-labeled as AI Playbook** and must not be branded as Hermes or imply endorsement. See the licensing section in `docs/saas-implementation-plan.md`.
