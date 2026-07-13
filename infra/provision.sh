#!/usr/bin/env bash
#
# provision.sh - stand up one per-user AI Playbook backend on Fly.
#
# Phase 0 is a script, not a control plane: a human runs this once per tester.
# It creates the Fly app + volume, sets the per-user secrets, deploys the
# gateway+Hermes image, and records the backend URL in Supabase so the frontend
# can find it. The image self-seeds the persona + starter playbook on first boot
# (see backend/image/seed.sh), so there is no separate volume-seeding step.
#
# Usage (run from the repo root):
#   cp infra/.env.example infra/.env   # then fill it in
#   infra/provision.sh <slug> <supabase-user-id>
#
# Config is read from an env file (default: infra/.env, override with ENV_FILE).
# Any variable already set in the environment wins over the file, so you can
# still override ad hoc, e.g.  HERMES_MODEL=... infra/provision.sh alice <id>
#
# Config keys (see infra/.env.example / infra/README.md):
#   SUPABASE_URL                  https://<project>.supabase.co
#   SUPABASE_SECRET_KEY           Supabase secret key (sb_secret_...); server-side only, never shipped to the browser
#   FRONTEND_ORIGIN               deployed frontend origin, e.g. https://aiplaybook.vercel.app
#   OPENROUTER_API_KEY            OpenRouter key with a credit cap set in the dashboard
# Optional:
#   FLY_REGION                    default: iad (must match infra/fly.toml primary_region)
#   HERMES_MODEL                  OpenRouter model id for /ask (default: the agent's config default)
#   SUPABASE_JWKS_URL             default: $SUPABASE_URL/auth/v1/.well-known/jwks.json

set -euo pipefail

die() { printf 'error: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*" >&2; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[ $# -eq 2 ] || die "usage: infra/provision.sh <slug> <supabase-user-id>"
SLUG="$1"
USER_ID="$2"
APP="hermes-$SLUG"

# Load config from the env file. Assignments do NOT clobber variables already
# present in the environment, so an inline override on the command line wins.
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
if [ -f "$ENV_FILE" ]; then
  info "loading config from $ENV_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    line="${line#export }"
    key="${line%%=*}"
    val="${line#*=}"
    [ "$key" = "$line" ] && continue          # no '=' on this line, skip
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -z "$key" ] && continue
    # strip one layer of surrounding single or double quotes
    case "$val" in
      \"*\") val="${val#\"}"; val="${val%\"}" ;;
      \'*\') val="${val#\'}"; val="${val%\'}" ;;
    esac
    # only set if not already exported (env precedence)
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$ENV_FILE"
fi

# Region: single source of truth is fly.toml's primary_region, so the volume and
# the machine can never land in different regions (a machine can only mount a
# volume in its own region). FLY_REGION overrides both if set.
FLY_TOML="$SCRIPT_DIR/fly.toml"
TOML_REGION="$(sed -n 's/^[[:space:]]*primary_region[[:space:]]*=[[:space:]]*"\{0,1\}\([a-z0-9]\{1,\}\)"\{0,1\}.*/\1/p' "$FLY_TOML" 2>/dev/null | head -1)"
REGION="${FLY_REGION:-${TOML_REGION:-iad}}"

case "$SLUG" in
  ''|*[!a-z0-9-]*) die "slug must be lowercase letters, digits, and dashes only" ;;
esac

command -v fly >/dev/null 2>&1 || die "flyctl not found - install it and run 'fly auth login' (see infra/README.md)"

: "${SUPABASE_URL:?set SUPABASE_URL (in $ENV_FILE)}"
: "${SUPABASE_SECRET_KEY:?set SUPABASE_SECRET_KEY (in $ENV_FILE)}"
: "${FRONTEND_ORIGIN:?set FRONTEND_ORIGIN (in $ENV_FILE)}"
: "${OPENROUTER_API_KEY:?set OPENROUTER_API_KEY (in $ENV_FILE)}"
SUPABASE_URL="${SUPABASE_URL%/}"
JWKS_URL="${SUPABASE_JWKS_URL:-$SUPABASE_URL/auth/v1/.well-known/jwks.json}"

REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# 1. App -----------------------------------------------------------------------
if fly apps list 2>/dev/null | grep -qw "$APP"; then
  info "app $APP already exists, reusing"
else
  info "creating app $APP"
  fly apps create "$APP"
fi

# 2. Volume (idempotent-ish: only create if none exists) -----------------------
if [ -z "$(fly volumes list --app "$APP" 2>/dev/null | grep -w data || true)" ]; then
  info "creating 3GB volume 'data' in $REGION"
  fly volumes create data --app "$APP" --size 3 --region "$REGION" --yes
else
  info "volume 'data' already exists, reusing"
fi

# 3. Secrets (per-user identity + provider key) --------------------------------
info "setting secrets"
fly secrets set --app "$APP" --stage \
  HERMES_USER_ID="$USER_ID" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_JWKS_URL="$JWKS_URL" \
  FRONTEND_ORIGIN="$FRONTEND_ORIGIN" \
  OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
  ${HERMES_MODEL:+HERMES_MODEL="$HERMES_MODEL"}

# 4. Deploy the gateway+Hermes image (built by Fly's remote builder) -----------
# --ha=false: one machine per user (no standby). The image is deployed as a
# multi-container machine (see infra/fly.toml + machine_config.json) so the
# base image's s6-overlay /init gets PID 1 in its own namespace.
info "deploying $APP"
fly deploy --app "$APP" --config infra/fly.toml --remote-only --ha=false

# 5. Record the backend URL for the frontend (secret-key write bypasses RLS) ---
BACKEND_URL="https://$APP.fly.dev"
info "recording backend URL $BACKEND_URL in Supabase"
HTTP_CODE=$(curl -sS -o /tmp/provision-upsert.json -w '%{http_code}' \
  "$SUPABASE_URL/rest/v1/user_backends?on_conflict=user_id" \
  -X POST \
  -H "apikey: $SUPABASE_SECRET_KEY" \
  -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"user_id\":\"$USER_ID\",\"backend_url\":\"$BACKEND_URL\",\"machine_id\":\"$APP\"}")
case "$HTTP_CODE" in
  2*) : ;;
  *) die "Supabase upsert failed (HTTP $HTTP_CODE): $(cat /tmp/provision-upsert.json)" ;;
esac

info "done. Backend: $BACKEND_URL"
info "health check: curl $BACKEND_URL/health"
