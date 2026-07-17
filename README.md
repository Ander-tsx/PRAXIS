# '"damn"'

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

## Estructura

Ver `docs/` para la arquitectura detallada.