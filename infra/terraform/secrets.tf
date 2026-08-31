/**
 * Los secretos y la cuenta de servicio que los lee.
 *
 * Nada de esto viaja en metadatos de la VM: los metadatos los ve cualquiera que
 * tenga permiso de lectura sobre la instancia, y ahí acabaría el secreto que
 * firma todas las sesiones. Las máquinas los piden a Secret Manager al arrancar
 * usando su propia identidad, y quedan solo en memoria y en un archivo dentro
 * del disco efímero.
 */

# ─────────────────────── valores generados ───────────────────────

/**
 * ⚠️ Este secreto tiene que ser el MISMO en el gateway, en credentials-service
 * y en las 6 zonas del frontend. Cada zona verifica la firma de la cookie por
 * su cuenta; si no coinciden, la sesión se ve como inválida y todo redirige al
 * login sin decir por qué.
 *
 * Generándolo aquí una sola vez y repartiéndolo desde Secret Manager, ese
 * desajuste no puede ocurrir.
 */
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

/**
 * El token de voz lleva secreto propio a propósito: es de solo lectura y dura
 * 90 días. Reutilizar el de la plataforma convertiría una fuga en el altavoz en
 * una fuga de sesiones completas.
 */
resource "random_password" "voice_jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "password_sql" {
  length  = 32
  special = false # Cloud SQL los admite, pero simplifica la cadena de conexión
}

# ──────────────────────── Secret Manager ────────────────────────

locals {
  secretos = {
    "jwt-secret"       = random_password.jwt_secret.result
    "voice-jwt-secret" = random_password.voice_jwt_secret.result
    "password-sql"     = random_password.password_sql.result
    "gemini-api-key"   = var.gemini_api_key
    "mail-api-key"     = var.mail_api_key

    /* Stripe. Van los tres juntos porque los tres se leen en el mismo sitio —el
       gateway— y repartirlos entre Secret Manager y metadatos dejaría media
       configuración de pago en un lado y media en otro. El `price_…` no es
       secreto, pero tampoco gana nada estando aparte. */
    "stripe-secret-key"     = var.stripe_secret_key
    "stripe-price-pro"      = var.stripe_price_pro
    "stripe-price-plus"     = var.stripe_price_plus
    "stripe-price-team"     = var.stripe_price_team
    "stripe-price-business" = var.stripe_price_business
    "stripe-webhook-secret" = var.stripe_webhook_secret
  }
}

resource "google_secret_manager_secret" "secretos" {
  for_each = local.secretos

  secret_id = "${var.prefijo}-${each.key}"

  replication {
    auto {}
  }

  depends_on = [time_sleep.apis_listas]
}

resource "google_secret_manager_secret_version" "versiones" {
  for_each = local.secretos

  secret = google_secret_manager_secret.secretos[each.key].id

  /* Secret Manager rechaza un valor vacío. Cuando no hay clave de Gemini se
     guarda un marcador: assistant-service arrancará y fallará igual —no hay
     forma de que funcione sin clave— pero el resto del despliegue no se
     bloquea por un secreto sin rellenar. */
  secret_data = each.value != "" ? each.value : "sin-configurar"
}

# ─────────────────── identidad de las máquinas ───────────────────

/**
 * Una cuenta de servicio propia en vez de la por defecto de Compute Engine.
 *
 * La por defecto viene con rol de Editor sobre TODO el proyecto: si alguien
 * entra en una VM, entra en el proyecto entero. Esta solo puede leer secretos,
 * bajar imágenes y escribir logs.
 */
resource "google_service_account" "maquinas" {
  account_id   = "${var.prefijo}-vm"
  display_name = "Máquinas de PRAXIS (backend, frontend y Redis)"
  depends_on   = [time_sleep.apis_listas]
}

resource "google_project_iam_member" "maquinas" {
  for_each = toset([
    "roles/artifactregistry.reader", # bajarse la imagen
    "roles/logging.logWriter",       # mandar logs a Cloud Logging
    "roles/monitoring.metricWriter", # métricas para el autoescalado
  ])

  project = var.proyecto
  role    = each.value
  member  = "serviceAccount:${google_service_account.maquinas.email}"
}

/**
 * El acceso a secretos se concede secreto a secreto, no a nivel de proyecto.
 * Así la VM de Redis —que usa la misma cuenta— no puede leer el JWT_SECRET
 * aunque comparta identidad con las demás.
 */
resource "google_secret_manager_secret_iam_member" "lectura" {
  for_each = google_secret_manager_secret.secretos

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.maquinas.email}"
}
