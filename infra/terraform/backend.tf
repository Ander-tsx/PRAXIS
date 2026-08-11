/**
 * El backend: grupo de instancias con autoescalado detrás de un balanceador
 * interno.
 *
 * "Interno" significa que su IP solo existe dentro de la VPC. El gateway no es
 * alcanzable desde internet ni aunque alguien acierte la dirección, y no hace
 * falta que lo sea: quien le habla es el servidor de Next del frontend, que ya
 * está dentro de la red.
 *
 * Cada máquina del grupo corre una copia completa del backend —el gateway y
 * los 7 microservicios— y se los habla por loopback. No hay estado en el
 * proceso: la sesión es un JWT firmado y lo compartido vive en Postgres y
 * Redis. Por eso añadir máquinas es seguro y quitarlas no pierde nada.
 */

# ─────────────────────── plantilla de máquina ───────────────────────

resource "google_compute_instance_template" "backend" {
  name_prefix  = "${var.prefijo}-backend-"
  machine_type = var.tipo_maquina_backend
  region       = var.region
  tags         = ["praxis-backend"]

  disk {
    source_image = "projects/cos-cloud/global/images/family/cos-stable"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-balanced"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subred.id
    /* Sin access_config: ninguna máquina del backend tiene IP pública. */
  }

  service_account {
    email = google_service_account.maquinas.email
    /* `cloud-platform` deja que el permiso real lo decidan los roles de IAM de
       la cuenta, que es donde está acotado de verdad. Restringir aquí por
       scopes es el mecanismo antiguo y se comporta de forma confusa. */
    scopes = ["cloud-platform"]
  }

  metadata = {
    google-logging-enabled = "true"

    user-data = templatefile("${path.module}/plantillas/arranque-backend.yaml", {
      proyecto    = var.proyecto
      prefijo     = var.prefijo
      region      = var.region
      imagen      = local.imagen_backend
      sql_host    = google_sql_database_instance.postgres.private_ip_address
      sql_usuario  = var.usuario_base_datos
      sql_base     = var.nombre_base_datos
      redis_host   = google_compute_address.redis.address
      rango_subred = var.rango_subred
      /* Se pasa en claro y no por Secret Manager a propósito: el ID de cliente
         de OAuth es público —Next lo incrusta en el JavaScript del navegador—
         así que tratarlo como secreto daría una falsa sensación de protección
         sin añadir ninguna. */
      google_client_id = var.google_client_id
    })
  }

  /* Una plantilla no se puede modificar: cambiarla obliga a crear otra. Con
     esto Terraform crea la nueva antes de soltar la vieja, y el grupo nunca se
     queda sin plantilla a la que apuntar. */
  lifecycle {
    create_before_destroy = true
  }
}

# ─────────────────────── comprobaciones de salud ───────────────────────

/**
 * Dos health checks para el mismo puerto, y no es una duplicación por error:
 * el del balanceador tiene que ser regional y el del autocurado, global. Son
 * tipos de recurso distintos en Google Cloud.
 *
 * ⚠️ La ruta es `/api`, no `/`. El gateway monta un prefijo global (`api`), así
 * que `/` responde 404 y el grupo entero se vería como enfermo con todo
 * perfectamente levantado.
 */
resource "google_compute_region_health_check" "backend_lb" {
  /* El nombre lleva la región por el mismo motivo que el de los grupos: al
     cambiar de región hay que reemplazarlo, y el servicio de backend que lo usa
     solo se actualiza cuando el nuevo ya existe. Ver la nota del grupo. */
  name   = "${var.prefijo}-backend-hc-lb-${var.region}"
  region = var.region

  lifecycle {
    create_before_destroy = true
  }

  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 3000
    request_path = "/api"
  }
}

resource "google_compute_health_check" "backend_autocurado" {
  name = "${var.prefijo}-backend-hc-autocurado"

  /* Más tolerante que el del balanceador a propósito: este NO quita tráfico,
     este DESTRUYE la máquina y crea otra. Un pico de latencia no debe costar un
     reinicio, así que tarda ~2 minutos en decidirse. */
  check_interval_sec  = 30
  timeout_sec         = 10
  healthy_threshold   = 2
  unhealthy_threshold = 4

  http_health_check {
    port         = 3000
    request_path = "/api"
  }
}

# ─────────────────────── grupo de instancias ───────────────────────

resource "google_compute_region_instance_group_manager" "backend" {
  /**
   * ⚠️ El nombre lleva la región, y no es cosmético: es lo que permite cambiar
   * de región sin quedarse atascado.
   *
   * El servicio de backend que apunta a este grupo se **actualiza en sitio**
   * (no se reemplaza), así que solo cambia de destino cuando el grupo nuevo ya
   * existe. Pero un grupo se reemplaza al cambiar de región, y con el mismo
   * nombre el nuevo no puede nacer hasta que muera el viejo — que no puede
   * morir porque el balanceador aún lo referencia. Terraform no sale de ese
   * bucle solo: falla con `resourceInUseByAnotherResource` una vez tras otra.
   *
   * Con la región en el nombre los dos conviven un momento, el balanceador se
   * pasa al nuevo y el viejo se borra ya sin referencias.
   */
  name               = "${var.prefijo}-backend-${var.region}"
  region             = var.region
  base_instance_name = "${var.prefijo}-backend"

  version {
    instance_template = google_compute_instance_template.backend.id
  }

  named_port {
    name = "http"
    port = 3000
  }

  auto_healing_policies {
    health_check = google_compute_health_check.backend_autocurado.id

    /* ⚠️ Este número importa mucho. Arrancar una máquina implica bajar ~550 MB
       de imagen y levantar 8 procesos Node: unos 2-3 minutos. Si el margen es
       menor que eso, el autocurado mata la máquina antes de que llegue a estar
       lista, crea otra, y entra en un bucle de destrucción que parece un fallo
       de la aplicación. 7 minutos deja holgura de sobra. */
    initial_delay_sec = 420
  }

  update_policy {
    type                  = "PROACTIVE"
    minimal_action        = "REPLACE"
    max_surge_fixed       = 3 # En un grupo regional debe ser ≥ nº de zonas
    max_unavailable_fixed = 0 # Nunca bajar de la capacidad actual al desplegar
  }

  lifecycle {
    /* El autoescalador manda sobre el número de instancias. Declararlo aquí
       además provocaría que Terraform y el autoescalador se peleen en cada plan. */
    ignore_changes = [target_size]

    /* Crear el grupo nuevo ANTES de borrar el viejo: es la otra mitad de lo que
       explica el comentario del nombre. Sin esto, el nombre distinto no basta —
       Terraform seguiría borrando primero. */
    create_before_destroy = true
  }
}

resource "google_compute_region_autoscaler" "backend" {
  name   = "${var.prefijo}-backend-autoescalado"
  region = var.region
  target = google_compute_region_instance_group_manager.backend.id

  autoscaling_policy {
    min_replicas = var.minimo_instancias
    max_replicas = var.maximo_instancias

    /* Tiempo que se ignoran las métricas de una máquina recién creada. Durante
       el arranque la CPU se dispara compilando y bajando la imagen; sin este
       margen, ese pico dispara otra máquina, que dispara otra. */
    cooldown_period = 300

    cpu_utilization {
      target = var.objetivo_cpu
    }
  }
}

# ─────────────────────── balanceador interno ───────────────────────

/**
 * IP interna fija para el gateway.
 *
 * Se reserva aparte para que el frontend pueda apuntar a una dirección estable:
 * si la generase el balanceador, cambiaría al recrearlo y habría que reconstruir
 * las máquinas del frontend para que se enterasen.
 */
resource "google_compute_address" "gateway" {
  name         = "${var.prefijo}-gateway-ip"
  subnetwork   = google_compute_subnetwork.subred.id
  address_type = "INTERNAL"
  region       = var.region
}

resource "google_compute_region_backend_service" "backend" {
  name                  = "${var.prefijo}-backend-servicio"
  region                = var.region
  load_balancing_scheme = "INTERNAL"
  protocol              = "TCP"
  health_checks         = [google_compute_region_health_check.backend_lb.id]

  backend {
    group          = google_compute_region_instance_group_manager.backend.instance_group
    balancing_mode = "CONNECTION"
  }
}

/**
 * Balanceador interno de paso (passthrough): no termina la conexión, solo
 * reparte. Es el más barato y aquí no hace falta más — quien habla con él es
 * otro servidor nuestro, no un navegador, así que no hay TLS que gestionar ni
 * cabeceras que reescribir.
 */
resource "google_compute_forwarding_rule" "gateway" {
  name                  = "${var.prefijo}-gateway"
  region                = var.region
  load_balancing_scheme = "INTERNAL"
  backend_service       = google_compute_region_backend_service.backend.id
  ports                 = ["3000"]
  network               = google_compute_network.vpc.id
  subnetwork            = google_compute_subnetwork.subred.id
  ip_address            = google_compute_address.gateway.id
}
