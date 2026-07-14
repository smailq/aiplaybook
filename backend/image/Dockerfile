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

# Bake the vertical bundle's seed: persona -> SOUL.md, operating instructions ->
# AGENTS.md, product brief -> knowledge, the starter book, and the vertical's
# Hermes skills. The gateway self-seeds these into the volume on first boot (see
# backend/image/seed.sh), never overwriting existing files. Source of truth is the
# vertical bundle (see verticals/saas-marketing/README.md).
COPY verticals/saas-marketing/seed/SOUL.md /opt/playbook-seed/SOUL.md
COPY verticals/saas-marketing/seed/AGENTS.md /opt/playbook-seed/AGENTS.md
COPY verticals/saas-marketing/seed/knowledge /opt/playbook-seed/knowledge
COPY verticals/saas-marketing/seed/book /opt/playbook-seed/book
COPY verticals/saas-marketing/skills /opt/playbook-seed/skills
COPY backend/image/seed.sh /opt/gateway/seed.sh

# Register the gateway as an s6 longrun service in the existing "user" bundle.
COPY backend/image/s6/gateway /etc/s6-overlay/s6-rc.d/gateway
RUN chmod +x /etc/s6-overlay/s6-rc.d/gateway/run /opt/gateway/seed.sh \
 && touch /etc/s6-overlay/s6-rc.d/user/contents.d/gateway

# Default location of the hermes CLI (see main-wrapper.sh); overridable via env.
ENV HERMES_BIN=hermes

EXPOSE 8787

# The container's main program: keep the machine alive while the gateway runs as
# a supervised s6 sidecar. The image ENTRYPOINT (inherited from the base image,
# `/init ...`) is s6-overlay, which requires PID 1. On Fly, PID 1 belongs to
# Fly's machine init, so this image must be deployed as a *container* of a
# multi-container machine (infra/machine_config.json) to get its own PID
# namespace - then /init is PID 1 there. See infra/fly.toml.
CMD ["sleep", "infinity"]
