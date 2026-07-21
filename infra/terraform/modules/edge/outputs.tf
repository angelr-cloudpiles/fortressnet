output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID."
  value       = aws_cloudfront_distribution.this.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN."
  value       = aws_wafv2_web_acl.this.arn
}

output "waf_web_acl_name" {
  description = "WAF Web ACL name."
  value       = aws_wafv2_web_acl.this.name
}

output "certificate_arn" {
  description = "ACM certificate ARN."
  value       = aws_acm_certificate.this.arn
}
