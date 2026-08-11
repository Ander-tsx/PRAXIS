/**
 * El frontend: grupo con autoescalado detrás del balanceador externo HTTPS.
 *
 * Esta es la única puerta pública de todo el sistema.
 *
 * Cada máquina corre las 6 apps Next. El shell escucha en el 4100 y reescribe
 * hacia las zonas por 127.0.0.1, así que cada máquina se basta sola y escalar
 * es sumar copias idénticas.
 */

# ─────────────────────── plantilla de máquina ───────────────────────

resource "google_compute_instance_template" "frontend" {
  name_prefix  = "${var.prefijo}-frontend-"
  machine_type = var.tipo_maquina_frontend
  region       = var.region
  tags         = ["praxis-frontend"]

  disk {
    source_image = "projects/cos-cloud/global/images/family/cos-stable"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-balanced"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subred.id
    /* Tampoco tiene IP pública: el tráfico entra por el balanceador, que es un
       recurso de Google y no necesita que la máquina esté expuesta. */
  }

  service_account {
    email  = google_service_account.maquinas.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    google-logging-enabled = "true"

    user-data = templatefile("${path.module}/plantillas/arranque-frontend.yaml", {
      proyecto     = var.proyecto
      prefijo      = var.prefijo
      region       = var.region
      imagen       = local.imagen_frontend
      gateway_host = google_compute_address.gateway.address
    })
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ─────────────────────── comprobaciones de salud ───────────────────────

/**
 * La landing pública del shell sirve de health check: responde 200 sin sesión,
 * que es exactamente lo que hay que comprobar.
 *
 * Cualquier ruta privada devolvería 307 hacia el login y el balanceador leería
 * ese redirect como "enferma".
 */
resource "google_compute_health_check" "frontend" {
  name = "${var.prefijo}-frontend-hc"

  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 4100
    request_path = "/"
  }
}

resource "google_compute_health_check" "frontend_autocurado" {
  name = "${var.prefijo}-frontend-hc-autocurado"

  check_interval_sec  = 30
  timeout_sec         = 10
  healthy_threshold   = 2
  unhealthy_threshold = 4

  http_health_check {
    port         = 4100
    request_path = "/"
  }
}

# ─────────────────────── grupo de instancias ───────────────────────

resource "google_compute_region_instance_group_manager" "frontend" {
  /* La región va en el nombre por lo mismo que en el grupo del backend: el
     balanceador que apunta aquí se actualiza en sitio y solo cambia de destino
     cuando el grupo nuevo existe. Explicación completa en backend.tf. */
  name               = "${var.prefijo}-frontend-${var.region}"
  region             = var.region
  base_instance_name = "${var.prefijo}-frontend"

  version {
    instance_template = google_compute_instance_template.frontend.id
  }

  /* El nombre `http` es el que busca el backend service del balanceador. Si no
     coincide, el balanceador no encuentra a dónde mandar y responde 502. */
  named_port {
    name = "http"
    port = 4100
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.frontend_autocurado.id
    initial_delay_sec = 420
  }

  update_policy {
    type                  = "PROACTIVE"
    minimal_action        = "REPLACE"
    max_surge_fixed       = 3
    max_unavailable_fixed = 0
  }

  lifecycle {
    ignore_changes        = [target_size]
    create_before_destroy = true
  }
}

resource "google_compute_region_autoscaler" "frontend" {
  name   = "${var.prefijo}-frontend-autoescalado"
  region = var.region
  target = google_compute_region_instance_group_manager.frontend.id

  autoscaling_policy {
    min_replicas    = var.minimo_instancias
    max_replicas    = var.maximo_instancias
    cooldown_period = 300

    cpu_utilization {
      target = var.objetivo_cpu
    }
  }
}

# ─────────────────────── balanceador externo ───────────────────────

/**
 * La IP pública. Se reserva como recurso propio para que sobreviva a recrear el
 * balanceador — si cambiara, cambiaría también el dominio sslip.io y el
 * certificado habría que volver a emitirlo.
 */
resource "google_compute_global_address" "frontend" {
  name = "${var.prefijo}-ip-publica"
}

locals {
  /**
   * sslip.io es un DNS público que resuelve cualquier nombre con una IP dentro
   * a esa misma IP: `34-8-1-2.sslip.io` → 34.8.1.2. No hay que registrar nada.
   *
   * Sirve para tener HTTPS de verdad sin comprar dominio: como el nombre
   * resuelve públicamente, Google puede validarlo y emitir un certificado
   * gestionado. Con una IP pelada no se puede — no existe autoridad que firme
   * un certificado para una dirección IP.
   */
  dominio = var.dominio != "" ? var.dominio : "${replace(google_compute_global_address.frontend.address, ".", "-")}.sslip.io"
}

/**
 * ⚠️ Emitir este certificado tarda entre 15 y 60 minutos. Durante ese rato el
 * sitio responde con un error de certificado y todo parece roto. Es normal: el
 * estado se sigue con
 *   gcloud compute ssl-certificates describe praxis-cert --global
 * y hay que esperar a que ponga ACTIVE.
 *
 * Google solo lo emite si el dominio ya resuelve a la IP del balanceador. Con
 * sslip.io eso es cierto desde el primer segundo, que es la gracia.
 */
resource "google_compute_managed_ssl_certificate" "frontend" {
  name = "${var.prefijo}-cert"

  managed {
    domains = [local.dominio]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_backend_service" "frontend" {
  name                  = "${var.prefijo}-frontend-servicio"
  protocol              = "HTTP"
  port_name             = "http"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  timeout_sec           = 60
  health_checks         = [google_compute_health_check.frontend.id]

  backend {
    group           = google_compute_region_instance_group_manager.frontend.instance_group
    balancing_mode  = "UTILIZATION"
    capacity_scaler = 1.0
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "frontend" {
  name = "${var.prefijo}-url-map"

  /* Todo al shell, sin excepciones. Es él quien decide qué sirve cada ruta
     mediante sus `rewrites()` —incluidas las de voz, que reenvía al gateway—.
     Replicar ese mapa aquí sería mantenerlo en dos sitios que acabarían
     desincronizados.

     ⚠️ Se intentó mandar `/api/alexa/*` directo al grupo del backend desde
     aquí, y Google lo rechaza: ese grupo ya sirve al balanceador interno, que
     al ser de paso usa `balancing_mode = CONNECTION`, y un balanceador de
     aplicación exige `UTILIZATION`. Un mismo grupo no puede tener dos modos:
       backends have incompatible balancing_mode
     Igualarlos obligaría a cambiar el balanceador interno por uno de
     aplicación, con su subred de proxies y sus reglas de cortafuegos nuevas.
     El rewrite del shell resuelve lo mismo sin nada de eso, y además mantiene
     cierto que el backend no tiene ninguna ruta pública propia. */
  default_service = google_compute_backend_service.frontend.id
}

resource "google_compute_target_https_proxy" "frontend" {
  name             = "${var.prefijo}-https-proxy"
  url_map          = google_compute_url_map.frontend.id
  ssl_certificates = [google_compute_managed_ssl_certificate.frontend.id]
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${var.prefijo}-https"
  target                = google_compute_target_https_proxy.frontend.id
  ip_address            = google_compute_global_address.frontend.id
  port_range            = "443"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# ─────────────────────── redirección de HTTP a HTTPS ───────────────────────

/**
 * Todo lo que entre por el puerto 80 se manda a HTTPS con un 301.
 *
 * No es solo cosmético. La cookie de sesión se marca `Secure` en producción, lo
 * que significa que el navegador NO la manda por HTTP: sin esta redirección,
 * quien llegue por http:// se queda en un bucle de login que no explica nada.
 */
resource "google_compute_url_map" "redireccion" {
  name = "${var.prefijo}-url-map-redireccion"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redireccion" {
  name    = "${var.prefijo}-http-proxy"
  url_map = google_compute_url_map.redireccion.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${var.prefijo}-http"
  target                = google_compute_target_http_proxy.redireccion.id
  ip_address            = google_compute_global_address.frontend.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
}
