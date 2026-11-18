/**
 * El frontend: grupo de autoescalado detrás del ALB público.
 *
 * Esta es la única puerta de todo el sistema. Cada máquina corre UNA aplicación
 * Next en el 4100 y se basta sola; escalar es sumar copias idénticas.
 */

# ─────────────────────── plantilla de lanzamiento ───────────────────────

resource "aws_launch_template" "frontend" {
  name_prefix   = "${var.prefijo}-frontend-"
  image_id      = local.ami
  instance_type = var.tipo_instancia_frontend

  iam_instance_profile {
    name = aws_iam_instance_profile.frontend.name
  }

  /* Tampoco tiene IP pública: el tráfico entra por el ALB, que es un recurso de
     AWS y no necesita que la máquina esté expuesta. */
  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.frontend.id]
    delete_on_termination       = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  user_data = base64encode(templatefile("${path.module}/plantillas/arranque.sh.tftpl", {
    region      = var.region
    registro    = local.registro
    imagen      = local.imagen_frontend
    nombre      = "praxis-frontend"
    log_grupo   = aws_cloudwatch_log_group.maquinas["frontend"].name
    prefijo     = var.prefijo
    descripcion = "Frontend de PRAXIS (aplicacion Next)"

    entorno = {
      NODE_ENV = "production"

      /* El nombre DNS del NLB interno. Ver la nota de backend.tf sobre por qué
         aquí no hay una IP fija. */
      GATEWAY_URL = "http://${aws_lb.gateway.dns_name}:3000"
    }

    /* Solo el que firma la cookie: el rol de esta máquina no puede leer más. */
    secretos = {
      JWT_SECRET = "jwt-secret"
    }
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.prefijo}-frontend" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${var.prefijo}-frontend" }
  }

  update_default_version = true

  depends_on = [aws_secretsmanager_secret_version.versiones]
}

# ─────────────────────── balanceador público ───────────────────────

locals {
  con_dominio = var.dominio != ""
  con_route53 = local.con_dominio && var.zona_route53_id != ""

  /* Con dominio propio se cubren el pelado y el `www`: la gente teclea el
     segundo por costumbre, y sin él se lleva un error de DNS en vez de una
     redirección. Es lo que hacía la pila de GCP. */
  dominios = local.con_dominio ? [var.dominio, "www.${var.dominio}"] : []
}

resource "aws_lb" "publico" {
  name               = "${var.prefijo}-publico"
  load_balancer_type = "application"
  internal           = false
  subnets            = aws_subnet.publica[*].id
  security_groups    = [aws_security_group.alb.id]

  /**
   * Los avisos en vivo van por un flujo SSE que se mantiene abierto mientras la
   * pestaña lo esté. **En AWS esto es un tiempo de inactividad, no una duración
   * máxima** (en GCP eran 1800 s de duración total, y por eso allí había que
   * subirlo tanto). El gateway manda un latido cada 25 s, que cuenta como
   * actividad, así que bastaría el valor por defecto de 60 s. Se dejan 120 por
   * si un latido se retrasa: el balanceador cortaría el flujo y, aunque
   * `EventSource` reconecta solo, en el hueco se pierde un aviso sin que nadie
   * se entere.
   */
  idle_timeout = 120

  /* Una cabecera malformada se descarta en vez de reenviarse a la aplicación:
     cierra una familia de ataques de contrabando de peticiones (HTTP request
     smuggling) por la que se salta el guard. */
  drop_invalid_header_fields = true

  enable_deletion_protection = false
}

resource "aws_lb_target_group" "frontend" {
  name        = "${var.prefijo}-frontend"
  vpc_id      = aws_vpc.vpc.id
  protocol    = "HTTP"
  port        = 4100
  target_type = "instance"

  deregistration_delay = 60

  /**
   * La landing pública sirve de health check: responde 200 sin sesión, que es
   * exactamente lo que hay que comprobar. Cualquier ruta privada devolvería 307
   * hacia el login y el balanceador lo leería como «enferma».
   */
  health_check {
    protocol            = "HTTP"
    port                = "4100"
    path                = "/"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }
}

# ───────────────────────── certificado y DNS ─────────────────────────

/**
 * ⚠️ **ACM solo emite certificados para un dominio que controlas.** La pila de GCP
 * usa sslip.io para tener HTTPS sin comprar nada; aquí no funciona: ACM valida
 * la propiedad por DNS (o correo) y no hay forma de poner un registro en el
 * dominio de otro.
 *
 * Sin `dominio` no se crea nada de esto y el ALB sirve solo por HTTP. Eso sirve
 * para demostrar que la infraestructura responde, **pero no para usar la
 * aplicación**: la cookie de sesión es `Secure` en producción y el navegador no
 * la manda por HTTP, así que el login no se mantiene. Ver el README.
 */
resource "aws_acm_certificate" "sitio" {
  count = local.con_dominio ? 1 : 0

  domain_name               = local.dominios[0]
  subject_alternative_names = slice(local.dominios, 1, length(local.dominios))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

/* Con la zona en Route 53, el registro de validación lo crea Terraform. Sin
   ella, hay que crearlo a mano en el proveedor de DNS (README). */
resource "aws_route53_record" "validacion" {
  for_each = local.con_route53 ? {
    for o in aws_acm_certificate.sitio[0].domain_validation_options : o.domain_name => {
      nombre = o.resource_record_name
      tipo   = o.resource_record_type
      valor  = o.resource_record_value
    }
  } : {}

  zone_id         = var.zona_route53_id
  name            = each.value.nombre
  type            = each.value.tipo
  records         = [each.value.valor]
  ttl             = 60
  allow_overwrite = true
}

/**
 * ⚠️ Este recurso BLOQUEA el `apply` hasta que ACM ve el registro de validación
 * (hasta 75 minutos). Con Route 53 es cuestión de uno o dos minutos. Con DNS en
 * otro proveedor, el `apply` completo se queda aquí esperando algo que Terraform
 * no puede hacer: por eso el README manda aplicar primero solo el certificado
 * (`-target`), crear el CNAME a mano y luego aplicar el resto.
 */
resource "aws_acm_certificate_validation" "sitio" {
  count = local.con_dominio ? 1 : 0

  certificate_arn         = aws_acm_certificate.sitio[0].arn
  validation_record_fqdns = local.con_route53 ? [for r in aws_route53_record.validacion : r.fqdn] : null
}

resource "aws_route53_record" "sitio" {
  for_each = local.con_route53 ? toset(local.dominios) : toset([])

  zone_id = var.zona_route53_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.publico.dns_name
    zone_id                = aws_lb.publico.zone_id
    evaluate_target_health = true
  }
}

# ─────────────────────────── escuchas ───────────────────────────

/**
 * Con dominio: el 443 sirve y el 80 redirige con un 301. No es cosmético: la
 * cookie de sesión es `Secure`, así que quien llegue por http:// y se quede ahí
 * entra en un bucle de login que no explica nada.
 */
resource "aws_lb_listener" "https" {
  count = local.con_dominio ? 1 : 0

  load_balancer_arn = aws_lb.publico.arn
  protocol          = "HTTPS"
  port              = 443

  /* TLS 1.2 y 1.3, sin los cifrados débiles de las políticas antiguas. */
  ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn = aws_acm_certificate_validation.sitio[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.publico.arn
  protocol          = "HTTP"
  port              = 80

  /* Sin dominio no hay certificado y esta escucha sirve la aplicación (modo
     demostración, sin login). Con dominio, redirige. */
  dynamic "default_action" {
    for_each = local.con_dominio ? [1] : []
    content {
      type = "redirect"
      redirect {
        protocol    = "HTTPS"
        port        = "443"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = local.con_dominio ? [] : [1]
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.frontend.arn
    }
  }
}

# ─────────────────────── grupo de autoescalado ───────────────────────

resource "aws_autoscaling_group" "frontend" {
  name                = "${var.prefijo}-frontend"
  vpc_zone_identifier = aws_subnet.privada[*].id
  min_size            = var.minimo_instancias
  max_size            = var.maximo_instancias
  desired_capacity    = var.minimo_instancias

  target_group_arns = [aws_lb_target_group.frontend.arn]

  /* Mismo razonamiento que en backend.tf: `ELB` para que cuente la comprobación
     del balanceador, y 420 s de gracia para que el autocurado no mate la
     máquina antes de que termine de arrancar. */
  health_check_type         = "ELB"
  health_check_grace_period = 420
  default_instance_warmup   = 300

  /**
   * 0 = no esperar a que las máquinas estén sanas para dar el apply por bueno.
   *
   * ⚠️ En el primer apply los repositorios de ECR se crean vacíos: no hay imagen
   * que bajar hasta que el CI (o tú) la suba, y esperar a que el grupo llegue a
   * sano haría fallar el apply a los 10 minutos con un tiempo agotado que culpa
   * al grupo. Mientras no haya imagen, el servicio reintenta cada 10 s y el
   * autocurado sustituye la máquina cada ~7 min; todo se asienta solo cuando la
   * imagen aparece. El README propone un orden que lo evita del todo.
   */
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.frontend.id
    version = aws_launch_template.frontend.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 200
      instance_warmup        = 300
    }
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }

  tag {
    key                 = "Name"
    value               = "${var.prefijo}-frontend"
    propagate_at_launch = true
  }

  /* Sin salida a internet las máquinas no pueden ni instalar Docker: el script
     de arranque moriría en la primera línea y el grupo las sustituiría en bucle.
     Las tablas de rutas privadas apuntan al NAT, pero Terraform no lo ve como
     dependencia de un grupo, solo de las subredes. */
  depends_on = [
    aws_lb_listener.http,
    aws_nat_gateway.nat,
    aws_route_table_association.privada,
  ]
}

resource "aws_autoscaling_policy" "frontend_cpu" {
  name                   = "${var.prefijo}-frontend-cpu"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    target_value = var.objetivo_cpu

    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
  }
}
