# Phase 5 — ECS Fargate: the application itself.
#
# Three ECS concepts, mapped to things already in this repo:
#
#   task definition  = a compose service: image, command, env, CPU/memory, logs
#   service          = "keep N copies of that task running, replace them when
#                      they die" — what a k8s Deployment does
#   cluster          = the namespace they live in; with Fargate there are no
#                      servers in it to manage
#
# Four task definitions and four services, one per compose service. Postgres
# and Redis are not here; they are the managed services from phase 3.
#
# Service Connect gives tasks the DNS names compose and the chart already
# use (backend:8000, mcp:8000), so the frontend image and its nginx config
# run unchanged. ECS does it by putting a small proxy sidecar into each task.
#
# Cost: the four tasks together are about $0.10/hour, the ALB about $0.025.

# ---------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------

locals {
  registry       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com"
  backend_image  = "${local.registry}/roster-backend:${var.image_tag}"
  frontend_image = "${local.registry}/roster-frontend:${var.image_tag}"

  subnet_ids = [for s in aws_subnet.public : s.id]

  # Environment for the backend and the worker: the chart's appEnv helper.
  # `secrets` entries are fetched from SSM by the execution role at task start
  # and injected as plain environment variables; the container never talks to
  # SSM itself.
  app_secrets = [
    for k in ["DATABASE_URL", "CELERY_RESULT_BACKEND", "REDIS_URL", "CELERY_BROKER_URL", "SECRET_KEY"] :
    { name = k, valueFrom = aws_ssm_parameter.app[k].arn }
  ]
  app_env = [
    { name = "ACCESS_TOKEN_EXPIRE_MINUTES", value = "1440" },
  ]

  # Chat assistant, backend only, and only when a key was supplied in phase 4.
  chat_env = var.anthropic_api_key == "" ? [] : [
    { name = "CHAT_PROVIDER", value = "anthropic" },
  ]
  chat_secrets = var.anthropic_api_key == "" ? [] : [
    { name = "ANTHROPIC_API_KEY", valueFrom = aws_ssm_parameter.anthropic_api_key[0].arn },
  ]

  services = toset(["backend", "worker", "mcp", "frontend"])

  # One CloudWatch log group per service; container stdout/stderr lands there.
  log_config = {
    for name in local.services : name => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[name].name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "ecs"
      }
    }
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each = local.services

  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = 14
}

# ---------------------------------------------------------------------------
# Task role: what code INSIDE the container may do with AWS. The app calls no
# AWS APIs, so the only grant is the channel ECS Exec uses to open a shell in
# a running task. Only the backend task wears this role; that is where the
# create_user bootstrap runs.
# ---------------------------------------------------------------------------

resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json

  tags = { Name = "${var.name}-task" }
}

data "aws_iam_policy_document" "task_ecs_exec" {
  statement {
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"] # ssmmessages has no resource-level scoping
  }
}

resource "aws_iam_role_policy" "task_ecs_exec" {
  name   = "ecs-exec"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_ecs_exec.json
}

# ---------------------------------------------------------------------------
# Cluster and the Service Connect namespace
# ---------------------------------------------------------------------------

resource "aws_service_discovery_http_namespace" "main" {
  name        = var.name
  description = "Service Connect namespace: tasks find each other as <service>:<port>"
}

resource "aws_ecs_cluster" "main" {
  name = var.name

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.main.arn
  }

  tags = { Name = var.name }
}

# ---------------------------------------------------------------------------
# Task definitions
#
# cpu/memory are Fargate "task sizes" in vCPU-thousandths and MiB; only
# certain pairs are allowed (256/512, 512/1024, 1024/2048, ...). The values
# here follow the plan's cost table. Bump the worker first if solves crawl:
# CP-SAT saturates whatever CPU it is given.
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = local.backend_image
      essential = true
      # Same as the chart: migrate, then serve. If Postgres is unreachable,
      # alembic fails, the task exits and ECS starts another — the logs say why.
      command = ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
      portMappings = [
        # `name` is what Service Connect refers to below.
        { name = "http", containerPort = 8000, protocol = "tcp", appProtocol = "http" },
      ]
      environment      = concat(local.app_env, local.chat_env)
      secrets          = concat(local.app_secrets, local.chat_secrets)
      logConfiguration = local.log_config["backend"]
    },
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = local.backend_image
      essential = true
      # One solver process per task. Scale solves by adding tasks (desired
      # count), not concurrency — matches the chart's worker.concurrency note.
      command          = ["celery", "-A", "app.worker.celery_app", "worker", "--loglevel=info", "--concurrency=1"]
      environment      = local.app_env
      secrets          = local.app_secrets
      logConfiguration = local.log_config["worker"]
    },
  ])
}

resource "aws_ecs_task_definition" "mcp" {
  family                   = "${var.name}-mcp"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "mcp"
      image     = local.backend_image
      essential = true
      command   = ["python", "-m", "app.mcp_server"]
      portMappings = [
        { name = "http", containerPort = 8000, protocol = "tcp", appProtocol = "http" },
      ]
      environment = [
        # `backend` resolves via Service Connect, exactly as in compose.
        { name = "ROSTER_API_URL", value = "http://backend:8000" },
        { name = "ROSTER_SERVICE_USERNAME", value = "svc-mcp" },
      ]
      secrets = [
        { name = "ROSTER_SERVICE_PASSWORD", valueFrom = aws_ssm_parameter.app["ROSTER_SERVICE_PASSWORD"].arn },
      ]
      logConfiguration = local.log_config["mcp"]
    },
  ])
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.cpu_architecture
  }

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = local.frontend_image
      essential = true
      # Image default command: nginx-unprivileged on 8080.
      portMappings = [
        { name = "http", containerPort = 8080, protocol = "tcp", appProtocol = "http" },
      ]
      environment = [
        # Substituted into nginx.conf.template at container start. nginx
        # resolves these hostnames when it loads the config and refuses to
        # start if they don't resolve — Service Connect makes sure they do.
        { name = "BACKEND_URL", value = "http://backend:8000" },
        { name = "MCP_URL", value = "http://mcp:8000" },
      ]
      logConfiguration = local.log_config["frontend"]
    },
  ])
}

# ---------------------------------------------------------------------------
# Load balancer: the internet's only way in, and it only knows the frontend.
# nginx in the frontend task proxies /api, /documentation and /mcp onward.
# ---------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = "${var.name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.subnet_ids # two AZs, hence two subnets

  tags = { Name = "${var.name}-alb" }
}

resource "aws_lb_target_group" "frontend" {
  name        = "${var.name}-frontend"
  port        = 8080
  protocol    = "HTTP"
  target_type = "ip" # Fargate tasks are registered by IP, there are no instances
  vpc_id      = aws_vpc.main.id

  # How long a task keeps receiving traffic after ECS decides to stop it.
  # Default is 300s, which makes every frontend redeploy take five minutes.
  deregistration_delay = 10

  health_check {
    path                = "/" # index.html; nginx alone, not the backend behind it
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { Name = "${var.name}-frontend" }
}

# Plain HTTP for now. Phase 6 adds the 443 listener and turns this one into a
# redirect.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# ---------------------------------------------------------------------------
# Services
#
# Service Connect ordering matters: a task's proxy learns the names that
# exist in the namespace when the task STARTS. So providers (backend, mcp)
# must be running before their clients (mcp -> backend, frontend -> both)
# start. The depends_on lines below encode that; without them the frontend's
# nginx can come up first, fail to resolve `backend`, and crash-loop.
# ---------------------------------------------------------------------------

resource "aws_ecs_service" "backend" {
  name            = "backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  # Recreate semantics: stop the old task before starting the new one, so two
  # backends never run `alembic upgrade head` at the same time. Costs ~30s of
  # API downtime per deploy.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # Allows `aws ecs execute-command` into this task (the create_user bootstrap).
  enable_execute_command = true

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # no NAT gateway: this is how the task reaches ECR and SSM
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    # This service PROVIDES the name `backend` on port 8000.
    service {
      port_name      = "http"
      discovery_name = "backend"
      client_alias {
        port     = 8000
        dns_name = "backend"
      }
    }
  }
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  # Same 0/100 as the backend, purely to avoid paying for two workers during
  # a deploy. Nothing breaks if two run.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  # No Service Connect: the worker only talks to Postgres and Redis.
}

resource "aws_ecs_service" "mcp" {
  name            = "mcp"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.mcp.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  # Provides `mcp:8000`; is also a client of `backend`.
  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn

    service {
      port_name      = "http"
      discovery_name = "mcp"
      client_alias {
        port     = 8000
        dns_name = "mcp"
      }
    }
  }

  depends_on = [aws_ecs_service.backend]
}

resource "aws_ecs_service" "frontend" {
  name            = "frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  network_configuration {
    subnets          = local.subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 8080
  }

  # Client only: no `service` block, so it provides no name, but its proxy
  # can resolve `backend` and `mcp`.
  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
  }

  depends_on = [
    aws_lb_listener.http, # ECS refuses to register targets before a listener exists
    aws_ecs_service.backend,
    aws_ecs_service.mcp,
  ]
}
