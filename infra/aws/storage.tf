/**
 * El bucket de los adjuntos del chat (S3).
 *
 * ⚠️ **Se crea, pero el backend todavía no puede usarlo.** `projects-service` y
 * `assistant-service` tienen un proveedor `BlobStorage` con dos implementaciones
 * —`postgres` (la activa) y `gcs`— y ninguna para S3. Hasta que alguien escriba
 * `S3BlobStorage`, `STORAGE_DRIVER` se queda en `postgres` (backend.tf) y los
 * adjuntos siguen dentro de RDS, como en Railway. El bucket y el permiso del rol
 * están listos para el día que exista el driver; escribirlo es trabajo de
 * backend y esta pila no lo toca.
 *
 * El nombre de un bucket es único en TODO S3 y no se puede reutilizar mientras
 * dura un borrado en curso, así que lleva el ID de la cuenta.
 */

data "aws_caller_identity" "actual" {}

resource "aws_s3_bucket" "chat_adjuntos" {
  bucket = "${var.prefijo}-chat-adjuntos-${data.aws_caller_identity.actual.account_id}"

  /* Los adjuntos de una prueba no son un dato a conservar: sin esto,
     `terraform destroy` falla con BucketNotEmpty en cuanto alguien subió una
     foto y deja el entorno a medio desmontar. Con una base de datos protegida
     (`borrado_protegido_rds`) es un entorno de verdad: ahí conviene cambiarlo. */
  force_destroy = !var.borrado_protegido_rds
}

/* ⚠️ Nunca público. Las URLs de los adjuntos pasan por el gateway —que decide si
   puedes ver ese mensaje—, nunca por una URL directa del bucket. Los cuatro
   bloqueos juntos: uno solo deja un hueco (una ACL pública, o una política). */
resource "aws_s3_bucket_public_access_block" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

/* Sin ACL por objeto: solo IAM. Es el `uniform_bucket_level_access` de GCS. */
resource "aws_s3_bucket_ownership_controls" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

/* Cifrado con la clave que administra S3 (SSE-S3) y no con una KMS propia: la
   propia clave cuesta 1 USD/mes y cada petición, y no añade aquí nada que el
   rol no tenga ya acotado. `bucket_key_enabled` solo importa con KMS. */
resource "aws_s3_bucket_server_side_encryption_configuration" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

/* Nadie pide versiones antiguas de un adjunto: la app sobrescribe o borra, y
   guardarlas solo encarecería el almacenamiento (igual que en GCS). */
resource "aws_s3_bucket_versioning" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id

  versioning_configuration {
    status = "Disabled"
  }
}

/* Una subida a medias que nunca se completa sigue ocupando y cobrando, sin
   aparecer en ningún listado normal. */
resource "aws_s3_bucket_lifecycle_configuration" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id

  rule {
    id     = "abortar-subidas-incompletas"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "chat_adjuntos" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.chat_adjuntos.arn, "${aws_s3_bucket.chat_adjuntos.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "chat_adjuntos" {
  bucket = aws_s3_bucket.chat_adjuntos.id
  policy = data.aws_iam_policy_document.chat_adjuntos.json

  depends_on = [aws_s3_bucket_public_access_block.chat_adjuntos]
}
