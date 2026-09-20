'use client';

import { InstallAppButton } from '@/components/molecules/InstallAppButton';
import { RollCta } from '@/components/molecules/RollCta';
import { l } from '@/lib/landingColors';
import type { CSSProperties, ElementType, ReactNode } from 'react';

export interface LandingHeroProps {
  isAuthenticated?: boolean;
}

/**
 * Reveal del hero — anima al montar, nunca al cruzar el viewport.
 *
 * `commons/molecules/Reveal` espera a un `IntersectionObserver`, que es lo
 * correcto para el resto de la página pero no para el hero: es lo primero
 * que se ve, y en una pantalla baja el bloque de CTA cae por debajo del
 * umbral de disparo en la carga inicial — se queda invisible hasta que
 * alguien hace scroll. Kyloo resuelve exactamente esto igual: su Hero
 * tampoco usa el sistema de reveal por scroll.
 */
function HeroReveal({
  as: Tag = 'span',
  delay = 0,
  className = '',
  innerClassName = '',
  style,
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag className={`reveal-mask ${className}`}>
      <span
        className={`hero-reveal-inner block ${innerClassName}`}
        style={{ animationDelay: `${delay}s`, ...style }}
      >
        {children}
      </span>
    </Tag>
  );
}

/**
 * El desvanecido de las dos cursivas del titular.
 *
 * ## Qué es y por qué solo aquí
 *
 * Es la excepción de color que `kyloo-design/SKILL.md` §1 ya reservaba para el
 * titular del hero —«una sola concesión, y es la marca: identidad, no
 * decoración»—. Antes se cobraba en gris apagado; ahora se cobra en índigo, que
 * es lo que la ata al producto. No se generaliza: cualquier otra cursiva de la
 * página sigue en `--l-fg-muted`.
 *
 * El ángulo son 105°, no 90°: la letra es cursiva y sube hacia la derecha, así
 * que un degradado vertical la cruzaría a contrapelo.
 *
 * ## Las tres trampas de recortar un fondo contra el texto
 *
 * 1. ⚠️ **`WebkitTextFillColor` y NO `color: transparent`.** Es lo que deja un
 *    repliegue de verdad: `color` queda puesto en índigo liso, y solo lo tapa
 *    el navegador que además entiende `-webkit-text-fill-color` — que son
 *    exactamente los mismos que entienden `background-clip: text`. Con
 *    `color: transparent`, un navegador que no recortara el fondo pintaría el
 *    **titular invisible**, que es el peor fallo posible en la primera pantalla.
 * 2. ⚠️ **El prefijo `-webkit-` sigue haciendo falta.** Safari no aplica
 *    `background-clip: text` sin él, y su ausencia no da error: pinta el
 *    rectángulo del degradado entero por detrás de la palabra.
 * 3. ⚠️ **El fondo se dimensiona con la caja del `<span>`**, así que cada
 *    cursiva lleva su propio degradado completo en vez de un trozo de uno
 *    común. Es lo que se quiere —las dos se desvanecen igual, estén donde
 *    estén— pero significa que envolver las dos en un padre cambiaría el
 *    resultado sin que nada avise.
 */
const DEGRADADO_DE_MARCA: CSSProperties = {
  color: l.accent,
  backgroundImage: `linear-gradient(105deg, ${l.accentBright} 0%, ${l.accent} 48%, ${l.accentDeep} 100%)`,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
};

/**
 * Las tres promesas de la primera pantalla.
 *
 * 🚫 **Aquí había datos técnicos —«12 servicios», «SSE», «RBAC»— y se
 * retiran.** Describían bien el producto por dentro y no le decían nada a
 * quien está decidiendo si probarlo: «SSE» no es una ventaja, es una
 * implementación, y quien la reconoce no es quien firma. Lo que queda dice lo
 * mismo en lo que se nota al usarlo.
 *
 * ⚠️ **Siguen sin poder mentir.** El criterio no cambió al cambiar el
 * registro: cada línea afirma algo que el producto hace hoy —las reglas mueven
 * trabajo, los papeles se reparten por proyecto y los avisos llegan en el
 * momento—. Una promesa inventada en la primera pantalla se desmonta en la
 * segunda, y entonces ya no se cree ninguna.
 */
const PROMESAS = [
  { valor: 'Automático', etiqueta: 'las reglas mueven el trabajo' },
  { valor: 'En equipo', etiqueta: 'permisos por proyecto' },
  { valor: 'Al día', etiqueta: 'avisos en cuanto algo cambia' },
] as const;

/**
 * El desvanecido de los bordes de la pieza de vídeo. Ver `BloomVisual`, punto 3.
 *
 * Elipse y no círculo: la caja es cuadrada y el motivo es vertical, así que un
 * círculo aprieta por los lados justo donde no hay nada y deja aire de sobra
 * arriba y abajo, que es donde está el tallo.
 */
const MASCARA_DE_BORDE =
  'radial-gradient(ellipse 50% 50% at 50% 46%, #000 0%, #000 34%, rgba(0,0,0,0.82) 52%, rgba(0,0,0,0.42) 66%, rgba(0,0,0,0.12) 80%, transparent 94%)';

export function LandingHero({ isAuthenticated = false }: LandingHeroProps) {
  return (
    <section
      /**
       * ⚠️ **Alineado arriba, no centrado, y con un hueco grande debajo.**
       *
       * El hero dejó de ser lo único de la primera pantalla: justo debajo
       * asoma el vídeo de demostración (`LandingDemo`), y para que se vea su
       * borde superior sin hacer scroll el contenido tiene que subir. Con
       * `justify-center` el bloque se quedaba en mitad del alto y el hueco se
       * repartía a partes iguales arriba y abajo — la mitad de ese aire, justo
       * encima del titular, no lo aprovecha nadie.
       *
       * ⚠️ **El `pt` de aquí es el ÚNICO hueco bajo la barra, y antes eran
       * dos sumados.** La rejilla de dentro traía su propio `py-10 lg:py-12`,
       * que se apilaba sobre este `pt` y sobre los 72 px de la barra —que es
       * `fixed` y no ocupa flujo, así que el `pt` la está compensando entera—.
       * El resultado eran ~180 px de negro entre la navegación y el `eyebrow`
       * en una pantalla alta: no se lee como aire, se lee como que la página
       * empieza tarde. La rejilla ya no pone `py`; el hueco se decide aquí y
       * en un solo sitio.
       *
       * 🚫 **Y ya no tiene alto mínimo.** Lo tuvo —`min-h-svh`— y era justo
       * lo que impedía que el vídeo asomara: en un portátil de 950 px el
       * contenido ya mide 850 con el `pt`, así que el mínimo no añadía nada y
       * en cambio **fijaba** el final del hero en el borde de la ventana,
       * dejando el asomo a expensas de los 100 px que sobraban. Sin mínimo, el
       * hero mide lo que mide su contenido, termina antes del borde y el vídeo
       * entra en pantalla por sí solo. En una ventana alta no queda corto: el
       * vídeo sube con él y el conjunto sigue llenando.
       *
       * 🔴 **El asomo y este `pb` son el mismo número repartido, y el reparto
       * es más ajustado de lo que parece.** Con el hero alineado arriba:
       *
       *     separación contenido↔vídeo = pb − (margen negativo del demo)
       *     lo que asoma del vídeo      = alto de ventana − alto del hero + ese margen
       *
       * Sumando las dos, el `pb` y el margen se cancelan: **lo repartible es
       * solo `ventana − (pt + alto del contenido)`**, y nada de lo que se
       * toque aquí lo agranda. En un portátil de 950 px eso eran 89 px para
       * dos cosas, así que el vídeo asomaba 32 px — invisible como invitación.
       * Lo que da aire de verdad es encoger el contenido, no mover los
       * márgenes: de ahí el `pt` más corto, los huecos de la columna un punto
       * más juntos y el subtítulo en `max-w-2xl`, que le quita un renglón.
       */
      className="relative flex flex-col justify-start overflow-hidden pt-[6rem] pb-[clamp(3rem,7svh,5rem)] md:pt-[7rem]"
      style={{ background: l.bg, color: l.fg }}
    >
      {/**
       * ⚠️ **El hero volvió a dos columnas, y esta vez el contrapeso es real.**
       *
       * Hubo un vídeo aquí y se retiró con razón: era b-roll genérico de gente
       * en un portátil, no enseñaba nada y marcaba una diferencia con la
       * aplicación que no compensaba. Lo que lo sustituye no es metraje: es una
       * pieza de marca en el índigo del producto (ver `BloomVisual`), sin
       * ninguna interfaz dentro que pueda quedarse vieja.
       *
       * Con contrapeso, el texto vuelve a la izquierda — que es donde empieza
       * un renglón y donde el ojo espera el titular. Centrado solo tenía
       * sentido mientras no había nada a la derecha.
       *
       * El `items-center` es de la rejilla, no del texto: las dos columnas se
       * alinean por su centro vertical y cada una compone por dentro como
       * quiera.
       */}
      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-1 items-center gap-10 px-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 lg:px-10 xl:gap-12 xl:px-16">
        {/* ── Columna de texto ─────────────────────────────── */}
        <div className="flex flex-col items-start gap-6 text-left md:gap-7">
          {/* El mismo punto de acento que abre las cinco secciones de abajo
              (`SectionEyebrow`), aquí a mano: el hero no anima con `Reveal`
              —espera a un `IntersectionObserver` y en una pantalla baja el
              bloque se queda invisible—, así que reusar el componente
              traería justo el comportamiento que `HeroReveal` viene a
              evitar. Lo que se comparte es el dibujo, no el motor. */}
          <HeroReveal
            className="w-fit"
            innerClassName="flex items-center gap-2.5 font-mono text-xs font-medium uppercase tracking-widest"
            style={{ color: l.fgMuted }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 flex-none"
              style={{ background: l.accent }}
            />
            Plataforma de trabajo para equipos de producto
          </HeroReveal>

          {/**
           * Titular. Las dos cursivas llevan el desvanecido de marca
           * (`DEGRADADO_DE_MARCA`); el resto se queda en blanco hueso.
           *
           * ⚠️ **Los cuerpos se recalibraron al pasar a dos columnas.** La
           * medida ya no es la página entera: es una celda de rejilla que a
           * `lg` vale ~54 % de `max-w-7xl` (1280 − 48 de canalones), o sea unos
           * 620 px. Los tamaños de la versión centrada estaban medidos contra
           * una columna de 976 px y aquí parten donde no toca. Cada renglón de
           * este titular cabe en la celda a `4rem`; el que manda es «que se
           * gestiona sola», que es el más largo.
           *
           * ⚠️ **Y el titular dejó de ser un eslogan.** «La súper app para la
           * gestión súper inteligente» decía dos veces «súper» y ni una qué
           * hace el producto — es exactamente el registro que delata a un
           * proyecto sin clientes. Lo que queda nombra la promesa concreta y
           * deja el adorno en una sola palabra.
           */}
          {/**
           * Titular. Las dos cursivas llevan el desvanecido de marca
           * (`DEGRADADO_DE_MARCA`); el resto se queda en blanco hueso. La
           * emoción la sigue poniendo la cursiva de Fraunces — el índigo solo
           * dice de quién es esto.
           *
           * ⚠️ **El cuerpo es un `clamp`, no una escalera de puntos de
           * ruptura.** La versión anterior llevaba cuatro tamaños medidos
           * contra una columna concreta, con una tabla entera de anchos: eso
           * funcionaba mientras el titular fuera una sola columna centrada y de
           * medida conocida. Aquí la columna es una celda de rejilla que
           * cambia de ancho de forma continua con la ventana, así que un
           * tamaño que encaja en 1280 parte en 1180 y sobra en 1600. Un
           * `clamp` sigue al contenedor sin escalones; los renglones se
           * reparten solos porque cada trozo es `inline-block` y vuelca cuando
           * no cabe, que es justo lo que se quiere.
           */}
          <h1
            className="tracking-tight"
            style={{
              fontFamily: 'var(--font-fraunces)',
              fontWeight: 500,
              fontSize: 'clamp(2.5rem, 3.7vw, 4rem)',
              lineHeight: 1.02,
            }}
          >
            {/**
             * ⚠️ **«La» y «súper app» van en la MISMA línea.**
             *
             * `HeroReveal` pinta su interior como `block`, así que «La» se
             * llevaba un renglón entero para sí sola y se leía como una
             * palabra huérfana flotando sobre el titular. Con las dos en
             * `inline-block` la primera línea tiene peso y el bloque hace pie.
             */}
            <span className="block">
              <HeroReveal
                delay={0}
                className="inline-block align-bottom"
                innerClassName="mr-3 md:mr-4"
              >
                La
              </HeroReveal>
              <HeroReveal
                delay={0.06}
                innerClassName="italic"
                className="inline-block align-bottom"
              >
                <span style={DEGRADADO_DE_MARCA}>súper app</span>
              </HeroReveal>
            </span>
            <span className="block">
              <HeroReveal
                delay={0.12}
                className="inline-block align-bottom"
                innerClassName="mr-3 md:mr-4"
              >
                para la gestión
              </HeroReveal>
              <HeroReveal
                delay={0.18}
                className="inline-block align-bottom"
                innerClassName="italic"
              >
                <span style={DEGRADADO_DE_MARCA}>súper inteligente</span>
              </HeroReveal>
            </span>
            <HeroReveal delay={0.24} innerClassName="block">
              de tus proyectos.
            </HeroReveal>
          </h1>

          {/**
           * Subtítulo.
           *
           * ⚠️ **Dice qué consigues, no qué trae la caja.** Las dos versiones
           * anteriores enumeraban piezas —«espacios, tableros y permisos por
           * rol»—, que es la tabla de contenidos de cualquier gestor de
           * proyectos desde 2012 y obliga a quien lee a traducirlo él mismo a
           * un beneficio. Esta empieza por el beneficio y deja el nombre del
           * asistente donde se gana: haciendo el trabajo.
           *
           * **PRAX en versalitas y no en negrita**: es un nombre propio, y
           * marcarlo como se marca una idea importante lo pondría al nivel de
           * la promesa en vez de dentro de ella.
           */}
          <HeroReveal
            as="div"
            delay={0.2}
            className="w-full"
            innerClassName="max-w-2xl text-pretty font-sans text-lg leading-relaxed md:text-xl"
            style={{ color: l.fgMuted }}
          >
            Céntrate en lo importante. Deja que{' '}
            <span className="font-mono tracking-wide" style={{ color: l.fg, fontWeight: 500 }}>
              PRAX
            </span>{' '}
            gestione tus proyectos en automático: organiza el trabajo, reacciona a cada cambio y
            mantiene al equipo alineado sin que tengas que pedirlo.
          </HeroReveal>

          {/* CTA */}
          <HeroReveal
            as="div"
            delay={0.28}
            className="w-full"
            innerClassName="flex flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            <RollCta
              size="lg"
              href={isAuthenticated ? '/projects' : '/auth/signup'}
              label={isAuthenticated ? 'Ir al panel' : 'Comenzar gratis'}
            />
            {/* 🚫 **Aquí había un «Iniciar sesión» y se retira.** La primera
                pantalla tiene un trabajo —que alguien que no conoce el producto
                empiece a usarlo— y un segundo enlace al lado del botón reparte
                esa atención entre dos caminos, uno de los cuales solo sirve a
                quien ya es cliente. Esa gente ya no pasa por aquí: con sesión
                válida, `/` redirige al panel desde el guard (`SOLO_INVITADOS`
                en `src/proxy.ts`). Quien la cerró a propósito sigue teniendo el
                enlace en la barra de arriba. */}
            {/* Independiente de la sesión: instalar la app no es una
                alternativa a entrar, es otra forma de abrir la misma cuenta.
                Se enseña o no según lo que decida el navegador — ver
                `useInstallPrompt`. `size="lg"` iguala al CTA principal a
                propósito: son dos invitaciones del mismo peso, no una
                principal y otra de relleno. */}
            <InstallAppButton size="lg" />
          </HeroReveal>

          {/**
           * La línea de promesas — lo último que se lee y lo primero que se
           * comprueba.
           *
           * Filas con separador vertical, no tarjetas: `kyloo-design` §3. Tres
           * datos no necesitan tres cajas, necesitan una raya entre ellos.
           */}
          <HeroReveal
            as="div"
            delay={0.36}
            className="w-full"
            innerClassName="mt-2 flex flex-wrap items-start gap-x-10 gap-y-4 border-t pt-6"
            style={{ borderColor: l.border }}
          >
            {PROMESAS.map((promesa) => (
              <div key={promesa.etiqueta} className="flex flex-col gap-1">
                {/* ⚠️ **Sans y no `font-mono`.** La monoespaciada servía
                    cuando esta línea llevaba datos —«12», «SSE», «RBAC»—: le
                    daba aire de medición. Con palabras corrientes hace lo
                    contrario, las disfraza de código. Y ocupa bastante más por
                    carácter, que es lo que empujaba la tercera promesa a un
                    segundo renglón. */}
                <span
                  className="font-sans text-base leading-none"
                  style={{ color: l.fg, fontWeight: 600 }}
                >
                  {promesa.valor}
                </span>
                <span className="font-sans text-xs" style={{ color: l.fgMuted }}>
                  {promesa.etiqueta}
                </span>
              </div>
            ))}
          </HeroReveal>
        </div>

        {/* ── Columna visual ───────────────────────────────── */}
        <BloomVisual />
      </div>

      <style>{`
        .hero-reveal-inner {
          animation: hero-line-reveal 1.075s var(--ease-transition) both;
        }
        @keyframes hero-line-reveal {
          from { transform: translateY(150%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .hero-bloom-in {
          animation: hero-bloom-in 1.6s var(--ease-transition) 0.25s both;
        }
        @keyframes hero-bloom-in {
          from { opacity: 0; transform: scale(1.06); }
          to   { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-reveal-inner { animation: none; opacity: 1; transform: none; }
          .hero-bloom-in     { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </section>
  );
}

/**
 * La pieza de la derecha — **un vídeo que no debe parecer un vídeo**.
 *
 * Es un bucle de partículas índigo sobre negro (flor → mariposa → lavanda)
 * que se reproduce ida y vuelta. Nada de esto se ve como metraje porque el
 * archivo nunca se enseña entero: lo que llega a la pantalla es su luz, no su
 * rectángulo.
 *
 * ## Las cuatro cosas que borran el marco, y por qué hace falta las cuatro
 *
 * 1. 🔴 **`mixBlendMode: 'lighten'` es lo que hace todo el trabajo, y NO es
 *    `screen`.** Los dos borran un fondo negro sobre otro negro, pero solo uno
 *    aguanta que los dos negros no sean el mismo. `screen` **suma**: un fondo
 *    de vídeo a `rgb(3,3,3)` sobre una sección a `rgb(8,8,7)` da `rgb(11,11,10)`
 *    — tres niveles de más, repartidos por todo el cuadro, que es exactamente
 *    la mancha redonda que se ve «si te fijas». `lighten` **elige el más
 *    claro**: mientras el negro del archivo quede por debajo del de la página,
 *    el resultado es el fondo *exacto*, y las partículas —que están muy por
 *    encima— pasan intactas. Un margen de ocho niveles en vez de ninguno.
 *    ⚠️ Y el motivo por el que los negros no coinciden no es el archivo: ahí
 *    el fondo mide `rgb(0,0,0)` medido. Es que el decodificador de vídeo
 *    trabaja en YUV de rango limitado y la vuelta a RGB no cae siempre en cero.
 *    No hay forma de arreglarlo desde el archivo; se arregla eligiendo un
 *    blend que lo tolere.
 * 2. 🔴 **Ningún ancestro de este vídeo puede abrir contexto de apilado.** Un
 *    contexto de apilado **aísla el `mix-blend-mode` de dentro**: el vídeo pasa
 *    a mezclarse contra el fondo transparente de ese grupo en vez de contra el
 *    negro de la sección, deja de cancelar nada y el rectángulo reaparece
 *    entero. Lo abre cualquier `transform`, `filter`, `opacity` < 1,
 *    `will-change` o `isolation`. Ya mordió: un `translateY(-4%)` puesto aquí
 *    para subir la pieza dos dedos. No da ningún error, y el síntoma se parece
 *    tanto a un artefacto de compresión que se busca primero en el códec.
 *    Por eso el empujón vertical va por **margen**.
 * 3. 🔴 **El radio de la máscara NO puede pasar del 50 %, y las dos veces
 *    que se ajustó «a ojo» lo pasaba.** En un `radial-gradient` usado como
 *    máscara, un `ellipse 74%` mide el radio contra el **ancho del elemento**,
 *    no contra su mitad: 74 % son casi vez y media el semiancho, así que la
 *    última parada —la transparente— cae fuera del cuadro y **el desvanecido
 *    nunca llega a ocurrir**. Lo que se ve entonces es la máscara cortada por
 *    el propio borde del vídeo: exactamente el canto duro que se intentaba
 *    quitar, y encima parece que la máscara «no funciona». Con `ellipse 50%
 *    50%` el radio coincide con el semiancho y la parada del 94 % muere justo
 *    dentro.
 *    ⚠️ **Y por eso este elemento desborda su caja sin `overflow-hidden`.**
 *    Recortar el desborde devolvería el mismo canto por el otro lado. El
 *    padre solo fija la geometría; lo que sobra se apaga en el aire.
 * 4. ⚠️ **Difuminar de más recorta la flor.** Un intento moría al 78 % del
 *    radio y se comía los pétalos de arriba: la pieza dejaba de ser una flor
 *    que se desvanece y pasaba a ser una flor mal encuadrada, que es peor que
 *    un borde. El límite es el motivo, no el gusto por difuminar.
 * 5. ⚠️ **El recorte a 1:1 se hizo al codificar, no aquí.** El original es
 *    16:9 con el motivo cuadrado en el centro; recortarlo con CSS obligaría a
 *    descargar dos franjas negras que nadie va a ver. El archivo de
 *    `public/media` ya es 640×640.
 * 6. ⚠️ **El bucle es de ida y vuelta, montado en el archivo.** El último
 *    fotograma del original (lavanda) no se parece al primero (flor), así que
 *    un `loop` normal daba un salto cada 10 s — lo que delata un vídeo al
 *    instante. El archivo lleva la secuencia y su reverso concatenados, así
 *    que el empalme cae sobre fotogramas idénticos y no hay costura.
 *
 * ## Y es decorativo, de verdad
 *
 * `aria-hidden` + sin pista de audio + `muted`/`playsInline`: no comunica nada
 * que el texto de la izquierda no diga ya, así que un lector de pantalla no
 * tiene por qué anunciarlo. `playsInline` no es opcional — sin él, Safari de
 * iOS se lleva el vídeo a pantalla completa al empezar.
 *
 * 🔴 **El póster es PNG, y NO puede ser un JPEG.** Es el fotograma que se ve
 * mientras el vídeo decodifica —y todo el tiempo si el navegador bloquea la
 * reproducción automática o la pestaña está en segundo plano—, así que pasa
 * por el mismo blend que el vídeo. Un JPEG deja bloques de ±2 niveles
 * alrededor del motivo; sobre negro eso es invisible en el archivo y un halo
 * circular en la pantalla, que es el rectángulo que esto viene a borrar. A
 * 320 px el PNG pesa 31 KB, menos que el JPEG que sustituye.
 *
 * ⚠️ **`prefers-reduced-motion` no puede pausarlo desde CSS**: un `<video autoPlay>`
 * no obedece a una media query. Lo que sí se apaga es la entrada, y el póster
 * queda como imagen fija si el navegador bloquea la reproducción automática.
 */
function BloomVisual() {
  return (
    <div
      className="relative mx-auto w-full max-w-[24rem] sm:max-w-[32rem] lg:max-w-none"
      /**
       * ⚠️ **El motivo no está centrado en su propio fotograma.** El bucle pasa
       * por una flor y una lavanda, y las dos tienen tallo: su masa cae por
       * debajo del centro geométrico del cuadro. Alineando las dos columnas por
       * el centro de sus cajas —que es lo correcto— la pieza se leía hundida
       * respecto al titular.
       *
       * El empujón va por **margen** y nunca por `transform`: ver el punto 2
       * de arriba, que es la trampa cara de esta pieza.
       */
      style={{ aspectRatio: '1 / 1', marginTop: '-1.25rem' }}
      aria-hidden="true"
    >
      {/**
       * ⚠️ **El vídeo desborda su caja un 22 %, y ese desborde NO va por
       * `transform: scale`.** El motivo ocupa poco más de la mitad de su
       * fotograma, así que a tamaño natural la pieza se lee pequeña dentro de
       * una columna que ya está al máximo. Agrandarla es acercar el encuadre,
       * y la vía barata sería un `scale` — que es justo lo que el punto 2 de
       * arriba prohíbe por aquí. Un absoluto con `inset` negativo acerca lo
       * mismo sin abrir contexto de apilado.
       */}
      <video
        className="hero-bloom-in absolute -inset-[11%] h-[122%] w-[122%] max-w-none object-cover"
        style={{
          mixBlendMode: 'lighten',
          maskImage: MASCARA_DE_BORDE,
          WebkitMaskImage: MASCARA_DE_BORDE,
        }}
        src="/media/hero-bloom.mp4"
        poster="/media/hero-bloom.png"
        autoPlay
        loop
        muted
        playsInline
        /* `metadata` y no `auto`: el póster cubre el primer frame y el
           `autoPlay` ya pide los datos al montar; precargar el archivo entero
           por adelantado solo adelanta la competencia con fuentes y CSS. */
        preload="metadata"
      />
    </div>
  );
}
