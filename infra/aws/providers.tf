# How Terraform talks to AWS. Credentials are NOT here: the provider reads them
# the same way the AWS CLI does (~/.aws/credentials, env vars, or SSO), so this
# file is safe to commit.
provider "aws" {
  region = var.region

  # Applied to every taggable resource this configuration creates. Two reasons:
  # the billing console can then filter cost by Project, and anyone looking at
  # a resource in the console can tell it belongs to Terraform and shouldn't be
  # edited by hand.
  default_tags {
    tags = {
      Project   = "roster-engine"
      ManagedBy = "terraform"
    }
  }
}
