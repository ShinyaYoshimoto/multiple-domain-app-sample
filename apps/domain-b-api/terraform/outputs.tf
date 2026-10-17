output "service_name" {
  value = google_cloud_run_v2_service.this.name
}

output "service_uri" {
  description = "Cloud Run のデフォルト URL（ingress を LB 限定にしている場合は直接アクセス不可）"
  value       = google_cloud_run_v2_service.this.uri
}

output "artifact_registry_image_base" {
  description = "docker push 先のイメージパス（末尾に /domain-b-api:<tag> を付ける）"
  value       = local.image_base
}

output "runtime_service_account_email" {
  value = google_service_account.runtime.email
}

output "database_url_secret_id" {
  value = google_secret_manager_secret.database_url.secret_id
}

output "migrate_job_name" {
  value = google_cloud_run_v2_job.migrate.name
}
