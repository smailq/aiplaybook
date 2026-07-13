# AI Playbook

A cloud-hosted SaaS that gives each customer a **living playbook** for their business - a book they follow to grow, co-authored by three parties:

- **An AI agent (the author)** researches, plans, and writes the chapters at machine scale.
- **A human expert (the chief editor)** reviews, edits, and approves; nothing reaches the reader unedited.
- **The customer (an active participant)** follows the plays, reports results, and gives feedback, which becomes source material for the next edition.

The book is **living**: each learn-plan-act-measure-revise cycle publishes a new **edition**. The platform is vertical-first (marketing is the first vertical) and the agent is a hosted [Hermes](https://github.com/nousresearch/hermes-agent) agent under the hood.

## Status

Greenfield. This repo currently holds the plans, the first vertical's content, and a local dev harness - **no application code yet**. Start from the Phase 0 plan.

## Start here

1. `docs/saas-implementation-plan.md` - the master plan (architecture, data model, roadmap, pricing, economics, risks, licensing).
2. `docs/phase-0-plan.md` - the **current build target**: a thin walking skeleton (Next.js + Supabase + a per-user Fly backend running Hermes behind an auth gateway). Read this first before writing code.
3. `CLAUDE.md` - guidance for coding agents working in this repo.

## Repo layout (current + intended)

```
docs/                         plans + the first vertical's content
  saas-implementation-plan.md   the master plan
  phase-0-plan.md               the Phase 0 walking skeleton (build this first)
  hermes-marketing-agent-prompt.md   marketing vertical: the agent's operating prompt (SOUL)
  awareness3-product-brief.md        marketing vertical: an example customer brief
tools/
  hermesctl                   local dev harness: run/seed Hermes agents in Apple `container`
                              (the reference for how the cloud backend provisions + seeds an agent)

# to be built (see phase-0-plan.md):
web/                          Next.js + Supabase frontend
backend/                      the per-user Fly backend (auth gateway + Hermes server image)
```

## Phase 0 stack (the walking skeleton)

- **Frontend**: Next.js + Supabase (magic-link auth), on Vercel.
- **Backend**: one Fly Machine per user running the Hermes server on loopback behind a small auth gateway that verifies the Supabase JWT (public JWKS). Each user gets their own backend URL.
- **Inference**: OpenRouter directly (Hermes's native provider), capped by an OpenRouter key credit limit. No LLM proxy, no metering at this stage.

## License / branding note

The Hermes agent is MIT-licensed (commercial use is fine), but "Hermes"/"Nous Research" are trademarks - this product is **white-labeled as AI Playbook** and must not be branded as Hermes or imply endorsement. See the licensing section in `docs/saas-implementation-plan.md`.
