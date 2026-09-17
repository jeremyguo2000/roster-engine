#!/usr/bin/env bash
# Bring the AWS deployment up (or update it).
#
# Two Terraform roots, applied in order:
#   infra/aws/registry  - the ECR repositories. Free, idempotent, applied
#                         without a prompt. Survives aws-down.sh.
#   infra/aws           - everything else. Shows the plan and asks for "yes".
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/infra/aws"

echo "==> registry"
terraform -chdir=registry init -input=false >/dev/null
terraform -chdir=registry apply -input=false -auto-approve

echo "==> stack"
terraform init -input=false >/dev/null
terraform apply
