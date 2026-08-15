import type { Board, ProjectDetail, Workspace } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { notFound, redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ boardId: string }>;
}

/**
 * `/projects/tablero/<id>` → el tablero abierto en su espacio y proyecto.
 *
 * El mismo problema que resuelve `tarea/[taskId]`, un peldaño más abajo: una
 * etiqueta `/[Nombre](board:id)` solo lleva el id del tablero, y para abrirlo
 * hace falta su proyecto —que ya sabe abrir el espacio correcto con
 * `?board=`— en la URL. En una conversación privada eso no se sabe de
 * antemano, así que la etiqueta apunta aquí siempre y el servidor resuelve
 * la cadena tablero → espacio → proyecto con lo que ya expone el gateway.
 *
 * ⚠️ **`tablero` es un segmento estático**, igual que `tarea`: gana sobre
 * cualquier proyecto cuyo slug coincida.
 */
export default async function TableroPage({ params }: PageProps) {
  const { boardId } = await params;
  const api = createServerApiClient();

  /* Un 403 —tablero de un proyecto que no puedes ver— y un 404 acaban igual:
     para ti ese tablero no existe. */
  const tablero = await api.get<Board>(`/boards/${boardId}`).catch(() => null);
  if (!tablero) return notFound();

  const espacio = await api.get<Workspace>(`/workspaces/${tablero.workspaceId}`).catch(() => null);
  if (!espacio) return notFound();

  /* El slug es solo estético: el guard acepta el id igual, así que un fallo
     aquí da una URL fea en vez de un enlace roto. */
  const proyecto = await api.get<ProjectDetail>(`/projects/${espacio.projectId}`).catch(() => null);

  redirect(`/${proyecto?.slug ?? espacio.projectId}?board=${tablero.id}`);
}
