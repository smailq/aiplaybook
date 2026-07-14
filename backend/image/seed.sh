#!/bin/sh
# First-boot seed for a user's Hermes volume.
#
# Installs the vertical's persona (SOUL.md), knowledge, and the starter book
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

# Operating instructions -> AGENTS.md (auto-injected every message): how to read
# and edit the book on the volume, and how to validate it.
if [ -f "$SEED/AGENTS.md" ] && [ ! -f "$DATA/AGENTS.md" ]; then
    cp "$SEED/AGENTS.md" "$DATA/AGENTS.md"
    echo "[seed] installed AGENTS.md"
fi

# Reference knowledge the agent can read and curate into memory.
if [ -d "$SEED/knowledge" ] && [ ! -d "$DATA/knowledge" ]; then
    cp -r "$SEED/knowledge" "$DATA/knowledge"
    echo "[seed] installed knowledge/"
fi

# The starter book (metadata.json + chapters/sections) served by GET /book.
if [ -d "$SEED/book" ] && [ ! -d "$DATA/book" ]; then
    cp -r "$SEED/book" "$DATA/book"
    echo "[seed] installed book/"
fi

# The vertical's Hermes skills (repeatable routines the agent can invoke).
if [ -d "$SEED/skills" ] && [ ! -d "$DATA/skills" ]; then
    cp -r "$SEED/skills" "$DATA/skills"
    echo "[seed] installed skills/"
fi
