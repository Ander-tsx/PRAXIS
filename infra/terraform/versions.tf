/**
 * Proveedores y dónde vive el estado.
 *
 * El estado de Terraform es el archivo que recuerda qué recursos creó y con qué
 * identificadores. Si se pierde, Terraform deja de reconocer lo que ya existe e
 * intenta crearlo otra vez. Por eso NO se guarda en el repo: va a un bucket de
 * Cloud Storage con versionado, que además permite trabajar desde varias
 * máquinas sin pisarse.
 *
 * ⚠️ El bucket tiene que existir ANTES del primer `terraform init`: Terraform no
 * puede guardar su estado en algo que aún no ha creado. Se crea a mano una sola
 * vez — el comando está en docs/despliegue/README.md.
 */

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }

  backend "gcs" {
    # El nombre del bucket se pasa en `terraform init -backend-config=...`
    # porque aquí no se pueden usar variables. Ver docs/despliegue/README.md.
    prefix = "praxis/estado"
  }
}

provider "google" {
  project = var.proyecto
  region  = var.region
  zone    = var.zona
}
