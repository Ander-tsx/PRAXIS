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

Ejecuta los seeds iniciales:

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

Si ya tenias creado el contenedor y tienes que hacer docker compose down -v y despues docker compose up tienes que volver a hacer prisma:reset y prisma:seed

## Estructura

Ver `docs/` para la arquitectura detallada.