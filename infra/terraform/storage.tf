/**
 * El bucket de los adjuntos del chat.
 *
 * `projects-service` tiene un proveedor `BlobStorage` con dos implementaciones
 * —Postgres, activa por defecto, y GCS, escrita pero inactiva— y elige una con
 * la variable `STORAGE_DRIVER`. Este bucket es la otra mitad de la que estaba
 * escrita sin nada detrás: los adjuntos de chat, y de vídeo en particular, no
 * son datos relacionales y no deberían crecer dentro de Cloud SQL.
 *
 * ⚠️ **El bucket se crea siempre, pero el driver solo se activa con
 * `activar_gcs_chat = true`.** Con la variable en su valor por defecto
 * (`false`), `STORAGE_DRIVER` sigue siendo `postgres` y el bucket se queda ahí,
 * vacío y listo — crear el bucket no cambia nada del comportamiento actual.
 *
 * ⚠️ **Activarlo no migra lo que ya hay.** Los adjuntos subidos antes del
 * cambio se quedan en `chat_attachment_blobs`; el proveedor GCS no los ve ni
 * los toca. Activar esto solo decide dónde se guarda lo que se suba DESPUÉS.
 * Migrar lo viejo —si algún día hace falta— es una tarea aparte, documentada en
 * `docs/frontend/PENDIENTES-BACKEND.md` §18.
 */

resource "google_storage_bucket" "chat_adjuntos" {
  # El nombre de un bucket es único en TODO Google Cloud Storage, no solo
  # dentro de tu proyecto. Se le añade el ID del proyecto —que sí lo es— para
  # no depender de que "praxis-chat-adjuntos" a secas siga libre.
  name    = "${var.prefijo}-chat-adjuntos-${var.proyecto}"
  project = var.proyecto

  # Mismo criterio que Cloud SQL y Redis: todo vive en una sola región, sin
  # pagar la redundancia multi-región que aquí no hace falta.
  location      = var.region
  storage_class = "STANDARD"

  # Solo IAM, nada de ACLs por objeto: es lo que exige `storage.objectAdmin`
  # más abajo y evita el otro modo de acceso, más difícil de auditar.
  uniform_bucket_level_access = true

  # ⚠️ Nunca público. Las URLs de los adjuntos siguen pasando por el gateway
  # —que es quien decide si puedes ver ese mensaje—, nunca por una URL directa
  # del bucket. Un bucket público serviría cualquier adjunto de cualquier
  # conversación a cualquiera que adivinara el id.
  public_access_prevention = "enforced"

  # Nadie pide versiones antiguas de un adjunto: la app siempre sobrescribe o
  # borra, y guardar versiones solo encarecería el almacenamiento sin que el
  # código llegue a usarlas.
  versioning {
    enabled = false
  }

  depends_on = [time_sleep.apis_listas]
}

/**
 * Solo la cuenta de servicio de las máquinas lee y escribe, y solo en ESTE
 * bucket —no `roles/storage.objectAdmin` a nivel de proyecto—, el mismo
 * criterio que `google_secret_manager_secret_iam_member` en `secrets.tf`: el
 * acceso se concede recurso a recurso, nunca de golpe sobre todo el proyecto.
 */
resource "google_storage_bucket_iam_member" "chat_adjuntos_rw" {
  bucket = google_storage_bucket.chat_adjuntos.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.maquinas.email}"
}
