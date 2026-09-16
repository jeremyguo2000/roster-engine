# Deploying roster-engine on AWS (ECS Fargate)

Companion to `DEPLOY.md` (Helm / PCAI). Everything AWS-side is Terraform under
`infra/aws/`, one file per phase; `scripts/aws-deploy.sh` builds and pushes
images. The full plan with reasoning lives in the "Roster Engine on AWS" page.

Prerequisites on the machine running this: `aws` CLI logged in to the target
account with a default region, `terraform` >= 1.5, `docker`.

## Phase 1 — images in ECR

Creates two private ECR repositories (`roster-backend`, `roster-frontend`) with
immutable tags and a lifecycle policy that keeps the 10 most recent images.

```bash
cd infra/aws
terraform init
terraform plan      # expect: 4 to add (2 repositories + 2 lifecycle policies)
terraform apply

cd ../..
scripts/aws-deploy.sh   # build both images, tag with git SHA, push
```

Verify:

```bash
aws ecr describe-images --repository-name roster-backend \
  --query 'imageDetails[].imageTags' --output text
```

Notes:
- The backend image is built from the **repo root** (it copies `documentation/`).
- Images are built for the architecture of the machine running the script.
  The ECS task definitions (phase 5) must declare the same one.

## Phase 2 — network

Creates the VPC (`10.0.0.0/16`), two public subnets across two availability
zones, an internet gateway with the default route, and the four security
groups every later phase attaches to. Nothing here has an hourly cost.

```bash
cd infra/aws
terraform plan      # expect: 19 to add
terraform apply
```

Security group intent, as a table (the rules in `02-network.tf` are the source
of truth):

| Group   | Allows in            | From    |
|---------|----------------------|---------|
| `alb`   | 80, 443              | anywhere |
| `app`   | 8080                 | `alb`   |
| `app`   | 8000                 | `app` (task-to-task over Service Connect) |
| `db`    | 5432                 | `app`   |
| `redis` | 6379                 | `app`   |

`alb` and `app` allow all outbound; `db` and `redis` allow none.

Verify: `terraform output vpc_id`, then in the console VPC → Your VPCs → that
VPC → **Resource map**. It should draw two subnets, one route table and one
internet gateway.
