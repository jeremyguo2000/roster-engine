# Phase 3 — Postgres and Redis.
#
# Both are managed services: AWS runs the process, patches it, and (for RDS)
# takes backups. You get an endpoint hostname and nothing else. Neither has a
# public IP; the only route in is from a task wearing the app security group.
#
# This is the first file with an hourly cost. Roughly $0.035/hour for the pair
# while they exist. `terraform destroy` removes both.

# ---------------------------------------------------------------------------
# Database password
#
# Generated once, kept stable across applies, and written by phase 4 into the
# DATABASE_URL parameter. No special characters: the password is embedded in a
# URL and psycopg would need it percent-encoded otherwise. 32 alphanumerics is
# ~190 bits of entropy, more than enough.
# ---------------------------------------------------------------------------

resource "random_password" "db" {
  length  = 32
  special = false
}

# ---------------------------------------------------------------------------
# RDS Postgres
# ---------------------------------------------------------------------------

# Which subnets RDS may place the instance in. Must span two AZs even for a
# single-AZ instance; AWS wants the option to fail over on hardware failure.
resource "aws_db_subnet_group" "main" {
  name       = "${var.name}-db"
  subnet_ids = [for s in aws_subnet.public : s.id]

  tags = { Name = "${var.name}-db" }
}

resource "aws_db_instance" "main" {
  identifier = "${var.name}-db"

  engine = "postgres"
  # Major version only: AWS picks the newest 16.x and auto-applies minor
  # patches in the maintenance window. Matches the postgres:16 image in
  # docker-compose.dev.yml and the chart.
  engine_version             = "16"
  auto_minor_version_upgrade = true

  instance_class    = "db.t4g.micro" # 2 vCPU burstable, 1 GB. Free tier for 12 months.
  allocated_storage = 20             # GB. Free-tier maximum; gp3 minimum.
  storage_type      = "gp3"
  storage_encrypted = true

  # Same names the chart defaults to, so DATABASE_URL differs only by host.
  db_name  = "roster_engine"
  username = "roster"
  password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 7 # days of automated daily snapshots

  # Learning-deployment settings. `terraform destroy` would otherwise stop and
  # demand a final snapshot name (skip_final_snapshot) or refuse outright
  # (deletion_protection). Flip both the day this holds real roster data.
  skip_final_snapshot = true
  deletion_protection = false

  # Push config changes now rather than waiting for the maintenance window.
  apply_immediately = true

  tags = { Name = "${var.name}-db" }
}

# ---------------------------------------------------------------------------
# ElastiCache Redis
#
# It is the Celery broker and nothing else; the result backend is Postgres.
# One node, no replica, no persistence. If it restarts, in-flight solves are
# lost and the roster row stays `running` until the worker reports back —
# acceptable for now, revisit before anyone depends on it.
# ---------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.name}-redis"
  subnet_ids = [for s in aws_subnet.public : s.id]

  tags = { Name = "${var.name}-redis" }
}

resource "aws_elasticache_cluster" "main" {
  cluster_id = "${var.name}-redis"

  engine          = "redis"
  engine_version  = "7.1"
  node_type       = "cache.t4g.micro" # 0.5 GB. Plenty for a task queue.
  num_cache_nodes = 1
  port            = 6379

  # AWS-maintained defaults for Redis 7. A custom group is only needed to
  # change Redis config such as maxmemory-policy.
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  apply_immediately = true

  tags = { Name = "${var.name}-redis" }
}
