/**
 * Todo lo que cambia entre despliegues.
 *
 * Los valores reales van en `terraform.tfvars`, que NO se versiona. Hay una
 * plantilla en `terraform.tfvars.example`.
 */

# ──────────────────────── proyecto y ubicación ────────────────────────

variable "proyecto" {
  description = "ID del proyecto de Google Cloud (el ID, no el nombre visible)."
  type        = string
}

variable "region" {
  description = "Región donde vive todo. us-central1 es la más barata de GCP."
  type        = string
  default     = "us-central1"
}

variable "zona" {
  description = "Zona para los recursos que no son regionales (la VM de Redis)."
  type        = string
  default     = "us-central1-a"
}

variable "prefijo" {
  description = "Prefijo de todos los nombres, para reconocerlos en la consola."
  type        = string
  default     = "praxis"
}

# ──────────────────────────── red ────────────────────────────

variable "rango_subred" {
  description = "Rango privado de la subred donde viven las VMs."
  type        = string
  default     = "10.10.0.0/24"
}

variable "habilitar_nat" {
  description = <<-EOT
    Cloud NAT da salida a internet a máquinas sin IP pública.

    Por defecto está APAGADO y cuesta ~32 USD/mes menos. No hace falta porque
    la subred tiene Acceso Privado a Google: las VMs llegan a Artifact
    Registry, Secret Manager y Cloud Logging por la red interna de Google, que
    es todo lo que necesitan.

    Enciéndelo solo si alguna máquina tiene que descargar algo de internet
    (instalar un paquete, llamar a una API de terceros). Ojo: assistant-service
    llama a Gemini, así que si usas el asistente, esto tiene que estar en true.
  EOT
  type        = bool
  default     = false
}

# ─────────────────────── máquinas y escalado ───────────────────────

variable "tipo_maquina_backend" {
  description = <<-EOT
    Tipo de VM del backend. Ahí dentro corren 8 procesos Node (el gateway y los
    7 microservicios), a grandes rasgos ~100 MB cada uno.

    e2-medium son 2 vCPU y 4 GB. e2-small (2 GB) también arranca, pero deja muy
    poco margen y el primer pico de memoria mata procesos sin avisar claro.
  EOT
  type        = string
  default     = "e2-medium"
}

variable "tipo_maquina_frontend" {
  description = "Tipo de VM del frontend: 6 servidores Next en producción."
  type        = string
  default     = "e2-medium"
}

variable "tipo_maquina_redis" {
  description = "Redis aquí guarda caché y límites de intentos. No necesita más."
  type        = string
  default     = "e2-micro"
}

variable "minimo_instancias" {
  description = "Instancias siempre encendidas por grupo. Con 1 no hay tolerancia a fallos; con 2, el grupo sobrevive a perder una máquina."
  type        = number
  default     = 1
}

variable "maximo_instancias" {
  description = "Techo del autoescalado. Es el requisito del proyecto; con el tráfico esperado nunca se pasará de la mínima."
  type        = number
  default     = 3
}

variable "objetivo_cpu" {
  description = "Uso de CPU (0-1) a partir del cual el grupo añade máquinas."
  type        = number
  default     = 0.6
}

# ──────────────────────────── datos ────────────────────────────

variable "tipo_maquina_sql" {
  description = <<-EOT
    Nivel de Cloud SQL. db-f1-micro es el más barato (~9 USD/mes) y sirve de
    sobra para este sistema.

    ⚠️ Los niveles f1/g1 son compartidos y NO admiten alta disponibilidad. Si
    algún día hace falta, hay que subir a db-custom-1-3840 o superior.
  EOT
  type        = string
  default     = "db-f1-micro"
}

variable "nombre_base_datos" {
  description = "Una sola base con un schema por microservicio, igual que en desarrollo."
  type        = string
  default     = "praxis"
}

variable "usuario_base_datos" {
  description = "Usuario de Postgres que usan los servicios."
  type        = string
  default     = "praxis"
}

variable "borrado_protegido_sql" {
  description = "Con true, Terraform se niega a destruir la base de datos. Déjalo en true salvo que estés desmontando el entorno a propósito."
  type        = bool
  default     = true
}

# ─────────────────────────── imágenes ───────────────────────────

variable "etiqueta_imagen" {
  description = "Etiqueta de las imágenes en Artifact Registry. Cambiarla y aplicar es lo que despliega una versión nueva."
  type        = string
  default     = "latest"
}

# ─────────────────────────── secretos ───────────────────────────

variable "gemini_api_key" {
  description = <<-EOT
    Clave de Google AI Studio para assistant-service.

    ⚠️ Ese servicio la exige para arrancar: sin ella se queda reiniciándose y el
    asistente no responde. El resto de la plataforma funciona igual — es el
    único proceso afectado.

    Se saca gratis en https://aistudio.google.com/apikey
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "google_client_id" {
  description = <<-EOT
    ID de cliente de OAuth para la entrada con Google.

    Se crea en la consola: APIs y servicios → Credenciales → ID de cliente de
    OAuth → Aplicación web, con `https://<tu-dominio>` en los orígenes
    autorizados de JavaScript.

    ⚠️ NO es un secreto y no va a Secret Manager: Next lo incrusta en el
    JavaScript que descarga el navegador. Lo que protege la cuenta es que
    Google solo emite tokens válidos para el origen autorizado.

    Vacío = el botón de Google no se dibuja y la entrada con contraseña
    funciona igual. El backend responde 503 en esa ruta si alguien la llama.

    ⚠️ Cambiarlo obliga a **reconstruir la imagen del frontend**, no basta con
    aplicar Terraform: el valor está dentro del bundle.
  EOT
  type        = string
  default     = ""
}

# ─────────────────────────── dominio ───────────────────────────

variable "dominio" {
  description = <<-EOT
    Dominio del sitio. Vacío = se usa sslip.io sobre la IP reservada, que
    resuelve sola y permite un certificado gestionado de Google sin comprar
    nada.

    Cuando tengas dominio propio, ponlo aquí y crea **dos** registros A hacia
    la IP del output `ip_publica`: uno para el dominio pelado (`@`) y otro para
    `www`. El certificado cubre los dos y Google no emite ninguno mientras uno
    solo no resuelva.

    Crea el DNS ANTES de aplicar, y comprueba que resuelve. Si aplicas primero,
    el certificado se queda en PROVISIONING y el sitio se queda sin HTTPS hasta
    que Google reintente.
  EOT
  type        = string
  default     = ""
}
