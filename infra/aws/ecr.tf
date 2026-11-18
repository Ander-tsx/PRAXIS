/**
 * El registro donde viven las imágenes Docker (ECR).
 *
 * En la misma región que las máquinas a propósito: bajarse ~550 MB desde otra
 * región cuesta tráfico entre regiones y hace más lento cada arranque, que es
 * justo lo que el autoescalado necesita rápido.
 *
 * Un repositorio por imagen —ECR no tiene «un repositorio con varias imágenes»
 * como Artifact Registry—, así que son dos: backend y frontend.
 */

locals {
  imagenes = toset(["backend", "frontend"])

  registro        = "${data.aws_caller_identity.actual.account_id}.dkr.ecr.${var.region}.amazonaws.com"
  imagen_backend  = "${local.registro}/${var.prefijo}/backend:${var.etiqueta_imagen}"
  imagen_frontend = "${local.registro}/${var.prefijo}/frontend:${var.etiqueta_imagen}"
}

resource "aws_ecr_repository" "imagenes" {
  for_each = local.imagenes

  name = "${var.prefijo}/${each.key}"

  /* Mutable a propósito: las plantillas apuntan a `latest` para que desplegar no
     exija un `terraform apply` (ver infra/ci/cloudbuild-main.yaml). El SHA va
     además, para saber qué corre y poder volver atrás. */
  image_tag_mutability = "MUTABLE"

  /* Las imágenes se reconstruyen desde el repo en cualquier momento; no hay
     nada en ellas que merezca bloquear un `destroy`. Sin esto, el repositorio
     con imágenes dentro hace fallar el borrado con RepositoryNotEmptyException. */
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

/* Sin esto el registro crece sin fin: cada despliegue deja atrás la imagen
   anterior y todas se cobran por GB. Una imagen lleva dos etiquetas (el SHA y
   `latest`) pero cuenta como una, así que 5 son las 5 últimas versiones. */
resource "aws_ecr_lifecycle_policy" "conservar_ultimas" {
  for_each = local.imagenes

  repository = aws_ecr_repository.imagenes[each.key].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar las 5 ultimas imagenes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 5
      }
      action = { type = "expire" }
    }]
  })
}
