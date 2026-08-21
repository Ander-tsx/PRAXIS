# Despliegue de PRAXIS en Google Cloud

Guía completa para levantar el sistema desde cero. Está escrita para quien no ha
usado Google Cloud ni Terraform antes: cada paso dice **qué** hace y **por qué**,
y avisa de lo que va a parecer roto sin estarlo.

---

## Qué se va a montar

```
                    Internet
                       │
                       ▼
        ┌──────────────────────────────┐
        │  Balanceador HTTPS externo   │  ← la única puerta pública
        │  IP fija + certificado       │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Grupo FRONTEND (autoescala) │  web-shell :4100
        │  1 → 3 máquinas              │  + 5 zonas en :4101-4105
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Balanceador interno          │  ← sin IP pública
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Grupo BACKEND (autoescala)  │  gateway :3000
        │  1 → 3 máquinas              │  + 8 microservicios :3001-3008
        └───────┬──────────────┬───────┘
                ▼              ▼
        ┌───────────────┐  ┌──────────┐
        │  Cloud SQL    │  │  Redis   │
        │  PostgreSQL   │  │  (VM)    │
        │  IP privada   │  │          │
        └───────────────┘  └──────────┘
```

**Nada tiene IP pública salvo el balanceador.** Eso es posible porque el
navegador nunca habla con el backend: cada zona del frontend expone su proxy
(`/<zona>/api/gateway`) y la llamada al gateway sale del servidor de Next, ya
dentro de la red privada. El gateway, Postgres y Redis quedan fuera del alcance
de cualquier barrido de internet.

### Costo estimado

Precios de `us-central1`, aproximados y en dólares al mes:

| Recurso | Costo |
|---|---:|
| VM backend (e2-medium) | ~24 |
| VM frontend (e2-medium) | ~24 |
| VM Redis (e2-micro) | ~6 |
| Cloud SQL (db-f1-micro + 10 GB) | ~9 |
| Balanceador externo | ~18 |
| Discos (3 × 20 GB) | ~6 |
| Artifact Registry, logs, red | ~2 |
| **Total** | **~89** |

Con 5 000 MXN (≈ 270 USD) eso da **unos 3 meses**. Si necesitas estirarlo, al
final de este documento hay formas de bajarlo a ~55.

> El autoescalado sube hasta 3 máquinas por grupo, pero solo si la CPU pasa del
> 60 % sostenido. Con el tráfico esperado nunca ocurrirá: el costo real es el de
> la tabla, no el del máximo.

---

## Antes de empezar

### 1. Comprobar la facturación

Entra a [console.cloud.google.com/billing](https://console.cloud.google.com/billing).

Necesitas dos cosas:

- **Una cuenta de facturación con crédito.** Mira qué tipo es:
  - Si dice *"Prueba gratuita"* con días restantes → **caduca a los 90 días
    aunque no gastes nada**. Apunta la fecha.
  - Si es un crédito educativo o un cupón → tiene su propia caducidad, y no
    hace falta tarjeta.
- **Que esté vinculada a tu proyecto.** En *Facturación → Vinculación de
  proyectos*. Sin esto no se puede ni activar Compute Engine, y el error que da
  no lo explica.

Cuando el crédito se agote, los recursos se suspenden y acaban borrándose. No
hay cobro sorpresa, pero tampoco margen: no dejes esto como único sitio donde
vivan datos que te importen.

### 2. Anotar el ID del proyecto

No es el nombre visible. Sale en el selector de proyectos de la consola, o con:

```bash
gcloud projects list
```

Es algo como `praxis-utez-472301`. Lo usarás en todos los pasos.

### 3. Instalar las herramientas

```bash
brew install --cask google-cloud-sdk
brew install terraform
```

### 4. Autenticarte

Son **dos** logins distintos y hacen falta los dos. El primero es para el CLI de
`gcloud`; el segundo crea las credenciales que usa Terraform, que es un programa
aparte y no comparte la sesión.

```bash
gcloud auth login
gcloud auth application-default login
```

Y fijar el proyecto por defecto:

```bash
gcloud config set project TU-PROJECT-ID
```

---

## Fase 1 — El bucket del estado

Terraform guarda en un archivo de *estado* qué recursos creó y con qué
identificadores. Si se pierde, deja de reconocer lo que ya existe e intenta
crearlo otra vez, duplicando todo.

Ese archivo no va al repo: **contiene todos los secretos en claro**, incluidas la
contraseña de Postgres y el `JWT_SECRET`. Va a un bucket de Cloud Storage con
versionado.

Es lo único que se crea a mano, porque Terraform no puede guardar su estado en
algo que aún no ha creado:

```bash
# El nombre de un bucket es único en TODO Google Cloud, así que lleva el
# ID del proyecto para no chocar con el de otra persona.
export BUCKET="TU-PROJECT-ID-praxis-tfstate"

gcloud storage buckets create gs://$BUCKET \
  --location=us-central1 \
  --uniform-bucket-level-access

# El versionado es lo que te deja recuperar el estado si se corrompe.
gcloud storage buckets update gs://$BUCKET --versioning
```

---

## Fase 2 — Configurar Terraform

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edita `terraform.tfvars` y pon al menos tu `proyecto`. Los demás valores tienen
predeterminados razonables.

**Sobre la clave de Gemini:** `assistant-service` la exige para arrancar — es una
decisión del servicio, prefiere no levantar a responder 500 en la primera
pregunta. Si no la pones, ese proceso se queda reiniciándose y **el resto de la
plataforma funciona igual**. Se saca gratis en
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Si la pones,
pon también `habilitar_nat = true`: llamar a Gemini es salir a internet y las
máquinas no tienen IP pública.

Ahora inicializa, apuntando al bucket:

```bash
terraform init -backend-config="bucket=$BUCKET"
```

---

## Fase 3 — Primer apply, solo lo mínimo

Hay un huevo-y-gallina: las máquinas necesitan las imágenes de Docker, pero las
imágenes se suben a un registro que aún no existe. Así que el primer apply crea
solo las APIs y el registro:

```bash
terraform apply \
  -target=time_sleep.apis_listas \
  -target=google_artifact_registry_repository.imagenes
```

Escribe `yes` cuando lo pida. Tarda un par de minutos, casi todo esperando a que
se activen las APIs.

---

## Fase 4 — Construir las imágenes

> ⚠️ **No las construyas en tu Mac.** Tu equipo es Apple Silicon (ARM) y las VMs
> de Google son x86-64. Docker generaría una imagen ARM que sube sin quejarse,
> la máquina se la baja sin quejarse, y el contenedor muere con
> `exec format error`. Con Prisma es peor todavía: compila su motor para la
> plataforma donde se genera.
>
> Cloud Build usa máquinas x86-64, así que construir allí lo resuelve de raíz —
> y además no sube 550 MB por tu conexión.

Desde la **raíz del repo**:

```bash
cd ../..    # volver a la raíz desde infra/terraform

gcloud builds submit \
  --config infra/ci/cloudbuild.yaml \
  --substitutions=_REGION=us-central1,_PREFIJO=praxis,_TAG=latest \
  .
```

Tarda entre 10 y 20 minutos la primera vez. Construye tres imágenes: el backend,
el frontend y un espejo de `redis:7-alpine` (se copia a nuestro registro para
que la VM de Redis pueda bajarla sin salida a internet).

Comprueba que están:

```bash
gcloud artifacts docker images list us-central1-docker.pkg.dev/TU-PROJECT-ID/praxis
```

---

## Fase 5 — Apply completo

```bash
cd infra/terraform
terraform apply
```

Ahora sí se crea todo: la red, Cloud SQL, Redis, los dos grupos con autoescalado
y los balanceadores.

**Tarda entre 15 y 25 minutos**, y la mayor parte es Cloud SQL: crear una
instancia con IP privada implica montar un peering entre redes y no hay forma de
acelerarlo.

Al terminar imprime los datos del despliegue:

```bash
terraform output
terraform output siguientes_pasos
```

---

## Fase 6 — Migraciones y seeds

La base de datos está creada pero **vacía**: no tiene ni schemas ni tablas.

Cloud SQL no tiene IP pública, así que no se puede migrar desde tu portátil. Se
hace desde dentro de la VPC, y el sitio natural es el propio contenedor del
backend, que ya lleva el CLI de Prisma.

Primero, el nombre de una máquina del backend y su zona:

```bash
gcloud compute instances list --filter="name~praxis-backend"
```

Luego, con ese nombre y esa zona:

```bash
gcloud compute ssh NOMBRE-VM --tunnel-through-iap --zone ZONA \
  --command "sudo docker exec praxis-backend /app/migrar.sh --con-seeds"
```

`--tunnel-through-iap` es lo que permite entrar por SSH a una máquina sin IP
pública: el túnel pasa por un servicio de Google y exige permiso de IAM, no solo
llegar al puerto.

Quita `--con-seeds` si no quieres los datos de ejemplo.

> Si da error de que el contenedor no existe, la máquina aún está bajándose la
> imagen. Espera un par de minutos: son 550 MB y 9 procesos que levantar.

---

## Fase 7 — Comprobar

### El certificado

```bash
gcloud compute ssl-certificates describe praxis-cert --global \
  --format="value(managed.status)"
```

> **Esto tarda entre 15 y 60 minutos** y mientras tanto el sitio da error de
> certificado. Es normal, no está roto. Espera a que diga `ACTIVE`.

### La salud de los grupos

```bash
gcloud compute backend-services get-health praxis-frontend-servicio --global
gcloud compute backend-services get-health praxis-backend-servicio --region=us-central1
```

Deben decir `HEALTHY`. Si dicen `UNHEALTHY` mucho rato, mira los logs (abajo).

### El sitio

```bash
terraform output url
```

Ábrelo. Deberías ver la landing pública. Crea una cuenta y entra al panel.

---

## Operación del día a día

### Desplegar una versión nueva

```bash
# Desde la raíz del repo
gcloud builds submit --config infra/ci/cloudbuild.yaml \
  --substitutions=_TAG=v2 .

# Desde infra/terraform
terraform apply -var="etiqueta_imagen=v2"
```

Terraform recrea las máquinas de una en una (`max_unavailable_fixed = 0`), así
que el sitio no se cae durante el despliegue.

Usa etiquetas con versión (`v2`, `v3`) y no `latest`: con `latest`, Terraform no
ve ningún cambio y no recrea nada.

### Ver los logs

Los logs de los contenedores van a Cloud Logging:

```bash
gcloud logging read \
  'resource.type="gce_instance" AND jsonPayload.container.name="praxis-backend"' \
  --limit 50 --format="value(jsonPayload.message)"
```

O entrando a una máquina:

```bash
gcloud compute ssh NOMBRE-VM --tunnel-through-iap --zone ZONA \
  --command "sudo journalctl -u praxis-backend -n 100 --no-pager"
```

Y el estado de los 9 procesos:

```bash
gcloud compute ssh NOMBRE-VM --tunnel-through-iap --zone ZONA \
  --command "sudo docker exec praxis-backend pm2 list"
```

### Conectarse a la base de datos

```bash
gcloud compute ssh NOMBRE-VM --tunnel-through-iap --zone ZONA \
  --command "sudo docker exec -it praxis-backend psql \
    'postgresql://praxis:CLAVE@IP-SQL:5432/praxis'"
```

La clave sale de `terraform output -raw password_sql` y la IP de
`terraform output sql_ip_privada`.

---

## Problemas frecuentes

| Síntoma | Causa casi siempre |
|---|---|
| El sitio da 502 | Los grupos están `UNHEALTHY`. Suele ser que el contenedor no arrancó — mira `journalctl`. |
| Error de certificado | Todavía se está emitiendo. Espera hasta 60 min. |
| `exec format error` en los logs | La imagen se construyó en ARM. Reconstruye con Cloud Build. |
| Las máquinas se recrean solas en bucle | El health check las mata antes de arrancar. Ya está previsto con `initial_delay_sec = 420`, pero si la imagen creció, súbelo. |
| El asistente no responde | Falta `gemini_api_key`, o falta `habilitar_nat = true` para que pueda salir a internet. |
| Todo redirige al login | El `JWT_SECRET` no coincide entre frontend y backend. No debería pasar (sale del mismo secreto), pero se comprueba con `pm2 list` y los logs del guard. |
| 404 en `/` del gateway | Correcto: el gateway monta el prefijo `api`. El health check apunta a `/api`. |

---

## Bajar el costo

Si el crédito aprieta, en orden de cuánto ahorras:

1. **Apagar cuando no lo uses.** Bajar los grupos a 0 máquinas deja de cobrar el
   cómputo, que son ~54 de los ~89:
   ```bash
   terraform apply -var="minimo_instancias=0" -var="maximo_instancias=0"
   ```
   Para volver, el mismo comando con 1 y 3.

2. **Máquinas más pequeñas** (`e2-small`, ~12/mes cada una): ahorra ~24. Ojo —
   en el backend corren 9 procesos Node a ~150 MB cada uno; con 2 GB va justo y
   un pico de memoria mata procesos sin dar un error claro.

3. **Destruirlo todo entre entregas.** Reconstruirlo son 30 minutos y los datos
   se pierden salvo que exportes antes:
   ```bash
   terraform destroy
   ```
   Requiere poner `borrado_protegido_sql = false` primero, que es justo la
   fricción que evita hacerlo sin querer.

---

## Cuando tengas dominio propio

Terraform usa [sslip.io](https://sslip.io) mientras no haya dominio: es un DNS
público que resuelve `34-8-1-2.sslip.io` → `34.8.1.2`. Eso permite un
certificado gestionado de verdad, porque el nombre resuelve públicamente y
Google puede validarlo. Con una IP pelada no se podría: no hay autoridad que
firme un certificado para una dirección IP.

Cuando registres uno:

1. Crea un registro **A** apuntando a `terraform output ip_publica`.
2. Pon el dominio en `terraform.tfvars`:
   ```hcl
   dominio = "praxis.tudominio.com"
   ```
3. `terraform apply`.

Se emitirá un certificado nuevo (otros 15-60 minutos). La IP no cambia, así que
no hay corte mientras tanto.
