/**
 * El backend: grupo de autoescalado detrás de un balanceador interno.
 *
 * "Interno" significa que su dirección solo existe dentro de la VPC. El gateway
 * no es alcanzable desde internet y no hace falta que lo sea: quien le habla es
 * el servidor de Next del frontend, que ya está dentro.
 *
 * Cada máquina corre una copia completa del backend —el monolito: gateway, ocho
 * servicios y collab en un solo proceso— y no hay estado en el proceso: la sesión
 * es un JWT y lo compartido vive en RDS y Redis. Por eso añadir máquinas es
 * seguro y quitarlas no pierde nada.
 */

locals {
  /* Se parte del tipo de AMI y no de un id: `resolve:ssm` lo traduce al lanzar,
     así que cada máquina nueva sale con el Amazon Linux 2023 parcheado más
     reciente, sin que Terraform tenga que consultar nada para planificar.
     ⚠️ Es lo contrario de reproducible: dos máquinas del mismo grupo pueden
     tener AMIs distintas. Para fijar una, sustituye por un `ami-…`. */
  ami = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"

  url_publica = var.dominio != "" ? "https://${var.dominio}" : "http://${aws_lb.publico.dns_name}"
}

# ─────────────────────── plantilla de lanzamiento ───────────────────────

resource "aws_launch_template" "backend" {
  name_prefix   = "${var.prefijo}-backend-"
  image_id      = local.ami
  instance_type = var.tipo_instancia_backend

  iam_instance_profile {
    name = aws_iam_instance_profile.backend.name
  }

  /* Sin IP pública, y solo el grupo de seguridad del backend. Las dos cosas van
     en el bloque de red porque, si se declaran fuera, AWS rechaza mezclar
     `vpc_security_group_ids` con una interfaz definida. */
  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.backend.id]
    delete_on_termination       = true
  }

  /**
   * IMDSv2 obligatorio. La versión 1 del servicio de metadatos se puede explotar
   * con una vulnerabilidad de SSRF para robar las credenciales del rol —es el
   * ataque de la brecha de Capital One—; la 2 exige un token que una petición
   * reenviada por un servidor no tiene. `http_put_response_hop_limit = 1` impide
   * además que lo alcance un contenedor con red propia (aquí usan `--network
   * host`, que no necesita el salto extra).
   */
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
    imagen      = local.imagen_backend
    nombre      = "praxis-backend"
    log_grupo   = aws_cloudwatch_log_group.maquinas["backend"].name
    prefijo     = var.prefijo
    descripcion = "Backend de PRAXIS (monolito)"

    entorno = {
      POSTGRES_HOST = aws_db_instance.postgres.address
      POSTGRES_PORT = "5432"
      POSTGRES_USER = var.usuario_base_datos
      POSTGRES_DB   = var.nombre_base_datos
      REDIS_URL     = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379"

      /* El ID de cliente de OAuth va en claro: es público —Next lo incrusta en
         el JavaScript del navegador— y tratarlo como secreto daría una falsa
         sensación de protección. */
      GOOGLE_CLIENT_ID = var.google_client_id
      MAIL_FROM        = var.mail_from

      /* ⚠️ La base de los enlaces de los correos. Sin ella apuntarían a
         localhost y ninguna confirmación de cuenta funcionaría. */
      PUBLIC_APP_URL = local.url_publica

      /* ⚠️ La URL a la que se conecta el NAVEGADOR para editar documentos en
         tiempo real; el gateway la entrega junto con el billete que firma. El
         gateway no tiene dominio público: el WebSocket entra por el mismo
         origen que la página y lo reenvía el servidor del frontend
         (`apps/frontend/web/server.mjs`, `/api/collab` → gateway → collab). Con
         HTTPS tiene que ser `wss://`, porque un navegador bloquea `ws://`
         desde una página segura. Sin dominio (solo HTTP) es `ws://` contra el
         ALB. Mismo criterio que en docs/deploy/RAILWAY.md. */
      COLLAB_PUBLIC_URL = var.dominio != "" ? "wss://${var.dominio}/api/collab" : "ws://${aws_lb.publico.dns_name}/api/collab"

      /* El bucket de S3 existe (storage.tf) pero el backend no tiene driver
         para él: se queda en Postgres. Ver el comentario de storage.tf. */
      STORAGE_DRIVER = "postgres"
      LOG_LEVEL      = "info"
    }

    secretos = {
      POSTGRES_PASSWORD     = "password-sql"
      JWT_SECRET            = "jwt-secret"
      VOICE_JWT_SECRET      = "voice-jwt-secret"
      GEMINI_API_KEY        = "gemini-api-key"
      MAIL_API_KEY          = "mail-api-key"
      STRIPE_SECRET_KEY     = "stripe-secret-key"
      STRIPE_PRICE_PRO      = "stripe-price-pro"
      STRIPE_PRICE_PLUS     = "stripe-price-plus"
      STRIPE_PRICE_TEAM     = "stripe-price-team"
      STRIPE_PRICE_BUSINESS = "stripe-price-business"
      STRIPE_WEBHOOK_SECRET = "stripe-webhook-secret"
    }
  }))

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.prefijo}-backend" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${var.prefijo}-backend" }
  }

  update_default_version = true

  /* Las máquinas necesitan RDS, Redis y los secretos listos para arrancar:
     el script falla en el primer acceso si no existen aún. Terraform ya lo
     ordena por las referencias de arriba; esto lo hace explícito para el
     secreto, que el script lee por nombre y Terraform no ve como dependencia. */
  depends_on = [aws_secretsmanager_secret_version.versiones]
}

# ─────────────────────── balanceador interno ───────────────────────

/**
 * NLB interno: el equivalente del balanceador de paso (passthrough) de GCP. No
 * termina la conexión, solo reparte; es el más barato y aquí no hace falta más,
 * porque quien habla con él es otro servidor nuestro y no hay TLS que gestionar.
 *
 * ⚠️ **No tiene IP fija reservada**, a diferencia de GCP. Allí se reservaba una
 * dirección para que el frontend apuntara a algo estable. Aquí lo estable es el
 * **nombre DNS** del NLB, que no cambia mientras el balanceador exista, y es lo
 * que se le pasa al frontend como GATEWAY_URL. Si se recrea el balanceador, el
 * nombre cambia y hay que reemplazar las máquinas del frontend — el mismo
 * motivo por el que en GCP se reservaba la IP.
 */
resource "aws_lb" "gateway" {
  name               = "${var.prefijo}-gateway"
  load_balancer_type = "network"
  internal           = true
  subnets            = aws_subnet.privada[*].id
  security_groups    = [aws_security_group.gateway_lb.id]

  /* Sin esto, cada NLB solo reparte entre los destinos de su propia zona: con
     una sola máquina en el grupo, la mitad del tráfico no encontraría a dónde ir. */
  enable_cross_zone_load_balancing = true

  /* Apagado a propósito: con protección, `terraform destroy` de una prueba
     falla a mitad. Una pila que se desmonta a diario necesita poder borrarse. */
  enable_deletion_protection = false
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.prefijo}-backend"
  vpc_id      = aws_vpc.vpc.id
  protocol    = "TCP"
  port        = 3000
  target_type = "instance"

  /* Cuánto espera a que terminen las conexiones en curso antes de quitar una
     máquina. Los 300 s por defecto alargan cada despliegue sin necesidad. */
  deregistration_delay = 60

  /**
   * ⚠️ La ruta es `/api`, no `/`: el gateway monta un prefijo global (`api`), así
   * que `/` responde 404 y el grupo entero se vería enfermo con todo
   * perfectamente levantado. Igual que en GCP.
   *
   * ⚠️ Un NLB obliga a que los umbrales sano y no sano sean IGUALES, y no deja
   * fijar el tiempo de espera. GCP tenía dos comprobaciones distintas, una para
   * quitar tráfico (rápida) y otra para destruir la máquina (tolerante). Aquí
   * es una sola, y se queda en el término medio: 3 fallos de 30 s, ~90 s, lo
   * bastante tolerante para que un pico de latencia no cueste un reinicio.
   */
  health_check {
    protocol            = "HTTP"
    port                = "3000"
    path                = "/api"
    interval            = 30
    healthy_threshold   = 3
    unhealthy_threshold = 3
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "gateway" {
  load_balancer_arn = aws_lb.gateway.arn
  protocol          = "TCP"
  port              = 3000

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# ─────────────────────── grupo de autoescalado ───────────────────────

resource "aws_autoscaling_group" "backend" {
  name                = "${var.prefijo}-backend"
  vpc_zone_identifier = aws_subnet.privada[*].id
  min_size            = var.minimo_instancias
  max_size            = var.maximo_instancias
  desired_capacity    = var.minimo_instancias

  target_group_arns = [aws_lb_target_group.backend.arn]

  /**
   * ⚠️ `ELB`, no el `EC2` por defecto. Con `EC2` el grupo solo sustituye una
   * máquina cuando AWS dice que la instancia murió; una máquina que está viva
   * pero cuyo backend no responde seguiría ahí para siempre. Con `ELB`, la
   * comprobación del balanceador también cuenta, y es lo que da el
   * *autocurado* de los grupos de instancias de GCP.
   */
  health_check_type = "ELB"

  /**
   * ⚠️ Este número importa mucho. Arrancar una máquina implica instalar Docker,
   * bajar ~550 MB de imagen y levantar el monolito: 3-5 minutos. Si el margen es
   * menor, el autocurado mata la máquina antes de que llegue a estar lista, crea
   * otra, y entra en un bucle de destrucción que parece un fallo de la
   * aplicación. 420 s (7 min) dejan holgura, el mismo valor que en GCP.
   */
  health_check_grace_period = 420

  /* Tiempo que se ignoran las métricas de una máquina recién creada: durante el
     arranque la CPU se dispara bajando la imagen, y sin este margen ese pico
     dispara otra máquina, que dispara otra. */
  default_instance_warmup = 300

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
    id      = aws_launch_template.backend.id
    version = aws_launch_template.backend.latest_version
  }

  /**
   * Reemplazo continuo al cambiar la plantilla: el equivalente del
   * `update_policy` PROACTIVE de GCP. Con `min_healthy_percentage = 100` y
   * `max_healthy_percentage = 200` se levanta la nueva ANTES de retirar la
   * vieja (como `max_unavailable = 0`): un despliegue no es un minuto de 502.
   *
   * ⚠️ Esto reacciona a cambios de la PLANTILLA, no a una imagen nueva en ECR con
   * la misma etiqueta `latest`: para eso, `aws autoscaling start-instance-refresh`
   * (README), igual que el `rolling-action replace` de infra/ci/.
   */
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 200
      instance_warmup        = 300
    }
  }

  lifecycle {
    /* El autoescalado manda sobre el número de máquinas. Declararlo aquí
       además haría que Terraform y la política se peleen en cada plan. */
    ignore_changes = [desired_capacity]
  }

  tag {
    key                 = "Name"
    value               = "${var.prefijo}-backend"
    propagate_at_launch = true
  }

  /* Sin salida a internet las máquinas no pueden ni instalar Docker: el script
     de arranque moriría en la primera línea y el grupo las sustituiría en bucle.
     Las tablas de rutas privadas apuntan al NAT, pero Terraform no lo ve como
     dependencia de un grupo, solo de las subredes. */
  depends_on = [
    aws_lb_listener.gateway,
    aws_nat_gateway.nat,
    aws_route_table_association.privada,
  ]
}

resource "aws_autoscaling_policy" "backend_cpu" {
  name                   = "${var.prefijo}-backend-cpu"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    target_value = var.objetivo_cpu

    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
  }
}
