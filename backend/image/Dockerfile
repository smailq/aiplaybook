# Per-user AI Playbook backend image.
#
# Extends the published Hermes agent image (do NOT fork it) and adds our auth
# gateway as an s6-overlay longrun service, so Hermes's own init - uid remap,
# volume chown, config seeding - stays untouched. The gateway is the only
# public process; Hermes stays on loopback.
#
# Build context is the REPO ROOT (so Fly's builder and local builds match):
#   docker build -f backend/image/Dockerfile -t <registry>/hermes-playbook .

# ---- stage 1: compile the gateway (TypeScript -> JS) ------------------------
FROM node:22-slim AS gateway-build
WORKDIR /build
COPY backend/gateway/package.json backend/gateway/package-lock.json ./
RUN npm ci
COPY backend/gateway/tsconfig.json ./
COPY backend/gateway/src ./src
RUN npm run build

# ---- stage 2: the runtime image ---------------------------------------------
FROM nousresearch/hermes-agent:latest

# Install only the gateway's production deps, using the base image's own Node
# (v22, Debian trixie) so the runtime matches exactly.
COPY backend/gateway/package.json backend/gateway/package-lock.json /opt/gateway/
RUN cd /opt/gateway && npm ci --omit=dev && npm cache clean --force
COPY --from=gateway-build /build/dist /opt/gateway/dist

# Bake the vertical seed: persona -> SOUL.md, product brief -> knowledge, and
# the starter playbook. The gateway self-seeds these into the volume on first
# boot (see backend/image/seed.sh), never overwriting existing files.
COPY docs/hermes-marketing-agent-prompt.md /opt/playbook-seed/SOUL.md
COPY docs/awareness3-product-brief.md /opt/playbook-seed/knowledge/awareness3-product-brief.md
COPY infra/seed/playbook /opt/playbook-seed/awareness3
COPY backend/image/seed.sh /opt/gateway/seed.sh

# Register the gateway as an s6 longrun service in the existing "user" bundle.
COPY backend/image/s6/gateway /etc/s6-overlay/s6-rc.d/gateway
RUN chmod +x /etc/s6-overlay/s6-rc.d/gateway/run /opt/gateway/seed.sh \
 && touch /etc/s6-overlay/s6-rc.d/user/contents.d/gateway

# Default location of the hermes CLI (see main-wrapper.sh); overridable via env.
ENV HERMES_BIN=hermes

EXPOSE 8787
