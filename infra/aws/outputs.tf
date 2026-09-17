# Values printed after `terraform apply` and readable any time with
# `terraform output`. These are the handles other tooling (the deploy script,
# the ECS task definitions) needs.

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

output "app_url" {
  description = "Where the app is. Plain HTTP until phase 6."
  value       = "http://${aws_lb.main.dns_name}"
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}
