# Despliegue en Railway

Sustituye a la infraestructura de GCP (`infra/terraform/`, `infra/ci/cloudbuild*.yaml`),
que queda como legado. El coste baja de ~$130-160/mes a ~$5-20/mes.

## La forma

Dos contenedores, un Postgres, un Redis. Nada más.

| Servicio Railway | Qué corre dentro | Imagen | Puerto público |
|---|---|---|---|
| **Postgres** | plugin de Railway | — | privado |
| **Redis** | plugin de Railway | — | privado |
| **`api`** | gateway + los 9 microservicios (pm2, se hablan por `127.0.0.1:300x`) | `infra/docker/images/backend.Dockerfile` | `:3000` |
| **`web`** | web-shell + las 7 zonas Next (pm2, `127.0.0.1:410x`) | `infra/docker/images/frontend.Dockerfile` | `:4100` |

Los Dockerfiles y los supervisores pm2 (`*.pm2.config.cjs`) ya existían para GCP y
sirven tal cual: no hacen nada específico de Google. `api` y `web` se comunican por
la **red privada** de Railway (`<servicio>.railway.internal`), que no cuesta egress.

## Requisitos previos

- Cuenta de Railway (plan Hobby, $5/mes, incluye $5 de uso).
- El repo en GitHub con la app de Railway instalada (se hace desde el dashboard).
- Un `JWT_SECRET` y un `VOICE_JWT_SECRET` nuevos. Genéralos con:
  ```bash
  openssl rand -hex 48
  ```

## Paso a paso (dashboard de Railway)

### 1. Proyecto y repo

1. **New Project → Deploy from GitHub repo →** elige `Ander-tsx/PRAXIS`.
2. Railway crea un servicio a partir del repo. Bórralo o recíclalo — vamos a
   crear los dos a mano para controlar el Dockerfile de cada uno.

### 2. Bases de datos

1. **+ New → Database → Add PostgreSQL.**
2. **+ New → Database → Add Redis.**

Railway les da variables propias (`DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE` para Postgres; `REDIS_URL` para Redis).

### 3. Servicio `api`

1. **+ New → GitHub Repo →** el mismo repo. Nómbralo **`api`**.
2. **Settings → Build:**
   - **Builder:** Dockerfile
   - **Dockerfile Path:** `infra/docker/images/backend.Dockerfile`
   - **Root Directory:** `/` (la raíz del repo — el Dockerfile hace `COPY` desde ahí)
3. **Settings → Deploy:**
   - **Start Command:** vacío (lo pone el Dockerfile: `pm2-runtime`)
   - **Healthcheck Path:** `/api`  ← con el prefijo global; `/` da 404
   - **Pre-Deploy Command:** `bash infra/docker/images/migrar.sh`
     (aplica `prisma migrate deploy` de los 8 servicios con schema antes de cada
     release; es idempotente)
4. **Settings → Networking:**
   - **Public Networking → Generate Domain.** Anota la URL: `https://api-XXXX.up.railway.app`.
   - El **Target Port** debe ser `3000` (Railway lo toma del `EXPOSE`; verifícalo).
5. **Variables** (pestaña Variables del servicio `api`):

   ```
   NODE_ENV=production
   JWT_SECRET=<el que generaste>
   VOICE_JWT_SECRET=<otro distinto>

   # Postgres — referencia a las del plugin
   POSTGRES_HOST=${{Postgres.PGHOST}}
   POSTGRES_PORT=${{Postgres.PGPORT}}
   POSTGRES_USER=${{Postgres.PGUSER}}
   POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
   POSTGRES_DB=${{Postgres.PGDATABASE}}

   # Redis
   REDIS_URL=${{Redis.REDIS_URL}}

   # A dónde vuelve el navegador tras Stripe y qué base llevan los correos.
   # Es la URL PÚBLICA del servicio `web` (paso 4).
   PUBLIC_APP_URL=https://web-XXXX.up.railway.app

   # Asistente (opcional). La clave del proyecto gen-lang-client-0944771364 sigue
   # viva en el free tier. Sin ella, assistant-service no arranca y el resto va.
   GEMINI_API_KEY=<tu clave de aistudio.google.com/apikey>
   GEMINI_MODEL=gemini-flash-latest

   # Correo (opcional). Sin MAIL_API_KEY, credentials-service escribe los enlaces
   # de confirmación en el log en vez de mandarlos.
   MAIL_API_KEY=<tu clave de Resend>
   MAIL_FROM=PRAXIS <no-reply@tu-dominio-verificado>

   # Stripe (opcional). Vacías = facturación apagada y nada se rompe.
   # El WEBHOOK_SECRET es nuevo: se crea al añadir el endpoint en Stripe
   # apuntando a  https://api-XXXX.up.railway.app/api/webhooks/stripe
   #
   # Un precio por plan de autoservicio, y son PRECIOS de Stripe (`price_…`),
   # no productos. Cada uno se crea en el panel de Stripe con su tarifa **por
   # asiento y mes**; el que falte deja su plan visible en la tabla pero **sin
   # botón de compra**, que es lo correcto y no un fallo (ver `stripe.service.ts`).
   #
   # ⚠️ `STRIPE_PRICE_PLUS` ya no existe: PLUS se retiró en 2026-08-26, cuando
   # las dos escaleras se colapsaron en una. Y `STRIPE_PRICE_PRO` **no es el PRO
   # de antes** —aquel era una suscripción por persona, retirada el 2026-09-03—
   # sino el peldaño del catálogo entre Gratis y Equipo.
   STRIPE_SECRET_KEY=
   STRIPE_PRICE_PRO=
   STRIPE_PRICE_TEAM=
   STRIPE_PRICE_BUSINESS=
   STRIPE_WEBHOOK_SECRET=

   # Adjuntos del chat: por defecto en Postgres, sin bucket.
   STORAGE_DRIVER=postgres
   ```

### 4. Servicio `web`

1. **+ New → GitHub Repo →** el mismo repo. Nómbralo **`web`**.
2. **Settings → Build:**
   - **Builder:** Dockerfile
   - **Dockerfile Path:** `infra/docker/images/frontend.Dockerfile`
   - **Root Directory:** `/`
3. **Settings → Deploy → Healthcheck Path:** `/`  (la landing pública responde 200 sin sesión)
4. **Settings → Networking → Public Networking → Generate Domain.**
   Anota: `https://web-XXXX.up.railway.app`. **Este es el sitio.**
   Target Port `4100`.
5. **Variables** del servicio `web`:

   ```
   NODE_ENV=production
   # El mismo JWT_SECRET, EXACTO, que el de `api`. Cada zona verifica la cookie.
   JWT_SECRET=<el mismo del api>
   # Red privada: SSR de las zonas → gateway, sin salir a internet.
   GATEWAY_URL=http://api.railway.internal:3000
   ```

6. **Vuelve al servicio `api`** y pon `PUBLIC_APP_URL` con la URL de `web` que
   acabas de generar.

### 5. Primer arranque: migraciones + cuenta de superadmin

El `migrar.sh` del pre-deploy solo aplica migraciones. La **primera vez** hace
falta sembrar el catálogo de roles y una cuenta de administrador. Una sola vez:

1. Deja que `api` termine su primer deploy (las migraciones ya habrán corrido).
2. En el servicio `api`: **⋯ → Terminal** (o `railway ssh` con la CLI) y ejecuta:
   ```bash
   SEED_SUPERADMIN_EMAIL="tu@correo.com" \
   SEED_SUPERADMIN_PASSWORD="una-contraseña-fuerte" \
   bash /app/migrar.sh --arranque-limpio
   ```
   Esto siembra: el catálogo de roles, **una** cuenta superadmin con esa
   contraseña, y el proyecto de historial fabricado sin encargados. **No** siembra
   las cuentas de demo del repositorio ni «Proyecto PRAXIS Demo».

### 6. CI/CD

Ya está: Railway redepliega **cada push a la rama conectada**. Por defecto es la
que tenías activa al conectar el repo. Para fijarla:

- Servicio `api` y servicio `web` → **Settings → Deploy → Watch Paths / Branch → `main`.**

No hace falta GitHub Actions ni tokens: la integración nativa de Railway hace el
build y el deploy. El `migrar.sh` del pre-deploy corre en cada release.

## Mapa de variables (resumen)

| Variable | `api` | `web` | De dónde sale |
|---|:-:|:-:|---|
| `JWT_SECRET` | ✅ | ✅ | `openssl rand -hex 48`, **idéntica en los dos** |
| `VOICE_JWT_SECRET` | ✅ | — | `openssl rand -hex 48` |
| `POSTGRES_*` | ✅ | — | plugin Postgres (`${{Postgres.PG*}}`) |
| `REDIS_URL` | ✅ | — | plugin Redis (`${{Redis.REDIS_URL}}`) |
| `GATEWAY_URL` | — | ✅ | `http://api.railway.internal:3000` |
| `PUBLIC_APP_URL` | ✅ | — | dominio público de `web` |
| `GEMINI_API_KEY` | ✅ (opc.) | — | aistudio.google.com/apikey |
| `MAIL_API_KEY` / `MAIL_FROM` | ✅ (opc.) | — | Resend |
| `STRIPE_*` | ✅ (opc.) | — | dashboard de Stripe (webhook secret nuevo) |
| `NEXT_PUBLIC_PRECIO_*` | — | ✅ (opc.) | cartelería del precio, sin símbolo. Uno por plan de autoservicio: `_PRO`, `_TEAM`, `_BUSINESS` |

⚠️ **Las `NEXT_PUBLIC_*` son build-args, no variables de arranque.** Next las
**incrusta en el JavaScript al construir**, así que ponerlas solo como variable
del servicio no hace nada — y sin ningún error: la tabla sale con los planes, sus
botones y **sin cifra**. Están declaradas como `ARG` en
`infra/docker/images/frontend.Dockerfile` para que Railway las inyecte en el
build; si añades un plan nuevo, hay que añadir su `ARG` ahí además de la
variable.

⚠️ **Y son cartelería: no deciden lo que se cobra.** Lo que se cobra es el
`price_…` que tiene el gateway en `STRIPE_PRICE_*`. Si cambias una tarifa en
Stripe, acuérdate de cambiar las dos — nada las mantiene sincronizadas.

## Cosas que cambian respecto a GCP

- **Google login:** el `GOOGLE_CLIENT_ID` estaba atado al proyecto de GCP borrado
  y al origen `https://usepraxis.space`. Se despliega **sin él** — el botón de
  Google no se dibuja y la entrada con contraseña funciona igual. Para reactivarlo:
  crear un cliente OAuth nuevo con el dominio de Railway en los orígenes
  autorizados, pasarlo como **build-arg** (`--build-arg GOOGLE_CLIENT_ID=...` en el
  build de `web`) **y** como variable `GOOGLE_CLIENT_ID` en `api`.
- **Stripe:** el `whsec_` viejo era del endpoint de `usepraxis.space`. Hay que crear
  un endpoint nuevo en Stripe (`https://api-XXXX.up.railway.app/api/webhooks/stripe`)
  y usar su secreto. Mientras tanto, deja las claves de Stripe vacías.
- **Sin Cloud NAT, sin balanceadores, sin Artifact Registry:** Railway construye la
  imagen y la sirve. `PUBLIC_APP_URL` y `GATEWAY_URL` son lo único que hay que
  cablear a mano.
- **Ahorro extra:** en cada servicio, **Settings → Serverless (App Sleeping)** para
  que pare sin tráfico y despierte al primer request. Para un demo, baja el coste
  casi a cero.
