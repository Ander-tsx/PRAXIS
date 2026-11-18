/**
 * Todo lo que cambia entre despliegues.
 *
 * Los valores reales van en `terraform.tfvars`, que NO se versiona. Hay una
 * plantilla en `terraform.tfvars.example`. Los nombres siguen los de
 * infra/terraform/ (GCP) para que quien conoce una pila lea la otra sin
 * traducir.
 */

# ──────────────────────── ubicación y nombres ────────────────────────

variable "region" {
  description = "Región de AWS donde vive todo. us-east-1 es la más barata y la que más servicios recibe primero."
  type        = string
  default     = "us-east-1"
}

variable "prefijo" {
  description = "Prefijo de todos los nombres, para reconocerlos en la consola."
  type        = string
  default     = "praxis"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,18}$", var.prefijo))
    error_message = "El prefijo va en minúsculas, dígitos y guiones, empieza por letra y no pasa de 19 caracteres: entra en nombres de ALB, NLB y buckets, que son más estrictos."
  }
}

# ──────────────────────────── red ────────────────────────────

variable "rango_vpc" {
  description = "Rango privado de la VPC. De él se sacan las dos subredes públicas y las dos privadas."
  type        = string
  default     = "10.10.0.0/16"
}

variable "nat_por_zona" {
  description = <<-EOT
    Con false (por defecto) hay UN solo NAT Gateway para las dos zonas. Con true,
    uno por zona.

    Un NAT cuesta ~33 USD/mes más el tráfico; con dos son ~66. Con uno solo, si
    cae su zona las máquinas de la otra pierden la salida a internet —Gemini,
    Stripe, Resend— aunque sigan vivas. Para una demo es un riesgo aceptable;
    para producción, true.
  EOT
  type        = bool
  default     = false
}

variable "cidrs_permitidos_alb" {
  description = "Orígenes que pueden llegar al balanceador público. Por defecto, todo internet: es la única puerta del sistema. Acótalo para una demo privada."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# ─────────────────────── máquinas y escalado ───────────────────────

variable "tipo_instancia_backend" {
  description = <<-EOT
    Tipo de instancia del backend. Ahí dentro corre el monolito (gateway, ocho
    servicios y collab en un solo proceso Node).

    t3.medium son 2 vCPU y 4 GB, equivalente a e2-medium. Es x86 a propósito: las
    imágenes se construyen para x86-64 (ver infra/ci/). Pasar a Graviton
    (t4g.*) abarata ~20 % pero exige construir las imágenes para arm64.
  EOT
  type        = string
  default     = "t3.medium"
}

variable "tipo_instancia_frontend" {
  description = "Tipo de instancia del frontend: una sola aplicación Next."
  type        = string
  default     = "t3.medium"
}

variable "minimo_instancias" {
  description = "Instancias siempre encendidas por grupo. Con 1 no hay tolerancia a fallos; con 2, el grupo sobrevive a perder una máquina o una zona."
  type        = number
  default     = 1
}

variable "maximo_instancias" {
  description = "Techo del autoescalado."
  type        = number
  default     = 3

  validation {
    condition     = var.maximo_instancias >= var.minimo_instancias
    error_message = "maximo_instancias no puede ser menor que minimo_instancias."
  }
}

variable "objetivo_cpu" {
  description = "Uso medio de CPU (en %) a partir del cual el grupo añade máquinas."
  type        = number
  default     = 60
}

# ──────────────────────────── datos ────────────────────────────

variable "clase_rds" {
  description = <<-EOT
    Clase de RDS. db.t4g.micro (2 vCPU burstable, 1 GB) es el equivalente de
    db-f1-micro y sirve de sobra. Es arm64, pero eso solo importa para quien
    ejecuta Postgres, no para la aplicación.
  EOT
  type        = string
  default     = "db.t4g.micro"
}

variable "almacenamiento_rds_gb" {
  description = "Disco inicial de RDS (gp3; el mínimo del tipo es 20). Crece solo hasta el triple."
  type        = number
  default     = 20
}

variable "rds_multi_az" {
  description = "Réplica síncrona en otra zona con conmutación automática. Duplica el precio de RDS; en false la base es un punto único de fallo (igual que el Cloud SQL ZONAL de GCP)."
  type        = bool
  default     = false
}

variable "nombre_base_datos" {
  description = "Una sola base con un schema por servicio, igual que en desarrollo."
  type        = string
  default     = "praxis"
}

variable "usuario_base_datos" {
  description = "Usuario de Postgres que usan los servicios."
  type        = string
  default     = "praxis"
}

variable "borrado_protegido_rds" {
  description = <<-EOT
    Con true, Terraform se niega a destruir la base y, si se destruye por otro
    camino, deja una copia final.

    ⚠️ Para desmontar una PRUEBA hay que ponerlo en false y aplicar ANTES de
    `terraform destroy`: si no, el destroy falla a mitad y deja medio entorno
    cobrando.
  EOT
  type        = bool
  default     = true
}

variable "clase_redis" {
  description = "Nodo de ElastiCache. cache.t4g.micro (0,5 GB) basta: Redis aquí es caché y límites de intentos."
  type        = string
  default     = "cache.t4g.micro"
}

# ─────────────────────────── imágenes ───────────────────────────

variable "etiqueta_imagen" {
  description = "Etiqueta de las imágenes en ECR. Las instancias se bajan esta etiqueta al arrancar, así que desplegar una versión es reemplazarlas (instance refresh)."
  type        = string
  default     = "latest"
}

# ─────────────────────────── dominio ───────────────────────────

variable "dominio" {
  description = <<-EOT
    Dominio del sitio (`app.ejemplo.com`). ACM solo emite certificados para un
    dominio que controlas: no existe el equivalente al truco de sslip.io que usa
    la pila de GCP.

    Vacío = el balanceador sirve SOLO por HTTP, para una demostración. ⚠️ Con eso
    NO se puede iniciar sesión: la cookie de sesión es `Secure` en producción y
    el navegador no la manda por HTTP. Sirve para ver la landing y comprobar que
    la infraestructura responde, nada más. Ver el README.
  EOT
  type        = string
  default     = ""
}

variable "zona_route53_id" {
  description = <<-EOT
    ID de la zona alojada de Route 53 que contiene `dominio`. Con ella,
    Terraform crea solo el registro de validación del certificado y el alias del
    sitio. Vacío = el DNS está en otro proveedor y los dos registros se crean a
    mano (el README explica el orden).
  EOT
  type        = string
  default     = ""
}

# ─────────────────────────── secretos ───────────────────────────

variable "gemini_api_key" {
  description = <<-EOT
    Clave de Google AI Studio para assistant-service. Sin ella el asistente no
    responde; el resto de la plataforma funciona igual.
    Se saca gratis en https://aistudio.google.com/apikey
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_api_key" {
  description = "Clave de API de Resend. Vacía = el servicio arranca, no manda nada y escribe los enlaces en el log."
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_from" {
  description = "Remitente de los correos. Resend solo entrega desde un dominio verificado por ti."
  type        = string
  default     = "PRAXIS <no-reply@usepraxis.space>"
}

variable "google_client_id" {
  description = <<-EOT
    ID de cliente de OAuth para la entrada con Google. NO es un secreto (Next lo
    incrusta en el JavaScript del navegador), así que va en claro.

    ⚠️ Cambiarlo obliga a reconstruir la imagen del frontend: el valor está
    dentro del bundle.
  EOT
  type        = string
  default     = ""
}

variable "stripe_secret_key" {
  description = "Clave secreta de Stripe (`sk_…`). Vacía = la facturación queda desactivada y nada se rompe."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = "Secreto de firma del webhook de Stripe (`whsec_…`). Es la única autenticación de `POST /api/webhooks/stripe`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_price_pro" {
  description = "Id del PRECIO (no del producto) del plan Pro, `price_…`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_price_plus" {
  description = "Id del precio del plan Plus, `price_…`."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_price_team" {
  description = "Id del precio del plan Equipo, `price_…`. Tiene que ser un precio por unidad (se cobra por asiento)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_price_business" {
  description = "Id del precio del plan Empresa, `price_…`. Por asiento, igual que Equipo."
  type        = string
  sensitive   = true
  default     = ""
}

variable "precio_pro" {
  description = "Lo que se enseña como precio del Pro en la página de planes, sin símbolo. Es cartelería: se cobra el `price_…` de Stripe."
  type        = string
  default     = ""
}

variable "dias_recuperacion_secretos" {
  description = <<-EOT
    Días que Secrets Manager conserva un secreto borrado antes de eliminarlo.
    Entre 7 y 30, o 0 para borrado inmediato.

    ⚠️ Con un valor > 0, destruir y volver a aplicar el MISMO día falla con
    «You can't create this secret because a secret with this name is already
    scheduled for deletion». Es el mismo bloqueo que ya dio el nombre de Cloud SQL
    en GCP. Para entornos de prueba que se montan y se desmontan, usa 0.
  EOT
  type        = number
  default     = 7

  validation {
    condition     = var.dias_recuperacion_secretos == 0 || (var.dias_recuperacion_secretos >= 7 && var.dias_recuperacion_secretos <= 30)
    error_message = "Secrets Manager admite 0 o un valor entre 7 y 30."
  }
}

# ─────────────────────────── observabilidad ───────────────────────────

variable "retencion_logs_dias" {
  description = "Días que CloudWatch conserva los logs de las máquinas, de la base y de la red. Sin límite crecen y se cobran para siempre."
  type        = number
  default     = 14
}

# ───────────────────────────── CI (opcional) ─────────────────────────────

variable "github_repo" {
  description = <<-EOT
    Repositorio de GitHub (`organizacion/repo`) autorizado a subir imágenes a ECR
    por OIDC. Vacío = no se crea el rol y el workflow de .github/workflows/ no
    puede autenticarse (las imágenes se suben a mano, como se explica en el README).
  EOT
  type        = string
  default     = ""
}

variable "rama_github_despliegue" {
  description = "Rama desde la que el workflow puede asumir el rol. Cualquier otra rama, o un fork, recibe un 403 al autenticarse."
  type        = string
  default     = "main"
}

variable "crear_proveedor_oidc_github" {
  description = "Una cuenta de AWS solo admite UN proveedor OIDC de GitHub. Si la cuenta ya tiene uno (de otro proyecto), pon false: crearlo dos veces falla con EntityAlreadyExists."
  type        = bool
  default     = true
}
