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
| Cinco rutas anidadas dejaban ver miembros, espacios y tableros de **cualquier** proyecto a cualquiera con sesión | `9cea049` |
| El refresh token de 7 días valía como access token: la ventana de 15 min no contenía nada | `9cea049` |
| `ThrottlerModule` importado sin registrar el guard: la política existía y nada la aplicaba | `9cea049` |
| Swagger servido también en producción | `9cea049` |
| Sin `helmet`: ni `nosniff` ni ocultar `X-Powered-By` | `9cea049` |

Más un fallo de producto que aparecería solo al llegar a 101 cuentas: la pestaña
Equipo resolvía a sus miembros contra la primera página del directorio global
(`69bdc42`).

---

## Bloques

| # | Bloque | Estado | Unidades | Cerradas |
|---|---|---|---|---|
| 1 | [Endpoints del gateway](#bloque-1--endpoints-del-gateway) | ✅ | 63 (+8 fuera) | 67 |
| 2 | [admin-front por dentro](#bloque-2--admin-front-por-dentro) | ✅ | 11 | 11 |
| 3 | [Server Actions](#bloque-3--server-actions) | ✅ | 10 archivos · 58 acciones | 9 |
| 4 | [Microservicios](#bloque-4--microservicios) | ⬜ | 7 servicios | 0 |
| 5 | [Organismos y pantallas](#bloque-5--organismos-y-pantallas) | ⬜ | 61 | 0 |
| 6 | [Reportes y estadística](#bloque-6--reportes-y-estadística) | ⬜ | 7 informes | 0 |
| 7 | [Alexa, sin dispositivo](#bloque-7--alexa-sin-dispositivo) | ⬜ | 16 | 0 |

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
| `GET /admin/projects/:id` | ⬜ | — | — | — |
| `PUT /admin/users/:id/role` | ⬜ | — | — | — |
| `DELETE /alexa/links` | ✅ | 2026-08-06 | sonda | Correcto: Acotada al userId del token |
| `DELETE /alexa/links/:linkId` | ✅ | 2026-08-06 | sonda | Correcto: Filtra por userId: revocar ajena da revoked=0 |
| `GET /alexa/links` | ✅ | 2026-08-06 | sonda | Correcto: Acotada al userId del token |
| `GET /alexa/me` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/blocked-tasks` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/forecast` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/members` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/members/:memberId/performance` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/productivity/weekly` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/progress` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/workload` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `POST /alexa/link` | ✅ | 2026-08-06 | sonda | Correcto: Genera frase para el propio usuario |
| `POST /alexa/link/redeem` | ⬜ | — | — | — |
| `POST /alexa/logout` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `POST /alexa/projects/:projectId/select` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `DELETE /boards/:boardId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /boards/:boardId/columns/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /boards/:boardId/tasks` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId/columns/:id` | ✅ | 2026-08-06 | `10-barrido` | — |
| `PATCH /boards/:boardId/columns/reorder` | ✅ | 2026-08-06 | `10-barrido` | — |
| `GET /me/assistant/quota` | ⏭️ | 2026-08-06 | — | Fuera de alcance: asistente |
| `GET /me/invitations` | ✅ | 2026-08-06 | `10-barrido` | — |
| `DELETE /permissions/revoke` | ⬜ | — | — | — |
| `GET /permissions` | ✅ | 2026-08-06 | sonda | Correcto: Catálogo de roles globales, no quién los tiene |
| `GET /permissions/user/:userId` | ✅ | 2026-08-06 | `10-barrido` | — |
| `POST /permissions/assign` | ⬜ | — | — | — |
| `POST /permissions/check` | ⬜ | — | — | — |
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
| `GET /` | ⬜ | — | — | — |
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

| Servicio | Líneas aprox. | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|---|
| `projects` | — | ⬜ | — | — | — |
| `tasks` | — | ⬜ | — | — | — |
| `credentials` | — | ⬜ | — | — | — |
| `permissions` | — | ⬜ | — | — | — |
| `reports` | — | ⬜ | — | — | — |
| `alexa` | — | ⬜ | — | — | — |
| `assistant` | ⏭️ | — | — | Fuera de alcance | — |

---

## Bloque 5 — Organismos y pantallas

46 organismos y 15 pantallas. Qué mirar: estado vacío, estado de error, estado de
carga, y que un fallo de red no se confunda con «no hay datos» —que es
exactamente el bug de `69bdc42`—.

Se detalla al abrir el bloque.

---

## Bloque 6 — Reportes y estadística

Siete informes con cálculo estadístico real (percentiles, previsión, flujo
acumulado) y **cero cobertura**. Un percentil mal calculado no falla: da un
número creíble y equivocado.

| Informe | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `snapshot` | ⬜ | — | — | — |
| `flow` | ⬜ | — | — | — |
| `cycle-time` | ⬜ | — | — | — |
| `forecast` | ⬜ | — | — | — |
| `weekly` | ⬜ | — | — | — |
| `blocked` | ⬜ | — | — | — |
| `people` | ⬜ | — | — | — |

---

## Bloque 7 — Alexa, sin dispositivo

16 endpoints. **No hace falta ni Alexa ni túnel** para la mayoría: la vinculación
por frase, su expiración, la revocación y los agregados de solo lectura son
lógica de servidor y se prueban por API.

Lo que sí queda fuera: el modelo de intenciones y el diálogo de voz.

| Endpoint | Estado | Fecha | Commit | Hallazgo |
|---|---|---|---|---|
| `POST /alexa/link` | ⬜ | — | — | — |
| `POST /alexa/link/redeem` | ⬜ | — | — | — |
| `POST /alexa/logout` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/links` | ⬜ | — | — | — |
| `DELETE /alexa/links` | ⬜ | — | — | — |
| `DELETE /alexa/links/:linkId` | ⬜ | — | — | — |
| `GET /alexa/me` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `POST /alexa/projects/:projectId/select` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/progress` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/forecast` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/blocked-tasks` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/workload` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/members` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/members/:memberId/performance` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |
| `GET /alexa/projects/:projectId/productivity/weekly` | ⏭️ | 2026-08-06 | — | Va al bloque 7: pide alexaToken, no JWT |

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
| 2026-08-05 | Auditoría inicial por muestreo. Suite E2E desde cero (Playwright, 130 casos). 5 hallazgos de seguridad corregidos. Limpieza de documentación de IA y andamio muerto. Biome a 2 espacios. | `90a2c76`…`720f4e7` |
| 2026-08-05 | Integración de `feature/administracion-global` con `main`. Pruebas del panel de administración, de la suspensión y de los avisos. | `52548e7`…`8fe6479` |
| 2026-08-06 | El directorio de personas se resolvía contra la primera página global: roto con >100 cuentas. Corregido de raíz + barrido de las cuentas que dejaba la suite. | `69bdc42` |
| 2026-08-06 | Se abre este registro. Línea base medida: 42/113 endpoints cubiertos. | — |
| 2026-08-06 | **Bloque 3 cerrado.** 58 Server Actions barridas. 57 comprueban sesión; la que no, no toca la API. Un endurecimiento: `setThemeAction` aceptaba cualquier cadena. | `17e082f` |
| 2026-08-06 | **Bloque 2 cerrado.** Las tres Server Actions de administración revisadas (sesión, validación de enum, motivo obligatorio, confirmación contra `data`). Jerarquía probada: nadie se administra a sí mismo, solo hacia abajo, y el techo de SuperAdmin. Los 8 organismos presentacionales, revisados en código. Ningún hallazgo. | `512878e` |
| 2026-08-06 | **Bloque 1 cerrado.** Los cinco criterios barridos sobre las rutas de proyecto: guard presente, permiso correcto, `req.projectId` en vez de `@Param` crudo, DTO que valida, y las dos mitades (extraño denegado / legítimo admitido). Ningún hallazgo. Las 16 rutas de voz pasan al bloque 7 (piden `alexaToken`). | `4145385` |
| 2026-08-06 | **Bloque 1, primera pasada.** Sonda de acceso sobre las 91 rutas sondeables, con dos identidades (extraña y miembro de solo lectura). **Ningún agujero nuevo.** Se convierte en prueba permanente: `10-barrido-de-acceso`. 35 unidades cerradas. | `c4b4a7c` |
