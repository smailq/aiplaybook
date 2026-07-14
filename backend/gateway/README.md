# Auth gateway

The only public process on a user's backend. It verifies the caller's Supabase JWT against the project's public JWKS, checks that the token's `sub` matches the one user this machine was provisioned for, and only then reads the user's book off the volume or runs their agent. Hermes itself never binds a public port.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | liveness (Fly health check) |
| GET | `/book` | Supabase JWT | the whole book (TOC + each section's markdown) from `/opt/data/book` |
| GET | `/book/:chapter/:section` | Supabase JWT | a single section (deep links / lazy loading) |
| POST | `/ask` | Supabase JWT | start an agent turn (`hermes -z`), return a job id |
| GET | `/ask/:id` | Supabase JWT | poll that turn: `running`, then `done` (+reply) or `error` |

An agent turn can run for minutes and may edit the book, so `/ask` is async: `POST /ask` `{ "prompt": "..." }` returns `202 { "id": "..." }`, and the client polls `GET /ask/:id` until it returns `{ "status": "done", "reply": "..." }` (or `{ "status": "error", ... }`). Jobs live in gateway memory and are pruned after a TTL. The book data model (folders + `metadata.json`) is documented in `docs/book-format.md`.

## Layout

- `src/auth.ts` - JWT verification + `sub` scoping (the security core).
- `src/config.ts` - env-driven config, one place per machine learns its user id.
- `src/book.ts` - reads + validates the book (metadata.json + chapters/sections) off the volume.
- `src/validate-book.ts` - CLI (`node dist/validate-book.js <bookDir>`) the agent shells out to.
- `src/hermes.ts` - shells out to the `hermes` CLI (`-z`, `--provider`, `-m`).
- `src/jobs.ts` - in-memory store of async agent turns (POST /ask starts one, GET /ask/:id polls it).
- `src/app.ts` - Hono app wiring routes + CORS + the auth guard.
- `test/app.test.ts`, `test/book.test.ts` - end-to-end auth tests + book model unit tests (no real Supabase needed).

## Develop

```bash
npm install
npm run typecheck
npm test          # auth (401/403), book, and ask paths
npm run dev       # needs the env vars in src/config.ts set
```

The gateway ships inside the per-user image (`backend/image/Dockerfile`) as an s6 sidecar; see that Dockerfile and `backend/image/s6/gateway/run`.
