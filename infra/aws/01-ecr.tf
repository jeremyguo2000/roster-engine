# Phase 1 — container registry.
#
# One private ECR repository per image. The backend image is shared by the
# API, the celery worker and the MCP server (they differ only by command), so
# there are two repositories, not four.

locals {
  images = toset(["roster-backend", "roster-frontend"])
}

resource "aws_ecr_repository" "app" {
  for_each = local.images

  name = each.key

  # A tag, once pushed, can never be overwritten. This is what makes "the image
  # tag is the deploy unit" true: a service running :abc1234 is running exactly
  # the bytes that were tested as :abc1234. Push a new tag for a new build.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    # Basic CVE scan on every push. Free.
    scan_on_push = true
  }

  # Lets `terraform destroy` remove a repository that still holds images.
  # Without this, destroy fails until you empty the repository by hand.
  # Acceptable for a deployment you expect to tear down and rebuild.
  force_delete = true
}

# ECR charges per GB stored. The backend image is several hundred MB (Python +
# OR-Tools), so without a lifecycle policy every push accumulates forever.
# Two rules, evaluated in priority order:
#   1. Untagged images (the leftover layers when a tag is moved or an image is
#      replaced) expire after a day.
#   2. Only the 10 most recent tagged images are kept.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each = aws_ecr_repository.app

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the 10 most recent tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
    ]
  })
}
