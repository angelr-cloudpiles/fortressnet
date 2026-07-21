output "cloudfront_distribution_id" {
  description = "Tenant CloudFront distribution ID."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "Tenant CNAME target."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "waf_web_acl_arn" {
  description = "Tenant WAF Web ACL ARN."
  value       = aws_wafv2_web_acl.this.arn
}

output "certificate_arn" {
  description = "Tenant ACM certificate ARN."
  value       = local.certificate_arn
}
