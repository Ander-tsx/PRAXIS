# Estructura del proyecto

Este documento explica para qué sirve cada carpeta y qué tipo de archivos viven dentro. Está pensado como referencia rápida: antes de crear un archivo nuevo, revisa aquí dónde debería ir.

---

## Raíz del proyecto

```
proyecto/
├── apps/         → todo el código que se ejecuta (frontend, backend, mobile)
├── packages/     → código compartido entre varias apps
├── infra/        → configuración de servidores, Docker, CI/CD
├── agents/       → reglas y guías para que la IA ayude mejor al equipo
├── docs/         → documentación oficial del proyecto
├── scripts/      → scripts de automatización del repo
├── stubs/        → plantillas para generar nuevas apps o módulos
├── .agents/      → skills de agentes (Cursor, Claude Code)
├── .claude/      → configuración de Claude Code para este proyecto
├── .husky/       → validaciones automáticas antes de hacer commit
└── .planning/    → planificación del proyecto (fases, milestones)
```

---

## `apps/` — El código que se ejecuta

Todo lo que corre como aplicación vive aquí, separado por capa.

### `apps/frontend/`

El frontend está dividido en piezas independientes llamadas **microfrontends**. Cada uno es una mini-aplicación de Next.js que se carga dentro del shell principal.

| Carpeta | Qué es |
|---|---|
| `web-shell/` | La app principal de Next.js. Maneja la navegación, el login y carga los microfrontends. Es el "contenedor". |
| `commons/` | Componentes, hooks y utilidades que comparten todos los microfrontends (botones, formularios, cliente de API, etc.). |
| `*-front/` | Cada microfrontend de negocio (ej: `pagos-front/`, `usuarios-front/`). Se crean cuando se necesitan. |

> **Archivos típicos:** componentes `.tsx`, páginas en `app/`, estilos `.css`, tests `.spec.tsx`

---

### `apps/backend/`

El backend está dividido en **microservicios**: procesos independientes que cada uno hace una sola cosa.

| Carpeta | Qué es |
|---|---|
| `gateway/` | El punto de entrada. Recibe todas las peticiones HTTP del frontend, valida el token de sesión y las redirige al microservicio correcto. |
| `commons/contracts/` | Los "contratos" entre servicios: define la forma de los datos que se envían y reciben (DTOs). Si un servicio le manda datos a otro, la estructura se declara aquí. |
| `commons/observability/` | Logger y trazas compartidas. Todos los servicios usan esto para registrar lo que hacen. |
| `commons/security/` | Guards de autenticación y utilidades de criptografía compartidas. |
| `services/` | Cada microservicio de negocio vive aquí en su propia subcarpeta (ej: `services/pagos/`, `services/usuarios/`). |
| `test/` | Tests de integración que prueban varios servicios juntos, no uno solo. |

> **Archivos típicos:** módulos `.module.ts`, controladores `.controller.ts`, servicios `.service.ts`, DTOs `.dto.ts`, tests `.spec.ts`

---

### `apps/frontend/commons/` y `apps/backend/commons/`

Son librerías internas. La diferencia con `packages/` es que estas son exclusivas de su capa: `frontend/commons` solo la usan los microfrontends, `backend/commons` solo la usan los microservicios.

---

### `apps/mobile/`

La app móvil en Flutter. Misma idea que el frontend web: un shell que carga plugins de negocio.

| Carpeta | Qué es |
|---|---|
| `app-shell/` | App Flutter principal: navegación, login, permisos del dispositivo. |
| `commons/` | Design system y utilidades compartidas entre plugins. |
| `plugins/` | Cada funcionalidad de negocio como plugin independiente. |

---

### `apps/e2e/`

Tests end-to-end: simulan un usuario real usando la aplicación completa (frontend + backend). No testean partes sueltas, testean flujos enteros como "el usuario se registra y ve su dashboard".

> **Archivos típicos:** tests de Playwright o Cypress (`.spec.ts`)

---

### `apps/addons/project-dev-stack/`

Un CLI interno para levantar todo el entorno local con un solo comando (`pnpm dev:stack`). En lugar de iniciar manualmente la base de datos, el gateway y cada servicio, este script lo hace por ti.

---

## `packages/` — Código compartido entre frontend y backend

A diferencia de `commons/`, estos paquetes pueden ser usados por cualquier app del monorepo, sin importar si es frontend, backend o mobile.

| Carpeta | Qué contiene |
|---|---|
| `shared-schemas/` | Definiciones de estructura de datos en JSON Schema u OpenAPI que tanto el frontend como el backend entienden. |
| `shared-protos/` | Definiciones de gRPC para comunicación entre microservicios (si se usa). |
| `shared-devtools/` | Configuraciones compartidas de TypeScript, Biome (linter), y generadores de código. |

> Regla práctica: si un archivo lo necesitan dos apps de capas distintas → va en `packages/`. Si solo lo necesita el backend → va en `apps/backend/commons/`.

---

## `infra/` — Infraestructura

Todo lo relacionado con cómo se despliega y opera el sistema. El equipo de desarrollo normalmente no toca esto en las primeras etapas.

| Carpeta | Qué contiene |
|---|---|
| `docker/compose/` | Archivos `docker-compose.yml` para levantar el sistema localmente o en QA. |
| `docker/images/` | `Dockerfile` de cada servicio. |
| `k8s/` | Manifiestos de Kubernetes para producción. |
| `ci/jenkins/` | Pipeline de integración continua (build, test, deploy automático). |
| `observability/` | Configuración de métricas (Prometheus), dashboards (Grafana) y trazas (OpenTelemetry). |

---

## `agents/` — Guías para trabajar con IA

Aquí vive la "memoria institucional" del equipo para que herramientas como Cursor o Claude Code ayuden de forma consistente.

| Carpeta | Qué contiene |
|---|---|
| `rules/` | Reglas de arquitectura, seguridad y estilo que la IA debe seguir. |
| `checklists/` | Listas de verificación para PRs, releases y revisiones de seguridad. |
| `prompts/` | Prompts reutilizables para tareas comunes (ej: generar un módulo, corregir un hallazgo de Sonar). |
| `templates/` | Plantillas de documentos: ADRs (decisiones de arquitectura), contratos de módulo, READMEs. |
| `development-flow.md` | El flujo oficial del equipo: cómo se pasa de una tarea a un PR mergeado. |

---

## `docs/` — Documentación

Documentación técnica del proyecto: diagramas de arquitectura, decisiones importantes (ADRs), guías de onboarding, y contratos de API.

> No es para notas personales ni borradores. Solo va lo que el equipo completo necesita consultar.

---

## `scripts/` — Automatización del repo

Scripts de bash o Node que automatizan tareas del proyecto completo: verificaciones de seguridad, cierre de milestones, validaciones de esquemas. No confundir con los scripts de cada app (esos van en su propio `package.json`).

---

## `stubs/` — Plantillas de scaffolding

Plantillas para generar nuevas apps o módulos con la estructura correcta desde el inicio. En lugar de copiar y pegar una carpeta existente (y olvidar cambiar algo), se usa el stub como base.

| Carpeta | Para generar... |
|---|---|
| `next-ts/` | Un nuevo microfrontend en Next.js + TypeScript |

---

## `.husky/` — Validaciones automáticas de Git

Contiene dos scripts que corren automáticamente cuando haces `git commit`:

- **`pre-commit`**: corre el linter antes de guardar el commit. Si hay errores de formato, el commit no se crea.
- **`commit-msg`**: valida que el mensaje del commit siga el formato acordado (ej: `feat: agregar login`, `fix: corregir error en pagos`).

> No se editan estos archivos a menos que se quiera cambiar las reglas de validación del equipo.

---

## `.planning/`

Archivos de planificación del proyecto: fases, milestones, objetivos por sprint. Son documentos de texto o markdown, no código.

---

## Regla de oro

> **¿No sabes dónde va un archivo?** Pregúntate: ¿es código que se ejecuta → `apps/`? ¿Es compartido entre capas → `packages/`? ¿Es documentación → `docs/`? ¿Es infraestructura → `infra/`?