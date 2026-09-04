import { ProjectConversation } from '@/components/organisms/ProjectConversation';
import type {
  ChatMessagePage,
  EffectivePermissions,
  ProjectDetail,
  ProjectMember,
} from '@praxis/commons';
import { resolveProfiles } from '@praxis/commons';
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

  const [page, project, permisos, miembros] = await Promise.all([
    api.get<ChatMessagePage>(`/projects/${projectId}/chat/messages?limit=50`).catch(() => null),
    api.get<ProjectDetail>(`/projects/${projectId}`).catch(() => null),
    api.get<EffectivePermissions>(`/projects/${projectId}/permissions/me`).catch(() => null),
    /* El equipo, para el desplegable de `@`: quien todavía no ha escrito no
       está entre los autores y saldría como un trozo de UUID. */
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .catch(() => [] as ProjectMember[]),
  ]);

  if (!page || !project) return notFound();

  /**
   * Los perfiles de quien ha escrito **y de todo el equipo**.
   *
   * ⚠️ Los dos conjuntos, y ninguno sobra. Quien escribió puede **haber salido
   * del proyecto** después, así que no está entre los miembros y su burbuja
   * saldría con el UUID crudo; y quien está en el equipo pero **todavía no ha
   * escrito** no está entre los autores, así que el desplegable de `@` lo
   * ofrecía como «22222222» —el trozo de UUID al que cae `pedirSugerencias`
   * cuando no encuentra el perfil—.
   *
   * Se piden por id y no con `/users?limit=100`: aquello es la primera página
   * del directorio de toda la plataforma y deja de contener a tu gente en
   * cuanto hay más de cien cuentas (CLAUDE.md).
   *
   * ⚠️ Y **de una vez**, no uno a uno. Un equipo de veinte eran veinte
   * peticiones por carga, todas con la IP del servidor de Next: agotaban el
   * limitador del gateway y el `catch` convertía los 429 en «Alguien que ya no
   * está» sin fotos. Ver `commons/api/directory.ts`.
   */
  const directorio = await resolveProfiles(api, [
    userId,
    ...page.items.map((mensaje) => mensaje.authorId),
    ...miembros.map((miembro) => miembro.userId),
  ]);

  return (
    <ProjectConversation
      projectId={project.id}
      projectName={project.name}
      projectSlug={project.slug}
      projectIconKey={project.iconKey ?? null}
      projectColor={project.color ?? null}
      page={page}
      directorio={directorio}
      currentUserId={userId}
      /* Escribir es `canComment`, el mismo permiso que comentar en una tarea.
         ⚠️ El mapa va **anidado** en `permissions`: `permissions/me` devuelve
         `{ permissions, projectStatus, … }`, y leerlo un nivel más arriba
         dejaba el chat en solo lectura para todo el mundo, dueño incluido.
         Si no llega, se lee pero no se escribe: el gateway rechazaría igual y
         así el motivo se ve antes de teclear. */
      canWrite={permisos?.permissions.canComment === true}
      /* Menos tú: el «visto por todos» no se espera a sí mismo. */
      otrosDelEquipo={Math.max(0, miembros.length - 1)}
    />
  );
}
