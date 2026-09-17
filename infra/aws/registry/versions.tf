# The registry is its own Terraform root module with its own state, separate
# from the stack in the parent directory. Reason: the stack is created and
# destroyed between sessions, and images must survive that. Two lifecycles,
# two states. Nothing else lives here.
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "roster-engine"
      ManagedBy = "terraform"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-southeast-1"
}

output "repository_urls" {
  description = "Full registry path per image."
  value       = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}
