'use client';

import { CATALOGO, type TipoWidget, type Widget, nuevoWidget, tiposYaPuestos } from '@/lib/widgets';
import { Button } from '@praxis/commons';
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
  const [catalogoAbierto, setCatalogoAbierto] = useState(false);
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
    async (tipo: TipoWidget) => {
      setCatalogoAbierto(false);
      const siguientes = [...widgets, nuevoWidget(tipo, widgets)];
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setCatalogoAbierto((abierto) => !abierto)}
            aria-expanded={catalogoAbierto}
          >
            {catalogoAbierto ? 'Cerrar el catálogo' : 'Añadir un gráfico'}
          </Button>

          {/* Lleva al chat, no abre un formulario: el gráfico a medida se pide
              hablando y llega como propuesta, con su tarjeta de autorización. */}
          <Button variant="ghost" onClick={onGenerar}>
            Generar uno a medida
          </Button>
        </div>

        {/* Solo aparece cuando importa: en los anchos pequeños se puede mirar
            todo, y descubrir que no se puede reorganizar al intentarlo es peor
            que saberlo antes. */}
        {mounted && !esAnchoGrande && widgets.length > 0 && (
          <p className="font-sans text-xs text-text-disabled">
            La disposición se ajusta sola a esta pantalla. Para reorganizarla, una más ancha.
          </p>
        )}
      </div>

      {catalogoAbierto && (
        <Catalogo yaPuestos={yaPuestos} onElegir={anadir} onGenerar={onGenerar} />
      )}

      {error && (
        <p role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}

      <div ref={containerRef}>
        {widgets.length === 0 ? (
          <CanvasVacio onAnadir={() => setCatalogoAbierto(true)} onGenerar={onGenerar} />
        ) : (
          /* Hasta que se mide el contenedor no se dibuja: la librería asume
             1280 px por defecto y la cuadrícula aparecería con el ancho
             equivocado y saltaría al medirse. */
          mounted && (
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
          )
        )}
      </div>
    </div>
  );
}
