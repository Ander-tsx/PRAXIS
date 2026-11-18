/**
 * Las identidades de las máquinas.
 *
 * Roles de IAM con perfil de instancia, nunca claves de acceso: la máquina pide
 * credenciales temporales al servicio de metadatos (IMDSv2) y AWS las rota solo.
 * No hay ninguna credencial guardada en la máquina, en la imagen ni en el estado.
 *
 * **Dos roles, no uno.** La pila de GCP comparte una cuenta de servicio entre
 * backend, frontend y Redis, y lo compensa dando acceso a secretos uno por uno.
 * Aquí se separan: el frontend solo puede leer el secreto que firma la cookie, y
 * si alguien entra en una máquina del frontend —la que más superficie tiene,
 * porque ejecuta Next— no alcanza la contraseña de la base ni las claves de
 * Stripe. Cuesta dos recursos más y no tiene ningún coste de operación.
 */

data "aws_iam_policy_document" "confianza_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backend" {
  name               = "${var.prefijo}-backend"
  assume_role_policy = data.aws_iam_policy_document.confianza_ec2.json
}

resource "aws_iam_role" "frontend" {
  name               = "${var.prefijo}-frontend"
  assume_role_policy = data.aws_iam_policy_document.confianza_ec2.json
}

resource "aws_iam_instance_profile" "backend" {
  name = "${var.prefijo}-backend"
  role = aws_iam_role.backend.name
}

resource "aws_iam_instance_profile" "frontend" {
  name = "${var.prefijo}-frontend"
  role = aws_iam_role.frontend.name
}

/**
 * SSM Session Manager: el sustituto del SSH por IAP de GCP. La máquina abre una
 * conexión SALIENTE hacia el servicio de SSM, y quien tiene permiso de IAM
 * (`ssm:StartSession`) entra por ahí. No hay puerto 22, ni clave SSH, ni
 * bastión, y cada sesión queda registrada en CloudTrail.
 *
 * Es la política gestionada por AWS: da justo lo que el agente necesita y se
 * actualiza sola cuando el agente pide algo nuevo.
 */
resource "aws_iam_role_policy_attachment" "ssm" {
  for_each = {
    backend  = aws_iam_role.backend.name
    frontend = aws_iam_role.frontend.name
  }

  role       = each.value
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# ───────────────────────── permisos comunes ─────────────────────────

data "aws_iam_policy_document" "comunes" {
  /* Para bajar la imagen. `GetAuthorizationToken` no admite recurso concreto. */
  statement {
    sid       = "TokenDeEcr"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "BajarImagenes"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.imagenes : r.arn]
  }

  /* El driver `awslogs` de Docker escribe en CloudWatch con el rol de la
     máquina. Acotado a los grupos de esta pila, no a todo `logs:*`. */
  statement {
    sid       = "EscribirLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.maquinas["backend"].arn}:*", "${aws_cloudwatch_log_group.maquinas["frontend"].arn}:*"]
  }
}

resource "aws_iam_role_policy" "comunes" {
  for_each = {
    backend  = aws_iam_role.backend.id
    frontend = aws_iam_role.frontend.id
  }

  name   = "imagenes-y-logs"
  role   = each.value
  policy = data.aws_iam_policy_document.comunes.json
}

# ───────────────────────── secretos (por rol) ─────────────────────────

/* Secreto a secreto, no `secretsmanager:*` sobre todo: el mismo criterio que
   `google_secret_manager_secret_iam_member` en GCP. */
data "aws_iam_policy_document" "secretos_backend" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for s in aws_secretsmanager_secret.secretos : s.arn]
  }
}

data "aws_iam_policy_document" "secretos_frontend" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [for k in local.secretos_frontend : aws_secretsmanager_secret.secretos[k].arn]
  }
}

resource "aws_iam_role_policy" "secretos_backend" {
  name   = "leer-secretos"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.secretos_backend.json
}

resource "aws_iam_role_policy" "secretos_frontend" {
  name   = "leer-secretos"
  role   = aws_iam_role.frontend.id
  policy = data.aws_iam_policy_document.secretos_frontend.json
}

# ─────────────────────── adjuntos del chat (solo backend) ───────────────────────

data "aws_iam_policy_document" "adjuntos" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.chat_adjuntos.arn}/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.chat_adjuntos.arn]
  }
}

resource "aws_iam_role_policy" "adjuntos" {
  name   = "adjuntos-del-chat"
  role   = aws_iam_role.backend.id
  policy = data.aws_iam_policy_document.adjuntos.json
}
