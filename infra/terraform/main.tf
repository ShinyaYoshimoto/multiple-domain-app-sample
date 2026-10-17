# -----------------------------------------------------------------------------
# 全ドメイン共通の外部アプリケーションロードバランサ（グローバル）
#
#   Client ──HTTPS──▶ Global forwarding rule (443)
#                       └▶ Target HTTPS proxy (Managed SSL cert / SSL policy)
#                            └▶ URL map（パスでルーティング）
#                                 ├─ /items/*  ▶ Backend service (+Cloud Armor) ▶ Serverless NEG ▶ Cloud Run domain-a-api
#                                 └─ /orders/* ▶ Backend service (+Cloud Armor) ▶ Serverless NEG ▶ Cloud Run domain-b-api
#
# 各 Cloud Run サービスは apps/<service>/terraform で作成し、ingress を
# INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER にすることで LB（= Cloud Armor）経由でしか到達できないようにする。
# -----------------------------------------------------------------------------

locals {
  # URL map の path_rule は完全一致かワイルドカードのため、/items と /items/* の両方を登録する
  service_paths = {
    for key, svc in var.services : key => flatten([
      for p in svc.path_prefixes : [p, "${p}/*"]
    ])
  }
}

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_compute_global_address" "api" {
  name       = "${var.name_prefix}-lb-ip"
  depends_on = [google_project_service.compute]
}

# -----------------------------------------------------------------------------
# ドメインごとの Serverless NEG とバックエンドサービス
# -----------------------------------------------------------------------------
resource "google_compute_region_network_endpoint_group" "service" {
  for_each = var.services

  name                  = "${var.name_prefix}-${each.key}-neg"
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.cloud_run_service
  }

  depends_on = [google_project_service.compute]
}

resource "google_compute_backend_service" "service" {
  for_each = var.services

  name                  = "${var.name_prefix}-${each.key}-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  security_policy       = google_compute_security_policy.api.id

  backend {
    group = google_compute_region_network_endpoint_group.service[each.key].id
  }

  log_config {
    enable      = true
    sample_rate = var.log_sample_rate
  }
}

# -----------------------------------------------------------------------------
# URL map（パスベースルーティング）
# -----------------------------------------------------------------------------
resource "google_compute_url_map" "https" {
  name            = "${var.name_prefix}-url-map"
  default_service = google_compute_backend_service.service[var.default_service].id

  host_rule {
    hosts        = ["*"]
    path_matcher = "domains"
  }

  path_matcher {
    name            = "domains"
    default_service = google_compute_backend_service.service[var.default_service].id

    dynamic "path_rule" {
      for_each = local.service_paths
      content {
        paths   = path_rule.value
        service = google_compute_backend_service.service[path_rule.key].id
      }
    }
  }

  lifecycle {
    precondition {
      condition     = contains(keys(var.services), var.default_service)
      error_message = "default_service must be one of the keys of services."
    }
  }
}

# -----------------------------------------------------------------------------
# HTTPS フロントエンド
# -----------------------------------------------------------------------------
resource "google_compute_managed_ssl_certificate" "api" {
  # ドメインを変更すると証明書の作り直しになるため、名前にハッシュを含めて create_before_destroy する
  name = "${var.name_prefix}-cert-${substr(sha256(join(",", sort(var.domains))), 0, 8)}"

  managed {
    domains = var.domains
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [google_project_service.compute]
}

resource "google_compute_ssl_policy" "api" {
  name            = "${var.name_prefix}-ssl-policy"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
  depends_on      = [google_project_service.compute]
}

resource "google_compute_target_https_proxy" "api" {
  name             = "${var.name_prefix}-https-proxy"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
  ssl_policy       = google_compute_ssl_policy.api.id
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${var.name_prefix}-https"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.api.id
  port_range            = "443"
  target                = google_compute_target_https_proxy.api.id
}

# -----------------------------------------------------------------------------
# HTTP -> HTTPS リダイレクト
# -----------------------------------------------------------------------------
resource "google_compute_url_map" "http_redirect" {
  name = "${var.name_prefix}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }

  depends_on = [google_project_service.compute]
}

resource "google_compute_target_http_proxy" "http_redirect" {
  name    = "${var.name_prefix}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${var.name_prefix}-http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.api.id
  port_range            = "80"
  target                = google_compute_target_http_proxy.http_redirect.id
}
