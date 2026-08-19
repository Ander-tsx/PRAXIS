'use client';

import { aceptarGraficoAction } from '@/app/(private)/[[...id]]/actions';
import { ReportCanvas } from '@/components/organisms/ReportCanvas';
import type { Widget } from '@/lib/widgets';
import {
  AssistantChat,
  type AssistantQuota,
  DockSlot,
  PRAX_NAME,
  PraxAvatar,
  alpha,
  colors,
  useDock,
} from '@praxis/commons';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

/**
 * La pantalla de Análisis: el lienzo y el asistente, que ahora se hablan.
 *
 * ## Por qué existe esta plantilla
 *
 * El lienzo y el chat eran dos organismos independientes colgando de la page, y
 * podrían seguir siéndolo si no fuera por el botón «Generar»: pulsarlo tiene que
 * llevar al chat **y dejarle escrito para qué**. Eso es estado compartido entre
 * dos islas de cliente, y la page es un componente de servidor — no puede
 * sostenerlo.
 *
 * La alternativa era un `CustomEvent` en el DOM, que habría evitado este archivo
 * a cambio de un acoplamiento invisible: dos componentes que se coordinan por un
 * nombre de evento que no aparece en ninguna firma. Una plantilla de cliente con
 * el estado a la vista cuesta un archivo y se lee.
 *
 * Sigue sin haber lógica de negocio aquí: los datos ya vienen renderizados desde
 * la page en `slots`, y guardar es una Server Action que llega por props.
 *
 * ## 🔴 El chat deja de estar en la página y se va al cajón
 *
 * Estuvo arriba del todo, con este argumento: quien llega con una pregunta
 * concreta no debería recorrer los gráficos antes de poder hacerla. Sonaba bien
 * y estaba mal, y se ve en cuanto se mira la pantalla entera: **lo primero que
 * aparecía en una página de datos era un cuadro de texto**, y el chat competía
 * por el mismo espacio vertical que aquello que se ha venido a leer.
 *
 * El trabajo de esta pantalla es **analizar**. El asistente es lo que se abre
 * cuando un número no se entiende o hace falta algo que no está puesto — valioso,
 * pero accesorio. Así que pasa a un cajón lateral que:
 *
 * - **empuja el lienzo en vez de taparlo**, porque el gesto es mirar un gráfico
 *   y preguntar **por él**: un panel flotante taparía justo el objeto de la
 *   pregunta;
 * - **no se desmonta al cerrarse**, así que se puede preguntar, cerrar, mirar y
 *   volver sin perder el hilo;
 * - y se abre desde un botón con la cara de PRAX, o desde «Generar» del lienzo.
 *
 * El mismo organismo, tercera carcasa: `pantalla` en su zona, `cajon` aquí. En
 * cuanto haya una cuarta implementación del chat empezarán a divergir.
 */
/**
 * Ancho por debajo del cual el cajón no cabe y se manda a la zona del asistente.
 *
 * Es el `md` de Tailwind, y coincide a propósito con el `md:` del propio botón.
 */
const ANCHO_MINIMO_DEL_CAJON = 768;

/**
 * Llevar a PRAX a pantalla completa, con este proyecto ya enfocado.
 *
 * ⚠️ **`window.location`, y no el router de Next.** `/assistant` es **otra
 * zona**: `router.push('/assistant')` le pega el `basePath` de esta —`/reports`—
 * y sale `/reports/assistant`, que no existe. Es la invariante de siempre —
 * `next/link` dentro de la zona, navegación del navegador para cruzar— y el
 * síntoma no es un error de compilación, es un 404 solo en móvil.
 *
 * Va el **slug**, que es lo que `assistant-front` casa contra su lista de
 * proyectos: allí el UUID se resuelve una vez y es lo que viaja a la API.
 */
function irAPraxAPantallaCompleta(projectSlug: string) {
  window.location.assign(`/assistant?p=${encodeURIComponent(projectSlug)}`);
}

/** Si el cajón cabe o no. Se mira al pulsar, no al pintar: no hay hidratación que desajustar. */
function cabeElCajon(): boolean {
  return window.innerWidth >= ANCHO_MINIMO_DEL_CAJON;
}

export function AnalysisScreen({
  projectSlug,
  projectId,
  lienzoInicial,
  slots,
  guardar,
  cuotaInicial,
  nombres,
  etiquetas,
}: {
  projectId: string;
  projectSlug: string;
  lienzoInicial: Widget[];
  slots: Record<string, ReactNode>;
  guardar: (widgets: Widget[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
}) {
  const [sugerencia, setSugerencia] = useState<{ texto: string; sello: number } | null>(null);
  const dock = useDock();

  /**
   * El botón «Generar» del lienzo.
   *
   * Deja escrita **una frase de ejemplo, no la pregunta definitiva**, y no la
   * envía. Es lo que convierte «puedes pedirle un gráfico» en algo que se puede
   * hacer sin saber cómo se pide: quien no sabía que esto existía ve la forma de
   * la petición y la retoca; quien sí, borra y escribe la suya.
   *
   * Ahora además **abre el cajón**: antes el chat estaba a la vista y bastaba con
   * dejar el texto puesto; con el chat guardado, dejarlo escrito donde no se ve
   * sería un botón que aparentemente no hace nada.
   */
  const generar = useCallback(() => {
    /* Sin sitio para el cajón, la frase de ejemplo no se pierde: se va a
       escribir a la pantalla entera del asistente. Aquí no se le puede dejar
       puesta —cruzar de zona es recargar—, así que allí PRAX recibe el foco y
       quien pregunta escribe lo suyo. */
    if (!cabeElCajon()) {
      irAPraxAPantallaCompleta(projectSlug);
      return;
    }
    dock?.abrir();
    setSugerencia({ texto: FRASE_DE_EJEMPLO, sello: Date.now() });
  }, [dock, projectSlug]);

  return (
    <>
      {!projectSlug && (
        <>
          <DisparadorDePrax projectSlug={projectSlug} />

          <DockSlot titulo={`${PRAX_NAME}, el asistente`}>
            <AssistantChat
              projectId={projectId}
              /* El proxy de esta zona: por ahí suben y bajan los adjuntos, que no
                 pueden ir por una Server Action. Ver `AssistantChatProps`. */
              gatewayPath="/reports/api/gateway"
              cuotaInicial={cuotaInicial}
              nombres={nombres}
              etiquetas={etiquetas}
              sugerenciaExterna={sugerencia}
              variante="cajon"
              sinHistorial={true}
              /**
               * La única acción que la conversación no trae de serie.
               *
               * `AssistantChat` vive en `commons` desde que PRAX tiene pantalla
               * propia, y las nueve acciones que llaman a endpoints del tablero se
               * fueron con él. Esta no: escribe en el **lienzo**, así que necesita el
               * catálogo de widgets de esta zona y revalida esta página.
               *
               * En `assistant-front` no se pasa, y entonces la tarjeta de un gráfico
               * propuesto explica dónde se coloca en vez de ofrecer un «Aceptar» que
               * escribiría en una pantalla que no se está viendo.
               */
              alAceptarGrafico={aceptarGraficoAction}
            />
          </DockSlot>
        </>
      )}

      <ReportCanvas inicial={lienzoInicial} slots={slots} guardar={guardar} onGenerar={generar} />
    </>
  );
}

/**
 * El botón que abre a PRAX.
 *
 * ## Flotante, y por qué no en la cabecera
 *
 * La cabecera de esta pantalla ya lleva el título de la sección, el titular, la
 * frase y el selector de proyecto. Un botón más ahí se pierde entre cuatro cosas
 * que también son texto. Flotando en la esquina inferior derecha está siempre a
 * la misma distancia del pulgar y del cursor **sin importar cuánto lienzo haya
 * debajo**, que en una pantalla que crece con cada gráfico añadido es la
 * diferencia entre encontrarlo y buscarlo.
 *
 * ⚠️ **Desaparece cuando el cajón está abierto.** Un botón de abrir que sigue
 * ahí con el panel ya abierto invita a pulsarlo para cerrarlo, y entonces tiene
 * que ser un interruptor — con dos estados que explicar. El panel ya trae su
 * propia aspa, que es donde se busca cerrar algo.
 */
function DisparadorDePrax({ projectSlug }: { projectSlug: string }) {
  const dock = useDock();

  /* Sin cajón —fuera del armazón privado— no hay nada que abrir. No debería
     pasar, pero un botón muerto flotando sobre la pantalla sí se vería. */
  if (!dock || dock.abierto) return null;

  return (
    <button
      type="button"
      onClick={() => (cabeElCajon() ? dock.abrir() : irAPraxAPantallaCompleta(projectSlug))}
      aria-label={`Preguntar a ${PRAX_NAME}`}
      className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5 rounded-full py-2 pl-2 pr-4 font-sans text-sm font-semibold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:bottom-6 md:right-6"
      style={{
        background: colors.surface,
        color: colors.textPrimary,
        boxShadow: `0 10px 30px ${alpha(colors.textPrimary, 10)}, 0 0 0 1px ${alpha(colors.border, 90)}`,
      }}
    >
      <PraxAvatar mood="idle" size="sm" />
      {/* El nombre solo cuando hay sitio: en un móvil, la cara sola ya es el
          botón, y la etiqueta accesible dice lo mismo para quien no la ve. */}
      <span className="hidden sm:inline">Preguntar a {PRAX_NAME}</span>
    </button>
  );
}

/**
 * ⚠️ Es una frase, no una plantilla con huecos.
 *
 * Un formulario de «elige métrica, elige forma, elige rango» habría sido más
 * dirigido y habría tirado por la borda la única ventaja de pedirlo hablando:
 * que no hace falta saber cómo se llama lo que quieres. El conjunto cerrado está
 * en el backend, donde se puede garantizar; aquí solo hay una sugerencia.
 */
const FRASE_DE_EJEMPLO =
  'Añádeme un grafo de ... para ver ... (por ejemplo: las tareas paradas por columna, o lo que cierra el equipo cada semana)';
