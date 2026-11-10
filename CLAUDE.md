# PRAXIS — Contexto de trabajo

Monorepo SOFEA: microfrontends Next.js 16 + microservicios NestJS.
**Nuestro trabajo es exclusivamente el frontend.** El backend lo desarrolla otro equipo; nosotros consumimos lo que existe y documentamos lo que falta — no lo modificamos sin acordarlo.

## Documentos de referencia

| Documento | Cuándo consultarlo |
|---|---|
| [docs/frontend/ESTADO-ACTUAL.md](docs/frontend/ESTADO-ACTUAL.md) | Arquitectura, estado de cada microfrontend, deuda técnica priorizada, roadmap |
| [docs/frontend/CONTRATO-API.md](docs/frontend/CONTRATO-API.md) | **Antes de escribir cualquier fetch.** Rutas, DTOs, permisos, trampas |
| [docs/frontend/PENDIENTES-BACKEND.md](docs/frontend/PENDIENTES-BACKEND.md) | Lo que necesitamos del backend y no podemos resolver. Para pasárselo a ese equipo |
| [docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md](docs/frontend/PENDIENTES-BACKEND-AUTOMATIZACION.md) | Lo mismo, acotado al MVP de automatizaciones (Reglas) |
| [docs/frontend/GUION-DEMO-REGLAS.md](docs/frontend/GUION-DEMO-REGLAS.md) | Para enseñar el apartado Reglas: qué sembrar, qué pulsar, qué debe verse — y qué no se puede demostrar en vivo |
| [docs/frontend/PLAN-PULIDO.md](docs/frontend/PLAN-PULIDO.md) | Etapa de pulido. Cerrada; se conserva por el registro de qué se arregló y por qué |
| [docs/frontend/PLAN-REDISENO.md](docs/frontend/PLAN-REDISENO.md) | Etapa de rediseño. Cerrada; se conserva por las decisiones y el registro |
| [docs/frontend/PLAN-AUTOMATIZACION.md](docs/frontend/PLAN-AUTOMATIZACION.md) | Etapa de automatización — motor reactivo, el asistente que siempre responde y administración con más poder. Cerrada salvo S6/S7 |
| [docs/frontend/ENCARGO-ENTERPRISE.md](docs/frontend/ENCARGO-ENTERPRISE.md) | Lo que pidió el dueño del producto para la etapa Enterprise, y lo que delegó. Literal, y sigue siendo válido |
| [docs/frontend/PLAN-ENTERPRISE.md](docs/frontend/PLAN-ENTERPRISE.md) | 🚫 **Deprecado.** No es una fuente de verdad: sus decisiones las reemplaza el plan de abajo. Se conserva porque describe el código que ya existe |
| [docs/frontend/PLAN-ORGANIZACIONES.md](docs/frontend/PLAN-ORGANIZACIONES.md) | Etapa cerrada — la organización pasó a contener los proyectos, a cobrarse por asiento y a tener papeles. Se conserva por sus once decisiones y su registro; la continúa el plan de abajo |
| [docs/PLAN-ORGANIZACION-ACTIVA.md](docs/PLAN-ORGANIZACION-ACTIVA.md) | **Etapa cerrada salvo C10** — desaparece «Todas las organizaciones»: siempre hay una activa y todo cuelga de ella. El plan vale solo dentro de la organización que lo paga, y hay tope de tres por persona. ⚠️ Es el primer plan que **toca el backend**, por excepción acordada. Siete decisiones, cinco invariantes y el orden |
| [docs/AUDITORIA-ORGANIZACION-CHAT-MOVIL.md](docs/AUDITORIA-ORGANIZACION-CHAT-MOVIL.md) | **Auditoría abierta** (2026-09-03) — los 30 hallazgos que dejaron la organización activa, la barra lateral segmentada y el rediseño monocromo. Proyectos que caen en la organización equivocada, insignias apuntando a entradas de menú que ya no existen, el chat privado negando el paso que el gateway concede, y el móvil sin una sola puerta a los chats. Con severidad, reproducción, orden propuesto y casilla por hallazgo — **se marca al cerrar cada uno** |
| [docs/PLAN-ASIENTOS-CONGELADOS.md](docs/PLAN-ASIENTOS-CONGELADOS.md) | **Etapa cerrada** (2026-09-14) — bajar de plan no puede echar a nadie: los que sobran se **congelan dentro** en solo lectura, por antigüedad, y volver a pagar los descongela solo. El tope es `min(Subscription.seats, quotas.asientos)` y vive en `services/billing/src/organizations/asientos.ts`; lo aplica `QuotaService.exigirAsientoVivo` en el guard de proyecto **y a mano en `POST /projects`**, que el guard no cubre. Doce decisiones (D1–D12), cinco invariantes y el registro de A1–A7. Solo queda fuera, a propósito, el `TODO(A6+)` de D11 |
| [docs/AUDITORIA-PLANES.md](docs/AUDITORIA-PLANES.md) | **Los planes de pago.** Qué promete el catálogo y qué aplica el servidor, cuota por cuota. Incluye el plan **Pro** (entre Gratis y Equipo: menos inventario, más IA) y la retirada del `PRO` viejo por persona. ⚠️ Contesta por escrito si la cuota de PRAX es personal o del equipo — **personal, una entera por miembro** |
| [docs/deploy/STRIPE-MODO-REAL.md](docs/deploy/STRIPE-MODO-REAL.md) | Para pasar del sandbox a cobrar de verdad. Los cinco pasos, qué objetos hay que recrear (los de prueba **no se migran**) y las tres cosas que no se pueden equivocar. ⚠️ Activar la cuenta y las dos claves van a mano, siempre |
| [docs/PLAN-SCRUM-KANBAN.md](docs/PLAN-SCRUM-KANBAN.md) | **Etapa en revisión** (rama `feature/scrum-kanban`, 2026-09-23) — Scrum como **capa encima** del Kanban: `Board.scrumEnabled`, sprints, backlog, estimación, burndown, WIP blando y capacidad para PRAX. Veinte decisiones (D1–D20; D17–D20 sustituyen a D14–D16 tras la auditoría del 2026-09-24, que está al final con casilla por hallazgo) y el registro de cada fase. **Se sigue estrictamente**: una sesión que retome esto empieza leyéndolo entero |
| [docs/PLAN-DOCUMENTOS.md](docs/PLAN-DOCUMENTOS.md) | Documentos dentro de los Espacios. **Etapa 2 entregada** (2026-09-25): editor en bloques (TipTap) **en tiempo real** (`collab-service`, Hocuspocus, puerto 3010), guardado como Yjs + copia en Markdown, compartir como Google Docs (`/d/<id>`), imágenes, versiones y documentos vinculados a tareas. Decisiones E1–E11 y sus trampas |
| [docs/PLAN-FUSION-ZONAS.md](docs/PLAN-FUSION-ZONAS.md) | **Etapa cerrada** (2026-09-04, rama `feature/fusion-zonas`) — Multi-Zones fusionado en una sola aplicación. Por qué nacieron las zonas (un requisito de una materia, no una decisión de arquitectura), por qué no se sostenían —las 8 apps corrían en **un solo contenedor**, todo el coste y ningún beneficio— y cómo se hizo: ocho decisiones, seis invariantes y doce pasos (F0–F11), **ninguna URL cambiada**. Se conserva por el registro: cada paso anota qué trampa apareció, y varias no dan error —`revalidatePath` sin prefijo, `projectPath()`, un `redirect()` bajo un layout que ya hace streaming— |
| [docs/PLAN-AWS.md](docs/PLAN-AWS.md) | **Auditoría de infraestructura (2026-11-09)** — qué corre en Railway de verdad (memoria, base, adjuntos, Redis, cron), contrastado con el código; coste real; y el plan para salir de Railway a una EC2 + S3. Léelo antes de tocar el despliegue |
| [docs/PLAN-MONOLITO.md](docs/PLAN-MONOLITO.md) | **Etapa en curso** (2026-09-29): el backend pasa de once procesos a **uno**. La RAM de `praxis-api` era ~90% de la factura de Railway y no era un leak, sino el coste fijo de once V8 en reposo: 1.335 MB frente a 189. Transporte en proceso con la semántica exacta de TCP, fuera Alexa y las rutas muertas de Análisis, y un reposo que deja dormir al contenedor. Diez decisiones, el orden y cómo se despliega. **Va antes que el de PRAX** |
| [docs/PLAN-PRAX-SEMIAGENTICO.md](docs/PLAN-PRAX-SEMIAGENTICO.md) | **En `main` y desplegado.** Al final, el **registro del pulido del 2026-09-30** —foco de proyecto, pensamiento visible, anillo de tokens, **segundo modelo gpt-oss por OpenRouter**, lotes `proponer_tareas`/`proponer_borrados`, sesión caducada en el proxy— con **cómo retomarlo** y lo pendiente. **Léelo antes de tocar PRAX.** Origen: F0–F10 (2026-09-29) — refactor de PRAX, frontend y **backend** por encargo: bucle de consultas de solo lectura (**sigue proponiendo, nunca ejecuta**), turno por SSE, «Recursos» guardado en servidor y atado a la organización activa, cobro en tokens ponderados, Jev como router opcional detrás de un interruptor, `ChatMessage.origin`, @PRAX en el chat grupal y el rediseño de ambos chats. Diecisiete decisiones (D1–D17), seis invariantes y once fases. ⚠️ Destapa que **el corte de 15 s del cliente** es la causa más probable de «PRAX no responde». **Se sigue estrictamente** |
| [docs/PLAN-MCP.md](docs/PLAN-MCP.md) | **Cerrada salvo M7** (2026-10-02; M7/OAuth condicionado al uso) — Praxis como **servidor MCP** en `POST /api/mcp`, con 56 herramientas (campos personalizados y enlaces de tarea desde 2026-10-07; editar un punto del checklist desde 2026-10-11), tokens personales en `/main/integrations` y un interruptor por organización. **Lee su «Registro de la entrega» antes de tocarlo**. Origen: para el agente que cada usuario ya usa (Claude, Cursor…), con lectura, escritura y borrado bajo el token del usuario. **No es PRAX** y no le aplica «propone; nunca ejecuta». Token personal atado a una organización, canjeado por un JWT de acceso para no tocar los 224 endpoints; OAuth queda condicionado al uso. Pantalla en `/main/integrations`, interruptor por organización y entrada pública por `web` (M13–M15). Doce decisiones más esas tres, seis invariantes y fases M0–M7 |
| [docs/PLAN-PRO-INTEGRACIONES.md](docs/PLAN-PRO-INTEGRACIONES.md) | **P0–P2 cerradas, falta GitHub (P3) y medir (P4)** (2026-10-02) — el plan **Pro pasa a precio fijo**: **99 MXN/mes, 7 asientos, 7 proyectos, mes de prueba —uno por persona y por organización, `billing.trial_redemptions`— y Equipo sin él**, y es **el primero con MCP y GitHub**. Decisiones D1–D13, el estado de Stripe (⚠️ **dos cuentas**: la real y un sandbox, que es el del `.env` local; el precio de 99 en real va a mano) y las fases P1–P4. Las integraciones viven en `/main/integrations`, son personales y la organización puede apagarlas. ⚠️ El gateway no tiene dominio público: MCP y webhook de GitHub entran por un route handler de paso en `web` (D13). Contiene el contexto que une a PLAN-MCP con el catálogo de planes |
| [docs/PLAN-MOVIL.md](docs/PLAN-MOVIL.md) | **Etapa en curso** (2026-10-05, rama local `feature/movil`) — Praxis en móvil como app y no como web encogida: barra inferior, hojas, gestos y PWA con service worker escrito a mano. 🔴 **No se sube a `main` hasta el final**, tras pruebas de usabilidad y la suite e2e entera. El escritorio no puede cambiar ni un píxel (I1, con capturas de referencia). Aparca P3/P4 de PRO-INTEGRACIONES y M7 de MCP. **Léelo antes de tocar nada de móvil** |
| [docs/PLAN-PUSH.md](docs/PLAN-PUSH.md) | **Entregado en rama, sin desplegar** (2026-10-14, `feature/push-notificaciones`) — notificaciones push de mensajes (al instante, solo a quien no tiene la app abierta) y de tareas por vencer (resumen con **cron de Railway a las 00:00 y 12:00 de México**, sin sondeo). Cierra D14 de PLAN-MOVIL. ⚠️ **Toca el backend** por encargo, solo aditivo. Nueve decisiones, siete invariantes. Despliegue en `docs/deploy/PUSH-PRODUCCION.md` |
| [docs/PLAN-CAMPOS-PERSONALIZADOS.md](docs/PLAN-CAMPOS-PERSONALIZADOS.md) | **Etapa entregada** (2026-10-07) — campos personalizados por proyecto (ocho tipos: texto, número, fecha, selección, selección múltiple, persona, casilla y enlace) en el panel, como columna de la tabla y, si se marca, en la tarjeta; y el panel de tarea en filas de propiedades. ⚠️ **Toca el backend** por encargo, solo aditivo. Gestionarlos pide `canEditTask` y no tienen tope por plan. Seis trampas —la peor: **Escape y `stopPropagation()`**, que no frena al `SlideOver` porque React también escucha en `document`— y lo que quedó fuera |
| [docs/PLAN-OAUTH-KYLOO.md](docs/PLAN-OAUTH-KYLOO.md) | **Desplegado** (verificado 2026-11-09: `AUTH_MODE=kyloo` en producción). Se implementó el 2026-10-09 en `../KYLOO-AUTH`; ese servidor es hoy `Kyloo-OAuth`, en AWS desde el 2026-11-08 (mismo emisor `accounts.kyloo.com.mx`) — cierra M7 de PLAN-MCP: ChatGPT y Claude web se conectan al MCP por **OAuth con Kyloo Accounts** (`accounts.kyloo.com.mx`), y «Continuar con Kyloo» entra junto a Google. Siete decisiones (D1–D7), seis invariantes, la **auditoría de KYLOO-AUTH** (🔴 cualquier cuenta creaba clientes OAuth) y **«Antes de producción»**, que es lo que falta. ⚠️ El `id_token` de Accounts **no trae el correo**: se pide por `userinfo` |
| [docs/PLAN-AUTH-KYLOO.md](docs/PLAN-AUTH-KYLOO.md) | **Desplegado** (2026-10-09; producción con `AUTH_MODE=kyloo` verificada el 2026-11-09) — Kyloo Accounts como **único login**: `AUTH_MODE=kyloo` cierra contraseña, registro y Google (403 `AUTH_DELEGATED`) y las pantallas llevan a Kyloo; Praxis conserva al usuario completo por `kylooSub`. Migración **perezosa** de contraseñas (Kyloo pregunta a Praxis, sin exportar hashes) y revocación de sesiones al cambiar la contraseña. Nueve decisiones, seis invariantes, vuelta atrás = quitar la variable. Despliegue en `docs/deploy/AUTH-KYLOO-PRODUCCION.md` |
| [docs/PRAX-MCP-SEGUNDA-ITERACION.md](docs/PRAX-MCP-SEGUNDA-ITERACION.md) | Nota interna. La dirección A (Praxis servidor) ya tiene plan en `PLAN-MCP.md`; aquí queda la **B** (PRAX como cliente MCP), sin decidir |
| [docs/frontend/PLAN-PRAX-AGENTICO.md](docs/frontend/PLAN-PRAX-AGENTICO.md) | 🚫 **Sustituido** por el de arriba. Se conserva por el diagnóstico en frío y la ficha de Jev. Era: **etapa por empezar** (2026-09-25). Dos cosas sin tocar todavía: por qué PRAX no responde desde la migración a organizaciones (diagnóstico en frío, sin reproducir — tres hipótesis con `file:line`, nada confirmado) y la idea de un modelo barato de decisión («jev», sin verificar qué modelo es) delante del modelo real para recortar contexto. Incluye por qué «volver agéntico» a PRAX no puede chocar con «el asistente propone; nunca ejecuta» sin decidirlo antes |
| [kyloo-design/SKILL.md](kyloo-design/SKILL.md) | **Antes de tocar cualquier pantalla.** Cómo se componen: filas en vez de tarjetas, tipografía como jerarquía, activo por tono. ⚠️ **Su paleta, sus radios y sus fuentes están revertidos** (`3fa9b87`) y no se reaplican sin pedirlo — lee el aviso de su cabecera. §13 es la de dentro de la aplicación |
| [STRUCTURE.md](STRUCTURE.md) | Dónde va cada archivo nuevo |
| [docs/backend/permissions.md](docs/backend/permissions.md) | Modelo de permisos de dos capas |

## Reglas del frontend

**El código en inglés, los comentarios en español.** No es un punto medio ni una
migración a medias: es la convención.

| Qué | Idioma |
|---|---|
| Identificadores: variables, funciones, tipos, props, constantes, nombres de fichero | **Inglés** |
| Comentarios, JSDoc, documentos y mensajes de commit | **Español** |
| Textos que ve el usuario y descripciones de Swagger | **Español** |

Un identificador es una interfaz: lo lee quien llama, muchas veces sin abrir el
cuerpo. Un comentario es una explicación: lo lee quien ya está dentro. Mezclar
idiomas en lo primero obliga a traducir en cada llamada; en lo segundo no estorba.

⚠️ **Los comentarios no se traducen «por coherencia».** La prosa de este
repositorio —el porqué de cada decisión, las trampas que ya mordieron— es la
mitad de su valor, y traducirla sería reescribirla.

⚠️ **Y renombrar con un `sed` global rompe la prosa sin que nada falle.** Ya
pasó: `etiqueta → tag` dejó comentarios como «una tarea, una columna o una tag»
y un mensaje de error que decía **«El servidor no guardó la tag.»**, en 80
ficheros y **compilando**. Una cadena de texto no da error de tipos. Las reglas
que salieron de ahí:

1. Una palabra que existe en español corriente **no se renombra globalmente**: o
   se acota a los ficheros del módulo, o no se toca.
2. Solo son seguros los identificadores **inequívocos** — compuestos y
   `PascalCase` que nadie escribiría en una frase.
3. **Comprobar colisiones antes** con un `grep -w` del nombre nuevo. Ya evitó dos:
   `MessageEvent` (global del DOM) y `PRESENCES` (ya existía en el mismo archivo).
4. **Revisar el diff buscando prosa y literales**, no solo que compile.

**Next.js 16 tiene breaking changes.** Consulta `node_modules/next/dist/docs/` antes de usar una API que no hayas verificado en este repo.

🚫 **Ya no hay microfrontends.** El frontend es **una sola aplicación Next**,
`apps/frontend/web`, sin `basePath`. Fue un Multi-Zones de siete zonas hasta la
etapa de fusión ([PLAN-FUSION-ZONAS](docs/PLAN-FUSION-ZONAS.md)); ninguna URL
cambió al juntarlas.

Cómo está organizada por dentro:

| Ruta | Qué es |
|---|---|
| `src/app/page.tsx` | La landing pública |
| `src/app/auth/*` | Login, registro, verificación, y los diez route handlers de sesión (`/auth/api/*`) |
| `src/app/(privado)/*` | Las cinco secciones privadas —`/main`, `/projects`, `/chat`, `/assistant`, `/admin`— bajo **un solo `layout.tsx`** que monta `AppShell` |
| `src/app/api/gateway/[...path]` | El proxy autenticado, uno para todo |
| `src/app/api/webhooks/stripe` | 🔴 El webhook de Stripe. No se toca |
| `src/proxy.ts` | El guard único: renueva sesión, exige sesión en los prefijos privados y aplica la regla de solo-invitados en `/auth/login` y `/auth/signup` |

⚠️ **Al añadir una sección privada, su prefijo va en `PREFIJOS_PRIVADOS` de
`src/proxy.ts`.** Olvidarlo no falla: la pantalla se sirve sin guard, el gateway
responde 401 y se lee como una avería, no como una sesión que falta.
`e2e/tests/ui/02-guards.spec.ts` lo cubre para las cinco.

**Atomic Design:**
- Átomos y moléculas compartidos → `apps/frontend/commons/{atoms,molecules}/`
- Organismos y templates de dominio → `<zona>/src/components/{organisms,templates}/`
- Un organismo sube a `commons/organisms/` solo cuando lo usan ≥2 zonas
- **La lógica de negocio (fetch, estado, validación) vive solo en las pages.** Moléculas y organismos reciben slots `ReactNode` y props. Patrón de referencia: `commons/molecules/AuthForm` + `auth-front/src/app/login/page.tsx`

**Estilos:** Tailwind v4 con `@theme` en CSS (no hay `tailwind.config`).

🎨 **Hay dos temas, oscuro (el de siempre, por defecto) y claro** (2026-10-12, rama
`feature/closed-column`). La cookie `praxis_theme` guarda `dark`, `light` o `system`
(seguir al sistema); `getTheme()` la lee en el servidor y estampa `data-theme` en el
`<html>`, y con `system` un script de la cabecera lo corrige antes del primer pintado. El
selector son tres iconos (`SelectorDeTema`, en `commons/molecules`) junto a «Cerrar sesión»
en el perfil y en la pantalla «Tú» del móvil, y se aplica al instante. La landing pública
tiene su paleta fija (`.landing`) y **no** cambia con el tema.

Cómo está montado, y lo que hay que respetar al escribir una pantalla:

- **`white` y `black` de Tailwind son la tinta y el papel del tema** (`--color-white: var(--ink)`
  en `theme.css`): `text-white`, `bg-white/5` o `border-white/10` son «el color del texto» y «un
  velo de ese color», y se invierten solos en claro. Si algo tiene que ser blanco **de verdad**
  (texto sobre un botón de color) usa `text-on-color`.
- **Las superficies son tokens**, no hexadecimales: `bg-surface` (lienzo y tarjetas),
  `bg-surface-2` (columna del tablero), `bg-surface-3` (menús y popovers),
  `bg-surface-sunken` (campos y pozos), `bg-surface-elevated`, `bg-background`. Un
  `bg-[#202020]` nuevo se queda oscuro en claro.
- **Un `rgba(255,255,255,…)` o un `#fff` literal en un `style` tampoco se invierte**: usa
  `color-mix(in srgb, var(--color-white) N%, transparent)` o los tokens de `colors.ts`.
- `[data-tone="dark"]` ya no fuerza nada.

Los tokens viven **una sola vez** en `commons/styles/theme.css`. Cada `globals.css` de zona lo importa y solo añade lo suyo: `@source "../**/*.tsx"` y sus `@font-face` (que llevan el basePath).

⚠️ Tailwind solo genera las clases que encuentra escaneando. Los `@source` hacia commons van dentro de `theme.css` y son relativos a ese archivo — si los quitas o el import falla, una utilidad usada solo dentro de un componente compartido se descarta **sin ningún error** y el componente se renderiza sin estilos. Ya nos pasó (`ba94057`).

⚠️ Por el mismo motivo, `@theme` (a secas) solo emite la **variable CSS** de un token si detecta una clase de utilidad literal que la use (`text-info`, `bg-error-muted`…). Un token que solo se consuma vía `colors.info` de `commons/tokens/colors.ts` en un `style={{ background: colors.info }}` —que es justo para lo que existe ese archivo— no genera esa clase, y Tailwind lo recorta del CSS final, también en silencio: la variable no existe y `var(--color-info)` no resuelve a nada. Por eso `theme.css` declara `@theme static`, no `@theme`: fuerza a emitir todas las variables del bloque siempre, las use un `className` o no.

**Auth:** el JWT vive en una cookie httpOnly `praxis_session`, nunca en `localStorage` ni en el JS del cliente. Toda llamada al gateway pasa por el proxy de la zona:

- Server Component → `createServerApiClient()` de `@praxis/commons/auth` (llama al gateway directo; `createApiClient` no sirve en el servidor)
- sesión en el servidor → `getSession()` de `@praxis/commons/auth`
- cliente → `createApiClient({ gatewayPath: '/<zona>/api/gateway' })` de `@praxis/commons/api`
- cada zona monta `src/app/api/gateway/[...path]/route.ts` con `createGatewayProxy()`

`@praxis/commons/auth` es código de servidor: **nunca** lo importes desde el índice raíz ni desde un componente cliente. Detalle en ESTADO-ACTUAL §14.

⚠️ **La cookie `praxis_session` caduca con el JWT (15 min) y el navegador la
borra.** `createGatewayProxy` renueva con el refresh token **aunque falte** —antes
respondía «No hay sesión activa» con la sesión viva— y guarda la cookie nueva
también en los flujos SSE. Lo fija `web/src/lib/proxy-sesion.spec.ts`.

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
14. ⚠️ **Un mensaje de chat viaja en vivo como `chat.mensaje`, no como
    aviso.** Antes se colaba por el canal de avisos con un `type: 'CHAT_MESSAGE'`
    de texto libre; ese sobre ya no existe. Los eventos en vivo llevan `tipo`
    en la raíz, con una unión cerrada en `commons/realtime/tipos.ts`, y un
    mensaje **no deja fila en la bandeja**: cincuenta mensajes serían cincuenta
    avisos por persona. `CHAT_EVENT_TYPE` en `chat.service.ts` es un resto
    muerto.

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
17. 🔴 **Un proyecto pertenece a una organización, y quien entra en él necesita
    asiento.** `Project.organizationId` es `NOT NULL` desde la etapa de
    organizaciones. Tres cosas que muerden:
    - **El tope de proyectos se cuenta por organización**, no por persona. El
      402 dice «esta organización ya tiene N», y quien lo ve **puede no ser quien
      puede pagarlo**: `error.details.puedeAmpliar` lo distingue.
    - **Meter a alguien sin asiento da 403 `NOT_IN_ORG`**, no un 402. No se ha
      agotado nada: esa persona no está dentro, y la salida es un asiento.
    - `POST /projects` acepta `organizationId` opcional —sin él, tu organización
      personal— y el gateway comprueba pertenencia y `canCreateProject` **antes**
      de contar. Primero dónde va, después si cabe.
18. ⚠️ **Los papeles de organización son un diccionario de booleanos, y no se
    puede conceder lo que no se tiene.** `cabenEn` lo comprueba en los cuatro
    sitios donde se reparte —crear papel, editar, asignar e **invitar**, que es
    la puerta trasera que se olvida—. Ser dueño no es un papel: se resuelve
    contra `ownerUserId` antes de mirar ninguno.
19. ⚠️ **Una constante `process.env.X` en el cuerpo de un módulo NO ve el
    `.env`.** `ConfigModule.forRoot()` lo carga al **inicializar** el módulo, y
    los `import` se evalúan antes. Lo que se lea arriba del archivo solo ve las
    variables del proceso. Si hace falta configurar algo que se usa en un
    decorador —`@Throttle`, por ejemplo—, no vale leerlo así: parece que
    funciona y silenciosamente coge el valor por defecto.

20. 🔴 **El plan vale SOLO dentro de la organización que lo paga, y siempre hay
    una activa.** Desde 2026-08-28 (`docs/PLAN-ORGANIZACION-ACTIVA.md`).
    `planEfectivoDe(userId, organizationId)` mira **esa** organización y ninguna
    más — antes recorría todas y aplicaba la mejor. Cuatro cosas que muerden:
    - **`planDe` sin organización devuelve FREE**, no «el mejor que tengas». Si
      una ruta nueva no sabe qué organización pasar, hay que averiguarlo, no
      omitirlo: omitirlo da el peldaño más bajo en silencio.
    - 🔴 **De dónde sale ese identificador importa más que el identificador.**
      Nunca de la cookie `praxis_org`, que la escribe el navegador. O se deriva
      del recurso (`QuotaService.organizacionDelProyecto`) o llega en el cuerpo y
      se valida la pertenencia antes de usarlo
      (`QuotaService.organizacionElegida`, que da 403 `NOT_IN_ORG`).
    - **La cuota de IA se cuenta por `(persona, organización, mes)`**, no por
      persona. Es decir: **cada miembro tiene su cuota entera** dentro de la
      organización, y gastar la tuya no le quita ninguna a nadie. El techo del
      equipo es ese número por los asientos. `AssistantUsage` lleva `organizationId` —cadena vacía, nunca
      `NULL`, porque dos `NULL` no chocan en un índice único—. Contar en un cubo
      y negar contra el tope de otro deja a alguien bloqueado nada más entrar en
      su espacio personal.
    - **`organizacionesPropias` ya no existe como cuota de plan.** Es
      `MAX_ORGANIZACIONES_PROPIAS = 3`, plano, la personal incluida: si el plan
      vive dentro de su organización, uno que además dejara crear más se estaría
      escapando de ella. Lo aplica `exigirOrganizacion` en `POST
      /me/organizations`; **antes estaba escrito y no lo comprobaba nadie.**

21. ⚠️ **No hay «Todas las organizaciones», y `getOrganizacionActiva()` es la
    cookie en crudo.** Lo que quiere una pantalla es `organizacionActivaId` de
    `loadPrivateChrome()`, que aplica `resolverOrganizacionActiva` — repliega a la
    personal si la cookie apunta a una de la que ya te fueron. Sin ese repliegue
    la pantalla sale vacía en todas partes y las rutas de organización dan 403,
    sin que nada diga por qué. El `OrgSwitcher` además **reescribe la cookie** al
    montar: un Server Component no puede, y sin eso una cookie caduca no se
    arregla nunca.

22. ⚠️ **Al chat privado se entra por la organización, no por el proyecto.** Lo
    decide el **gateway** (`DirectChatController.puedeHablarCon` →
    `QuotaService.compartenOrganizacion`), porque projects-service no sabe de
    asientos y los dos servicios no se hablan a propósito. La comprobación de
    proyecto en común sigue en `ChannelsService.directo` como **suelo** —es un
    subconjunto— y protege la ruta TCP directa. La presencia usa la misma lista:
    si divergen, se anuncia el estado a gente a la que no puedes escribir.
    ⚠️ Y **`/me/chats/:peerId/mentionables` devuelve `refs: []` siempre**: no se
    referencian tareas ni tableros en privado.

23. 🔴 **Las seis cuotas del plan las comprueba el gateway, y las tres últimas
    llegaron tarde.** `proyectos`, `asientos` e `iaMensualPorPersona` se aplicaban
    desde la etapa Enterprise; `automatizacionesPorProyecto`, `almacenamientoOrgMb`
    e `historialAnalisisDias` estaban **escritas en `plans.ts` y no las invocaba
    nadie** hasta 2026-08-28 (`docs/PLAN-CUOTAS.md`). Cuatro cosas que muerden:
    - **Una cuota que no se comprueba no da ningún error.** La tabla de precios
      promete un tope que el servidor no aplica, el plan de pago vale menos de lo
      que dice y el gratuito da más — y nadie se queja hasta el día que se
      aplica. Si añades un número a `PlanQuotas`, **el commit que lo añade es el
      que tiene que invocarlo**. Ya pasó **tres** veces: con
      `organizacionesPropias`, con estas tres, y con **`asientos`** —que solo
      salía en el informe de `GET /me/billing/resumen`, describiendo el exceso
      sin impedirlo, mientras la única puerta miraba `Subscription.seats`—. La
      tercera la tapó A1 de `docs/PLAN-ASIENTOS-CONGELADOS.md` el 2026-09-09: el
      tope de asientos es **`min(Subscription.seats, quotas.asientos)`**, en
      `services/billing/src/organizations/asientos.ts`, y sin suscripción vigente
      es el del plan gratuito — el `seats` de una cancelada es el recuerdo de lo
      que se pagaba, no lo que se contrata.
    - **Las automatizaciones se cuentan al ACTIVAR, no al crear**, porque la
      cuota es de reglas en marcha. Son **dos puertas** —crear con `ENABLED` y
      reactivar una pausada— y la segunda es la que se olvida.
    - **El almacén es de la organización y lo compone el gateway.**
      tasks-service guarda los adjuntos y no sabe de organizaciones;
      billing-service sabe de organizaciones y no ha visto un adjunto. No se abre
      una dependencia entre los dos: se pide por separado y se suma aquí.
    - 🔴 **`historialAnalisisDias` RECORTA, no rechaza.** Es la única que acota
      una **lectura**, y un 402 al abrir un informe sería un muro de pago a media
      consulta sin nada que la persona pueda hacer. Se recorta `days`, `weeks` y
      el `from` en las once rutas —**menos el `days` de `blocked`, que ahí
      significa «lleva N días sin moverse» y no historial**— y el paquete
      devuelve `ventana` para que la pantalla lo diga. Un recorte mudo es peor
      que no recortar.

24. ⚠️ **Bajar de plan por debajo de lo que ya hay no borra nada, y hay que
    decirlo.** `GET /me/billing/resumen` trae `excedidas[]`. Lo que ya existe se
    abre, se edita y se borra; lo único que no se puede es añadir uno más. Se
    llega ahí **sin haber hecho nada** —baja el techo, no sube el número— así que
    sin la tarjeta que lo explica se lee como una avería. Y estar **justo** en el
    tope no es excederlo: 25 de 25 está lleno, no rebasado.

25. 🔴 **Un DTO de `@Body()` o `@Query()` importado con `type` rompe la
    validación entera de esa ruta.** Con `import { type XDto }` el decorador
    no tiene clase en runtime: el parámetro queda tipado como `Function` y el
    `ValidationPipe` (`forbidNonWhitelisted`) responde 400 «property … should
    not exist» a **cualquier** campo. Pasó en cuatro rutas de Análisis
    (`a384438`) y no se notó porque las demás usaban una subclase. Es la trampa
    3 con otra cara: los DTO de controlador se importan como **valor**, siempre.
26. ⚠️ **`tasks:board:<id>` se cachea con sufijos** (`:col:`, `:sprint:`,
    `:backlog`) y se invalida con `redis.delByPrefix`, no con `del`. Un filtro
    nuevo en `findAllTasks` va en la clave **y** queda cubierto por el prefijo;
    un `del` exacto dejaría las variantes filtradas sirviendo datos viejos.
    🔴 **La página y el tope también van en la clave** (`:p1:l50`). No iban
    (`5d0f273b`): la primera petición fijaba la respuesta de todas durante el
    minuto de caché, así que la página 2 devolvía la 1 y descartar un sprint
    —que pide 10 000— podía dejar tareas atadas a un sprint borrado.

**Los siete agregados de Análisis aceptan filtros, y tienen tres trampas.**
`from`/`to`, `boardId`, `assigneeId`, `labelId` y `priority`, en las ocho rutas —
las siete sueltas y el paquete—. Antes de tocarlos, ESTADO-ACTUAL §44:

1. 🔴 **Los filtros van en la clave de Redis; el `from` derivado de `days`, no.**
   Lo primero, o quien filtra deja su gráfico bajo la clave de quien no filtra —un
   minuto de gráfico plausible y equivocado, sin un error—. Lo segundo, o la
   clave cambia cada milisegundo y ningún informe vuelve a acertar en caché.
2. ⚠️ **`from`/`to` acota una columna distinta en cada informe** —`createdAt` en
   los que miden estado, `completedAt` en los tiempos, `occurredAt` en el flujo, y
   en la serie semanal **es el eje**—. Los cuatro salen plausibles con el criterio
   equivocado.
3. ⚠️ **Un tramo de más de 365 días se rechaza con 400**, al revés que `days`, que
   sí se recorta en silencio. Misma regla que el inventario del asistente.

**Para enlazar a un proyecto usa el helper, nunca la plantilla a mano.**
`projectHref` (y `reportHref` mientras existió Análisis), en
`commons/api/routes.ts`. El slug va en la URL y el UUID en la API, los dos son
`string`, y equivocarse **no da error de compilación**: sale como una URL fea,
un 403 o un desplegable vacío. Ya se coló en cinco sitios.

🚫 **`projectPath()` ya no existe** (F6). Devolvía la ruta *sin* `/projects`
porque Next se lo anteponía dentro de la zona; fusionado, su valor llevaba a la
raíz de la aplicación —la landing— y tampoco daba error: es una cadena válida y
una URL que responde 200.

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

🔴 **Un `<form action={…}>` se resetea solo en React 19, y no avisa.**
`startHostTransition` llama a `requestFormReset` **antes** de ejecutar la acción,
así que al terminar el envío cada campo vuelve a su `defaultValue` /
`defaultChecked`. En un formulario de alta es justo lo que quieres —la caja se
vacía sola—; en uno de **edición con campos no controlados** significa que la
pantalla vuelve a los valores que tenía la copia de los datos que hay en
memoria, que no siempre es la recién guardada.

Costó un fallo feo: el panel de una tarea guardaba a su encargado, se reseteaba
a una copia vieja que no lo tenía, y al abrir otra tarea el autoguardado del
desmontaje mandaba esa lista vacía — al encargado le llegaba un aviso de que lo
habían quitado (`734855a`, con e2e en `08-panel-de-tarea`).

Si el formulario **edita** algo, se envía con `onSubmit` + `preventDefault()` y
el `FormData` a mano; `useAccion` acepta un `FormData` construido así justo para
esto. `action={…}` se reserva para lo que quiera vaciarse al enviar.

**El asistente propone; nunca ejecuta.** Vale para todo lo que se le añada,
incluida la plantilla de arranque de un proyecto: devuelve parámetros para
funciones que ya existen, y quien las llama es el frontend, una a una, con la
sesión de quien acepta y por los endpoints de siempre. Si una capacidad nueva
necesita una ruta de escritura nueva, está mal planteada. Detalle en
ESTADO-ACTUAL §26.1, §30.3, §36.2 y §42.6.

⚠️ **Se puede hablar con PRAX sin proyecto, y es otro modo, no un caso
degradado.** `POST /me/assistant/chat` (solo `JwtGuard`) frente a `POST
/projects/:id/assistant/chat` (`canViewReports`). Sin foco no hay briefing, ni
miembros, ni chat de equipo, y las herramientas son **tres** en vez de doce.
Tres cosas que muerden si se olvidan:

- Las reglas del prompt llevan `ambito` y se filtran por modo. **No hay dos
  listas**: la mitad valen en los dos, y duplicarlas es garantizar que PRAX hable
  distinto según hayas elegido proyecto.
- **Resolver una propuesta también tiene dos rutas.** La de proyecto responde
  404 a una tarjeta de conversación sin foco.
- Una conversación **adopta** un proyecto (una vez) pero no lo cambia ni vuelve
  a quedarse sin él: lo segundo responde 409.

⚠️ **Un adjunto sobrevive a su turno, pero solo su texto.** `Attachment.extract`
se calcula al subir —`.md`/`.txt` decodificando, PDF por su capa de texto— y
`historial()` lo reinyecta con presupuesto (`ASSISTANT_EXTRACT_BUDGET_CHARS`). De
una **imagen no se guarda nada**: lo que queda de ella es lo que PRAX contó en su
respuesta, y por eso el prompt se lo exige (regla 17). §42.

**PRAX consulta, propone y responde en el chat; y nada de eso escribe.**
Desde la etapa semiagéntica ([PLAN-PRAX-SEMIAGENTICO](docs/PLAN-PRAX-SEMIAGENTICO.md)):

- **Las consultas `consultar_*` se ejecutan de verdad**, en el servidor, y son de
  solo lectura sobre el foco o los proyectos de «Recursos». Lo que enseñan del
  foco se anota en el ámbito del turno, y las propuestas se validan contra el
  briefing **más eso**: los ids de sprints, documentos y reglas solo valen si se
  consultaron en el mismo turno.
- **`capabilities.ts` es la única lista** de qué herramienta pide qué permiso.
  De ahí salen las declaraciones y el catálogo del prompt. Una capacidad nueva va
  ahí, no en `tools.ts` ni en el prompt a mano.
- 🔴 **Gemini rechaza la petición entera** si una declaración trae un `OBJECT`
  sin `properties` o con ellas vacías: el turno de todo el que tenga esa
  herramienta da 400. Lo vigila `capabilities.spec.ts`; un objeto de claves
  variables viaja como JSON en un `STRING`.
- **`ChatMessage.origin`** (`USER`, `AUTOMATION`, `ASSISTANT`) **solo se fija
  por TCP**: por HTTP, `origin` da 400. Para firmar «con PRAX» el cliente manda
  `praxConversationId` y el gateway comprueba que la conversación es suya
  (`OrigenDeMensajeService`); ajena, 403.
- **`@[PRAX](assistant:prax)` en el chat de un proyecto** lanza un turno detrás
  del envío, con la sesión de quien lo menciona (`PraxEnElChatService`). La
  respuesta la firma esa persona con `originMeta.respuesta` y se pinta como
  PRAX; las propuestas se quedan en su conversación privada. El patrón de
  referencias acepta `prax` **solo** con `assistant`: con `|prax` a secas, `(user:prax)`
  pasaba por mención.
- **El contenido de un documento lo aplica el editor**, no una propuesta por
  REST (E4 de PLAN-DOCUMENTOS): la revisión se deja en `sessionStorage` y la
  aplica `RevisionDePrax` como una versión restaurada.
- **Hay dos modelos y se eligen en el compositor**: Gemini (por defecto) y
  gpt-oss-120b por OpenRouter (`openrouter.client.ts`, `PRAX_OPENROUTER_API_KEY`).
  El adaptador traduce al formato de Gemini, así que el bucle no sabe con cuál
  habla. ⚠️ **gpt-oss escribe las llamadas como texto** (JSON, `<proponer_x{…}>`):
  el adaptador las retiene y las convierte. Una forma nueva de fuga se tapa ahí,
  con su test, no solo en el prompt. Con imagen o PDF responde Gemini.
- **Varias tareas son UNA propuesta**: `proponer_tareas` y `proponer_borrados`.
  `fundirLotes` junta las sueltas en el lote de su columna, y un turno con una
  pregunta se queda solo con esa pregunta. Registro y trampas, al final de
  PLAN-PRAX-SEMIAGENTICO.
- **En local, sin clave de Gemini válida, se usa el falso**
  (`e2e/fixtures/gemini-falso.mjs`, `GEMINI_BASE_URL=http://127.0.0.1:3999`).
  Sus respuestas son un guion fijo —«Déjame mirar las tareas…»—, así que una
  conversación que siempre dice eso **no es PRAX fallando**. Acepta directivas
  `#consulta` / `#propon` para probar propuestas: e2e `23-prax-capacidades`,
  con `E2E_GEMINI_FALSO=1`.

**Lo que se le manda al modelo viaja en CADA turno, y se mide.**
`pnpm --filter @praxis/assistant-service medir-prompt <projectId>` desglosa el
prompt real contra un proyecto de verdad. Úsalo **antes y después** de tocar el
briefing, las herramientas o las reglas: un campo de más no cuesta una vez,
cuesta en cada mensaje de cada conversación, y no da ningún error — solo una
factura y un modelo con las reglas más lejos de la atención.

Hay tres topes, y ninguno es decorativo (ESTADO-ACTUAL §43):

| Tope | Qué acota | Dónde |
|---|---|---|
| `INVENTARIO_MAX_CHARS` | Las tareas del briefing | `tasks/stats.service.ts` |
| `ASSISTANT_EXTRACT_BUDGET_CHARS` | El texto de los adjuntos reinyectado | `contracts` |
| `ASSISTANT_PDF_MAX_INLINE_PAGES` | Cuándo un PDF deja de ir nativo | `contracts` |

⚠️ **Un recorte mudo es peor que no recortar.** Si añades uno, el prompt tiene
que decirlo: `tareasOmitidas` existe para que PRAX no responda «esas son todas»
sobre una lista que alguien le cortó por detrás.

## Estado

Los bloqueantes iniciales están resueltos: workspace, puertos, login y proxy autenticado. Lo que falta y por qué, en ESTADO-ACTUAL §9 (tabla de deuda) y §15 (pendientes del equipo de backend).

**Puertos:** gateway 3000 · microservicios TCP (solo en desarrollo, ver abajo): credentials 3001, **permissions 3002, projects 3003**, tasks 3004, reports 3005, assistant 3006, **automation 3008**, **billing 3009** · **collab 3010 (WebSocket)** · **el frontend, 4100, en un solo proceso**. El 3007 quedó libre: Alexa se retiró (2026-09-29) y no vuelve.

🔴 **En producción el backend es UN proceso, no diez** ([PLAN-MONOLITO](docs/PLAN-MONOLITO.md)). `apps/backend/monolith` arranca el gateway, los ocho servicios y collab juntos, y se hablan en memoria por `@praxis/local-transport` (`PRAXIS_TRANSPORT=local`). En desarrollo, `dev:backend` sigue levantándolos por separado y por TCP. Lo que muerde:

- **Todo lo que cruza entre servicios pasa por JSON, en los dos transportes.** Un `Date` llega como cadena, igual que por el socket. El transporte en proceso lo copia a propósito, y sus pruebas lo comparan contra TCP de verdad. No lo «optimices».
- **Cada servicio lee `<SERVICIO>_DATABASE_URL`** y solo cae a `DATABASE_URL` en desarrollo. En el monolito, el `DATABASE_URL` genérico apunta a un sitio que no conecta: un servicio sin su URL propia falla al arrancar en vez de escribir en el schema de otro.
- **Un servicio nuevo se añade en tres sitios**, y olvidar cualquiera no da error hasta producción: `SERVICIOS` en `monolith/src/main.ts`, `SCHEMAS` en `monolith/src/entorno.ts` si tiene Prisma, y `migrar.sh`.
- **El `ValidationPipe` de los servicios no valida los mensajes entre servicios**, ni antes ni ahora. Activarlo es una auditoría aparte, no un cambio de una línea.
- **En reposo, los sondeos se paran.** Tras 5 minutos sin mensajes entre servicios (`PRAXIS_REPOSO_MS`), el buzón de salida y el consumidor de automatizaciones dejan de consultar Redis y Postgres, y Railway puede dormir el contenedor. Una tarea de fondo nueva tiene que respetar `enReposo()` y `alReanudar()`, o el backend no vuelve a dormirse nunca.
- 🍎 **Formatear con Biome antes de compilar, no después.** Biome partió un `typeof import('…')` en varias líneas con una coma final, y TypeScript lo leyó como atributos de importación: la imagen de Docker no compilaba y en local sí, porque el `dist/` era de antes de formatear.

⚠️ **`collab-service` es el único servicio al que conecta el navegador sin
pasar por el gateway** (`docs/PLAN-DOCUMENTOS.md`, E3). Solo acepta billetes de
un minuto que firma el gateway con el mismo `JWT_SECRET`; en producción hay que
exponerlo por `wss://` y poner esa URL en `COLLAB_PUBLIC_URL` del gateway. Y
**el contenido de un documento ya no se escribe por REST** (E4): un `PATCH` con
`content` da 400 — se escribe en vivo y el servidor regenera el Markdown.

🚫 **Multi-Zones ya no existe.** Los puertos 4101 a 4107 quedaron libres: las
siete zonas se fusionaron en `apps/frontend/web` entre F2 y F7
([PLAN-FUSION-ZONAS](docs/PLAN-FUSION-ZONAS.md)) y **ninguna URL cambió**.
Un `proxy.ts`, un `api/gateway`, un `globals.css` y un proceso de Node. El rol
global de `/admin` se sigue comprobando en su `layout.tsx`, no en el guard.

🔴 **En la app fusionada, una redirección sin pantalla va en el guard, no en un
`page.tsx`.** Un `redirect()` de servidor dentro de una sección privada se
ejecuta *después* de que su `layout.tsx` haya empezado a hacer streaming —montar
el armazón pide el perfil y la navegación al gateway—, así que la cabecera ya
salió como 200 y Next lo degrada a una redirección de cliente: **44 KB de HTML y
dos llamadas al gateway para una pantalla que nadie ve**. Desde
`REDIRECCIONES_EXACTAS` en `web/src/proxy.ts` son 9 bytes y un 307.

🚫 **El 4104 quedó libre: `reports-front` se archivó** (F1 de [PLAN-FUSION-ZONAS](docs/PLAN-FUSION-ZONAS.md)). `/reports` responde 404. Lo que sigue vivo es `reports-service` en el 3005, que PRAX consulta por TCP para contestar. ⚠️ **Las once rutas de análisis del gateway ya no existen**: las borró M10 de [PLAN-MONOLITO](docs/PLAN-MONOLITO.md) (`66cce9f9`, 2026-09-29), así que lo que más abajo habla de «las once rutas» o «las ocho rutas» describe el servicio, no una entrada HTTP — y `QuotaService.ventanaDeAnalisis` se quedó sin llamadores. No se reutiliza el 4104 para una zona nueva mientras dure la fusión: la etapa va a dejar **una sola** aplicación de frontend.

⚠️ **`permissions` es 3002 y `projects` es 3003**, no al revés. Este documento los tuvo invertidos, y equivocarse no da un error claro: el servicio arranca, el gateway le habla al otro y las respuestas salen vacías o con `BAD_GATEWAY`. La lista de verdad está en `scripts/dev-cli/config/services.mjs`, que además la valida contra los `package.json` reales.

⚠️ El cliente de Prisma se genera dentro de `src/generated/` de cada servicio y **no está versionado**: en un árbol recién clonado o limpiado, el servicio arranca y muere con `Cannot find module '../generated/prisma-client'`. Se arregla con `pnpm prisma:generate`.

⚠️ **El orden de las semillas no es alfabético y ahora son cinco**: permissions →
credentials → **billing** → projects → tasks. Sin la de billing, la de projects no
tiene organización a la que apuntar y falla con una restricción de columna en
medio de un `create`, no con un mensaje claro.

⚠️ **Compilar un servicio con `dev:backend` corriendo deja `dist/` a medias.** Es
la misma trampa que `prisma:generate`, y vale igual para un `pnpm --filter …
build`: sale un `MODULE_NOT_FOUND` que **no se arregla volviendo a compilar**.
Hay que parar, borrar `dist/` del servicio, reconstruir y arrancar en frío.

🍎 ⚠️ **Y lo mismo le pasa a `.next/` de una zona del frontend.** Es la misma
trampa un piso más arriba, y no estaba escrita. Un `next build` con la zona
levantada —o **renombrar y borrar archivos de `commons/` con las ocho zonas
corriendo**— puede dejar al servidor de desarrollo vivo y **sin su directorio de
compilación**. El síntoma es engañoso: los estáticos siguen sirviéndose (200 en
`/assistant/icon.png`) y **todo lo demás da 404**, incluido `/api/gateway/*`, que
ni pasa por el guard. Las demás zonas responden 307 con la misma petición, así
que parece un fallo de esa zona en concreto.

Comprobación en un segundo: `ls apps/frontend/<zona>/.next`. Si no existe, es
esto. Se arregla **parando la zona, borrando `.next` y arrancando en frío** —
volver a compilar no basta, igual que con `dist/`.

⚠️ **Levantar los 9 servicios y las 8 zonas a la vez agota los descriptores de
archivo** (`ENFILE` en el vigilante de chokidar) y el último en arrancar muere.
Para verificar contra la API, levanta solo el backend.

🍎 ⚠️ **El `sed` de macOS no entiende `\b`.** Un `sed -i '' 's/\bX\b/Y/g'` se
ejecuta, sale con código 0 y **no cambia nada**. Para renombrar en este
repositorio, Python.

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
pnpm prisma:generate      # los 7 servicios con Prisma
pnpm prisma:deploy        # aplica migraciones sin tocar los datos
pnpm prisma:seed          # 5 seeds, en su orden de dependencia
pnpm dev:backend          # gateway + los 8 servicios, cada uno en su proceso (TCP)
pnpm dev:frontend         # las 6 zonas
```

🍎 🔴 **En una máquina de 8 GB, el modo desarrollo no cabe con las pruebas de
punta a punta.** Diez servicios en `nest start --watch` y seis `next dev`
mantienen cada uno un compilador y un vigilante en memoria; con Chromium encima,
el sistema **mata los procesos a mitad de la corrida** y no queda ni un error en
la suite: desaparecen y ya. Para verificar, se corre el stack **construido**:

```bash
pnpm build:frontend       # las zonas, --concurrency=1: importa el pico
pnpm build:backend        # el monolito y todo lo que importa
pnpm start:backend        # el monolito, un proceso → ~190 MB (1.335 MB eran los once separados)
pnpm start:frontend       # las zonas, desde .next/ → ~580 MB en total
```

⚠️ Se pierde la recarga en caliente: un cambio no se ve hasta reconstruir esa
zona. Para **escribir** código, `dev:cli` con lo mínimo levantado; el stack
construido es para **verificar**.

⚠️ **`prisma:reset` borra las tablas.** Es `migrate reset --force`: recrea el
esquema de los 7 servicios con Prisma y siembra encima. Para aplicar una migración
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
pnpm test                 # unitarias. En seco: no necesitan nada levantado
pnpm test:int             # las de integración. Exigen Postgres y Redis vivos
pnpm e2e:regresion        # antes y después de tocar código. Verde siempre.
pnpm e2e:seguridad        # el marcador del endurecimiento
```

⚠️ **`pnpm test` no incluye las de integración, y es a propósito.** Los ficheros
`*.integration.spec.ts` de `tasks` y `automation` hablan con Postgres y con
Redis de verdad. Estaban en la misma tanda que las unitarias, así que `pnpm
test` dejó de poder correrse sin el stack levantado —y en `main` no había
ninguna, así que el cambio pasó desapercibido—. Ahora `test` las ignora por
`testPathIgnorePatterns` y `test:int` corre solo esas.

Con el stack levantado y los seeds puestos. Playwright, en `e2e/`. Las
etiquetadas `@security` describen lo que queremos, no lo que hay: viven aparte
para que un rojo esperado no tape uno nuevo. Detalle en el README.

## Convenciones de repo

- Commits: Conventional Commits en español (`feat:`, `fix:`). `commitlint.config.cjs` fija
  los tipos permitidos, pero **no hay husky instalado**: hoy no se valida en el commit,
  se respeta a mano.
- Rama por feature (`feature/<nombre>`) → PR a `main`.
- Formato: Biome en la raíz (2 espacios, ancho 100), ESLint solo en `web`. `pnpm format` ya no reescribe el repo: config y código coinciden.
