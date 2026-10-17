terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
  }

  # 環境ごとに state を GCS で管理する（初回は `terraform init -backend-config=backend.hcl`）
  # backend.hcl の例:
  #   bucket = "my-project-tfstate"
  #   prefix = "domain-a-api/dev"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
