import { ProjectConversation } from '@/components/organisms/ProjectConversation';
import type {
  ChatMessagePage,
  EffectivePermissions,
  ProjectDetail,
  UserProfile,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

/**
 * El chat del equipo de un proyecto, dentro del centro de mensajes.
 *
 * ## Quién puede abrirlo no se decide aquí
 *
 * Lo decide el gateway: `/projects/:id/chat/messages` responde 403 a quien no
 * esté en el equipo y 404 a un proyecto que no existe. Los dos acaban en
 * `notFound()` — decir «no tienes permiso» ya sería confirmar que ese proyecto
 * existe.
 *
 * ⚠️ El segmento lleva el **UUID**, no el slug: todo lo anidado bajo
 * `/projects/:id` espera el UUID, y solo `GET /projects/:id` traduce un slug
 * (CLAUDE.md). El slug se pide aparte, y solo para el enlace de vuelta.
 */
export default async function ChatDeProyectoPage({ params }: PageProps) {
  const { projectId } = await params;
  const { userId } = await loadCurrentUser();
  const api = createServerApiClient();

  const [page, project, permisos] = await Promise.all([
    api.get<ChatMessagePage>(`/projects/${projectId}/chat/messages?limit=50`).catch(() => null),
    api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null),
    api.get<EffectivePermissions>(`/projects/${projectId}/permissions/me`).catch(() => null),
  ]);

  if (!page || !project) return notFound();

  /**
   * Los perfiles de quien ha escrito.
   *
   * ⚠️ Se piden **por id** y no con un listado del equipo: quien escribió puede
   * haber salido del proyecto después, y su burbuja saldría con el UUID crudo.
   */
  const ids = [...new Set([userId, ...page.items.map((mensaje) => mensaje.authorId)])];
  const perfiles = await Promise.all(
    ids.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );
  const usersById = new Map(
    perfiles.filter((perfil): perfil is UserProfile => perfil !== null).map((p) => [p.id, p]),
  );

  return (
    <ProjectConversation
      projectId={project.id}
      projectName={project.name}
      projectSlug={project.slug}
      page={page}
      usersById={usersById}
      currentUserId={userId}
      /* Escribir es `canComment`, el mismo permiso que comentar en una tarea.
         ⚠️ El mapa va **anidado** en `permissions`: `permissions/me` devuelve
         `{ permissions, projectStatus, … }`, y leerlo un nivel más arriba
         dejaba el chat en solo lectura para todo el mundo, dueño incluido.
         Si no llega, se lee pero no se escribe: el gateway rechazaría igual y
         así el motivo se ve antes de teclear. */
      canWrite={permisos?.permissions.canComment === true}
    />
  );
}
