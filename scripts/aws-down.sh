#!/usr/bin/env bash
# Tear the AWS stack down so it stops costing money. Shows the list and asks
# for a "yes".
#
# Only infra/aws (the stack) is destroyed. The ECR repositories and images in
# infra/aws/registry have their own state and are left alone; storage for the
# images is a few cents a month. To delete those too, deliberately:
#   terraform -chdir=infra/aws/registry destroy
#
# The database is deleted with the stack (skip_final_snapshot in 03-data.tf),
# so any users or rosters created since the last up are gone. Run
# scripts/aws-up.sh to rebuild from nothing in about ten minutes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/infra/aws"

terraform destroy
