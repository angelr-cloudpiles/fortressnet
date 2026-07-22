resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = var.platform_kms_key_arn
}

resource "aws_sns_topic_subscription" "email" {
  count = var.alarm_email == "" ? 0 : 1

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.name}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  alarm_description   = "Control plane ECS CPU is high."
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_service_name
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${var.name}-alb-target-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Control plane target 5xx responses are elevated."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx" {
  alarm_name          = "${var.name}-cloudfront-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xxErrorRate"
  namespace           = "AWS/CloudFront"
  period              = 300
  statistic           = "Average"
  threshold           = 5
  alarm_description   = "CloudFront 5xx error rate is elevated."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DistributionId = var.cloudfront_id
    Region         = "Global"
  }
}

resource "aws_cloudwatch_metric_alarm" "waf_blocked_requests" {
  alarm_name          = "${var.name}-waf-blocked-requests"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  treat_missing_data  = "notBreaching"
  alarm_description   = "FortressNet platform WAF blocks are elevated; investigate security events."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    WebACL = var.waf_web_acl_name
    Region = "Global"
    Rule   = "ALL"
  }
}

resource "aws_cloudwatch_dashboard" "platform" {
  dashboard_name = "${var.name}-platform"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          region = var.dashboard_region
          title  = "Control plane CPU"
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name]
          ]
          stat   = "Average"
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 0
        width  = 8
        height = 6
        properties = {
          region = var.dashboard_region
          title  = "ALB target errors"
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", var.alb_arn_suffix, "TargetGroup", var.target_group_suffix]
          ]
          stat   = "Sum"
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 0
        width  = 8
        height = 6
        properties = {
          region = "us-east-1"
          title  = "CloudFront error rate"
          metrics = [
            ["AWS/CloudFront", "5xxErrorRate", "DistributionId", var.cloudfront_id, "Region", "Global"],
            [".", "4xxErrorRate", ".", ".", ".", "."]
          ]
          stat   = "Average"
          period = 300
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          region = "us-east-1"
          title  = "WAF allowed vs blocked"
          metrics = [
            ["AWS/WAFV2", "AllowedRequests", "WebACL", var.waf_web_acl_name, "Region", "Global", "Rule", "ALL"],
            [".", "BlockedRequests", ".", ".", ".", ".", ".", "."]
          ]
          stat   = "Sum"
          period = 300
        }
      }
    ]
  })
}
