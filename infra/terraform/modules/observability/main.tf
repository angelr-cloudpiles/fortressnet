resource "aws_sns_topic" "alerts" {
  name              = "${var.name}-alerts"
  kms_master_key_id = var.platform_kms_key_arn
}

resource "aws_glue_catalog_database" "security_lake" {
  name        = replace("${var.name}_security_lake", "-", "_")
  description = "FortressNet immutable control-plane audit lake."
}

resource "aws_glue_catalog_table" "control_plane_audit_events" {
  name          = "control_plane_audit_events"
  database_name = aws_glue_catalog_database.security_lake.name
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    classification                 = "json"
    "projection.enabled"          = "true"
    "projection.year.type"        = "integer"
    "projection.year.range"       = "2025,NOW"
    "projection.month.type"       = "integer"
    "projection.month.range"      = "1,12"
    "projection.month.digits"     = "2"
    "projection.day.type"         = "integer"
    "projection.day.range"        = "1,31"
    "projection.day.digits"       = "2"
    "storage.location.template"   = "s3://${var.audit_logs_bucket_name}/control-plane/year=$${year}/month=$${month}/day=$${day}/"
  }

  partition_keys {
    name = "year"
    type = "string"
  }

  partition_keys {
    name = "month"
    type = "string"
  }

  partition_keys {
    name = "day"
    type = "string"
  }

  storage_descriptor {
    location      = "s3://${var.audit_logs_bucket_name}/control-plane/"
    input_format  = "org.apache.hadoop.mapred.TextInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"

    ser_de_info {
      name                  = "openx_json"
      serialization_library = "org.openx.data.jsonserde.JsonSerDe"
    }

    columns {
      name = "action"
      type = "string"
    }
    columns {
      name = "tenant_id"
      type = "string"
    }
    columns {
      name = "actor"
      type = "string"
    }
    columns {
      name = "payload"
      type = "string"
    }
    columns {
      name = "at"
      type = "string"
    }
  }
}

resource "aws_athena_workgroup" "security_lake" {
  name          = "${var.name}-security-lake"
  force_destroy = false

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${var.reports_bucket_name}/athena/"
      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }
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
