/**
 * El registro donde viven las imágenes Docker.
 *
 * Está en la misma región que las VMs a propósito: bajarse ~550 MB desde otra
 * región cuesta dinero (salida de tráfico) y hace más lento cada arranque, que
 * es justo lo que el autoescalado necesita rápido.
 */

resource "google_artifact_registry_repository" "imagenes" {
  location      = var.region
  repository_id = var.prefijo
  format        = "DOCKER"
  description   = "Imágenes del backend y del frontend de PRAXIS"

  depends_on = [time_sleep.apis_listas]

  /* Sin esto el registro crece sin fin: cada despliegue deja atrás la imagen
     anterior y todas se cobran por GB almacenado. Se conservan las 5 últimas,
     que es lo que hace falta para poder volver atrás. */
  cleanup_policies {
    id     = "conservar-ultimas-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
}

/**
 * Permiso para que Cloud Build pueda construir.
 *
 * ⚠️ Los proyectos creados a partir de 2024 **ya no** conceden esto solos. Cloud
 * Build usa por defecto la cuenta de servicio de Compute Engine, y sin este rol
 * `gcloud builds submit` sube el código y muere al leerlo:
 *
 *   331792362543-compute@developer.gserviceaccount.com does not have
 *   storage.objects.get access to ..._cloudbuild/objects/source/...
 *
 * El mensaje habla de Storage, así que se busca el problema en el bucket y no
 * en IAM, que es donde está.
 */
data "google_project" "actual" {
  project_id = var.proyecto
}

resource "google_project_iam_member" "cloudbuild_constructor" {
  project = var.proyecto
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${data.google_project.actual.number}-compute@developer.gserviceaccount.com"

  depends_on = [time_sleep.apis_listas]
}

locals {
  registro = "${var.region}-docker.pkg.dev/${var.proyecto}/${var.prefijo}"

  imagen_backend  = "${local.registro}/backend:${var.etiqueta_imagen}"
  imagen_frontend = "${local.registro}/frontend:${var.etiqueta_imagen}"
}
