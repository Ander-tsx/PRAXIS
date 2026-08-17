/**
 * PostgreSQL gestionado (Cloud SQL).
 *
 * Una sola instancia con una base (`praxis`) y un schema por microservicio,
 * igual que en desarrollo. Cada servicio recibe su propia cadena de conexión
 * con `?schema=<el suyo>`, y los schemas los crean las migraciones de Prisma:
 * los seis `schema.prisma` declaran el suyo en el bloque `datasource`, así que
 * `prisma migrate deploy` los crea si no existen.
 *
 * Sin IP pública: solo se llega desde la VPC por el peering de network.tf. Eso
 * la deja fuera del alcance de cualquier barrido de internet.
 */

/**
 * Sufijo aleatorio del nombre de la instancia. Resuelve dos problemas distintos
 * que se manifiestan igual —un apply colgado para siempre— y que ya nos costaron
 * 47 minutos de espera a algo imposible.
 *
 * 1. **Los nombres de Cloud SQL son únicos por PROYECTO, no por región.** Al
 *    mover la instancia de región hay que reemplazarla, y Terraform propaga
 *    `create_before_destroy` **hacia arriba** por el grafo de dependencias: como
 *    la plantilla de máquina lee la IP privada de esta instancia, hereda el
 *    modo de los grupos que sí lo declaran. Con el nombre fijo, eso significa
 *    crear una segunda `praxis-postgres` mientras vive la primera — imposible,
 *    y el proveedor se queda esperando sin decir por qué.
 *
 * 2. **Un nombre borrado no se puede reutilizar hasta pasados ~7 días.** Sin
 *    sufijo, destruir y recrear el entorno el mismo día falla con un
 *    «instance name is not available» que no explica que es cuestión de tiempo.
 *
 * `keepers` ata el sufijo a la región: mientras no cambie, el nombre es estable
 * y la instancia no se recrea sola en cada apply.
 */
resource "random_id" "sufijo_sql" {
  byte_length = 3

  keepers = {
    region = var.region
  }
}

resource "google_sql_database_instance" "postgres" {
  name             = "${var.prefijo}-postgres-${random_id.sufijo_sql.hex}"
  database_version = "POSTGRES_16"
  region           = var.region

  /* Con true, un `terraform destroy` NO borra la base. Es lo que separa una
     equivocación de una pérdida de datos irreversible. */
  deletion_protection = var.borrado_protegido_sql

  depends_on = [google_service_networking_connection.peering_sql]

  /**
   * ⚠️ Crear una instancia con IP privada tardó aquí más que la espera por
   * defecto del proveedor, y el fallo es de los malos: Terraform aborta con un
   * mensaje **vacío** («Error waiting for Create Instance: ») mientras Google
   * sigue creándola por su cuenta. Resultado: la instancia existe y el estado
   * no la conoce, así que el siguiente apply intenta crearla otra vez y choca
   * con un «already exists» que tampoco explica nada.
   *
   * Si vuelve a pasar, no la borres: se recupera con
   *   terraform import google_sql_database_instance.postgres <proyecto>/<nombre>
   */
  timeouts {
    create = "60m"
    update = "40m"
    delete = "40m"
  }

  settings {
    tier = var.tipo_maquina_sql

    /* ⚠️ Hay que decirlo explícitamente. Sin esta línea la instancia nace como
       ENTERPRISE_PLUS, que **no admite** los niveles de núcleo compartido, y la
       creación muere con:

         Invalid Tier (db-f1-micro) for (ENTERPRISE_PLUS) Edition

       El mensaje culpa al tier, pero lo que sobra es la edición. ENTERPRISE es
       la normal y la única que deja usar db-f1-micro. */
    edition = "ENTERPRISE"

    /* ZONAL, no REGIONAL: los niveles compartidos (f1/g1) no admiten alta
       disponibilidad, y activarla obligaría a subir de nivel y de precio. */
    availability_type = "ZONAL"

    disk_size       = 10
    disk_type       = "PD_HDD" # Suficiente para este volumen y más barato que SSD
    disk_autoresize = true

    ip_configuration {
      /* Lo importante: sin IP pública. */
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "07:00" # UTC ≈ 01:00 en el centro de México
      point_in_time_recovery_enabled = false   # Requiere nivel superior a f1-micro
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day          = 7 # domingo
      hour         = 8 # UTC
      update_track = "stable"
    }

    /**
     * ⚠️ **El techo de conexiones, y por qué 150 y no el que viene.**
     *
     * `db-f1-micro` nace con `max_connections = 25`. Al otro lado hay seis
     * servicios con Prisma, y `PrismaPg` envuelve un `pg.Pool` cuyo `max` por
     * defecto es 10: sesenta conexiones por instancia del backend, y el grupo
     * escala hasta tres, o sea hasta ciento ochenta contra un límite de
     * veinticinco.
     *
     * Pasado ese punto Postgres rechaza con «remaining connection slots are
     * reserved» y el pool encola las consultas hasta agotar su espera. En la
     * pantalla eso no se lee como un error de base de datos: se lee como que la
     * aplicación va lenta, se traba y pierde la conexión.
     *
     * ⚠️ **Esta línea sola no arregla nada.** La otra mitad es acotar los pools
     * (`DATABASE_POOL_MAX`, cinco por servicio → treinta por instancia, noventa
     * con el grupo al máximo). Subir el límite sin acotar los pools solo mueve
     * el problema más arriba; acotarlos sin subirlo deja el sistema sin margen
     * para escalar.
     *
     * 150 sale de 90 más holgura para migraciones, `psql` y los reinicios
     * solapados durante un despliegue. En una instancia de 0,6 GB cada conexión
     * ociosa cuesta unos pocos megabytes, así que 150 es el techo razonable —no
     * un número al que se deba llegar.
     */
    database_flags {
      name  = "max_connections"
      value = "150"
    }

    /* Deja rastro de las consultas lentas. Sale gratis y es lo primero que se
       mira cuando una pantalla tarda y nadie sabe por qué. */
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = false
      record_client_address   = false
    }
  }
}

resource "google_sql_database" "praxis" {
  name     = var.nombre_base_datos
  instance = google_sql_database_instance.postgres.name

  /* Las mismas que usa el Postgres de desarrollo, para que los datos exportados
     de un lado entren en el otro sin sorpresas de ordenación. */
  charset   = "UTF8"
  collation = "en_US.UTF8"
}

resource "google_sql_user" "praxis" {
  name     = var.usuario_base_datos
  instance = google_sql_database_instance.postgres.name
  password = random_password.password_sql.result
}
