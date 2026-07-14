# The book format

The product's primary UI/UX is a **book**.
On a user's backend the book is a tree of markdown files under the Hermes data dir (`HERMES_HOME`, `/opt/data`), which the agent has full read/write access to.
The gateway reads it and serves it (`GET /book`); the frontend renders it as a book with a table of contents.

This document is the source of truth for the on-disk format.
A later phase adds Hermes skills and prompts that author and edit the book in this format, and they check their work against the validator described here.

## Directory layout

```
book/
  metadata.json                     <- authoritative table of contents
  <chapter-slug>/
    <section-slug>/
      content.md                    <- the section's markdown body
```

Concretely:

```
book/
  metadata.json
  chapter-1/
    section-1/
      content.md
    section-2/
      content.md
  chapter-2/
    section-1/
      content.md
```

Rules:

- A **section is a folder** containing `content.md`.
A folder (not a bare `.md` file) keeps a section as the natural unit of a versioned "release" and leaves room for co-located assets and per-section metadata later, without reshaping anything.
- **`content.md` is pure body prose** - it does **not** repeat the section title as a leading `# H1`.
The title lives only in `metadata.json`; the reader renders it as the section heading and then the body below.
`content.md` may still use `##`/`###` for structure within the section.
- **Slugs** (`chapter-1`, `section-1`) are stable identifiers matching `^[a-z0-9]+(-[a-z0-9]+)*$`, unique within their parent.
They are IDs, not order - a section can be reordered or retitled without moving its folder.
Meaningful slugs (e.g. `positioning`) are encouraged; the seed uses the `chapter-N`/`section-N` convention.
- **Order comes from array order in `metadata.json`**, never from filesystem sort or slug numbering.

## `metadata.json`

The table of contents: human-friendly titles and order for every chapter and section.

```json
{
  "schemaVersion": 1,
  "title": "Your Marketing Playbook",
  "chapters": [
    {
      "slug": "chapter-1",
      "title": "Getting Started",
      "sections": [
        { "slug": "section-1", "title": "Welcome" },
        { "slug": "section-2", "title": "How to Use This Book" }
      ]
    },
    {
      "slug": "chapter-2",
      "title": "Positioning",
      "sections": [
        { "slug": "section-1", "title": "Positioning (v0 - Draft)" }
      ]
    }
  ]
}
```

Fields:

| Field | Where | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | root | yes | must be `1` |
| `title` | root | yes | the book's title (non-empty) |
| `chapters[]` | root | yes | ordered array |
| `slug` | chapter, section | yes | stable id, `^[a-z0-9]+(-[a-z0-9]+)*$`, unique within parent |
| `title` | chapter, section | yes | human-friendly display name (non-empty) |
| `sections[]` | chapter | yes | ordered array |
| `summary` | section | no | one-line summary, surfaced in the TOC |
| `status` | section | no | `"draft"` or `"published"` |

## Served shape (`GET /book`)

The gateway returns the metadata TOC with each section's `content.md` inlined, in metadata order:

```json
{
  "title": "Your Marketing Playbook",
  "chapters": [
    {
      "slug": "chapter-1",
      "title": "Getting Started",
      "sections": [
        {
          "slug": "section-1",
          "title": "Welcome",
          "chapterSlug": "chapter-1",
          "content": "Welcome to your living playbook...",
          "status": "published"
        }
      ]
    }
  ]
}
```

`GET /book/:chapter/:section` returns a single section object (same shape as a `sections[]` entry), or `404` if it is not declared in metadata / has no `content.md`.

## Validation

`validateBook(bookDir)` (in `backend/gateway/src/book.ts`) enforces the format and is exposed as a CLI:

```bash
node dist/validate-book.js /opt/data/book      # exits non-zero on any error
```

It checks:

- `metadata.json` exists, is valid JSON, matches the schema, and `schemaVersion === 1`;
- slug format and uniqueness within each parent, and non-empty titles;
- **error**: every section declared in metadata has a readable `content.md` on disk;
- **warning**: every `content.md` on disk is referenced by metadata (an orphan file will never be served).

The gateway also uses the same read path, so a malformed book surfaces as a `500` with the specific problems rather than a blank page.

## Seed

The starter book lives in the vertical bundle at `verticals/saas-marketing/seed/book/` and is baked into the per-user image (`backend/image/Dockerfile`), which self-seeds it into `/opt/data/book` on first boot (`backend/image/seed.sh`) without ever overwriting an existing book.
