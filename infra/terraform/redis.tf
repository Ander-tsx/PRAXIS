/**
 * Redis en su propia máquina.
 *
 * Se usa para caché (reports-service) y para los límites de intentos del login
 * y del canje por voz. Nada de eso es permanente: si Redis se reinicia, la
 * caché se vuelve a llenar sola.
 *
 * ¿Por qué una VM y no Memorystore? Memorystore parte de ~35 USD/mes por el
 * nivel más pequeño. Una e2-micro hace lo mismo por ~7 y aquí no hay ningún
 * requisito de disponibilidad que justifique la diferencia.
 *
 * ⚠️ Redis NO pide contraseña. Su seguridad es enteramente la regla de
 * cortafuegos `praxis-permitir-backend-redis`: solo las máquinas etiquetadas
 * como backend llegan al 6379, y la VM no tiene IP pública. Si alguna vez se le
 * pone IP pública, hay que ponerle `requirepass` en el mismo movimiento.
 */

resource "google_compute_address" "redis" {
  name         = "${var.prefijo}-redis-ip"
  subnetwork   = google_compute_subnetwork.subred.id
  address_type = "INTERNAL"
  region       = var.region
}

resource "google_compute_instance" "redis" {
  name         = "${var.prefijo}-redis"
  machine_type = var.tipo_maquina_redis
  zone         = var.zona
  tags         = ["praxis-redis"]

  boot_disk {
    initialize_params {
      image = "projects/cos-cloud/global/images/family/cos-stable"
      size  = 10
      type  = "pd-standard"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subred.id
    network_ip = google_compute_address.redis.address
    /* Sin bloque access_config: la máquina no tiene IP pública. */
  }

  service_account {
    email  = google_service_account.maquinas.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    google-logging-enabled = "true"

    /* ⚠️ Mismo problema que en las otras dos máquinas: Container-Optimized OS
       descarta por defecto todo lo que no sea SSH, ICMP o loopback, así que el
       6379 no se alcanza aunque la regla de VPC lo permita. El backend se
       quedaría sin caché y sin límites de intentos, fallando de formas raras
       en vez de con un error claro.

       Aquí va como startup-script porque esta VM usa `gce-container-declaration`
       y no cloud-init. Quien filtra por origen sigue siendo la VPC. */
    startup-script = <<-EOT
      #!/bin/bash
      iptables -w -I INPUT 1 -p tcp --dport 6379 -s ${var.rango_subred} -j ACCEPT
    EOT

    /* La imagen oficial de Redis se copia a nuestro Artifact Registry en el
       paso de despliegue. Bajarla de Docker Hub exigiría salida a internet
       (Cloud NAT, ~32 USD/mes); desde nuestro registro basta con el Acceso
       Privado a Google que ya tiene la subred. */
    gce-container-declaration = yamlencode({
      spec = {
        containers = [{
          name  = "redis"
          image = "${local.registro}/redis:7-alpine"
          args = [
            "redis-server",
            /* Solo caché: si se llena, tira lo menos usado en vez de empezar a
               responder errores de escritura. */
            "--maxmemory", "512mb",
            "--maxmemory-policy", "allkeys-lru",
            /* Sin persistencia. Nada de lo que guarda merece un disco, y sin
               volcados la e2-micro no sufre picos de memoria al hacer fork. */
            "--save", "",
            "--appendonly", "no",
          ]
          stdin = false
          tty   = false
        }]
        restartPolicy = "Always"
      }
    })
  }

  allow_stopping_for_update = true
}
