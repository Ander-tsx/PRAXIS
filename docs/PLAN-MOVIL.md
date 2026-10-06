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
| Navegaciones (HTML) | Red primero; sin red, la pantalla «Sin conexión» | El HTML privado lleva datos de la sesión: no se sirve de caché |
| `GET /api/gateway/*` de la lista blanca (M7) | Red primero; sin red, la última copia **de este usuario** | Lectura sin conexión |
| Todo lo demás de `/api/*`, `POST`/`PATCH`/`DELETE`, SSE, `/auth/*`, `/api/webhooks/*` | **Nunca**: pasa directo | Escrituras, sesión, flujos en vivo, Stripe |

**D5 — Una caché por usuario, y se borra al cerrar sesión.** Las copias de M7
viven en una caché cuyo nombre lleva el id de la cuenta. Cerrar sesión borra
todas las cachés de datos (mensaje al SW y `caches.delete` desde la página). En
un móvil compartido, quien entra después no puede ver nada del anterior.

**D6 — Una versión nueva nunca se impone a media tarea.** El SW nuevo se
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
ajustes.

**D8 — Cada pantalla trae su barra superior.** Título, «atrás» cuando hay de
dónde volver, y como mucho dos acciones a la derecha. Es lo que hace que una
pantalla se lea como una vista de app y no como una página.

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

**D12 — Lo que no viaja a móvil, a propósito.** Panel de administración,
redimensionar barra y columnas de tabla, reordenar columnas arrastrando,
arrastrar tarjetas (se mueven con «Mover a»), el editor de automatizaciones (se
ven y se encienden/apagan; se editan en escritorio) y contratar plan (se ve el
plan; se gestiona en escritorio, con enlace). Cada uno lo dice en su sitio: un
hueco sin explicación parece una avería.

**D13 — Sin conexión es solo lectura.** Por defecto, sin respuesta del dueño a
la pregunta. Escribir sin red significa una cola, reintentos y conflictos al
reconectar: es otra etapa. Sin red, los botones de escritura se apagan con el
motivo, y una franja dice «Sin conexión · enseñando lo último que se cargó».

**D14 — Notificaciones push, fuera de este plan.** Necesitan backend (claves
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
| M2 | ⏳ | | |
| M3 | ⏳ | | |
| M4 | ⏳ | | |
| M5 | ⏳ | | |
| M6 | ⏳ | | |
| M7 | ⏳ | | |
