/**
 * APIs de Google Cloud que hay que encender.
 *
 * Un proyecto nuevo las trae casi todas apagadas y el error que da Terraform
 * cuando falta una no dice cuál: habla de un 403 genérico sobre un recurso que
 * sí tienes permiso para crear. Declararlas aquí evita esa media hora.
 */

locals {
  apis = [
    "compute.googleapis.com",           # VMs, grupos, balanceadores, red
    "sqladmin.googleapis.com",          # Cloud SQL
    "servicenetworking.googleapis.com", # el peering que da IP privada a Cloud SQL
    "secretmanager.googleapis.com",     # los secretos
    "artifactregistry.googleapis.com",  # el registro de imágenes Docker
    "storage.googleapis.com",           # el bucket de los adjuntos del chat
    "cloudbuild.googleapis.com",        # donde se construyen las imágenes (x86-64)
    "iap.googleapis.com",               # el túnel para entrar por SSH sin IP pública
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)

  project = var.proyecto
  service = each.value

  /* Apagar una API al destruir puede tumbar otras cosas del proyecto que no
     tienen nada que ver con esto. Terraform deja de gestionarlas y ya está. */
  disable_on_destroy         = false
  disable_dependent_services = false
}

/**
 * Encender una API tarda unos segundos en propagarse por dentro. Sin esta
 * espera, el primer `apply` de un proyecto recién creado falla con un 403 que
 * desaparece al reintentar — y eso confunde mucho la primera vez.
 */
resource "time_sleep" "apis_listas" {
  depends_on      = [google_project_service.apis]
  create_duration = "60s"
}
