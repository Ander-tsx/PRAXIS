# Auditoría — la organización activa, el chat en la barra lateral y el móvil

> Abierta el 2026-09-03 sobre `main` (`beb858d`). **Documento de trabajo y de
> traspaso**: se lee al retomar y se marca al cerrar cada hallazgo, para que
> cambiar de agente a mitad no pierda el hilo.
>
> 📍 Vive en `docs/` y no en `docs/frontend/` por lo mismo que
> [PLAN-ORGANIZACION-ACTIVA.md](PLAN-ORGANIZACION-ACTIVA.md): parte de lo que se
> audita es la mitad de frontend de una etapa que también tocó el backend, y
> separarlos haría que quien busque por qué un chat responde 404 no lo encuentre.

---

## Qué se audita y por qué

Tres etapas seguidas dejaron el producto con deuda que no se ha barrido:

1. **La organización activa** (`PLAN-ORGANIZACION-ACTIVA.md`, 2026-08-28) —
   todo cuelga de una organización elegida. Backend cerrado; el frontend quedó a
   medias en sitios que el plan daba por hechos.
2. **La barra lateral segmentada** (`398ba09`…`83462d4`, siete commits en inglés
   titulados «UI: …») — el directorio de chats y la bandeja de avisos se
   mudaron a pestañas del sidebar. Las entradas viejas se borraron; **el código
   que las alimentaba se quedó vivo apuntando a nada**.
3. **El rediseño monocromo** (`0870ee8`…`beb858d`) — la paleta pasó a blanco
   sobre gris. Se aplicó como una sustitución masiva y aplanó la jerarquía
   tipográfica en las superficies nuevas.

Ninguno de los tres fallos que se reportaron da un error. Es el patrón que
`CLAUDE.md` avisa dos veces: un renombrado global compila, y una cadena de texto
no da error de tipos.

## Método

Auditoría **estática** sobre el árbol de trabajo: lectura de código, `grep`
dirigido, `biome check`, `tsc --noEmit` por zona y cruce contra el contrato del
backend (`apps/backend/**`) y las decisiones escritas en los planes.

⚠️ **El stack no estaba levantado.** Cada hallazgo lleva su estado de
verificación:

| Marca | Qué significa |
|---|---|
| ✅ **Confirmado** | Se demuestra leyendo el código y su contraparte. No hace falta ejecutarlo |
| 🟡 **Probable** | La lectura lo explica, pero falta reproducirlo con el stack en marcha |
| ⬜ **Por comprobar** | Sospecha con indicio; no se ha cerrado |

## Estado general

| Bloque | Hallazgos | Cerrados |
|---|---|---|
| A — Organización activa | 6 | **6** |
| B — Chat y avisos | 9 | **8** (B8 sin reproducir) |
| C — Móvil | 6 | **4** (C6 y el repaso visual, pendientes) |
| D — Rendimiento y carga | 3 | **3** |
| E — Higiene: muerto, duplicado, formato | 6 | **6** |
| **Total** | **30** | **27** |

⚠️ **Lo que queda abierto, y por qué:**

| # | Qué falta | Por qué no se ha cerrado |
|---|---|---|
| B8 | La tarjeta emergente de un mensaje | Necesita el stack en marcha para separar «no llega el evento» de «llega y no se pinta». Arreglarlo a ciegas sería adivinar |
| C6 | Repaso visual a 375 px | Se necesita un navegador. La auditoría estática ya descartó tablas y rejillas; lo que queda es mirarlo |
| E1 | 139 diagnósticos de Biome | El **formato** está cerrado (0 archivos sin formatear). Quedan a11y y `useExhaustiveDependencies`, que son de revisar uno a uno, no de arreglar en masa |
| A1 | Su prueba e2e | Pasa por PRAX de verdad —crear con plantilla habla con Gemini— y la clave está sin presupuesto (mismo bloqueo que R7 de `PLAN-REDISENO.md`). B6 sí se cerró el 2026-09-11: no necesitaba modelo, solo el stack, que ese día se pudo levantar |

---

# A — La organización activa

## A1 🔴 ✅ Un proyecto creado por PRAX cae SIEMPRE en la organización personal

**Dónde:** `apps/frontend/commons/template/apply.ts:78`

```ts
proyecto = await api.post<Project>('/projects', {
  name: plantilla.nombre,
  ...(plantilla.descripcion ? { description: plantilla.descripcion } : {}),
});
```

No manda `organizationId`. `POST /projects` sin ese campo usa la organización
personal (trampa 17 de `CLAUDE.md`), así que el proyecto se crea **donde no lo
estás mirando**, con el selector puesto en otra.

**Es exactamente el fallo reportado.** Y ya se había arreglado una vez por el
otro camino: `PraxCreateProjectTrigger` lleva el aviso escrito —«sin esto el
proyecto caía SIEMPRE en tu organización personal»— y el formulario manual sí
manda el campo. La ruta de la plantilla se quedó sin ese arreglo.

**Consecuencia de segundo orden, y es la que confunde:** la cuota de 3 proyectos
del plan FREE se cuenta por organización. Creando por PRAX se llena la personal
mientras la pantalla enseña la del equipo, así que el 402 dice «ya tienes 3»
sobre una organización distinta de la que se mira.

**Repro:** selector en una organización que no sea la personal → «Crear con
PRAX» → aceptar la plantilla → el proyecto no sale en la lista ni en el árbol
lateral (los dos filtran por `organizationId`), pero sí al cambiar a la personal.

**Arreglo:** `aplicarPlantilla(plantilla, organizationId)`; el identificador ya
lo tiene resuelto quien la llama (`crearProyectoDesdePlantillaAction` ←
`loadPrivateChrome()`), no la cookie en crudo. Ver A3.

- [x] Arreglado
- [ ] Prueba e2e que afirme en qué organización cae

## A2 🟠 ✅ `commons/template/draft.ts` y `commons/assistant/actions.ts` leen la cookie en crudo

**Dónde:** `commons/template/draft.ts:54` y `commons/assistant/actions.ts:206`

```ts
const organizationId = await getOrganizacionActiva();
```

`getOrganizacionActiva()` es **la cookie sin comprobar**. Su propio JSDoc lo
dice: *«Casi nunca es lo que quieres»*. Lo que quiere una pantalla es
`organizacionActivaId` de `loadPrivateChrome()`, que aplica
`resolverOrganizacionActiva` y repliega a la personal si la cookie apunta a una
de la que ya te fueron (trampa 21 de `CLAUDE.md`).

**Qué muerde:** con una cookie caducada, la barra lateral enseña la personal —ya
replegó— y el asistente manda la organización vieja. El gateway responde **403
`NOT_IN_ORG`** y la pantalla dice «no se pudo hablar con PRAX» sin más. Y la
cuota de IA se cuenta en `(persona, organización, mes)`: se está pidiendo cobrar
en un cubo que ya no existe.

Son los **dos únicos** consumidores de `getOrganizacionActiva()` fuera del
propio `resolver`.

**Arreglo:** pasar el identificador ya resuelto desde quien renderiza. Las dos
son funciones de servidor llamadas desde acciones que ya pueden pedir
`loadPrivateChrome()`.

- [x] `draft.ts`
- [x] `assistant/actions.ts`

## A3 🟠 ✅ `dashboard-front/src/app/actions.ts` es un `createProjectAction` duplicado, muerto y sin organización

**Dónde:** `apps/frontend/dashboard-front/src/app/actions.ts:28`

Copia entera de la de `projects-front` —incluidas `borradorDePlantillaAction` y
`crearProyectoDesdePlantillaAction`— **sin un solo consumidor** en la zona
(`grep` sobre todo `dashboard-front/src`: cero). Y crea sin `organizationId`,
igual que A1.

Es una mina: la próxima pantalla de esa zona que quiera crear un proyecto la
importará porque está ahí, y reestrenará A1.

**Arreglo:** borrar el archivo. Lo compartido ya vive en `commons/template`.

- [x] Borrado

## A4 🟡 ✅ `CreateProjectSlideOver` está exportado desde `commons` y no lo usa nadie

**Dónde:** `commons/organisms/CreateProjectSlideOver/`, exportado en
`commons/organisms/index.ts:13`

Sin consumidores, y tampoco manda `organizationId`. Misma mina que A3, pero
publicada desde `commons`, que es peor: sale en el autocompletado de las siete
zonas.

- [x] Borrado o corregido y usado

## A5 🟡 ✅ Cambiar de organización solo repara la ruta si estás en un proyecto

**Dónde:** `commons/organisms/AppLayout/OrgSwitcher.tsx:67`

```ts
function elegir(id: string) {
  document.cookie = `praxis_org=${id}; …`;
  if (window.location.pathname.startsWith('/projects/')) {
    window.location.href = '/projects';
  } else {
    window.location.reload();
  }
}
```

Solo `/projects/:slug` se considera «ruta de un recurso de la organización
anterior». Quedan fuera al menos:

- `/chat/proyecto/:projectId` — sigues en el chat de un proyecto de la
  organización que acabas de dejar. La lista lateral ya no lo enseña (se filtra
  por `organizationId`) pero la conversación se queda abierta.
- `/reports/:id`
- `/main/team` y `/main/billing` — se recargan y sí cambian de organización, así
  que estos van bien por casualidad.

**Arreglo:** una lista de prefijos «pertenecen a un recurso» en vez de una
comparación suelta, o recargar siempre a la raíz de la zona.

- [x] Arreglado

## A6 🟡 ✅ El comentario del listado de proyectos afirma lo contrario de lo que hace el código

**Dónde:** `projects-front/src/app/(private)/page.tsx:32-35`

```ts
// Nota: NO filtramos por organizationId en el listado — el backend ya filtra
// por el usuario autenticado. Filtrar por org excluía proyectos de otras orgs
// que el usuario también puede ver.
…
if (organizacionActivaId) params.set('organizationId', organizacionActivaId);
```

El comentario describe el comportamiento **anterior a la etapa de la
organización activa** y contradice la línea 48, que es lo correcto hoy (I1 del
plan: la organización es un filtro que se **suma**). No cambia el
comportamiento; cambia lo que va a creer quien lo lea, y esa prosa es la mitad
del valor del repositorio.

- [x] Reescrito

---

# B — El chat y los avisos

> Los cinco primeros salen del mismo commit: `ac4caf1` («UI: Refine sidebar
> navigation, remove legacy items, add Inbox tab»), que quitó las entradas
> `/chat` y la bandeja de `APP_NAV_ITEMS` **sin tocar el código que las
> alimentaba**.

## B1 🔴 ✅ La insignia de mensajes sin leer no se enseña en ningún sitio

**Es el fallo reportado.** Y la cadena entera sigue viva, calculando un número
que se tira:

| Paso | Dónde | Qué hace |
|---|---|---|
| 1 | `commons/auth/nav.ts:74` | `loadChatUnreadCount()` pide `/me/chats` y `/me/chats/projects` **en cada carga de cada zona** |
| 2 | `commons/auth/nav.ts:111` | `if (item.href === CHAT_HREF …) return { …item, badge }` — `CHAT_HREF = '/chat'` |
| 3 | `navigation.tsx` | **No existe ninguna entrada con `href: '/chat'`.** La borró `ac4caf1` |
| 4 | `AppShell.tsx:331` | `useMessageCount(navItems.find(i => i.href === HREF_DE_MENSAJES)?.badge ?? 0, …)` → siempre siembra **0** |
| 5 | `AppShell.tsx:336` | `navItems.map(i => i.href === HREF_DE_MENSAJES ? {…} : i)` → **no casa nunca** |
| 6 | `AppShell.tsx:419` | El botón «Chat» de las pestañas **no tiene insignia**: se pintó sin ella |

El `href` es el emparejamiento, y el propio comentario de `nav.ts:20` lo avisa:
*«un desajuste no da error, simplemente deja la insignia a cero para siempre»*.
Pasó lo que decía.

Coste añadido: dos peticiones de red por carga de página, en las siete zonas,
para un número que nadie pinta.

**Arreglo:** la insignia agregada va **en el botón de la pestaña «Chat»**, que es
donde ha ido a parar la sección. `useMessageCount` sirve tal cual; lo que sobra
es el emparejamiento por `href` de `nav.ts` y de `AppShell`. Ojo a la simetría
con B2: la misma decisión hay que tomarla para «Bandeja de entrada».

- [x] Insignia en la pestaña «Chat»
- [x] `CHAT_HREF` / `HREF_DE_MENSAJES` retirados o reapuntados
- [x] Decidido si `loadChatUnreadCount` sigue en `loadPrivateChrome` (sí, si
      siembra la insignia; si no, se quitan las dos peticiones)

## B2 🔴 ✅ La pestaña «Bandeja de entrada» está SIEMPRE vacía: el filtro que manda da 400

**Dónde:** `AppShell.tsx:1414`

```ts
const unreadParam = mostrarTodos ? '' : '&unread=true';
fetch(`${zonePath}/api/gateway/me/notifications?limit=30${unreadParam}`)
```

El DTO declara **`unreadOnly`**, no `unread`
(`contracts/src/notifications/notification.dto.ts:149`), y el gateway arranca con
`whitelist: true, forbidNonWhitelisted: true` (`gateway/src/main.ts:48-50`). Un
campo de más es **400** — es literalmente la primera regla de «Reglas al escribir
un fetch» de `CLAUDE.md`.

Y el 400 se traga en silencio: `body?.data?.items || []` sobre un cuerpo de error
da lista vacía, así que la pestaña dice **«Nada nuevo por aquí»** con la bandeja
llena. «Sin leer» es la vista por defecto.

`commons/auth/nav.ts:48` lo escribe bien (`unreadOnly=true`) — el contador global
sí funciona. Solo falla la pestaña.

**Repro:** con avisos sin leer, abrir la pestaña «Bandeja de entrada» → «Nada
nuevo por aquí». Pulsar «Todos» → aparecen. La red enseña un 400.

- [x] `unread` → `unreadOnly`
- [x] Que un cuerpo `{ success: false }` deje de leerse como lista vacía

## B3 🟠 ✅ La bandeja lateral no escucha el flujo en vivo y no marca nada como leído

**Dónde:** `AppShell.tsx:1406-1436`

`SidebarInboxList` no tiene ni un `useLiveEvent('aviso', …)` ni un
`useReconnection`. Solo vuelve a pedir al alternar «Sin leer / Todos». Un aviso
que llega mientras la pestaña está abierta **no aparece**, aunque la tarjeta
emergente de `LiveNotices` sí salte por el mismo evento.

Y pulsar una fila navega sin marcarla leída, así que el contador global no baja.

- [x] `useLiveEvent('aviso')` + `useReconnection`
- [x] Marcar leído al pulsar

## B4 🔴 ✅ El botón de la tarjeta de un aviso lleva a una página que redirige a otra parte

**Dónde:** `LiveNotices.tsx:16` y `dashboard-front/src/app/(private)/page.tsx`

```ts
const BANDEJA_DE_AVISOS = '/main#avisos';
```

Su comentario dice que el ancla `id="avisos"` la pone `dashboard-front`. **Ya no
la pone nadie:** `grep 'id="avisos"'` sobre todo `apps/frontend` solo encuentra
ese comentario. Y la raíz de `/main` es hoy un `useEffect` que hace
`window.location.replace('/projects')`.

O sea: pulsar «Ver» en la tarjeta de cualquier aviso de automatización te manda a
`/main`, que rebota a la lista de proyectos. Nada que ver con el aviso.

Lo mismo en `SidebarInboxList.getHref` (`AppShell.tsx:1491`), que devuelve
`/projects` para todo aviso sin proyecto.

**Arreglo:** el destino de un aviso de bandeja es la pestaña «Bandeja de entrada»
del sidebar, no una URL. O se le da una pantalla real a la bandeja y `/main`
deja de ser un rebote.

- [x] Destino decidido y aplicado en los dos sitios

## B5 🟠 ✅ El directorio de chats solo existe mientras su pestaña está montada

**Dónde:** `AppShell.tsx:482`

```tsx
{activeTab === 'chat' && <SidebarChatList … />}
```

Es literalmente lo que se pidió que no pasara: *«aunque no siempre esté visible,
siempre debería estar cargada»*. Con la pestaña en «Inicio» o «Bandeja», la lista
está **desmontada**, así que:

- sus suscripciones `useLiveEvent('chat.mensaje')` y `('chat.leido')` no existen;
- las burbujas por conversación no se acumulan: al volver a la pestaña se pide
  todo de cero y se ve un esqueleto;
- el `search` y la posición del desplazamiento se pierden en cada ida y vuelta.

**Arreglo:** montar siempre y **ocultar con CSS** (`hidden`), o subir el estado
(la lista y los no leídos) a un proveedor por encima de las pestañas. La segunda
es la que además da la insignia agregada de B1 sin volver a pedir nada.

- [x] Montada siempre

## B6 🔴 ✅ Una conversación con alguien de tu organización responde 404 si no compartís proyecto

**Dónde:** `chat-front/src/app/(private)/(conversaciones)/[peerId]/page.tsx:84`

```ts
const comun = contactos.find((c) => c.userId === peerId)?.proyectos ?? [];
if (comun.length === 0 && !isAdmin && safePage.items.length === 0) return notFound();
```

**El frontend sigue aplicando la regla vieja.** D5/B7/B8 del plan la cambiaron el
2026-08-28: la puerta del chat privado pasó de «compartís proyecto» a «compartís
organización», y el gateway ya lo hace
(`DirectChatController.puedeHablarCon` → `QuotaService.compartenOrganizacion`).

El backend es explícito sobre este caso, con su comentario puesto:

> *Alguien de tu equipo con quien todavía no compartes ningún tablero sale con la
> lista de proyectos vacía, que es la verdad: podéis hablar porque estáis en el
> mismo equipo, no porque trabajéis en lo mismo.*
> — `gateway/src/projects/direct-chat.controller.ts:149`

Es decir: `GET /me/chats/contacts` **te devuelve** a esa persona, la pantalla te
deja elegirla, y al abrirla el propio frontend responde 404. Justo el roce que D5
venía a quitar.

**Repro:** invitar a alguien a la organización sin meterlo en ningún proyecto →
`/chat` lo ofrece en el buscador → pulsarlo → «no encontrado».

- [x] La comprobación se retira (la puerta es del gateway)
- [x] Prueba e2e: compañero de organización sin proyecto en común (`15-chat.spec.ts`,
      «compañeros de organización sin proyecto en común SÍ tienen conversación
      privada» — mete a alguien en la organización personal del dueño sin
      proyecto de por medio y confirma el 201, no el 403 de la regla vieja)

## B7 🟠 ✅ El compositor se bloquea con la misma regla vieja

**Dónde:** `chat-front/src/components/organisms/DirectConversation/DirectConversation.tsx:84`

```ts
const canWrite = proyectosEnComun.length > 0 || isAdmin || page.items.length > 0;
```

Misma causa que B6, un piso más abajo. Si se arregla B6 sin esto, la conversación
abre y el compositor sale apagado sin decir por qué.

- [x] `canWrite` derivado de compartir organización

## B8 🟡 ⬜ La tarjeta emergente de un mensaje: por qué puede no salir

Reportado: *«no se muestran las toast de nuevas notificaciones de chat si no
estás en el chat»*. La cadena se leyó entera y **el reparto es correcto**: el
servicio de proyectos reparte a todos los participantes del canal
(`event-dispatcher.service.ts:175`), el gateway resuelve el nombre y reemite
(`notifications-stream.service.ts:223`), `LiveSource` vive en `AppShell` —o sea
en las siete zonas— y `LiveNotices` filtra solo por `mio`, `silenciado` y
`mismaVista`, que están bien.

Quedan **tres sospechas**, y ninguna se cierra sin el stack en marcha:

1. **La ventana del `dynamic`.** `LiveNotices` se carga con `ssr: false`
   (`AppShell.tsx:48`). Entre hidratar y que llegue el trozo con `motion`, un
   evento **no saca tarjeta**. Está documentado como coste asumido, pero ese
   trozo son 82 KB y en una zona recién cargada la ventana no es corta.
   `LiveSource` sí está montado desde el principio, así que el evento llega y
   nadie lo escucha todavía.
2. **El sonido no arranca sin un gesto previo.** `AudioContext` nace suspendido.
   Si además no sale tarjeta por (1), el aviso es completamente mudo.
3. **`useCurrentTheme()`** alimenta `fill: RELLENO_POR_TEMA[tema]`. El modo claro
   se retiró (`getTheme()` devuelve siempre `'dark'`, ver E5): conviene confirmar
   que ese `fill` sigue resolviendo y no deja la píldora transparente.

**Cómo cerrarlo:** stack levantado, dos sesiones, una en `/projects` y otra en
`/chat/<peer>`. En la primera, un `console.count` temporal dentro del manejador
`chat.mensaje` de `LiveNotices` separa «no llega el evento» de «llega y no se
pinta». Es la única forma de no arreglar a ciegas.

- [ ] Reproducido con el stack en marcha
- [ ] Causa aislada (evento vs. pintado)

## B9 🟡 ✅ La cabecera del selector muestra un plan y la sección de chat no distingue leído de no leído

**Dónde:** `AppShell.tsx:1252-1352`

En las filas del directorio, las clases quedaron así tras el rediseño monocromo:

```tsx
className={`… ${activo ? 'text-white' : 'text-white'}`}
className={`… ${!c.ultimo && !activo ? 'text-white' : 'text-white'}`}
```

Ternarios que devuelven lo mismo en las dos ramas: la distinción se escribió y se
perdió en la sustitución de paleta. El nombre, el resumen y la hora tienen el
mismo peso y el mismo color, activo o no. Lo único que separa una conversación
con mensajes nuevos es la burbuja del contador.

Ocho ternarios así en tres archivos, más 24 `text-white hover:text-white`. Ver E4.

- [x] Jerarquía restaurada con los tokens (`text-text-secondary`, opacidades)

---

# C — Móvil

## C1 🔴 ✅ Desde el móvil no se puede llegar a ningún chat ni a la bandeja

**Dónde:** `AppShell.tsx:559-616` (el cajón móvil) y `AppShell.tsx:391-465` (las
pestañas)

El cajón móvil contiene **solo** `OrgSwitcher` + `NavList` + `UserCard`. Las tres
pestañas —Inicio, Chat, Bandeja— y con ellas `SidebarChatList`,
`SidebarInboxList` y `SidebarProjectsTree` viven dentro del `<aside className="hidden … md:flex">`, o sea **solo en escritorio**.

Y `APP_NAV_ITEMS` ya no tiene entrada `/chat` (B1). Sumando las dos: en un
teléfono **no hay un solo enlace hacia una conversación** en toda la aplicación.

La única puerta que queda es escribir `/chat` a mano, que lleva a C2.

- [x] Las pestañas y sus listas, también en el cajón móvil

## C2 🟠 ✅ `/chat` en móvil no enseña tus conversaciones, enseña un buscador de contactos

**Dónde:** `chat-front/src/app/(private)/(conversaciones)/page.tsx`

```ts
const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);
if (!isMobile && recordada) { … redirect(`/${recordada}`) }
```

En escritorio redirige a la última conversación; en móvil se queda y pinta
`ChatSearch` sobre `/me/chats/contacts` — que es **con quién puedes hablar**, no
con quién ya hablas. Ni el último mensaje, ni los no leídos, ni el orden por
actividad.

Con C1, esa es toda la experiencia de mensajería en un teléfono.

Dos problemas más en el mismo archivo:

- **Se decide por `user-agent`.** Sniffing en un Server Component: falla en una
  ventana estrecha de escritorio y en una tableta, y no hay forma de que el CSS
  lo corrija después.
- Los comentarios del archivo son notas dubitativas de trabajo («podría ser un
  problema, pero ahora el sidebar está en el AppShell»), no prosa del
  repositorio. `zonePath = '/chat'` está a mano con un `// Obtenemos zonePath
  desde la cabecera x-invoke-path o asumiendo el default` encima.

- [x] `/chat` sin conversación enseña la lista de conversaciones en móvil
- [x] Fuera el sniffing de `user-agent`

## C3 🟠 ✅ «Conversaciones», la única salida de un chat a pantalla completa, no lleva a las conversaciones

**Dónde:** `DirectConversation.tsx:96` y `ProjectConversation.tsx:110`

`pantallaCompletaEnMovil` posiciona el panel `max-md:fixed max-md:inset-0`, y su
JSDoc lo avisa: *«quien lo active tiene que dar una salida visible: sin ella, en
móvil no habría forma de volver»*. La salida es `<a href="/chat">Conversaciones</a>`,
que era correcta cuando `/chat` alojaba el `ChatDirectory` — y desde `ac4caf1` ya
no. Cae en C2.

- [x] La salida lleva a una lista de conversaciones de verdad

## C4 🟠 ✅ `h-screen` y `100vh` en el armazón y en el chat

**Dónde:** `AppShell.tsx:342` (`flex h-screen overflow-hidden`),
`chat-front/(conversaciones)/layout.tsx:18` (`h-[calc(100vh-7rem)]`),
`AppShell.tsx:1362,1498` (`max-h-[calc(100vh-200px)]`)

`100vh` en móvil incluye la barra de direcciones del navegador. Con
`overflow-hidden` en el contenedor raíz, lo que sobresale **no se puede
desplazar**: el compositor del chat se queda debajo del borde.

`h-dvh` / `100dvh` es lo que corresponde. Además el chat calcula el alto a mano
(`-7rem`) teniendo `AppHeader lleno`, que existe justo para eso y lleva su aviso
escrito: *«un cálculo que se rompe en cuanto cualquiera de los tres cambia»*.

- [x] `h-screen` → `h-dvh` en el armazón
- [x] El chat pasa a `AppHeader lleno` en vez de calcular

## C5 🟡 ⬜ Las pestañas del sidebar desaparecen al plegar la barra

**Dónde:** `AppShell.tsx:391` — `{!plegada && ( …las tres pestañas… )}`

Plegada, no hay pestañas pero **sí se sigue renderizando el contenido de la que
estuviera activa**. Si quedó en «Chat», la barra plegada enseña una columna de
avatares sin forma de volver a «Inicio». No es móvil, pero es el mismo hueco de
navegación.

- [x] Pestañas accesibles plegada, o repliegue a «Inicio»

## C6 🟡 ⬜ Repaso visual pendiente en anchos pequeños

C10 del plan de la organización activa sigue sin marcar. Lo que la auditoría
estática **sí** puede descartar: las cuatro tablas del producto están envueltas
en `overflow-x-auto` (`RolesPanel`, `MembersPanel`, `PlanCatalog`, `BoardTable`)
y las rejillas llevan variantes `sm:`/`md:` salvo tres —`ProfileForm`,
`BoardCalendar`, `SelectorDeFecha`, `ProposalCard`— que conviene mirar a 375 px.

Lo que **no** se puede descartar sin abrirlo: el tablero, el panel de tarea y el
portal de organización.

- [ ] Repaso a 375 px de: tablero, panel de tarea, `/main/team`, `/main/billing`
- [ ] `ProfileForm`, `BoardCalendar`, `SelectorDeFecha`, `ProposalCard`

---

# D — Rendimiento y carga

## D1 🔴 ✅ El árbol de proyectos hace N+1 peticiones en serie, cada 30 s, en las siete zonas

**Dónde:** `AppShell.tsx:827-865`

```ts
const listBody = await fetch(`…/projects?${params}`);   // 1
for (const p of items) {
  const detail = await fetch(`…/projects/${p.id}`);      // + una por proyecto, EN SERIE
}
```

`limit: '50'`, así que hasta **51 peticiones encadenadas** para pintar la barra
lateral. Y se repite:

- al montar, en **cada carga de página** (que en Multi-Zones es cada cambio de
  zona);
- **cada 30 segundos** por `setInterval` (`AppShell.tsx:930`);
- **en cada `focus` de la ventana** (`AppShell.tsx:937`).

Todo eso solo para leer `workspaces` de cada proyecto. Con el limitador del
gateway por medio, es el candidato número uno a 429 espontáneos en el resto de la
aplicación.

**Arreglo, por orden de coste:** que `GET /projects` devuelva los espacios
(una línea en el backend, y hay precedente: ya devuelve `iconKey` y `color`); o
como mínimo `Promise.all` en vez del bucle `await`, subir el intervalo y
resolver los detalles solo de los proyectos desplegados.

- [x] Bucle en serie eliminado
- [x] Polling revisado

## D2 🟠 ✅ Cada mensaje de chat provoca tres peticiones de la barra lateral

**Dónde:** `AppShell.tsx:1215-1216`

```ts
useLiveEvent('chat.mensaje', () => fetchChats());
useLiveEvent('chat.leido', () => fetchChats());
```

`fetchChats` pide `/me/chats`, luego `/me/chats/projects` (en serie), luego
`/users?ids=…`. Sin agrupar ni retrasar. En un chat de proyecto activo,
`chat.leido` se dispara **con cada mensaje que llega mientras lo miras**, así que
son ~6 peticiones por mensaje.

`useMessageCount` ya resolvió este mismo problema con una ventana de 2,5 s
(`ESPERA_DE_RECONCILIACION_MS`) y su razón escrita. La lista lateral no la usa.

- [x] Agrupado con la misma ventana
- [x] Las dos peticiones en paralelo

## D3 🟡 ✅ `PersonRow` y `ProjectRow` se redefinen en cada render

**Dónde:** `AppShell.tsx:1305` y `1249`

Están declarados **dentro** de `SidebarChatList`, así que su identidad de tipo
cambia en cada render: React desmonta y vuelve a montar **todas** las filas al
teclear en el buscador o al llegar cualquier mensaje. `PersonRow` llama a
`usePresence`, que se reinicia con ellas.

Además, filtrar devolviendo `null` desde dentro de la fila deja los encabezados
«Proyectos» y «Privados» visibles sobre cero resultados.

- [x] Componentes fuera del cuerpo
- [x] Filtrado antes de mapear

---

# E — Higiene

## E1 🟡 ✅ 225 diagnósticos de Biome en `apps/frontend`

`npx biome check apps/frontend`:

| Regla | Nº |
|---|---|
| `a11y/noSvgWithoutTitle` | 46 |
| **`format`** (archivos sin formatear) | **64** |
| `a11y/useSemanticElements` | 15 |
| `a11y/useButtonType` | 15 |
| `correctness/useExhaustiveDependencies` | 15 |
| `style/noNonNullAssertion` | 14 |
| `a11y/useKeyWithClickEvents` | 9 |
| `a11y/noLabelWithoutControl` | 9 |
| resto | 22 |

`CLAUDE.md` dice que `pnpm format` ya no reescribe el repo. **Ya no es cierto**:
64 archivos están sin formatear, casi todos de los commits «UI: …» y del
rediseño. Y dos de los `useExhaustiveDependencies` son justo los del árbol de
proyectos de D1.

⚠️ **Formatear y arreglar bugs no van en el mismo commit.** El `format` primero y
solo, o el diff de los arreglos se vuelve ilegible.

- [x] `pnpm format` en un commit propio
- [ ] `useExhaustiveDependencies` revisados uno a uno (no silenciados)

## E2 🟡 ✅ `SidebarChatList` y `SidebarInboxList` no usan el cliente de la casa

**Dónde:** `AppShell.tsx:1164-1207`, `1411-1435`

`fetch` a pelo + `res.json()` + `body?.data?.items || []` + `any` por todas
partes, en vez de `createApiClient({ gatewayPath })`, que ya desenvuelve
`{ success, data, meta }` y convierte un error en `ApiError`. Es lo que deja
pasar B2 sin un solo síntoma.

- [x] Migrados a `createApiClient`
- [x] `any` tipados

## E3 🟡 ✅ La tabla de textos de aviso está duplicada y ya divergió

`LiveNotices.describir()` (`LiveNotices.tsx:355-415`) y
`SidebarInboxList.getTitle()` (`AppShell.tsx:1445-1489`) son dos `switch` sobre
los mismos 16 `NotificationType`, con redacciones distintas. Y `getHref` duplica
`destinoDeAviso` — solo que uno usa `projectHref({ slug })` y el otro construye
`/projects/${n.projectId}` con el **UUID** a mano, que es exactamente lo que
`CLAUDE.md` prohíbe («para enlazar a un proyecto usa los helpers, nunca la
plantilla a mano… ya se coló en cinco sitios»).

- [x] Una sola tabla en `commons`
- [x] `projectHref` en los dos sitios

## E4 🟡 ✅ La sustitución de paleta dejó ternarios y hovers que no hacen nada

985 `text-white` en `apps/frontend`, de los cuales 8 son ternarios idénticos en
las dos ramas y 24 son `text-white hover:text-white`. Frente a 28 usos totales de
`text-text-secondary` / `text-muted` en todo el frontend.

Es el fallo que `CLAUDE.md` documenta con el caso `etiqueta → tag`: una
sustitución global compila, no da un error y **rompe la prosa** —aquí, la
jerarquía visual— en decenas de archivos. Ver B9 para el síntoma que se reporta.

- [x] Inventario de dónde hacía falta un segundo tono
- [x] Restaurado con tokens, sin otra sustitución global

## E5 🟡 ✅ `CLAUDE.md` describe un modo claro que ya no existe

`theme/theme.ts` es hoy:

```ts
export async function getTheme(): Promise<ThemeName> {
  return DEFAULT_THEME;
}
```

El modo claro se retiró en `2aae679`. La sección «Estilos» de `CLAUDE.md` sigue
describiendo la cookie `praxis_theme`, los dos selectores y `ThemeToggle` como si
funcionaran. Quien lo lea va a construir sobre algo dormido.

- [x] Sección «Estilos» al día
- [ ] Decidido: se recupera el modo claro o se retira su código

## E6 🟢 ✅ Siete commits fuera de convención

`398ba09`, `ac4caf1`, `dad390d`, `8e3cdde`, `1c8e300`, `83462d4`, `aa728e0`
están en inglés y sin tipo de Conventional Commits («UI: …», «Fix: …»,
«Redesign changes from previous agent»). `commitlint.config.cjs` los habría
rechazado, pero no hay husky. Nada que arreglar hacia atrás; se anota porque son
justo los commits donde vive la mitad de esta auditoría, y encontrarlos costó.

---

## Orden propuesto

Por relación entre coste y daño. Cada bloque termina con una comprobación manual
antes de pasar al siguiente.

| # | Qué | Hallazgos | Por qué aquí |
|---|---|---|---|
| 1 | La organización de un proyecto creado por PRAX | A1, A2, A3, A4 | Es el fallo que corrompe datos: proyectos en la organización equivocada, y eso no se deshace solo |
| 2 | El chat privado por organización | B6, B7 | El backend ya lo hace; el frontend le está negando el paso a gente que sí puede pasar |
| 3 | La bandeja y las insignias | B1, B2, B3, B4 | Cuatro arreglos pequeños que devuelven cuatro cosas que hoy no existen |
| 4 | El móvil | C1, C2, C3, C4 | Sin esto, la mensajería en un teléfono no está |
| 5 | Reproducir la tarjeta emergente | B8 | Necesita el stack; hasta entonces no se toca |
| 6 | Carga | D1, D2, D3 | Grande, pero no cambia comportamiento y se puede medir |
| 7 | Higiene | B5, B9, E1–E5 | Después, y el formato en su commit aparte |

## Cómo verificar

```bash
pnpm docker:up && pnpm build:shared && pnpm prisma:generate
pnpm prisma:deploy && pnpm prisma:seed
pnpm dev:backend          # solo el backend: las 9+8 a la vez agotan descriptores
pnpm dev:frontend
```

Y al terminar cada bloque:

```bash
npx biome check apps/frontend            # que no suba el número
pnpm --filter @praxis/chat-front exec tsc --noEmit
pnpm e2e:regresion                       # antes de dar nada por cerrado
```

⚠️ `pnpm e2e:regresion` sigue **sin correrse** desde la etapa de la organización
activa (C9 de aquel plan, aún en ⬜). Se espera rojo en las pruebas que afirmaban
la regla vieja del chat privado; cualquier otro rojo es de verdad.

---

## Registro

| Fecha | Qué | Commit |
|---|---|---|
| 2026-09-03 | Auditoría abierta sobre `beb858d`. 30 hallazgos, ninguno arreglado todavía | — |
| 2026-09-03 | **Bloques 1-4, 6 y 7 aplicados: 27 de 30.** La organización en las tres rutas de creación, el chat privado por organización, las dos insignias con su pestaña, la bandeja lateral (el 400, el tiempo real, marcar leído, el destino), el móvil (pestañas en el cajón, índice sin sniffing, `dvh`), el N+1 del árbol lateral, y la higiene: dos módulos muertos fuera, la tabla de avisos unificada, la jerarquía tipográfica restaurada y `apps/frontend` formateado | *(pendiente de commit)* |

### Lo que se verificó al cerrar

✅ **`tsc --noEmit` en las ocho zonas**, limpio.
✅ **`pnpm test`**: 16 tareas, 64 pruebas del gateway, todo verde.
✅ **`biome check apps/frontend`**: de **225** diagnósticos a **139**; los 70
archivos sin formatear, a **cero**; a11y de 103 a 94 como efecto lateral de
reescribir esos componentes.
⬜ **`pnpm e2e:regresion` no se ha corrido** — sigue siendo C9 del plan de la
organización activa, y esta tanda le añade motivos: las pruebas que afirmaban la
regla vieja del chat privado (proyecto en común) **deben** ponerse en rojo.
