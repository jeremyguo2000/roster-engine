# Values printed after `terraform apply` and readable any time with
# `terraform output`. These are the handles other tooling (the deploy script,
# the ECS task definitions) needs.

output "ecr_repository_urls" {
  description = "Full registry path per image, e.g. 1234.dkr.ecr.ap-southeast-1.amazonaws.com/roster-backend"
  value       = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "vpc_id" {
  description = "Handy for finding everything in the console: VPC -> Your VPCs -> Resource map."
  value       = aws_vpc.main.id
}

output "rds_endpoint" {
  description = "Postgres hostname. Reachable only from inside the VPC."
  value       = aws_db_instance.main.address
}

output "redis_endpoint" {
  description = "Redis hostname. Reachable only from inside the VPC."
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "region" {
  description = "Region every resource lives in; read by scripts/aws-deploy.sh."
  value       = var.region
}
