# Vertical bundle: SaaS Marketing Playbook

A **vertical bundle** is the productized knowhow behind one playbook - the single
source of truth that both the catalog (the bookshelf UI) and provisioning read
from.
This is the first vertical; adding another is authoring a new bundle here, not
changing the platform.
The abstraction is specified in `docs/saas-implementation-plan.md` §4.6.

## Layout

```
saas-marketing/
  bundle.json        Product/catalog metadata: id, title, tagline, status,
                     cover colors, north-star, and the "what to expect" list.
                     Canonical product metadata.
  onboarding.json    The onboarding question schema (drives the future wizard;
                     the answers tailor the persona and brief per customer).
  skills/            Vertical-specific Hermes skills (repeatable routines the
                     agent can invoke): competitor-scan, message-test.
  seed/              What gets rendered onto a new agent's volume at provisioning.
    SOUL.md          Persona / operating prompt, injected every message.
    AGENTS.md        Operating instructions: how to read/edit/validate the book.
    knowledge/       Reference docs the agent reads and curates into memory.
    book/            The starter book (metadata.json + chapters/sections); see
                     docs/book-format.md.
```

## How it reaches an agent

`backend/image/Dockerfile` bakes `seed/` and `skills/` into the image under
`/opt/playbook-seed/`.
On first boot, `backend/image/seed.sh` copies them onto the agent's volume
(`/opt/data/{SOUL.md, AGENTS.md, knowledge/, book/, skills/}`) - idempotently, so
a customer's edits and the agent's memory always survive a redeploy.
`GET /book` then serves the book, and the agent authors it in place following
`AGENTS.md`.

## Status: in development

`bundle.json` marks this `in-development`.
The catalog (`web/lib/catalog.ts`, shown at `/library`) mirrors the display
fields; when the book is ready, flip the status to `available` and wire the
onboarding wizard + a per-product reader.
Until then it is browse-only in the library.
