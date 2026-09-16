# Pins for Terraform itself and every provider this configuration uses.
# Providers are plugins Terraform downloads on `terraform init`; pinning the
# major version means a future `init` can't silently pull in breaking changes.
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
