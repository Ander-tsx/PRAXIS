/**
 * La red privada donde vive todo.
 *
 * Misma idea que en GCP: **solo hay una puerta**. El ALB es lo único con IP
 * pública; el gateway, la base de datos y Redis no son alcanzables desde
 * internet ni por error. El navegador nunca habla con el backend: el frontend
 * expone su proxy (`/api/gateway`) y la llamada al gateway sale del servidor de
 * Next, ya dentro de la VPC.
 *
 * Diferencia con GCP: allí una subred es regional y basta una; en AWS una
 * subred vive en UNA zona, y un balanceador exige subredes en al menos dos.
 * Por eso son cuatro: pública y privada en cada una de dos zonas.
 */

data "aws_availability_zones" "disponibles" {
  state = "available"
}

locals {
  /* Dos zonas, no tres: es el mínimo que pide el ALB y cada zona extra
     multiplica el coste del NAT si se activa `nat_por_zona`. */
  zonas = slice(data.aws_availability_zones.disponibles.names, 0, 2)

  /* /16 → /24: las públicas son 10.10.0.0/24 y 10.10.1.0/24; las privadas,
     10.10.10.0/24 y 10.10.11.0/24. Dejar el hueco entre 1 y 10 permite añadir
     más públicas sin renumerar. */
  cidr_publicas = [for i, _ in local.zonas : cidrsubnet(var.rango_vpc, 8, i)]
  cidr_privadas = [for i, _ in local.zonas : cidrsubnet(var.rango_vpc, 8, 10 + i)]
  cantidad_nat  = var.nat_por_zona ? length(local.zonas) : 1
}

resource "aws_vpc" "vpc" {
  cidr_block = var.rango_vpc

  /* Los dos hacen falta: el ALB, el NLB, RDS y ElastiCache se alcanzan por un
     nombre DNS, y sin resolución dentro de la VPC ese nombre no resuelve. */
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.prefijo}-vpc" }
}

/**
 * Una VPC de AWS nace con un grupo de seguridad «default» que permite todo el
 * tráfico entre sus miembros. Se vacía a propósito: así, un recurso que
 * alguien cree a mano sin elegir grupo no queda con acceso a nada nuestro.
 */
resource "aws_default_security_group" "vacio" {
  vpc_id = aws_vpc.vpc.id
}

# ─────────────────────────────── subredes ───────────────────────────────

resource "aws_subnet" "publica" {
  count = length(local.zonas)

  vpc_id            = aws_vpc.vpc.id
  availability_zone = local.zonas[count.index]
  cidr_block        = local.cidr_publicas[count.index]

  /* Sin IP pública automática: aquí solo viven el ALB y los NAT, y ambos traen
     la suya. Ninguna máquina nuestra tiene que nacer expuesta. */
  map_public_ip_on_launch = false

  tags = { Name = "${var.prefijo}-publica-${local.zonas[count.index]}" }
}

resource "aws_subnet" "privada" {
  count = length(local.zonas)

  vpc_id                  = aws_vpc.vpc.id
  availability_zone       = local.zonas[count.index]
  cidr_block              = local.cidr_privadas[count.index]
  map_public_ip_on_launch = false

  tags = { Name = "${var.prefijo}-privada-${local.zonas[count.index]}" }
}

# ─────────────────────── salida a internet ───────────────────────

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id
  tags   = { Name = "${var.prefijo}-igw" }
}

resource "aws_eip" "nat" {
  count = local.cantidad_nat

  domain = "vpc"
  tags   = { Name = "${var.prefijo}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.igw]
}

/**
 * ⚠️ Aquí la pila de AWS **no puede** copiar a la de GCP. En GCP el NAT es
 * opcional (`habilitar_nat = false`) porque «Acceso Privado a Google» deja a
 * una VM sin IP pública llegar a Artifact Registry y Secret Manager por la red
 * interna: ~32 USD/mes de ahorro. AWS no tiene ese atajo para todo, y las
 * máquinas necesitan salida desde el primer arranque —bajar la imagen de ECR,
 * pedir secretos, hablar con SSM— además de lo que ya pedía el asistente
 * (Gemini), Stripe y Resend. Por eso el NAT es obligatorio y es, con el ALB, lo
 * más caro de toda la pila.
 */
resource "aws_nat_gateway" "nat" {
  count = local.cantidad_nat

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.publica[count.index].id
  tags          = { Name = "${var.prefijo}-nat-${count.index}" }

  depends_on = [aws_internet_gateway.igw]
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.vpc.id
  tags   = { Name = "${var.prefijo}-rutas-publicas" }

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "publica" {
  count = length(local.zonas)

  subnet_id      = aws_subnet.publica[count.index].id
  route_table_id = aws_route_table.publica.id
}

/* Una tabla por zona privada: con un solo NAT las dos apuntan a él; con
   `nat_por_zona`, cada una al de su zona, que es lo que evita pagar tráfico
   entre zonas y que una caída de zona arrastre a la otra. */
resource "aws_route_table" "privada" {
  count = length(local.zonas)

  vpc_id = aws_vpc.vpc.id
  tags   = { Name = "${var.prefijo}-rutas-privadas-${local.zonas[count.index]}" }

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat[var.nat_por_zona ? count.index : 0].id
  }
}

resource "aws_route_table_association" "privada" {
  count = length(local.zonas)

  subnet_id      = aws_subnet.privada[count.index].id
  route_table_id = aws_route_table.privada[count.index].id
}

/**
 * Punto de enlace de S3, de tipo *gateway* (gratis). No es un lujo: **las capas
 * de las imágenes de ECR se descargan desde S3**, así que sin esto cada arranque
 * de máquina baja ~550 MB por el NAT, a ~0,045 USD/GB, y cada despliegue o cada
 * reemplazo del autocurado lo repite. Con esto ese tráfico va por la red interna
 * de AWS y no cuesta nada. Los adjuntos del chat (storage.tf) también.
 */
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.vpc.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.privada[*].id

  tags = { Name = "${var.prefijo}-s3" }
}

# ─────────────────────────── registro de tráfico ───────────────────────────

/**
 * El equivalente de `log_config` de la subred de GCP: quién habló con quién y
 * si se aceptó. Solo se registra lo RECHAZADO — lo aceptado es casi todo y
 * multiplicaría la factura de CloudWatch; lo rechazado es lo que se mira cuando
 * «no llega» y no se sabe qué grupo de seguridad lo corta.
 */
resource "aws_cloudwatch_log_group" "flujos_vpc" {
  name              = "/${var.prefijo}/vpc/flujos"
  retention_in_days = var.retencion_logs_dias
}

data "aws_iam_policy_document" "flujos_confianza" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "flujos_permisos" {
  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${aws_cloudwatch_log_group.flujos_vpc.arn}:*"]
  }
}

resource "aws_iam_role" "flujos_vpc" {
  name               = "${var.prefijo}-flujos-vpc"
  assume_role_policy = data.aws_iam_policy_document.flujos_confianza.json
}

resource "aws_iam_role_policy" "flujos_vpc" {
  name   = "escribir-logs"
  role   = aws_iam_role.flujos_vpc.id
  policy = data.aws_iam_policy_document.flujos_permisos.json
}

resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.vpc.id
  traffic_type         = "REJECT"
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.flujos_vpc.arn
  iam_role_arn         = aws_iam_role.flujos_vpc.arn
}
