terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
  }

  # backend.hcl の例:
  #   bucket = "my-project-tfstate"
  #   prefix = "shared-lb/dev"
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
