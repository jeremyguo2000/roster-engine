#!/usr/bin/env bash
# Bring the AWS deployment up (or update it). Shows the plan and asks for a
# "yes" before touching anything. Idempotent: run it again and it changes
# only what differs.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/infra/aws"

terraform init -input=false >/dev/null
terraform apply
