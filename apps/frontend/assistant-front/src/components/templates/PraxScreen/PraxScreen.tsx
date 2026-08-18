'use client';

import { AssistantChat, type AssistantQuota, type Project, ProjectPicker } from '@praxis/commons';

export interface PraxScreenProps {
  /** El UUID resuelto, no el slug de la URL. */
  projectId: string;
  proyectos: Project[];
  cuotaInicial: AssistantQuota | null;
  nombres: Record<string, string>;
  etiquetas: Record<string, string>;
}

/**
 * El selector y la conversación.
 *
 * ## Por qué una plantilla de cliente para dos componentes
 *
 * Por la `key`. Al cambiar de proyecto, la conversación tiene que **empezar
 * limpia**: el hilo abierto era de otro proyecto, y sus propuestas apuntan a
 * columnas y tareas que en este no existen. Sin remontar, el historial anterior
 * se quedaría en pantalla ofreciendo botones que darían 404 al pulsarlos.
 *
 * `key={projectId}` es la forma de decirle a React «esto es otro componente, no
 * el mismo con otras props». Cuesta perder el borrador a medio escribir al
 * cambiar de proyecto, y se acepta: escribir una pregunta y luego cambiar de
 * proyecto es un gesto raro, y lo contrario —mandarla al proyecto equivocado—
 * sería peor.
 *
 * ## Sin `alAceptarGrafico`, a propósito
 *
 * Aquí no hay lienzo, así que una propuesta de gráfico no se puede aplicar sobre
 * nada que se esté viendo. `AssistantChat` lo detecta —la prop no llega— y la
 * tarjeta enseña qué gráfico es y remite a Análisis, en vez de ofrecer un
 * «Aceptar» que escribiría en una pantalla invisible. Ver `AccionDelLienzo`.
 */
export function PraxScreen({
  projectId,
  proyectos,
  cuotaInicial,
  nombres,
  etiquetas,
}: PraxScreenProps) {
  return (
    <div className="flex flex-col gap-5">
      <ProjectPicker
        projects={proyectos}
        activeId={projectId}
        label="Hablando de"
        /* Ruta de esta zona y **sin** el basePath: Next añade `/assistant`. El
           slug en la URL, que es lo que se lee y se comparte. Ver §16. */
        pathDe={(proyecto) => `/?p=${encodeURIComponent(proyecto.slug)}`}
        vacio="No tienes ningún proyecto con análisis abierto."
      />

      <AssistantChat
        key={projectId}
        projectId={projectId}
        cuotaInicial={cuotaInicial}
        nombres={nombres}
        etiquetas={etiquetas}
      />
    </div>
  );
}
