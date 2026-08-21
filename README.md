<div align="center">

![Praxis Banner](docs/assets/praxis-banner.png)
<!-- docs/assets/praxis-banner.png | Logo de PRAXIS centrado sobre fondo oscuro limpio, tipografía sans-serif moderna | 1280×640, horizontal | Imagen estática PNG -->

# PRAXIS

**Gestión de proyectos ágil con tableros Kanban, reportes predictivos y asistente de voz.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#-stack-tecnológico)
[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white)](#-stack-tecnológico)
[![NestJS](https://img.shields.io/badge/NestJS_11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](#-stack-tecnológico)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](#-stack-tecnológico)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](#-stack-tecnológico)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#-licencia)

</div>

---

# <img src="https://api.iconify.design/lucide/list.svg?color=%233b82f6" width="24" height="24" alt="TOC"> Tabla de contenido

- [PRAXIS](#praxis)
- [ Tabla de contenido](#-tabla-de-contenido)
- [ Sobre el proyecto](#-sobre-el-proyecto)
- [ Arquitectura](#-arquitectura)
  - [Visión general](#visión-general)
  - [Infraestructura en producción](#infraestructura-en-producción)
- [ Stack tecnológico](#-stack-tecnológico)
- [ Estructura del proyecto](#-estructura-del-proyecto)
- [ Requisitos previos](#-requisitos-previos)
- [ Instalación y configuración](#-instalación-y-configuración)
  - [Opción A: CLI interactivo (recomendado)](#opción-a-cli-interactivo-recomendado)
  - [Opción B: Paso a paso](#opción-b-paso-a-paso)
- [ Uso y comandos](#-uso-y-comandos)
  - [Desarrollo](#desarrollo)
  - [Base de datos](#base-de-datos)
  - [Calidad](#calidad)
- [ Variables de entorno](#-variables-de-entorno)
- [ Pruebas](#-pruebas)
- [ Despliegue](#-despliegue)
- [ Capturas de pantalla](#-capturas-de-pantalla)
- [ Contribuciones](#-contribuciones)
- [ Licencia](#-licencia)

---

# <img src="https://api.iconify.design/lucide/rocket.svg?color=%233b82f6" width="24" height="24" alt="Sobre"> Sobre el proyecto

PRAXIS es una plataforma de gestión de proyectos construida sobre una arquitectura SOFEA (Service-Oriented Front-End Architecture). Combina tableros Kanban interactivos, un sistema de permisos granular de tres capas, reportes con pronósticos Monte Carlo, chat en tiempo real con SSE, automatizaciones que reaccionan a lo que pasa en el tablero, facturación con Stripe y un asistente conversacional impulsado por Gemini — accesible también por voz a través de una skill de Alexa.

El frontend se organiza como **7 microfrontends Multi-Zone** de Next.js 16 más el `web-shell` que los sirve: cada zona es una aplicación independiente con su propio `basePath`, servida a través del shell mediante `rewrites()`. El backend son **8 microservicios NestJS** que se comunican por TCP nativo detrás de un API Gateway único.

Las automatizaciones no son un botón: `tasks` y `projects` escriben cada hecho en su *outbox*, un publicador lo vuelca en un stream de Redis y `automation` lo consume y evalúa las reglas del proyecto. Diez disparadores —cuatro de barrido y seis reactivos— y siete acciones que escriben por los mismos endpoints que usa la interfaz, con los permisos de quien escribió la regla. Ninguna regla abre una ruta de escritura nueva.

![Demo del producto](docs/assets/product-demo.gif)
<!-- docs/assets/product-demo.gif | Recorrido corto: login → dashboard con métricas → abrir proyecto → tablero Kanban con drag-and-drop → vista de reportes | 1280×720, horizontal | GIF animado (~15 s) -->

---

# <img src="https://api.iconify.design/lucide/blocks.svg?color=%233b82f6" width="24" height="24" alt="Arquitectura"> Arquitectura

## Visión general

```mermaid
flowchart TB
    subgraph Clientes
        Browser["Navegador"]
        AlexaDevice["Alexa"]
    end

    subgraph shell["web-shell :4100"]
        Landing["Landing 3D"]
        Rewrites["rewrites()"]
    end

    subgraph zones["Microfrontends Next.js 16"]
        Auth["auth-front :4101\n/auth"]
        Dash["dashboard-front :4102\n/dashboard"]
        Proj["projects-front :4103\n/projects"]
        Rep["reports-front :4104\n/reports"]
        Adm["admin-front :4105\n/admin"]
        Chat["chat-front :4106\n/chat"]
        AsstF["assistant-front :4107\n/assistant"]
    end

    subgraph gw["API Gateway :3000"]
        Swagger["Swagger /api/docs"]
        JWT["JWT + Passport"]
        Throttle["Rate Limiting"]
        StripeWH["Stripe Webhooks"]
    end

    subgraph services["Microservicios NestJS — TCP"]
        Cred["credentials :3001\nIdentidad · JWT · Sesiones"]
        Perm["permissions :3002\nRoles globales · Auditoría"]
        ProjS["projects :3003\nProyectos · Boards · Chat · SSE"]
        Task["tasks :3004\nTareas · Checklists · Labels"]
        RepS["reports :3005\nAgregador · Monte Carlo"]
        Asst["assistant :3006\nGemini · Propuestas"]
        Alex["alexa :3007\nSolo lectura · Voz"]
        Automation["automation :3008\nMotor reactivo · 10 disparadores · 7 acciones"]
    end

    subgraph data["Datos"]
        PG[("PostgreSQL 16\n7 schemas aislados")]
        Redis[("Redis 7\nSesiones · Caché · SSE · Stream de hechos")]
    end

    Browser --> shell
    Rewrites --> zones
    zones -->|proxy autenticado| gw
    AlexaDevice -->|Lambda → voiceToken| gw
    gw -->|TCP| services
    Cred & Perm & ProjS & Task & Alex & Asst & Automation --> PG
    RepS -.->|"sin BD propia"| Task & ProjS
    Cred & ProjS & Automation --> Redis
    Task & ProjS -.->|"outbox → stream de hechos"| Automation
```

> [!NOTE]
> Los microservicios se comunican con el gateway mediante **TCP nativo de NestJS** (`Transport.TCP`), no Redis pub/sub. Redis se usa exclusivamente para sesiones (`auth:sessions:<userId>`), caché de tableros y el pub/sub de notificaciones SSE.

## Infraestructura en producción

La plataforma se despliega en **Google Cloud Platform**. Consulta el esquema completo de infraestructura:

![Infraestructura en GCP](docs/assets/infrastructure-google.png)
<!-- docs/assets/infrastructure-google.png | Ya existe — esquema de la infraestructura cloud en GCP -->

<details>
<summary><b>Componentes de infraestructura</b></summary>

| Componente | Recurso GCP | Detalle |
| :--- | :--- | :--- |
| Backend | MIG regional (e2-medium, 1–3 réplicas) | PM2 supervisa los 9 procesos Node.js: el gateway y los 8 microservicios |
| Frontend | MIG regional (e2-medium, 1–3 réplicas) | PM2 supervisa las 8 apps Next.js: el shell y las 7 zonas |
| Base de datos | Cloud SQL PostgreSQL 16 (IP privada) | Backups 7 días, acceso exclusivo por VPC |
| Caché/Sesiones | VM e2-micro con Redis 7 | Firewall solo desde el backend |
| Almacenamiento | Cloud Storage (bucket privado) | Adjuntos de chat con acceso IAM |
| CI/CD | Cloud Build | Rolling replace `--max-unavailable=0` |
| Secretos | Secret Manager | JWT, contraseñas SQL, API keys |
| IaC | Terraform | `infra/terraform/` con estado en GCS |

</details>

---

# <img src="https://api.iconify.design/lucide/layers.svg?color=%233b82f6" width="24" height="24" alt="Stack"> Stack tecnológico

| Categoría | Tecnología | Uso |
| :--- | :--- | :--- |
| **Monorepo** | ![Turborepo](https://img.shields.io/badge/Turborepo-000?style=flat-square&logo=turborepo&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm_9-F69220?style=flat-square&logo=pnpm&logoColor=white) | Orquestación de tareas con caché y gestión de workspaces |
| **Frontend** | ![Next.js](https://img.shields.io/badge/Next.js_16-000?style=flat-square&logo=next.js&logoColor=white) ![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black) | 8 microfrontends Multi-Zone con Server Components |
| **Estilos** | ![Tailwind](https://img.shields.io/badge/Tailwind_v4-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white) | `@theme static` en CSS, sin `tailwind.config` |
| **3D / Animación** | ![Three.js](https://img.shields.io/badge/Three.js-000?style=flat-square&logo=three.js&logoColor=white) ![GSAP](https://img.shields.io/badge/GSAP-88CE02?style=flat-square&logoColor=black) | Landing page interactiva del web-shell |
| **Backend** | ![NestJS](https://img.shields.io/badge/NestJS_11-E0234E?style=flat-square&logo=nestjs&logoColor=white) | Gateway REST + 8 microservicios TCP |
| **ORM** | ![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white) | 7 schemas aislados, migraciones por servicio |
| **Base de datos** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white) | Una instancia, schemas separados por dominio |
| **Caché** | ![Redis](https://img.shields.io/badge/Redis_7-DC382D?style=flat-square&logo=redis&logoColor=white) | Sesiones JWT, caché de boards, SSE pub/sub |
| **Pagos** | ![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white) | Checkout, portal de cliente, webhooks |
| **IA** | ![Google Gemini](https://img.shields.io/badge/Gemini-4285F4?style=flat-square&logo=google&logoColor=white) | Asistente conversacional con cuotas y propuestas |
| **Voz** | ![Alexa](https://img.shields.io/badge/Alexa_Skill-00CAFF?style=flat-square&logo=amazonalexa&logoColor=white) | Consultas de solo lectura vía frase semilla |
| **Visualización** | ![Recharts](https://img.shields.io/badge/Recharts-22B5BF?style=flat-square) | Gráficas de reportes y flujo de trabajo |
| **Testing** | ![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white) ![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white) | E2E (API + UI) y unit tests |
| **Calidad** | ![Biome](https://img.shields.io/badge/Biome-60A5FA?style=flat-square&logo=biome&logoColor=white) | Linting y formateo (2 espacios, ancho 100) |
| **Infra** | ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) ![Terraform](https://img.shields.io/badge/Terraform-7B42BC?style=flat-square&logo=terraform&logoColor=white) | Entorno local y aprovisionamiento en GCP |

---

# <img src="https://api.iconify.design/lucide/folder-tree.svg?color=%233b82f6" width="24" height="24" alt="Estructura"> Estructura del proyecto

```
PRAXIS/
├── apps/
│   ├── frontend/
│   │   ├── web-shell/          # Contenedor Multi-Zone — landing 3D, rewrites
│   │   ├── auth-front/         # /auth — login, registro, Google OAuth, verificación
│   │   ├── dashboard-front/    # /dashboard — panel, alertas, invitaciones, Alexa link
│   │   ├── projects-front/     # /projects — catálogo, Kanban, tareas, miembros
│   │   ├── reports-front/      # /reports — métricas, Monte Carlo, asistente IA
│   │   ├── admin-front/        # /admin — cuentas, suspensión, auditoría (rol Admin)
│   │   ├── chat-front/         # /chat — mensajería en tiempo real, canales, DMs
│   │   ├── assistant-front/    # /assistant — interfaz del asistente conversacional
│   │   └── commons/            # Atomic Design: atoms/, molecules/, organisms/
│   │                           # + auth, api, tokens, hooks, theme
│   ├── backend/
│   │   ├── gateway/            # API REST pública (:3000) — JWT, Swagger, Stripe
│   │   ├── services/
│   │   │   ├── credentials/    # :3001 — identidad, bcrypt, JWT, sesiones Redis
│   │   │   ├── permissions/    # :3002 — roles globales, auditoría administrativa
│   │   │   ├── projects/       # :3003 — proyectos, boards, chat, SSE, GCS
│   │   │   ├── tasks/          # :3004 — tareas, checklists, labels, adjuntos
│   │   │   ├── reports/        # :3005 — agregador sin BD, Monte Carlo
│   │   │   ├── assistant/      # :3006 — Gemini, cuotas, propuestas
│   │   │   ├── alexa/          # :3007 — solo lectura para skill de voz
│   │   │   └── automation/     # :3008 — motor de reglas: hechos → condiciones → acciones
│   │   └── commons/
│   │       ├── contracts/      # DTOs y patrones TCP compartidos → dist/
│   │       └── observability/  # Logger Pino compartido → dist/
│   └── PraxisSkill/            # Alexa Skill: Lambda, modelo de interacción (es-MX/en-US)
├── packages/
│   └── shared-devtools/        # Configs de tsconfig (base, nestjs, nextjs)
├── infra/
│   ├── docker/                 # Compose (Postgres + Redis) y Dockerfiles multi-stage
│   ├── terraform/              # Aprovisionamiento completo de GCP
│   └── ci/                     # Cloud Build: cloudbuild.yaml, cloudbuild-main.yaml
├── e2e/                        # Playwright: 17 suites de API + 8 de navegador
├── scripts/
│   ├── dev-cli/                # CLI interactivo de desarrollo (inquirer + REPL)
│   └── grant-superadmin.sql    # Script SQL idempotente para rol admin
└── docs/
    ├── assets/                 # Diagramas e imágenes
    ├── frontend/               # ESTADO-ACTUAL, CONTRATO-API, PENDIENTES-BACKEND
    ├── backend/                # Permisos, contratos de servicios, ejemplos
    └── despliegue.md           # Guía de GCP paso a paso
```

---

# <img src="https://api.iconify.design/lucide/circle-check-big.svg?color=%233b82f6" width="24" height="24" alt="Requisitos"> Requisitos previos

| Herramienta | Versión mínima |
| :--- | :--- |
| **Node.js** | `>= 20` (ver `.nvmrc`) |
| **pnpm** | `>= 9.0.0` |
| **Docker** y **Docker Compose** | Cualquier versión reciente |

---

# <img src="https://api.iconify.design/lucide/terminal.svg?color=%233b82f6" width="24" height="24" alt="Instalación"> Instalación y configuración

El camino más rápido es el CLI interactivo, pero si prefieres control total, sigue los pasos manuales.

## Opción A: CLI interactivo (recomendado)

```bash
git clone https://github.com/tu-org/praxis.git && cd praxis
pnpm install
pnpm dev:cli
```

El asistente levanta Docker, compila las librerías compartidas, genera los clientes de Prisma, aplica migraciones, siembra datos y arranca los servicios que elijas — con presets como `todo`, `mínimo`, `backend` o `frontend`.

## Opción B: Paso a paso

```bash
# 1. Clonar e instalar
git clone https://github.com/tu-org/praxis.git && cd praxis
pnpm install

# 2. Levantar infraestructura local
pnpm docker:up

# 3. Compilar librerías compartidas (imprescindible)
pnpm build:shared

# 4. Generar clientes de Prisma
pnpm prisma:generate

# 5. Aplicar migraciones
pnpm prisma:deploy

# 6. Sembrar datos iniciales
pnpm prisma:seed

# 7. Arrancar todo
pnpm dev:backend    # gateway + 8 microservicios
pnpm dev:frontend   # web-shell + 7 zonas
```

> [!IMPORTANT]
> **`build:shared` es obligatorio.** `@praxis/contracts` y `@praxis/observability` publican `dist/`. Sin compilarlas, los microservicios fallan con `Cannot find module '@praxis/contracts'`.

> [!IMPORTANT]
> **El cliente de Prisma no está versionado.** En un clon limpio, cada servicio necesita `pnpm prisma:generate` antes de arrancar o morirá con `Cannot find module '../generated/prisma-client'`.

> [!WARNING]
> **`prisma:reset` destruye datos.** Ejecuta `migrate reset --force` y recrea los schemas. Para aplicar una migración nueva sin perder datos, usa `prisma:deploy`.

---

# <img src="https://api.iconify.design/lucide/square-terminal.svg?color=%233b82f6" width="24" height="24" alt="Comandos"> Uso y comandos

## Desarrollo
| Comando | Descripción |
| :--- | :--- |
| `pnpm dev:backend` | Gateway + 8 microservicios |
| `pnpm dev:frontend` | Web-shell + 7 microfrontends |
| `pnpm build` | Build de producción completo |
| `pnpm build:shared` | Compila `contracts` + `observability` |

## Base de datos

| Comando | Descripción |
| :--- | :--- |
| `pnpm docker:up` | Levanta PostgreSQL 16 + Redis 7 |
| `pnpm docker:down` | Detiene los contenedores |
| `pnpm prisma:generate` | Genera los clientes de Prisma (7 servicios; `reports` no tiene tablas) |
| `pnpm prisma:deploy` | Aplica migraciones pendientes (sin perder datos) |
| `pnpm prisma:seed` | Siembra datos en orden: permissions → credentials → projects → tasks |
| `pnpm prisma:reset` | ⚠️ Borra y recrea todo |

## Calidad

| Comando | Descripción |
| :--- | :--- |
| `pnpm lint` | Linting con Biome |
| `pnpm format` | Formateo automático |
| `pnpm test` | Unitarias, en seco: ni base ni Redis ni stack |
| `pnpm test:int` | Las de integración: exigen Postgres y Redis vivos |

---

# <img src="https://api.iconify.design/lucide/key-round.svg?color=%233b82f6" width="24" height="24" alt="Variables"> Variables de entorno

Los `.env` no se versionan. Cada microservicio tiene un `.env.example` con todas las variables documentadas. Las más relevantes:

| Variable | Dónde | Descripción |
| :--- | :--- | :--- |
| `DATABASE_URL` | Cada servicio con Prisma | Conexión a PostgreSQL con `?schema=<nombre>` |
| `REDIS_URL` | Gateway, credentials, projects | `redis://localhost:6379` |
| `JWT_SECRET` | Gateway, credentials, **cada zona frontend** | **Debe ser idéntico** en los tres puntos |
| `GATEWAY_URL` | Cada microfrontend | `http://localhost:3000` |
| `GEMINI_API_KEY` | assistant-service | API key de Google Gemini |
| `VOICE_JWT_SECRET` | alexa-service | Secreto propio — NO reutilizar `JWT_SECRET` |
| `STRIPE_SECRET_KEY` | Gateway | Clave privada de Stripe |
| `GOOGLE_CLIENT_ID` | credentials, auth-front | OAuth 2.0 para login con Google |

> [!TIP]
> Copia los `.env.example` de cada servicio y ajusta solo los secretos. El `dev:cli` sincroniza automáticamente los `.env` y `.env.local` necesarios.

---

# <img src="https://api.iconify.design/lucide/flask-conical.svg?color=%233b82f6" width="24" height="24" alt="Pruebas"> Pruebas

Hay **cuatro clases de prueba**, y cada una responde a una pregunta distinta:

| Clase | Qué comprueba | Necesita | Comando |
| :--- | :--- | :--- | :--- |
| **Unitarias** | Lógica pura: validadores, catálogo de automatización, frases de una regla, cálculos | nada | `pnpm test` |
| **Integración** | Lo que habla con la base y con Redis: outbox de hechos, consumidor del stream, reglas | Postgres y Redis | `pnpm test:int` |
| **E2E de API** | El contrato del gateway: el sobre `{success, data, meta}`, los guards, los permisos | stack + seeds | `pnpm e2e:api` |
| **E2E de navegador** | Que la pantalla se pinta y el recorrido funciona de verdad, en Chromium | stack + seeds | `pnpm e2e:ui` |

```bash
pnpm test             # 39 suites unitarias, en seco
pnpm test:int         # 4 suites de integración (Postgres + Redis vivos)

# E2E — requiere el stack levantado y los seeds
pnpm e2e              # 245 casos en 25 ficheros
pnpm e2e:api          # 182 casos en 17 ficheros, contra el gateway
pnpm e2e:ui           # 63 casos en 8 ficheros, con Chromium
pnpm e2e:regresion    # todo excepto @security (verde siempre)
pnpm e2e:seguridad    # los 14 casos @security (rojo esperado = deuda)
pnpm e2e:report       # abre el reporte HTML
```

> [!IMPORTANT]
> **`pnpm test` no incluye las de integración, y es a propósito.** Los ficheros
> `*.integration.spec.ts` de `tasks` y `automation` hablan con Postgres y con Redis
> de verdad; estaban en la misma tanda que las unitarias y `pnpm test` dejó de
> poder correrse sin el stack levantado. Ahora `test` las ignora y `test:int`
> corre solo esas.

> [!TIP]
> Primera vez con E2E: ejecuta `pnpm e2e:instalar` para descargar Chromium.

> [!NOTE]
> El login tiene rate-limit de 10/minuto por IP. Los fixtures de E2E (`intentarLogin`) manejan el 429 con backoff automático — no llames a `POST /auth/login` directamente en los tests.

<details>
<summary><b>Suites de E2E disponibles</b></summary>

**API** (`e2e/tests/api/`):

| Suite | Cobertura |
| :--- | :--- |
| `01-contrato` | Estructura del sobre `{success, data, meta}` |
| `02-auth` | Registro, login, refresh, verificación de email |
| `03-autorizacion` | RBAC, tokens vencidos, firmas inválidas |
| `04-proyectos` | CRUD proyectos, membresías, roles |
| `05-tablero` | Workspaces, boards, columnas, tareas |
| `06-administracion` | Rutas de superadmin |
| `07-suspension` | Bloqueo y suspensión de cuentas |
| `08-avisos` | Notificaciones y flujo SSE |
| `09-seguridad` | Timing attacks, inyecciones, rate limits |
| `10-barrido-de-acceso` | Matriz exhaustiva de permisos por endpoint |
| `11-jerarquia-admin` | Jerarquía de roles globales |
| `12-voz` | Frase semilla, `voiceToken`, skill Alexa |
| `13-integridad-de-tablero` | Consistencia relacional boards/tareas |
| `14-roles-globales` | Catálogo y asignación de roles de sistema |
| `15-chat` | Mensajes, hilos, adjuntos y silenciado |
| `16-presencia` | Estado de conexión de cada persona |
| `17-automatizaciones` | Catálogo de reglas, validación y revisión sin duplicar |

**Navegador** (`e2e/tests/ui/`):

| Suite | Cobertura |
| :--- | :--- |
| `01-publico` | Landing, navegación pública |
| `02-guards` | Redirección a `/auth/login` sin sesión |
| `03-sesion` | Persistencia de sesión entre zonas |
| `04-invitaciones` | Flujo completo de invitación y aceptación |
| `05-equipo` | La pestaña Equipo se pinta, con su avatar de presencia |
| `06-chat-zona` | La zona de mensajes, de punta a punta |
| `07-reglas` | Automatización: constructor, tarjetas, ejecuciones y permisos |
| `08-panel-de-tarea` | El panel de una tarea no borra los encargados de otra |

</details>

> [!NOTE]
> **Las de navegador cubren lo que ninguna otra ve.** El panel de una tarea se
> guarda solo, así que lo que llega al servidor sale de leer el formulario en un
> instante concreto: el `PATCH` que vaciaba los encargados de la tarea anterior
> estaba perfectamente formado y el contrato no tenía nada que objetar. Solo se
> ve pulsando.

---

# <img src="https://api.iconify.design/lucide/cloud-upload.svg?color=%233b82f6" width="24" height="24" alt="Despliegue"> Despliegue

El despliegue en GCP está automatizado con Cloud Build. Cada push a `main` construye las imágenes Docker, las etiqueta con el SHA del commit y ejecuta un rolling replace en los Managed Instance Groups.

```bash
# Build manual de imágenes (desde Cloud Build, no local)
gcloud builds submit --config=infra/ci/cloudbuild.yaml .
```

> [!CAUTION]
> **No compiles imágenes Docker localmente en Apple Silicon.** Los motores binarios de Prisma se compilan para la arquitectura del host (`darwin-arm64`) y fallan en contenedores Linux x86-64 sin dar error hasta el arranque. Siempre usa Cloud Build.

> [!WARNING]
> **Las migraciones no se ejecutan en el despliegue automático.** Se aplican antes, vía SSH/IAP dentro del contenedor: `/app/migrar.sh`. La guía completa está en [`docs/despliegue.md`](docs/despliegue.md).

---

# <img src="https://api.iconify.design/lucide/images.svg?color=%233b82f6" width="24" height="24" alt="Capturas"> Capturas de pantalla

![Landing page](docs/assets/landing-page.png)

![Dashboard page](docs/assets/dashboard-page.png)

![Perfil](docs/assets/profile-page.png)

![Configuración](docs/assets/settings-page.png)

![Notificaciones](docs/assets/notifications-page.png)

![Chat](docs/assets/chat-page.png)

![Analisís](docs/assets/reports-page.png)

![Tablero Kanban](docs/assets/kanban-board.png)

---

# <img src="https://api.iconify.design/lucide/git-pull-request.svg?color=%233b82f6" width="24" height="24" alt="Contribuciones"> Contribuciones

1. Crea un branch desde `main`: `git checkout -b feature/tu-cambio`
2. Sigue **Conventional Commits** en español: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, etc.
3. Asegúrate de que `pnpm format` y `pnpm lint` pasen — Husky los valida en el pre-commit.
4. Ejecuta `pnpm e2e:regresion` antes del PR. Debe estar en verde.
5. Abre el Pull Request contra `main`.

> [!NOTE]
> Consulta [`STRUCTURE.md`](STRUCTURE.md) para saber dónde colocar archivos nuevos y [`docs/frontend/ESTADO-ACTUAL.md`](docs/frontend/ESTADO-ACTUAL.md) para la deuda técnica y convenciones del frontend.

---

# <img src="https://api.iconify.design/lucide/scale.svg?color=%233b82f6" width="24" height="24" alt="Licencia"> Licencia

Distribuido bajo la **Licencia MIT**. Consulta [`LICENSE`](LICENSE) para más información.

---

<div align="center">

**[Documentación](docs/)** · **[Contrato de API](docs/frontend/CONTRATO-API.md)** · **[Despliegue](docs/despliegue.md)** · **[Auditoría](docs/AUDITORIA.md)**

</div>
