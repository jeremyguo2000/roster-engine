#!/usr/bin/env bash
# Create the first two logins inside the running backend task, via ECS Exec.
# Run once after the first scripts/aws-up.sh (and again after any aws-down,
# since the database is recreated empty).
#
#   scripts/aws-bootstrap-users.sh '<admin password>'
#
# Creates:
#   admin    - your web UI login, with the password you pass
#   svc-mcp  - the MCP server's service account, with the password Terraform
#              generated in phase 4 (read back from SSM so they always match)
#
# Needs the session-manager-plugin installed next to the aws CLI.
set -euo pipefail

ADMIN_PW=${1:?usage: $0 '<admin password>'}
CLUSTER=roster

TASK=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name backend \
  --desired-status RUNNING --query 'taskArns[0]' --output text)
if [ -z "$TASK" ] || [ "$TASK" = "None" ]; then
  echo "no running backend task in cluster $CLUSTER — is the stack up?" >&2
  exit 1
fi

MCP_PW=$(aws ssm get-parameter --name /roster/ROSTER_SERVICE_PASSWORD \
  --with-decryption --query Parameter.Value --output text)

run_in_backend() {
  aws ecs execute-command --cluster "$CLUSTER" --task "$TASK" \
    --container backend --interactive --command "$1"
}

echo "==> creating admin"
run_in_backend "python -m app.scripts.create_user admin '$ADMIN_PW'"

echo "==> creating svc-mcp"
run_in_backend "python -m app.scripts.create_user svc-mcp '$MCP_PW'"
