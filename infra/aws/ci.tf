/**
 * El rol con el que GitHub Actions sube imágenes a ECR, sin claves.
 *
 * OIDC: GitHub firma un token por cada ejecución del workflow y AWS lo cambia por
 * credenciales temporales (1 hora) si el token cumple la condición de abajo. No
 * existe ninguna clave de acceso de larga duración que guardar como secreto del
 * repositorio, ni que rotar, ni que se pueda filtrar en un log.
 *
 * Todo el bloque es opcional: sin `github_repo` no se crea nada y las imágenes se
 * suben a mano (README).
 */

locals {
  crear_ci = var.github_repo != ""
}

/* Una cuenta solo admite UN proveedor OIDC por URL. Si ya hay uno (de otro
   proyecto), se reutiliza en vez de intentar crearlo y morir con
   EntityAlreadyExists. */
resource "aws_iam_openid_connect_provider" "github" {
  count = local.crear_ci && var.crear_proveedor_oidc_github ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.crear_ci && !var.crear_proveedor_oidc_github ? 1 : 0

  url = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_github_arn = local.crear_ci ? (
    var.crear_proveedor_oidc_github
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  ) : null
}

data "aws_iam_policy_document" "confianza_github" {
  count = local.crear_ci ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_github_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    /**
     * ⚠️ **Esta condición es la seguridad entera del rol.** Sin la del `sub`, CUALQUIER
     * repositorio de GitHub de CUALQUIER persona podría pedir este rol: el
     * proveedor es el mismo para todos. Se ata a este repositorio y a una sola
     * rama; un fork, o una rama de un PR, recibe un 403 al autenticarse y no
     * puede subir una imagen que luego el autoescalado se bajaría y ejecutaría.
     */
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/${var.rama_github_despliegue}"]
    }
  }
}

resource "aws_iam_role" "github_ecr" {
  count = local.crear_ci ? 1 : 0

  name               = "${var.prefijo}-github-ecr"
  assume_role_policy = data.aws_iam_policy_document.confianza_github[0].json

  /* Una ejecución dura minutos. La hora que dura una sesión por defecto ya
     sobra y es el mínimo que AWS permite. */
  max_session_duration = 3600
}

data "aws_iam_policy_document" "subir_imagenes" {
  count = local.crear_ci ? 1 : 0

  statement {
    sid       = "TokenDeEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  /* Solo subir a estos dos repositorios. Ni crea repositorios, ni toca
     instancias, ni lee secretos: igual que el Cloud Build de GCP, que solo
     despliega CÓDIGO y no puede cambiar la infraestructura. Cambiar máquinas, red
     o secretos se sigue haciendo con `terraform apply` desde un portátil. */
  statement {
    sid = "SubirImagenes"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for r in aws_ecr_repository.imagenes : r.arn]
  }
}

resource "aws_iam_role_policy" "github_ecr" {
  count = local.crear_ci ? 1 : 0

  name   = "subir-imagenes"
  role   = aws_iam_role.github_ecr[0].id
  policy = data.aws_iam_policy_document.subir_imagenes[0].json
}
