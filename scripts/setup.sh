#!/usr/bin/env bash
# One-shot dev setup: start the stack, apply migrations, bootstrap the admin
# user. Safe to re-run — skips migrations/user creation if already done.
#
# Usage: ./scripts/setup.sh   (run from the repo root)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.dev.yml"

echo "Starting containers..."
$COMPOSE up -d

echo "Waiting for backend..."
until curl -sf http://localhost:8000/api/health > /dev/null 2>&1; do
  sleep 1
done

echo "Applying migrations..."
$COMPOSE exec -T backend alembic upgrade head

echo "Bootstrapping admin user (admin / admin123)..."
if $COMPOSE exec -T backend python -m app.scripts.create_user admin admin123; then
  echo "Created admin user."
else
  echo "admin user already exists — skipping."
fi

echo
echo "Ready: http://localhost:5173  (login: admin / admin123)"
