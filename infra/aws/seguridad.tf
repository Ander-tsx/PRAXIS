/**
 * Los grupos de seguridad: los mismos flujos que los cortafuegos de GCP.
 *
 *   internet ─► ALB ─► frontend ─► NLB interno ─► backend ─► RDS
 *                                                    └─────► Redis
 *
 * Diferencias con GCP que conviene tener presentes:
 *
 *  - En GCP las reglas se aplican por *etiqueta* de la VM; aquí, por *grupo de
 *    seguridad*, y una regla puede decir «desde este otro grupo». Es lo mismo
 *    que `source_tags`: si mañana cambian las subredes, la regla sigue diciendo
 *    lo que quiere decir.
 *  - Los grupos de seguridad son con estado: la respuesta de una conexión
 *    permitida vuelve sola. Solo se declara el sentido de ida.
 *  - Aquí NO hay reglas para los health checks de Google (`130.211.0.0/22`…):
 *    los comprueba el propio ALB/NLB, desde su grupo, y basta con dejarle pasar.
 *    Es la mitad de las reglas de red.
 *  - NO hay regla de SSH. Se entra por SSM Session Manager, que sale de la
 *    máquina hacia AWS y no necesita ningún puerto abierto (ver iam.tf).
 *
 * Las reglas son recursos sueltos (`aws_vpc_security_group_*_rule`) y no bloques
 * dentro del grupo: los grupos se referencian entre sí, y con bloques
 * `ingress {}` esa referencia circular es un error de dependencia.
 */

resource "aws_security_group" "alb" {
  name        = "${var.prefijo}-alb"
  description = "Balanceador publico: la unica puerta desde internet"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-alb" }
}

resource "aws_security_group" "frontend" {
  name        = "${var.prefijo}-frontend"
  description = "Maquinas del frontend (Next, puerto 4100)"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-frontend" }
}

resource "aws_security_group" "gateway_lb" {
  name        = "${var.prefijo}-gateway-lb"
  description = "Balanceador interno del gateway"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-gateway-lb" }
}

resource "aws_security_group" "backend" {
  name        = "${var.prefijo}-backend"
  description = "Maquinas del backend (monolito, puerto 3000)"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-backend" }
}

resource "aws_security_group" "redis" {
  name        = "${var.prefijo}-redis"
  description = "ElastiCache Redis"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-redis" }
}

resource "aws_security_group" "base_datos" {
  name        = "${var.prefijo}-base-datos"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.vpc.id
  tags        = { Name = "${var.prefijo}-base-datos" }
}

# ───────────────────────── internet → ALB ─────────────────────────

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = toset(var.cidrs_permitidos_alb)

  security_group_id = aws_security_group.alb.id
  description       = "HTTPS desde ${each.value}"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

/* El 80 se abre también con dominio: ahí solo redirige a HTTPS. */
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(var.cidrs_permitidos_alb)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP desde ${each.value} (redirige a HTTPS si hay dominio)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = each.value
}

# ──────────────────────── ALB → frontend ────────────────────────

resource "aws_vpc_security_group_egress_rule" "alb_a_frontend" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Trafico y health checks hacia el frontend"
  ip_protocol                  = "tcp"
  from_port                    = 4100
  to_port                      = 4100
  referenced_security_group_id = aws_security_group.frontend.id
}

resource "aws_vpc_security_group_ingress_rule" "frontend_desde_alb" {
  security_group_id            = aws_security_group.frontend.id
  description                  = "Desde el ALB"
  ip_protocol                  = "tcp"
  from_port                    = 4100
  to_port                      = 4100
  referenced_security_group_id = aws_security_group.alb.id
}

# ─────────────────────── frontend → backend ───────────────────────

/**
 * El frontend llama al gateway a través del NLB interno. Un NLB de AWS
 * conserva por defecto la IP de origen en destinos de tipo instancia, así que
 * el backend ve llegar al FRONTEND y no al balanceador; por eso hay dos reglas
 * de entrada en el backend: una desde el frontend (el tráfico) y otra desde el
 * grupo del NLB (sus health checks). Con solo la primera, el NLB marca todo
 * como no sano y el sitio da 502 con el backend perfectamente levantado — es el
 * mismo síntoma del «grupo entero no sano» que la pila de GCP evita con sus
 * reglas de health check.
 *
 * Los puertos de los servicios internos NO están aquí a propósito: en el
 * monolito se hablan en memoria, y fuera de la máquina solo existe el 3000.
 */
resource "aws_vpc_security_group_egress_rule" "frontend_a_gateway_lb" {
  security_group_id            = aws_security_group.frontend.id
  description                  = "Llamadas al gateway (a traves del NLB)"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.gateway_lb.id
}

resource "aws_vpc_security_group_ingress_rule" "gateway_lb_desde_frontend" {
  security_group_id            = aws_security_group.gateway_lb.id
  description                  = "Desde el frontend"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.frontend.id
}

resource "aws_vpc_security_group_egress_rule" "gateway_lb_a_backend" {
  security_group_id            = aws_security_group.gateway_lb.id
  description                  = "Reparto y health checks hacia el backend"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.backend.id
}

resource "aws_vpc_security_group_ingress_rule" "backend_desde_frontend" {
  security_group_id            = aws_security_group.backend.id
  description                  = "Trafico del frontend (IP de origen conservada por el NLB)"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.frontend.id
}

resource "aws_vpc_security_group_ingress_rule" "backend_desde_gateway_lb" {
  security_group_id            = aws_security_group.backend.id
  description                  = "Health checks del NLB"
  ip_protocol                  = "tcp"
  from_port                    = 3000
  to_port                      = 3000
  referenced_security_group_id = aws_security_group.gateway_lb.id
}

# ───────────────────────── backend → datos ─────────────────────────

/** Redis no pide contraseña: esta regla ES su seguridad, igual que en GCP. */
resource "aws_vpc_security_group_ingress_rule" "redis_desde_backend" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Desde el backend"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = aws_security_group.backend.id
}

resource "aws_vpc_security_group_ingress_rule" "base_datos_desde_backend" {
  security_group_id            = aws_security_group.base_datos.id
  description                  = "Desde el backend"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.backend.id
}

# ──────────────────────── salida de las máquinas ────────────────────────

/**
 * Las máquinas necesitan salir a internet (NAT) para ECR, Secrets Manager, SSM,
 * Gemini, Stripe y Resend, y ninguna de esas direcciones es fija, así que la
 * salida va abierta. Lo que protege es que **nada entra**: sin IP pública y sin
 * ninguna regla de entrada que no sea la de arriba, salir no expone nada.
 *
 * Es un hallazgo conocido de los escáneres (egress 0.0.0.0/0) y se acepta a
 * propósito; el README lo explica.
 */
resource "aws_vpc_security_group_egress_rule" "backend_salida" {
  security_group_id = aws_security_group.backend.id
  description       = "Salida a internet por el NAT y a la base, Redis"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "frontend_internet" {
  security_group_id = aws_security_group.frontend.id
  description       = "Salida por el NAT: ECR, Secrets Manager y SSM"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
