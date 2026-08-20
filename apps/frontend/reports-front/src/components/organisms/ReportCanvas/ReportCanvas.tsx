'use client';

import { Desplegable } from '@/components/molecules/Desplegable';
import {
  CATALOGO,
  type EspecificacionGrafico,
  type TipoWidget,
  type Widget,
  nuevoWidget,
  tiposYaPuestos,
} from '@/lib/widgets';
import { Button, alpha, colors } from '@praxis/commons';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Layout,
  ResponsiveGridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
} from 'react-grid-layout';

import { CanvasVacio } from './CanvasVacio';
import { Catalogo } from './Catalogo';
import { ChartBuilder } from './ChartBuilder';
import { WidgetShell } from './WidgetShell';

/**
 * Los cortes, y por qué el lienzo solo se guarda en el ancho grande.
 *
 * `ResponsiveGridLayout` deriva las disposiciones de los anchos pequeños a
 * partir de la del grande, compactándola a menos columnas. Eso es exactamente lo
 * que se quiere **al pintar** y un desastre **al guardar**: si `onLayoutChange`
 * persistiera lo que llega en un móvil, una sola visita desde el teléfono
 * convertiría la composición de alguien en una columna apilada, sin que nadie
 * haya arrastrado nada. Se guarda solo en `lg`.
 */
const BREAKPOINTS = { lg: 1024, md: 768, sm: 0 } as const;
const COLS = { lg: 12, md: 8, sm: 4 } as const;

/** Alto de una celda, en píxeles. Con el margen, una fila son 52 px. */
const ALTO_FILA = 40;
const MARGEN: readonly [number, number] = [16, 16];

/** Lo que se espera desde el último gesto antes de guardar. */
const ESPERA_DE_GUARDADO = 700;

export interface ReportCanvasProps {
  /** Lo que hay guardado. La page ya lo leyó del servidor. */
  inicial: Widget[];
  /**
   * El contenido de cada widget, **ya renderizado en el servidor** y con sus
   * datos dentro, indexado por id.
   *
   * Es la regla del repo llevada al lienzo: la lógica de negocio —el `fetch`, la
   * forma de los datos, los permisos— vive en la page, y este organismo recibe
   * `ReactNode` y los coloca. Aquí además tiene una segunda ventaja: los
   * gráficos siguen siendo islas de Recharts servidas por la page, y este
   * componente no importa la librería ni sabe qué dibuja.
   *
   * Un id sin entrada es un widget recién añadido cuyo informe todavía no ha
   * llegado: se pinta el marco con su aviso de carga.
   */
  slots: Record<string, ReactNode>;
  /** Guarda el lienzo. Server Action; devuelve el error para poder decirlo. */
  guardar: (widgets: Widget[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Lleva al chat del asistente y le deja escrito para qué. */
  onGenerar: () => void;
}

/**
 * El lienzo de Análisis.
 *
 * ## Qué cambió, y por qué
 *
 * La pantalla enseñaba **cinco informes fijos, todos, siempre y en un orden que
 * nadie eligió**. En un proyecto sin historial eso significaba abrir Análisis y
 * encontrarse tres avisos de «no hay suficientes datos»: la pantalla pedía
 * perdón antes de servir para nada, que es la peor primera impresión posible.
 *
 * Ahora arranca vacía con una invitación. El vacío deja de ser un fallo y pasa a
 * ser el punto de partida — y de paso deja de costar cinco peticiones, dos de
 * ellas recorriendo el historial, para no enseñar nada.
 *
 * ## Tres decisiones de gesto
 *
 * **Siempre se puede mover, no hay «modo edición».** Un modo obliga a entrar y
 * salir para colocar un gráfico, y quien entra a mirar no lo descubre nunca. Lo
 * que evita los arrastres accidentales no es el modo sino el **tirador**: solo
 * se arrastra por la cabecera de la tarjeta, así que seleccionar texto o abrir
 * el «cómo se lee» dentro de un gráfico no lo mueve.
 *
 * **Se guarda solo, y en silencio.** Un botón «Guardar disposición» es una forma
 * de perder el trabajo de quien no lo pulsa. Se espera a que pare el gesto y se
 * manda; solo se dice algo si **falla**.
 *
 * **Quitar no pregunta.** Es lo único que se deshace volviéndolo a añadir del
 * catálogo, y un diálogo de confirmación por cada gráfico convierte ordenar el
 * panel en un trámite.
 */
export function ReportCanvas({ inicial, slots, guardar, onGenerar }: ReportCanvasProps) {
  const [widgets, setWidgets] = useState<Widget[]>(inicial);
  /**
   * Qué hay abierto debajo de la barra. `null` es «nada».
   *
   * ⚠️ **Un estado y no dos booleanos.** Con `catalogoAbierto` y
   * `constructorAbierto` por separado existía el estado imposible de los dos a la
   * vez, y cada botón tenía que acordarse de cerrar al otro — un `set` olvidado
   * en cualquiera de los cuatro sitios lo dejaba pasar. Con una sola variable no
   * hay nada que recordar.
   */
  const [panel, setPanel] = useState<'catalogo' | 'medida' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const { width, mounted, containerRef } = useContainerWidth();

  /**
   * ⚠️ Se compara contra el ancho medido, no contra `window.innerWidth`: el
   * lienzo vive dentro de la columna de la página, con la barra lateral al lado,
   * y esos dos números no coinciden. Usar el de la ventana daría por «grande» un
   * contenedor que ya está compactado a ocho columnas, y se guardaría eso.
   */
  const esAnchoGrande = mounted && getBreakpointFromWidth(BREAKPOINTS, width) === 'lg';

  /**
   * El servidor tiene lo último que se mandó; esto tiene lo último que se hizo.
   *
   * Se guarda en una ref y no en el estado porque solo lo lee el temporizador:
   * meterlo en el estado volvería a renderizar la cuadrícula entera en cada
   * píxel de un arrastre.
   */
  const pendiente = useRef<Widget[] | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardarConEspera = useCallback(
    (siguientes: Widget[]) => {
      pendiente.current = siguientes;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(async () => {
        const aGuardar = pendiente.current;
        if (!aGuardar) return;
        pendiente.current = null;
        const resultado = await guardar(aGuardar);
        setError(resultado.ok ? null : resultado.error);
      }, ESPERA_DE_GUARDADO);
    },
    [guardar],
  );

  /* Un gesto a medias no se pierde al cambiar de proyecto o cerrar la pestaña. */
  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  /**
   * Los widgets que llegan del servidor y aquí todavía no están.
   *
   * ⚠️ **Sin esto, aceptar un gráfico del asistente no se veía hasta recargar.**
   * `widgets` nace de `inicial` una sola vez, al montar: es lo correcto para las
   * posiciones —el arrastre manda sobre lo que diga el servidor— pero convierte
   * a este componente en sordo a los widgets que aparecen por otra vía. Y hay
   * una: la tarjeta del asistente guarda el gráfico y llama a `revalidatePath`,
   * así que el servidor manda el lienzo actualizado… y aquí no se miraba.
   *
   * Solo se **añaden los que faltan**, nunca se pisan los que ya hay: si alguien
   * está arrastrando cuando llega el refresco, su gesto no se deshace. Y no se
   * borran los que el servidor ya no trae, porque eso pasa de forma legítima
   * mientras un guardado va en vuelo.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `inicial` es el disparador; `widgets` se lee dentro del actualizador para no reaccionar a los cambios propios
  useEffect(() => {
    setWidgets((actuales) => {
      const conocidos = new Set(actuales.map((widget) => widget.id));
      const nuevos = inicial.filter((widget) => !conocidos.has(widget.id));
      return nuevos.length > 0 ? [...actuales, ...nuevos] : actuales;
    });
  }, [inicial]);

  /**
   * La cuadrícula devuelve posiciones; aquí se vuelven a pegar a su widget.
   *
   * ⚠️ **Solo persiste en `lg`.** En los anchos pequeños la disposición que
   * llega es la que ha derivado la librería, no una que alguien haya decidido.
   */
  const alCambiarDisposicion = useCallback(
    (disposicion: Layout) => {
      if (!esAnchoGrande) return;

      const porId = new Map(disposicion.map((item) => [item.i, item]));
      const siguientes = widgets.map((widget) => {
        const item = porId.get(widget.id);
        return item ? { ...widget, x: item.x, y: item.y, w: item.w, h: item.h } : widget;
      });

      /**
       * Sin cambios reales no se guarda.
       *
       * La cuadrícula dispara esto también **al montar y al cambiar de ancho**,
       * no solo al arrastrar: sin esta comparación, abrir la pantalla escribiría
       * en la base todas las veces, y cambiar el tamaño de la ventana, muchas
       * más. El orden coincide por construcción —`siguientes` es un `map` de
       * `widgets`— así que comparar por posición es correcto.
       */
      const igual = siguientes.every((widget, i) => {
        const antes = widgets[i];
        return (
          widget.x === antes.x &&
          widget.y === antes.y &&
          widget.w === antes.w &&
          widget.h === antes.h
        );
      });
      if (igual) return;

      /* Fuera del actualizador de estado a propósito: React puede ejecutar un
         actualizador dos veces en StrictMode, y programar el guardado ahí dentro
         convertiría un efecto en algo que ocurre un número impredecible de
         veces. */
      setWidgets(siguientes);
      guardarConEspera(siguientes);
    },
    [widgets, esAnchoGrande, guardarConEspera],
  );

  /**
   * Añadir del catálogo.
   *
   * Se pinta al momento y se guarda; después `router.refresh()` vuelve a
   * renderizar la page en el servidor, que ahora sí pide el informe que este
   * widget necesitaba y lo manda por `slots`. Mientras tanto el marco ya está
   * puesto con su aviso de carga, así que el gesto se ve completo y no hay un
   * salto en el que la tarjeta aparezca de golpe con todo dentro.
   */
  const anadir = useCallback(
    async (tipo: TipoWidget, grafico?: EspecificacionGrafico) => {
      setPanel(null);
      const siguientes = [...widgets, nuevoWidget(tipo, widgets, grafico)];
      setWidgets(siguientes);
      const resultado = await guardar(siguientes);
      if (!resultado.ok) {
        setError(resultado.error);
        setWidgets(widgets);
        return;
      }
      setError(null);
      router.refresh();
    },
    [widgets, guardar, router],
  );

  const quitar = useCallback(
    async (id: string) => {
      const siguientes = widgets.filter((widget) => widget.id !== id);
      setWidgets(siguientes);
      const resultado = await guardar(siguientes);
      if (!resultado.ok) {
        setError(resultado.error);
        setWidgets(widgets);
      } else {
        setError(null);
      }
    },
    [widgets, guardar],
  );

  const disposicion = useMemo<Layout>(
    () =>
      widgets.map((widget) => {
        const entrada = CATALOGO[widget.tipo];
        return {
          i: widget.id,
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
          minW: entrada?.minW ?? 3,
          minH: entrada?.minH ?? 3,
        };
      }),
    [widgets],
  );

  const yaPuestos = useMemo(() => tiposYaPuestos(widgets), [widgets]);

  return (
    <div className="flex flex-col gap-4">
      {/**
       * La barra de acciones del lienzo.
       *
       * ## ⚠️ Elegir qué ver se puede en cualquier ancho; **colocarlo, no**
       *
       * Antes los dos botones desaparecían por debajo de `lg` y en su lugar salía
       * una insignia que decía «Desktop only». Eran dos problemas: el rótulo
       * estaba en inglés en un producto que habla español, y —lo de fondo— dejaba
       * a quien entra desde el teléfono **sin poder hacer absolutamente nada**,
       * ni siquiera añadir la instantánea a un lienzo vacío.
       *
       * Y no hacía falta: añadir un gráfico llama a `guardar()` con la
       * disposición en celdas del ancho grande, que es la única que se persiste;
       * lo que sí había que acotar —y sigue acotado— es `onLayoutChange`, porque
       * la cuadrícula deriva los anchos pequeños compactando el grande y
       * guardarlos convertiría la composición en una columna apilada.
       *
       * Así que la línea real no es «móvil sí / móvil no», es **elegir vs.
       * colocar**. Se dice con esas palabras, debajo del lienzo y no como un
       * cartel de error.
       */}
      <div className="flex flex-wrap items-center gap-2">
        {mounted && (
          /**
           * ⚠️ **El rótulo no cambia al abrir**, y antes decía «Cerrar».
           *
           * Con el panel desplegado, un botón que solo dice «Cerrar» deja de
           * nombrar lo que hay debajo: quien vuelve a la pestaña después de un
           * rato ve un panel grande y, encima, una palabra que no dice de qué es.
           * El estado lo comunican el `aria-expanded` y el propio panel, que
           * lleva su aspa — que es donde se busca cerrar algo, la misma regla que
           * el cajón de PRAX.
           */
          <Button
            variant={panel ? 'secondary' : 'primary'}
            onClick={() => setPanel((actual) => (actual ? null : 'catalogo'))}
            aria-expanded={panel !== null}
          >
            Añadir un grafo
          </Button>
        )}
      </div>

      {/**
       * Los dos caminos, **en un panel con pestañas y no en dos paneles**.
       *
       * Eran dos botones que abrían dos bloques distintos y se cerraban el uno al
       * otro. Se leían como dos funciones sin relación, cuando son dos formas de
       * hacer lo mismo: poner un grafo en el lienzo. Con pestañas, la relación se
       * ve —y el que llega buscando en el catálogo descubre que existe el
       * constructor sin que nadie se lo cuente.
       *
       * Se abre por «Del catálogo» a propósito: es el camino de un clic, y el
       * constructor pide cuatro decisiones. Quien ya sabe lo que quiere cambia de
       * pestaña; quien no, ve ocho opciones dibujadas.
       */}
      <Desplegable abierto={panel !== null}>
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-display text-lg text-text-primary">Añade lo que quieras ver</h3>
              <p className="font-sans text-sm text-text-secondary">
                Se coloca al final del lienzo. Después se mueve arrastrando por la cabecera y se
                redimensiona por la esquina.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label="Cerrar"
              className="shrink-0 rounded-lg p-1.5 text-text-disabled transition-colors hover:bg-surface-elevated hover:text-text-primary"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* `<fieldset>` y no un `div` con `role="tablist"`: son dos opciones
              excluyentes de un formulario, y el carril con fondo es lo que dice
              que solo puede estar puesta una. Mismo patrón que el control
              segmentado de Administración. */}
          <fieldset
            className="flex w-max max-w-full flex-wrap gap-0.5 rounded-xl p-1"
            style={{ background: alpha(colors.border, 45) }}
          >
            <legend className="sr-only">Cómo quieres añadirlo</legend>
            {(
              [
                ['catalogo', 'Del catálogo'],
                ['medida', 'A medida'],
              ] as const
            ).map(([clave, rotulo]) => (
              <button
                key={clave}
                type="button"
                onClick={() => setPanel(clave)}
                aria-pressed={panel === clave}
                className={`rounded-lg px-3 py-1.5 font-sans text-xs font-semibold transition-colors ${
                  panel === clave
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                }`}
              >
                {rotulo}
              </button>
            ))}
          </fieldset>

          {panel === 'medida' ? (
            <ChartBuilder
              onAnadir={(grafico) => anadir('generado', grafico)}
              onCancelar={() => setPanel(null)}
            />
          ) : (
            <Catalogo yaPuestos={yaPuestos} onElegir={anadir} onGenerar={onGenerar} />
          )}
        </div>
      </Desplegable>

      {error && (
        <p role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}

      {/* ⚠️ El `pb-20` deja sitio al botón flotante de PRAX, que va fijo en la
          esquina inferior derecha y tapaba el pie de la última tarjeta — el
          «Cómo se lee esto», que es justo lo que hay que poder pulsar. */}
      <div ref={containerRef} className="pb-20">
        {widgets.length === 0 ? (
          <CanvasVacio
            onAnadir={() => setPanel('catalogo')}
            onConstruir={() => setPanel('medida')}
          />
        ) : (
          /* Hasta que se mide el contenedor no se dibuja: la librería asume
             1280 px por defecto y la cuadrícula aparecería con el ancho
             equivocado y saltaría al medirse. */
          mounted &&
          /**
           * ## ⚠️ Por debajo de `lg` no hay cuadrícula, hay una lista
           *
           * Y no es una simplificación visual: es lo que arregla que las
           * tarjetas se cortaran en un teléfono. La cuadrícula conserva el alto
           * **en filas** al cambiar de ancho, así que una tarjeta que en
           * escritorio cabe de sobra reflowa al doble de alto en 390 px y se
           * queda con la mitad del contenido detrás de un `overflow-hidden`.
           * «Resumen» perdía dos de sus cuatro cifras, a medio pintar.
           *
           * Aquí no se pierde nada por soltar la cuadrícula: por debajo de `lg`
           * ya estaban desactivados el arrastre, el redimensionado y el guardado
           * de la disposición, así que lo único que aportaba era el recorte. El
           * orden es el de la composición guardada —por fila y luego por
           * columna— para que la lista se lea como se ve en grande.
           */
          (!esAnchoGrande ? (
            <div className="flex flex-col gap-4">
              {[...widgets]
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map((widget) => (
                  <WidgetShell
                    key={widget.id}
                    widget={widget}
                    onQuitar={() => quitar(widget.id)}
                    movible={false}
                    altoFijo={false}
                  >
                    {slots[widget.id]}
                  </WidgetShell>
                ))}
            </div>
          ) : (
            <ResponsiveGridLayout
              width={width}
              layouts={{ lg: disposicion }}
              breakpoints={BREAKPOINTS}
              cols={COLS}
              rowHeight={ALTO_FILA}
              margin={MARGEN}
              containerPadding={[0, 0]}
              onLayoutChange={alCambiarDisposicion}
              /* Solo por la cabecera. Dentro de una tarjeta hay texto que se
                 selecciona y un `<details>` que se abre: si todo arrastrara,
                 leer el «cómo se lee» movería el gráfico. */
              dragConfig={{ enabled: esAnchoGrande, handle: '.tirador', bounded: false }}
              resizeConfig={{ enabled: esAnchoGrande, handles: ['se'] }}
              className="report-canvas"
            >
              {widgets.map((widget) => (
                <div key={widget.id}>
                  <WidgetShell
                    widget={widget}
                    onQuitar={() => quitar(widget.id)}
                    movible={esAnchoGrande}
                  >
                    {slots[widget.id]}
                  </WidgetShell>
                </div>
              ))}
            </ResponsiveGridLayout>
          ))
        )}
      </div>

      {/* Al pie y no arriba: quien entra desde el teléfono viene a leer, y el
          aviso de que aquí no se arrastra solo hace falta cuando ya ha visto lo
          que hay. Arriba era un cartel pidiendo perdón antes de enseñar nada. */}
      {mounted && !esAnchoGrande && widgets.length > 0 && (
        <p className="font-sans text-xs leading-relaxed text-text-disabled">
          Los grafos se apilan para que quepan. Para moverlos y cambiarles el tamaño hace falta una
          pantalla más ancha; tu composición se queda como la dejaste allí.
        </p>
      )}
    </div>
  );
}
