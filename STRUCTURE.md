# Estructura del proyecto

Para qué sirve cada carpeta y qué vive dentro. Es la referencia que se consulta
**antes de crear un archivo nuevo**, para no abrir una carpeta paralela a una que
ya existe.

> Este documento describe el repositorio **como está**, no como se planeó. Si
> encuentras una discrepancia, gana el repositorio: corrige este archivo.

---

## Raíz

```
PRAXIS/
├── apps/            → todo el código que se ejecuta
├── packages/        → configuración compartida entre apps
├── infra/           → Docker, Terraform y Cloud Build
├── e2e/             → las pruebas de punta a punta (Playwright)
├── scripts/         → automatización del repositorio
├── docs/            → documentación técnica
├── stubs/           → plantillas de scaffolding
├── security/        → reservado (vacío)
├── .planning/       → planificación por etapas
├── .claude/         → configuración de Claude Code para este repositorio
├── CLAUDE.md        → contexto de trabajo: convenciones y trampas conocidas
├── STRUCTURE.md     → este archivo
├── README.md        → presentación, instalación y comandos
├── turbo.json       → grafo de tareas del monorepo
├── biome.json       → formato y linting (2 espacios, ancho 100)
└── pnpm-workspace.yaml
```

---

## `apps/` — el código que se ejecuta

### `apps/frontend/` — ocho aplicaciones Next.js 16

**Multi-Zones, no Module Federation.** Cada zona es una app de Next independiente
con su propio `basePath`, su propio `package.json` y su propio puerto. El
`web-shell` las sirve todas bajo un único origen mediante `rewrites()`. Cada una
se puede levantar sola.

| Carpeta | Ruta pública | Puerto | Qué es |
|---|---|---|---|
| `web-shell/` | `/` | 4100 | La cáscara: landing pública, `rewrites()` y renovación de sesión. **No sirve páginas de negocio.** |
| `auth-front/` | `/auth` | 4101 | Entrar, registrarse, Google OAuth, verificación de correo |
| `dashboard-front/` | `/dashboard` | 4102 | Panel, avisos, invitaciones, ajustes, vinculación con Alexa |
| `projects-front/` | `/projects` | 4103 | Catálogo, tablero Kanban, tareas, miembros, reglas |
| `reports-front/` | `/reports` | 4104 | Análisis: lienzo de gráficos y pronóstico Monte Carlo |
| `admin-front/` | `/admin` | 4105 | Administración de la plataforma (rol global) |
| `chat-front/` | `/chat` | 4106 | Mensajería en tiempo real por SSE |
| `assistant-front/` | `/assistant` | 4107 | PRAX, el asistente conversacional |

Dentro de cada zona:

```
<zona>/src/
├── app/                     → rutas del App Router. Aquí vive la lógica de negocio
│   └── api/gateway/[...path]/route.ts   → el proxy autenticado de la zona
├── components/
│   ├── organisms/           → piezas con estructura, propias del dominio de la zona
│   └── templates/           → composición de una pantalla
├── lib/                     → utilidades de la zona
└── proxy.ts                 → el guard de la zona
```

### `apps/frontend/commons/` — lo que comparten las ocho zonas

| Carpeta | Qué contiene |
|---|---|
| `atoms/` | Piezas sin estructura: `Button`, `Input`, `Avatar`, `Badge`, `Select`… |
| `molecules/` | Composiciones reutilizables: `AuthForm`, `DataTable`, `Dialog`, `ThemeToggle`… |
| `organisms/` | Solo lo que usan **≥2 zonas**: `AppLayout`, `ChatPanel`, `LiveNotices`… |
| `api/` | Cliente del gateway, rutas (`routes.ts`) y tipos de dominio |
| `auth/` | Sesión y cliente de servidor. **Código de servidor: nunca se importa desde un componente cliente** |
| `hooks/` | `useAccion`, `useRefrescoAgrupado` y demás |
| `tokens/` | Colores y espaciados como valores de TypeScript |
| `styles/` | `theme.css` — los tokens de Tailwind v4, declarados **una sola vez** |
| `realtime/`, `assistant/`, `billing/`, `theme/`, `template/` | Piezas de cada dominio transversal |

> **Atomic Design con una regla de ascenso:** un organismo sube a
> `commons/organisms/` solo cuando lo usan dos zonas o más. Antes de eso vive en
> la zona que lo usa.

> **La lógica de negocio (fetch, estado, validación) vive solo en las pages.**
> Moléculas y organismos reciben slots `ReactNode` y props.

### `apps/backend/` — un gateway y ocho microservicios

```
apps/backend/
├── gateway/                 → :3000 · la única puerta HTTP pública
└── services/
    ├── credentials/         → :3001 · identidad, contraseñas, JWT, sesiones
    ├── permissions/         → :3002 · roles globales y de proyecto, auditoría
    ├── projects/            → :3003 · proyectos, espacios, tableros, chat, SSE
    ├── tasks/               → :3004 · tareas, checklists, etiquetas, adjuntos
    ├── reports/             → :3005 · agregador. Sin tablas propias
    ├── assistant/           → :3006 · el único que habla con Gemini
    ├── alexa/               → :3007 · solo lectura, para la skill de voz
    └── automation/          → :3008 · motor de reglas
```

Los servicios **no se hablan por HTTP**: el gateway les habla por **TCP nativo de
NestJS** (`Transport.TCP`). Redis es para sesiones, caché y el stream de hechos,
no para el transporte entre servicios.

Dentro de un servicio:

```
services/<x>/
├── prisma/
│   ├── schema.prisma        → su schema de PostgreSQL, aislado del resto
│   ├── migrations/          → sus migraciones, independientes
│   └── seed.ts              → sus datos de arranque
└── src/
    ├── main.ts              → arranque del microservicio TCP
    ├── app.module.ts
    ├── <dominio>/           → módulo, controlador (patrones TCP) y servicio
    └── generated/           → cliente Prisma. NO versionado: `pnpm prisma:generate`
```

### `apps/backend/commons/` — librerías internas del backend

| Paquete | Qué publica |
|---|---|
| `contracts/` | Los DTOs y los patrones de mensaje TCP. Es **el contrato entre servicios** |
| `observability/` | El logger Pino compartido |
| `domain-events/` | El tipo y la validación de un hecho de dominio |

> Los tres publican `dist/`. Por eso `pnpm build:shared` es obligatorio antes de
> arrancar el backend: sin él, los servicios mueren con
> `Cannot find module '@praxis/contracts'`.

### `apps/PraxisSkill/` — la skill de Alexa

La Lambda, el modelo de interacción (`es-MX` y `en-US`) y la plantilla de
CloudFormation. Habla con el gateway por `voiceToken`, nunca con la base.

### `apps/addons/project-dev-stack/`

Vacío (`.gitkeep`). El CLI de desarrollo acabó viviendo en `scripts/dev-cli/`.

---

## `packages/` — configuración compartida

| Carpeta | Qué contiene |
|---|---|
| `shared-devtools/tsconfig/` | Las bases de TypeScript: `base`, `nestjs`, `nextjs` |
| `shared-devtools/database/` | Utilidades de base compartidas |
| `shared-protos/`, `shared-schemas/` | Vacíos (`.gitkeep`). Reservados |

> Regla: si lo necesitan dos apps de **capas distintas** → `packages/`. Si solo
> lo necesita el backend → `apps/backend/commons/`.

---

## `infra/` — infraestructura

| Carpeta | Qué contiene | Estado |
|---|---|---|
| `docker/compose/` | `docker-compose.yml`: PostgreSQL 16 y Redis 7 para local | **En uso** |
| `docker/images/` | Los `Dockerfile` multi-etapa | **En uso** |
| `terraform/` | El aprovisionamiento completo de GCP: red, Cloud SQL, Redis, MIGs, secretos | **En uso** |
| `ci/` | `cloudbuild.yaml` y `cloudbuild-main.yaml` | **En uso** |
| `k8s/`, `observability/`, `ci/jenkins/` | Vacíos (`.gitkeep`) | Reservados |

El despliegue real es **GCP con Cloud Build y MIGs**, no Kubernetes.

---

## `e2e/` — pruebas de punta a punta

Playwright, en la raíz y no dentro de `apps/`, porque no es una aplicación: es la
suite que cruza todas.

```
e2e/
├── tests/api/               → 17 ficheros · el contrato del gateway, sin navegador
├── tests/ui/                → 8 ficheros · recorridos reales en Chromium
├── fixtures/                → altas, sesiones, sembrado y el manejo del 429 de login
├── limpieza.ts              → barrido de las cuentas que crea cada corrida
└── playwright.config.ts     → dos proyectos: `api` primero, `ui` después
```

---

## `scripts/` — automatización del repositorio

| Archivo | Qué hace |
|---|---|
| `dev-cli/` | `pnpm dev:cli`: el asistente que levanta el entorno y **espera a que cada puerto responda** |
| `grant-superadmin.sql` | Concede el rol global de administración. Idempotente |
| `bootstrap_scaffolding.sh` | El script que generó el esqueleto inicial |

---

## `docs/` — documentación técnica

| Carpeta | Qué contiene |
|---|---|
| `frontend/` | `ESTADO-ACTUAL` (arquitectura y deuda), `CONTRATO-API`, `PENDIENTES-BACKEND`, los planes de cada etapa |
| `backend/` | Modelo de permisos y contratos de cada servicio |
| `despliegue/` | La guía de GCP, paso a paso |
| `assets/` | Capturas y diagramas |
| `AUDITORIA.md` | El registro de la auditoría de seguridad y corrección |

---

## `stubs/` y `security/`

Vacíos (`.gitkeep`). `stubs/next-ts/` está reservado para la plantilla de una
zona nueva; el procedimiento real está escrito en ESTADO-ACTUAL §17.7.

---

## `.planning/` y `.claude/`

`.planning/` guarda la planificación por etapas. `.claude/` es la configuración
de Claude Code para este repositorio. Ninguno de los dos entra en el build.

---

## Convenciones que atraviesan todo el árbol

**El código en inglés, los comentarios en español.** No es un punto medio: es la
convención.

| Qué | Idioma |
|---|---|
| Variables, funciones, tipos, props, constantes, nombres de fichero | **Inglés** |
| Comentarios, JSDoc, documentos y mensajes de commit | **Español** |
| Textos que ve el usuario y descripciones de Swagger | **Español** |

Un identificador es una interfaz: lo lee quien llama, muchas veces sin abrir el
cuerpo. Un comentario es una explicación: lo lee quien ya está dentro.

**Los `.env` no se versionan.** Cada app trae su `.env.example` con todas las
variables documentadas. El del frontend es `.env.local`, no `.env`: Next no lee
el segundo en desarrollo.

---

## Regla de oro

> ¿No sabes dónde va un archivo? ¿Es código que se ejecuta → `apps/`? ¿Lo
> comparten dos capas → `packages/`? ¿Es documentación → `docs/`? ¿Es
> infraestructura → `infra/`? ¿Lo usan dos zonas del frontend →
> `apps/frontend/commons/`?
