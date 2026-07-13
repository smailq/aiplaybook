#!/bin/sh
# First-boot seed for a user's Hermes volume.
#
# Installs the vertical's persona (SOUL.md), knowledge, and the starter playbook
# into /opt/data if - and only if - they are not already present. It is
# idempotent and never overwrites, so a user's edits and the agent's curated
# memory survive every redeploy. Runs as the hermes user (invoked via
# s6-setuidgid from the gateway run script) so seeded files are owned correctly.
set -eu

SEED="${PLAYBOOK_SEED_DIR:-/opt/playbook-seed}"
DATA="${HERMES_HOME:-/opt/data}"

[ -d "$SEED" ] || exit 0

# Persona -> SOUL.md (injected into the system prompt every message).
if [ -f "$SEED/SOUL.md" ] && [ ! -f "$DATA/SOUL.md" ]; then
    cp "$SEED/SOUL.md" "$DATA/SOUL.md"
    echo "[seed] installed SOUL.md"
fi

# Reference knowledge the agent can read and curate into memory.
if [ -d "$SEED/knowledge" ] && [ ! -d "$DATA/knowledge" ]; then
    cp -r "$SEED/knowledge" "$DATA/knowledge"
    echo "[seed] installed knowledge/"
fi

# The starter playbook served by GET /playbook.
if [ -d "$SEED/awareness3" ] && [ ! -d "$DATA/awareness3" ]; then
    cp -r "$SEED/awareness3" "$DATA/awareness3"
    echo "[seed] installed awareness3/ playbook"
fi
