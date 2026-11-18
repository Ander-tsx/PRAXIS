/**
 * Los logs de las máquinas (CloudWatch Logs).
 *
 * El driver `awslogs` de Docker escribe aquí directamente, el equivalente de
 * `--log-driver=gcplogs`. Se crean los grupos a mano, con retención: si Docker
 * los crea por su cuenta nacen sin caducidad y se cobran para siempre.
 */

resource "aws_cloudwatch_log_group" "maquinas" {
  for_each = toset(["backend", "frontend"])

  name              = "/${var.prefijo}/${each.key}"
  retention_in_days = var.retencion_logs_dias
}
