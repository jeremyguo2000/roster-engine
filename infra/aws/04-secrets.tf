# Phase 4 — secrets, and the identity ECS uses to read them.
#
# Every line of the developer .env becomes a SecureString parameter under
# /roster/ in SSM Parameter Store. In phase 5 the task definitions list these
# parameters under `secrets`, and ECS injects each one as an environment
# variable at task start, so app/config.py does not change.
#
# Parameter Store SecureStrings cost nothing. The composite URLs are stored
# whole because ECS can only inject a parameter as a single value.

# ---------------------------------------------------------------------------
# Generated secrets. Like the DB password in 03-data.tf: created once, stable
# across applies, living only in Terraform state.
# ---------------------------------------------------------------------------

# JWT signing key. The chart asks for `openssl rand -hex 32` (64 hex chars);
# 64 alphanumerics is the same length with more entropy.
resource "random_password" "secret_key" {
  length  = 64
  special = false
}

# Password for the svc-mcp login the MCP server uses. The user itself is
# created in phase 5 with this exact value.
resource "random_password" "mcp_service" {
  length  = 32
  special = false
}

# First web-UI login. Same idea as the chart's auth.initialAdmin: generated
# here, stored in SSM, and scripts/aws-up.sh creates the user with it after
# every apply (the database is empty after each aws-down.sh). Read it back:
#   aws ssm get-parameter --name /roster/ADMIN_PASSWORD --with-decryption \
#     --query Parameter.Value --output text
resource "random_password" "admin" {
  length  = 20
  special = false
}

# ---------------------------------------------------------------------------
# Optional: Claude API key for the in-app chat assistant. Left empty, no
# parameter is created and phase 5 leaves chat disabled (the UI hides it).
# Pass with:  terraform apply -var anthropic_api_key=sk-ant-...
# or via a gitignored terraform.tfvars file.
# ---------------------------------------------------------------------------

variable "anthropic_api_key" {
  description = "Claude API key for the chat assistant. Empty disables chat."
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# The parameters
# ---------------------------------------------------------------------------

locals {
  db_host    = aws_db_instance.main.address
  redis_host = aws_elasticache_cluster.main.cache_nodes[0].address

  # Same shape as docker-compose.dev.yml and the chart's appEnv helper, with
  # the managed endpoints in place of the service names.
  database_url = "postgresql+psycopg://${aws_db_instance.main.username}:${random_password.db.result}@${local.db_host}:5432/${aws_db_instance.main.db_name}"
  redis_url    = "redis://${local.redis_host}:6379/0"

  parameters = {
    DATABASE_URL            = local.database_url
    CELERY_RESULT_BACKEND   = "db+${local.database_url}"
    REDIS_URL               = local.redis_url
    CELERY_BROKER_URL       = local.redis_url
    SECRET_KEY              = random_password.secret_key.result
    ROSTER_SERVICE_PASSWORD = random_password.mcp_service.result
    ADMIN_PASSWORD          = random_password.admin.result
  }
}

# for_each needs a value Terraform can see is not sensitive. The map above is
# tainted by the passwords in it, so the keys are listed again here as a
# plain literal and the value is looked up per key.
resource "aws_ssm_parameter" "app" {
  for_each = toset([
    "DATABASE_URL",
    "CELERY_RESULT_BACKEND",
    "REDIS_URL",
    "CELERY_BROKER_URL",
    "SECRET_KEY",
    "ROSTER_SERVICE_PASSWORD",
    "ADMIN_PASSWORD",
  ])

  name  = "/${var.name}/${each.key}"
  type  = "SecureString"
  value = local.parameters[each.key]

  tags = { Name = "/${var.name}/${each.key}" }
}

resource "aws_ssm_parameter" "anthropic_api_key" {
  count = var.anthropic_api_key == "" ? 0 : 1

  name  = "/${var.name}/ANTHROPIC_API_KEY"
  type  = "SecureString"
  value = var.anthropic_api_key

  tags = { Name = "/${var.name}/ANTHROPIC_API_KEY" }
}

# ---------------------------------------------------------------------------
# Task execution role
#
# ECS runs every task under two IAM roles. This one is the EXECUTION role: it
# is what the ECS agent itself uses, before the container starts, to pull the
# image from ECR, write logs to CloudWatch, and fetch the parameters above.
# Code inside the container never sees these credentials.
#
# The other one, the TASK role, is what the application code would use to
# call AWS APIs. Ours doesn't, so that role is nearly empty; it is defined in
# phase 5 because its only job is enabling ECS Exec.
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Who may wear this role: only the ECS tasks service.
data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${var.name}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = { Name = "${var.name}-task-execution" }
}

# AWS-managed policy: pull from ECR, write to CloudWatch Logs. Nothing about
# SSM, which is why the inline policy below exists.
resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The one hand-written IAM statement in this deployment: one action, one
# resource prefix. Parameters outside /roster/ stay invisible to the tasks.
# SecureStrings under the default AWS-managed KMS key need no kms:Decrypt.
data "aws_iam_policy_document" "task_execution_ssm" {
  statement {
    actions   = ["ssm:GetParameters"]
    resources = ["arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter/${var.name}/*"]
  }
}

resource "aws_iam_role_policy" "task_execution_ssm" {
  name   = "read-roster-parameters"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_ssm.json
}
