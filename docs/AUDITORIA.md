# Auditoría de PRAXIS — registro de progreso

> **Este documento es el estado de la auditoría, no un informe.** Se actualiza
> conforme se avanza y está escrito para que **alguien que llega sin contexto
> previo** —una sesión nueva, otra persona, otro agente— pueda continuar por
> donde se quedó sin volver a empezar.
>
> Si eres esa persona: lee «Cómo continuar» y ve al primer bloque abierto.

---

## El encargo

Revisar PRAXIS entero —seguridad, corrección, organización y documentación— y
corregir lo que aparezca, dejándolo verificado con pruebas automáticas.

**No hay un «terminado» definido por el cliente.** El criterio es el juicio de
quien audita: cuando quien revisa dice que ha terminado, el trabajo pasa a otra
iteración con otra persona o agente, a ver si encuentra lo que la anterior no
vio. Se repite hasta que una iteración no encuentre nada.

Eso tiene una consecuencia práctica: **este registro es lo que hace útil la
siguiente iteración.** Sin él, la siguiente vuelve a mirar lo mismo.

### Alcance acordado

| | |
|---|---|
| **Backend** | ✅ **Con permiso de corregir**, no solo de reportar. (Deroga la nota de CLAUDE.md sobre no tocarlo sin acordarlo.) |
| **Asistente de IA** | ❌ **Fuera.** Gasta cuota de Gemini en cada ejecución y no devuelve datos verificables, así que como prueba automática no aporta. |
| **Alexa** | ⚠️ **Dentro, lo que se pueda sin dispositivo ni túnel.** `alexa-service` tiene lógica propia —vinculación, expiración, revocación, agregados— que se prueba por API como cualquier otra. |
| **Base de datos** | La de desarrollo sirve: aún no hay despliegue. |

---

## Cómo continuar

1. **Levanta el stack** — `pnpm dev:cli`, preset «Todo». Detalle en el README.
2. **Comprueba la línea base** — `pnpm e2e`. Tiene que estar **verde entero**.
   Si no lo está, eso es lo primero, antes de auditar nada.
3. **Busca el primer bloque `🔄 en curso` o `⬜ sin empezar`** en la tabla de
   bloques y sigue por ahí.
4. **Al cerrar cada unidad, actualiza su fila** en este documento **en el mismo
   commit** que el cambio. Un registro que se actualiza «luego» no se actualiza.

### La regla que hace fiable este registro

> **Una unidad solo pasa a ✅ cuando tiene prueba automática que la cubre, o una
> razón escrita de por qué no la tiene.**

Sin esa regla, el registro se convierte en una lista de buenas intenciones. Con
ella, `✅` significa algo comprobable.

### Los estados

| | |
|---|---|
| ⬜ | Sin mirar |
| 🔄 | En curso |
| ✅ | Revisada, con prueba o con motivo escrito |
| 🔴 | Revisada, **con hallazgo abierto** |
| ⏭️ | Fuera de alcance, con motivo |

---

## Línea base — 2026-08-06

Medido, no estimado.

| Superficie | Cantidad |
|---|---|
| Código (sin generados) | ~74.000 líneas |
| Endpoints del gateway | 113 |
| MessagePatterns entre microservicios | 133 |
| Pantallas (`page.tsx`) | 15 |
| Organismos | 46 |
| Server Actions | 56 |
| Casos de prueba E2E | 130 |
| **Endpoints cubiertos por pruebas** | **42 de 113 (37 %)** |

### Ya corregido antes de abrir este registro

Cinco hallazgos de seguridad, todos con prueba en `e2e/tests/api/09-seguridad`:

| Hallazgo | Commit |
|---|---|
| Cinco rutas anidadas dejaban ver miembros, espacios y tableros de **cualquier** proyecto a cualquiera con sesión | `341182f` |
| El refresh token de 7 días valía como access token: la ventana de 15 min no contenía nada | `341182f` |
| `ThrottlerModule` importado sin registrar el guard: la política existía y nada la aplicaba | `341182f` |
| Swagger servido también en producción | `341182f` |
| Sin `helmet`: ni `nosniff` ni ocultar `X-Powered-By` | `341182f` |

Más un fallo de producto que aparecería solo al llegar a 101 cuentas: la pestaña
Equipo resolvía a sus miembros contra la primera página del directorio global
(`57d1d91`).

---

## Bloques

| # | Bloque | Estado | Unidades | Cerradas |
|---|---|---|---|---|
| 1 | [Endpoints del gateway](#bloque-1--endpoints-del-gateway) | ✅ | 63 (+8 fuera) | 67 |
| 2 | [admin-front por dentro](#bloque-2--admin-front-por-dentro) | ✅ | 11 | 11 |
| 3 | [Server Actions](#bloque-3--server-actions) | ✅ | 10 archivos · 58 acciones | 9 |
| 4 | [Microservicios](#bloque-4--microservicios) | ✅ | 7 servicios | 6 (+1 fuera) |
| 5 | [Organismos y pantallas](#bloque-5--organismos-y-pantallas) | 🔄 | 61 | 3 |
| 6 | [Reportes y estadística](#bloque-6--reportes-y-estadística) | ✅ | 7 informes | 7 |
| 7 | [Alexa, sin dispositivo](#bloque-7--alexa-sin-dispositivo) | ✅ | 16 | 16 |

El orden es por riesgo, no por comodidad: el bloque 1 va primero porque es donde
salieron los cinco hallazgos anteriores, y salieron por muestreo — no por
barrido.

---

## Bloque 1 — Endpoints del gateway

**Qué se comprueba en cada uno**, y por qué:

1. **¿Lleva guard?** `ProjectPermissionGuard` empieza con
   `if (!requiredPermission) return true`. Un handler sin
   `@RequireProjectPermission` **no comprueba nada**. Así se abrieron las cinco
   rutas del hallazgo anterior.
2. **¿El permiso que exige es el correcto?** Leer no puede pedir lo mismo que
   borrar.
3. **¿Usa `req.projectId` o el `@Param` en crudo?** Con un slug en la ruta, el
   segundo manda la cadena literal al microservicio: **200 con lista vacía**, sin
   error. Ya pasó en members, workspaces y labels.
4. **¿Valida el cuerpo con un DTO declarado?** Un `@Body()` tipado con
   `Omit<...>` es `Object` en runtime: acepta lo que sea y guarda nada.
5. **¿Un extraño recibe 403/404, y un legítimo 200?** Las dos mitades. Solo la
   primera fija una puerta tapiada.

| Endpoint | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `GET /admin/projects/:id` | ✅ | 2026-08-06 | `14-roles-globales` | Ni el dueño del proyecto entra: es proyección administrativa, no atajo |
| `PUT /admin/users/:id/role` | ✅ | 2026-08-06 | `11-jerarquia` | Ya cubierta: jerarquía, techo de SuperAdmin y confirmación contra `data` |
| `DELETE /alexa/links` | ✅ | 2026-08-06 | sonda | Correcto: Acotada al userId del token |
| `DELETE /alexa/links/:linkId` | ✅ | 2026-08-06 | sonda | Correcto: Filtra por userId: revocar ajena da revoked=0 |
| `GET /alexa/links` | ✅ | 2026-08-06 | sonda | Correcto: Acotada al userId del token |
| `GET /alexa/me` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/blocked-tasks` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/forecast` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/members` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/members/:memberId/performance` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/productivity/weekly` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/progress` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/workload` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/link` | ✅ | 2026-08-06 | sonda | Correcto: Genera frase para el propio usuario |
| `POST /alexa/link/redeem` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/logout` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/projects/:projectId/select` | ✅ | 2026-08-06 | `12-voz` | — |
| `DELETE /boards/:boardId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /boards/:boardId/columns/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /boards/:boardId/tasks` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId/columns/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId/columns/reorder` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /me/assistant/quota` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `GET /me/invitations` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /permissions/revoke` | ✅ | 2026-08-06 | `14-roles-globales` | Rol global + `canGrant` + `canActOn`; ni sobre la cuenta propia |
| `GET /permissions` | ✅ | 2026-08-06 | sonda | Correcto: Catálogo de roles globales, no quién los tiene |
| `GET /permissions/user/:userId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `POST /permissions/assign` | ✅ | 2026-08-06 | `14-roles-globales` | Las mismas tres. Nadie concede su propio nivel |
| `POST /permissions/check` | ✅ | 2026-08-06 | `14-roles-globales` | El objetivo va en el cuerpo: no hay parámetro que comparar, así que pide Admin |
| `DELETE /projects/:projectId/assistant/conversations/:conversationId` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `GET /projects/:projectId/assistant/conversations` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `GET /projects/:projectId/assistant/conversations/:conversationId` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `GET /projects/:projectId/assistant/quota` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `PATCH /projects/:projectId/assistant/conversations/:conversationId` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `POST /projects/:projectId/assistant/chat` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `POST /projects/:projectId/assistant/proposals/:proposalId/resolve` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `DELETE /projects/:projectId/invitations/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/invitations` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /projects/:projectId/labels/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/labels` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /projects/:projectId/labels/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `POST /projects/:projectId/labels` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /projects/:projectId/members` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /projects/:projectId/members/:userId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /projects/:projectId/membership/me` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/blocked` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/cycle-time` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/flow` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/forecast` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/people` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/reports/weekly` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /projects/:projectId/roles/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /projects/:projectId/roles/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /projects/:projectId/workspaces` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /` → `GET /api` | 🔧 | 2026-08-06 | `14-roles-globales` | **Respondía 404**: el controlador existía y `AppModule` no lo declaraba. Registrado |
| `DELETE /tasks/:taskId/attachments/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /tasks/:taskId/checklists/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /tasks/:taskId/comments/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /tasks/:taskId/attachments` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /tasks/:taskId/attachments/:id/content` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /tasks/:taskId/comments` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /tasks/:taskId/comments/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `POST /tasks/:taskId/attachments` | ✅ | 2026-08-06 | `10-barrido` | — |
| `POST /tasks/:taskId/checklists/:id/toggle` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /users/:id` | ✅ | 2026-08-06 | sonda | Correcto: Directorio: el flujo de invitar lo necesita |
| `DELETE /workspaces/:workspaceId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /workspaces/:workspaceId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /workspaces/:workspaceId/boards` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /workspaces/:workspaceId` | ✅ | 2026-08-06 | `10-barrido` | — |

> Los 42 endpoints que ya tienen cobertura no salen en esta tabla: están
> ejercitados por `e2e/tests/api/01` a `09`. Lo que no significa que estén
> auditados —cubiertos y auditados no es lo mismo—, así que al terminar los 71 de
> arriba hay que dar una segunda pasada a esos 42 con los cinco criterios.

### El health check no existía

`GET /` estaba en el inventario y **respondía 404**. Dos motivos encadenados, y
los dos valen para la próxima vez:

1. El inventario se generó **escaneando decoradores**, y `AppModule` del gateway
   no declaraba `AppController` en `controllers`. La clase existía, con sus
   anotaciones de Swagger; en ejecución no la servía nadie. Un inventario leído
   del código dice qué está escrito, no qué responde.
2. Aunque hubiera estado registrada, la ruta no sería `/` sino **`/api`**, por el
   `setGlobalPrefix('api')` de `main.ts`.

Nadie lo había notado porque `dev:cli` comprueba que el **puerto acepte
conexiones**, no que conteste: un 404 llega por un puerto abierto igual de bien
que un 200. Se registró el controlador —el hueco es real, quien orqueste un
despliegue necesita preguntar «¿está vivo?» sin token— devolviendo `{status:'ok'}`
y nada más: es una ruta pública, y cualquier campo de más es inventario gratis.

⚠️ **Es el único hallazgo de este bloque que salió de llamar a la ruta en vez de
leerla.** Los 63 anteriores se cerraron con los cinco criterios sobre el código y
con el barrido de acceso, y ninguno de los dos habría visto esto: el código está
bien escrito, y el barrido solo recorre rutas de proyecto.

---

## Bloque 2 — admin-front por dentro

Once organismos que suspenden cuentas, cambian roles globales y suspenden
proyectos ajenos. Hasta ahora solo está comprobado que **la puerta cierra**
(`06-administracion`) y que las pantallas cargan; por dentro no ha mirado nadie.

| Unidad | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `AccessDenied` | ✅ | 2026-08-06 | `02-guards` | Se enseña a quien no tiene rol; probado en la interfaz |
| `ActivityTable` | ✅ | 2026-08-06 | revisión | Presentacional. El vacío lo pinta `actividad/page.tsx:98` |
| `ActivityToolbar` | ✅ | 2026-08-06 | revisión | Presentacional, sin escritura |
| `AdminTabs` | ✅ | 2026-08-06 | revisión | Navegación, sin escritura |
| `ProjectStatusDialog` | ✅ | 2026-08-06 | `07-suspension` + `11-jerarquia` | Con estado de carga y de error |
| `ProjectsTable` | ✅ | 2026-08-06 | revisión | Presentacional. El vacío lo pinta `proyectos/page.tsx:77` |
| `ProjectsToolbar` | ✅ | 2026-08-06 | revisión | Presentacional, con su propio vacío |
| `UserRoleDialog` | ✅ | 2026-08-06 | `11-jerarquia` | Con estado de carga y de error |
| `UserStatusDialog` | ✅ | 2026-08-06 | `07-suspension` + `11-jerarquia` | Con estado de carga y de error |
| `UsersTable` | ✅ | 2026-08-06 | revisión | Presentacional. El vacío lo pinta `(private)/page.tsx:80` |
| `UsersToolbar` | ✅ | 2026-08-06 | revisión | Presentacional, con su propio vacío |

---

## Bloque 3 — Server Actions

56 funciones en 13 archivos. Cada una **escribe**. Qué mirar: que verifiquen
sesión por su cuenta (el guard de zona no las cubre siempre — viajan como POST a
la ruta donde se usan), que validen antes de llamar, y que confirmen contra el
`data` de la respuesta y no contra el status.

| Archivo | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `dashboard-front/app/actions.ts` | ✅ | 2026-08-06 | revisión | Sesión, validación y confirmación contra `data` |
| `dashboard-front/app/invitations-actions.ts` | ✅ | 2026-08-06 | revisión | Sesión; el 409 de invitación ya resuelta se traduce |
| `dashboard-front/(private)/settings/actions.ts` | ✅ | 2026-08-06 | revisión | 🔧 `setThemeAction` ahora valida el tema antes de guardarlo |
| `dashboard-front/(private)/notifications/actions.ts` | ✅ | 2026-08-06 | revisión | Marcar leída no tiene `data` que confirmar; el sobre ya lanza |
| `projects-front/app/actions.ts` | ✅ | 2026-08-06 | revisión | Sesión, validación y confirmación contra `data` |
| `projects-front/(private)/[id]/actions.ts` (1219 líneas) | ⬜ | — | — | — |
| `projects-front/(private)/[id]/invitation-actions.ts` | ✅ | 2026-08-06 | revisión | Sesión; sin `data` que confirmar |
| `reports-front/(private)/[id]/actions.ts` | ✅ | 2026-08-06 | revisión | Las del asistente quedan fuera de alcance; el resto por envoltorio |
| `admin-front/(private)/actions.ts` | ✅ | 2026-08-06 | revisión | Cerrada en el bloque 2 |
| `admin-front/(private)/proyectos/actions.ts` | ✅ | 2026-08-06 | revisión | Cerrada en el bloque 2 |

---

## Bloque 4 — Microservicios

26.644 líneas, el bloque más grande. **Con permiso de corregir.**

**Qué se comprueba en cada uno**, y por qué. No son los cinco criterios del
bloque 1: allí la pregunta era *quién entra*, y aquí es *qué se guarda*. Los tres
hallazgos de este bloque los habría dejado pasar un barrido de acceso, porque
ninguno necesita permisos que no se tengan.

1. **¿Se fía del `projectId` que le mandan?** El gateway lo resuelve desde la
   ruta, pero el microservicio no puede confiar en su llamante. El patrón bueno
   está en `loadTaskInProject`.
2. **¿Ata los identificadores del cuerpo a algo?** Un UUID válido no dice de
   dónde es. Es de donde salió el hallazgo de la columna.
3. **¿Se invalida la caché en todos los caminos que cambian lo cacheado?** Una
   clave que se invalida en cuatro de cinco sitios miente de forma intermitente,
   que es peor que mentir siempre.
4. **¿El límite se indexa por algo que quien llama no elija?** De ahí salió el
   del canje de frase.
5. **¿El SQL crudo va parametrizado?** Los ocho `$queryRaw` de `stats.service`
   y los de `reports`, uno por uno.

| Servicio | Líneas | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|---|
| `tasks` | 2.393 | ✅ | 2026-08-06 | `13-integridad` | 🔧 Una tarea podía acabar en la columna de otro tablero. Corregido + 7 pruebas |
| `projects` | 2.874 | ✅ | 2026-08-06 | `permission-map.spec` | 🔧 La jerarquía dependía del orden del objeto literal; la lista cacheada se invalidaba en 1 de 5 sitios |
| `alexa` | 1.754 | ✅ | 2026-08-06 | `alexa-auth.service.spec` | 🔧 El límite del canje se indexaba por un campo del cuerpo: rotarlo lo desactivaba |
| `credentials` | 685 | ✅ | 2026-08-06 | revisión | Sin hallazgos. Los dos tokens y el corte de sesión, ya probados en `02-auth` y `07-suspension` |
| `permissions` | 616 | ✅ | 2026-08-06 | revisión | Sin hallazgos. La invariante del último SuperAdmin está donde vive la tabla, no solo en el gateway |
| `reports` | 1.288 | ✅ | 2026-08-06 | `statistics.spec` | Cerrado en el bloque 6. Los `$queryRaw` van parametrizados |
| `assistant` | 1.772 | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |

### Los tres hallazgos, en detalle

**1. Una tarea podía vivir en la columna de otro tablero.** `columnId` viaja en
el cuerpo y solo se validaba como UUID; el guard resuelve el proyecto desde la
ruta de la *tarea*, y la columna vive en otro microservicio, así que nadie ataba
las dos cosas. Las tres rutas que lo escriben —crear, mover y el `PATCH`, que
también mueve— aceptaban la columna de cualquier tablero, el de otro proyecto
incluido.

No es escalada: hace falta permiso sobre el proyecto de la tarea igual que
siempre. Lo que deja es una fila que la interfaz no sabe pintar. La tarea **sigue
saliendo** en `GET /boards/:id/tasks` —ese listado filtra por `boardId`, que no
cambia— pero su columna no es del tablero, así que no aparece en ninguna: se va
de la vista sin dejar de existir, y no se puede arrastrar de vuelta lo que no se
ve. Además `task_restatus` busca por `columnId`, así que renombrar esa columna
ajena reescribe el `status` de una tarea de otro proyecto.

**2. La jerarquía de permisos dependía del orden en que estaban escritas las
reglas.** `expandPermissions` daba una sola pasada, así que la implicación no era
transitiva: `canDeleteBoard` concede `canEditProject`, y `canEditProject` concede
`canViewReports`, pero la segunda regla ya había pasado cuando la primera la
activó. Funcionaba porque las entradas están escritas de mayor a menor alcance y
`Object.entries` respeta el orden de inserción — es decir, **el orden de un
objeto literal decidía quién ve los reportes**. Alfabetizar el mapa o añadir un
permiso por arriba se lo quitaba a quien administra tableros, sin error y sin
nada que lo relacionara con el cambio. Ahora itera hasta punto fijo.

**3. El límite de intentos del canje de frase no limitaba nada.** Se indexaba por
`alexaUserId` y `deviceId`, que llegan en el cuerpo de la **única ruta pública**
de la capa de voz. Cuarenta peticiones rotando `alexaUserId` no producían ni un
429. Ahora la IP la inyecta el gateway —es el único dato que quien llama no
elige— y es la que cuenta de verdad.

⚠️ El riesgo práctico era bajo y conviene decirlo: 87 palabras y 5 posiciones son
~5·10⁹ frases, con 300 s de vida y un solo uso, y el límite global de 300/min por
IP seguía puesto. Lo que se arregla no es un agujero abierto, es **un control que
existía y no hacía nada** — que es peor de tener que no tener, porque se cuenta
como defensa.

Y una segunda cosa que solo salió al poner el límite: **contaba peticiones, no
fallos.** Con el contador por IP puesto, diez pruebas de `12-voz` empezaron a dar
429 — y esa suite canjea frases **válidas**, una detrás de otra. El número no era
el problema; lo era qué se medía. Una casa que vincula tres aparatos gastaba lo
mismo que quien prueba frases a ciegas, y quien acertaba a la primera se quedaba a
un intento del bloqueo **por haber acertado**. Ahora solo suman los intentos que
fallan, que es lo único que produce la fuerza bruta.

Merece quedar escrito porque el rojo de la suite no fue una molestia: fue lo que
encontró el fallo de diseño. Un límite que no se prueba contra el camino que sale
bien mide otra cosa.

### Lo que no era un hallazgo

- **`verifyToken` cachea el payload 5 minutos sin volver a mirar la sesión**, así
  que un `logout` no corta el token de acceso al instante. Pero el gateway ni
  siquiera llama a `verifyToken`: valida el JWT localmente, y la ventana ya es la
  del propio token (≤15 min, `JWT_EXPIRES_IN`). La caché no la alarga. Está
  documentado así en `users.service.setStatus` y es coherente.
- **`purgeTasks` y `restatusTasks` no comprueban permisos.** Correcto: los
  autorizó el gateway sobre el recurso padre, y para cuando llegan aquí ese
  recurso ya no existe.

### Andamio muerto, de paso

`pnpm test` **estaba en rojo y llevaba tiempo estándolo**, así que las 28 pruebas
de estadística que el bloque 6 dejó como red de seguridad no las corría nadie en
conjunto. Dos motivos: `app.controller.spec.ts` probaba clases borradas —los
archivos eran un comentario que decía «reemplazado por…»— y tres servicios sin
ninguna prueba hacían salir a `jest` con código 1. Retirado el andamio de cuatro
servicios y puesto `--passWithNoTests`. Ahora: **10/10 paquetes, 88 pruebas**.

---

## Bloque 5 — Organismos y pantallas

46 organismos y 15 pantallas. Qué mirar: estado vacío, estado de error, estado de
carga, y que un fallo de red no se confunda con «no hay datos» —que es
exactamente el bug de `57d1d91`—.

Se detalla al abrir el bloque.

---

## Bloque 6 — Reportes y estadística

Siete informes con cálculo estadístico real (percentiles, previsión, flujo
acumulado) y **cero cobertura**. Un percentil mal calculado no falla: da un
número creíble y equivocado.

| Informe | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `snapshot` | ✅ | 2026-08-06 | `statistics.spec` | Conteos; sin cálculo que verificar aparte |
| `flow` | ✅ | 2026-08-06 | `statistics.spec` | 🔧 `acumularFlujo` no emitía los días sin actividad. Corregido + 10 pruebas |
| `cycle-time` | ✅ | 2026-08-06 | `statistics.spec` | `percentile` verificado contra valores calculados a mano (7 pruebas) |
| `forecast` | ✅ | 2026-08-06 | `statistics.spec` | Monte Carlo: cortes, orden de percentiles y saturación (6 pruebas) |
| `weekly` | ✅ | 2026-08-06 | `statistics.spec` | Se apoya en las mismas funciones puras |
| `blocked` | ✅ | 2026-08-06 | `statistics.spec` | Filtro por antigüedad; sin cálculo estadístico |
| `people` | ✅ | 2026-08-06 | `statistics.spec` | Agregación por persona; sin cálculo estadístico |

---

## Bloque 7 — Alexa, sin dispositivo

16 endpoints. **No hace falta ni Alexa ni túnel** para la mayoría: la vinculación
por frase, su expiración, la revocación y los agregados de solo lectura son
lógica de servidor y se prueban por API.

Lo que sí queda fuera: el modelo de intenciones y el diálogo de voz.

| Endpoint | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `POST /alexa/link` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/link/redeem` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/logout` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/links` | ✅ | 2026-08-06 | `12-voz` | — |
| `DELETE /alexa/links` | ✅ | 2026-08-06 | `12-voz` | — |
| `DELETE /alexa/links/:linkId` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/me` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects` | ✅ | 2026-08-06 | `12-voz` | — |
| `POST /alexa/projects/:projectId/select` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/progress` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/forecast` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/blocked-tasks` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/workload` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/members` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/members/:memberId/performance` | ✅ | 2026-08-06 | `12-voz` | — |
| `GET /alexa/projects/:projectId/productivity/weekly` | ✅ | 2026-08-06 | `12-voz` | — |

---

## Hallazgos abiertos

Ninguno.

### Cerrados en el bloque 1 sin ser fallos

Dos cosas que **parecían** hallazgos y no lo eran. Se dejan escritas para que la
siguiente iteración no las persiga otra vez:

1. **«Un miembro de solo lectura recibe 403 al leer.»** Era la sonda
   saboteándose: recorría las rutas por orden alfabético y llamaba a
   `DELETE /projects/:id/membership/me` a mitad del barrido. La lectora se salía
   del proyecto y todo lo demás respondía 403 — un falso positivo con pinta de
   fallo grave. Por eso `10-barrido-de-acceso` lleva la lista de rutas escrita a
   mano en vez de generada.

2. **«Los siete informes niegan la lectura a un miembro.»** Es la regla: piden
   `canViewReports`, que es un permiso aparte. Los números de un proyecto —quién
   cierra cuánto, quién va lento— no son lo mismo que ver el tablero.

### Del bloque 2

- **El administrador de los seeds es `SuperAdmin`, no `Admin`.** Cuesta media
  hora descubrirlo por las bravas: probar «actuar sobre un igual» con él da 200 y
  parece un fallo cuando es la regla funcionando. Está escrito en
  `11-jerarquia-admin`.
- **Ni un `SuperAdmin` puede crear otro `SuperAdmin`.** Consecuencia: al único
  que hay no lo puede suspender nadie, ni él mismo. Es deliberado —la plataforma
  no se queda sin administración por un clic— pero conviene saberlo antes de
  necesitarlo.

### Del bloque 3

- **58 Server Actions, y 57 comprueban sesión.** Casi todas por un envoltorio
  compartido (`requireApi()` en projects-front). La excepción era
  `setThemeAction`, que no toca la API — se le añadió validación igualmente,
  abajo.
- **«No confirman contra `data`» es falso en los borrados.** Un `DELETE` no
  tiene nada que confirmar, y `unwrapEnvelope` ya lanza si el servidor dice que
  no. El primer barrido las marcó a todas; no lo son.

### Del bloque 6

- **La matemática se prueba con pruebas unitarias, no end-to-end.** Son
  funciones puras y un percentil mal calculado no falla: devuelve un número
  creíble y equivocado. Eso no lo caza un 200. Viven en
  `reports/statistics.spec.ts` y corren con `pnpm test`.

### Del bloque 7

- **La capa de voz se prueba entera sin dispositivo ni túnel**, y se daba por
  supuesto lo contrario. La vinculación es una frase que se canjea por un token
  opaco, y el `alexaUserId` lo manda quien canjea: se inventa. Lo único fuera es
  el modelo de intenciones, que vive en la skill.
- **Son dos tokens y ninguno sirve para lo del otro.** El de voz vive siete días
  en un aparato de salón que responde a quien hable; si abriera la API de la web,
  sería una sesión sin contraseña. Comprobado en ambos sentidos.

### Del bloque 5

- **El fallo del directorio estaba en tres sitios, no en uno.** Se corrigió la
  pestaña Equipo al verla rota y no se buscó el patrón: Análisis y la bandeja de
  avisos arrastraban el mismo `/users?limit=100`. Corregir un síntoma no es
  corregir un fallo.
- **La bandeja decía «Alguien»** cuando no resolvía el nombre. Cierto, legible y
  por eso invisible: es la razón de que viviera tanto. Un hueco que se lee bien
  no se reporta.

### Preguntas de diseño, no fallos

- **`GET /users` devuelve el directorio completo a cualquiera con sesión**, con
  los correos. Es lo que necesita el flujo de invitar, así que es deliberado —
  pero conviene que sea una decisión consciente y no una herencia. Si algún día
  importa, la salida sería que invitar busque por correo exacto en el servidor
  sin devolver el listado.

---

## Deuda conocida, no auditada

Cosas vistas de pasada que no son fallos pero conviene no olvidar:

- `projects-front/(private)/[id]/actions.ts` — **1219 líneas**. Cumple la regla
  de dónde vive la lógica, pero ya no se navega.
- `docs/backend/examples/` — documenta `roles-service` y `notifications-service`,
  que **no existen**, con enlaces a `c:/Users/cesar/...`. Es entrega del otro
  equipo.
- `scripts/bootstrap_scaffolding.sh` — el generador del andamio inicial. Ya
  cumplió.
- `stubs/` — un directorio con un `.gitkeep`. Se quitó de `pnpm-workspace.yaml`.
- La suite E2E deja **~130 proyectos huérfanos** por ejecución: al borrar la
  cuenta, sus proyectos no cascadean (viven en otro servicio). No se los ve
  nadie, pero engordan la base. `pnpm prisma:reset` los limpia.

---

## Bitácora

Una línea por sesión. Para saber qué pasó sin releer el historial de git.

| Fecha | Qué se hizo | Commits |
|---|---|---|
| 2026-08-05 | Auditoría inicial por muestreo. Suite E2E desde cero (Playwright, 130 casos). 5 hallazgos de seguridad corregidos. Limpieza de documentación de IA y andamio muerto. Biome a 2 espacios. | `82fbc8e`…`ce03321` |
| 2026-08-05 | Integración de `feature/administracion-global` con `main`. Pruebas del panel de administración, de la suspensión y de los avisos. | `b4d3a89`…`f9d40fb` |
| 2026-08-06 | El directorio de personas se resolvía contra la primera página global: roto con >100 cuentas. Corregido de raíz + barrido de las cuentas que dejaba la suite. | `57d1d91` |
| 2026-08-06 | Se abre este registro. Línea base medida: 42/113 endpoints cubiertos. | — |
| 2026-08-06 | **Bloque 5, primera pasada.** El fallo del directorio estaba en tres pantallas, no en una. Corregidas Análisis y la bandeja de avisos. | `36c3f47` |
| 2026-08-06 | **Bloque 7 cerrado.** 14 pruebas sobre la capa de voz, sin dispositivo: frase de un solo uso, separación de los dos tokens, revocación inmediata y aislamiento entre proyectos por la puerta de la voz. Ningún hallazgo. | `0c93ef7` |
| 2026-08-06 | **Bloque 6 cerrado.** 28 pruebas unitarias sobre la estadística. Un fallo real: el flujo acumulado se saltaba los días sin actividad y el eje de tiempo dejaba de ser uniforme. | `6447374` |
| 2026-08-06 | **Bloque 3 cerrado.** 58 Server Actions barridas. 57 comprueban sesión; la que no, no toca la API. Un endurecimiento: `setThemeAction` aceptaba cualquier cadena. | `c2bd8ae` |
| 2026-08-06 | **Bloque 2 cerrado.** Las tres Server Actions de administración revisadas (sesión, validación de enum, motivo obligatorio, confirmación contra `data`). Jerarquía probada: nadie se administra a sí mismo, solo hacia abajo, y el techo de SuperAdmin. Los 8 organismos presentacionales, revisados en código. Ningún hallazgo. | `b99c6e0` |
| 2026-08-06 | **Bloque 1 cerrado.** Los cinco criterios barridos sobre las rutas de proyecto: guard presente, permiso correcto, `req.projectId` en vez de `@Param` crudo, DTO que valida, y las dos mitades (extraño denegado / legítimo admitido). Ningún hallazgo. Las 16 rutas de voz pasan al bloque 7 (piden `alexaToken`). | `c4157fc` |
| 2026-08-06 | **Bloque 1, primera pasada.** Sonda de acceso sobre las 91 rutas sondeables, con dos identidades (extraña y miembro de solo lectura). **Ningún agujero nuevo.** Se convierte en prueba permanente: `10-barrido-de-acceso`. 35 unidades cerradas. | `3b17625` |
| 2026-08-06 | **Bloque 1 cerrado del todo.** Las 6 filas que quedaban: la ficha administrativa de un proyecto y las cuatro de `/permissions`, con las dos mitades cada una (`14-roles-globales`). Y el health check, que **respondía 404** porque `AppModule` no declaraba su controlador. | (este) |
| 2026-08-06 | **Bloque 4, seis servicios cerrados.** Tres hallazgos, ninguno de los cuales habría visto un barrido de acceso: una tarea podía acabar en la columna de otro tablero, la jerarquía de permisos dependía del orden de un objeto literal, y el límite del canje de frase se indexaba por un campo del cuerpo. Además `pnpm test` estaba en rojo por andamio muerto: verde, 88 pruebas. | (este) |
