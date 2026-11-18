/**
 * Proveedor y dónde vive el estado.
 *
 * Igual que en infra/terraform/ (GCP): el estado NO se guarda en el repo. Es el
 * archivo que recuerda qué recursos creó Terraform; si se pierde, deja de
 * reconocer lo que ya existe e intenta crearlo otra vez. Va a un bucket de S3 con
 * versionado y cifrado, que además permite trabajar desde varias máquinas.
 *
 * ⚠️ El bucket tiene que existir ANTES del primer `terraform init`: Terraform no
 * puede guardar su estado en algo que aún no ha creado. Se crea a mano una sola
 * vez — el comando está en el README de esta carpeta.
 *
 * El bloqueo usa `use_lockfile` (un objeto `.tflock` en el mismo bucket, con
 * escritura condicional de S3), que existe desde Terraform 1.10. Antes hacía
 * falta una tabla de DynamoDB solo para esto; esa vía está en desuso, y es una
 * pieza menos que crear a mano y que olvidar borrar.
 */

terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    # El bucket y la región se pasan en `terraform init -backend-config=...`
    # porque aquí no se pueden usar variables. Ver el README.
    key          = "praxis/estado.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  /* Todo lo que cree esta pila lleva estas etiquetas, y es lo que permite
     filtrar la factura (Cost Explorer) por «Proyecto» y encontrar de un vistazo
     qué quedó vivo después de una prueba. */
  default_tags {
    tags = {
      Proyecto   = var.prefijo
      Gestionado = "terraform"
    }
  }
}
