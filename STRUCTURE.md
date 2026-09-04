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

### `apps/frontend/` — una aplicación Next.js 16 y su librería

**Una sola app, sin `basePath`.** Fueron ocho —un Multi-Zones: el shell y siete
zonas, cada una con su `package.json`, su puerto y su `basePath`— hasta la etapa
de fusión ([docs/PLAN-FUSION-ZONAS.md](docs/PLAN-FUSION-ZONAS.md)). Se juntaron
porque el despliegue nunca las separó: las ocho corrían en el mismo contenedor,
o sea todo el coste de Multi-Zones y ninguno de sus beneficios. **Ninguna URL
cambió al fusionarlas.**

| Carpeta | Qué es |
|---|---|
| `web/` | La aplicación entera. Puerto 4100 |
| `commons/` | Átomos, moléculas y organismos compartidos, el cliente de API y los helpers de sesión |

Dentro de `web/src`:

```
web/src/
├── app/
│   ├── page.tsx                        → la landing pública
│   ├── layout.tsx                      → el <html>, las fuentes y el tema. Uno para todo
│   ├── auth/                           → login, registro, verificación…
│   │   └── api/                        → los diez route handlers de sesión (/auth/api/*)
│   ├── (privado)/                      → las cinco secciones privadas
│   │   ├── layout.tsx                  → el armazón (AppShell). Montado UNA vez
│   │   ├── main/  projects/  chat/  assistant/  admin/
│   │   └── presence-actions.ts
│   └── api/
│       ├── gateway/[...path]/route.ts  → el proxy autenticado, uno para todo
│       ├── webhooks/stripe/route.ts    → 🔴 el webhook. No se toca
│       └── alexa/[...path]/route.ts    → paso al gateway para la skill de voz
├── components/{atoms,molecules,organisms,templates}/
├── lib/{auth,main,projects,admin}/     → utilidades, agrupadas por sección
└── proxy.ts                            → el guard único
```

⚠️ **El grupo `(privado)` no aparece en la URL** —un grupo de rutas nunca lo
hace— y es lo que permite que las cinco secciones compartan un solo armazón. Es
el motivo entero de la fusión: antes cada salto entre secciones remontaba la
barra lateral, el directorio de chats y la conexión SSE.

### `apps/frontend/commons/` — la librería compartida

| Carpeta | Qué contiene |
|---|---|
| `atoms/` | Piezas sin estructura: `Button`, `Input`, `Avatar`, `Badge`, `Select`… |
| `molecules/` | Composiciones reutilizables: `AuthForm`, `DataTable`, `Dialog`, `ThemeToggle`… |
| `organisms/` | Solo lo que usan **≥2 secciones**: `AppLayout`, `ChatPanel`, `LiveNotices`… |
| `api/` | Cliente del gateway, rutas (`routes.ts`) y tipos de dominio |
| `auth/` | Sesión y cliente de servidor. **Código de servidor: nunca se importa desde un componente cliente** |
| `hooks/` | `useAccion`, `useRefrescoAgrupado` y demás |
| `tokens/` | Colores y espaciados como valores de TypeScript |
| `styles/` | `theme.css` — los tokens de Tailwind v4, declarados **una sola vez** |
| `realtime/`, `assistant/`, `billing/`, `theme/`, `template/` | Piezas de cada dominio transversal |

> **Atomic Design con una regla de ascenso:** un organismo sube a
> `commons/organisms/` solo cuando lo usan dos secciones o más. Antes de eso
> vive en `web/src/components/`, junto a la sección que lo usa.
>
> ⚠️ La regla nació cuando las secciones eran aplicaciones distintas y compartir
> obligaba a subir a `commons`. Sigue valiendo por otro motivo: `commons` es lo
> que se lee para saber qué es transversal, y meterlo todo ahí lo convierte en
> una carpeta de todo.

> **La lógica de negocio (fetch, estado, validación) vive solo en las pages.**
> Moléculas y organismos reciben slots `ReactNode` y props.

### `apps/backend/` — un gateway y nueve microservicios

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
    ├── automation/          → :3008 · motor de reglas
    └── billing/             → :3009 · organizaciones, papeles, asientos y planes
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

Vacíos (`.gitkeep`). `stubs/next-ts/` estaba reservado para la plantilla de una
zona nueva del multi-zone; ya no hay zonas nuevas que crear — una sección nueva
es una carpeta dentro de `web/src/app/(privado)/` y una línea en
`PREFIJOS_PRIVADOS`.

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
> infraestructura → `infra/`? ¿Lo usan dos secciones del frontend →
> `apps/frontend/commons/`?
