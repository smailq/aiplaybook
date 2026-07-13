# Auth gateway

The only public process on a user's backend. It verifies the caller's Supabase JWT against the project's public JWKS, checks that the token's `sub` matches the one user this machine was provisioned for, and only then reads the user's playbook off the volume or runs their agent. Hermes itself never binds a public port.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | liveness (Fly health check) |
| GET | `/playbook` | Supabase JWT | the user's markdown pages from `/opt/data/awareness3` |
| POST | `/ask` | Supabase JWT | run one agent turn (`hermes -z`), return the reply |

`/ask` body: `{ "prompt": "..." }` -> `{ "reply": "..." }`.

## Layout

- `src/auth.ts` - JWT verification + `sub` scoping (the security core).
- `src/config.ts` - env-driven config, one place per machine learns its user id.
- `src/playbook.ts` - reads markdown pages off the volume.
- `src/hermes.ts` - shells out to the `hermes` CLI (`-z`, `--provider`, `-m`).
- `src/app.ts` - Hono app wiring routes + CORS + the auth guard.
- `test/app.test.ts` - end-to-end auth tests against a locally-signed key pair (no real Supabase needed).

## Develop

```bash
npm install
npm run typecheck
npm test          # auth (401/403), playbook, and ask paths
npm run dev       # needs the env vars in src/config.ts set
```

The gateway ships inside the per-user image (`backend/image/Dockerfile`) as an s6 sidecar; see that Dockerfile and `backend/image/s6/gateway/run`.
