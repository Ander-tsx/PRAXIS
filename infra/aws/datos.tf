/**
 * PostgreSQL (RDS) y Redis (ElastiCache).
 *
 * Una sola instancia con una base (`praxis`) y un schema por servicio, igual que
 * en desarrollo y en GCP. Cada servicio recibe su cadena de conexión con
 * `?schema=<el suyo>` y los schemas los crean las migraciones de Prisma.
 *
 * Sin IP pública: vive en las subredes privadas y solo la alcanza el grupo de
 * seguridad del backend. Eso la deja fuera de cualquier barrido de internet.
 */

# ─────────────────────────────── PostgreSQL ───────────────────────────────

resource "aws_db_subnet_group" "postgres" {
  name       = "${var.prefijo}-postgres"
  subnet_ids = aws_subnet.privada[*].id
  tags       = { Name = "${var.prefijo}-postgres" }
}

/**
 * ⚠️ **El techo de conexiones**, por la misma razón que en GCP (leer el
 * comentario de sql.tf allí): seis servicios con Prisma, cada `pg.Pool` con
 * `max = 10`, y el grupo escala hasta tres máquinas. Con el techo por defecto de
 * una t4g.micro (~110) el pool encola y en pantalla se lee como «la aplicación
 * va lenta», no como un error de base de datos.
 *
 * Esta línea sola no arregla nada: la otra mitad es acotar los pools
 * (`DATABASE_POOL_MAX`) en la imagen. Subir el límite sin acotarlos solo mueve
 * el problema; acotarlos sin subirlo deja sin margen para escalar.
 *
 * `max_connections` es un parámetro estático en RDS: aplica con reinicio. En una
 * instancia nueva da igual; en una existente, `pending-reboot` evita que un
 * `apply` la reinicie por sorpresa.
 */
resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${var.prefijo}-postgres16-"
  family      = "postgres16"
  description = "PRAXIS: techo de conexiones y SSL"

  parameter {
    name         = "max_connections"
    value        = "150"
    apply_method = "pending-reboot"
  }

  /**
   * ⚠️ **SSL obligatorio, y aquí se desactiva a propósito.** Desde PostgreSQL 15
   * RDS trae `rds.force_ssl = 1` por defecto: toda conexión sin TLS se rechaza
   * con «no pg_hba.conf entry … no encryption». La cadena de conexión que
   * arma `start-backend.sh`/`migrar.sh` no lleva `sslmode`, y Prisma con
   * `@prisma/adapter-pg` no negocia TLS si no se le pide, así que el backend no
   * conectaría: los servicios arrancarían y morirían en el primer acceso a la
   * base, con un error que culpa a la contraseña.
   *
   * Es el mismo trato que tiene Cloud SQL en GCP —IP privada, sin TLS dentro de
   * la VPC— y el tráfico no sale de las subredes privadas. Pero es una
   * **debilidad real**: la deuda es añadir `sslmode=require` a las cadenas de
   * conexión de la imagen y volver este valor a 1. Es un cambio de backend,
   * fuera del alcance de esta pila; queda anotado en el README.
   */
  parameter {
    name         = "rds.force_ssl"
    value        = "0"
    apply_method = "pending-reboot"
  }

  lifecycle {
    create_before_destroy = true
  }
}

/* Sufijo para el nombre de la copia final. Un identificador de snapshot no se
   puede repetir, y destruir y recrear el entorno dos veces con protección
   activa chocaría con el de la primera. */
resource "random_id" "sufijo_copia_final" {
  byte_length = 3
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.prefijo}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.clase_rds

  db_name  = var.nombre_base_datos
  username = var.usuario_base_datos
  password = random_password.password_sql.result

  /* gp3 y no el gp2 de siempre: a igual tamaño da 3000 IOPS de base y cuesta
     menos. `max_allocated_storage` es el autoresize de Cloud SQL. */
  storage_type          = "gp3"
  allocated_storage     = var.almacenamiento_rds_gb
  max_allocated_storage = var.almacenamiento_rds_gb * 3
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.base_datos.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = false
  multi_az               = var.rds_multi_az

  backup_retention_period = 7
  backup_window           = "07:00-08:00" # UTC ≈ 01:00 en el centro de México
  maintenance_window      = "sun:08:30-sun:09:30"

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  /* Con protección, `destroy` se niega; sin ella —un entorno de prueba— se
     borra sin copia final, que es lo que se quiere al desmontar. Lo único que
     separa una equivocación de una pérdida de datos irreversible es esta
     variable, y por eso su valor por defecto es true. */
  deletion_protection       = var.borrado_protegido_rds
  skip_final_snapshot       = !var.borrado_protegido_rds
  final_snapshot_identifier = var.borrado_protegido_rds ? "${var.prefijo}-final-${random_id.sufijo_copia_final.hex}" : null

  /* Rastro del servidor en CloudWatch: lo primero que se mira cuando una
     pantalla tarda. Performance Insights, el equivalente de Query Insights, no
     existe en db.t4g.micro; con una clase mayor se puede encender. */
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  depends_on = [aws_cloudwatch_log_group.rds]
}

/* Se declara el grupo de logs de RDS para poder ponerle retención: si lo crea
   RDS por su cuenta, nace sin caducidad y se cobra para siempre. */
resource "aws_cloudwatch_log_group" "rds" {
  for_each = toset(["postgresql", "upgrade"])

  name              = "/aws/rds/instance/${var.prefijo}-postgres/${each.key}"
  retention_in_days = var.retencion_logs_dias
}

# ─────────────────────────────── Redis ───────────────────────────────

/**
 * **ElastiCache, no una EC2 con Redis** (la pila de GCP usa una VM). La razón de
 * GCP era el precio: Memorystore partía de ~35 USD frente a ~7 de una e2-micro.
 * En AWS esa diferencia casi no existe —cache.t4g.micro ronda los 12 USD
 * frente a unos 8 de una t4g.micro con su disco— y a cambio se evita lo que de
 * verdad cuesta de una VM suelta:
 *
 *  - Una EC2 sin autoescalado es un punto único sin autocurado: hay que ponerle
 *    un ASG de tamaño 1 solo para que reaparezca, y entonces la IP cambia y
 *    habría que reservar una interfaz de red fija (en GCP se reservó una
 *    dirección). ElastiCache da un endpoint DNS estable y se recupera solo.
 *  - Una AMI de Docker que mantener y parchear, solo para correr un contenedor.
 *  - La imagen de Redis que en GCP se copiaba a mano a Artifact Registry para
 *    no depender de Docker Hub: aquí desaparece, y con ella un paso del despliegue.
 *
 * Se pierde: paridad exacta con GCP y ~4 USD/mes. Aquí no se necesita ninguna de
 * las funciones de ElastiCache (réplicas, clúster, TLS) — se usa como un Redis
 * de un nodo, igual que antes.
 *
 * ⚠️ Redis sigue SIN contraseña. Su seguridad es la regla del grupo de
 * seguridad (solo el backend llega al 6379) y que vive en subredes privadas. Si
 * algún día se saca de ahí, hay que activar AUTH y TLS en el mismo movimiento
 * —eso exige pasar a `aws_elasticache_replication_group`— y que el código del
 * backend use `rediss://`.
 */
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.prefijo}-redis"
  subnet_ids = aws_subnet.privada[*].id
}

resource "aws_elasticache_parameter_group" "redis" {
  name        = "${var.prefijo}-redis7"
  family      = "redis7"
  description = "PRAXIS: Redis solo como cache"

  /* Solo caché: si se llena, tira lo menos usado en vez de empezar a responder
     errores de escritura. Es la política que ya llevaba el Redis de la VM. */
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id        = "${var.prefijo}-redis"
  engine            = "redis"
  engine_version    = "7.1"
  node_type         = var.clase_redis
  num_cache_nodes   = 1
  port              = 6379
  az_mode           = "single-az"
  apply_immediately = true

  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]

  /* Sin copias: nada de lo que guarda merece un disco. Si el nodo se reinicia,
     la caché se vuelve a llenar sola. */
  snapshot_retention_limit = 0
}
