# Inputs. Anything that might reasonably differ between two deployments of this
# same configuration is a variable; everything else is hard-coded in the
# resource that uses it.

variable "region" {
  description = "AWS region for every resource. Singapore, to be near the users."
  type        = string
  default     = "ap-southeast-1"
}

variable "name" {
  description = "Prefix for resource names so they group together in the console."
  type        = string
  default     = "roster"
}

variable "image_tag" {
  description = "Tag of the roster-backend / roster-frontend images to run. scripts/aws-deploy.sh records the last pushed tag in image.auto.tfvars."
  type        = string
  default     = ""

  validation {
    condition     = length(var.image_tag) > 0
    error_message = "image_tag is empty. Run scripts/aws-deploy.sh to build, push and record a tag."
  }
}

variable "cpu_architecture" {
  description = "Must match the machine that built the images: X86_64 or ARM64 (uname -m: x86_64 or aarch64)."
  type        = string
  default     = "X86_64"

  validation {
    condition     = contains(["X86_64", "ARM64"], var.cpu_architecture)
    error_message = "cpu_architecture must be X86_64 or ARM64."
  }
}
