---
name: kyloo-design
description: >-
  La filosofía de diseño de Praxis-como-producto-de-Kyloo: monocromo por
  zonas, tipografía como interfaz, cero tarjetas. Nace del rediseño de la
  landing (`apps/frontend/web-shell`) y documenta las decisiones, los
  patrones reutilizables y las trampas ya mordidas para cuando se refactorice
  el resto del sistema. Úsala antes de tocar cualquier pantalla que deba
  sentirse "Kyloo", no solo la landing.
---

# Filosofía de diseño — Praxis / Kyloo

Este documento no es el sistema de diseño de Kyloo (eso vive en su propio
repo, `bykyloo.com`). Es **cómo lo adaptamos** cuando Praxis se convirtió en
"un producto de Kyloo": qué tomamos prestado, qué dejamos fuera a propósito,
y qué aprendimos reconstruyendo la landing entera para llegar ahí. Se escribió
tras acabar ese rediseño (`apps/frontend/web-shell`, sección `/`) y está
pensado para reusarse cuando le toque el turno a las zonas de producto
(`dashboard-front`, `projects-front`, etc.) — que no son la landing y no
todo aquí aplica igual, pero el criterio sí.

> [!IMPORTANT]
> Nada de esto sustituye a `CLAUDE.md` en la raíz del repo. Las reglas de
> idioma, Tailwind v4, Multi-Zones, Atomic Design y las trampas del backend
> siguen mandando. Esto es la capa visual encima.

> [!CAUTION]
> 🚫 **La paleta, los radios y las fuentes de este documento NO están aplicados
> dentro de la aplicación, y no se vuelven a aplicar sin pedirlo.** Se llevaron a
> `theme.css` el 2026-08-27 (`190c85d`) y el dueño del producto los revirtió el
> mismo día (`3fa9b87`): la aplicación va con la paleta azulada oscura y su
> claro, los radios de 4/8/12/16/24 px y Redaction 50 + Lora + Inter.
>
> Lo que **sí** sigue vigente de aquí: el rediseño **estructural** de la landing
> y del acceso —que se queda—, y el criterio de composición: filas con una raya
> fina en vez de tarjetas, la tipografía como jerarquía, activo por tono y no por
> caja, y motion solo cuando cambia lo que se entiende.
>
> O sea: **§2 (color) y los radios de §3 describen lo revertido**; el resto del
> documento describe cómo se componen las pantallas y sigue mandando.

---

## Tabla de contenidos

1. [Principios rectores](#1-principios-rectores)
2. [Color: monocromo por zonas](#2-color-monocromo-por-zonas)
3. [Tipografía](#3-tipografía)
4. [El principio "sin tarjetas"](#4-el-principio-sin-tarjetas)
5. [Motion: Reveal + Lenis](#5-motion-reveal--lenis)
6. [Navbar fijo y transparente](#6-navbar-fijo-y-transparente)
7. [RollCta y la lección de Tailwind v4](#7-rollcta-y-la-lección-de-tailwind-v4)
8. [Ética de assets: fuentes y vídeo](#8-ética-de-assets-fuentes-y-vídeo)
9. [Cómo trabajamos: preguntar, luego iterar con referencia real](#9-cómo-trabajamos-preguntar-luego-iterar-con-referencia-real)
10. [Trampas de QA con el navegador automatizado](#10-trampas-de-qa-con-el-navegador-automatizado)
11. [Checklist para una zona nueva](#11-checklist-para-una-zona-nueva)
12. [Cruzar de zona: el panel de acceso](#12-cruzar-de-zona-el-panel-de-acceso)
13. [Dentro de la aplicación: sidebar, Panel y Configuración](#13-dentro-de-la-aplicación-sidebar-panel-y-configuración)

---

## 1. Principios rectores

- **Monocromo, no marca de color.** Praxis tenía su propio índigo/dorado;
  se abandonó a propósito. Kyloo trabaja en negro casi puro y blanco hueso,
  y Praxis-como-producto-de-Kyloo hereda eso. El color ya no distingue
  secciones — lo hace alternar entre zona oscura y zona clara.
- **La tipografía es la interfaz.** Un titular grande en Fraunces dice más
  que una tarjeta con icono y sombra. Antes de maquetar un bloque nuevo,
  la primera pregunta es "¿esto se puede decir con tipografía y una raya
  punteada, o de verdad hace falta un contenedor?". Casi siempre es lo
  primero.
- **Prohibido lo que grita.** Nada de degradados, sombras exageradas,
  bordes muy redondeados. `lRadius = '0.35rem'` es el único radio del
  sistema — un redondeado "tenue", casi imperceptible, nunca una píldora.
- **Una sola excepción de color, y es la marca.** El degradado del titular
  del hero (`súper app` / `súper inteligente` en gris apagado sobre blanco)
  es la única concesión — es identidad, no decoración. No se generaliza a
  nada más.
- **El motion revela jerarquía, no rellena tiempo.** Cada animación
  (`Reveal`, el roll de `RollCta`) existe para que el usuario note qué es
  importante, no para que la página "se sienta viva". Si una animación no
  cambia lo que el usuario entiende, sobra.
- **`prefers-reduced-motion` siempre tiene salida.** Tanto `Reveal` como
  `SmoothScroll` comprueban el media query y pintan el estado final sin
  animar. No es opcional.

---

## 2. Color: monocromo por zonas

Los siete tokens viven en **`commons/styles/landing-theme.css`** — no en
`web-shell`. Nacieron ahí, pero en cuanto una segunda zona los necesitó
(`auth-front`, ver §12) subieron a `commons` el mismo día, siguiendo la
regla de Atomic Design del propio repo: algo que usan ≥2 zonas no se
duplica, se comparte. `web-shell` y `auth-front` importan ese archivo desde
su propio `globals.css`; ninguna de las dos declara los valores a mano.

Dos clases, nunca un tema por componente:

```css
.landing       { --l-bg: #080807; --l-fg: #e8e8e3; --l-fg-muted: #938f8a;
                  --l-card: #181715; --l-border: #393632;
                  --l-primary: #e8e8e3; --l-primary-foreground: #080807; }
.landing-light { /* los mismos siete tokens, invertidos */ }
```

Un componente nunca decide su color a pelo: lee `var(--l-fg)`, etc. La
sección que lo envuelve decide si es `.landing` o `.landing-light`. Esto es
lo que hace que una `Reveal` o un `RollCta` funcionen igual de bien en
cualquier zona sin tocarles una línea.

**`data-theme-section="light"` es un marcador aparte de la clase**, solo
para que el navbar (§6) sepa si está sobrevolando una zona clara. No fusionar
los dos: la clase pinta, el atributo se mide.

**Las mismas dos clases TAMBIÉN sobrescriben los tokens del tema general**
(`--color-*`, `--radius-*`, `--font-display` de `theme.css`) a los valores
monocromos equivalentes. Es lo que permite que un átomo genérico —`Input`,
`Button`, `AuthForm`, cualquier cosa que use `bg-surface` o `rounded-lg`
en vez de `var(--l-*)`— caiga en el lenguaje de marca con solo envolverlo en
`.landing`/`.landing-light`, sin tocar su código. Antes de crear una versión
"landing" de un átomo compartido, prueba primero si el envoltorio basta —
casi siempre basta. El caso real está en `AuthPanel` (§12).

---

## 3. Tipografía

Trío de siempre — Inter (sans, cuerpo), Lora (serif, apoyo), Fraunces
(display, titulares e itálicas de énfasis) — más una cuarta fuente añadida
en este rediseño solo para el logotipo:

```ts
// layout.tsx
const grotesk = Archivo({ variable: '--font-grotesk', weight: ['700', '800'] });
```

**Por qué Archivo y no la fuente real de Kyloo (Khteka):** Khteka es de pago
y no la tenemos licenciada. Se sustituye por Archivo —libre, visualmente
próxima en peso y carácter— en los dos únicos sitios donde aparece el
logotipo: navbar (`PublicNavbar.tsx`) y el cierre del footer
(`PublicFooter.tsx`). Está comentado en el código en ambos sitios con la
misma razón, para que quien tenga la licencia algún día sepa exactamente qué
tocar y dónde. **No copies una fuente de pago de un repo de referencia sin
verificar la licencia** — esto aplica a cualquier fuente que se tome
"prestada" de Kyloo en el futuro, no solo a Khteka.

Regla de uso: Fraunces itálica es la voz de énfasis (una frase que el
usuario debe notar, una pull-quote, "súper app"/"súper inteligente" en el
hero). Grotesk (Archivo) es *solo* wordmark — nunca cuerpo de texto, nunca
un titular de sección. Mezclar las dos diluye la que hace de firma.

---

## 4. El principio "sin tarjetas"

La landing original tenía nueve tarjetas idénticas con una miniatura de
interfaz dentro por sección. Se sustituyó por completo — no una sección,
**todas**. El lenguaje que las reemplaza, consistente en todo `page.tsx`:

| En vez de... | Usa... |
|---|---|
| Grid de tarjetas con icono + texto | Lista numerada (`01`, `02`…) con raya punteada (`border-b border-dotted`, color `var(--l-border)`) entre filas |
| Panel/mockup con datos de ejemplo | Una frase grande en Fraunces itálica (`<blockquote>`), o un guion de diálogo etiquetado (`Line` en `LandingAssistant.tsx`) |
| Botón dentro de una tarjeta | Texto con subrayado condicional (`Aceptar` subrayado vs `Rechazar` apagado) — sin píldora, sin fondo |
| Diagrama con cajas y flechas | Un trazo continuo con puntos (`FlowStage` en `LandingAutomation.tsx`): la línea *es* el diagrama |

El dispositivo que amarra todo esto —número o etiqueta a la izquierda, texto
grande al centro, raya punteada como separador— aparece en `LandingFeatures`,
`LandingAutomation`, `PublicFooter` (la nav grande) y `LandingHowItWorks`. Es
intencional: la página deja de sentirse como secciones distintas pegadas una
tras otra y pasa a leerse como un único documento editorial.

**Al añadir una sección nueva a cualquier zona**, la pregunta no es "¿qué
tarjeta uso?" — es "¿cuál de estos cuatro dispositivos ya existe para esto?".
Si ninguno encaja, es señal de parar y pensar el contenido antes que el
componente, no de inventar una tarjeta nueva.

---

## 5. Motion: Reveal + Lenis

**`Reveal`** (`commons/molecules/Reveal/Reveal.tsx`) sustituyó a los
`gsap.fromTo` + `ScrollTrigger` sueltos que tenía cada organismo. Es un
`IntersectionObserver` que dispara **una vez** (`commons/hooks/useInView.ts`)
y una transición CSS pura — no depende de que el hilo principal esté libre
en el fotograma exacto en que GSAP evalúa el scroll, así que no se queda a
medias bajo carga. `rootMargin: '0px 0px -20% 0px'` dispara cuando el
elemento cruza el 80% del viewport, no antes.

Excepción deliberada: **`HeroReveal`** en `LandingHero.tsx` NO usa
`useInView` — es mount-based (anima al montar, no al entrar en viewport).
El hero está siempre en el viewport inicial, así que gatear por
intersección puede dejar el CTA principal invisible si el observer no
llega a disparar a tiempo. Cualquier contenido *above the fold* debe usar
este patrón, no `Reveal`.

**Lenis** (`SmoothScroll.tsx`) es la misma librería que usa Kyloo. Se monta
fuera de `layout.tsx` — vive donde hace falta el ritmo, no en todo el árbol
(`not-found.tsx` no tiene secciones que lo necesiten). `duration: 1.45` y
`wheelMultiplier: 0.85` (por debajo de 1) frenan el scroll a propósito para
que cada sección tenga tiempo de que sus `Reveal` terminen antes de que el
usuario siga de largo — por eso también se subió el padding vertical de
cada sección a `py-32 md:py-44`. Los dos cambios van juntos: frenar el
scroll sin dar más alto a la sección no sirve de nada, y viceversa.

---

## 6. Navbar fijo y transparente

`PublicNavbar.tsx` no tiene fondo propio (`bg-transparent`) — flota sobre
la página y el color del texto se decide en JS, no en CSS estático, porque
depende de qué hay detrás en cada instante. La técnica —**la misma que usa
el navbar real de Kyloo**, `useOverLightSection`— mide con
`getBoundingClientRect()` si alguna `[data-theme-section="light"]` se
solapa con la banda del navbar y cambia entre dos paletas explícitas
(`DARK`/`LIGHT`), con `transition-colors duration-300` para que el cambio
no sea un salto.

Consecuencia aceptada, no un bug: al no tener fondo, el contenido que
scrollea (titulares grandes en Fraunces) pasa *detrás* del navbar durante
una fracción de segundo de scroll. Es el mismo comportamiento del navbar
real de Kyloo. No se corrige con un scrim o un blur — eso sería añadir el
fondo que se pidió quitar explícitamente. Si una zona de producto adopta
este navbar y el solape resulta ilegible ahí (texto de formularios, no
titulares de paso), esa es la señal para reconsiderarlo en ese contexto
concreto, no aquí.

---

## 7. RollCta y la lección de Tailwind v4

`RollCta` (`commons/molecules/RollCta`) es el único botón con icono-flecha
del sistema, y a propósito **no se usa en toda la página** — se vuelve
repetitivo. Aparece en el hero, el navbar y el CTA final; en el resto,
texto con subrayado (§4).

**La trampa que ya mordió:** dos utilidades de traslado direccional
combinadas en Tailwind v4 (`-translate-x-full` + `translate-y-full`) sobre
el mismo elemento computaban `transform: none` en tiempo de ejecución
—la regla CSS existe y hace *match*, pero la composición de
`--tw-translate-x`/`--tw-translate-y` en la propiedad nativa `translate` no
se aplicaba—. Efecto visible: **las dos flechas del icono aparecían a la
vez**, nunca alternando. Se depuró con inspección de estilo computado en el
navegador, no adivinando.

**El arreglo, y la regla que deja:** abandonar las utilidades `translate-*`
de Tailwind para cualquier transform animado que combine dos ejes, y
manejarlo con `style={{ transform: ... }}` inline atado a estado de React
(`hovered`). Si un futuro componente necesita animar una transformación de
dos ejes con Tailwind v4 en este repo y el resultado no se mueve pese a que
la clase está aplicada, **sospecha primero de esto** antes de reescribir la
lógica — comprueba el estilo computado del elemento, no solo si la clase
está en el DOM.

`bgColor`/`fgColor` son props explícitas (no leen `var(--l-*)` por
defecto) porque el navbar usa `RollCta` fuera de cualquier zona
`.landing`/`.landing-light` — sin esas props, el botón no sabría qué color
tomar. Cualquier uso de `RollCta` fuera de una sección de landing necesita
pasarlas a mano.

---

## 8. Ética de assets: fuentes y vídeo

Dos veces en este rediseño hizo falta traer un asset del repo real de
Kyloo, y las dos veces la regla fue la misma: **usar el original está bien
para verificar contenido y técnica; redistribuirlo en Praxis, no.**

- **Vídeo del hero:** se extrajeron cuatro planos cortos de
  `design-final-compressed.webm` / `development-final-compressed.webm` del
  repo de Kyloo, vía `ffmpeg`. Antes de aceptar un recorte, se verificó
  frame a frame (contact sheet a intervalos de 0.5s) que no mostrara
  trabajo de cliente, texto de marca, ni nada específico de la agencia —
  solo b-roll genérico de "alguien trabajando". Un vídeo que muestre el
  portfolio real de Kyloo o el nombre de un cliente suyo **no se usa**,
  aunque el plano sea bonito.
- **Fuente del logotipo:** Khteka (la fuente real del wordmark de Kyloo) es
  de pago; no la tenemos licenciada. Se sustituyó por Archivo (§3), con la
  razón documentada en el código en los dos sitios donde se usa.

La regla general para el resto del sistema: antes de copiar un asset del
repo de Kyloo —una fuente, un vídeo, una imagen, incluso un fragmento de
shader con datos de marca incrustados—, pregúntate si redistribuirlo tiene
licencia o si haría falta un sustituto libre. Documenta la decisión en un
comentario junto al asset, no en un commit que nadie vuelve a leer.

---

## 9. Cómo trabajamos: preguntar, luego iterar con referencia real

Este rediseño pasó por tres fases, y el patrón vale para el resto del
sistema:

1. **Fase de intención, con preguntas primero.** Un encargo abierto
   ("mejora la landing con nuestra filosofía") se resolvió con
   `AskUserQuestion` antes de tocar código: paleta, tipografía, estructura
   de contenido, tipo de visual del hero. Evita construir sobre una
   suposición equivocada durante horas.
2. **Fase de referencia literal, con una captura real.** Cuando el usuario
   trajo una captura del sitio real de Kyloo y dio instrucciones mucho más
   directivas ("usa estos colores... el mismo diseño de bordes... quita el
   ascii de fondo"), esas instrucciones **sustituyeron** decisiones de la
   fase 1 sin conflicto — no se negociaron ni se defendió la elección
   anterior. Cuando llega una referencia concreta, manda sobre la intención
   abstracta previa.
3. **Fase de pulido con feedback puntual.** Bugs y notas de gusto sobre lo
   ya construido ("el botón bugea", "esta sección se ve pajiza") se
   arreglan uno por uno, verificando cada uno en el navegador antes de
   pasar al siguiente — no en lote al final.

La lección que se lleva a cualquier refactor futuro: **una captura de
pantalla del sitio real vale más que una descripción de la paleta.** Si el
usuario tiene el sitio de referencia abierto, pedir la captura antes de
adivinar tokens de color ahorra una ronda entera de corrección.

---

## 10. Trampas de QA con el navegador automatizado

Verificar visualmente en `mcp__claude-in-chrome__*` tiene dos limitaciones
del propio entorno que **no son bugs del código** — cuestan tiempo si se
confunden con uno:

1. **`document.hidden === true` congela las transiciones CSS a medio
   camino.** La pestaña del navegador automatizado no está "enfocada" en el
   sentido en que Chrome lo entiende, así que transiciones disparadas por
   `Reveal` pueden quedarse congeladas en una opacidad fraccionaria
   (`0.16`, `0.21`…) durante segundos aunque el `IntersectionObserver` ya
   haya disparado correctamente. **La forma de comprobar si es esto y no un
   bug real: mirar `data-inview` en el elemento, no la opacidad
   computada.** Si `data-inview="true"` está puesto, la lógica de React
   funciona; lo que está parado es el pintado del navegador, no el estado.
2. **Reproducción de vídeo puede no arrancar en el sandbox**, incluso con
   un archivo válido (verificable con `ffprobe`/`ffmpeg` fuera del
   navegador). No asumas que un `<video>` en negro es un bug de la landing
   sin antes confirmar el archivo por otra vía.

Consecuencia práctica: cuando una captura de pantalla automatizada muestra
una sección en blanco justo después de un scroll grande, **antes de asumir
que algo se rompió, comprueba el estado del DOM directamente** (opacidad
computada del `.reveal-inner`, atributo `data-inview`, `scrollY` estable) y
reintenta la captura tras esperar. Un salto de scroll grande y consecutivo
también puede reiniciar la animación de Lenis varias veces seguidas —
esperar a que `window.scrollY` deje de cambiar entre dos lecturas antes de
juzgar el resultado.

---

## 11. Checklist para una zona nueva

Antes de dar por adaptada una pantalla de producto (no landing) a este
lenguaje:

- [ ] ¿Usa los tokens `--l-*` (o el patrón equivalente si la zona necesita
      los suyos propios) en vez de colores sueltos?
- [ ] ¿Hay alguna tarjeta con icono + texto que se pueda convertir en fila
      numerada con raya punteada, o en una pull-quote?
- [ ] ¿El único radio de borde es `0.35rem` (o el token equivalente), sin
      píldoras ni esquinas muy redondeadas?
- [ ] ¿Ningún degradado ni sombra exagerada, salvo que sea la excepción de
      marca ya acordada (el titular del hero)?
- [ ] Si hay contenido *above the fold* con `Reveal`: ¿se cambió a un
      patrón mount-based (`HeroReveal`) en vez de gatear por
      `IntersectionObserver`?
- [ ] Si se usa `RollCta` fuera de una zona `.landing`/`.landing-light`:
      ¿se pasaron `bgColor`/`fgColor` explícitos?
- [ ] Si se trajo un asset del repo de Kyloo (fuente, vídeo, shader): ¿está
      verificada la licencia y documentada la sustitución si no la hay?
- [ ] `pnpm --filter <paquete> exec tsc --noEmit` y `biome check --write`
      limpios antes de dar el cambio por terminado.

---

## 12. Cruzar de zona: el panel de acceso

El primer sitio fuera de `web-shell` que adoptó este sistema fue login y
registro (`auth-front`), y el motivo por el que existe esta sección es que
cruzar de zona tiene una restricción real que no tiene la landing sola.

**La restricción:** en Multi-Zones cada zona es una app Next
independiente, cosida por `rewrites()`. Navegar de `/` (`web-shell`) a
`/auth/login` (`auth-front`) es **siempre** una carga de página completa —
no hay router compartido entre las dos, así que un desplegable de verdad
(estado de React, sin navegar, como el "Sobre el estudio" de Kyloo) es
imposible cruzando esa frontera. Antes de prometer "que se sienta como un
desplegable" en cualquier flujo que cruce de zona, comprueba primero si
las dos pantallas viven en la misma app — si no, el techo es una página
que **se ve** como un panel, no un panel que no navega.

**Lo que se construyó — `AuthPanel`**
(`auth-front/src/components/organisms/AuthPanel.tsx`): toma prestado el
lenguaje del `AboutModal.tsx` real de Kyloo (panel a la derecha sobre un
fondo ambiental, `Cerrar` + chip `esc`) pero como layout de página, no como
modal — y **sin animación de entrada**. La primera versión sí deslizaba el
panel al montar (el mismo truco de Kyloo de doblar el frame con
`requestAnimationFrame`), y sobraba: Kyloo anima porque su panel entra
*encima* de una página que ya estaba ahí; esto es una página nueva de
narices, no hay nada debajo de lo que "entrar", y la animación solo la
hacía parecer más barata. La lección general: **un patrón prestado de un
modal-sobre-contenido no siempre se traduce 1:1 a una página aparte** —
copia la composición, no des por hecho que el motion también aplica.

- El fondo ambiental (mitad izquierda, oculto en móvil) es el mismo
  `ShaderCanvas` del cierre de la landing — no hay "página de detrás" que
  enseñar cruzando de zona, así que es un ambiente, no una vista previa.
  Lleva el lockup "Praxis" + "By" + `KylooWordmark`, igual que el cierre
  del footer (§8) — no solo "Praxis" a secas.
- El panel (derecha, `720px`, ancho completo en móvil) usa la variante
  **`.landing-light.cold`**, no `.landing-light` a secas: el beige cálido
  de las secciones editoriales necesita texto y rayas punteadas alrededor
  para leerse como "papel", y en una superficie de formulario sin ese apoyo
  se leía sucio. `.cold` sube de especificidad sobre los mismos tokens con
  blanco de verdad y grises neutros — mismo mecanismo, otro juego de
  valores (§2).
- `AuthForm` se usa con la prop **`bare`**, nueva en la propia molécula:
  sin ella, su tarjeta (`rounded-2xl border bg-surface` + una sombra
  calculada con `colors.overlay`, un token JS que no responde al scope CSS
  de `.landing-light`) quedaba flotando dentro del panel con un borde y una
  sombra que no encajaban con la paleta de alrededor — dos superficies
  anidadas donde una sola bastaba, justo lo que el principio "sin tarjetas"
  (§4) dice que hay que evitar. `bare` quita la tarjeta entera y deja que
  el panel sea la única superficie.
- `Cerrar`, `esc` y las dos apariciones de "Praxis" navegan a `/` con
  `<a href>` / `window.location`, nunca con `next/link` ni `router.push` —
  cruzar de zona exige navegación dura. **Esto se rompió en la primera
  versión**: los dos wordmarks "Praxis" quedaron con `next/link`, que
  dentro de `auth-front` intenta resolver `/` contra el router de esa
  misma app —que no tiene esa ruta— en vez de cruzar a `web-shell`. El
  bug no daba ningún error: el enlace pintaba bien y solo fallaba al
  pulsarlo. **Cualquier `<Link>`/`router.push` que apunte fuera del
  `basePath` de la zona actual es sospechoso por defecto** — grepear
  `next/link` antes de dar por cerrado un componente que cruza de zona.
- `esc` usa un listener en fase de **captura** sobre `window`
  (`addEventListener('keydown', onKey, true)`), no en fase de burbuja sobre
  `document`. Aun así, **el propio navegador puede consumir la primera
  pulsación de Escape** si hay un desplegable de autocompletar abierto
  sobre el campo de email o contraseña (comportamiento nativo del
  gestor de contraseñas, fuera del alcance de JS de página) — ese caso no
  tiene arreglo desde aquí; el botón `Cerrar` sigue siendo el camino
  determinista.

**Lo que subió a `commons` para que esto funcionara**, todo por la misma
regla del repo (algo que usan ≥2 zonas no se duplica):

- `ShaderCanvas` — de `web-shell/.../PublicFooter/` a
  `commons/organisms/ShaderCanvas/`. Lleva `three.js` como dependencia real
  de `commons` (no de cada zona por separado), siguiendo el mismo precedente
  que ya tenían `lucide-react`/`jose`/`sileo` ahí.
- `KylooWordmark` — de `web-shell/.../PublicFooter/` a
  `commons/organisms/KylooWordmark/`, por el mismo motivo: ahora lo monta
  también `AuthPanel`.
- Los tokens `--l-*` (y la variante `.cold`) — de `web-shell/globals.css` a
  `commons/styles/landing-theme.css` (§2), con la extensión de `--color-*`/
  `--radius-*`/`--font-display` que hizo posible reskinar `AuthForm` sin
  tocarlo.

**Antes de repetir este patrón en otra zona:** confirma que la zona ya
carga Fraunces, Archivo (`--font-grotesk`) y Khteka (`--font-khteka`,
copiada a `<zona>/src/app/fonts/`) — sin alguna de las tres, el token que
la usa cae a su *fallback* en silencio (`Georgia`, `Arial`…) en vez de
romper, así que el error no avisa, solo se ve una tipografía distinta a la
esperada.

---

## 13. Dentro de la aplicación: sidebar, Panel y Configuración

Todo lo de arriba nació en superficies **públicas** (landing, login/registro)
— páginas sin sesión, sin datos reales, donde "monocromo fijo" no le quita
nada a nadie. Meter este lenguaje **dentro** de la aplicación (`AppShell`, el
armazón que montan las seis zonas privadas) es un terreno distinto, y esta
sección existe por un tropiezo real en ese cruce.

### La decisión que no se puede dar por hecha: el tema claro/oscuro se queda

Landing y `AuthPanel` son monocromos **fijos** — sin selector, sin cookie de
tema — porque son la puerta de entrada, y Kyloo trata su propio sitio así.
La primera vez que se llevó "monocromo" hacia la aplicación privada, se
interpretó como "elimina el sistema de tema claro/oscuro entero" — cookie,
`ThemeToggle`, el `data-theme` de las ocho zonas — y se ejecutó sin
preguntar antes de enseñar nada. El resultado: colores rotos, sin contraste,
y una vuelta atrás completa (`git checkout` selectivo, archivo por archivo,
para no perderse trabajo aceptado de otras rondas mezclado en el mismo
diff).

La corrección, explícita del usuario: **el tema claro/oscuro se queda** — es
mejor para quien usa la aplicación, y quitar una preferencia real por
"coherencia" con la landing no es una mejora. Lo que sí se lleva dentro son
los *principios* — sin degradados, radios tenues, jerarquía por tono en vez
de por caja — aplicados **sobre los tokens `--color-*` existentes**
(`commons/styles/theme.css`, con su propio par claro/oscuro), nunca sobre
los tokens fijos `--l-*`/`.landing-light.cold` de la landing. Dos sistemas de
tokens, cada uno en su sitio: `--l-*` para lo que nunca cambia de tema,
`--color-*` para lo que sí.

**La lección, en general:** "llévate el estilo de X a Y" es una instrucción
sobre diseño visual, no autorización para tocar infraestructura compartida
(un sistema de tema, una cookie, un flag que usan ocho zonas). Si una tarea
de estilo empieza a arrastrar la eliminación de algo que otras pantallas
dependen, es el momento de preguntar — no de asumir que "monocromo" implica
"sin selector". Y cuando la superficie de cambio es grande (ocho
`layout.tsx`, un módulo de tema, componentes compartidos), enseñar un avance
pequeño y verificado vale más que completar todo el lote antes de la primera
captura de pantalla.

### El sidebar (`AppShell`/`NavList`/`navigation.tsx`)

- **Agrupado, no una lista plana.** `AppNavItem` lleva un campo `section`
  obligatorio; `NavList` agrupa preservando el orden de `APP_NAV_ITEMS` (no
  alfabético) y pinta una raya fina + una etiqueta pequeña —sin mayúsculas
  forzadas, ese detalle importa— antes de la primera entrada de cada grupo
  nuevo.
- **Cada grupo es plegable.** Un botón con chevron por grupo, estado en
  `useState<Set<string>>` (qué claves están compactadas, vacío = todo
  abierto, no persiste entre sesiones). La animación de abrir/cerrar usa el
  truco de grid `0fr ↔ 1fr` con una **transición** normal, no una
  `@keyframes`: una animación solo reproduce hacia adelante al montar, y
  esto necesita interpolar en las dos direcciones cada vez que se pulsa. El
  hijo necesita su propio `overflow-hidden` para poder encogerse por debajo
  de lo que mide su contenido — el mismo dispositivo que ya documentaba
  `.animate-desplegar-panel` en `theme.css`, aquí conducido por estado en
  vez de por montaje.
- **Claves compuestas, siempre.** `` `${grupo.clave}::${item.href}` ``, no
  solo el `href`. Un `key` que en teoría es único (todos los `href` lo eran)
  igual disparó el aviso de React de claves duplicadas — la causa exacta no
  se pudo reproducir de forma determinista sin backend real, y la clave
  compuesta lo hizo imposible sin tener que averiguarlo.
- **Activo = tono, no caja.** `bg-primary-muted` + `text-primary` (el icono
  hereda el color por `currentColor`) en vez de `bg-primary` sólido +
  `text-primary-foreground` + sombra. Menos contraste de fondo, más
  legible, y sin la sombra que el propio usuario ya había pedido quitar en
  otro sitio (`RollCta`) — la misma regla de "sin sombra exagerada" aplica
  aquí igual.
- **El selector de organización es un placeholder honesto.** Organizaciones
  no existe a nivel de backend; el bloque de arriba del todo (icono +
  "Plan gratuito" + "Organización de {nombre}" + chevron) es **puramente
  visual** — sin `onClick`, sin menú que abrir. Construir la interacción
  antes de tener a qué cambiar habría sido peor que no tenerla: un
  desplegable que no lleva a ninguna parte.
- **El logotipo "Praxis" del sidebar usa el mismo `--font-grotesk`
  (Archivo) que navbar/footer de la landing** — no `font-display`
  (Redaction 50, la voz del resto de la app) — pero **sí** lleva
  `text-primary`, el morado de marca de la aplicación. A diferencia de la
  landing, aquí la app conserva su color: la tipografía se alinea con
  Kyloo, el color no.
- **Grupo entero, no ruta por ruta.** `commons/auth/nav.ts` filtra el grupo
  «Administración» completo por `section` (exporta
  `SECTION_ADMINISTRACION` desde `navigation.tsx` para esto), no comparando
  tres `href` sueltos — con tres pantallas en el mismo grupo, comparar por
  sección es lo que no se puede desincronizar.

### Página con navegación propia + sidebar = navegación duplicada

`admin-front` tenía sus tres pantallas (Cuentas, Proyectos, Actividad) con
pestañas propias (`AdminTabs`) porque **solo una de las tres tenía entrada
en la barra lateral** — las otras dos eran alcanzables solo escribiendo la
URL a mano. Al exponer las tres como entradas reales del sidebar, las
pestañas pasaron a repetir exactamente la misma navegación con otro dibujo.
Se borraron (`AdminTabs.tsx` completo, el prop `activo` de `AdminHeader`).

**La regla general:** cuando una pantalla gana una entrada de verdad en la
navegación principal, es el momento de revisar si ya tenía su propia
navegación interna hacia las mismas rutas — y si la tenía, sobra.

### Configuración: filas, no tarjetas — dentro del sistema de tema

La pantalla tenía tres `PanelCard` en rejilla (borde, fondo, esquinas
redondeadas, una caja por bloque). Se rehizo como una columna de filas con
una raya fina arriba de cada una — el mismo lenguaje que ya usa el resto
del sistema desde la landing (§4) — pero **sobre los tokens `--color-*` de
siempre** (`border-border`, `text-text-secondary`…), no sobre `--l-*`: esta
pantalla sigue respondiendo al tema claro/oscuro, así que no puede fijarse
a una paleta que no lo hace. `PanelCard` en sí no se tocó —lo sigue usando
la pantalla de cuenta— para no arrastrar un cambio de estilo a una pantalla
que nadie pidió tocar.

Praxis Voice se quitó de aquí (componentes, acciones, tipos, la llamada del
Panel) — ya no existe en el producto. Cuando aparezca algo que sí se dé de
baja de verdad, el patrón es el mismo: borrar el componente, la Server
Action, el tipo de estado y el fetch que lo alimentaba, y barrer el repo
entero buscando el nombre antes de dar el cambio por terminado — un `grep`
del nombre encuentra lo que un vistazo a los archivos que se acuerda tocar
no.
