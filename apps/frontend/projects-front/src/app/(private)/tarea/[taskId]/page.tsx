import type { ProjectDetail, Task } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { notFound, redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ taskId: string }>;
}

/**
 * `/projects/tarea/<id>` → la tarea abierta en su proyecto.
 *
 * ## Por qué existe
 *
 * Una etiqueta `/[Título](task:id)` **solo lleva el id de la tarea**, y para
 * abrirla hace falta el proyecto en la URL. En el chat de un proyecto eso se
 * sabe; en una conversación privada **no**, porque las tareas pueden venir de
 * cualquiera de los proyectos que compartís.
 *
 * Antes de esto, la misma etiqueta enlazaba en un chat y no en el otro. Las
 * alternativas eran peores: meter el proyecto dentro de la etiqueta cambiaría el
 * formato de los mensajes ya escritos, y resolverlo en el navegador obligaría a
 * pedir el catálogo entero solo para pintar un enlace.
 *
 * Así la etiqueta apunta **siempre** al mismo sitio y quien sabe resolverlo es el
 * servidor, que ya tiene la sesión.
 *
 * ⚠️ **`tarea` es un segmento estático y `[id]` es dinámico**: Next resuelve el
 * estático primero, así que esta ruta gana aunque exista un proyecto cuyo slug
 * sea `tarea`. Ese proyecto seguiría abriéndose por `/projects/tarea` —sin nada
 * detrás—, que es otra ruta.
 */
export default async function TareaPage({ params }: PageProps) {
  const { taskId } = await params;
  const api = createServerApiClient();

  /* Un 403 —la tarea es de un proyecto que no puedes ver— y un 404 acaban igual:
     para ti esa tarea no existe. Distinguirlos confirmaría que existe. */
  const tarea = await api.get<Task>(`/tasks/${taskId}`).catch(() => null);
  if (!tarea) return notFound();

  /**
   * El slug, para que la URL final sea legible.
   *
   * Si no se puede resolver se sigue con el id: el guard acepta las dos formas,
   * así que sale una dirección fea pero el enlace **funciona**. Que lleve a algún
   * sitio importa más que cómo se ve.
   */
  const proyecto = await api.get<ProjectDetail>(`/projects/${tarea.projectId}`).catch(() => null);

  redirect(`/${proyecto?.slug ?? tarea.projectId}?task=${tarea.id}`);
}
