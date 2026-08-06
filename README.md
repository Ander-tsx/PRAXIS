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
| admin-front | 4105 |

---

# Primer arranque

**Todo el proceso lo hace `pnpm dev:cli`.** Los tres pasos de abajo son lo único
manual que queda.

## 1. Instalar dependencias

```bash
pnpm install
```

## 2. Crear los `.env`

Hay **14 archivos**: uno por servicio y uno por zona. La CLI los crea sola en el
paso 3 —copia cada `.env.example` y te pregunta los valores que faltan—, así que
aquí solo necesitas saber **qué valores tener a mano**, porque no se versionan y
se comparten por fuera del repositorio:

| Variable | Dónde | Qué es |
|---|---|---|
| `JWT_SECRET` | gateway, credentials-service y **las 6 zonas** | El mismo valor en los ocho sitios. Si uno solo difiere, el login devuelve token y **toda petición posterior da 401**. |
| `VOICE_JWT_SECRET` | alexa-service | Un secreto **distinto**, no se reutiliza el de la plataforma. Generar con `openssl rand -hex 48`. |
| `GEMINI_API_KEY` | assistant-service | Solo ahí. Nunca en el gateway ni en una variable `NEXT_PUBLIC_*`. |

`infra/docker/compose/.env` **no hace falta**: el compose trae valores por
defecto (`praxis` / `praxis123` / `praxis`).

## 3. Lanzar la CLI

```bash
pnpm dev:cli
```

Y elegir el preset **«Todo»**. Eso es el primer arranque completo.

La CLI encadena, en orden, lo que antes eran seis pasos manuales:

1. Levanta **Postgres y Redis** y **espera a que Postgres acepte conexiones** —
   no basta con que el contenedor exista.
2. **Completa los `.env` que falten** desde su `.env.example`, preguntando los
   valores que no puede adivinar.
3. **Compila `contracts` y `observability`**, que publican `dist/` y sin los
   cuales los microservicios mueren con `Cannot find module '@praxis/contracts'`.
4. **Genera los clientes de Prisma**. Obligatorio en un clon nuevo: no están
   versionados.
5. **Recrea las tablas** (te pregunta antes — **borra todos los datos**).
6. **Ejecuta los seeds**.
7. **Arranca lo que elegiste** y **espera a que cada servicio responda en su
   puerto** antes de darlo por bueno.

Ese último punto es la mitad del valor: con catorce procesos escupiendo logs a la
vez, saber **cuál no llegó a levantar** es el trabajo de verdad.

Cuando termine, abre **http://localhost:4100**.

### Los presets

| Preset | Qué levanta |
|---|---|
| **Todo** | Los 8 servicios y las 6 zonas |
| **Mínimo** | Entrar y usar la app: gateway, credentials, permissions, projects, tasks + frontend. Sin IA, voz ni análisis — y sin gastar cuota de Gemini |
| **Solo backend** | Los 8 servicios |
| **Solo frontend** | Las 6 zonas, si el backend ya está arriba |
| **Elegir a mano** | Lo que marques |

### El prompt

Al terminar de arrancar deja una consola:

| Comando | Qué hace |
|---|---|
| `status` | Estado real, comprobando los puertos uno a uno |
| `rs <servicio\|all>` | Reinicia. Hace falta tras recompilar `contracts` |
| `stop` / `start` | Detiene o arranca algo suelto |
| `exit` | Detiene todo y sale sin dejar huérfanos |

⚠️ Necesita una **terminal interactiva**. Para CI o scripts, los comandos sueltos
del apéndice.

## Uso diario

```bash
pnpm dev:cli
```

Preset «Todo» o «Mínimo», y decir **que no** a recrear tablas y sembrar. Ya está.

Las credenciales que dejan los seeds:

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
  sin esto los siete informes salen vacíos en una base recién creada.

⚠️ Los eventos del segundo llevan `actorId = 00000000-0000-0000-0000-000000000000`:
son sintéticos y no miden trabajo real.

## Si el arranque falla

| Síntoma | Causa |
|---|---|
| `Cannot find module '@praxis/contracts'` | Falta compilar los compartidos. La CLI lo hace; suelto es `pnpm build:shared`. |
| `Cannot find module '../generated/prisma-client'` | Falta `prisma generate`. No están versionados: en un clon nuevo es obligatorio. |
| Login OK pero todo devuelve 401 | `JWT_SECRET` distinto entre gateway, credentials y la zona. |
| Login OK y luego 401 **al cabo de un rato** | Lo mismo, pero en el `.env.local` de **una sola** zona. |
| La zona de Análisis va vacía | `reports-service` (3005) no está levantado. |
| El asistente responde error | Falta `GEMINI_API_KEY` en `services/assistant/.env`. |
| `nest: command not found` | Se está lanzando `nest` fuera de pnpm. |
| Un puerto ocupado al arrancar | La CLI lo detecta y pregunta antes de seguir. |

Si haces `docker compose down -v`, hay que volver a recrear tablas y sembrar —
la CLI los ofrece los dos.

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
de ser. En una terminal:

```bash
pnpm dev:cli
```

Preset «Todo» (o «Mínimo» — las pruebas no tocan el asistente ni la voz). Y
cuando la CLI diga que todo responde, en **otra terminal**:

```bash
pnpm e2e
```

⚠️ Necesitan los **seeds ejecutados**: varias pruebas entran con
`admin@praxis.dev`. La CLI los ofrece al arrancar; sueltos, `pnpm prisma:seed`.

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
| `07-suspension` | **Qué pasa al pulsar el botón**: proyecto suspendido de solo lectura hasta para su dueño, `PROJECT_SUSPENDED`, `DELETED` que da 404, cuenta suspendida que no puede renovar sesión, y el registro de actividad |
| `08-avisos` | La bandeja: invitar, aceptar, rechazar y asignar generan aviso; nadie recibe aviso de lo suyo; leídas y contador |
| `09-seguridad` | 🏷️ `@security` — control de acceso en rutas anidadas, tipo de token, límite de intentos, cabeceras |

⚠️ **`09-seguridad` va el último y el número lo garantiza.** Su prueba de fuerza
bruta dispara catorce intentos de login a propósito y deja la IP frenada un
minuto: cualquier archivo posterior que necesite entrar con credenciales recibe
un 429 y falla diciendo «¿Se ejecutaron los seeds?», que apunta al sitio
equivocado. **Un archivo nuevo que haga login va antes de ese.**

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

---

# Apéndice: los comandos sueltos

La CLI es el camino recomendado, pero **no siempre hay terminal interactiva** —
CI, un script, un contenedor— y a veces solo quieres una pieza. Todo lo que hace
la CLI se puede lanzar a mano:

## Scripts de la raíz

| Comando | Descripción |
|---------|-------------|
| `pnpm dev:cli` | **El asistente interactivo.** Hace todo lo de abajo, en orden, y comprueba que arrancó. |
| `pnpm dev:backend` | Levanta el gateway y los 7 microservicios. |
| `pnpm dev:frontend` | Levanta las 6 zonas del frontend. |
| `pnpm build:shared` | Compila `contracts` y `observability`. **Sin esto los microservicios no arrancan.** |
| `pnpm build` | Compila todo el monorepo (Turborepo resuelve el orden). |
| `pnpm lint` | Biome en la raíz, ESLint en `web-shell`. |
| `pnpm test` | Tests unitarios de cada paquete (no incluye los E2E). |
| `pnpm format` | Formatea con Biome. En un árbol limpio no cambia nada. |
| `pnpm docker:up` / `docker:down` / `docker:logs` | PostgreSQL y Redis. |
| `pnpm prisma:generate` | Genera los clientes de Prisma. **Obligatorio en un clon nuevo.** |
| `pnpm prisma:deploy` | Aplica migraciones **sin** tocar los datos. |
| `pnpm prisma:reset` | Recrea las tablas y siembra. ⚠️ **Borra todos los datos.** |
| `pnpm prisma:seed` | Solo los seeds. |
| `pnpm e2e` · `e2e:regresion` · `e2e:seguridad` · `e2e:api` · `e2e:ui` · `e2e:report` · `e2e:instalar` | Pruebas end-to-end. Ver la sección de arriba. |

⚠️ Los scripts de Prisma **excluyen `reports-service` a propósito**: ese servicio
no tiene tablas —solo agrega lo que le sirven los demás— así que no tiene Prisma.
Un filtro `@praxis/*-service` a secas moría ahí con `Command "prisma" not found`,
llevándose por delante a los servicios a los que aún no les había tocado el turno.

## El arranque completo, a mano

Equivale al preset «Todo» de la CLI. En este orden, ninguno es opcional:

```bash
pnpm install
pnpm docker:up
pnpm build:shared
pnpm prisma:generate
pnpm prisma:reset
pnpm dev:backend
```

Y en otra terminal:

```bash
pnpm dev:frontend
```

`prisma:reset` ya siembra al terminar; para sembrar sin recrear, `pnpm prisma:seed`.

## Piezas sueltas

Regenerar solo el historial de Análisis, sin tocar el resto de los seeds:

```bash
pnpm --filter @praxis/tasks-service run prisma:seed:events
```

Recompilar un servicio suelto tras cambiar `contracts` (y acordarse de
reiniciarlo — o `rs <servicio>` en la CLI):

```bash
pnpm --filter @praxis/gateway run build
```

## Documentación de la API

Swagger en **http://localhost:3000/api/docs**, y **solo fuera de producción**:
publica los 28 endpoints con sus DTOs a cualquiera que alcance el puerto.

---

## Estructura

Ver `STRUCTURE.md` y `docs/` para la arquitectura detallada.
