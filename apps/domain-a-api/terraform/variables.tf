variable "project_id" {
  description = "GCP プロジェクト ID"
  type        = string
}

variable "region" {
  description = "Cloud Run / Artifact Registry のリージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "environment" {
  description = "環境名（dev / stg / prd）"
  type        = string
  default     = "dev"
}

variable "service_name" {
  description = "Cloud Run サービス名（ドメイン単位）"
  type        = string
  default     = "domain-a-api"
}

variable "image_tag" {
  description = "デプロイするコンテナイメージのタグ（CI で git SHA などを渡す）"
  type        = string
}

variable "ingress" {
  description = <<-EOT
    Cloud Run のイングレス設定。
    外部 HTTPS LB + Cloud Armor 経由でのみ公開する場合は INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER。
  EOT
  type        = string
  default     = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  validation {
    condition = contains([
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY",
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
    ], var.ingress)
    error_message = "ingress must be one of INGRESS_TRAFFIC_ALL, INGRESS_TRAFFIC_INTERNAL_ONLY, INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER."
  }
}

variable "invoker_iam_disabled" {
  description = <<-EOT
    true の場合 Cloud Run の呼び出し元 IAM チェックを無効化する。
    外部 LB（+ Cloud Armor）経由で公開 API にする場合に使う。ingress を INTERNAL_LOAD_BALANCER にしていれば
    LB を経由しない直接アクセスは拒否されるため、allUsers に run.invoker を付与するより安全
    （組織ポリシーの Domain Restricted Sharing にも抵触しない）。
  EOT
  type        = bool
  default     = false
}

variable "invoker_members" {
  description = "roles/run.invoker を付与するメンバー（サービス間呼び出しの SA など）"
  type        = list(string)
  default     = []
}

variable "min_instances" {
  description = "最小インスタンス数（コールドスタート回避が必要な本番では 1 以上）"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "最大インスタンス数（DB の最大接続数 / DB_CONNECTION_LIMIT を超えないように設定）"
  type        = number
  default     = 10
}

variable "concurrency" {
  description = "1 インスタンスあたりの最大同時リクエスト数"
  type        = number
  default     = 80
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "env_vars" {
  description = "追加の環境変数（機密情報は入れず secret_env_vars を使う）"
  type        = map(string)
  default     = {}
}

variable "vpc_egress" {
  description = <<-EOT
    AlloyDB などプライベート IP のリソースに接続するための Direct VPC Egress 設定。
    null の場合は VPC に接続しない。
  EOT
  type = object({
    network    = string
    subnetwork = string
  })
  default = null
}
