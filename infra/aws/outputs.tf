/**
 * Lo que hace falta saber después de aplicar.
 *
 * `terraform output` los vuelve a imprimir en cualquier momento; los marcados
 * como sensibles piden el nombre: `terraform output -raw password_sql`.
 */

output "url" {
  description = "Dirección del sistema. Sin dominio es http:// y NO permite iniciar sesión (cookie Secure): solo comprueba que la infraestructura responde."
  value       = local.url_publica
}

output "alb_dns" {
  description = "Nombre DNS del balanceador público. Es el destino del CNAME (o del alias) de tu dominio."
  value       = aws_lb.publico.dns_name
}

output "registros_validacion_acm" {
  description = "Registros DNS que hay que crear a mano para validar el certificado, cuando el DNS no está en Route 53. Vacío si no hay dominio o si Terraform los crea solo."
  value = local.con_dominio && !local.con_route53 ? [
    for o in aws_acm_certificate.sitio[0].domain_validation_options : {
      nombre = o.resource_record_name
      tipo   = o.resource_record_type
      valor  = o.resource_record_value
    }
  ] : []
}

# ─────────────────────────── conexión interna ───────────────────────────

output "gateway_dns_interno" {
  description = "Nombre DNS del NLB interno del gateway. Solo se resuelve dentro de la VPC."
  value       = aws_lb.gateway.dns_name
}

output "rds_endpoint" {
  description = "Dirección de RDS. Es la que necesitas para el túnel de SSM al aplicar migraciones desde el repo."
  value       = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  description = "Dirección de ElastiCache."
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

# ─────────────────────────────── imágenes ───────────────────────────────

output "registro" {
  description = "Registro de ECR, el que se usa al etiquetar y subir las imágenes."
  value       = local.registro
}

output "repositorios" {
  description = "URL de cada repositorio de ECR."
  value       = { for k, r in aws_ecr_repository.imagenes : k => r.repository_url }
}

output "rol_github_ecr" {
  description = "ARN del rol que asume el workflow de GitHub Actions. Va en la variable de repositorio AWS_ROLE_ARN. Vacío si no se pasó github_repo."
  value       = local.crear_ci ? aws_iam_role.github_ecr[0].arn : null
}

output "bucket_adjuntos" {
  description = "Bucket de S3 de los adjuntos del chat. El backend aún no tiene driver de S3: queda sin uso (ver storage.tf)."
  value       = aws_s3_bucket.chat_adjuntos.bucket
}

# ─────────────────────────────── secretos ───────────────────────────────

output "password_sql" {
  description = "Contraseña del usuario de Postgres. Hace falta para conectarse a mano y aplicar las migraciones."
  value       = random_password.password_sql.result
  sensitive   = true
}

output "jwt_secret" {
  description = "El secreto compartido. No hace falta copiarlo a ningún sitio: las máquinas lo leen solas de Secrets Manager."
  value       = random_password.jwt_secret.result
  sensitive   = true
}

# ─────────────────────────────── comprobaciones ───────────────────────────────

output "siguientes_pasos" {
  description = "Qué hacer después de aplicar."
  value       = <<-EOT

    1. Salud de los destinos (deben decir healthy):
       aws elbv2 describe-target-health --region ${var.region} \
         --target-group-arn ${aws_lb_target_group.frontend.arn}
       aws elbv2 describe-target-health --region ${var.region} \
         --target-group-arn ${aws_lb_target_group.backend.arn}

    2. Si algo no arranca, entra a una máquina SIN SSH y mira el servicio:
       aws ssm start-session --region ${var.region} --target <id-de-instancia>
       sudo journalctl -u praxis -n 100 --no-pager
       (o los logs en CloudWatch: /${var.prefijo}/backend y /${var.prefijo}/frontend)

    3. Las migraciones las aplica la propia imagen al arrancar
       (start-backend.sh). Para ver que lo hizo:
       aws logs tail /${var.prefijo}/backend --region ${var.region} --since 30m | grep start-backend

    4. El sitio:
       ${local.url_publica}

  EOT
}
