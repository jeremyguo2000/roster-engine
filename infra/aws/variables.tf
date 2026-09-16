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
