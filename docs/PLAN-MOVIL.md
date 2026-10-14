# Plan móvil — Praxis como app, no como web encogida

> **Etapa en curso** desde el 2026-10-05, en la rama local `feature/movil`.
>
> 🔴 **No se sube nada a `main` hasta el final.** Es un cambio transversal que
> toca el armazón de todas las pantallas, y se valida entero antes de llegar a
> nadie: pruebas de usabilidad en escritorio y en móvil, y la suite e2e
> completa —la de siempre, la nueva de móvil y la de regresión—. Ver «Cómo se
> cierra».
>
> Aparca, por decisión del dueño, lo que quedaba abierto: P3/P4 de
> `PLAN-PRO-INTEGRACIONES` y M7 de `PLAN-MCP`.

---

## El encargo, literal

> «Rediseñar todo el aspecto en móvil para ser app-like. Planeo que el uso sea
> tal cual como el de una app de móvil, que se sienta prácticamente nativa, así
> como convertirla en PWA de forma que tenga service worker y pueda funcionar
> bajo caché. Es comprensible que no todas las funciones de desktop estén en la
> móvil por el espacio tan pequeño, pero debes hacer la mejor adaptación posible
> **sin afectar el visual actual de desktop**.»

La última frase es la restricción que manda sobre todas las demás: ver I1.

---

## Qué hay hoy, medido en el código

- **Instalable, pero sin service worker.** `src/app/manifest.ts` declara la app
  y sus iconos, y `useInstallPrompt` captura `beforeinstallprompt` para el botón
  de la landing. No hay `sw.js` ni registro: sin red, la app instalada no abre.
- **El móvil es el escritorio encogido.** Solo nueve ficheros tienen una regla
  propia por debajo de `md`. La navegación es un cajón a pantalla completa que
  se abre con una hamburguesa flotante (`AppHeader`); el tablero, el calendario,
  la tabla y el panel de tarea son los de escritorio con menos ancho.
- **Serwist no vale aquí.** Es lo que recomienda la guía de PWA de Next 16
  (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`),
  pero exige webpack y aquí se compila con Turbopack.
- **`experimental.viewTransition` existe, pero es global.** Anima todas las
  navegaciones de App Router, también las de escritorio (ver D9).

---

## Decisiones

**D1 — Móvil es por debajo de `md` (768 px), y punto.** Un solo corte para todo
el plan. Las tabletas en vertical (<768) son móvil; en horizontal, escritorio.
Nada de un segundo corte «tableta»: duplicaría cada decisión.

**D2 — Lo estructural se decide en el servidor, y el cliente lo confirma.**
Pintar el escritorio y cambiar a móvil al hidratar es un parpadeo en cada carga
—el mismo fallo que tuvo la barra plegada (`commons/theme/sidebar.ts`)—. El
layout lee `Sec-CH-UA-Mobile` y el `User-Agent` para la primera pintura, y
`useEsMovil()` lo corrige con `matchMedia('(max-width: 767px)')` si el ancho
real dice otra cosa (escritorio con la ventana estrecha, tableta). Lo que se
pueda resolver solo con CSS (`max-md:` / `md:hidden`) se resuelve con CSS y no
pregunta a nadie.

**D3 — El service worker se escribe a mano, en `public/sw.js`.** Sin Serwist
(webpack) ni Workbox. Son cuatro estrategias y un manifiesto de precarga corto;
escrito a mano se lee entero y no hay magia que auditar.

**D4 — Qué se guarda en caché, y qué no se guarda nunca.**

| Petición | Estrategia | Por qué |
|---|---|---|
| `/_next/static/*` | Caché primero, sin caducidad | Llevan hash en el nombre: una versión nueva es otra URL |
| Fuentes, iconos, `/icons/*`, `/media/*` | Caché primero con revalidación | Cambian poco y pesan |
| Navegaciones (HTML) | Red primero; las privadas visitadas se guardan **por persona** (M7); sin red, su copia o «Sin conexión» | Lectura sin conexión, sin que nadie vea lo de otra persona (D5, I2) |
| Todo lo demás de `/api/*`, `POST`/`PATCH`/`DELETE`, SSE, `/auth/*`, `/api/webhooks/*` | **Nunca**: pasa directo | Escrituras, sesión, flujos en vivo, Stripe |

**D5 — Una caché por usuario, y se borra al cerrar sesión.** Las copias de M7
viven en una caché cuyo nombre lleva el id de la cuenta. Cerrar sesión borra
todas las cachés de datos (mensaje al SW y `caches.delete` desde la página). En
un móvil compartido, quien entra después no puede ver nada del anterior.

**D6 — ~~Una versión nueva nunca se impone a media tarea.~~ Revisada el 2026-10-11: la actualización es forzada, sin botón.** *(Texto original:)* El SW nuevo se
instala y **espera**; la app enseña «Hay una versión nueva · Actualizar», y solo
al pulsar se hace `skipWaiting` y se recarga. Recargar solos podría tirar un
documento a medio escribir. La versión del build va **dentro** del script
—`/sw.js` lo genera un route handler estático, con URL fija— y el propio
`sw.js` lleva `Cache-Control: no-store`, para que una versión vieja no se
quede pegada. ⚠️ No por la URL (`/sw.js?v=…`): así, una pestaña abierta desde
antes del despliegue registraba su versión vieja como nueva, y «Actualizar»
hacía bajar de versión (registro de M1).

**D7 — Barra inferior de cinco pestañas: Inicio · Chat · PRAX · Avisos · Tú.**
Decidida por el dueño. Sustituye a la hamburguesa flotante. Inicio es la lista
de proyectos con su árbol; Chat, la lista de conversaciones; PRAX, el asistente;
Avisos, la bandeja a pantalla completa; Tú, el perfil, la organización y los
ajustes. ⚠️ *Revisado en M8:* **las cinco son pantallas** (Avisos y Tú fueron
hojas), la barra está **en todas las vistas** —también dentro de una
conversación— y solo se esconde con el teclado abierto.

**D8 — Cada pantalla trae su barra superior.** Título, «atrás» cuando hay de
dónde volver, y como mucho dos acciones a la derecha. Es lo que hace que una
pantalla se lea como una vista de app y no como una página. ⚠️ *Revisado en
M8:* es **una sola, en el armazón** (`BarraSuperior`), no una por pantalla: así
no falta en ninguna, no parpadea al navegar y está también mientras carga. El
título sale de la ruta (`pantallaMovil`) o de `tituloMovil` de `AppHeader`.

**D9 — Las transiciones, solo en móvil.** Una navegación hacia dentro desliza
desde la derecha y «atrás» la deshace. Si `experimental.viewTransition` puede
quedar encerrado en móvil —sus pseudo-elementos sin animación por encima de
`md`— se usa; si toca al escritorio en lo más mínimo (I1), se hace con CSS
propio en el armazón móvil y el flag no se activa. Se decide en M2 con las
capturas de referencia delante, no antes.

**D10 — Hojas en vez de paneles y menús.** Una primitiva `HojaInferior`
(arrastrar para cerrar, foco atrapado, fondo `inert`, respeta el teclado) y otra
`HojaDeAcciones`. En móvil, el panel de tarea es una hoja de altura completa,
los menús ⋯ son hojas de acciones y los diálogos, hojas inferiores. En
escritorio no cambia nada.

**D11 — Gestos que una app instalada no trae sola.** Volver deslizando desde el
borde izquierdo (iOS no lo da en una PWA instalada), y tirar hacia abajo para
refrescar en las listas. Respetan `prefers-reduced-motion`.

**D12 — Lo que no viaja a móvil, a propósito.** Panel de administración (se
dice en su lugar, no se esconde a secas), redimensionar barra y columnas de
tabla, reordenar columnas arrastrando y arrastrar tarjetas (se mueven con
«Mover a»). ⚠️ *Revisado en M6:* el editor de automatizaciones y la
facturación se planearon fuera y **se quedan**: el editor cabe en una columna
y la comparativa de planes se lee con su primera columna fija. Bloquearlos
habría quitado más de lo que protegía.

**D13 — Sin conexión es solo lectura.** Por defecto, sin respuesta del dueño a
la pregunta. Escribir sin red significa una cola, reintentos y conflictos al
reconectar: es otra etapa. Sin red, los botones de escritura se apagan con el
motivo, y una franja dice «Sin conexión · enseñando lo último que se cargó».

**D14 — Notificaciones push (cerrada por [PLAN-PUSH](PLAN-PUSH.md)).** Necesitan backend (claves
VAPID y guardar suscripciones) y, en iOS, solo funcionan instalada y desde la
16.4. Por defecto, sin respuesta del dueño. Se deja preparado el SW para
recibirlas (un `push` vacío no hace nada) y nada más.

---

## Invariantes

**I1 — El escritorio no cambia ni un píxel.** Todo lo móvil va por debajo de
`md`, o en componentes que solo se montan en móvil. Lo vigila M0: capturas de
referencia de las pantallas de escritorio **antes** de tocar nada, comparadas
en cada fase con `toHaveScreenshot`.

**I2 — Ningún dato privado sale de la caché hacia otra sesión.** D4 y D5. Lo
cubre una prueba: dos cuentas en el mismo navegador, la segunda sin red no ve
nada de la primera.

**I3 — El SW nunca intercepta escrituras, sesión, SSE ni Stripe.** Pasan por
`fetch` sin tocar. Un SW que cachea un `POST` o corta un `EventSource` rompe la
app de formas que no dan error.

**I4 — Una versión vieja siempre se puede sustituir.** D6. Si el SW se rompe, la
salida es un `sw.js` que se desregistra a sí mismo: se deja escrito y probado.

**I5 — Las zonas táctiles miden al menos 44 × 44 px, y nada depende del
`hover`.** En móvil no hay ratón: lo que solo aparece al pasar por encima (el
«+» de las celdas, los ⋯ de las filas) tiene que estar visible o en una hoja.

**I6 — Las reglas de siempre siguen valiendo.** `useAccion` para formularios,
`useRefrescoAgrupado` para refrescar, los helpers de enlaces, los tokens de
color y las del CLAUDE.md. Una pantalla móvil no es excusa para saltárselas.

---

## Fases

Cada fase se verifica antes de la siguiente —tipos, lint, las capturas de I1 y
la prueba en un móvil emulado—, se anota en el registro y se hace **commit en
local**. Ninguna se sube.

### M0 — Base y red de seguridad
- Proyecto `ui-movil` en Playwright (iPhone 14 y Pixel 7) y capturas de
  referencia de escritorio de las pantallas principales (I1).
- `viewport` con `viewport-fit=cover` e `interactive-widget=resizes-content`;
  utilidades de *safe area*.
- `useEsMovil()` (D2) y la pista del servidor en el layout privado.

### M1 — PWA de verdad
- `public/sw.js` con D4 (sin la lista blanca de datos, que es M7), registro con
  versión, flujo de actualización (D6) y pantalla «Sin conexión».
- Manifest completo: `id`, iconos `maskable`, `shortcuts`, `display_override`;
  metadatos de iOS (`appleWebApp`, barra de estado) y pantallas de arranque.
- Invitación a instalar en Android y la explicación de «Añadir a inicio» en iOS.

### M2 — Armazón de app
- Barra inferior (D7) y barra superior (D8) en el armazón móvil; fuera la
  hamburguesa flotante.
- Transiciones (D9), volver deslizando y tirar para refrescar (D11).
- Primitivas `HojaInferior` y `HojaDeAcciones` (D10).

### M3 — Proyectos y tablero
- Inicio: proyectos y su árbol como lista de app.
- Proyecto: pestañas en una barra desplazable; Ajustes en una sola columna.
- Kanban: una columna por pantalla, deslizando de lado, con las columnas en
  píldoras; «Mover a» en una hoja.
- Panel de tarea como hoja de altura completa.
- Calendario como agenda por días, y tabla como lista de tarjetas.

### M4 — Chat y PRAX
- Conversación a pantalla completa con el compositor pegado al teclado.
- PRAX con su compositor igual, y las propuestas en hojas.

### M5 — Documentos
- Editor a pantalla completa, con la barra de formato encima del teclado.

### M6 — Avisos, cuenta y ajustes
- Avisos a pantalla completa (pestaña de D7).
- «Tú»: perfil, presencia, organización, ajustes y cerrar sesión.
- Facturación, equipo e integraciones en una columna; lo de D12 explicado.

### M7 — Lectura sin conexión
- La lista blanca de D4 y la caché por usuario de D5, con borrado al salir.
- La franja «Sin conexión» y las escrituras apagadas con su motivo (D13).
- La prueba de I2.

---

## Cómo se cierra

1. Todas las fases en local, cada una con su commit y su entrada en el registro.
2. **Pruebas de usabilidad**, a mano, en escritorio y en móvil (emulado y en un
   teléfono real instalado como app): cada pantalla, cada gesto, sin red y con
   una versión nueva desplegada encima.
3. **La suite entera**: `pnpm test`, `pnpm test:int`, `pnpm e2e` (api, ui y la
   nueva `ui-movil`), `pnpm e2e:regresion` y `pnpm e2e:seguridad`, más las
   capturas de I1.
4. Solo entonces se propone subir a `main`.

---

## Registro

| Fase | Estado | Commit | Notas |
|---|---|---|---|
| M0 | ✅ | (este) | Diez capturas de escritorio de referencia (`e2e/tests/ui/00-escritorio-capturas.spec.ts`), estables en tres corridas; tapan correo, nombre derivado, monograma y fechas cortas. Proyectos `movil-android` y `movil-iphone` (`pnpm e2e:movil`); el de iPhone es Chromium con medida de iPhone, no Safari. `viewport-fit=cover` + `interactive-widget`, utilidades `pt-safe`…, `getEsMovilInicial()` y `useEsMovil()`. ⚠️ `/main/settings` redirige a `/projects`: no es una pantalla que capturar |
| M1 | ✅ | (este) | SW a mano en `src/service-worker/sw.js`, servido por `src/app/sw.js/route.ts` (estático, `VERSION` dentro). Registro y aviso «Actualizar» en `RegistroDelServiceWorker`, solo en producción. `/sin-conexion` precargada **sin `<script>`** (con ellos, el router hidrataría otra ruta sin red). Manifest con `id`, `maskable`, `shortcuts`; `appleWebApp` con barra translúcida y ocho pantallas de arranque. `InvitacionAInstalar` (Android con el aviso del sistema, iOS con instrucciones). Dos fallos que salieron probando: 🔴 `controllerchange` salta también en la **primera** instalación, y recargar ahí se comía el formulario de alta —solo se recarga si se pidió—; y versionar por la URL permitía bajar de versión (ver D6). ⚠️ Playwright no intercepta la descarga del script del SW: la prueba de actualización registra otra URL en el mismo ámbito |
| M2 | ✅ | (este) | `BarraInferior` (Inicio · Chat · PRAX · Avisos · Tú) en lugar de la hamburguesa y el cajón, que se borran; se esconde al escribir y dentro de `/chat/<algo>`, y publica su alto en `--barra-inferior`. `HojaInferior` y `HojaDeAcciones` en `commons/molecules` (arrastrar para cerrar, `inert` en el fondo, foco, Escape). Avisos y Tú son hojas. **D9:** no se activa `experimental.viewTransition` (global, tocaría escritorio); la entrada es CSS encerrado en `@media (max-width: 767px)` con dirección por `popstate`/clic (`transicionDePantalla.ts`). `GestosMoviles`: volver desde el borde (no en la raíz de una pestaña) y tirar para refrescar (solo si `<main>` es quien desplaza). **D8 se aplica por pantalla en M3–M6**, no con una barra genérica: varias ya traen la suya (`ProjectHeader`, chat, PRAX) y otra encima la duplicaría. ⚠️ El `role="dialog"` es un `<div>`: `<dialog>` pelea con la animación y el arrastre. ⚠️ Playwright no arrastra con el dedo: el gesto de volver se prueba con `TouchEvent` sintéticos |
| M3 | ✅ | (este) | Inicio en móvil = `ArbolDeProyectos` (el árbol de la barra, exportado) con título grande. Kanban: una columna por pantalla con `scroll-snap` y `PildorasDeColumnas`; sin reordenar columnas ni arrastre de cabecera con el dedo (D12); «Añadir tarea» siempre visible. «Mover a…» sobre `HojaDeAcciones` (`tambienEnTableta`: la pulsación larga llega también desde una tableta). `SlideOver` sube como hoja por debajo de `sm` y respeta el notch; la barra inferior baja a `z-30` para no taparlo. Calendario → agenda (`AgendaSemana`), tabla → tarjetas con «Ordenar por»; las dos por `useEsMovil` y no CSS, para no duplicar tareas en el DOM. Menús ⋯ siempre visibles y como hoja de acciones; filas de la barra de 44 px en móvil. PRAX y Chat del proyecto como iconos (sin cambiar su nombre accesible). ⚠️ El panel «Sin fecha» cerrado era `w-0` con alto y aplastaba la agenda en columna: ahora `max-lg:hidden`. ⚠️ **Los 10 fallos de la suite `ui` de escritorio no son de esta rama**: contra una build de `main`, `03-sesion` (2) y `04-invitaciones` (1) fallan igual, `07-reglas` falla en un subconjunto distinto en cada corrida y `09-scrum` depende de la hora (también falla en `main` corrida suelta) |
| M4 | ✅ | (este) | Dentro de una conversación, sin barra, la columna reserva la zona segura de abajo (`--barra-inferior` = `env(safe-area-inset-bottom)`). 🍎 **Safari no soporta `interactive-widget`**: el teclado tapa sin encoger; `GestosMoviles` publica `--teclado` con `visualViewport` y la columna reserva `max(barra, teclado)` (en Android vale 0, la ventana ya encoge). «Conversaciones» de 44 px. Las acciones de un mensaje ya tenían pulsación larga con hoja propia (`MessageBubble`): no se tocan. Las propuestas de PRAX siguen como tarjetas en el hilo —en una columna se leen bien—: no hacía falta pasarlas a hojas. ⚠️ El ajuste del teclado de iOS **no se puede probar emulado**: va a la lista de la prueba a mano en un iPhone |
| M5 | ✅ | (este) | `BarraDeFormatoMovil`: deshacer, rehacer, títulos, negrita, cursiva, tachado, listas, tareas, cita e imagen, pegada al teclado (`bottom: var(--teclado)`), solo con el editor enfocado; `pointerdown` con `preventDefault` para no cerrar el teclado. El editor ya iba a lo ancho desde la etapa anterior. ⚠️ Un falso rojo que costó tiempo: `getByRole('navigation', { name: 'Secciones' })` casa por subcadena con «Secciones **del proyecto**»; las pruebas móviles usan `exact: true` |
| M6 | ✅ | (este) | Avisos y Tú ya eran hojas (M2). Equipo: cada miembro es un bloque en móvil (la tabla de tres columnas se desplazaba). Facturación: la primera columna de la comparativa se queda fija. Administración: aviso «desde un ordenador» en vez del panel. D12 revisada (ver arriba). ⚠️ La invitación a instalar no tiene entrada en «Tú»: tras descartarla, se instala desde el menú del navegador —pendiente de decidir si hace falta |
| M7 | ✅ | (este) | ⚠️ **Cambió el diseño:** la lista blanca de GET del gateway no servía —casi todo se pide en el servidor (Server Components)—. Se guarda el **HTML de las pantallas privadas visitadas** en `praxis-datos-<huella>` (SHA-256 del correo, que la app le dice al SW con `presentarPersona`: el SW no lee la cookie httpOnly); hasta 60 por persona. Otra persona → se borran las demás; cerrar sesión (`LogoutButton` y `PerfilEnBarra`) → `olvidarDatosSinConexion`. RSC no se guarda (depende de cabeceras del árbol); sin red el router cae a navegación dura, que sí sale de la copia. `FranjaSinConexion` en todas partes. 🔴 `navigator.onLine` miente (wifi sin salida, y en Chromium emulado da `true` en la página servida por el SW): la franja hace una sonda `HEAD /sw.js`, lo único que el SW nunca contesta de caché. ⚠️ Riesgo aceptado: si la sesión caduca sin cerrar sesión, la copia sigue en el dispositivo hasta que entre otra persona o se cierre sesión |

| M8 | ✅ | (este) | **Ajustes del dueño tras probarlo** (2026-10-06). Barra de arriba única en el armazón, con título y «atrás» en todas las pantallas (D8 revisada); la cabecera compacta del proyecto se esconde en móvil y su nombre sube a la barra. Barra inferior en todas las vistas (D7 revisada): la conversación ya no es `fixed inset-0 z-40`, llena la columna entre las dos barras y su «Conversaciones» lo sustituye el «atrás» de arriba. Más viva: píldora que se desliza al activo, icono relleno con salto, insignias con rebote, pulsar la pestaña activa sube al principio, vibración corta en Android. **Avisos y Tú son pantallas** (`/main/notifications`, `/main/me`) sin desplegables: el estado con sus opciones a la vista, la organización con sus acciones y la lista para cambiar, los ajustes como filas con flecha y «Cerrar sesión» al final; los datos los presta el armazón (`useDatosDeTu`), no se vuelven a pedir. Inicio sin la cabecera «Proyectos» y con los proyectos siempre abiertos (los espacios sí se pliegan); «Nuevo proyecto» al final de la lista. **Chat abre la lista**: la pestaña pide `?lista=1` y el servidor no redirige a la última si la pista dice teléfono; la lista es `ListaDeChatsMovil`, viva, ordenada por el último mensaje y con píldoras Todos/Equipos/Privados. El buscador cae **en el mismo píxel** en Inicio y Chat (`BuscadorDeBarra movil`, pegado arriba, 16 px para que Safari no amplíe). 🔴 Un `sticky` dentro de un contenedor que desplaza **y tiene relleno** queda 16 px más abajo en Chromium: el relleno va en una capa interior. ⚠️ **El SW no evita el esqueleto al cambiar de pestaña**: con red va red-primero y una navegación del App Router es RSC, que no guarda. Lo evita la caché de cliente de Next, que para una página dinámica solo guarda un prefetch **completo**: las pestañas llevan `prefetch` (5 min, `staleTimes.static`; `revalidatePath` la invalida). Solo se precarga en móvil: en escritorio la barra es `display:none` y el enlace nunca entra en la vista. ⚠️ En `next dev` no hay prefetch: el esqueleto se sigue viendo y no es esto. Suite móvil 80/80 (con la del esqueleto y la del buscador), capturas de escritorio 10/10, unitarias verdes |

### Cierre — corrida completa (2026-10-06, rama `feature/movil`)

- **Unitarias** (`pnpm test`): 608 de 608.
- **Integración** (`pnpm test:int`): `tasks-service` 19/19. `automation-service` 1/8: las
  7 caen al construir `new PrismaService(...)` con la firma de antes de M4 de
  PLAN-MONOLITO (ahora pide `ConfigService`). Ajeno a esta etapa y ya roto en `main`.
- **e2e entera** (api, ui, movil-android, movil-iphone, con las `@security`): 341
  pasan, 11 fallan, 8 omitidas. **Las 11 son de `ui` de escritorio y de cuatro
  especificaciones que ya fallan en `main`**: `03-sesion` (2), `04-invitaciones` (1),
  `07-reglas` (7; intermitente, cae un subconjunto distinto cada vez) y `09-scrum` (1;
  depende de la hora). Ninguna móvil ni de api.
- **Capturas de escritorio (I1)**: 10 de 10 idénticas.
- **Falta, a mano y en un teléfono real** (no se puede emular): el teclado de iOS
  sobre el compositor y la barra de formato, el gesto de volver, la barra de estado
  y la pantalla de arranque, e instalar en Android e iOS.
