# '"PRAXIS"'

Monorepo SOFEA con microfrontends (Next.js) y microservicios (NestJS).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js + TypeScript (Module Federation) |
| Backend | NestJS + PostgreSQL |
| Monorepo | pnpm workspaces + Turborepo |

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop

## Primer inicio

Instala las dependencias:

```bash
pnpm install
```

Levanta la infraestructura:

```bash
pnpm docker:up
```

Crea todas las tablas de la base de datos:

```bash
pnpm prisma:reset
```

Ejecuta los seeds iniciales (crea roles, usuario admin, proyecto demo y tareas):

```bash
pnpm prisma:seed
```

Compila todos los paquetes del monorepo:

```bash
pnpm build
```

## Desarrollo

Backend:

```bash
pnpm dev:backend
```

Frontend:

```bash
pnpm dev:frontend
```

O ambos:

```bash
pnpm dev
```

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `pnpm docker:up` | Levanta PostgreSQL y Redis. |
| `pnpm docker:down` | Detiene la infraestructura. |
| `pnpm docker:restart` | Reinicia PostgreSQL y Redis. |
| `pnpm docker:logs` | Muestra los logs de Docker. |
| `pnpm prisma:reset` | Reinicia la base de datos y ejecuta todas las migraciones (sin seeds). |
| `pnpm prisma:seed` | Ejecuta los seeds de todos los microservicios en el orden correcto. |
| `pnpm prisma:deploy` | Aplica las migraciones existentes sin crear nuevas (ideal para producción). |

## Seeders

El comando `pnpm prisma:seed` ejecuta los seeds de los 4 microservicios en orden:

| Orden | Servicio | Qué crea |
|-------|----------|----------|
| 1 | **permissions** | Roles globales: `Admin`, `User`. Asigna `Admin` al usuario seed. |
| 2 | **credentials** | Credential `admin@praxis.dev` + perfil de usuario `Admin Praxis`. |
| 3 | **projects** | Proyecto "PRAXIS Demo" con workspace, board, 4 columnas kanban, roles de proyecto (Manager, Developer) y admin como miembro. |
| 4 | **tasks** | 3 tareas de ejemplo en distintas columnas + checklists. |

**Notas:**
- Los seeds son **idempotentes** (usan `upsert`), se pueden correr múltiples veces sin duplicados.
- Cada seed es **autónomo** y compila independientemente — se puede desplegar en distintas máquinas.
- Si haces `docker compose down -v` y luego `docker compose up`, debes volver a correr `pnpm prisma:reset` y `pnpm prisma:seed`.

## Estructura

Ver `docs/` para la arquitectura detallada.