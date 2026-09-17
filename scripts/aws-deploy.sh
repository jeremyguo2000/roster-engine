#!/usr/bin/env bash
# Build both production images, tag them with the current git SHA, and push
# them to ECR. Run from anywhere inside the repo.
#
#   scripts/aws-deploy.sh            # build + push
#
# The tag is the short git SHA so every push is a new, immutable tag (the ECR
# repositories reject overwrites). The tag is recorded in
# infra/aws/image.auto.tfvars; scripts/aws-up.sh then rolls the ECS services.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Region comes from the CLI config (or AWS_REGION), not from Terraform state:
# the stack may be torn down, and the registry must be reachable regardless.
REGION=${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}
REGION=${REGION:-ap-southeast-1}
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

# Record the tag for Terraform. image.auto.tfvars is loaded automatically by
# every terraform command in infra/aws and is gitignored (*.tfvars).
cat > infra/aws/image.auto.tfvars <<EOT
# Written by scripts/aws-deploy.sh after each push. Gitignored (*.tfvars).
image_tag = "$TAG"
EOT

echo
echo "pushed tag: $TAG"
echo "next: scripts/aws-up.sh   # rolls the ECS services onto this tag"
