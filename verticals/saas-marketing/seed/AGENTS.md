# The book is your deliverable

Your living deliverables are a **book** stored as files on disk at `/opt/data/book`.
The customer reads exactly these files through the app.
Your roadmap, status snapshot, evidence log, experiment cards, and draft assets live here as chapters and sections - keep them current.

When the customer says "the book", "update the book", "add a section", or "the playbook", they mean these files.
Do not ask for a file path or an uploaded document, and never invent one: read `/opt/data/book`, edit it in place, and keep `metadata.json` in sync.

## Where it lives

- `/opt/data/book/metadata.json` - the table of contents. **The single source of truth for titles and order.**
- `/opt/data/book/<chapter-slug>/<section-slug>/content.md` - one section's markdown body.

A section is a folder containing `content.md`. Example:

```
/opt/data/book/
  metadata.json
  chapter-1/
    section-1/content.md
    section-2/content.md
  chapter-2/
    section-1/content.md
```

## The format (follow exactly)

`metadata.json`:

```json
{
  "schemaVersion": 1,
  "title": "Your Marketing Playbook",
  "chapters": [
    {
      "slug": "chapter-1",
      "title": "Getting Started",
      "sections": [
        { "slug": "section-1", "title": "Welcome", "status": "published" },
        { "slug": "section-2", "title": "How to Use This Book", "summary": "optional one-liner" }
      ]
    }
  ]
}
```

Rules:

- **Titles and order live only in `metadata.json`.** Order is the array order, not the slug number.
- **`content.md` is the body only.** Do **not** start it with an `# H1` title - the app renders the section title from `metadata.json`. Use `##` / `###` for structure inside a section.
- **Slugs** are lowercase `a-z 0-9 -`, unique within their parent, and stable. Reorder by moving the entry in `metadata.json`, never by renaming folders.
- `status` is `"draft"` or `"published"`; `summary` is an optional one-line description. Both are optional.

## How to make changes

- **Edit a section:** change its `content.md`. Nothing else needed.
- **Add a section:** create `book/<chapter>/<section>/content.md` **and** add its `{ "slug", "title" }` to that chapter's `sections` array in `metadata.json`, in the position you want it to appear.
- **Add a chapter:** create the chapter folder and its section folders/`content.md`, **and** add the chapter (with its `sections`) to `metadata.json`.
- **Rename a title or reorder:** edit `metadata.json` only (do not move folders).
- **Remove a section:** delete its folder **and** its entry in `metadata.json`.

Always change the files and `metadata.json` together - they must never disagree.

## Always validate before you finish

After any edit, run:

```
node /opt/gateway/dist/validate-book.js /opt/data/book
```

Fix every **error** it reports before you stop (a section declared in `metadata.json` with no `content.md`, a missing metadata entry, a bad or duplicate slug, an empty title, or invalid JSON).
Resolve **warnings** too (a `content.md` on disk that no metadata entry references will never be shown to the customer).
Never leave the book in a state that fails validation.

## When you report back

After updating the book, tell the customer plainly which chapters and sections you added or changed, and confirm the book validates.
Lead with the decision and the evidence, not a survey of options.
