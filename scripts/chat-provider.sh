#!/usr/bin/env bash
# Switch the chat assistant between the direct providers and the AgentOps
# platform, then recreate only the backend so the change takes effect.
#
#   scripts/chat-provider.sh agentops    # governed by AgentOps
#   scripts/chat-provider.sh anthropic   # direct to Claude (default)
#   scripts/chat-provider.sh openai      # direct to an OpenAI-compatible endpoint
#   scripts/chat-provider.sh             # show the current setting
#
# Uses docker-compose.shared-host.yml when present (host running AgentOps too).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE — copy .env.example first" >&2; exit 1; }

current() { grep -E '^CHAT_PROVIDER=' "$ENV_FILE" | cut -d= -f2- || true; }

if [ $# -eq 0 ]; then
  echo "CHAT_PROVIDER=$(current)"
  exit 0
fi

want="$1"
case "$want" in
  anthropic|openai|agentops) ;;
  *) echo "usage: $0 [anthropic|openai|agentops]" >&2; exit 2 ;;
esac

if grep -qE '^CHAT_PROVIDER=' "$ENV_FILE"; then
  sed -i -E "s|^CHAT_PROVIDER=.*|CHAT_PROVIDER=$want|" "$ENV_FILE"
else
  printf '\nCHAT_PROVIDER=%s\n' "$want" >> "$ENV_FILE"
fi

FILES=(-f docker-compose.dev.yml)
[ -f docker-compose.shared-host.yml ] && FILES+=(-f docker-compose.shared-host.yml)

# `restart` does not re-read .env; `up -d` recreates the container with the new env.
docker compose "${FILES[@]}" up -d backend >/dev/null 2>&1

port=$(docker compose "${FILES[@]}" port backend 8000 2>/dev/null | sed 's/.*://')
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${port:-8000}/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
echo "CHAT_PROVIDER=$want (backend recreated on port ${port:-8000})"
