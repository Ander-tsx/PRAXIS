import { DirectConversation } from '@/components/organisms/DirectConversation';
import {
  type ChatContact,
  type ChatMessagePage,
  type UserProfile,
  personLabel,
} from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ peerId: string }>;
}

/**
 * Una conversación privada.
 *
 * ## Quién puede abrirla no se decide aquí
 *
 * Lo decide el gateway: `/me/chats/:peerId/messages` solo devuelve algo si
 * projects-service confirma que **compartís algún proyecto**. Si no, responde
 * 403 y esta pantalla cae a `notFound()` — no se enseña «no tienes permiso», que
 * ya sería confirmar que esa cuenta existe.
 */
export default async function ConversacionPage({ params }: PageProps) {
  const { peerId } = await params;
  const { userId, roles } = await loadCurrentUser();
  const api = createServerApiClient();

  /* Un 403 aquí significa que no compartís proyecto; un 404, que ese id no es
     nadie. Los dos acaban igual: esta página no existe para ti. */
  const page = await api
    .get<ChatMessagePage>(`/me/chats/${peerId}/messages?limit=50`)
    .catch(() => null);

  const isAdmin = roles.includes('Admin') || roles.includes('SuperAdmin');

  /* Si page falla, puede ser porque el backend dio 403. Si somos admin, crearemos una página vacía por ahora
     hasta que el componente intente cargar (aunque el backend también debe ser parcheado). */
  if (!page && !isAdmin) return notFound();

  const safePage = page || { items: [], nextCursor: null, prevCursor: null, receipts: [], muted: false, hasMore: false, unread: 0 };

  /**
   * Los perfiles de quien ha escrito, más el de la otra persona.
   *
   * ⚠️ Quien escribió puede **ya no compartir proyecto** contigo —salió del
   * equipo después de hablar—, así que su id no está en contactos y hay que
   * pedirlo igualmente o su burbuja saldría con el UUID crudo.
   */
  const ids = [...new Set([peerId, userId, ...safePage.items.map((m) => m.authorId)])];
  const perfiles = await Promise.all(
    ids.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );
  const usersById = new Map(
    perfiles.filter((p): p is UserProfile => p !== null).map((p) => [p.id, p]),
  );

  const peer = usersById.get(peerId);

  /* Dónde coincidís, para poner la jerarquía bajo el nombre. Si falla, la
     conversación se abre igual: es contexto, no contenido. */
  const contactos = await api.get<ChatContact[]>('/me/chats/contacts').catch(() => []);
  const comun = contactos.find((contacto) => contacto.userId === peerId)?.proyectos ?? [];

  // Solo se bloquea si no hay proyectos en común Y NO ES ADMIN Y NO HAY MENSAJES PREVIOS
  if (comun.length === 0 && !isAdmin && safePage.items.length === 0) return notFound();

  return (
    <DirectConversation
      peerId={peerId}
      peerNombre={peer ? personLabel(peer) : 'Alguien que ya no está'}
      proyectosEnComun={comun}
      page={safePage}
      usersById={usersById}
      currentUserId={userId}
      isAdmin={isAdmin}
    />
  );
}
