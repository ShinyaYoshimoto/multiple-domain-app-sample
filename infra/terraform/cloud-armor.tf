# -----------------------------------------------------------------------------
# Cloud Armor セキュリティポリシー（全ドメインのバックエンドサービスで共有）
# 評価順は priority の昇順。最初に一致したルールのアクションが適用される。
# -----------------------------------------------------------------------------
resource "google_compute_security_policy" "api" {
  name        = "${var.name_prefix}-security-policy"
  description = "WAF / rate limiting for ${var.name_prefix} load balancer"
  type        = "CLOUD_ARMOR"

  # L7 DDoS の自動検知（Adaptive Protection）
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }

  # 1. 明示的な IP 拒否リスト
  dynamic "rule" {
    for_each = length(var.blocked_ip_ranges) > 0 ? [1] : []
    content {
      priority    = 100
      action      = "deny(403)"
      description = "Blocked IP ranges"
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.blocked_ip_ranges
        }
      }
    }
  }

  # 2. 事前構成 WAF ルール（SQLi / XSS / LFI / RCE など）
  dynamic "rule" {
    for_each = { for i, name in var.waf_rules : name => i }
    content {
      priority    = 1000 + rule.value
      action      = "deny(403)"
      preview     = var.waf_preview
      description = "Preconfigured WAF: ${rule.key}"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('${rule.key}', {'sensitivity': ${var.waf_sensitivity}})"
        }
      }
    }
  }

  # 3. クライアント IP 単位のレート制限
  rule {
    priority    = 2000
    action      = "throttle"
    description = "Per-IP rate limiting"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.rate_limit.count
        interval_sec = var.rate_limit.interval_sec
      }
    }
  }

  # デフォルトルール（必須）
  rule {
    priority    = 2147483647
    action      = "allow"
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}
