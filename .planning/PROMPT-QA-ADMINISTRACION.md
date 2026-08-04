# Prompt para el agente de QA — rama `feature/administracion-global`

> Copia todo lo que sigue como primer mensaje del agente nuevo.

---

Trabajas en el monorepo PRAXIS en `/Users/ander/DEV/UTEZ/9A/ULTIMATE/PRAXIS`, rama
`feature/administracion-global`. **Lee `CLAUDE.md` antes de nada.**

Tu trabajo es **probar de inicio a fin**, no escribir producto. Otro agente acaba de
añadir la administración global de la plataforma y de tocar piezas compartidas. Hay que
comprobar dos cosas distintas:

1. **Que lo nuevo funciona** de verdad, no solo que compila.
2. **Que no rompió nada que ya funcionaba.** Esto es la mitad más importante del trabajo:
   se tocaron tres piezas que atraviesan el sistema entero.

No des nada por bueno porque esté escrito aquí o en un comentario del código. Todo lo de
abajo son afirmaciones **a verificar**, incluidas las que digo que ya verifiqué.

---

## Lo que se construyó

Panel de administración de la plataforma, en cuatro fases. Las tres primeras ya estaban
commiteadas; la cuarta está **sin commitear** en el árbol de trabajo.

| Fase | Qué | Estado |
|---|---|---|
| 0 | `SuperAdmin > Admin > User`, con jerarquía | commit `dd321b5` |
| 1 | Registro de actividad administrativa, solo-añadir | commit `1b6e65e` |
| 2 | Namespace `/api/admin`, panel de Cuentas, zona `admin-front` | commit `a71956d`, `246a385` |
| 3 | **Suspensión y archivado de proyectos** | sin commitear |

Empieza con `git status` y `git diff` para ver exactamente qué cambió sin commitear.

### El modelo, en una frase

Un proyecto gana un **estado administrativo**: `ACTIVE`, `SUSPENDED` o `DELETED`. Un
suspendido se ve entero y no acepta ninguna escritura, **ni del dueño**. Un archivado
responde 404 a todo el mundo y solo existe en `/api/admin/projects`. Los dos se deshacen.

⚠️ `DELETED` **no es** el `DELETE /projects/:id` que ya existía (ese es del dueño,
cascadea y no se deshace). Son cosas distintas y las dos siguen existiendo.

---

## ⚠️ Las tres piezas compartidas que se tocaron — empieza por aquí

Si algo se rompió en un sitio inesperado, está en una de estas tres. Son riesgo de
regresión real, no teórico.

### 1. `StandardExceptionFilter` — afecta a TODOS los errores de la API

`apps/backend/gateway/src/common/filters/standard-exception.filter.ts`

Antes derivaba el `error.code` del número HTTP **siempre**. Ahora, si el error trae un
`code` propio (string), ese gana; si no, se sigue derivando del status.

**Qué probar:** que los códigos de error de siempre no cambiaron. Recorre errores de todo
el sistema y comprueba que un 400 de validación sigue diciendo `BAD_REQUEST`, un 401
`UNAUTHORIZED`, un 404 `NOT_FOUND`, un 409 `CONFLICT` (p. ej. email duplicado al
registrarse, nombre de proyecto repetido). Comprueba también que `details.errors` sigue
llegando en los errores de validación.

### 2. `ProjectPermissionGuard` — afecta a TODAS las rutas de proyecto

`apps/backend/gateway/src/common/guards/project-permission.guard.ts`

Ahora resuelve el proyecto y comprueba su estado **antes** del bypass del dueño. La
petición al microservicio es la que ya se hacía, pero el orden cambió.

**Qué probar:** que sobre proyectos `ACTIVE` **nada cambió**. Todo el flujo normal de
projects-front: crear proyecto, espacios, tableros, columnas, tareas, moverlas,
comentarios, checklists, adjuntos, etiquetas, miembros, roles, invitaciones, informes.
Con el dueño y con un miembro de rol limitado. Presta atención a que el bypass del dueño
siga funcionando y a que las rutas que aceptan **slug** sigan resolviendo.

### 3. `getEffectivePermissions` — lo consume media interfaz

`apps/backend/services/projects/src/project-roles/project-roles.service.ts`

Devuelve dos campos nuevos (`projectStatus`, `suspendedReason`) y recorta el mapa si el
proyecto está suspendido. Es aditivo, pero lo consume `permissions/me`, que usan
projects-front, reports-front y el asistente.

**Qué probar:** que en un proyecto `ACTIVE` el mapa es **idéntico** al de antes, para el
dueño y para roles limitados, y que la jerarquía implícita sigue expandiéndose igual.

### Y una omisión de datos que puede romper una pantalla

`findOneProject` y `findAllProjects` ahora **omiten `suspendedBy`** de la respuesta. Es a
propósito (privacidad). Busca en el frontend si alguien lo leía; no debería, es nuevo,
pero confírmalo.

---

## Cómo levantar el entorno

⚠️ **Cuidado con los descriptores de archivo.** En esta sesión el sistema llegó a
`too many open files` por tener demasiados procesos de Node y watchers a la vez. Levanta
solo lo que necesites y baja lo que no uses.

```bash
pnpm install
pnpm docker:up            # Postgres + Redis
pnpm build:shared         # contracts + observability — SIN ESTO los servicios no arrancan
pnpm prisma:generate      # el cliente de Prisma no está versionado
pnpm prisma:deploy        # aplica migraciones sin borrar datos
pnpm dev:cli              # asistente interactivo: elige qué levantar y espera a los puertos
```

`pnpm dev:cli` es el camino recomendado (tiene preajustes y **espera a que cada puerto
responda**). Si prefieres comandos sueltos: `pnpm dev:backend` y `pnpm dev:frontend`.

⚠️ **`pnpm prisma:reset` BORRA las tablas.** No lo uses salvo que quieras empezar de cero,
y avisa antes: la base de datos tiene datos reales del usuario (un proyecto «PRAXIS» de la
cuenta `andres.one.dev@gmail.com`) además de los del seed.

**Puertos:** gateway 3000 · credentials 3001 · **permissions 3002** · **projects 3003** ·
tasks 3004 · reports 3005 · assistant 3006 · alexa 3007 · web-shell 4100 · auth-front 4101
· dashboard-front 4102 · projects-front 4103 · reports-front 4104 · **admin-front 4105**.

⚠️ Ojo con permissions/projects: es fácil confundirlos y el síntoma no es claro (el
servicio arranca, el gateway habla con el otro, y las respuestas salen vacías).

**Cuentas del seed** (`pnpm prisma:seed` si hace falta):

| Correo | Contraseña | Rol global |
|---|---|---|
| `admin@praxis.dev` | `Admin@12345!` | SuperAdmin |
| `sofia@praxis.dev` | `Admin@12345!` | Admin |
| `maria@praxis.dev` | `User@12345!` | User |
| `carlos@praxis.dev` | `User@12345!` | User |

`admin@praxis.dev` es además **dueño** de los dos proyectos del seed, lo que resulta útil:
permite probar que la suspensión también le afecta a él.

---

## Qué leer, en este orden

| Archivo | Por qué |
|---|---|
| `CLAUDE.md` | Reglas del repo. La trampa **11** es el resumen del modelo de estados |
| `docs/frontend/CONTRATO-API.md` § «Administración» | El contrato completo de `/api/admin` y de `PROJECT_SUSPENDED` |
| `docs/backend/permissions.md` | Las dos capas, más la «capa 0» del estado. Lee el flujo del paso 3 |
| `docs/frontend/ESTADO-ACTUAL.md` §31 | Las decisiones y **los dos fallos que solo salieron al ejecutarlo** |
| `docs/frontend/PENDIENTES-BACKEND.md` § «Cambios que hicimos» | Lo invasivo, resumido para el equipo de backend |

Código nuevo o modificado, si necesitas mirar:

```
apps/backend/commons/contracts/src/admin/admin-project.dto.ts     ProjectStatus, READ_ONLY_*, PROJECT_SUSPENDED_CODE
apps/backend/gateway/src/admin/admin-projects.controller.ts        las 3 rutas del panel
apps/backend/gateway/src/common/guards/project-permission.guard.ts el estado, antes del bypass del dueño
apps/backend/gateway/src/common/filters/standard-exception.filter.ts  el code explícito
apps/backend/services/projects/src/projects/project-status.guard.ts   las 3 rutas sin permiso
apps/backend/services/projects/src/projects/projects.service.ts       setStatus, findAllForAdmin, omit de suspendedBy
apps/backend/services/projects/src/project-roles/project-roles.service.ts  recortarPorEstado
apps/backend/services/projects/prisma/migrations/20260804140000_project_status/
apps/frontend/commons/api/domain.ts                                tipos y PROJECT_SUSPENDED_CODE
apps/frontend/admin-front/src/app/(private)/proyectos/             página y server action
apps/frontend/admin-front/src/components/organisms/Projects*.tsx   tabla, filtros, diálogo
apps/frontend/projects-front/src/components/organisms/SuspendedProjectNotice.tsx
```

---

## Lo que YO ya verifiqué contra el backend en marcha

Repítelo si quieres, pero **tu valor está en lo que no probé**. Todo esto lo comprobé con
`curl` sobre el stack levantado:

- Inventario `/admin/projects` con el dueño resuelto (nombre y correo, cayendo al correo
  si la cuenta no tiene nombre); búsqueda, filtro por estado y paginación.
- `suspendedBy` ausente en `GET /projects` y `GET /projects/:id`, presente en el panel.
- Recorte de permisos: el **dueño** baja de 18/18 a `canViewProject` + `canViewReports`;
  un miembro se queda solo con `canViewProject` (el recorte no concede lo que no había).
- Suspendido: lecturas 200 (proyecto, miembros, etiquetas, tareas); escrituras 403
  `PROJECT_SUSPENDED` (etiqueta, tarea, renombrar, rol) — **incluidas las tareas, que
  viven en otro microservicio**.
- `DELETE /projects/:projectId/membership/me` (ruta sin decorador de permiso) → 403
  `PROJECT_SUSPENDED`.
- Archivado: 404 al dueño, fuera de su listado, visible solo en el panel.
- Los 4 verbos del registro distinguidos, incluido `PROJECT_RESTORED`.
- Invalidación de caché: la clave `project:<id>` se borra al suspender y la escritura
  siguiente ya falla, sin esperar el TTL de 5 min.
- Acceso: Sofía (Admin) 200 · María (User) 403 · sin token 401.
- Validación: sin motivo 400 · motivo de 2 caracteres 400 · estado inventado 400.
- 35 pruebas del gateway y 11 de projects-service en verde; 0 errores de tipos en gateway,
  projects-service y las 6 zonas de frontend.

---

## Lo que NO está probado — aquí es donde te necesito

### 1. 🔴 Las pantallas nuevas, en un navegador

**Nadie las ha abierto.** Compilan y consumen la forma correcta, pero el render no está
verificado. Son cuatro archivos nuevos en `admin-front` más dos cambios en
`projects-front`:

- `/admin/proyectos` — tabla, filtros, paginación, estados vacíos.
- El diálogo de suspender/archivar/reactivar/**recuperar** (los cuatro textos, y que
  «Recuperar» aparezca solo en archivados).
- El aviso `SuspendedProjectNotice` en la pantalla del proyecto.
- La insignia `SUSPENDIDO` en la cuadrícula de `projects-front`.

Comprueba en particular:

- **Tema claro y oscuro.** El selector está en Configuración y se guarda en la cookie
  `praxis_theme`. Los colores nuevos (`bg-error-muted`, `border-error/40`) tienen que
  leerse en los dos.
- **Móvil.** Las tablas del panel se apilan en tarjetas por debajo de `md`.
- ⚠️ **Que los estilos existan.** Tailwind v4 descarta en silencio las clases que no
  encuentra escaneando; si un componente sale sin estilo, es esto (CLAUDE.md lo explica).
- Las pestañas del panel (Cuentas · Proyectos · Actividad) y que **ninguna** URL salga
  como `/admin/admin/...` — es la trampa del `basePath`, y en ese archivo conviven enlaces
  con prefijo y sin él a propósito.

### 2. 🔴 Regresión del flujo normal, completo

Todo lo de la sección «tres piezas compartidas». Es el bloque más importante.

### 3. 🟠 Casos que no probé y pueden fallar

- **Un miembro que no es el dueño**, mirando un proyecto suspendido en la interfaz: ¿ve el
  aviso? ¿le desaparecen los botones? Yo lo probé por API, no en pantalla.
- **Reports y el asistente** sobre un proyecto suspendido. `canViewReports` es de lectura,
  así que deberían seguir funcionando. **Sospecha concreta:** el asistente tiene
  herramientas que *escriben* (crea tareas, reasigna). ¿Qué pasa si le pides eso en un
  proyecto suspendido? Debería fallar con `PROJECT_SUSPENDED`, y la pregunta interesante es
  **cómo lo cuenta la pantalla**.
- **Un proyecto archivado en sitios que no revisé**: el selector de proyectos de Análisis,
  el panel de `dashboard-front`, los avisos, «mis tareas», el buscador. No debería aparecer
  en ninguno. Un aviso ya existente que apunte a una tarea de un proyecto luego archivado
  es un caso a probar: el enlace lleva a un 404.
- **Invitaciones.** Aceptar y rechazar están cerradas cuando el proyecto está suspendido.
  Prueba el flujo entero: invitar con el proyecto activo, suspender, y luego intentar
  aceptar. Y comprueba que la invitación pendiente no deja la pantalla en un estado raro.
- **La caché de permisos** (`project:<id>:user:<id>:permissions`, TTL 300s) contra el
  recorte por estado. Calienta la caché con un miembro, suspende, y comprueba que el
  recorte se aplica igual.
- **Suspender un proyecto y su dueño a la vez.** Dos suspensiones distintas cruzándose;
  nunca se ha probado juntas.
- **Concurrencia:** dos administradores cambiando el estado del mismo proyecto.

### 4. 🟡 Cosas que documenté y conviene que alguien más confirme

- Que `pnpm dev:backend` levanta de verdad los 8 servicios (yo solo verifiqué que el
  filtro de turbo resuelve a los paquetes correctos; nunca lo ejecuté).
- Que `pnpm prisma:reset` funciona (**no lo ejecuté a propósito**, borra datos). Si lo
  pruebas, hazlo sabiendo que se pierde lo que hay.
- Que el registro de actividad no se puede editar ni borrar por ninguna ruta.

---

## Un fallo pre-existente, para que no lo confundas con uno tuyo

`pnpm --filter @praxis/projects-service run test` sale **en rojo**, y no es de estos
cambios. El spec del andamiaje de Nest `src/app.controller.spec.ts` falla con «circular
dependency» porque `src/app.service.ts` ya no exporta nada (su contenido entero es un
comentario). Falla desde antes de esta rama. Las pruebas que importan:

```bash
pnpm --filter @praxis/gateway run test
pnpm --filter @praxis/projects-service exec jest src/projects src/project-roles
```

---

## Cómo quiero el informe

Por cada fallo: **qué esperabas, qué pasó, cómo reproducirlo** (petición o clics exactos),
y **si es de estos cambios o venía de antes** — comprobarlo con `git stash` o mirando el
código, no a ojo. Separa lo que es un fallo de lo que es una decisión de diseño con la que
no estás de acuerdo; las decisiones están razonadas en los comentarios y en §31, y si crees
que alguna está mal, dilo aparte y con el argumento.

Si algo no llegaste a probar, **dilo explícitamente** en vez de dejarlo implícito. Un
informe que dice «no probé el asistente» es más útil que uno que lo omite.

No arregles nada sin preguntar, salvo que sea trivial y evidente. Tu trabajo es encontrar,
no reparar.
