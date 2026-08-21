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

# ────────────────────────── almacenamiento ──────────────────────────

variable "activar_gcs_chat" {
  description = <<-EOT
    Activa el proveedor GCS para los adjuntos del chat.

    El bucket se crea siempre (ver storage.tf). Con esto en false —el valor
    por defecto—, STORAGE_DRIVER sigue en "postgres" y el bucket se queda
    vacío: crearlo no cambia nada del comportamiento actual.

    ⚠️ Activarlo no migra los adjuntos que ya existen: solo decide dónde se
    guardan los que se suban DESPUÉS del cambio. Ver el comentario de
    storage.tf antes de encenderlo en un entorno con datos reales.
  EOT
  type        = bool
  default     = false
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

variable "stripe_secret_key" {
  description = <<-EOT
    Clave secreta de Stripe para el cobro del plan PRO (`sk_test_…` o `sk_live_…`).

    Vacía = **la facturación queda desactivada y nada se rompe**: el gateway lo
    detecta al arrancar, `GET /me/billing/estado` responde que no está
    disponible y la interfaz no ofrece ningún botón de compra. Es deliberado —
    un despliegue sin claves tiene que seguir funcionando.

    ⚠️ Una clave de **sandbox** cobra dinero de mentira. Para cobrar de verdad
    hay que rehacer el producto, el precio y el webhook en la cuenta real: un
    sandbox y la cuenta real no comparten absolutamente nada.

    Se saca en dashboard.stripe.com → Desarrolladores → Claves de API.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_price_pro" {
  description = <<-EOT
    El id del **precio** del plan PRO en Stripe (`price_…`).

    ⚠️ El del precio, no el del producto. Con un `prod_…` el checkout falla al
    abrirse, y el error solo se ve al pulsar el botón.

    No es un secreto —viaja en la llamada de creación del checkout— pero va por
    Secret Manager con los demás para no repartir la configuración de Stripe
    entre dos sitios.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "stripe_webhook_secret" {
  description = <<-EOT
    El secreto de firma del webhook de Stripe (`whsec_…`).

    Es **la única autenticación** de `POST /api/webhooks/stripe`: sin él el
    gateway rechaza todos los eventos con 400, y como el plan lo concede el
    webhook y solo el webhook, nadie llegaría nunca a PRO por bien que
    funcionara el pago.

    ⚠️ **Cada punto de conexión tiene el suyo, y el de `stripe listen` no vale
    aquí.** El de producción sale al crear el endpoint en el panel apuntando a
    `https://<dominio>/api/webhooks/stripe`; el de local lo imprime la CLI. Son
    valores distintos y mezclarlos deja el webhook rechazando todo.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "precio_pro" {
  description = <<-EOT
    Lo que se enseña como precio del PRO en la página de planes, sin símbolo.

    ⚠️ Es **cartelería**. El precio que se cobra es el del `price_…` de Stripe;
    si los dos discrepan manda Stripe y aquí solo queda una cifra que engaña.
  EOT
  type        = string
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

# ─────────────────────────── correo ───────────────────────────

variable "mail_api_key" {
  description = <<-EOT
    Clave de API de Resend, para los correos de confirmación de cuenta y de
    recuperación de contraseña.

    Se guarda en Secret Manager como el resto. Vacía = el servicio arranca
    igual, no manda nada y escribe los enlaces en el log: preferimos eso a que
    un despliegue se caiga por un secreto sin rellenar.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "mail_from" {
  description = <<-EOT
    Remitente de los correos.

    ⚠️ Resend solo entrega desde un dominio verificado por ti. Con un gmail
    responde 403 y no manda nada, un fallo que solo se ve leyendo los logs.
  EOT
  type        = string
  default     = "PRAXIS <no-reply@usepraxis.space>"
}
