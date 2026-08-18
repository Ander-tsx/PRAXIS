'use client';

import { aceptarGraficoAction } from '@/app/(private)/[[...id]]/actions';
import { ReportCanvas } from '@/components/organisms/ReportCanvas';
import type { Widget } from '@/lib/widgets';
import { AssistantChat, type AssistantQuota } from '@praxis/commons';
import { type ReactNode, useCallback, useState } from 'react';

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
 * ## El orden no cambia: el chat sigue arriba
 *
 * Se decidió en §26.6 y sigue valiendo: quien llega con una pregunta concreta no
 * debería tener que recorrer los gráficos antes de poder hacerla. Con el lienzo
 * vacío el chat es lo único que hay, y con el lienzo lleno el argumento original
 * es más fuerte, no menos.
 */
export function AnalysisScreen({
  projectId,
  lienzoInicial,
  slots,
  guardar,
  cuotaInicial,
  nombres,
  etiquetas,
}: {
  projectId: string;
  lienzoInicial: Widget[];
  slots: Record<string, ReactNode>;
  guardar: (widgets: Widget[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
}) {
  const [sugerencia, setSugerencia] = useState<{ texto: string; sello: number } | null>(null);

  /**
   * El botón «Generar».
   *
   * Deja escrita **una frase de ejemplo, no la pregunta definitiva**, y no la
   * envía. Es lo que convierte «puedes pedirle un gráfico» en algo que se puede
   * hacer sin saber cómo se pide: quien no sabía que esto existía ve la forma de
   * la petición y la retoca; quien sí, borra y escribe la suya.
   */
  const generar = useCallback(() => {
    setSugerencia({ texto: FRASE_DE_EJEMPLO, sello: Date.now() });
  }, []);

  return (
    <>
      <AssistantChat
        projectId={projectId}
        cuotaInicial={cuotaInicial}
        nombres={nombres}
        etiquetas={etiquetas}
        sugerenciaExterna={sugerencia}
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

      <ReportCanvas inicial={lienzoInicial} slots={slots} guardar={guardar} onGenerar={generar} />
    </>
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
  'Añádeme un gráfico de ... para ver ... (por ejemplo: las tareas paradas por columna, o lo que cierra el equipo cada semana)';
