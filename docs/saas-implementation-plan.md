# Hermes Agents SaaS - Implementation Plan

> A proposal for turning the Hermes-agent setup into a cloud-hosted, paid product.
> Decisions this plan is built on (chosen by the founder):
> cloud-hosted agents, a vertical-first platform (marketing first, more verticals later), bundled/resold inference with usage billing, and a web-app surface.
> The product is experienced as a **living playbook**: a book the customer follows, co-authored by an AI author, a human chief editor, and the customer, and evolving through editions.
> This document was updated for the playbook framing at plan-altitude; detailed implementation follows later.

## 1. Product: a living, co-authored playbook

A customer signs up on a web app, answers a few setup questions for their vertical (marketing to start), and within minutes has a **living playbook** for their business: a book they follow to grow.
Under the hood it is a hosted AI agent that learns their business from web research, plans an evidence-based roadmap, and drafts the work.
To the customer, that work is presented as a book they read and act on, not a chatbot.

The playbook is **co-authored by three parties**:

- **The AI agent is the author.** It researches, plans, and writes the chapters at machine scale.
- **A human expert is the chief editor.** They review, edit, and approve what the author writes; nothing reaches the reader unedited.
- **The customer is an active participant.** They follow the playbook, report results, and leave feedback, and those contributions become source material for the next edition.

The book is **living**: each learn-plan-act-measure-revise cycle publishes a new **edition**, so the playbook sharpens as the business executes against it.

We host and run each agent, meter and resell the inference, and bill a subscription plus usage.
The strategic asset we own is the **vertical knowhow**: the persona, the knowledge brief, the skills, the onboarding questions, the integrations, and the editorial guardrails that make a playbook good at a specific job.
The platform is the delivery vehicle; the verticals are the product; the playbook is how it is experienced.

## 2. Why the pieces are shaped this way

- **Cloud-hosted** because the agent must work when the customer's laptop is closed: scheduled research, always-on inboxes/webhooks, and a persistent memory that deepens over time.
  Apple `container` is macOS-only, so production runs the same `nousresearch/hermes-agent` Docker image on Linux; `hermesctl` remains our local dev harness and the reference for how provisioning seeds an agent.
- **Vertical-first, platform-underneath** because starting narrow (marketing) sells better and is easier to make genuinely good, while a bundle abstraction keeps vertical #2 a configuration exercise rather than a rewrite.
- **Human-in-the-loop as editorial** because it is both the quality bar and the near-term moat: the agent authors, the chief editor edits and approves, and that editorial review is a core product surface, not glue.
- **The playbook surface** because a book the customer co-authors and follows is far harder to commoditize than "another AI chat agent," and the three-way authorship (author, editor, reader) is the felt product.
- **Bundled inference** because it raises perceived value and margin, but it forces a metering seam: every token an agent spends must be attributed to a tenant, capped, and billed, or a single runaway loop erases the margin.

## 3. Architecture overview

```
                         ┌──────────────────────────────────────────────┐
        Customer  ─────▶ │  PLAYBOOK APP (Next.js · book UI)             │
        (reader &        │   the living book: chapters + editions        │
         co-author)      │   onboarding wizard · results/feedback margins│
                         │   Stripe checkout · usage view                │
                         └───────────────┬──────────────────────────────┘
        Chief editor ──▶ │  EDITORIAL CONSOLE (role-gated, same app)     │
        (human expert)   │   edit · annotate · approve · publish edition │
                         └───────────────┬──────────────────────────────┘
                                         │  authenticated API
                                         ▼
                         ┌──────────────────────────────────────────────┐
                         │  CONTROL PLANE (API + workers)                │
                         │   auth/orgs · billing · provisioning ·        │
                         │   vertical registry · scheduling · metering   │
                         └───┬───────────────┬───────────────┬──────────┘
              provision      │               │ route+meter   │ schedule
              (Fly API)      ▼               ▼               ▼
        ┌────────────────────────┐   ┌───────────────┐  ┌──────────────┐
        │ AGENT RUNTIME per tenant│   │ LLM PROXY     │  │ JOB RUNNER    │
        │  Hermes container +     │──▶│ (LiteLLM):    │  │ (Inngest):    │
        │  /opt/data volume       │   │ per-tenant key│  │ provision,    │
        │  (SOUL, memory, skills, │   │ budgets, usage│  │ weekly runs,  │
        │   sessions, config)     │   │ export        │  │ retries       │
        └────────────────────────┘   └──────┬────────┘  └──────────────┘
                                            │ usage records
                                            ▼
                                        Stripe (subscription + metered)
```

The agent runtime is the author, the editorial console is the chief editor, and the customer contributes results and feedback through the book UI - all three write into the same living playbook.

The agent never talks to a model provider directly.
It is configured to call our LLM proxy with a per-tenant key, so all spend is attributed, capped, and billable at one seam.

## 4. Core components

### 4.1 Agent runtime (per tenant)

- One Hermes container per agent, each with its own `/opt/data` volume holding that agent's SOUL, memory (`MEMORY.md`/`USER.md`), skills, sessions, and config - the same isolation model `hermesctl` uses locally, one volume per tenant.
- We drive the container via Hermes's own surfaces (all confirmed in the image):
  - `hermes serve` - the headless backend server that powers chat and remote backends.
  - the API server (gated by `API_SERVER_KEY`) for programmatic control.
  - `hermes -z/--oneshot "<prompt>" --usage-file <path>` - a scripted single run that also writes a JSON usage report (estimated cost, token counts, model, api_calls) even on failure, which is a ready-made per-run metering hook.
  - `hermes send` for scripted/cron messages, `hermes gateway` for messaging channels.
- The Hermes web dashboard binds to loopback by design; we NEVER expose it publicly - the web app proxies to it behind our own auth.
- Runs as the non-root `hermes` user (the image already does this).

### 4.2 Compute platform

- Recommendation for MVP: **Fly.io Machines + Volumes**.
  Each tenant is a Machine plus a persistent Volume, created/started/stopped through the Fly Machines API, which fits per-tenant provisioning and scale-to-zero cleanly.
- Scheduling is control-plane-owned: the job runner wakes a Machine, runs the scheduled task (a `-z` run or an API call), and stops it when idle, so we do not pay to idle every agent 24/7.
- Scale path: AWS ECS/Fargate + EFS, or Kubernetes, once tenant count or reliability needs outgrow Fly.

### 4.3 Control plane

The brain. Responsibilities:

- **Auth and tenancy** - orgs, users, roles (customer_admin, expert, staff), memberships.
- **Provisioning** - create/seed/start/stop/destroy a tenant agent; render the vertical bundle into the volume; set model routing to the proxy; health-check.
- **Vertical registry** - the versioned bundles (see 4.6).
- **Scheduling** - trigger each agent's recurring research/roadmap runs and any per-vertical cadences.
- **Metering and quotas** - ingest usage from the proxy (and `--usage-file`), enforce caps, push to Stripe, auto-pause on runaway.
- **Billing** - Stripe subscriptions plus metered usage.
- **Observability** - per-tenant status, logs, spend, and alerts.

### 4.4 LLM proxy and metering (the margin-critical seam)

- Put a self-hosted OpenAI-compatible proxy (**LiteLLM** or equivalent) between every agent and the real providers.
- Each tenant gets a virtual key with a budget and rate limit; the agent's Hermes config points `model.provider`/`base_url`/`api_key` at the proxy.
- The proxy meters tokens and cost per key, enforces per-tenant spend caps and rate limits, and exports usage the control plane turns into Stripe usage records.
- Abuse controls live here: hard spend caps, per-minute limits, and an auto-pause that stops an agent whose loop is burning tokens.
- Model tiering for COGS: route routine steps (drafting, parsing) to cheaper models and reserve premium models for synthesis; this is the main lever on gross margin.
- Optionally layer Nous Portal's Tool Gateway (web search, image gen, TTS, cloud browser) for tool features, still metered through us.

### 4.5 Playbook app (onboarding + book UI + editorial console)

- Public marketing site plus the signed-in app.
- **Onboarding wizard** (the "few setup questions"): pick vertical, answer 5-7 vertical questions, choose a plan, provision.
  For marketing the questions are: product name and URL, who it is for, the primary goal/north-star, brand voice, current channels, and known competitors.
  The magic-moment: onboarding kicks off an author research pass over the customer's URL to draft the playbook's first edition, so the book arrives already written.
- **The book UI (the customer's primary surface)**: the living playbook rendered as a book - front matter, chapters (Situation, Strategy, Roadmap, Plays, Results, Appendix/evidence), a table of contents, and edition history on the spine.
  Every section carries an editorial state (drafting -> in review -> published -> superseded), and editor changes show as margin notes / tracked edits, so it reads as a real evolving book rather than a chat log.
- **Reader participation**: the customer follows the plays, reports results, and leaves feedback in the margins; those contributions are captured as source material and trigger the next edition.
- **Editorial console (chief editor, role-gated)**: the human expert reviews and edits the author's chapters before they publish, annotates, approves, and cuts a new edition.
  The agent authors in advisor mode (it drafts; the editor publishes), so nothing reaches the reader unedited.
- Chat with the author still exists, but the book is the durable artifact and the primary surface.

### 4.6 Vertical bundle (the productized knowhow)

A vertical is a versioned package the company maintains, rendered into an agent's volume at provisioning:

- `soul.md.tmpl` - the persona/operating prompt with placeholders for the onboarding answers (for marketing, the operating prompt already drafted).
- `brief` - either a static template or a brief-generation prompt run at onboarding (for marketing, the product-brief format already drafted).
- `skills/` - vertical-specific Hermes skills.
- `onboarding.json` - the question schema that drives the wizard.
- `toolset` and integrations - the channels the vertical needs.
- `north_star`, guardrails, and default model routing.

Provisioning renders the bundle plus the customer's answers into `SOUL.md`, `knowledge/`, and `skills/` on the volume - the productized, server-side version of `hermesctl seed`.
Adding a vertical is authoring a new bundle, not changing the platform.

### 4.7 Data model (control-plane database, sketch)

- `orgs`, `users`, `memberships(role: customer_admin | editor | staff)`.
- `verticals(id, name, bundle_version)`.
- `agents(id, org_id, vertical_id, machine_id, volume_id, status, model_routing, created_at)` - the AI author's runtime.
- `playbooks(id, agent_id, vertical_id, current_edition_id)` - one living book per customer.
- `editions(id, playbook_id, number, status: draft|published, published_at)`.
- `sections(id, edition_id, chapter, editorial_state: drafting|in_review|published|superseded, body, order)`.
- `contributions(id, section_id, author_kind: agent|editor|customer, type: draft|edit|annotation|result|feedback, payload, created_at)` - the three-way authorship trail (author drafts, editor edits, reader results/feedback).
- `onboarding_answers(agent_id, jsonb)`.
- `subscriptions` (Stripe), `usage_records(tenant, period, tokens, cost)`.
- `editor_assignments(editor_user_id, playbook_id_or_org_id)`, and `messages` (chat with the author).
- Secrets (per-tenant proxy key, integration creds) live in a secrets manager, not the app DB.

## 5. Tech stack (recommended)

- **Web app**: Next.js (App Router) + Tailwind + shadcn/ui - matches the stack already used in `awareness3`.
- **Auth + database**: Supabase (Postgres, Auth, Row-Level Security) - reuses existing team knowledge; Clerk is the alternative if you want auth off the critical path.
- **Compute**: Fly.io Machines + Volumes (per-tenant agent), Fly Machines API from the control plane.
- **LLM proxy**: LiteLLM (self-hosted) for per-tenant keys, budgets, and usage export.
- **Billing**: Stripe (subscriptions + metered usage/meters).
- **Jobs/scheduling**: Inngest (durable functions: provisioning, scheduled runs, retries) - or a Postgres-backed worker (pg-boss) for a lighter start.
- **Secrets**: Fly secrets + Supabase Vault or Doppler.
- **Observability**: ship per-agent logs to Grafana/Logtail; health and spend dashboards in the control plane.
- **Agent image**: pin a specific `nousresearch/hermes-agent` version; test bundles against each upgrade.

## 6. Phased roadmap

### Phase 0 - Spine spike (about 1-2 weeks)

Prove the end-to-end spine on one hardcoded agent, no UI:

1. Provision a Hermes container on a Fly Machine with a Volume from the control plane.
2. Seed a rendered `SOUL.md` + `knowledge/` into the Volume (the marketing bundle).
3. Point the agent's model config at OpenRouter directly - one key with a credit cap for safety, no metering proxy (with only one or two testers, metering is not worth building yet).
4. Run a `-z --usage-file` task and confirm the agent produces output; eyeball the usage file for cost, no meter to reconcile.
5. Stop and destroy the Machine.

Exit criterion: provision -> seed -> run -> tear down works end to end.
This de-risks the hardest part (per-tenant runtime lifecycle) before any product is built; the LiteLLM metering proxy arrives in Phase 1 with paying users.

The detailed Phase 0 (`phase-0-plan.md`) expands this into a thin walking skeleton: it adds a Next.js + Supabase UI and a per-user Fly backend (a Hermes server behind an auth gateway) that verifies the Supabase JWT itself, so one real user can log in and read their own agent's data end to end.

### Phase 1 - MVP SaaS, marketing vertical only (about 4-8 weeks)

- Supabase auth + schema; org-per-customer.
- Next.js app: signup -> marketing onboarding wizard (5-7 Qs) -> Stripe checkout -> provisioning -> the playbook's first edition rendered in the book UI.
- Provisioning worker (Inngest): create Machine + Volume, render the marketing bundle + answers, seed, start, health-check, and the onboarding research pass that drafts the first edition.
- LiteLLM proxy with per-tenant keys, budgets, and usage export -> Stripe metered billing.
- Book UI v1: the living playbook as a book (chapters + editorial states + edition history), with reader results/feedback captured in the margins.
- Editorial console v1: role-gated chief-editor views to edit, annotate, approve, and publish an edition; advisor-mode gating so nothing publishes unedited.
- Control-plane scheduling: a weekly research/revise run per agent that drafts the next edition (wake -> run -> stop).
- Guardrails: spend caps, rate limits, auto-pause, and an admin kill switch.

Exit criterion: a stranger can sign up, pay, answer the questions, and get a working, metered, editor-reviewed marketing playbook.

### Phase 2 - Vertical platform and depth

- Extract the bundle abstraction so onboarding, SOUL, skills, toolset, and guardrails are data-driven; author vertical #2 as config.
- Marketing integrations via Hermes skills/MCP (analytics, email/ESP, social, CMS).
- Richer expert workflows: assignment, review queues, SLAs, audit trail, and templated approvals.
- Usage dashboards, tiered plans, per-plan quotas, and overage.

### Phase 3 - Scale and trust

- Cost and cold-start work: keep-warm pool or a slimmer agent image (the stock image is heavy - Chromium, Node, Python), model-tiering tuned for COGS, scale-to-zero with acceptable wake latency.
- Reliability: move to autoscaling or Kubernetes if tenant count demands it; per-tenant backups (`hermes backup`).
- Enterprise: SSO, multi-seat orgs, DPA, and a SOC2 path.

## 7. Pricing model (sketch)

- Tiered subscription (Starter / Pro / Team) bundling platform access, a set of chief-editor hours, and included monthly usage.
- Metered overage on inference beyond the included allotment (tokens or "credits").
- Editorial (chief-editor) hours as a separate lever, since the human-in-the-loop cost is as real as compute.
- Annual plans for cash flow; a time-boxed trial with a hard spend cap rather than an open-ended free tier (bundled inference makes a generous free tier dangerous).

## 8. Unit economics and the two costs to watch

- **Inference COGS** is controlled at the proxy: per-tenant budgets, model tiering, and auto-pause.
  Instrument gross margin per tenant from day one; a bundled-inference business dies quietly if a few power users or a looping agent run unmetered.
- **Chief-editor time** is the other real cost.
  Define editor capacity per customer and an edition-turnaround SLA, and price so the included editor hours stay profitable; the author's job is to raise how many playbooks one editor can keep current.

## 9. Key risks and how the plan addresses them

- **Runaway token spend** - mitigated by the proxy seam, per-tenant budgets, and auto-pause; validated in Phase 0.
- **Heavy image, slow cold starts** - accept a warm agent in MVP, then a keep-warm pool or slimmer image in Phase 3.
- **Hermes upgrade churn** - pin image versions and test each vertical bundle against a new image before rollout.
- **Dashboard/API exposure** - never expose Hermes's own dashboard/API publicly; always front it with our authenticated proxy, and isolate tenants by container, volume, and network.
- **Editorial capacity scaling** - treat chief-editor capacity and an edition-turnaround SLA as first-class product and pricing constraints; the author's job is to raise how many playbooks one editor can keep current.
- **Compliance for B2B** - per-tenant isolation, a secrets manager, a DPA, and a privacy policy before selling to companies that ask.

## 10. Licensing and compliance

The Hermes agent code is **MIT-licensed** (confirmed in the repo `LICENSE`, `pyproject.toml` `license = "MIT"`, and the `LICENSE` bundled in the Docker image), so commercial and for-profit use is explicitly permitted with no fees, per-seat charges, or copyleft obligations.
That clears the core question, but a paid SaaS on top of it has five to-dos to close before launch:

1. **Keep the MIT notice.** Include the MIT copyright + permission notice wherever we ship substantial portions of the software; that is the only real obligation MIT imposes.
2. **Inference terms are separate.** MIT covers the framework, not the models; our token COGS is governed by whichever provider serves inference (OpenRouter/Anthropic/our proxy) under their commercial terms.
3. **Avoid Nous Portal's data terms unless we opt in.** Nous's hosted services (Nous Portal / Tool Gateway) run under their own Terms of Service, which reportedly let Nous use aggregated/anonymized/de-identified data and derived models for any purpose, including sharing with third parties.
   Routing through our own LLM proxy to providers we choose keeps customer data off those terms; only use Nous Portal deliberately and disclose it if we do.
4. **White-label the branding.** MIT licenses the code, not the trademarks; we must not name the product "Hermes" or imply Nous endorses us, and we ship under our own brand.
5. **Scan bundled dependencies and skills.** The image ships Chromium/Playwright, Node, s6-overlay, and dozens of third-party skills, each under its own license; run a one-time dependency-license scan and drop any skill whose license forbids commercial/hosted use.

Not legal advice: have counsel review the trademark, dependency, and (if we touch Nous Portal) data-terms points before taking payment.

## 11. What we already have that feeds this

- The per-agent isolation model, seeding mechanism, and lifecycle commands (`hermesctl`) are the local reference for server-side provisioning; the same `SOUL.md` + `knowledge/` + volume mechanics apply on Fly.
- The marketing vertical's persona and knowledge brief are already drafted (`docs/hermes-marketing-agent-prompt.md`, `docs/awareness3-product-brief.md`) - they become the first vertical bundle.
  Follow-up (detailed implementation): reframe that operating prompt so the agent authors the playbook (chapters + editions) and submits chapters to the chief editor for review, rather than emitting freeform proposals.
- The `awareness3` codebase already uses Next.js + Supabase + Stripe-adjacent patterns, so the web app stack is familiar to the team.
