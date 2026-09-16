#!/usr/bin/env bash
# Build both production images, tag them with the current git SHA, and push
# them to ECR. Run from anywhere inside the repo.
#
#   scripts/aws-deploy.sh            # build + push
#
# The tag is the short git SHA so every push is a new, immutable tag (the ECR
# repositories reject overwrites). Phase 7 extends this script to roll the ECS
# services onto the new tag via `terraform apply -var image_tag=...`.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

REGION=$(terraform -chdir=infra/aws output -raw region 2>/dev/null || echo ap-southeast-1)
TAG=$(git rev-parse --short HEAD)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

if [ -n "$(git status --porcelain -- backend frontend documentation)" ]; then
  echo "warning: uncommitted changes under backend/, frontend/ or documentation/" >&2
  echo "         the image will be tagged $TAG but won't match that commit" >&2
fi

echo "==> logging in to $REGISTRY"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

# --provenance=false --sbom=false: by default BuildKit pushes a manifest list
# plus two attestation manifests per image. ECR shows those as extra untagged
# "images", which is confusing and interacts badly with lifecycle rules. A
# plain single-manifest image is all ECS needs.
echo "==> building roster-backend:$TAG"
docker build --provenance=false --sbom=false \
  -f backend/Dockerfile -t "$REGISTRY/roster-backend:$TAG" .

echo "==> building roster-frontend:$TAG"
docker build --provenance=false --sbom=false \
  -t "$REGISTRY/roster-frontend:$TAG" ./frontend

echo "==> pushing"
docker push "$REGISTRY/roster-backend:$TAG"
docker push "$REGISTRY/roster-frontend:$TAG"

echo
echo "pushed tag: $TAG"
