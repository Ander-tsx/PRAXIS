# Cómo levantar el backend en local

Guía pal eriquito

---

## Requisitos previos

- [Node.js 20+](https://nodejs.org/) — verifica con `node -v`
- [pnpm](https://pnpm.io/installation) — instala con `npm i -g pnpm`, verifica con `pnpm -v`
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — para levantar PostgreSQL
- [NestJS CLI](https://docs.nestjs.com/) — instala con `npm i -g @nestjs/cli`

---

## Paso 1 — Instalar dependencias

Desde la raíz del proyecto:

```bash
pnpm install
```

---

## Paso 2 — Compilar paquetes compartidos

Los paquetes de `packages/` y `commons/` necesitan compilarse antes de que los servicios los puedan usar:

```bash
pnpm --filter @praxis/contracts build
pnpm --filter @praxis/observability build
```

---

## Paso 3 — Levantar la base de datos

```bash
cd infra/docker/compose
docker compose -f docker-compose.dev.yml up -d
```

Verifica que esté corriendo:

```bash
docker ps
```

Debes ver `praxis_postgres` con estado `healthy`. Si no aparece `healthy` espera unos segundos y vuelve a correr `docker ps`.

---

## Paso 4 — Configurar variables de entorno

Cada servicio necesita su propio archivo `.env`. Copia el `.env.example` de cada uno y rellena los valores:

**Auth service** — `apps/backend/services/auth/`
```bash
cp .env.example .env
```
```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis
DB_SCHEMA=auth_service
JWT_SECRET=cualquier_texto_secreto_largo
JWT_EXPIRES_IN=15m
TCP_PORT=3001
```

**Users service** — `apps/backend/services/users/`
```bash
cp .env.example .env
```
```env
DATABASE_URL=postgresql://praxis:praxis123@localhost:5432/praxis
DB_SCHEMA=users_service
TCP_PORT=3002
```

**Gateway** — `apps/backend/gateway/`
```bash
cp .env.example .env
```
```env
HTTP_PORT=3000
JWT_SECRET=cualquier_texto_secreto_largo
AUTH_SERVICE_HOST=localhost
AUTH_SERVICE_PORT=3001
USERS_SERVICE_HOST=localhost
USERS_SERVICE_PORT=3002
```

> El `JWT_SECRET` debe ser el mismo en el gateway y en auth-service.

---

## Paso 5 — Levantar los servicios

Abre una terminal por cada servicio y córrelos en este orden. El gateway debe ser el último.

**Terminal 1 — Auth service:**
```bash
cd apps/backend/services/auth
pnpm dev
```
Espera ver: `Auth microservice running on TCP port 3001`

**Terminal 2 — Users service:**
```bash
cd apps/backend/services/users
pnpm dev
```
Espera ver: `Users microservice running on TCP port 3002`

**Terminal 3 — Gateway:**
```bash
cd apps/backend/gateway
pnpm dev
```
Espera ver: `Gateway running on http://localhost:3000/api`

---

## Paso 6 — Verificar que todo funciona

Importa la colección de Postman que está en:
```
apps/backend/gateway/postman/praxis.postman_collection.json
```

Prueba en este orden:

1. `POST /api/auth/register` — crea un usuario
2. `POST /api/auth/login` — el token se guarda automáticamente en la colección
3. `GET /api/users` — lista usuarios (requiere token)

Si los tres responden correctamente, el backend está funcionando.

---

## Problemas frecuentes

**`Cannot connect to database`**
El contenedor de Docker no está corriendo. Vuelve al paso 3.

**`JWT_SECRET is required`**
Falta el archivo `.env` en algún servicio. Revisa el paso 4.

**`@praxis/contracts not found`**
Falta compilar los contratos. Corre el paso 2 de nuevo.

**`Connection refused` al arrancar el gateway**
Los microservicios no están corriendo. Asegúrate de que auth y users estén levantados antes de iniciar el gateway.

**Las tablas no existen en la base de datos**
Con `synchronize: true` las tablas se crean automáticamente al arrancar cada servicio. Si no se crearon, revisa que el schema exista en PostgreSQL. Puedes recrearlo bajando y volviendo a levantar Docker con `-v`:
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
```
