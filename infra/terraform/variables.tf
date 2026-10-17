variable "project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "region" {
  description = "Cloud Run サービスがあるリージョン（Serverless NEG のリージョン）"
  type        = string
  default     = "asia-northeast1"
}

variable "name_prefix" {
  description = "LB 関連リソース名のプレフィックス"
  type        = string
  default     = "api"
}

variable "domains" {
  description = "Google マネージド SSL 証明書を発行するドメイン（DNS の A レコードを出力 ip_address に向ける）"
  type        = list(string)
}

variable "services" {
  description = <<-EOT
    LB 配下にぶら下げるドメインサービス。キーは任意の識別子。
    path_prefixes に一致するリクエストを対応する Cloud Run サービスへルーティングする。
    例: { domain-a = { cloud_run_service = "domain-a-api", path_prefixes = ["/items"] } }
  EOT
  type = map(object({
    cloud_run_service = string
    path_prefixes     = list(string)
  }))
  default = {
    domain-a = {
      cloud_run_service = "domain-a-api"
      path_prefixes     = ["/items"]
    }
    domain-b = {
      cloud_run_service = "domain-b-api"
      path_prefixes     = ["/orders"]
    }
  }

  validation {
    condition = alltrue(flatten([
      for s in values(var.services) : [for p in s.path_prefixes : startswith(p, "/") && !endswith(p, "/")]
    ]))
    error_message = "path_prefixes must start with '/' and must not end with '/'."
  }
}

variable "default_service" {
  description = "どの path にも一致しないリクエストの転送先（services のキー）"
  type        = string
  default     = "domain-a"
}

# --- Cloud Armor ---------------------------------------------------------------

variable "waf_rules" {
  description = "有効にする Cloud Armor の事前構成 WAF ルール（OWASP CRS ベース）"
  type        = list(string)
  default = [
    "sqli-v33-stable",
    "xss-v33-stable",
    "lfi-v33-stable",
    "rfi-v33-stable",
    "rce-v33-stable",
    "scannerdetection-v33-stable",
    "protocolattack-v33-stable",
  ]
}

variable "waf_sensitivity" {
  description = "事前構成 WAF ルールの感度（1 が最も誤検知が少ない）"
  type        = number
  default     = 1
}

variable "waf_preview" {
  description = "true の場合 WAF ルールをプレビュー（ログのみ・ブロックしない）で適用する。導入初期の誤検知確認用"
  type        = bool
  default     = false
}

variable "rate_limit" {
  description = "クライアント IP ごとのレート制限。超過時は 429 を返す"
  type = object({
    count        = number
    interval_sec = number
  })
  default = {
    count        = 300
    interval_sec = 60
  }
}

variable "blocked_ip_ranges" {
  description = "拒否する送信元 IP レンジ（CIDR、最大 10 個）"
  type        = list(string)
  default     = []
}

variable "log_sample_rate" {
  description = "LB リクエストログのサンプリング率（0.0 - 1.0）"
  type        = number
  default     = 1.0
}
