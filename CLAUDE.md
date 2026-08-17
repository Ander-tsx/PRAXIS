# PRAXIS — Contexto de trabajo

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.
**Nuestro trabajo es exclusivamente el frontend.** El backend lo desarrolla otro equipo; nosotros consumimos lo que existe y documentamos lo que falta — no lo modificamos sin acordarlo.

## Documentos de referencia

| Documento | Cuándo consultarlo |
|---|---|
| [docs/frontend/ESTADO-ACTUAL.md](docs/frontend/ESTADO-ACTUAL.md) | Arquitectura, estado de cada microfrontend, deuda técnica priorizada, roadmap |
| [docs/frontend/CONTRATO-API.md](docs/frontend/CONTRATO-API.md) | **Antes de escribir cualquier fetch.** Rutas, DTOs, permisos, trampas |
| [docs/frontend/PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md) | Lo que necesitamos del backend y no podemos resolver. Para pasárselo a ese equipo |
| [docs/frontend/PLAN-PULIDO.md](docs/frontend/PLAN-PULIDO.md) | **Etapa de pulido en curso.** Estado, tareas y orden. Se lee al retomar y se marca al terminar cada una |
| [STRUCTURE.md](STRUCTURE.md) | Dónde va cada archivo nuevo |
| [docs/backend/permissions.md](docs/backend/permissions.md) | Modelo de permisos de dos capas |

## Reglas del frontend

**Next.js 16 tiene breaking changes.** Consulta `node_modules/next/dist/docs/` antes de usar una API que no hayas verificado en este repo.

**Multi-Zones, no Module Federation** (el README miente). Cada microfrontend es una app Next independiente con `basePath: '/<zona>'`, expuesta por el `web-shell` vía `rewrites()`.

**Atomic Design:**
- Átomos y moléculas compartidos → `apps/frontend/commons/{atoms,molecules}/`
- Organismos y templates de dominio → `<zona>/src/components/{organisms,templates}/`
- Un organismo sube a `commons/organisms/` solo cuando lo usan ≥2 zonas
- **La lógica de negocio (fetch, estado, validación) vive solo en las pages.** Moléculas y organismos reciben slots `ReactNode` y props. Patrón de referencia: `commons/molecules/AuthForm` + `auth-front/src/app/login/page.tsx`

**Estilos:** Tailwind v4 con `@theme` en CSS (no hay `tailwind.config`). Oscuro y
claro: la elección se guarda en la cookie `praxis_theme` y **las siete zonas** la
leen en su `layout.tsx` para estampar `data-theme` en el `<html>` sin parpadeo.
Hay dos selectores y comparten componente (`commons/molecules/ThemeToggle`): el
de Configuración y el del landing, que lo lleva en `PublicNavbar` porque quien
entra sin cuenta no tiene dónde elegirlo. Detalle en ESTADO-ACTUAL §27 y §34.

Los tokens viven **una sola vez** en `commons/styles/theme.css`. Cada `globals.css` de zona lo importa y solo añade lo suyo: `@source "../**/*.tsx"` y sus `@font-face` (que llevan el basePath).

⚠️ Tailwind solo genera las clases que encuentra escaneando. Los `@source` hacia commons van dentro de `theme.css` y son relativos a ese archivo — si los quitas o el import falla, una utilidad usada solo dentro de un componente compartido se descarta **sin ningún error** y el componente se renderiza sin estilos. Ya nos pasó (`ba94057`).

⚠️ Por el mismo motivo, `@theme` (a secas) solo emite la **variable CSS** de un token si detecta una clase de utilidad literal que la use (`text-info`, `bg-error-muted`…). Un token que solo se consuma vía `colors.info` de `commons/tokens/colors.ts` en un `style={{ background: colors.info }}` —que es justo para lo que existe ese archivo— no genera esa clase, y Tailwind lo recorta del CSS final, también en silencio: la variable no existe y `var(--color-info)` no resuelve a nada. Por eso `theme.css` declara `@theme static`, no `@theme`: fuerza a emitir todas las variables del bloque siempre, las use un `className` o no.

**Auth:** el JWT vive en una cookie httpOnly `praxis_session`, nunca en `localStorage` ni en el JS del cliente. Toda llamada al gateway pasa por el proxy de la zona:

- Server Component → `createServerApiClient()` de `@praxis/commons/auth` (llama al gateway directo; `createApiClient` no sirve en el servidor)
- sesión en el servidor → `getSession()` de `@praxis/commons/auth`
- cliente → `createApiClient({ gatewayPath: '/<zona>/api/gateway' })` de `@praxis/commons/api`
- cada zona monta `src/app/api/gateway/[...path]/route.ts` con `createGatewayProxy()`

`@praxis/commons/auth` es código de servidor: **nunca** lo importes desde el índice raíz ni desde un componente cliente. Detalle en ESTADO-ACTUAL §14.

## Trampas del backend que ya nos han mordido

1. Toda respuesta viene envuelta en `{ success, data, meta }`. Los errores en `{ success: false, error: { code, message, details } }`.
2. `login`/`register` devuelven `{ userId, accessToken, refreshToken }` en camelCase — **no** `access_token`.
3. ✅ **La validación del gateway ya se aplica en los 28 endpoints** (`94721d8`, `477616f`, `2bad47c`). Antes 22 de ellos tipaban el `@Body()` con `Omit<XDto,...>`, que en runtime es `Object`, y devolvían **200 sin guardar nada**. Aun así seguimos validando en el cliente —el mensaje llega antes y marca el campo— y **confirmando contra el `data` de la respuesta, no contra el status**.
4. ✅ Ninguna ruta de tarea o checklist acepta `projectId` en el body: mandarlo da **400**. El guard lo resuelve desde la ruta. Estuvo al revés, y mientras lo eligió el cliente era un bypass: declarar un proyecto propio daba acceso a las tareas de cualquier otro (`48a0058`).
5. ✅ `GET /api/projects` y `GET /api/users` aceptan **query params** (`page`, `limit`, `search`).
6. ✅ `GET /api/projects` filtra por **dueño o miembro**.
7. ✅ Un proyecto nuevo nace con rol "Administrador" y con el dueño dentro.
8. ⚠️ `permissions` de un rol es un **diccionario de booleanos**, nunca un array. El backend lo valida; los roles creados antes del validador siguen guardados como array y se normalizan al leer.
9. ✅ `Project.name` es único **por dueño**, no global: dos equipos pueden tener cada uno su "Sprint 1". Lo era a nivel global y chocaba con proyectos que no puedes ver; lo arregló `20260730020000_project_name_unique_per_owner`.
10. ⚠️ `Project.slug` **sí** es único global, y es lo que va en la URL (`/projects/rediseno-del-panel`). Los choques se resuelven con un sufijo **aleatorio** (`praxis-rjv6`), no un contador: `-2`, `-3` decía cuántos hay y —peor— dejaba enumerar proyectos ajenos probando el siguiente, porque el gateway responde 404 a un slug inexistente y 403 a uno ajeno. **Se regenera al renombrar**, así que un slug viejo deja de resolver — el UUID se acepta siempre. Para enlazar usa `slug`; para llamar a la API, `id`: solo `GET /projects/:id` traduce el slug, todo lo anidado espera el UUID.
11. ⚠️ **Un proyecto tiene estado administrativo, y un 403 puede no ser de permisos.** `Project.status` es `ACTIVE`, `SUSPENDED` o `DELETED`, lo pone el panel de administración y **no es el `DELETE /projects/:id` del dueño** (ese sí borra y no se deshace). Un `SUSPENDED` se ve entero y no acepta ninguna escritura, ni del dueño; un `DELETED` responde **404 a todo el mundo** y no sale en ningún listado salvo en `/admin/projects`. Lo que tiene que saber la interfaz:
    - **`permissions/me` ya llega recortado** a `canViewProject` + `canViewReports` cuando está suspendido, así que los botones se apagan por la vía de siempre y no hay que mirar el estado para eso. Trae `projectStatus` y `suspendedReason` justo para poder **explicarlo**: un mapa vacío sin motivo parece que te han quitado el rol.
    - Los 403 de suspensión llevan **`error.code === 'PROJECT_SUSPENDED'`** (`PROJECT_SUSPENDED_CODE` en `commons/api/domain.ts`). Distinguirlo de un `FORBIDDEN` normal importa: uno se arregla pidiendo permiso a quien administra el proyecto, el otro no se arregla —hay que esperar a que la plataforma lo reactive—.
    - `suspendedBy` **no sale por ninguna ruta de usuario**: sería decir qué cuenta es administradora, y el rol global es privado.

12. 🔴 **El sobre `{success, data, meta}` NO puede envolver un flujo SSE.** El
    interceptor global mapea **cada valor emitido**, así que un
    `{ type: 'aviso', data }` se convertía en `{ success, data: {...}, meta }` —un
    objeto sin `type` en la raíz—. Nest solo escribe la línea `event:` si hay
    `type`, así que el navegador lo recibía como evento genérico `message` y el
    `addEventListener('aviso', …)` de `AvisosEnVivo` **no se disparaba nunca**:
    los avisos en vivo llegaban hasta el navegador y morían ahí, sin tarjeta, sin
    sonido y sin un solo error ni en el servidor ni en la consola. Se arregla
    exceptuando los handlers marcados con `SSE_METADATA` en
    `StandardResponseInterceptor`. **Si añades otro interceptor global, acuérdate
    de esto.**
13. ⚠️ **Los latidos de 25 s del SSE no son la latencia.** Son un byte por una
    conexión en silencio para que ningún intermediario la cierre —el balanceador
    corta a los 60 s—. Lo que hay que enviar se envía en el momento.
14. ⚠️ **`CHAT_MESSAGE` viaja por el flujo de avisos pero NO es un
    `NotificationType`** y no deja fila en la bandeja: cincuenta mensajes serían
    cincuenta avisos por persona. Trata el `type` del flujo como texto libre.

15. 🔴 **Registrarse ya no abre sesión, y hay que confirmar el correo antes de
    entrar.** `POST /auth/register` devuelve `{ userId, email,
    verificacionPendiente }` —sin tokens— y el login responde **403
    `EMAIL_NOT_VERIFIED`** hasta que se confirma. Es el punto entero de la
    verificación. Dos consecuencias que ya han mordido:
    - **El seed tiene que marcar `emailVerifiedAt`.** No lo hacía: las cuentas
      sembradas funcionaban solo porque la migración de la v7 rellenó las que ya
      existían. Tras un `prisma:reset` **nadie podía entrar**, ni la de
      administración. Arreglado en `credentials/prisma/seed.ts`.
    - **Las pruebas end-to-end no pueden confirmar por la API**: el token del
      enlace se guarda con hash y en claro solo existe dentro del correo. Por eso
      `e2e/fixtures/verificacion.ts` escribe en la base — es lo único de toda la
      suite que no pasa por el gateway, y está ahí explicado.
16. ⚠️ **El login está limitado a 10 por minuto y por IP, y la suite lo gasta
    sola.** Desde que registrarse no abre sesión, cada una de las 84 cuentas que
    crea necesita un login. Cualquier `POST /auth/login` en una prueba va por
    `intentarLogin()`, que espera y reintenta; a pelo, una prueba que espera un
    401 recibe un 429 y falla **por el reloj, no por el código**.
17. ⚠️ **Una constante `process.env.X` en el cuerpo de un módulo NO ve el
    `.env`.** `ConfigModule.forRoot()` lo carga al **inicializar** el módulo, y
    los `import` se evalúan antes. Lo que se lea arriba del archivo solo ve las
    variables del proceso. Si hace falta configurar algo que se usa en un
    decorador —`@Throttle`, por ejemplo—, no vale leerlo así: parece que
    funciona y silenciosamente coge el valor por defecto.

**Para enlazar a un proyecto usa los helpers, nunca la plantilla a mano.**
`projectHref` / `projectPath` / `reportHref` / `reportPath`, en
`commons/api/routes.ts`. El slug va en la URL y el UUID en la API, los dos son
`string`, y equivocarse **no da error de compilación**: sale como una URL fea,
un 403 o un desplegable vacío. Ya se coló en cinco sitios.

**Reglas al escribir un fetch:**

- Envía **solo los campos que el DTO declara**, ni uno más: uno de sobra ya da 400.
- **Valida en el cliente** igualmente: el mensaje llega antes y señala el campo.
- **Confirma el resultado contra el `data` de la respuesta, no contra el status.**
- Para saber qué puede hacer el usuario, pide `GET /projects/:id/permissions/me` en vez de intentar la acción y reaccionar al 403.

Lista completa de lo que falta por el lado del backend, con severidad y reproducción, en [PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md).

**Formularios: `useAccion`, nunca `useActionState` a pelo.** Está en
`commons/hooks`, es un reemplazo directo con la misma tupla, y lo usan los 45
puntos del repo. El `isPending` de React no mide tu petición: mide la transición
del App Router, que es **una sola para toda la aplicación**, y hay un camino en
Next 16 por el que su promesa no se resuelve nunca —una navegación encima de una
acción en vuelo la marca `discarded` y el `resolve` de la cola se salta—. Eso
sale como **todos los botones girando a la vez sobre un cambio que sí se
guardó**, sin un error en ninguna consola. `useAccion` mide la espera fuera de esa
transición. Explicación entera en ESTADO-ACTUAL §35.

**Y `router.refresh()` va por `useRefrescoAgrupado`**, del mismo sitio: cada
refresco entra en esa misma cola, y tenerla ocupada es lo que destapa el fallo de
arriba.

**El asistente propone; nunca ejecuta.** Vale para todo lo que se le añada,
incluida la plantilla de arranque de un proyecto (`POST
/me/assistant/project-draft`): devuelve parámetros para funciones que ya existen,
y quien las llama es el frontend, una a una, con la sesión de quien acepta y por
los endpoints de siempre. Si una capacidad nueva necesita una ruta de escritura
nueva, está mal planteada. Y **no hay herramienta de borrado**, a propósito y por
triplicado: detalle en ESTADO-ACTUAL §26.1, §30.3 y §36.2.

## Estado

Los bloqueantes iniciales están resueltos: workspace, puertos, login y proxy autenticado. `auth-front` funciona end-to-end. Lo que falta y por qué, en ESTADO-ACTUAL §9 (tabla de deuda) y §15 (pendientes del equipo de backend).

**Puertos:** gateway 3000 · microservicios TCP: credentials 3001, **permissions 3002, projects 3003**, tasks 3004, reports 3005, assistant 3006, alexa 3007 · web-shell 4100 · auth-front 4101 · dashboard-front 4102 · projects-front 4103 · reports-front 4104 · admin-front 4105 · chat-front 4106 · 4107+ para zonas nuevas.

⚠️ **`permissions` es 3002 y `projects` es 3003**, no al revés. Este documento los tuvo invertidos, y equivocarse no da un error claro: el servicio arranca, el gateway le habla al otro y las respuestas salen vacías o con `BAD_GATEWAY`. La lista de verdad está en `scripts/dev-cli/config/services.mjs`, que además la valida contra los `package.json` reales.

⚠️ El cliente de Prisma se genera dentro de `src/generated/` de cada servicio y **no está versionado**: en un árbol recién clonado o limpiado, el servicio arranca y muere con `Cannot find module '../generated/prisma-client'`. Se arregla con `pnpm prisma:generate`.

⚠️ **Y si eso pasa con `dev:backend` ya corriendo, `prisma:generate` no basta.** El
servicio se ejecuta desde `dist/`, y `nest start --watch` copia el cliente allí
como *asset*. Regenerar con el vigilante en marcha deja esa copia a medias —falta
`index.js`— y el servicio se queda en un bucle de `MODULE_NOT_FOUND` que no se
arregla volviendo a generar, porque cada recompilación borra `dist` y repite la
copia incompleta. Hay que **parar el backend, borrar `dist/` del servicio,
regenerar y arrancar en frío**.

**El shell no sirve páginas de negocio.** Es la cáscara: landing pública, `rewrites()` y la renovación de sesión. Cada pantalla privada va en su zona, que trae su propio guard en `proxy.ts` y se puede levantar sola. Checklist de zona nueva en ESTADO-ACTUAL §17.7.

⚠️ El `matcher` de `proxy.ts` con lookahead negativo **no casa la raíz**: hay que añadir `'/'` como entrada aparte o la página raíz de la zona se queda sin guard. Detalle en ESTADO-ACTUAL §17.6.

## Comandos

**El camino corto es `pnpm dev:cli`**, un asistente que levanta solo lo que elijas
—hay preajustes— y **espera a que cada puerto responda** antes de darlo por
arrancado. Exige TTY, así que para scripts y CI van los comandos sueltos:

```bash
pnpm install
pnpm docker:up            # Postgres + Redis
pnpm build:shared         # contracts + observability
pnpm prisma:generate      # los 6 servicios con Prisma
pnpm prisma:deploy        # aplica migraciones sin tocar los datos
pnpm prisma:seed          # 4 seeds, en su orden de dependencia
pnpm dev:backend          # gateway + los 7 microservicios
pnpm dev:frontend         # las 7 zonas
```

⚠️ **`prisma:reset` borra las tablas.** Es `migrate reset --force`: recrea el
esquema de los 6 servicios con Prisma y siembra encima. Para aplicar una migración
nueva sin perder datos, `prisma:deploy`.

⚠️ `build:shared` no está en el README y es imprescindible: `contracts` y
`observability` publican `dist/`, y sin él los microservicios fallan con
`Cannot find module '@praxis/contracts'`.

⚠️ **Los scripts de Prisma excluyen `reports-service` a propósito.** Ese servicio no
tiene tablas —solo agrega lo que le sirven los demás— así que no tiene Prisma, y un
filtro `@praxis/*-service` a secas moría ahí con `Command "prisma" not found`
llevándose por delante a los servicios que aún no le había tocado el turno. Le pasaba
a `prisma:generate` y a `prisma:deploy`, que eran los dos únicos que existían.

Los `.env` no se versionan. El `JWT_SECRET` debe ser idéntico en gateway, credentials-service y el `.env.local` de cada zona.

Swagger: `http://localhost:3000/api/docs` — **solo fuera de producción**.

## Pruebas end-to-end

```bash
pnpm e2e:regresion        # antes y después de tocar código. Verde siempre.
pnpm e2e:seguridad        # el marcador del endurecimiento
```

Con el stack levantado y los seeds puestos. Playwright, en `e2e/`. Las
etiquetadas `@security` describen lo que queremos, no lo que hay: viven aparte
para que un rojo esperado no tape uno nuevo. Detalle en el README.

## Convenciones de repo

- Commits: Conventional Commits en español (`feat:`, `fix:`), validados por commitlint + husky.
- Rama por feature (`feature/<nombre>`) → PR a `main`.
- Formato: Biome en la raíz (2 espacios, ancho 100), ESLint solo en `web-shell`. `pnpm format` ya no reescribe el repo: config y código coinciden.
