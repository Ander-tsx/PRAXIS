/**
 * Los secretos (AWS Secrets Manager).
 *
 * Nada de esto viaja en el `user_data` de la plantilla de lanzamiento: ese texto
 * lo lee cualquiera con permiso `ec2:DescribeLaunchTemplateVersions` o
 * `ec2:DescribeInstanceAttribute`, y ahí acabaría el secreto que firma todas las
 * sesiones. Las máquinas los piden a Secrets Manager al arrancar con su propio
 * rol (iam.tf) y quedan solo en `/run`, que es memoria.
 *
 * ⚠️ Lo que SÍ queda es el valor dentro del **estado de Terraform**, porque los
 * genera `random_password` y los pasa por variable. Es el mismo trato que en GCP
 * y la razón de que el bucket de estado esté cifrado, con acceso privado y
 * versionado (README). Quien pueda leer ese bucket lee todos los secretos.
 */

# ─────────────────────── valores generados ───────────────────────

/**
 * ⚠️ Este secreto tiene que ser el MISMO en el backend y en el frontend, que
 * verifica la firma de la cookie en su guard. Si no coinciden, la sesión se ve
 * como inválida y todo redirige al login sin decir por qué. Generado aquí una
 * sola vez y repartido desde Secrets Manager, ese desajuste no puede ocurrir.
 */
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

/** El token de voz lleva secreto propio: es de solo lectura y dura 90 días. */
resource "random_password" "voice_jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "password_sql" {
  length = 32

  /* RDS rechaza `/`, `@`, `"` y el espacio en la contraseña maestra, y aunque
     admite más, cualquier carácter raro rompe la URL de conexión. Sin especiales
     se evita todo a la vez. */
  special = false
}

# ──────────────────────── Secrets Manager ────────────────────────

locals {
  secretos = {
    "jwt-secret"       = random_password.jwt_secret.result
    "voice-jwt-secret" = random_password.voice_jwt_secret.result
    "password-sql"     = random_password.password_sql.result
    "gemini-api-key"   = var.gemini_api_key
    "mail-api-key"     = var.mail_api_key

    /* Stripe. Van los seis juntos porque se leen en el mismo sitio —el
       gateway— y repartirlos dejaría media configuración de pago en cada lado. */
    "stripe-secret-key"     = var.stripe_secret_key
    "stripe-price-pro"      = var.stripe_price_pro
    "stripe-price-plus"     = var.stripe_price_plus
    "stripe-price-team"     = var.stripe_price_team
    "stripe-price-business" = var.stripe_price_business
    "stripe-webhook-secret" = var.stripe_webhook_secret
  }

  /* Los que lee el frontend: solo el que firma la cookie. El resto es del
     backend, y que el frontend no pueda leerlos es la razón de tener dos roles. */
  secretos_frontend = ["jwt-secret"]
}

resource "aws_secretsmanager_secret" "secretos" {
  for_each = local.secretos

  /* Con barra: en la consola se agrupan bajo `praxis/` y una política puede
     acotar por prefijo. */
  name        = "${var.prefijo}/${each.key}"
  description = "PRAXIS: ${each.key}"

  recovery_window_in_days = var.dias_recuperacion_secretos
}

resource "aws_secretsmanager_secret_version" "versiones" {
  for_each = local.secretos

  secret_id = aws_secretsmanager_secret.secretos[each.key].id

  /* Secrets Manager rechaza un valor vacío. Sin clave de Gemini se guarda un
     marcador: assistant-service arrancará y fallará igual, pero el resto del
     despliegue no se bloquea por un secreto sin rellenar. */
  secret_string = each.value != "" ? each.value : "sin-configurar"
}
