# Despliegue

> **Producción corre en Railway** ([`docs/deploy/RAILWAY.md`](deploy/RAILWAY.md)).
> Lo que sigue describe la pila de **Google Cloud**, que quedó como alternativa.
> Existe además una pila equivalente para **AWS** en
> [`infra/aws/`](../infra/aws/README.md), también alternativa y **sin desplegar
> todavía** (validada con `validate`, `tflint` y `trivy`, sin `plan` ni `apply`).

Qué hay montado en Google Cloud, qué se despliega solo y qué sigue siendo a
mano. Lo que **no** está aquí es cómo se construyó la infraestructura: eso vive
en `infra/terraform/` y se aplica desde tu portátil.

---

## Lo que hay

| Pieza | Qué es |
|---|---|
| `praxis-backend-us-east1` | Grupo de instancias con autoescalado. Un contenedor con los 8 procesos Node |
| `praxis-frontend-us-east1` | Grupo con autoescalado. Un contenedor con los 6 servidores de Next |
| `praxis-redis` | VM suelta. Caché y el canal de avisos |
| `praxis-postgres-…` | Cloud SQL. **Sin IP pública** |
| Artifact Registry | Las dos imágenes, etiquetadas con el SHA del commit y con `latest` |

⚠️ **Cloud SQL no tiene IP pública, y eso gobierna medio documento.** No se puede
migrar ni consultar desde un portátil: hay que entrar por algo que ya esté dentro
de la VPC, que es la VM del backend. De ahí que `migrar.sh` viva **dentro de la
imagen** y no en `scripts/`.

---

## Un cambio de código: no hagas nada

Cada push a `main` dispara el trigger de Cloud Build, que construye las dos
imágenes y reemplaza las instancias de los dos grupos. El arranque de cada VM
hace `docker pull` al iniciar el servicio, así que reemplazarla es lo que
despliega.

Tarda unos 20 minutos: la mayor parte es compilar 6 apps de Next y 8 de Nest.

Se puede seguir en la [consola de Cloud
Build](https://console.cloud.google.com/cloud-build/builds) o con:

```bash
gcloud builds list --region=us-east1 --limit=3
```

### Si el despliegue va mal

Las instancias viejas siguen sirviendo hasta que las nuevas están sanas
(`--max-unavailable=0`), así que un build roto no tira el sitio: simplemente no
llega el cambio.

Para **volver a una versión anterior**, se re-etiqueta como `latest` la imagen
del commit que sí funcionaba y se reemplazan las instancias:

```bash
SHA=abc1234   # el corto, el que sale en `gcloud builds list`
for i in backend frontend; do
  gcloud artifacts docker tags add \
    us-east1-docker.pkg.dev/$(gcloud config get-value project)/praxis/$i:$SHA \
    us-east1-docker.pkg.dev/$(gcloud config get-value project)/praxis/$i:latest
done
for g in backend frontend; do
  gcloud compute instance-groups managed rolling-action replace \
    praxis-$g-us-east1 --region=us-east1 --max-unavailable=0 --max-surge=1
done
```

Por eso las imágenes llevan **las dos** etiquetas. `latest` es lo que miran las
plantillas de instancia —si miraran el SHA, cada despliegue necesitaría un
`terraform apply`— y el SHA es lo único que permite saber qué está corriendo y
volver atrás.

---

## Un cambio de esquema: la migración va ANTES, y a mano

**El despliegue automático no aplica migraciones.** No es un olvido:
`migrar.sh` avisa de que hay que ejecutarlo en una sola máquina porque Prisma
toma un bloqueo en la base, y lanzarlo desde varias VMs que arrancan a la vez es
exactamente ese escenario.

El orden correcto es **migrar primero, desplegar después**: una migración que
solo añade tablas o columnas la aguanta el código viejo sin enterarse, mientras
que el código nuevo contra el esquema viejo revienta.

```bash
VM=$(gcloud compute instances list --filter="name~praxis-backend" --format="value(name)" | head -1)
ZONA=$(gcloud compute instances list --filter="name~praxis-backend" --format="value(zone)" | head -1)

gcloud compute ssh "$VM" --tunnel-through-iap --zone "$ZONA" \
  --command "sudo docker exec praxis-backend /app/migrar.sh"
```

Si la migración **borra o renombra** algo, no hay atajo: hay que parar el
tráfico, migrar y desplegar, en ese orden.

### 🔴 Pero `migrar.sh` no puede aplicar una migración que todavía no existe

El párrafo de arriba dice «migrar primero, desplegar después», y con el comando
de arriba **eso es imposible para una migración nueva**: `migrar.sh` corre
*dentro de la imagen desplegada*, y una migración recién escrita solo está en la
imagen que aún no se ha construido. El comando se ejecuta, dice que todo está al
día, y no aplica nada.

Se descubrió desplegando: la imagen en producción tenía 3 migraciones del
asistente y la rama traía 8.

Para cumplir el orden de verdad hay que llegar a Cloud SQL **desde el
repositorio**, y para eso está el túnel por IAP a través de la VM del backend:

```bash
IP_SQL=$(gcloud sql instances list --filter="name~praxis-postgres" \
  --format="value(ipAddresses[0].ipAddress)")
VM=$(gcloud compute instances list --filter="name~praxis-backend" --format="value(name)" | head -1)
ZONA=$(gcloud compute instances list --filter="name~praxis-backend" --format="value(zone)" | head -1)

# En una terminal aparte: el túnel se queda abierto.
gcloud compute ssh "$VM" --tunnel-through-iap --zone "$ZONA" -- -N -L "5433:$IP_SQL:5432"
```

Y con el túnel abierto, desde la raíz del repositorio:

```bash
CLAVE=$(gcloud secrets versions access latest --secret=praxis-password-sql)
CLAVE_URL=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$CLAVE")

for s in permissions credentials projects tasks assistant alexa; do
  DATABASE_URL="postgresql://praxis:${CLAVE_URL}@localhost:5433/praxis?schema=${s}" \
    npx --prefix apps/backend/services/$s prisma migrate deploy \
    --schema apps/backend/services/$s/prisma/schema.prisma
done
```

⚠️ **`?schema=<servicio>` no es opcional.** Cada microservicio tiene su propio
schema y su propia tabla `_prisma_migrations` dentro de él — es lo mismo que hace
`url_para()` en `migrar.sh`. Con `?schema=public` los seis fallan con

```
Error: Invariant violation: migration persistence is not initialized.
```

que no dice absolutamente nada de lo que está pasando. Se tarda más en entender
ese mensaje que en arreglarlo.

⚠️ Y el orden de la lista importa: es el mismo de `migrar.sh` —permissions y
credentials antes que projects y tasks— porque los seeds de los segundos
referencian lo que crean los primeros.

Para comprobar antes o después, `prisma migrate status` con la misma URL: dice
«Database schema is up to date!» o enumera lo que falta.

`migrar.sh` sigue siendo lo correcto para **volver a aplicar** algo que ya está
en la imagen, o para el arranque limpio de aquí abajo.

---

## Arrancar una instalación de cero

Para una base recién creada, o para dejarla como recién creada. Siembra **una
sola cuenta** y el proyecto con historial fabricado.

```bash
gcloud compute ssh "$VM" --tunnel-through-iap --zone "$ZONA" \
  --command "sudo docker exec \
    -e SEED_SUPERADMIN_EMAIL='superadmin@usepraxis.space' \
    -e SEED_SUPERADMIN_PASSWORD='…' \
    praxis-backend /app/migrar.sh --arranque-limpio"
```

⚠️ **No uses `--con-seeds` en una instalación expuesta.** Ese modo siembra las
cuatro cuentas de desarrollo y **sus contraseñas están escritas en este
repositorio**: `Admin@12345!` sobre la cuenta de SuperAdmin, en un sitio público,
es regalar el control de la plataforma a quien sepa leer el código. Para eso
existe `--arranque-limpio`.

El arranque limpio deja:

- **una** cuenta, con rol SuperAdmin y la contraseña que le pases;
- los cuatro roles globales del catálogo, para poder promover a alguien luego;
- el proyecto «Sprint histórico (datos de demostración)», con 16 semanas de
  historial fabricado y **sin encargados**, para repartirlo a mano;
- ningún otro proyecto: nada de «Proyecto PRAXIS Demo».

⚠️ Mientras el historial no tenga encargados, **el reparto por persona sale
vacío** y la instantánea dirá que ninguna tarea tiene a nadie. Lo demás —flujo,
tiempos, ciclo y predicción— no mira los encargados y sale igual. Y asignar
después no falsea nada: las medianas por persona se calculan con el `createdAt` y
el `completedAt` de la tarea, no con la fecha en que se asignó.

---

## Cambiar la infraestructura: Terraform, a mano

Máquinas, red, secretos, dominio, la clave de Gemini. El estado y
`terraform.tfvars` **no están en el repositorio**, así que esto no se automatiza:

```bash
cd infra/terraform
terraform plan     # míralo siempre antes
terraform apply
```

⚠️ `borrado_protegido_sql = true` impide que `terraform destroy` se lleve la base
de datos. Si algún día hay que mover la instancia de región o de nivel, hay que
bajarlo a `false` **antes** —Terraform no puede reemplazar lo que tiene
protegido— y volver a subirlo después.

⚠️ `etiqueta_imagen` ya no se toca en cada despliegue: apunta a `latest` y de
cambiar lo que hay detrás se encarga Cloud Build.

---

## Construir a mano, sin pasar por el trigger

Para probar una rama, o si el trigger está caído:

```bash
gcloud builds submit --config infra/ci/cloudbuild.yaml --region=us-east1 \
  --substitutions=_REGION=us-east1,_PREFIJO=praxis,_TAG=pruebas,_GOOGLE_CLIENT_ID=… .
```

⚠️ **No construyas las imágenes en un Mac con Apple Silicon.** Docker generaría
arm64 y las VMs son x86-64: la imagen sube sin quejarse, la máquina se la baja
sin quejarse, y el contenedor muere con `exec format error`. Peor con Prisma, que
compila su motor para la plataforma donde se genera. Los trabajadores de Cloud
Build son x86-64, así que construir allí resuelve el problema de raíz.

---

## Montar el trigger (una sola vez)

Ya está hecho, pero si hubiera que rehacerlo:

1. Conectar el repositorio. **Requiere navegador**: la app de GitHub pide
   autorización y no hay forma de hacerlo solo con la CLI.

   ```bash
   gcloud builds connections create github praxis-github --region=us-east1
   gcloud builds connections describe praxis-github --region=us-east1   # trae el enlace
   gcloud builds repositories create praxis \
     --remote-uri=https://github.com/Ander-tsx/PRAXIS.git \
     --connection=praxis-github --region=us-east1
   ```

2. Crear el trigger:

   ```bash
   gcloud builds triggers create github \
     --name=praxis-main --region=us-east1 \
     --repository=projects/$(gcloud config get-value project)/locations/us-east1/connections/praxis-github/repositories/praxis \
     --branch-pattern='^main$' \
     --build-config=infra/ci/cloudbuild-main.yaml \
     --substitutions=_GOOGLE_CLIENT_ID=…
   ```

2 bis. ⚠️ **Un trigger de 2ª generación exige `serviceAccount` explícito.** Sin
   él la API devuelve `INVALID_ARGUMENT` **a secas, sin decir qué campo**, y
   `gcloud builds triggers create github` tampoco lo pide. Se tarda más en
   averiguarlo que en arreglarlo: si `gcloud` falla así, crea el trigger por la
   API con `serviceAccount` puesto.

3. Los permisos de la cuenta que corre el build. Necesita **tres**, y ninguno
   viene puesto:

   ```bash
   PROY=$(gcloud config get-value project)
   NUM=$(gcloud projects describe "$PROY" --format='value(projectNumber)')
   SA="$NUM-compute@developer.gserviceaccount.com"

   # 1. Reemplazar instancias de los grupos.
   gcloud projects add-iam-policy-binding "$PROY" \
     --member="serviceAccount:$SA" --role=roles/compute.instanceAdmin.v1

   # 2. Actuar como la cuenta que llevan las máquinas. Sin esto el reemplazo
   #    falla, y falla al FINAL del build: 20 minutos de compilación tirados.
   gcloud iam service-accounts add-iam-policy-binding \
     "praxis-vm@$PROY.iam.gserviceaccount.com" \
     --member="serviceAccount:$SA" --role=roles/iam.serviceAccountUser

   # 3. Usar el health check del grupo, que `instanceAdmin.v1` NO incluye:
   #      Required 'compute.healthChecks.use' permission for
   #      '…/healthChecks/praxis-backend-hc-autocurado'
   #    El único rol predefinido que lo trae es compute.loadBalancerAdmin, que
   #    además deja administrar balanceadores, reglas y certificados enteros —
   #    demasiado para reemplazar dos grupos. De ahí el rol a medida:
   gcloud iam roles create praxis_despliegue --project="$PROY" \
     --title="Despliegue de PRAXIS" --stage=GA \
     --permissions=compute.healthChecks.use
   gcloud projects add-iam-policy-binding "$PROY" \
     --member="serviceAccount:$SA" \
     --role="projects/$PROY/roles/praxis_despliegue"
   ```

   ⚠️ Los tres se descubren **cuando falla el paso de despliegue**, que es el
   último. Si vas a rehacer esto en otro proyecto, ponlos antes de la primera
   ejecución y te ahorras tres builds completos.
