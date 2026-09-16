#!/usr/bin/env bash
# Tear the AWS deployment down so it stops costing money. Removes everything
# Terraform created except the ECR images. Shows the list and asks for a "yes".
#
# The database is deleted with it (skip_final_snapshot in 03-data.tf), so any
# users or rosters created since the last up are gone. Run scripts/aws-up.sh
# to rebuild from nothing in about ten minutes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/infra/aws"

terraform destroy
