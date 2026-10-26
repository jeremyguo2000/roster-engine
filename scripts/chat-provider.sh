#!/usr/bin/env bash
# Switch the chat assistant between the AgentOps platform (the default) and the
# direct, break-glass providers, then recreate only the backend so the change
# takes effect.
#
#   scripts/chat-provider.sh agentops    # governed by AgentOps (default)
#   scripts/chat-provider.sh anthropic   # BREAK-GLASS: direct to Claude, ungoverned
#   scripts/chat-provider.sh openai      # BREAK-GLASS: direct to an OpenAI-compatible endpoint
#   scripts/chat-provider.sh             # show the current setting
#
# A direct provider is refused by the backend unless CHAT_DIRECT_ENABLED=true;
# this script sets that flag together with CHAT_PROVIDER and clears it again
# when switching back, so the break-glass state is never left on by accident.
#
# Uses docker-compose.shared-host.yml when present (host running AgentOps too).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env
[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE — copy .env.example first" >&2; exit 1; }

current() { grep -E "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }
set_var() {
  if grep -qE "^$1=" "$ENV_FILE"; then
    sed -i -E "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

if [ $# -eq 0 ]; then
  echo "CHAT_PROVIDER=${CHAT_PROVIDER:-$(current CHAT_PROVIDER)}"
  echo "CHAT_DIRECT_ENABLED=$(current CHAT_DIRECT_ENABLED)"
  exit 0
fi

want="$1"
case "$want" in
  anthropic|openai|agentops) ;;
  *) echo "usage: $0 [anthropic|openai|agentops]" >&2; exit 2 ;;
esac

set_var CHAT_PROVIDER "$want"
if [ "$want" = agentops ]; then
  set_var CHAT_DIRECT_ENABLED false
else
  set_var CHAT_DIRECT_ENABLED true
  echo "WARNING: break-glass mode. Chat requests will go directly to the model provider," >&2
  echo "         bypassing AgentOps guardrails, audit and cost tracking." >&2
  echo "         Run 'scripts/chat-provider.sh agentops' to restore the governed path." >&2
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
echo "CHAT_PROVIDER=$want CHAT_DIRECT_ENABLED=$(current CHAT_DIRECT_ENABLED) (backend recreated on port ${port:-8000})"
