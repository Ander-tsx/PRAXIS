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
   *
   * ⚠️ Es un apaño para no tener dominio, no un destino. Los cortafuegos
   * corporativos y de campus clasifican sslip.io y nip.io como *dynamic DNS* y
   * los bloquean por categoría: un FortiGate en la red de la UTEZ resuelve el
   * nombre a una IP de bloqueo y firma la respuesta con su propia CA, así que
   * el sitio parece caído aunque el balanceador esté perfecto. Si hay que
   * enseñar el sistema desde una red así, `var.dominio` no es opcional.
   */
  dominio_sslip = "${replace(google_compute_global_address.frontend.address, ".", "-")}.sslip.io"

  /** El nombre que se publica y sale en los outputs. */
  dominio = var.dominio != "" ? var.dominio : local.dominio_sslip

  /**
   * Con dominio propio se cubren el pelado y el `www`: la gente teclea el
   * segundo por costumbre, y sin él se lleva un error de DNS en vez de una
   * redirección.
   *
   * ⚠️ Los dos tienen que tener su registro A hacia la IP del balanceador
   * ANTES de aplicar. Google valida el certificado gestionado dominio por
   * dominio y no emite nada mientras uno solo falle: basta con olvidar el
   * `www` para dejar el certificado entero en un `PROVISIONING` que no caduca
   * ni explica por qué.
   */
  dominios_propios = var.dominio != "" ? [var.dominio, "www.${var.dominio}"] : []
}

/**
 * ⚠️ Emitir este certificado tarda entre 15 y 60 minutos. Durante ese rato el
 * sitio responde con un error de certificado y todo parece roto. Es normal: el
 * estado se sigue con
 *   gcloud compute ssl-certificates list --global
 * y hay que esperar a que ponga ACTIVE.
 *
 * Google solo lo emite si el dominio ya resuelve a la IP del balanceador. Con
 * sslip.io eso es cierto desde el primer segundo, que es la gracia; con dominio
 * propio hay que crear los registros A primero y esperar a que propaguen.
 *
 * ⚠️ Este es el certificado de sslip.io y se deja **exactamente como está**,
 * también cuando ya hay dominio propio. `domains` es inmutable: tocarlo obliga
 * a reemplazar el certificado, y un certificado gestionado nace en
 * `PROVISIONING` hasta una hora. Como el proxy HTTPS solo puede servir lo que
 * tiene atado, sustituir este dejaría el sitio sin HTTPS válido en ninguna URL
 * durante ese rato. El dominio propio se añade aparte, en su propio recurso.
 */
resource "google_compute_managed_ssl_certificate" "frontend" {
  name = "${var.prefijo}-cert"

  managed {
    domains = [local.dominio_sslip]
  }

  lifecycle {
    create_before_destroy = true
  }
}

/**
 * El certificado del dominio propio. Va **junto** al de sslip.io, no en su
 * lugar: el proxy admite varios y elige por SNI, así que el sitio nunca se
 * queda sin certificado válido.
 *
 * El relevo sale gratis. Mientras Google emite este —de 15 a 60 minutos—, quien
 * entre por sslip.io sigue con HTTPS correcto, y quien entre por el dominio
 * nuevo se lleva un aviso de certificado hasta que pase a ACTIVE. En cuanto lo
 * está, las dos URLs funcionan y no hay ventana de caída.
 *
 * ⚠️ El nombre lleva un hash de los dominios, y no es cosmético. Si algún día
 * se cambia el dominio o se añade un subdominio hay que reemplazar el recurso,
 * el proxy lo referencia, y `create_before_destroy` con nombre fijo moriría en
 * `alreadyExists` — el mismo bloqueo que ya costó el cambio de región de los
 * MIGs. Con el hash, el sustituto nace con otro nombre y el relevo se resuelve
 * solo.
 */
resource "google_compute_managed_ssl_certificate" "propio" {
  count = length(local.dominios_propios) > 0 ? 1 : 0

  name = "${var.prefijo}-cert-propio-${substr(sha1(join(",", local.dominios_propios)), 0, 8)}"

  managed {
    domains = local.dominios_propios
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

  /**
   * ⚠️ Media hora, y no es para que una página tarde media hora en cargar.
   *
   * En un balanceador de aplicación de Google esto **no es un tiempo de
   * inactividad**: es lo máximo que puede durar una respuesta entera, se esté
   * enviando o no. Los avisos en vivo van por un flujo SSE que se mantiene
   * abierto mientras la pestaña lo esté, así que con los 60 s de antes el
   * balanceador lo cortaba cada minuto. No se rompía nada —`EventSource`
   * reconecta solo— pero cada corte es una petición nueva, y en el hueco entre
   * una y otra un aviso se pierde sin que nadie se entere.
   *
   * El gateway manda un latido cada 25 s por el mismo motivo, y son cosas
   * distintas: el latido evita que un intermediario cierre por silencio; esto
   * evita que se cierre por veteranía.
   */
  timeout_sec   = 1800
  health_checks = [google_compute_health_check.frontend.id]

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
  name    = "${var.prefijo}-https-proxy"
  url_map = google_compute_url_map.frontend.id

  /**
   * Los dos certificados a la vez: el de sslip.io y, si hay, el del dominio
   * propio. El balanceador elige por SNI según el nombre que pida el navegador.
   * Tenerlos juntos es lo que permite añadir un dominio sin ninguna ventana de
   * caída, y deja sslip.io como red de seguridad si el DNS del registrador
   * falla.
   */
  ssl_certificates = concat(
    [google_compute_managed_ssl_certificate.frontend.id],
    google_compute_managed_ssl_certificate.propio[*].id,
  )
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
