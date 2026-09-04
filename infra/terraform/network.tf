/**
 * La red privada donde vive todo.
 *
 * Idea de fondo: **solo hay una puerta**. El balanceador del frontend es lo
 * único con IP pública; el gateway, la base de datos y Redis no son accesibles
 * desde internet ni por error.
 *
 * Eso es posible porque el navegador nunca habla con el backend: el frontend
 * expone su proxy (`/api/gateway`) y la llamada al gateway sale del servidor de
 * Next, ya dentro de la red privada.
 */

resource "google_compute_network" "vpc" {
  name                    = "${var.prefijo}-vpc"
  auto_create_subnetworks = false
  depends_on              = [time_sleep.apis_listas]
}

resource "google_compute_subnetwork" "subred" {
  name          = "${var.prefijo}-subred"
  ip_cidr_range = var.rango_subred
  region        = var.region
  network       = google_compute_network.vpc.id

  /* Lo que permite prescindir de Cloud NAT: con esto, una VM sin IP pública
     llega igualmente a las APIs de Google (Artifact Registry para bajarse la
     imagen, Secret Manager para los secretos, Cloud Logging para los logs)
     por la red interna. Son ~32 USD/mes de diferencia. */
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# ─────────────────────── salida a internet (opcional) ───────────────────────

resource "google_compute_router" "router" {
  count = var.habilitar_nat ? 1 : 0

  name    = "${var.prefijo}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  count = var.habilitar_nat ? 1 : 0

  name                               = "${var.prefijo}-nat"
  router                             = google_compute_router.router[0].name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ──────────────────────────── cortafuegos ────────────────────────────

/**
 * Los health checks de Google llegan desde estos dos rangos fijos, no desde la
 * IP del balanceador. Sin esta regla, el grupo se ve entero como "no sano", el
 * balanceador no manda tráfico a ninguna máquina y el sitio da 502 con todo
 * correctamente levantado. Es el error más común al montar esto.
 */
resource "google_compute_firewall" "health_checks" {
  name    = "${var.prefijo}-permitir-health-checks"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["3000", "4100"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["praxis-backend", "praxis-frontend"]
}

/** El balanceador externo hacia el shell. Mismos rangos de Google. */
resource "google_compute_firewall" "lb_a_frontend" {
  name    = "${var.prefijo}-permitir-lb-frontend"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["4100"]
  }

  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["praxis-frontend"]
}

/**
 * Del frontend al gateway. Por etiquetas y no por rango: si mañana cambia la
 * subred, la regla sigue diciendo lo que quiere decir.
 *
 * Los puertos 3001-3007 de los microservicios NO están aquí a propósito —
 * viven en loopback dentro de su contenedor y nadie más tiene por qué
 * alcanzarlos.
 */
resource "google_compute_firewall" "frontend_a_backend" {
  name    = "${var.prefijo}-permitir-frontend-backend"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["3000"]
  }

  source_tags = ["praxis-frontend"]
  target_tags = ["praxis-backend"]
}

/** Del backend a Redis. Redis no pide contraseña, así que esta regla ES su seguridad. */
resource "google_compute_firewall" "backend_a_redis" {
  name    = "${var.prefijo}-permitir-backend-redis"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["6379"]
  }

  source_tags = ["praxis-backend"]
  target_tags = ["praxis-redis"]
}

/**
 * SSH solo a través de IAP (Identity-Aware Proxy), nunca abierto a internet.
 *
 * Las VMs no tienen IP pública, así que para entrar a depurar se usa
 * `gcloud compute ssh <vm> --tunnel-through-iap`. Ese túnel sale de este rango
 * fijo de Google, y quien lo use necesita además permiso de IAM: no basta con
 * llegar al puerto.
 */
resource "google_compute_firewall" "ssh_por_iap" {
  name    = "${var.prefijo}-permitir-ssh-iap"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["praxis-backend", "praxis-frontend", "praxis-redis"]
}

# ──────────────────── peering para la IP privada de Cloud SQL ────────────────────

/**
 * Cloud SQL con IP privada no vive en tu VPC: vive en una red de Google que se
 * conecta a la tuya por peering. Ese peering necesita que le reserves un rango
 * de tu espacio de direcciones, y es lo que se declara aquí.
 */
resource "google_compute_global_address" "rango_privado_sql" {
  name          = "${var.prefijo}-rango-privado-sql"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "peering_sql" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.rango_privado_sql.name]

  depends_on = [time_sleep.apis_listas]
}
