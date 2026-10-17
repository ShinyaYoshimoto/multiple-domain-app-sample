locals {
  # 1 ドメイン = 1 Artifact Registry リポジトリ = 1 Cloud Run サービス
  repository_id = var.service_name
  image_base    = "${var.region}-docker.pkg.dev/${var.project_id}/${local.repository_id}"
  image         = "${local.image_base}/${var.service_name}:${var.image_tag}"
  migrate_image = "${local.image_base}/${var.service_name}-migrate:${var.image_tag}"

  labels = {
    service     = var.service_name
    environment = var.environment
    managed-by  = "terraform"
  }

  env_vars = merge(
    {
      NODE_ENV            = "production"
      DB_CONNECTION_LIMIT = "5"
    },
    var.env_vars,
  )
}

# -----------------------------------------------------------------------------
# 必要な API
# -----------------------------------------------------------------------------
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# -----------------------------------------------------------------------------
# Artifact Registry（コンテナイメージの格納先）
# -----------------------------------------------------------------------------
resource "google_artifact_registry_repository" "this" {
  repository_id = local.repository_id
  location      = var.region
  format        = "DOCKER"
  description   = "Container images for ${var.service_name}"
  labels        = local.labels

  # 古いイメージを自動削除（直近 20 個は保持）
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 20
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 days
    }
  }

  depends_on = [google_project_service.services]
}

# -----------------------------------------------------------------------------
# 実行用サービスアカウント（ドメインごとに分離し、最小権限にする）
# -----------------------------------------------------------------------------
resource "google_service_account" "runtime" {
  account_id   = "${var.service_name}-run"
  display_name = "Cloud Run runtime SA for ${var.service_name}"
}

# -----------------------------------------------------------------------------
# DB 接続文字列（Secret Manager）
# 値は Terraform の state に残さないため、コンソールまたは以下で別途登録する:
#   echo -n "postgresql://..." | gcloud secrets versions add domain-b-api-database-url --data-file=-
# -----------------------------------------------------------------------------
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${var.service_name}-database-url"
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_iam_member" "runtime_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

# -----------------------------------------------------------------------------
# Cloud Run (v2) サービス
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "this" {
  name                 = var.service_name
  location             = var.region
  ingress              = var.ingress
  invoker_iam_disabled = var.invoker_iam_disabled
  labels               = local.labels
  deletion_protection  = var.environment == "prd"

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = var.concurrency
    timeout                          = "30s"
    labels                           = local.labels

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # AlloyDB（プライベート IP）へ接続する場合の Direct VPC Egress
    dynamic "vpc_access" {
      for_each = var.vpc_egress == null ? [] : [var.vpc_egress]
      content {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = vpc_access.value.network
          subnetwork = vpc_access.value.subnetwork
        }
      }
    }

    containers {
      image = local.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = true # リクエスト処理中のみ CPU を割り当て（課金最適化）
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/healthz"
        }
        initial_delay_seconds = 0
        period_seconds        = 3
        timeout_seconds       = 2
        failure_threshold     = 10
      }

      liveness_probe {
        http_get {
          path = "/healthz"
        }
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.runtime_database_url,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = toset(var.invoker_members)

  name     = google_cloud_run_v2_service.this.name
  location = google_cloud_run_v2_service.this.location
  role     = "roles/run.invoker"
  member   = each.value
}

# -----------------------------------------------------------------------------
# DB マイグレーション用 Cloud Run Job（Dockerfile の `migrate` ターゲットのイメージを使用）
# デプロイ前に CI から実行する:
#   gcloud run jobs execute domain-b-api-migrate --region asia-northeast1 --wait
# -----------------------------------------------------------------------------
resource "google_cloud_run_v2_job" "migrate" {
  name                = "${var.service_name}-migrate"
  location            = var.region
  labels              = local.labels
  deletion_protection = var.environment == "prd"

  template {
    task_count = 1

    template {
      service_account = google_service_account.runtime.email
      max_retries     = 0
      timeout         = "600s"

      dynamic "vpc_access" {
        for_each = var.vpc_egress == null ? [] : [var.vpc_egress]
        content {
          egress = "PRIVATE_RANGES_ONLY"
          network_interfaces {
            network    = vpc_access.value.network
            subnetwork = vpc_access.value.subnetwork
          }
        }
      }

      containers {
        image = local.migrate_image

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_iam_member.runtime_database_url,
  ]
}
