# Phase 2 — network.
#
# One VPC with two public subnets, an internet gateway, and the four security
# groups every later phase attaches to. Nothing in this file has an hourly
# price; AWS charges for NAT gateways and traffic, and this design uses neither.
#
# "Public subnet" is not a property of a subnet. It means only that the
# subnet's route table sends 0.0.0.0/0 to an internet gateway. Both subnets
# here are public because the ECS tasks need outbound internet (to pull images
# from ECR and, if chat is enabled, to reach the Anthropic API) and a NAT
# gateway would cost more than the rest of the network put together.
# Inbound protection is entirely the job of the security groups below.

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  # Both are needed for RDS and ElastiCache endpoint hostnames to resolve
  # from inside the VPC. They default to off for a VPC created by Terraform.
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.name}-vpc" }
}

# ---------------------------------------------------------------------------
# Subnets — one per availability zone. An ALB refuses to be created in fewer
# than two AZs, and an RDS subnet group has the same rule, so two is the
# minimum, not a choice.
# ---------------------------------------------------------------------------

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Two /24s out of the /16. Plenty for a handful of tasks and two databases.
  public_subnets = {
    a = { cidr = "10.0.1.0/24", az = data.aws_availability_zones.available.names[0] }
    b = { cidr = "10.0.2.0/24", az = data.aws_availability_zones.available.names[1] }
  }
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az

  # Anything launched here gets a public IP unless it opts out. Fargate tasks
  # also set this per-service, but marking the subnet keeps the intent visible
  # in the console.
  map_public_ip_on_launch = true

  tags = { Name = "${var.name}-public-${each.key}" }
}

# ---------------------------------------------------------------------------
# Internet gateway + the route that makes the subnets public
# ---------------------------------------------------------------------------

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.name}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.name}-public" }
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# ---------------------------------------------------------------------------
# Security groups
#
# A security group is a stateful firewall attached to a thing (a task, a
# database, a load balancer). The rule that matters: a source can be another
# security group instead of an IP range. "Postgres accepts 5432 from anything
# wearing the app group" stays true no matter how many tasks come and go or
# what IPs they get.
#
# Rules are separate resources rather than inline blocks. Inline rules make
# Terraform replace the whole rule set whenever one changes; separate
# resources change one rule at a time and can reference each other without
# creating a dependency cycle (app -> app below needs that).
#
# A group created this way has NO rules at all until one is attached, so the
# db and redis groups genuinely allow nothing outbound. They never initiate
# connections, so nothing is lost.
# ---------------------------------------------------------------------------

# --- alb: the only thing the internet talks to ---------------------------

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Load balancer: HTTP/HTTPS from anywhere"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from anywhere (redirected to HTTPS in phase 6)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from anywhere"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Forward to tasks and run health checks"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- app: all four ECS tasks wear this one -------------------------------

resource "aws_security_group" "app" {
  name        = "${var.name}-app"
  description = "ECS tasks: 8080 from the ALB, 8000 between tasks"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "nginx in the frontend task, from the ALB only"
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_app" {
  security_group_id            = aws_security_group.app.id
  description                  = "backend and mcp on 8000, from other tasks only (Service Connect)"
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "Pull images, reach Postgres/Redis, optional Anthropic API"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# --- db: RDS Postgres -----------------------------------------------------

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "RDS Postgres: 5432 from app tasks only"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres from app tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

# --- redis: ElastiCache ----------------------------------------------------

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "ElastiCache Redis: 6379 from app tasks only"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.name}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_app" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from app tasks"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.app.id
}
