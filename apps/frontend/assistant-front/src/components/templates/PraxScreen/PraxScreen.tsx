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
    /* `min-h-0` en toda la cadena hasta el hilo: es lo que hace que el scroll se
       lo quede la conversación y no la página. Sin él, un flex hijo no encoge por
       debajo de su contenido y el compositor se va al fondo del documento. */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/**
       * El selector, solo cuando hay entre qué elegir.
       *
       * Con un único proyecto era un desplegable de una sola opción: una fila
       * entera de la pantalla para no ofrecer ninguna decisión, y el proyecto ya
       * lo nombra la portada de arriba.
       */}
      {proyectos.length > 1 && (
        <ProjectPicker
          projects={proyectos}
          activeId={projectId}
          label="Hablando de"
          /* Rutas de esta zona y **sin** el basePath: Next añade `/assistant`.
             El slug en la URL, que es lo que se lee y se comparte. Ver §16.
             Un diccionario y no una función: ver la nota de `ProjectPicker`. */
          paths={Object.fromEntries(
            proyectos.map((proyecto) => [proyecto.id, `/?p=${encodeURIComponent(proyecto.slug)}`]),
          )}
          vacio="No tienes ningún proyecto con análisis abierto."
        />
      )}

      <AssistantChat
        key={projectId}
        projectId={projectId}
        cuotaInicial={cuotaInicial}
        nombres={nombres}
        etiquetas={etiquetas}
        /* Aquí la conversación **es** la pantalla: sin tarjeta, ocupando el alto
           disponible y con el compositor abajo del todo. En Análisis el mismo
           organismo va en modo `panel`. */
        variante="pantalla"
      />
    </div>
  );
}
