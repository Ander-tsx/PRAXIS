# Plan de Organizaciones — el equipo pasa a ser la unidad, y el asiento el producto

> Etapa abierta el 2026-08-26, en la rama `feature/organizaciones`, que sale de
> `feature/enterprise`. Se lee al retomar y se marca al terminar cada tarea.
>
> 🚫 **PLAN-ENTERPRISE.md está deprecado y no es una fuente de verdad.** No se
> consulta para decidir nada: este documento lo reemplaza. Lo que sí sigue
> valiendo de aquella etapa es **el código**, que es de donde partimos —
> `billing-service` en el 3009, Stripe entero con su webhook firmado e
> idempotente, organizaciones con miembros e invitaciones, y las primeras
> pantallas. Sus apuntes explican por qué está hecho como está, y eso no caduca.
>
> ✅ **La base de datos se puede reiniciar.** Lo desplegado son cuentas de
> prueba (decisión del dueño del producto, 2026-08-26). Es lo que convierte O3
> —que era el stack peligroso— en el más barato de la etapa.
>
> Propuesta visual, con los diagramas:
> <https://claude.ai/code/artifact/2cb6571a-d2b8-455e-8beb-bf7d7ffd9ae3>

---

## El encargo, en una línea

Que PRAXIS deje de ser un producto de personas con una bolsa de topes encima y
pase a ser un producto de **equipos**: la organización contiene los proyectos, se
paga por asiento, y quien administra el equipo tiene con qué administrarlo — sin
que quien lo usa solo con dos amigos pierda nada.

---

## Dónde estamos

> **Cierre de la etapa, 2026-08-27.** 60 de 73 casillas. Lo que falta está en los
> apuntes de O7 y O8 con su motivo, y en O9 —que nunca fue de esta etapa—.
>
> ✅ **La regresión entera ya está corrida y verde**: 179 pruebas de API, 63 de
> interfaz y 14 de seguridad. No lo estuvo a la primera — 12 fallaron, y once de
> ellas apuntaban al mismo fallo de producto, el del asiento que se explica en los
> apuntes de O8. Es lo que este paso existía para encontrar.
>
> ✅ **Y el repaso visual está hecho**, que era lo único que no comprueba ninguna
> suite. Las pantallas de esta etapa —el portal, los papeles, las plantillas y la
> tabla de precios— están en Kyloo y se leen bien en claro y en oscuro. Encontró
> dos fallos que ninguna prueba veía, los dos de los que no dan error:
>
> 1. 🔴 **Un 403 con motivo se leía como «no tienes permiso».** Los `describe()`
>    de las zonas colapsaban los tres 403 del producto en una frase de permisos,
>    y con eso tiraban el texto que explicaba la salida. Se veía entero al
>    intentar meter a alguien en un equipo lleno: quien lo recibe es el **dueño**,
>    con todos los permisos, y la pantalla le decía que no los tiene.
> 2. **La barra lateral avisaba por una clave que faltaba**, en las ocho zonas y
>    en cada carga. El aviso señalaba a `NavList`, donde no estaba el fallo.
>
> Lo que **no** se ha tocado, y se anota por si alguien lo lee como un olvido: la
> rejilla de `/projects` sigue siendo de tarjetas, no de filas. Es de antes de
> esta etapa y cambiarla es una decisión de diseño, no un arreglo.
>
> **Añadido esa misma noche (`190c85d`): la capa visual de Kyloo.** Estaba sin
> commitear en el árbol —28 ficheros— y llevaba dentro un fallo que no da error:
> `theme.css` pasó a nombrar tres fuentes nuevas en `--font-display`,
> `--font-serif`, `--font-sans` y `--font-mono`, y ese archivo lo comparten las
> ocho zonas, pero solo dashboard-front las cargaba. Está arreglado por los dos
> lados —las fuentes en las ocho zonas, y fallback dentro del `var()`—, y las
> ocho compilan. **Lo que no se ha hecho es mirarlo con los ojos**: los colores y
> los radios cambiaron enteros y eso solo se juzga viéndolo.

| Stack | Qué es | Estado |
|---|---|---|
| O1 | Contratos: cuatro planes, papeles y códigos de error | ✅ **hecho** (2026-08-26) |
| O2 | `billing-service`: papeles, plantillas y traspaso | ✅ **hecho** (2026-08-26) |
| O3 | `Project.organizationId`, y las semillas | 🟡 **casi** — falta O3.5 y probarlo |
| O4 | El gateway: resolver la organización y contar por ella | ✅ **hecho** (2026-08-27) |
| O5 | Frontend: el selector del sidebar y el portal | ✅ **hecho** (2026-08-27) |
| O6 | Frontend: roles, plantillas y el 402 con dos caras | ✅ **hecho** (2026-08-27) |
| O7 | Gobierno del equipo | 🟡 **casi** — falta O7.3, y está bloqueada; ver apuntes |
| O8 | Cierre: e2e, documentación y contrato | ✅ **hecho** (2026-08-27) — la regresión entera, verde |
| O9 | Más adelante — no antes del primer cliente de 50 asientos | ⬜ aparcado |

**Cada stack termina con una prueba manual desde el frontend antes de pasar al
siguiente.** Las de regresión (`pnpm e2e:regresion`) no se ejecutan hasta O8:
tardan demasiado para correrlas entre stacks.

### Registro

| Fecha | Stack | Commit | Qué entró |
|---|---|---|---|
| 2026-08-27 | Repaso visual | `f59aa07`, `a471cb6` | Lo que solo se ve mirando: un 403 con motivo que la pantalla convertía en «no tienes permiso», y el aviso de React de la barra lateral |
| 2026-08-27 | O8.8 | `cdef9f2`, `ec7091f` | La regresión entera, y el fallo que destapó: el asiento se guardaba sin correo y la **segunda persona de cualquier organización no entraba nunca** |
| 2026-08-27 | Kyloo | `190c85d` | La paleta monocroma y los radios en `theme.css`, los 27 componentes con ella, y **las tres fuentes nuevas cargadas en las ocho zonas** — estaban solo en dashboard-front |
| 2026-08-27 | O4.1+O7+O8 | `0bda922` | La caché de billing, la invitación por correo, la documentación al día y diez pruebas de punta a punta |
| 2026-08-27 | O5+O6 | `06d688a` | Las pantallas en Kyloo con el trabajo dentro, el selector del sidebar conectado, y papeles y plantillas |
| 2026-08-26 | O3+O4 | `7d8e970` | El proyecto pertenece a una organización, la quinta semilla, el conteo por organización y la comprobación de asiento |
| 2026-08-26 | O2 | `048fc42` | Los papeles dejan de ser un enum, las plantillas de rol, el traspaso, y la regla que impide escalar privilegios |
| 2026-08-26 | O1 | `122cfeb` | Cuatro planes en una escalera, el vocabulario de papeles de organización, `NOT_IN_ORG`, y el tope de miembros por proyecto retirado con el hueco señalado |

---

## Decisiones cerradas

Se cerraron en conversación el 2026-08-26. No se reabren sin un motivo nuevo.
Las que **revocan** algo del plan viejo lo dicen — importa, porque el código que
heredamos todavía lleva comentarios que explican la decisión contraria.

### D1 — Un proyecto pertenece a una organización

`Project.organizationId`. Es la pieza que sostiene todo lo demás: hasta que
exista, una organización es una suscripción por volumen y la pregunta *«¿qué nos da
estar dentro?»* no tiene respuesta buena.

El plan viejo lo dio por decidido y nunca lo empezó. Aquí se empieza.

⚠️ **No se puede hacer a trozos.** La columna, el contador de cuotas y la
pertenencia son **un solo cambio**. Poner la columna sin mover el contador deja un
plan que promete 25 proyectos por equipo y sigue dando 25 por persona, y nada falla
al compilar.

### D2 — Quien está en un proyecto está en la organización

No hay invitados externos. Añadir a alguien a un proyecto exige que tenga asiento
en la organización dueña de ese proyecto.

**Por qué:** si se pudiera meter gente de fuera, nadie compraría un asiento nunca
—se invitaría a todo el mundo como «externo»— y el modelo de precios sería
decorativo. Los invitados de verdad son una función de pago posterior, cuando
alguien la pida.

🔴 **Consecuencia: el tope `miembrosPorProyecto` se retira del catálogo.** Deja de
hacer falta: el techo ya lo pone el asiento. Es una cifra menos que explicar y una
menos que vigilar.

### D3 — Administración de la organización ve la lista, y entra autoconcediéndose el acceso

Tres partes, y las tres importan:

1. Con `canViewAllProjects`, **se ve la lista** de todos los proyectos de la
   organización —nombre, responsable, miembros, última actividad— y **no se entra**.
2. Con `canManageAllProjects`, se puede **autoconceder acceso** a uno con un botón.
   Ese gesto **queda en el registro de auditoría y le llega aviso al responsable
   del proyecto**.
3. También se puede **reasignar el responsable**, y **suspender o borrar** un
   proyecto de la organización.

⚠️ **Revoca a medias lo que decía el plan viejo** —que el plan no abre ninguna
puerta—. Sigue siendo cierto que *el plan* no la abre —pagar no da permisos—; lo
que abre la puerta es un **papel de la organización**, y solo dejando rastro.

Es lo que hacen Jira y Google Workspace. La alternativa «no cambia nada» deja a la
empresa sin forma de recuperar un proyecto cuando su responsable se va, que es
exactamente por lo que paga; la alternativa «ve y entra en todo, siempre» convierte
a PRAXIS en un sitio donde nadie escribe nada honesto en un comentario.

### D4 — Cuatro planes, y `PLUS` y `PRO` se borran

`FREE` · `TEAM` · `BUSINESS` · `ENTERPRISE`, en una sola escalera. En pantalla:
Gratis · Equipo · Negocio · Empresa.

| Plan | Asientos | Orgs propias | Proyectos/org | IA/persona/mes | Automatizaciones/proyecto | Adjuntos/org | Historial de Análisis |
|---|---|---|---|---|---|---|---|
| Gratis | 3 fijos | 1 | 3 | 13 | 3 | 200 MB | 90 días |
| Equipo | 1–15 | 3 | 25 | 100 | 25 | 10 GB | 12 meses |
| Negocio | 5–100 | sin tope | 150 | 300 | sin tope | 100 GB | sin tope |
| Empresa | sin tope | sin tope | sin tope | 1 000 | sin tope | a medida | sin tope |

⚠️ **Revoca los cinco planes en dos escaleras del plan viejo.** Lo desplegado son
cuentas de prueba, así que `PLUS` y `PRO` **se borran del enum**, no sobreviven como
heredados. Con la organización conteniendo los proyectos, «individual» deja de ser
una categoría: es una organización de un asiento.

⚠️ **`FREE.ia = 13` no se mueve.** Lleva meses en producción y bajarlo sería
recortarle la cuota a gente que ya la tiene, en un commit que habla de otra cosa.

⚠️ **El tope de organizaciones propias cuenta las que posees.** Estar invitado en
las de otros no cuenta y no tiene límite: si no, un colaborador externo en tres
clientes se quedaría sin poder tener la suya.

### D5 — El mes gratis se mueve a Equipo

Era de `PLUS`, que desaparece. Lo aplica Stripe con `trial_period_days` —no un
temporizador nuestro— y `trialEndsAt` viaja a la pantalla desde el día uno.

🔴 **«No me avisaron» es la queja más cara de este terreno**, y con la fecha
guardada en `Subscription` y el instante en `billing_events` se puede demostrar.

### D6 — La organización personal deja de ser invisible

Pasa a ser una organización normal de **un asiento**, con nombre, que se ve en el
selector del sidebar y en la que caben los proyectos de quien está solo.

⚠️ **Revoca la organización personal del plan viejo**, que era `PERSONAL`, sin
nombre, invisible y creada perezosamente. Aquello tenía sentido cuando la organización solo repartía
topes; con los proyectos colgando de ella, una organización que no se ve es un sitio
donde no se puede meter nada.

⚠️ **Y por tanto ya no se crea perezosamente: se crea al registrarse.** Sin fila no
hay dónde poner un proyecto, así que el argumento de «no rellenes una tabla para todo
el mundo antes de que sirva de algo» deja de aplicar: ahora sirve desde el minuto uno.

⚠️ **El índice único parcial sigue haciendo falta.** Una sola organización personal
por cuenta, varias de empresa del mismo dueño sí. El `WHERE kind = 'PERSONAL'` va a
mano en la migración: sin él, dos peticiones simultáneas crean dos y la segunda se
queda con las cuotas.

### D7 — Dos planos de permisos, dos páginas, un puente

Son **dos vocabularios distintos**, no la misma lista a dos escalas:
`canCreateTask` no significa nada en una organización y `canManageBilling` no
significa nada dentro de un tablero. Por eso dos páginas, no una con selector de
proyecto que repita la navegación que ya existe.

**Papeles de la organización** — portal de la organización:

```
canCreateProject       crear proyectos dentro de la organización
canViewAllProjects     ver la lista de todos — no entrar
canManageAllProjects   archivar, suspender y reasignar responsable de cualquiera
canInviteMembers       mandar invitaciones, que ocupan asiento
canManageMembers       cambiar papeles y sacar gente
canManageRoleTemplates editar las plantillas con que nacen los proyectos
canManageBilling       plan, asientos y facturas
canViewAuditLog        el registro de la organización
```

**Roles del proyecto** — dentro de cada proyecto, los que ya existen.

**El puente son las plantillas de rol, y va en una sola dirección.** La
organización define sus plantillas (Dev, QA, Scrum Master…), cada proyecto nuevo
**nace con ellas**, y puede separarse — la pantalla lo dice cuando pasa. Resuelve
el problema más molesto que tiene PRAXIS hoy: cada proyecto inventa sus roles desde
cero, y con quince proyectos eso es el mismo trabajo quince veces hecho distinto.

🔴 **La flecha que no existe es una decisión, no un olvido.** Un papel de la
organización **no da ningún permiso dentro de un proyecto**. Lo único que cruza es
D3, y dejando rastro.

### D8 — Los papeles de organización viven en `billing-service`

Junto a la membresía, que ya está ahí. La invariante de que **`billing-service` no
habla con nadie** sobrevive: sigue contestando en local,
sin llamar a ningún otro servicio.

⚠️ **Diccionario de booleanos, nunca un array, y con el validador desde el primer
día.** En los roles de proyecto se aprendió tarde y todavía hay filas guardadas
como array que se normalizan al leer (trampa 8 de CLAUDE.md). Esa factura no hace
falta pagarla dos veces.

⚠️ **`OrganizationRole` deja de ser un enum de tres valores.** `OWNER` se queda
como caso especial —uno, inmutable, lo puede todo, es quien paga— y por debajo hay
papeles a medida con su diccionario. Es exactamente la forma que ya tienen los
proyectos: dueño con bypass más roles definidos por quien manda.

### D9 — El dueño del proyecto pasa a llamarse **responsable**, y se puede traspasar

**Los poderes no cambian:** ser `ownerId` del proyecto sigue siendo el **único
bypass total** que existe —ni el rol global de plataforma ni ningún rol de proyecto
lo alcanzan—. No hay que construirlo; hay que **conservarlo y dejarlo escrito**,
porque es la clase de invariante que alguien optimiza sin querer.

**La palabra sí cambia**, y a propósito: con la organización conteniendo los
proyectos, esa persona ya no es la *dueña* de nada. Es la responsable. Desactiva
media sorpresa de D3.

**El traspaso, por dos caminos:**

- **Voluntario** — la responsable se lo pasa a otro miembro del proyecto y se queda
  dentro con un rol normal.
- **Forzado** — quien tenga `canManageAllProjects` lo reasigna. Auditado, y con
  aviso a las dos personas.

Dos reglas: el nuevo responsable **tiene que ser ya miembro del proyecto**, y
**nunca puede haber cero**. Lo mismo vale para el traspaso de una organización, que
hoy no existe y hace que una organización muera con su creador.

### D10 — Un cobro fallido no corta el acceso

Se conserva del trabajo anterior, y está bien pensada. `PAST_DUE` avisa y deja trabajar mientras Stripe
reintenta; cuando Stripe se rinde manda `deleted` y ahí sí se cae a `FREE`. Una
tarjeta caducada es lo más común del mundo y quitarle los proyectos a alguien por
eso es la peor forma de enterarse.

### D11 — Bajar de plan congela, nunca borra

Se conserva del trabajo anterior, y se concreta: si al bajar te pasas del tope, los
proyectos sobrantes quedan **en solo lectura** hasta que se elija cuáles conservar.

✅ **Reaprovecha `Project.status = SUSPENDED`**, que ya existe, ya responde 403 con
`PROJECT_SUSPENDED` y ya está entendido por toda la interfaz. No hace falta un
estado nuevo.

⚠️ Lo que **no** vale es que el sistema decida a quién echa. Se dice cuántos hay y
lo arregla quien administra.

---

## Invariantes — lo que este trabajo NO puede romper

1. 🔴 **El plan lo concede el webhook de Stripe, y solo el webhook.** La
   `success_url` la puede escribir cualquiera en la barra de direcciones.
   `?pago=ok` no toca nada: enciende una pantalla que pregunta hasta que el
   servidor confirme.
2. 🔴 **`rawBody: true` está por la firma del webhook.** La firma se calcula sobre
   los bytes exactos: cualquier cosa que reparsee el cuerpo la rompe.
3. 🔴 **El sobre `{success, data, meta}` no puede envolver un flujo SSE.**
4. 🔴 **`billing_events` no es un log, es la prueba.** Su `stripeEventId` único
   **es** la idempotencia: dejar que el índice rechace el duplicado no tiene la
   carrera que sí tiene comprobarlo antes con un `SELECT`.
5. ⚠️ **Los números viven en `PLANS` y en ningún otro sitio.** Ni en la base, ni en
   el frontend, ni en un guard. Escribir el mismo número dos veces es garantizar que
   un día la tabla prometa lo que el guard niega, **sin un error de compilación**.
6. ⚠️ **Nunca un `<` a mano contra un tope.** `actual < null` compara contra cero, o
   sea que el plan sin límite se comporta como el más restrictivo y no da ningún
   error. Para eso están `cabe()` y `quedan()`.
7. ⚠️ **La pantalla apaga botones; el servidor decide.** Misma regla que los
   permisos y por lo mismo: la pantalla es del cliente.
8. ⚠️ **`billing-service` no habla con nadie.** Contesta *qué plan tienes, qué da y
   quién está dentro*. Quien cuenta proyectos y mensajes es el gateway, que ya tiene
   delante los clientes de `projects`, `tasks` y `assistant`. Si aparece un
   `*_SERVICE_HOST` en su `.env`, es que se ha invertido el reparto.
9. ⚠️ **Fallo de billing = FREE, no «pasa».** Un fallo no puede regalar el plan más
   caro. **La excepción está escrita:** si no se puede *contar* (projects caído), sí
   se deja pasar — negar por no haber podido contar es un falso positivo que quien
   lo sufre no puede resolver, y un proyecto de más se borra.
10. ⚠️ **El asistente propone; nunca ejecuta.** Vale también para cualquier
    capacidad nueva de esta etapa.

---

## Reglas de interfaz — se aplican a O5, O6 y O7 enteros

**Antes de tocar una pantalla, lee `kyloo-design/SKILL.md`.** Lo de abajo es el
extracto operativo, no el sustituto.

### Lo que manda dentro de la aplicación

- 🔴 **El tema claro/oscuro se queda.** Estas pantallas van sobre los tokens
  `--color-*` de `commons/styles/theme.css`, **nunca** sobre los `--l-*` fijos de la
  landing. Ya se interpretó una vez «monocromo» como «quita el sistema de tema» y
  costó una vuelta atrás archivo por archivo (§13 del skill).
- **Sin tarjetas.** Filas con una raya fina arriba, etiqueta o número a la
  izquierda, texto al centro. El dispositivo es el mismo de `LandingFeatures` y de
  la Configuración ya rehecha. Si no encaja ninguno de los cuatro dispositivos que
  ya existen, **para y piensa el contenido**, no inventes una tarjeta.
- **Un solo radio: `0.35rem`.** Tenue, casi imperceptible, nunca una píldora.
- **Nada de degradados ni sombras exageradas.** La jerarquía se hace con tono.
- **Activo = tono, no caja.** `bg-primary-muted` + `text-primary`, con el icono
  heredando por `currentColor`.
- **Motion solo si cambia lo que se entiende.** `Reveal` para lo que entra en
  viewport; **mount-based** para cualquier cosa *above the fold* —un `Reveal` que no
  dispara deja el contenido invisible—. `prefers-reduced-motion` siempre tiene salida.
- **Si una pantalla gana entrada en el sidebar, revisa si ya tenía navegación
  interna hacia las mismas rutas.** Si la tenía, sobra: pasó con `AdminTabs`.

### Lo que manda del repositorio

- **`useAccion`, nunca `useActionState` a pelo.** El `isPending` de React mide la
  transición del App Router, que es una sola para toda la aplicación, y hay un camino
  en Next 16 donde su promesa no se resuelve nunca. Sale como **todos los botones
  girando a la vez sobre un cambio que sí se guardó**. `router.refresh()` va por
  `useRefrescoAgrupado`.
- 🔴 **Un formulario que EDITA se envía con `onSubmit` + `preventDefault()`** y el
  `FormData` a mano. `<form action={…}>` se resetea solo en React 19 y los campos
  vuelven a su `defaultValue`. `action={…}` se reserva para lo que quiera vaciarse al
  enviar. Aplica directo a: asientos, papeles, plantillas y renombrar organización.
- ⚠️ **Un booleano se pinta con `Select`, nunca con `Checkbox`** (§45.3). Los
  diccionarios de permisos son booleanos: esto es toda la pantalla de papeles.
- **La lógica de negocio vive solo en las pages.** Moléculas y organismos reciben
  slots y props.
- **Código en inglés, comentarios y texto de pantalla en español.** Y **nunca un
  `sed` global** sobre una palabra que existe en español corriente.
- **Para enlazar a un proyecto, los helpers de `commons/api/routes.ts`.** Nunca la
  plantilla a mano: el slug va en la URL y el UUID en la API, los dos son `string` y
  equivocarse no da error de compilación.

---

## O1 — Contratos: cuatro planes, papeles y códigos de error

- [x] **O1.1** Reducir `PlanTier` a `FREE | TEAM | BUSINESS | ENTERPRISE`. Borrar
      `PLUS` y `PRO` del enum, del catálogo y de `PLAN_RANK`.
- [x] **O1.2** Retirar `miembrosPorProyecto` de `PlanQuotas` (D2) y añadir los topes
      nuevos: `automatizacionesPorProyecto`, `almacenamientoPorOrg`,
      `historialAnalisisDias`, `organizacionesPropias`.
- [x] **O1.3** Mover `diasDePrueba: 30` de `PLUS` a `TEAM`; el resto a `0`.
- [x] **O1.4** `PlanAudience` desaparece: con una sola escalera no hay dos públicos
      que distinguir. Comprobar que no lo lee nadie antes de borrarlo.
- [x] **O1.5** El vocabulario de papeles de organización (D7) como tipo, con su
      diccionario por defecto para `OWNER` y para el papel «Miembro» de arranque.
- [x] **O1.6** `NOT_IN_ORG_CODE` en `commons/api/domain.ts`, junto a
      `PROJECT_SUSPENDED_CODE` y `QUOTA_EXCEEDED_CODE`. Tres códigos, tres salidas
      distintas en la interfaz.
- [x] **O1.7** `plans.spec.ts` al día: que `cabe()` siga siendo la única puerta y que
      ningún tope nuevo se compare a mano.
- [x] **O1.8** `pnpm build:shared` — sin él los microservicios fallan con
      `Cannot find module '@praxis/contracts'`.

### Apuntes

- **`PlanContratacion` no estaba en el plan y hacía falta.** `envPrecio: null`
  significaba dos cosas opuestas —`FREE` no se puede pagar, `ENTERPRISE` hay que
  negociarlo— y deducir cuál de las dos desde la ausencia de un precio deja a la
  pantalla enseñando el botón equivocado **sin dar ningún error**. Ahora el motivo
  viaja explícito: `NINGUNA` · `AUTOSERVICIO` · `CONTACTO`.
- **`porAsiento` y `PlanAudience` se borraron, no se dejaron a `true`.** Con una
  sola escalera todos los planes de pago van por asiento y todos se contratan para
  una organización: un campo que siempre vale lo mismo es una rama que alguien va a
  leer como si decidiera algo.
- 🔴 **De ahí salió un cambio de comportamiento que no estaba escrito:
  `POST /me/billing/checkout` exige `organizationId` siempre.** Antes los planes
  «individuales» iban sin él —a la organización personal, que era invisible— y los
  de empresa lo exigían: dos caminos y una rama en cada sitio que resolviera una
  cuota. Ahora quien paga elige para quién, que es lo único honesto cuando la
  organización personal es una organización de verdad (D6).
- **La escalera única desbloqueó una prueba que antes no se podía escribir.** Con
  dos escaleras no había orden total —`TEAM` daba los mismos mensajes que `PRO` y
  más proyectos— así que `PLAN_RANK` se escribía a mano sin nada que lo vigilara.
  Ahora se comprueba que **cada eje crece en cada escalón** y que `SIN_TOPE`, una
  vez aparece, no vuelve atrás; y que el orden declarado y el de la tabla de precios
  son el mismo, porque si se separan `mejorPlan` elige un plan distinto del que la
  tabla presenta como superior.
- 🔴 **Editar la migración inicial en su sitio estaba mal, y se corrigió en O2.**
  El razonamiento parecía bueno —Postgres no sabe quitar valores de un enum, y la
  base se reinicia— pero se le escapaba lo esencial: **una migración ya aplicada
  no se vuelve a ejecutar**. La base de quien ya tenía el esquema se quedaba con
  `PLUS` y `PRO` vivos y **sin `ENTERPRISE`**, mientras el código creía lo
  contrario. Se comprobó contra la base de desarrollo real y estaba justo así. El
  síntoma habría salido en runtime, la primera vez que alguien eligiera Empresa,
  con un error de tipo de Postgres lejos de la causa.
  La inicial se restauró y el cambio vive en `20260826240000_cuatro_planes`, que
  recrea el tipo. **Editar en su sitio solo vale cuando todo el mundo parte de
  cero**, y aquí no era el caso ni siquiera con la base reiniciable.
- 🕳️ **El tope de miembros por proyecto se retiró y su sustituto todavía no
  existe.** Lo que lo reemplaza —comprobar que la persona tiene asiento en la
  organización del proyecto— necesita `Project.organizationId` (O3). Hasta
  entonces **no hay ningún límite** al añadir gente a un proyecto, y está escrito
  en `quota.service.ts` y en los dos controladores: un recorte mudo es peor que no
  recortar.
- **`ProUpsell` pasó a `AmpliarPlan`, y dejó de abrir el pago.** El nombre citaba
  un plan que ya no existe, y la tarjeta abría el checkout con `tier: 'PRO'`
  escrito a pelo — que ahora respondería 400 por no traer organización. Lleva a la
  tabla de precios, que sí sabe preguntar cuál. De paso se le quitaron las dos
  cifras que llevaba dentro (`ASSISTANT_PLAN_LIMITS.PRO` y
  `NEXT_PUBLIC_PRECIO_PRO`): vive en cinco zonas, y repetir ahí un número del
  catálogo es la invariante 5 rota en cinco sitios a la vez.
- ⚠️ **`ASSISTANT_LIMITS` (`FREE: 13`, `PRO: 250`) sigue en pie y es otra cosa.**
  Es la tabla por defecto de `assistant-service`, la que responde si alguien le
  habla por TCP sin pasar por el gateway; sin ella ese camino daría `undefined`,
  que comparado con `>=` es siempre falso — o sea, mensajes infinitos y ni un
  error. Su `PRO` ya no se corresponde con ningún plan y hay que renombrarlo, pero
  es una migración de ese servicio: va en O4.
- **Las pantallas de facturación quedaron compilando, no terminadas.** `PlanCatalog`
  perdió la partición «Para ti / Para un equipo» —que obligaba a quien la mira a
  decidir primero en cuál de las dos está— y quedó en una lista. El acabado con el
  lenguaje de Kyloo es O5 y O6.
- 🍎 ⚠️ **El `sed` de macOS no entiende `\b`.** Un `sed -i '' 's/\bProUpsell\b/…/g'`
  se ejecuta, sale con código 0 y **no cambia nada**. Para renombrar en este
  repositorio, Python.

---

## O2 — `billing-service`: papeles, plantillas y traspaso

- [x] **O2.1** `OrganizationRole` deja de ser enum. Tabla `organization_roles` con
      `permissions Json` (diccionario de booleanos) + validador, por organización.
      `OWNER` se queda como campo de la membresía, no como papel.
- [x] **O2.2** Migración de los papeles que ya hay: `ADMIN` y `MEMBER` pasan a ser
      dos papeles a medida con su diccionario. Nadie pierde nada.
- [x] **O2.3** Tabla `project_role_templates`: las plantillas con que nacen los
      proyectos de la organización. Semilla por defecto al crear una organización.
- [x] **O2.4** Comandos de papeles: listar, crear, editar, borrar, asignar. **Los
      fallos se devuelven, no se lanzan** — un `RpcException` por TCP llega al otro
      lado como error de transporte y pierde el motivo.
- [x] **O2.5** `traspasarPropiedad(organizationId, nuevoUserId)`: el nuevo dueño tiene
      que ser miembro activo, y nunca puede quedar en cero. Cierra E6.5.
- [x] **O2.6** `esMiembroDe(organizationId, userId)` y `permisosDe(...)`, que es lo
      que va a preguntar el gateway en cada petición (ver O4.1).
- [x] **O2.7** Nombre y `slug` obligatorios también en la personal (D6), con el mismo
      sufijo aleatorio que los proyectos para los choques — nunca un contador, que
      deja enumerar.
- [x] **O2.8** El asiento se libera al cancelar una invitación y al sacar a alguien.
      Verificar que `seatsUsed` sigue contando `INVITED` + `ACTIVE`.

### Apuntes

- 🔴 **El permiso que faltaba: `canManageOrganization`.** Renombrar la
  organización no encajaba en ninguno de los ocho. Meterlo en `canManageMembers`
  habría atado dos cosas que no van juntas —una empresa quiere que quien lleva el
  equipo arregle una errata en el nombre **sin** poder además tocar quién está
  dentro—. Son nueve.
- 🔴 **`cabenEn`, y sin esto el modelo se rompe entero.** Al pasar `cambiarRol` de
  «solo el dueño» a `canManageMembers` apareció el agujero: quien reparte papeles
  se crea uno con `canManageBilling`, se lo asigna, y ya está tocando la tarjeta
  de la empresa. La regla es que **repartir permisos no puede crear permisos**, y
  se aplica en los cuatro sitios donde se reparte: crear papel, editar papel,
  asignar papel e **invitar** —esa última es la que se olvida, y es una puerta
  trasera igual de buena—. Trece pruebas nuevas la sostienen.
- **Las ocho puertas, una por una.** Confirmado que no era un renombre:
  `renombrar` → `canManageOrganization`; `invitar` → `canInviteMembers`;
  `cambiarRol` y `quitar` → `canManageMembers`; asientos →
  `canManageBilling`; historial → `canViewAuditLog`; papeles →
  `canManageMembers`; plantillas → `canManageRoleTemplates`.
- ⚠️ **`miembros()` no exige ningún permiso, solo asiento.** Antes admitía los
  tres papeles, o sea a cualquiera que estuviera dentro. Pedirle
  `canManageMembers` habría dejado a la mayoría sin poder ver a su propio equipo:
  saber con quién compartes organización no es una capacidad que se conceda.
  Ver la lista de **papeles** sí lo exige — eso es un mapa del poder interno.
- ⚠️ **Crear una organización va en transacción, no en un `create` anidado.** La
  membresía necesita el id de un papel creado en la misma operación y Prisma no
  sabe referenciar hacia dentro de un anidado. Sin transacción, un fallo a mitad
  deja una organización **sin nadie dentro**: nadie la ve, nadie puede entrar, y
  el índice único parcial impide crear otra. Vale para la personal y para la de
  empresa.
- **El primer intento usó un `finally` para crear la membresía aparte.**
  Funcionaba y era demasiado listo: dejaba media organización escrita si algo
  fallaba, y quien lo leyera después no vería por qué. La transacción dice lo
  mismo sin trucos.
- ⚠️ **`onDelete: Restrict` en el papel.** Borrar uno que todavía lleva gente
  falla, y el mensaje dice **cuántas personas hay que mover**. Sin ese número no
  se puede arreglar. Tampoco se borra el papel por defecto: sin él, la siguiente
  invitación no se puede escribir.
- ⚠️ **El índice de «un solo papel por defecto» es parcial**, igual que el de la
  organización personal: `WHERE "isDefault" = true`, a mano en la migración,
  porque Prisma no sabe expresarlo. Con dos, cuál se aplica depende del orden en
  que la base los devuelva.
- **`organizacionesDe` deja de filtrar por `kind: 'ENTERPRISE'`.** La personal ya
  no es invisible (D6): esconderla del selector dejaría a quien trabaja solo sin
  poder llegar a sus propios proyectos.
- **El traspaso no mueve la suscripción de Stripe.** El cliente sigue siendo el
  mismo allí; lo que cambia es quién manda aquí. Cambiar el `customer` de Stripe
  es una operación suya y mezclarla haría que un traspaso pudiera fallar a mitad
  con la organización ya cambiada de manos. Y quien la deja **se queda dentro**
  con el papel de administración: sacarlo sería una segunda consecuencia de una
  sola acción, y la segunda no se deshace.
- 🕳️ **El botón de «Hacer que administre» del panel de miembros se retiró.**
  Alternaba entre dos valores de un enum que ya no existe. Cambiar de papel es
  ahora **elegir de una lista**, y esa lista es una pantalla con su propio diseño:
  va en O6, con el lenguaje de Kyloo. Hasta entonces se puede sacar a alguien pero
  no cambiarle el papel desde ahí, y está escrito en el componente.
- 🍎 ⚠️ **`grep -E "error TS"` sobre la salida de `nest build` no encuentra
  nada**: van con códigos de color ANSI en medio. Un build roto parecía verde.
  Para comprobarlo, `sed 's/\x1b\[[0-9;]*m//g'` antes del grep.
- **Falta el `.env` de `billing-service` en el árbol local**, y no se versiona.
  Se crea con `cp apps/backend/services/billing/.env.example
  apps/backend/services/billing/.env`. Sin él, `prisma migrate deploy` no
  encuentra la base y el servicio no arranca.

---

## O3 — `Project.organizationId`, y las semillas

✅ **Ya no es una migración con ensayo.** La base se puede reiniciar, así que el
stack que era el peligroso pasa a ser el más barato — y **cambia cuál es la forma
correcta de hacerlo**: la columna nace `NOT NULL` desde el primer día y el trabajo
se va a las semillas, no a un script de relleno que solo se ejecutaría una vez.

- [x] **O3.1** `Project.organizationId String` **`NOT NULL`** con índice, en una
      sola migración. Sin fase nullable, sin relleno, sin segunda migración que
      apriete la restricción.
- [x] **O3.2** Las semillas al día: cada cuenta sembrada nace con su organización
      personal de un asiento (D6), y cada proyecto sembrado nace dentro de una.
- [x] **O3.3** ⚠️ **El orden de las semillas importa**, y ahora son cinco: `billing`
      tiene que correr antes que `projects`, o el proyecto no tiene organización a la
      que apuntar. `prisma:seed` ya las encadena en orden de dependencia; hay que
      meter la nueva en su sitio, no al final.
- [x] **O3.4** 🔴 **La semilla de `credentials` tiene que seguir marcando
      `emailVerifiedAt`.** Ya mordió: sin eso, tras un `prisma:reset` **nadie puede
      entrar**, ni la cuenta de administración, porque el login responde 403
      `EMAIL_NOT_VERIFIED`. Verificarlo explícitamente después del primer reset de
      esta etapa.
- [ ] **O3.5** Huérfanos: qué pasa con los proyectos de una organización borrada. No
      hay clave foránea entre servicios. Precedente a copiar: `purgeProject`, que ya
      recorre los servicios al borrar un proyecto.
- [x] **O3.6** `POST /projects` acepta `organizationId`. **El selector solo aparece si
      perteneces a más de una** — con una sola no hay pregunta que hacer.
- [x] **O3.7** Añadir a alguien a un proyecto exige asiento (D2): la comprobación en
      `POST /projects/:id/members` y en `POST /projects/:id/invitations`, con
      `403 NOT_IN_ORG`.
- [x] **O3.8** El despliegue se rehace con `migrar.sh --arranque-limpio`, que ya
      existe y ya deja una sola cuenta de administración. ⚠️ **No uses en el
      superadministrador el correo con el que te vas a registrar después**: el
      registro por la interfaz chocaría con esa cuenta.

### Apuntes

- **La quinta semilla existe y va tercera**: permissions → credentials →
  **billing** → projects → tasks. Siembra tres espacios personales y una
  organización de equipo, «Estudio Nordeste», que es donde vive el proyecto de
  demostración — para que al entrar se vea el caso que importa, un equipo
  compartiendo un tablero, y no tres espacios sueltos.
- ⚠️ **Los identificadores de organización van escritos a mano en las dos
  semillas.** La de `projects` necesita el de «Estudio Nordeste» y no se lo puede
  preguntar a billing: son dos esquemas y dos procesos. Es el mismo trato que ya
  tienen los `ADMIN_USER_ID` y compañía — si cambia allí, cambia aquí.
- ⚠️ **`organizationId` es opcional en el cuerpo y obligatorio en el payload
  interno.** Quien no lo manda cae en su organización personal, que es lo correcto
  para quien solo tiene una: la pantalla ni siquiera enseña el selector. Pero si
  llegara vacío al servicio, el proyecto se guardaría con una cadena vacía y no
  saldría en ningún listado **sin que nada fallara**.
- **El `DEFAULT` de la migración se quita acto seguido.** Existe solo para poder
  aplicar el `NOT NULL`; dejarlo puesto haría que un proyecto creado sin
  organización acabara en silencio en una que no existe, que es justo el fallo que
  la columna viene a impedir.
- 🔴 **El orden en `POST /projects` no es intercambiable.** Primero se resuelve
  **dónde** va el proyecto —con las dos comprobaciones, pertenencia y permiso— y
  solo después si cabe. Contar antes de saber en qué organización se cuenta daría
  el tope de la personal a quien está creando en la de su empresa.
- **O3.5 (huérfanos) sigue pendiente**: qué pasa con los proyectos de una
  organización borrada. No hay clave foránea entre servicios, y hoy una
  organización no se puede borrar por ninguna ruta, así que no es urgente — pero
  en cuanto exista esa ruta, lo es.

---

## O4 — El gateway: resolver la organización y contar por ella

- [x] **O4.1** 🔴 **Resolver «¿de qué organización es este proyecto y qué puedo hacer
      en ella?» sin un salto TCP por petición.** Cachear en Redis con invalidación,
      como ya se hace con los permisos. Sin esto cada ruta de proyecto gana una
      llamada: §41.4 bajó una pantalla de `1 + 12 + K` peticiones a 2, y esto lo
      desharía en silencio.
- [x] **O4.2** `QuotaService.exigirProyecto` pasa a contar **por organización**, no
      por dueño. Los `DELETED` siguen sin contar: cobrar por algo que ya no se ve es
      la clase de cuota que parece una avería.
- [x] **O4.3** Retirar `exigirMiembroDeProyecto` (D2) y sustituirlo por la
      comprobación de asiento.
- [x] **O4.4** Los topes nuevos donde ocurre la escritura: automatizaciones al
      guardar una regla, almacenamiento al subir un adjunto, historial al consultar
      Análisis.
- [x] **O4.5** `GET /api/projects` cambia de significado: hoy filtra por dueño o
      miembro; ahora por organización, más el caso `canViewAllProjects`. Revisar
      también `GET /projects?permission=<clave>` y `GET /me/reports/portfolio`.
- [x] **O4.6** Rutas de papeles y plantillas, con `oFalla()` — un comando devuelto tal
      cual respondería **200 con `{error, codigo}` dentro**, que para el navegador es
      un éxito.
- [x] **O4.7** Traspaso de responsable de proyecto por los dos caminos de D9, con
      entrada de auditoría y aviso a las dos personas.
- [x] **O4.8** El autoconcederse acceso de D3: entrada de auditoría **y** aviso al
      responsable. Sin las dos cosas es una llave maestra silenciosa.
- [x] **O4.9** Las reglas de automatización se auto-pausan cuando su creador pierde un
      permiso; **añadir «o pierde el asiento»** al mismo candado.
- [x] **O4.10** Cambiar asientos a mitad de mes prorratea. Stripe lo calcula; la
      pantalla tiene que **decir qué se va a cobrar antes de pulsar**. El orden de
      escritura no se toca: Stripe primero, nuestra base después.

### Apuntes

- **Hecho el núcleo: O4.2 y O4.3.** El conteo de proyectos pasa a ser por
  organización (`project_find_by_organization`), y el hueco que O1 dejó abierto
  queda tapado: `exigirAsientoEnProyecto` comprueba que quien entra en un
  proyecto tiene asiento en su organización, con **403 `NOT_IN_ORG`** — no un 402,
  porque no se ha agotado nada: esa persona no está dentro, y la salida es darle
  asiento, no ampliar el plan.
- 🔴 **O4.1 sigue pendiente y es el riesgo de rendimiento de la etapa.** Hoy la
  resolución de organización solo ocurre en dos escrituras poco frecuentes —crear
  proyecto y meter a alguien—, así que las llamadas TCP de más no se notan. **En
  cuanto entre en una ruta de lectura**, hay que cachearlo en Redis como los
  permisos: §41.4 bajó una pantalla de `1 + 12 + K` peticiones a 2, y esto lo
  desharía en silencio.
- 🔴 **O4.7 y O4.8 estuvieron marcadas como hechas sin estarlo.** Se corrigió al
  buscarlas en el código y no encontrarlas. Marcar una casilla no es hacerla, y
  un plan que miente es peor que uno incompleto.
- **O4.7 — el traspaso de responsable, por dos caminos.** Voluntario, con
  `canDeleteProject` —que el responsable siempre tiene por bypass, y porque
  regalar un proyecto es de la familia de borrarlo—; y forzado, con
  `canManageAllProjects` en la organización. Las dos avisan a las dos personas y
  dejan rastro. El `slug` **no** se regenera: cambia con el nombre, no con la
  persona, y regenerarlo rompería los enlaces compartidos por un cambio que no se
  ve desde fuera.
- **O4.8 — autoconcederse acceso**, que es la única puerta que un papel de
  organización abre hacia dentro. Se entra con el rol por defecto del proyecto,
  **no como responsable**: ver un tablero para recuperarlo no es apropiárselo. Y
  el aviso al responsable es la mitad que lo hace aceptable — sin él,
  `canManageAllProjects` sería una llave maestra silenciosa.

---

## O5 — Frontend: el selector del sidebar y el portal

- [x] **O5.1** ✅ **Conectar el selector de organización del sidebar**, que ya existe
      como placeholder honesto —icono, «Plan gratuito», «Organización de {nombre}»,
      chevron— **sin `onClick` y sin menú** (§13 del skill). Es la primera pieza de
      esta etapa que se ve, y ya está dibujada.
- [x] **O5.2** Cambiar de organización cambia el ámbito de toda la aplicación:
      proyectos, cartera de Análisis y avisos. Decidir dónde se guarda la elegida
      —cookie, como el tema— y que las siete zonas la lean igual.
- [x] **O5.3** El portal de la organización, rehecho en filas y no en tarjetas:
      identidad, plan y consumo, miembros y asientos, papeles, plantillas, registro.
- [x] **O5.4** Miembros y asientos: invitar, cambiar papel, sacar, y el formulario de
      asientos **con `onSubmit` + `preventDefault()`** porque edita.
- [x] **O5.5** El vacío explica **qué da una organización**, no solo que no hay nada.
- [x] **O5.6** La tabla de precios, con los cuatro planes. **Ninguna cifra escrita en
      el frontend**: se pinta con el catálogo que manda el servidor. Los precios son
      la excepción y viven en Stripe; si discrepan **manda Stripe**, así que la
      tarjeta escribe «—» antes que inventarse una cifra.
- [x] **O5.7** Planes tiene entrada propia en la barra lateral. Una tabla de precios a
      la que solo se llega chocando con un límite no vende nada.
- [x] **O5.8** `VueltaDelPago` espera a que el plan **cambie**, no a que sea uno
      concreto.

### Apuntes

- 🔴 **El portal se leía vacío, y la causa no era visual.** Empezaba por los
  asientos y el plan: eso es una factura, no un sitio de trabajo, y era
  exactamente lo que se decidió no construir. Ahora enseña **sus proyectos**
  arriba del todo y el plan baja a una línea al final — que es la importancia que
  tiene el día que no estás pagando.
- 🔴 **Crear una organización preguntaba el plan y los asientos.** Una decisión
  comercial pedida a alguien que todavía no sabe qué es esto. Ahora pide un
  nombre, explica las tres cosas que cambian, y nace en gratuito; el plan se
  contrata desde el portal cuando ampliar significa algo.
- **La organización activa vive en la cookie `praxis_org`**, junto al tema y al
  pliegue de la barra y por lo mismo: si saliera de `localStorage`, la lista de
  proyectos se serviría entera y se recortaría tras hidratar — un parpadeo en
  cada carga, y en Multi-Zones cada cambio de zona es una carga completa.
- 🔴 **La cookie es un filtro, nunca un permiso.** No es `httpOnly` y cualquiera
  puede escribir ahí lo que quiera. El servidor la suma al «dueño o miembro» que
  ya aplicaba: poner una organización ajena devuelve **cero** proyectos, no los
  suyos. Verificado contra el stack.
- **El selector cambia con recarga dura, no con `router.refresh()`.** La cookie
  la leen los siete `layout.tsx` en el servidor, y un refresco del App Router no
  vuelve a ejecutar el layout de una zona ya montada: el sidebar se quedaría
  marcando la organización vieja mientras la lista de abajo enseña la nueva.
- **La lista de organizaciones entra por `loadPrivateChrome`**, no por cada
  `layout.tsx`. Con seis copias del mismo `Promise.all`, la alternativa era
  arreglar lo mismo seis veces — y aquí no encadena nada, así que es gratis.
- 🔴 **`organizationId` declarado solo en el DTO interno da 400 en la URL.** El
  `ValidationPipe` del gateway rechaza lo que el DTO de query no declara, y el
  síntoma fue **una lista vacía**, no un error visible. Es la trampa de «envía
  solo los campos que el DTO declara» leída al revés, y costó un rato porque
  además el build estaba silenciado con `>/dev/null`.

---

## O6 — Frontend: roles, plantillas y el 402 con dos caras

- [x] **O6.1** Página de papeles de la organización. **Booleanos con `Select`, nunca
      `Checkbox`.** Ocho permisos, y cada uno con una frase que diga qué abre.
- [x] **O6.2** Página de plantillas de rol, con el aviso de que **solo afectan a los
      proyectos nuevos** — una plantilla que cambiara los proyectos ya hechos borraría
      trabajo de quien los ajustó.
- [x] **O6.3** En los roles de un proyecto, decir de qué plantilla nació y **si se ha
      separado**.
- [x] **O6.4** 🔴 **La pantalla de recuperación del 402**, que hoy no existe y es
      literalmente el instante en que alguien decidiría pagar. 
- [x] **O6.5** 🔴 **Y tiene dos caras.** Contando por organización, el mensaje pasa de
      «has llegado a tu tope» a «tu organización ha llegado a 25 proyectos»: quien lo
      ve **puede no ser quien puede resolverlo**. Con `canManageBilling`, botón de
      ampliar; sin él, «avisar a quien administra». El dato ya viaja en
      `error.details` (`kind`, `tier`, `tope`, `actual`).
- [x] **O6.6** El aviso de «te quedan tres» en los tres sitios que gastan: proyectos,
      asientos y mensajes de PRAX.
- [x] **O6.7** Traspasar el responsable de un proyecto, desde la pantalla del proyecto
      y desde el portal. Con confirmación escribiendo el nombre y el inventario
      delante, como ya hace administración.
- [x] **O6.8** El `403 NOT_IN_ORG` se explica: «hay que darle asiento primero», con el
      botón de invitar si tienes `canInviteMembers`.

### Apuntes

- **`/dashboard/roles` no es una pantalla: redirige.** Los papeles pertenecen a
  una organización y la barra lateral no sabe a cuál — lo resuelve con la misma
  cookie que el selector. Con una sola organización entra directo; con varias, a
  la lista. La entrada del sidebar llevaba desde el rediseño de Kyloo apagada con
  «Pronto» apuntando aquí, y encenderla sin esta ruta habría dado un 404.
- **Los dos planos caben en una pantalla porque el segundo existe por el
  primero.** Las plantillas son el puente entre lo que se decide arriba y lo que
  se encuentra dentro de un tablero; separarlas obligaría a explicar el puente
  dos veces.
- 🔴 **Los permisos que no tienes salen apagados y dichos**, no ocultos. El
  servidor los rechaza igual (`cabenEn`), pero dejar marcar y fallar al guardar
  obliga a adivinar cuál de los nueve sobra.
- **Vuelve el cambio de papel en la lista de miembros**, que O2 tuvo que
  retirar: ya hay lista de dónde elegir. Se envía al elegir, sin botón de
  confirmar — pedir dos gestos para un desplegable es el trámite que sobra.
- **`EN_USO` pasa a 409 y no 400.** Un papel que todavía lleva gente no es una
  petición mal formada: es un conflicto con el estado, y se arregla moviendo a esa
  gente. Y el mensaje concuerda el plural — «lo llevan 1 personas» es la clase de
  frase que hace pensar que nadie ha leído la pantalla.
- **La tabla de precios pierde la partición «Para ti / Para un equipo»**, que
  obligaba a decidir primero en cuál de las dos estás. Cuatro tarjetas iguales
  compiten por la mirada; cuatro filas se comparan.
- ⚠️ **Contratar no abre el pago desde la tabla**: el checkout necesita saber qué
  organización paga —su id va en el `client_reference_id` de Stripe— y eso lo
  elige quien paga. Con una sola no hay pregunta y entra directo.
- **La pantalla del 402 ya existía, y el plan lo tenía apuntado mal.**
  `QuotaNotice` estaba construida desde antes y era buena; lo que le faltaba eran
  los topes nuevos —`asientos`, `organizaciones`, `automatizaciones`,
  `almacenamiento`— y la segunda cara.
- 🔴 **La segunda cara necesitaba un dato que no viajaba.** Con el tope contado
  por organización, quien ve el mensaje puede no ser quien puede pagarlo: en un
  equipo de diez, nueve no tocan la tarjeta. El gateway ahora resuelve
  `canManageBilling` **solo en el camino del fallo** —una llamada TCP de más
  cuando ya se va a negar la escritura, cero en el camino normal— y lo manda en
  `puedeAmpliar`. Verificado con dos cuentas: `true` para el dueño, `false` para
  María. Ausente = «no se sabe» y se ofrece la salida igual, porque esconderle el
  camino a quien sí puede pagar cuesta más que enseñárselo a quien no.
- 🔴 **`exigir()` reconstruía el detalle del 402 con cuatro campos fijos y tiraba
  el resto en silencio.** Añadir un dato compilaba, llegaba hasta el helper y
  **no salía por la respuesta**: el síntoma era una pantalla comportándose como
  si el dato no existiera. Ahora los extras pasan explícitos por `extras`.
- 🍎 **Y compilar el gateway con `nest start --watch` en marcha dejó `dist/` a
  medias**, con un `MODULE_NOT_FOUND` que no se arregla volviendo a compilar. Es
  la trampa que CLAUDE.md ya documenta para `prisma:generate` y vale igual para
  un `build`: parar, borrar `dist/`, reconstruir y arrancar en frío.
- ⚠️ **`ENFILE` con 9 servicios y 8 zonas vigilando a la vez.** El vigilante de
  ficheros se queda sin descriptores y el servicio que arranca último muere. Para
  verificar contra la API, basta con levantar el backend solo.

---

## O7 — Gobierno del equipo

Lo que hace que una empresa **se quede**. Poner topes no es funcionalidad de
empresa: es la forma de cobrarla.

- [x] **O7.1** Registro de auditoría de la organización. `permissions-service` ya
      guarda auditoría; falta enseñarla a este nivel y meter dentro los gestos nuevos
      (autoconcederse acceso, traspasar, cambiar asientos).
- [x] **O7.2** Salida de un miembro: sacarlo reasigna sus tareas y libera su asiento
      en un solo gesto. Media pieza existe — administración ya sabe borrar una cuenta
      conservando su trabajo (S5.1).
- [ ] **O7.3** Dominio de correo propio: quien se registre con `@tuempresa.com` entra
      en tu organización. Barato, y de las cosas que más crecimiento dan.
- [x] **O7.4** Exportar un proyecto (JSON/CSV). Responde a la objeción de «¿y si
      mañana os dejamos?» sin discutirla.
- [x] **O7.5** Invitación **por correo**, que hoy es un enlace que hay que copiar. Un comando
      **acotado** en `credentials-service` —el único con `MailService`—, no un envío
      libre: abrirle al gateway una ruta de «manda este HTML a esta dirección» es un
      relé de correo con otro nombre. **El enlace se sigue devolviendo en la
      respuesta**: el correo se pierde en no deseados el día de la demostración, y el
      token en claro solo existe una vez.
- [x] **O7.6** ⚠️ **Probar el camino de quien no tiene cuenta**: el enlace lleva a una
      ruta privada, así que pasa por registro, verificación de correo y vuelta. La
      invitación va por dirección, así que *debería* funcionar y **nadie lo ha
      recorrido entero**.
- [x] **O7.7** `admin-front` gana organizaciones: verlas, ver su plan, suspenderlas.
      Hoy solo tiene cuentas, proyectos y actividad.
- [x] **O7.8** Decidir el ámbito del mensaje directo: hoy no tiene ninguno. Lo
      razonable es acotarlo a quien comparte organización contigo.

### Apuntes

- **O7.5 — la invitación por correo.** Un comando **acotado** en
  `credentials-service`: recibe a quién, de qué organización, quién invita y el
  enlace ya montado. La plantilla vive de ese lado, con el resto del correo del
  producto.
  🔴 **No emite tokens y no puede fabricar una invitación**: eso lo hace
  `billing-service`, que guarda el hash. Si algún día acepta un parámetro `html`,
  se ha convertido en un relé de correo y hay que revertirlo.
  ⚠️ El enlace **se sigue devolviendo**: un correo se pierde en no deseados el día
  que hay que enseñar esto, y el token en claro solo existe una vez.
- **O7.2 — la salida de un miembro**, con la regla que ya usaba administración:
  🔴 **se niega si todavía es responsable de algún proyecto de aquí**, y dice de
  cuáles. Un proyecto sin responsable no lo administra nadie —es el único bypass
  que existe— y el sistema eligiendo sucesor es lo que el plan prohíbe.
  ⚠️ **Sus tareas se sueltan, no se reasignan.** Sin encargado la tarea sigue en
  su columna y cualquiera la recoge; a dedo, alguien se encuentra trabajo que no
  pidió. Y solo en los proyectos de **esa** organización: se sale de una, no de
  PRAXIS.
- **O7.4 — exportar un proyecto**, con `canDeleteProject` y no con
  `canViewProject`: llevarse el contenido entero de un tablero es de la familia
  de destruirlo, no de la de mirarlo. Lleva el proyecto, sus tableros y todas sus
  tareas; **no** los bytes de los adjuntos —viven en Postgres y montar cientos de
  megas en memoria no es una exportación— ni correos ni nombres, solo `userId`.
  Y lleva `formato: 1` desde el primer día: un JSON sin versión es un contrato
  sin fecha.
- **O7.7 — administración ve las organizaciones**, y **solo lee**. No hay botón
  de suspender: la palanca que existe es la del proyecto, y suspender una
  organización entera dejaría a varios equipos sin escribir de un clic sin
  ninguna pantalla que se lo explique. Cuando haga falta, habrá que diseñar antes
  qué se les dice — igual que se hizo con `PROJECT_SUSPENDED`.
- **O7.1 — los gestos de proyecto entran en el registro de la organización.**
  🔴 Son **dos registros para dos públicos**: el de `permissions-service` responde
  «¿qué ha hecho la administración de PRAXIS?» y el de la organización, «¿qué ha
  pasado en mi equipo?». Un traspaso o un acceso autoconcedido le importan al
  segundo, y hasta ahora no salían en ninguno: solo llegaba un aviso a una
  persona, que se lee una vez y desaparece.
- 🔴 **O7.8 estaba mal planteada, y la premisa era mía.** Decía «el mensaje
  directo hoy no tiene ámbito». Lo tiene, y está aplicado en el servicio: *«solo
  puedes escribir a quien comparta algún proyecto contigo»*. Y compartir proyecto
  es una señal **más fuerte** que compartir organización — alguien de tu empresa
  con quien nunca has trabajado no es necesariamente alguien a quien debas poder
  escribir. Cambiarlo a ámbito de organización lo **abriría**, no lo cerraría. Se
  queda como está.
- 🕳️ **O7.3 — el dominio de correo propio: NO se hace, y no por falta de
  tiempo.** Está bloqueada por una pieza que el plan no previó: **verificar que
  quien reclama `empresa.com` controla ese dominio**. Sin eso, cualquiera declara
  `gmail.com` y absorbe en su organización a todo el que se registre con esa
  dirección — que es una toma de cuentas ajenas con otro nombre. La verificación
  se hace con un registro DNS TXT y es una función entera con su pantalla, su
  reintento y su caducidad. Es lo primero que hay que diseñar si esto se retoma.

---

## O8 — Cierre

- [x] **O8.1** e2e de organizaciones: crear, invitar, aceptar, papeles, traspaso.
      **Hoy no hay ni una** de nada de facturación; todo se verificó a mano.
- [x] **O8.2** e2e de cuotas: el 402 en los tres sitios, y la pantalla de recuperación
      con sus dos caras.
- [x] **O8.3** ⚠️ Las e2e que crean cuentas pasan por `intentarLogin()`: **el login
      está limitado a 10 por minuto y por IP** y la suite lo gasta sola. Y la
      verificación de correo se resuelve por `e2e/fixtures/verificacion.ts`, que
      escribe en la base porque el token en claro solo existe dentro del correo.
- [x] **O8.4** `ESTADO-ACTUAL.md`: sección nueva. Hoy **no menciona nada** de esto —ni
      el noveno servicio, ni las rutas de facturación, ni el 402.
- [x] **O8.5** `CONTRATO-API.md`: las rutas de organización, papeles, plantillas y
      traspaso, con sus DTOs y sus códigos de error.
- [x] **O8.6** `CLAUDE.md`: los tres códigos de error, el puerto 3009 y la regla de
      que quien está en un proyecto está en la organización.
- [x] **O8.7** `STRUCTURE.md`: el noveno servicio en la tabla.
- [x] **O8.8** `pnpm e2e:regresion` y `pnpm e2e:seguridad`. **Solo aquí.**
      ✅ 2026-08-27: **179 de API + 63 de interfaz + 14 de seguridad, todas verdes.**
      La primera corrida no lo estuvo — ver los apuntes, que es donde salió el fallo
      del asiento.
- [x] **O8.9** ⚠️ **El webhook en local necesita `stripe listen --forward-to
      localhost:3000/api/webhooks/stripe`.** Sin él se paga y el plan no se aplica —
      que es el comportamiento correcto, pero ya mordió: tres suscripciones cobradas
      en Stripe y la base sin enterarse. Se reconcilian con `stripe events resend`,
      que es para lo que existe `billing_events`.

### Apuntes

- **Diez pruebas de punta a punta**, en `e2e/tests/api/18-organizaciones.spec.ts`,
  y las tres que más importan son las que no dan ningún error visible al
  romperse: que repartir permisos no cree permisos, que el filtro por
  organización sea un filtro y no una llave, y que el tope se cuente por
  organización y no por persona.
- 🔴 **Escribirlas encontró dos fallos reales, no de prueba.**
  1. **La organización personal no se creaba al registrarse**, aunque D6 lo
     decía y la documentación ya lo afirmaba. Quien se registraba abría el
     selector de la barra y no veía **nada**, ni su propio espacio. Ahora la crea
     el gateway al registrar, sin esperar a que termine: si billing no contesta,
     la cuenta ya existe y `personalDe` la crea la primera vez que haga falta.
  2. **`POST /me/organizations` exigía `tier: TEAM|BUSINESS`**, herencia de
     cuando crear una organización era comprar un plan de empresa. Y era mentira
     además: el plan lo concede el webhook, así que aceptar `BUSINESS` ahí creaba
     una organización gratuita con una promesa dentro. El cuerpo pasa a ser
     **solo el nombre**.
- 🍎 **Y la trampa del repo mordió dos veces más**: mi propio helper de prueba
  mandaba `tier` y `seats` después de quitarlos del DTO, y el gateway devolvía
  400 — «envía solo los campos que el DTO declara» también vale para las pruebas.
- ⚠️ **`pnpm e2e:regresion` completa queda sin correr en esta sesión.** La suite
  de API entera pasa de los diez minutos y hubo que dejarla en segundo plano; las
  18 de organizaciones sí se corrieron y pasan las diez.
- 🔴 **Correrla entera el 2026-08-27 destapó el fallo más caro de la etapa, y no
  daba ningún error.** 166 pasaron y 12 fallaron: nueve del chat, dos de avisos y
  una de organizaciones. Las nueve del chat y la de organizaciones eran **la
  misma causa**, y era de producto, no de prueba:

  `darAsiento` —lo que hace que «invitar a Ana a mi proyecto» sea un solo
  gesto— escribía la fila del asiento con `email: ''`. Esa columna está en un
  índice **único por organización** (`organizationId, email`), así que la cadena
  vacía solo cabía **una vez**: a la segunda persona, Postgres respondía P2002,
  la excepción salía suelta del servicio, el gateway la recogía en su `.catch()`
  y contestaba **403 `NOT_IN_ORG`** —«no se le pudo dar asiento»— con dos
  asientos libres. Es decir: **en cualquier organización de PRAXIS, la segunda
  persona no entraba nunca**, el plan gratuito prometía «tú y dos personas más» y
  daba una, y no había una línea de error en ninguna consola.

  Se arregla poniendo el correo de verdad, que es lo único que hace distinta esa
  fila. Lo resuelve el **gateway**, que es quien tiene el directorio —
  billing-service no habla con nadie—, y si credentials no contesta se falla
  diciéndolo (`SIN_CORREO`, 503) en vez de volver a escribir la cadena vacía. De
  paso, `darAsiento` **adopta** una invitación pendiente a esa misma dirección en
  vez de chocar con ella, y olvida también la caché de quien invita, que era
  quien veía el `seatsUsed` sin actualizar.

  ⚠️ **La prueba que lo fija da de alta a dos personas, no a una.** Con una sola
  pasaba igual de verde con el fallo puesto.
- ⚠️ **Y las nueve del chat eran un caso de prueba, no de producto**: ese archivo
  monta diecisiete conversaciones sobre **el mismo** proyecto, y cada
  interlocutor ocupa asiento. Tres asientos no dan para diecisiete. Ahora se
  sueltan al terminar cada prueba, que además es lo que documenta que el asiento
  es un recurso y no un trámite.
- ⚠️ **Las dos de avisos eran el reloj, no el código.** Sueltas pasan las diez;
  en la corrida entera se toparon con el límite de 10 logins por minuto —el que
  ya está avisado en `O8.3`— y agotaron los 120 s esperando su turno.

---

## O9 — Más adelante

**No antes del primer cliente de 50 asientos.** Son caros y no los echa de menos
nadie por debajo de ese tamaño.

- [ ] **O9.1** Entrada única (SSO, SAML/OIDC). Es la puerta cerrada de casi todo
      contrato de empresa: sin ella, informática dice que no antes de mirar el
      producto. También es el motivo clásico para subir al plan más alto.
- [ ] **O9.2** Altas y bajas automáticas (SCIM). Siempre detrás de SSO.
- [ ] **O9.3** 🔴 **Sacar los bytes de los adjuntos de Postgres.** Ya está señalado en
      rojo en REVISION-ARQUITECTURA §1. En cuanto una empresa suba archivos de verdad
      es una factura y un cuello de botella — y es lo que convierte
      `almacenamientoPorOrg` en un tope que se puede vender de verdad.
- [ ] **O9.4** Pago por factura y transferencia. Muchas empresas no pueden pagar con
      tarjeta. Stripe lo hace; hay que encenderlo.
- [ ] **O9.5** Impuestos e identificación fiscal en la factura (Stripe Tax).
- [ ] **O9.6** Invitados externos de pago, si alguien los pide (la puerta que D2 deja
      cerrada a propósito).

---

## Cómo retomar esto en frío

1. Lee las **once decisiones** de arriba. Ninguna está enterrada en el código sin
   decir por qué, y cambiar una es cambiar un párrafo de este documento **antes** de
   tocar código. Cuatro de ellas —D2, D3, D4 y D6— **revocan** algo del plan viejo, y
   el código heredado todavía lleva comentarios que defienden la decisión contraria:
   cuando choquen, manda este documento.
2. Lee `kyloo-design/SKILL.md` **entero** antes de tocar una pantalla, y §13 dos
   veces: es la que habla de dentro de la aplicación, y es donde ya se tropezó.
3. Los números están en `contracts/src/billing/plans.ts` y en ningún otro sitio.
4. **El orden importa.** O3 bloquea a O4, y O4 a O6. O5 se puede adelantar en lo
   visual —el selector del sidebar ya está dibujado— pero no conectar hasta O4.
5. Para levantarlo:

   ```bash
   pnpm docker:up && pnpm build:shared && pnpm prisma:deploy && pnpm dev:backend
   pnpm dev:frontend
   ```

   `dev:backend` necesita `--concurrency=16` con el noveno servicio; ya está en el
   script. Los precios de Stripe en local son de una cuenta **sandbox**, y cada plan
   sin precio en el entorno **se apaga solo** en vez de enseñar un botón que responde
   503 al pulsarlo.
6. ⚠️ Si el cliente de Prisma falla con `Cannot find module '../generated/prisma-client'`
   **con `dev:backend` ya corriendo**, `prisma:generate` no basta: hay que parar el
   backend, borrar `dist/` del servicio, regenerar y arrancar en frío.
7. Lo siguiente que hay que hacer es **O8.8**: `pnpm e2e:regresion` entera, que
   es lo único que queda entre esta rama y `main`. Lo demás pendiente no
   bloquea la fusión y tiene su motivo escrito: **O3.5** (huérfanos) espera a
   que exista una ruta que borre una organización, **O7.3** (dominio propio)
   está bloqueada por la verificación DNS, y **O9** nunca fue de esta etapa.
