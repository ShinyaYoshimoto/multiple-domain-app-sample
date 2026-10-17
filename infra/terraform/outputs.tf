output "ip_address" {
  description = "LB のグローバル IP。domains の DNS A レコードをこの IP に向ける"
  value       = google_compute_global_address.api.address
}

output "urls" {
  value = [for d in var.domains : "https://${d}"]
}

output "security_policy_name" {
  value = google_compute_security_policy.api.name
}

output "backend_services" {
  value = { for k, b in google_compute_backend_service.service : k => b.name }
}
