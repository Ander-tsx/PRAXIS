# PRAXIS

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js 16 + TypeScript · **Multi-Zones** (`basePath` + `rewrites()`) |
| Backend | NestJS + PostgreSQL (Prisma) + Redis · transporte TCP |
| Monorepo | pnpm workspaces + Turborepo |

> No usamos Module Federation. Cada microfrontend es una app Next independiente
> con su propio `basePath`, y `web-shell` las publica bajo un solo origen
> mediante `rewrites()`. Se entra siempre por el shell (4100), nunca por el
> puerto de una zona.

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Puertos

| Servicio | Puerto |
|---|---|
| gateway (HTTP) | 3000 |
| credentials-service | 3001 |
| permissions-service | 3002 |
| projects-service | 3003 |
| tasks-service | 3004 |
| reports-service | 3005 |
| assistant-service | 3006 |
| alexa-service | 3007 |
| web-shell | 4100 |
| auth-front | 4101 |
| dashboard-front | 4102 |
| projects-front | 4103 |
| reports-front | 4104 |

---

# Primer arranque

Los ocho pasos, en orden. Ninguno es opcional.

## 1. Instalar dependencias

```bash
pnpm install
```

## 2. Crear los archivos `.env`

Sin esto no arranca nada. Hay que crear **12 archivos**. Cada servicio trae su
`.env.example` como plantilla; los valores reales (JWT_SECRET, GEMINI_API_KEY,
credenciales SMTP) se comparten por fuera del repositorio, nunca se versionan.

Backend — copiar el `.env.example` de cada carpeta a `.env` y rellenar:

- `apps/backend/gateway/.env`
- `apps/backend/services/credentials/.env`
- `apps/backend/services/permissions/.env`
- `apps/backend/services/projects/.env`
- `apps/backend/services/tasks/.env`
- `apps/backend/services/reports/.env`
- `apps/backend/services/assistant/.env`
- `apps/backend/services/alexa/.env`

Frontend — crear un `.env.local` en cada zona:

- `apps/frontend/web-shell/.env.local` → `GATEWAY_URL`, `JWT_SECRET`,
  `DASHBOARD_FRONT_URL`, `PROJECTS_FRONT_URL`, `REPORTS_FRONT_URL`
- `apps/frontend/auth-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`, `NODE_ENV`
- `apps/frontend/dashboard-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`
- `apps/frontend/projects-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`
- `apps/frontend/reports-front/.env.local` → `GATEWAY_URL`, `JWT_SECRET`

Reglas que rompen el arranque si se ignoran:

- **`JWT_SECRET` debe ser idéntico** en `gateway`, `credentials-service` y las
  cinco zonas del frontend. Si uno solo difiere, el login devuelve token pero
  toda petición posterior da 401.
- **`VOICE_JWT_SECRET`** (alexa-service) es un secreto **distinto**, no se
  reutiliza el de la plataforma. Generar con `openssl rand -hex 48`.
- **`GEMINI_API_KEY` vive únicamente** en `services/assistant/.env`. Nunca en el
  gateway ni en una variable `NEXT_PUBLIC_*`.
- `infra/docker/compose/.env` **no hace falta**: el compose ya trae valores por
  defecto (`praxis` / `praxis123` / `praxis`).

## 3. Levantar la infraestructura

```bash
docker compose -f infra/docker/compose/docker-compose.yml up -d
```

Levanta PostgreSQL (5432) y Redis (6379).

## 4. Generar los clientes de Prisma

```bash
for s in credentials permissions projects tasks assistant alexa; do
  pnpm --filter @praxis/$s-service exec prisma generate
done
```

El cliente se genera dentro de `src/generated/` de cada servicio y **no está
versionado**: en un árbol recién clonado este paso es obligatorio, o el servicio
arranca y muere con `Cannot find module '../generated/prisma-client'`.

`reports-service` se excluye a propósito: no tiene esquema propio, lee de
tasks-service y projects-service por TCP y cachea en Redis.

## 5. Recrear las tablas

```bash
for s in credentials projects permissions tasks assistant alexa; do
  pnpm --filter @praxis/$s-service exec prisma migrate reset --force --skip-seed
done
```

⚠️ Borra todos los datos de la base. Solo para desarrollo.

## 6. Ejecutar los seeds

```bash
for s in permissions credentials projects tasks; do
  pnpm --filter @praxis/$s-service run prisma:seed
done
```

Solo esos cuatro servicios tienen seed. Deja la base con:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@praxis.dev` | `Admin@12345!` | Admin |
| `maria@praxis.dev` | `User@12345!` | User |
| `carlos@praxis.dev` | `User@12345!` | User |

Más **dos proyectos**:

- **Proyecto PRAXIS Demo** — 1 espacio, 1 tablero de 4 columnas y 7 tareas con
  etiquetas, checklists y comentarios.
- **Sprint histórico (datos de demostración)** — 180 tareas y 16 semanas de
  historial fabricado, que es lo que necesita la sección de **Análisis** para
  tener algo que enseñar. El historial solo se captura hacia adelante, así que
  sin esto los siete informes salen vacíos en una base recién creada. Lo genera
  `prisma/seed-events.ts`, enganchado al `prisma:seed` de tasks-service.

⚠️ Los eventos del segundo llevan `actorId = 00000000-0000-0000-0000-000000000000`:
son sintéticos y no miden trabajo real. Para regenerar solo ese historial:
`pnpm --filter @praxis/tasks-service run prisma:seed:events`.

## 7. Compilar el monorepo

```bash
pnpm build
```

**Obligatorio antes de arrancar el backend.** `@praxis/contracts` y
`@praxis/observability` (en `apps/backend/commons/`) publican su `main` como
`dist/index.js`, y todos los microservicios los importan. Sin este paso mueren
con `Cannot find module '@praxis/contracts'`.

## 8. Arrancar

Backend (gateway + los 7 microservicios):

```bash
npx turbo run dev --filter=@praxis/gateway --filter="@praxis/*-service"
```

Frontend (las 5 zonas):

```bash
pnpm dev:frontend
```

Abrir **http://localhost:4100**. Swagger en http://localhost:3000/api/docs.

---

## Uso diario

Con la base ya creada, basta con:

```bash
docker compose -f infra/docker/compose/docker-compose.yml up -d
npx turbo run dev --filter=@praxis/gateway --filter="@praxis/*-service"
pnpm dev:frontend
```

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev:cli` | **Asistente interactivo.** Levanta lo que elijas y comprueba que arrancó. |
| `pnpm dev:backend` | Levanta el gateway y los 7 microservicios. |
| `pnpm dev:frontend` | Levanta las 5 zonas del frontend. |
| `pnpm build` | Compila todo el monorepo (Turborepo resuelve el orden). |
| `pnpm lint` | Biome en la raíz, ESLint en `web-shell`. |
| `pnpm test` | Tests unitarios de todos los paquetes (no incluye los E2E). |
| `pnpm format` | Formatea con Biome. |
| `pnpm docker:up` | Levanta PostgreSQL y Redis. |
| `pnpm docker:down` | Detiene PostgreSQL y Redis. |
| `pnpm docker:logs` | Logs de la infraestructura. |
| `pnpm prisma:reset` | Recrea las tablas de los 6 servicios con esquema. **Borra los datos.** |
| `pnpm prisma:seed` | Ejecuta los seeds de los 4 servicios que los tienen. |
| `pnpm e2e` | Pruebas end-to-end. Ver la sección de abajo. |

⚠️ `pnpm prisma:generate` y `pnpm prisma:deploy` usan el filtro
`@praxis/*-service`, que incluye a `reports-service` — un servicio sin Prisma —
y abortan con `Command "prisma" not found`. Usa los bucles de los pasos 4 y 5
hasta que se corrijan. `prisma:reset` y `prisma:seed` sí llevan la lista
explícita y funcionan.

---

# Pruebas end-to-end

Viven en [`e2e/`](e2e/) y usan **Playwright**. Cubren dos cosas a la vez: el
contrato del gateway (sin navegador) y los recorridos de interfaz sobre el
multi-zone (en Chromium).

### Por qué Playwright y no Cypress

La mitad de lo que hay que verificar aquí **no es interfaz**: es el sobre
`{success, data, meta}`, los guards y la semántica de los tokens. Playwright
ejecuta las pruebas de API y las de navegador en la misma suite, con el mismo
runner y el mismo informe; con Cypress harían falta dos herramientas. Además,
Cypress corre dentro del propio navegador y arrastra restricciones de origen que
un multi-zone provoca constantemente.

## Preparación (una sola vez)

```bash
pnpm install
pnpm e2e:instalar
```

`e2e:instalar` descarga el Chromium que usa Playwright (~130 MB). No hace falta
repetirlo salvo que cambie la versión.

## Antes de lanzarlas: el stack tiene que estar arriba

Las pruebas **no levantan nada**: hablan con el sistema real, y esa es su razón
de ser. Con el proyecto ya configurado (pasos 1 a 7 de arriba):

```bash
pnpm docker:up
pnpm dev:backend
pnpm dev:frontend
```

Y en **otra terminal**, con los puertos 3000 y 4100–4104 ya respondiendo:

```bash
pnpm e2e
```

⚠️ Necesitan los **seeds ejecutados** (`pnpm prisma:seed`): varias pruebas entran
con `admin@praxis.dev`. Si el login falla en cadena, es esto.

## Los cuatro comandos, y cuándo se usa cada uno

| Comando | Qué corre | Cuándo |
|---|---|---|
| `pnpm e2e:regresion` | Todo **menos** `@security` | **El de antes y después de tocar código.** Tiene que estar verde siempre. |
| `pnpm e2e:seguridad` | Solo `@security` | Mide el endurecimiento pendiente. Nace en rojo a propósito. |
| `pnpm e2e:api` | Solo el contrato del gateway | Cambios de backend. Segundos, sin navegador. |
| `pnpm e2e:ui` | Solo los recorridos de navegador | Cambios de interfaz. |
| `pnpm e2e` | Las dos suites enteras | Antes de abrir un PR. |
| `pnpm e2e:report` | Abre el informe HTML de la última ejecución | Para leer un fallo con su traza. |

### La separación `@security` es deliberada

Las pruebas etiquetadas `@security` describen **el comportamiento que queremos,
no el que hay**. Cada una fija un hallazgo de la auditoría y se pone verde cuando
ese hallazgo se corrige.

Mezclarlas con el resto perdería las dos señales a la vez: un rojo esperado tapa
un rojo nuevo. Por eso `e2e:regresion` es la red de seguridad —verde antes de un
cambio y verde después— y `e2e:seguridad` es el marcador del endurecimiento.

## Qué cubren

**API** (`e2e/tests/api/`, sin navegador):

| Archivo | Qué fija |
|---|---|
| `01-contrato` | El sobre `{success, data, meta}`, los errores, `forbidNonWhitelisted`, la forma de los listados |
| `02-auth` | Registro, login, refresh, logout, firma manipulada, códigos que no distinguen usuario de contraseña |
| `03-autorizacion` | Aislamiento entre cuentas, el bypass de `projectId` en el cuerpo, `AccountOwnerGuard`, permisos y jerarquía |
| `04-proyectos` | Ciclo de vida, `name` único por dueño, `slug` único global, sufijo aleatorio, `:idOrSlug` |
| `05-tablero` | Espacio → tablero → columnas → tarea → mover, encargados, checklists, comentarios, informes |
| `06-administracion` | La puerta de `/api/admin`: una cuenta corriente no lee ni suspende nada; el rol global Admin sí |
| `07-seguridad` | 🏷️ `@security` — control de acceso en rutas anidadas, tipo de token, límite de intentos, cabeceras |

**Interfaz** (`e2e/tests/ui/`, en Chromium):

| Archivo | Qué fija |
|---|---|
| `01-publico` | Landing, atajos `/login` y `/signup`, los rewrites hacia auth-front, validación de cliente |
| `02-guards` | Las **cuatro** zonas privadas redirigen al login — la raíz y una ruta interior por separado — y el panel de administración no se ve sin rol |
| `03-sesion` | Crear cuenta, cookie httpOnly, navegar entre zonas, salir, crear un proyecto, el slug en la URL |

⚠️ En `02-guards`, la raíz de cada zona va en su propia prueba **a propósito**:
el `matcher` de Next con lookahead negativo no casa la raíz, así que hay que
añadir `'/'` como entrada aparte. Ya pasó que `/dashboard/perfil` redirigía y
`/dashboard` a secas se servía sin guard.

## Escribir una prueba nueva

Los ayudantes están en `e2e/fixtures/`:

- `api.ts` — `registrar()`, `entrar()`, `crearProyecto()`, y `data()` / `error()`
  para desenvolver el sobre sin repetir el bloque en cada prueba.
- `mundo.ts` — `crearMundo()` monta un proyecto completo y utilizable (rol,
  espacio, tablero, tres columnas) en una llamada. `darDeAlta()` mete a alguien
  con los permisos que le pases.
- `ui.ts` — `crearCuentaYEntrar()` y los localizadores de los formularios.

⚠️ En los formularios, **localiza por `id`** (`#email`, `#password`), no con
`getByLabel`. El botón de mostrar contraseña lleva `aria-label="Mostrar
contraseña"` y `getByLabel('Contraseña')` casa con los dos —y con «Confirmar
contraseña» en el registro—, así que Playwright falla por modo estricto sin que
haya nada roto.

⚠️ **No añadas `dependencies` entre proyectos de Playwright.** Un proyecto
listado ahí se ejecuta entero **ignorando los filtros**, y eso rompe la
separación `@security`: con `dependencies: ['api']` puesto, `--grep-invert
@security` devolvía las 95 pruebas en lugar de las 81. El orden ya lo da la
declaración.

## Si algo falla

| Síntoma | Causa |
|---|---|
| Todo falla con `ECONNREFUSED` | El stack no está levantado. |
| El login falla en cadena | Faltan los seeds (`pnpm prisma:seed`). |
| `browserType.launch: Executable doesn't exist` | Falta `pnpm e2e:instalar`. |
| Solo fallan las `@security` | Es lo esperado mientras el hallazgo siga abierto. |
| Un fallo que no se reproduce | Las pruebas comparten base de datos y corren con `workers: 1` a propósito. Si añadiste paralelismo, quítalo. |
| Un login falla con «¿Se ejecutaron los seeds?» | Puede ser el límite de intentos: `/auth/login` corta a los 10 por minuto y la propia suite lo gasta. `entrar()` reintenta, pero **`06-administracion` va antes que `07-seguridad` a propósito** — si reordenas los archivos, vuelve. |

### `pnpm dev:cli` — el atajo para el día a día

Hace los pasos 3 a 8 preguntando qué quieres, y **espera a que cada servicio
responda en su puerto** antes de dar el arranque por bueno. Con nueve procesos
escupiendo logs a la vez, saber cuál no llegó a levantar es la mitad del
trabajo.

```bash
pnpm dev:cli
```

Trae cuatro presets —todo, mínimo, solo backend, solo frontend— o selección a
mano. Después deja un prompt:

| Comando | Qué hace |
|---|---|
| `status` | Estado real, comprobando los puertos uno a uno. |
| `rs <servicio\|all>` | Reinicia. Hace falta tras recompilar `contracts`. |
| `stop` / `start` | Detiene o vuelve a arrancar algo suelto. |
| `exit` | Detiene todo y sale sin dejar huérfanos. |

Necesita una terminal interactiva: para CI o scripts, los comandos de arriba.

## Si algo falla

| Síntoma | Causa |
|---|---|
| `Cannot find module '@praxis/contracts'` | Falta el paso 7 (`pnpm build`). |
| `Cannot find module '../generated/prisma-client'` | Falta el paso 4 (`prisma generate`). |
| Login OK pero todo devuelve 401 | `JWT_SECRET` distinto entre gateway, credentials y la zona. |
| La zona de Reportes va vacía | `reports-service` (3005) no está levantado. |
| El asistente responde error | Falta `GEMINI_API_KEY` en `services/assistant/.env`. |
| `nest: command not found` | Se está lanzando `nest` fuera de pnpm; usar siempre `pnpm --filter ... run dev`. |

Si haces `docker compose down -v`, hay que repetir los pasos 5 y 6.

## Estructura

Ver `STRUCTURE.md` y `docs/` para la arquitectura detallada.
