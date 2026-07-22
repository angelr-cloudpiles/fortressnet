resource "aws_ecr_repository" "control_plane" {
  name                 = "${var.project}/control-plane"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = module.data_plane.kms_key_arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "control_plane" {
  repository = aws_ecr_repository.control_plane.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep the last 20 control plane images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
