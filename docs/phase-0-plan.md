# Phase 0 - Walking Skeleton (detailed)

> Expands the summary Phase 0 in `saas-implementation-plan.md` from a headless spike into a thin, end-to-end walking skeleton with a UI and real auth.
> Goal: one real user logs in with Supabase, the Next.js UI calls that user's own Fly-hosted Hermes backend, and the backend independently verifies the Supabase token before returning the user's data.
> Everything here is deliberately minimal - it proves the spine (auth + per-user backend + round-trip + metering), not the product.

## 1. What Phase 0 proves

- A **per-user backend** runs on Fly (a Hermes server + a persistent volume), reachable at a per-user URL.
- **Supabase auth** works on the frontend AND is enforced at the backend (the "authenticate with Supabase in the backend as well" requirement).
- The **frontend reads a user's data from that user's backend** over an authenticated call.
- Inference runs through **OpenRouter directly** - no proxy and no metering, since there are only one or two testers; cost risk is capped by a credit limit on the OpenRouter key.

Non-goals for Phase 0 (deferred to Phase 1): self-serve provisioning, Stripe, the LLM-proxy and metering (Hermes talks to OpenRouter directly here), the expert workspace, the rich book UI/UX, and the vertical-bundle abstraction.

## 2. Architecture

```
   Browser (Next.js on Vercel)
     │  1. magic-link login
     ▼
   Supabase ── Auth (JWT, asymmetric signing keys → public JWKS)
     │         Postgres: user_backends(user_id → backend_url)  [RLS]
     │  2. read own backend_url
     ▼
   Browser ── 3. GET/POST  https://hermes-<slug>.fly.dev/...   (Authorization: Bearer <supabase JWT>)
                            │
                            ▼   per-user Fly Machine (one app per user)
              ┌───────────────────────────────────────────────┐
              │  AUTH GATEWAY (public :8787, Node + jose)      │
              │   verify JWT via Supabase JWKS · check sub ==  │
              │   this machine's user · add Hermes API key     │
              └───────────────┬───────────────────────────────┘
                              │ localhost
              ┌───────────────▼───────────────┐   ┌────────────────────┐
              │  HERMES SERVER (loopback)      │──▶│ OpenRouter (direct)│─▶ models
              │  hermes serve · API_SERVER_KEY │   │ one key + credit    │
              │  /opt/data volume (SOUL, book) │   │ cap · no proxy      │
              └────────────────────────────────┘   └────────────────────┘
```

Hermes stays on loopback; only the gateway is public. The frontend calls the gateway; the gateway is the sole place Supabase auth is enforced on the backend.

## 3. Auth design (the easiest safe path)

**Use Supabase asymmetric JWT signing keys, verified at the backend against the public JWKS.**
This is the easiest option that is also safe, because the backend needs only a public key (no shared secret is copied onto every Fly machine).

Flow:

1. The user signs in on the frontend with a **magic link** (passwordless - the least-friction Supabase method). Supabase returns a session with a signed `access_token` (JWT).
2. The frontend calls the user's backend URL with `Authorization: Bearer <access_token>`.
3. The gateway verifies the JWT against Supabase's JWKS (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`), checking signature, `iss`, `aud = authenticated`, and expiry.
4. The gateway checks `payload.sub == HERMES_USER_ID` (the Supabase user id this machine was provisioned for), so a valid token for user A cannot reach user B's machine.
5. On success, the gateway forwards to the local Hermes server, injecting the static `API_SERVER_KEY` Hermes expects.

Enable asymmetric keys in the Supabase dashboard (Auth → JWT signing keys → rotate to an ECC/RSA key) so the JWKS endpoint serves a public key.
Fallback if asymmetric keys are unavailable: verify the legacy HS256 token with the project JWT secret (HMAC), but note the tradeoff - that secret can also *sign* tokens, so shipping it to every backend widens the blast radius. Prefer asymmetric.

Gateway verification (illustrative, `jose`):

```js
import { createRemoteJWKSet, jwtVerify } from 'jose'
const JWKS = createRemoteJWKSet(new URL(process.env.SUPABASE_JWKS_URL))

async function requireUser(authHeader) {
  const token = (authHeader ?? '').replace(/^Bearer /, '')
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  })
  if (payload.sub !== process.env.HERMES_USER_ID) throw new Error('forbidden')
  return payload            // payload.sub = the user id, payload.email, etc.
}
```

## 4. Components

### 4.1 Supabase

- **Auth**: enable the Email provider with magic links; set the site URL + redirect URLs to the frontend origin.
- **JWT**: enable asymmetric signing keys; note the JWKS URL.
- **Postgres table** mapping each user to their backend, with RLS so a user reads only their own row:

```sql
create table public.user_backends (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  backend_url text not null,
  machine_id  text,
  created_at  timestamptz not null default now()
);
alter table public.user_backends enable row level security;
create policy "read own backend" on public.user_backends
  for select using (auth.uid() = user_id);
-- writes happen from the provisioning script via the service-role key (bypasses RLS).
```

### 4.2 Frontend (Next.js + Supabase)

- Stack: Next.js (App Router) + `@supabase/supabase-js` + `@supabase/ssr`, deployed on Vercel.
- Pages:
  - `/login` - email input → `supabase.auth.signInWithOtp({ email })` (magic link).
  - `/app` - the workspace: after auth, look up the backend URL and render the user's data.
- Calling the user's backend:

```ts
const { data: { session } } = await supabase.auth.getSession()
const { data: row } = await supabase
  .from('user_backends').select('backend_url').single()      // RLS returns only my row

const res = await fetch(`${row.backend_url}/book`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
})
```

- Minimal UI (enough to prove the round-trip):
  - **Book view** - render the book the agent has written (from `GET /book`), with a table-of-contents sidebar and a reading pane (see `docs/book-format.md`).
  - **Ask box** - a text field that `POST`s a prompt to the backend and shows the reply.

### 4.3 Backend (per-user Fly Machine)

One Fly app per user gives a clean public URL and one volume. The machine runs two processes: the public auth gateway and the loopback Hermes server.

- **Image**: extend the Hermes image rather than modify it, adding the gateway as an s6 service so Hermes's own init (uid remap, volume chown, config seeding) is untouched.

```dockerfile
FROM nousresearch/hermes-agent:latest
COPY gateway /opt/gateway
RUN cd /opt/gateway && npm ci --omit=dev
# register the gateway as an s6-overlay longrun service (runs alongside `hermes serve`)
COPY s6/gateway/run /etc/s6-overlay/s6-rc.d/gateway/run
RUN printf 'longrun' > /etc/s6-overlay/s6-rc.d/gateway/type \
 && touch /etc/s6-overlay/s6-rc.d/user/contents.d/gateway
EXPOSE 8787
```

- **Gateway** (`/opt/gateway`, Node + Hono + jose): CORS locked to the frontend origin; the `requireUser` check above on every request; then:
  - `GET /book` - read the book (`metadata.json` + `chapter/section/content.md`) under `/opt/data/book` from the volume and return the assembled TOC + content (proves an authed data read); see `docs/book-format.md`.
  - `POST /ask` + `GET /ask/:id` - start an agent turn and poll it (proves an authed agent invocation). A turn can run for minutes and may edit the book, so it is async: `POST` returns a job id, the client polls until `done`/`error`.
  - `GET /health` - unauthenticated liveness.
- **Agent invocation - two options**:
  - First cut (lowest risk): `/ask` shells out to `hermes -z "<prompt>" --usage-file /tmp/u.json`, which we have already validated end to end; the usage file is just logged for a sanity check (no meter in Phase 0). Simple, but a cold run per request.
  - Upgrade: run `hermes serve` on loopback with `API_SERVER_KEY` and have the gateway proxy chat to it for a responsive session. Confirm the `serve` HTTP/WS contract during the build; until then, `-z` is the fallback.
- **Fly command**: set the machine's process to `serve` (routed by the image's `main-wrapper`), so Hermes runs as the main program while the gateway runs as its s6 sidecar.
- **Env / secrets** (Fly secrets): `HERMES_USER_ID`, `HERMES_API_SERVER_KEY`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `FRONTEND_ORIGIN`, and `OPENROUTER_API_KEY`.
  Hermes talks to OpenRouter directly (provider `openrouter` in `config.yaml`); there is no proxy in Phase 0.

### 4.4 Provisioning (Phase 0: a script, not a control plane)

A `provision.sh` that a human runs per user:

```bash
SLUG=$1 UID=$2                                  # UID = the Supabase user id
fly apps create "hermes-$SLUG"
fly volumes create data --app "hermes-$SLUG" --size 3 --region iad
fly secrets set --app "hermes-$SLUG" \
  HERMES_USER_ID="$UID" HERMES_API_SERVER_KEY="$(openssl rand -hex 24)" \
  SUPABASE_URL=... SUPABASE_JWKS_URL=... FRONTEND_ORIGIN=... \
  OPENROUTER_API_KEY="$OPENROUTER_KEY"
fly deploy --app "hermes-$SLUG" --image "$GATEWAY_IMAGE"
# seed the volume with SOUL.md + knowledge (reuse hermesctl's seed mechanics):
#   one-off `fly ssh console` / `fly ssh sftp`, or a first-boot seed step in the image
# record the backend URL for the frontend (service-role write, bypasses RLS):
curl -s "$SUPABASE_URL/rest/v1/user_backends" -H "apikey: $SERVICE_ROLE" \
  -H "Authorization: Bearer $SERVICE_ROLE" -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$UID\",\"backend_url\":\"https://hermes-$SLUG.fly.dev\",\"machine_id\":\"hermes-$SLUG\"}"
```

## 5. Build order

1. **Supabase**: project, magic-link auth, asymmetric JWT keys, `user_backends` table + RLS.
2. **Gateway, locally**: verify a real Supabase JWT, enforce `sub`, serve `/book` + `/ask` against a local Hermes. Test it against Apple `container` first (reuse `hermesctl` - the local dev harness), before Fly.
3. **Extension image**: bundle the gateway as an s6 sidecar; confirm both the gateway (public port) and Hermes (loopback) run in one container locally.
4. **Fly, one user**: `provision.sh` for a single test user; get the URL; seed the volume; insert the `user_backends` row.
5. **Frontend**: `/login` (magic link) → `/app` reads `backend_url` → calls `/book` and `/ask`, renders the book with a TOC + reading pane.
6. **Verify end to end** (exit criteria below).

## 6. Per-user URL strategy

- One Fly app per user → `https://hermes-<slug>.fly.dev`, stored in `user_backends.backend_url`.
- The browser calls it directly, so the gateway must send CORS headers for the frontend origin.
- Alternative (if you would rather not expose per-user URLs to the browser or deal with CORS): proxy through a Next.js route handler (a BFF) server-side. Phase 0 uses direct calls to match the "each user gets a backend URL" requirement; the BFF is an easy later swap.

## 7. Security notes

- Hermes's own API/dashboard never bind to a public interface; only the gateway is public, and it is the single auth chokepoint.
- Every request is JWT-verified and `sub`-scoped to the machine's user, so one user's token cannot read another's backend.
- Secrets (`API_SERVER_KEY`, tenant LLM key, Supabase service role) live in Fly secrets and the frontend/server env, never in the browser bundle (the browser only ever holds the user's own short-lived Supabase access token).
- Prefer asymmetric JWT verification so no signing secret is distributed to backends.
- Set a credit/spend limit on the OpenRouter key (OpenRouter dashboard), so even the skeleton cannot run away on cost; this replaces metering for Phase 0.

## 8. Exit criteria

- A test user completes magic-link login, lands on `/app`, and sees their playbook rendered from **their own** Fly backend.
- `POST /ask` returns an agent reply (the `-z --usage-file` cost shows in logs; no metering system is built).
- A request with **user B's token to user A's backend URL is rejected (403)**, and a request with no/invalid token is rejected (401).
- The backend URL, auth, and data round-trip work without any secret living in the browser.

## 9. Open questions to confirm during the build

- The exact `hermes serve` HTTP/WS API surface (for the responsive-chat upgrade); until confirmed, `/ask` uses `hermes -z`.
- Whether asymmetric JWT signing keys are enabled on the Supabase plan in use; if not, use the HS256 fallback with the noted tradeoff.
- Whether to give each tester their own OpenRouter key (cleaner separation) or share one capped key (simplest); either is fine at this scale.
- The simplest volume-seeding step on Fly (first-boot seed baked into the image vs. `fly ssh` after deploy).
