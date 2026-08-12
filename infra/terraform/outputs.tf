/**
 * Lo que hace falta saber después de aplicar.
 *
 * `terraform output` los vuelve a imprimir en cualquier momento; los marcados
 * como sensibles piden el nombre: `terraform output -raw password_sql`.
 */

output "url" {
  description = "Dirección pública del sistema. Tarda entre 15 y 60 minutos en servir HTTPS mientras Google emite el certificado."
  value       = "https://${local.dominio}"
}

output "ip_publica" {
  description = "IP del balanceador. Si algún día registras un dominio propio, este es el valor del registro A."
  value       = google_compute_global_address.frontend.address
}

output "dominio" {
  description = "Dominio con el que se emitió el certificado."
  value       = local.dominio
}

# ─────────────────────────── conexión interna ───────────────────────────

output "gateway_ip_interna" {
  description = "IP del balanceador interno del gateway. Solo alcanzable desde la VPC."
  value       = google_compute_address.gateway.address
}

output "sql_ip_privada" {
  description = "IP privada de Cloud SQL. Es la que necesitas para el túnel al aplicar migraciones."
  value       = google_sql_database_instance.postgres.private_ip_address
}

output "redis_ip" {
  description = "IP interna de la máquina de Redis."
  value       = google_compute_address.redis.address
}

# ─────────────────────────── imágenes ───────────────────────────

output "registro" {
  description = "Ruta base de Artifact Registry, la que se usa al etiquetar y subir las imágenes."
  value       = local.registro
}

# ─────────────────────────── secretos ───────────────────────────

output "password_sql" {
  description = "Contraseña del usuario de Postgres. Hace falta para conectarse a mano y aplicar las migraciones."
  value       = random_password.password_sql.result
  sensitive   = true
}

output "jwt_secret" {
  description = "El secreto compartido. No hace falta copiarlo a ningún sitio: las máquinas lo leen solas de Secret Manager."
  value       = random_password.jwt_secret.result
  sensitive   = true
}

# ─────────────────────────── comprobaciones ───────────────────────────

/**
 * Los comandos que hay que ejecutar justo después del primer `apply`, ya
 * rellenos con los valores reales de este despliegue.
 */
output "siguientes_pasos" {
  description = "Qué hacer después de aplicar."
  value       = <<-EOT

    1. Estado del certificado (hasta que ponga ACTIVE, HTTPS da error):
       gcloud compute ssl-certificates describe ${var.prefijo}-cert --global \
         --format="value(managed.status)"

    2. Salud de los grupos (deben decir HEALTHY):
       gcloud compute backend-services get-health ${var.prefijo}-frontend-servicio --global
       gcloud compute backend-services get-health ${var.prefijo}-backend-servicio --region=${var.region}

    3. Si algo no arranca, los logs de una máquina:
       gcloud compute ssh <nombre-vm> --tunnel-through-iap --zone=<zona> \
         --command="sudo journalctl -u praxis-backend -n 100 --no-pager"

    4. El sitio:
       https://${local.dominio}

  EOT
}
