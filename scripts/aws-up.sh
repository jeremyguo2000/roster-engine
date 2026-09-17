#!/usr/bin/env bash
# Bring the AWS deployment up (or update it), then make it usable.
#
#   1. infra/aws/registry  - ECR repositories. Free, idempotent, no prompt.
#   2. infra/aws           - the stack. Shows the plan and asks for "yes".
#   3. create the admin and svc-mcp logins in the backend (ECS Exec)
#   4. load the demo ward catalogue if the database is empty
#      (skip with ROSTER_SEED_DEMO=0)
#
# Steps 3 and 4 are no-ops on a database that already has them, so this is
# safe to run for every deploy, not just the first.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT/infra/aws"

echo "==> registry"
terraform -chdir=registry init -input=false >/dev/null
terraform -chdir=registry apply -input=false -auto-approve

echo "==> stack"
terraform init -input=false >/dev/null
terraform apply

APP_URL=$(terraform output -raw app_url)

"$ROOT/scripts/aws-bootstrap-users.sh"

# The ALB's DNS name can take a minute to resolve after creation.
echo "==> waiting for $APP_URL/api/health"
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$APP_URL/api/health" 2>/dev/null && break
  sleep 5
done
curl -fsS -o /dev/null "$APP_URL/api/health"

ADMIN_PASSWORD=$(aws ssm get-parameter --name /roster/ADMIN_PASSWORD \
  --with-decryption --query Parameter.Value --output text)

if [ "${ROSTER_SEED_DEMO:-1}" != "0" ]; then
  echo "==> demo data"
  ROSTER_API_URL="$APP_URL/api" ROSTER_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 "$ROOT/scripts/seed_demo_ward.py"
fi

echo
echo "app:            $APP_URL"
echo "login:          admin"
echo "admin password: $ADMIN_PASSWORD"
