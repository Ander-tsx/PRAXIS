import { DirectConversation } from '@/components/organisms/DirectConversation';
import {
  type ChatContact,
  type ChatMessagePage,
  personName,
  resolveProfiles,
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

  /**
   * La página vacía de reserva.
   *
   * ⚠️ `channelId` va en blanco **a propósito**: si la carga falló, no sabemos
   * de qué canal es esta conversación, y ese id es justo lo que el panel usa
   * para decidir si un evento del flujo le incumbe. Una cadena vacía no coincide
   * con ningún canal, así que el panel se queda sin tiempo real —que es lo
   * honesto cuando ni siquiera se pudo leer la conversación— en vez de aceptar
   * eventos de un canal que no sabe cuál es.
   */
  const safePage: ChatMessagePage = page || {
    channelId: '',
    items: [],
    muted: false,
    hasMore: false,
    unread: 0,
  };

  /**
   * Los perfiles de quien ha escrito, más el de la otra persona, en **una**
   * petición.
   *
   * ⚠️ Quien escribió puede **ya no compartir proyecto** contigo —salió del
   * equipo después de hablar—, así que su id no está en contactos y hay que
   * pedirlo igualmente o su burbuja saldría con el UUID crudo.
   *
   * ⚠️ Era una petición por autor. Ver la nota del layout y
   * `commons/api/directory.ts`: con el renderizado en el servidor eso agotaba
   * el limitador del gateway, que contaba a toda la plataforma en el mismo cubo.
   */
  const directorio = await resolveProfiles(api, [
    peerId,
    userId,
    ...safePage.items.map((m) => m.authorId),
  ]);

  /* Dónde coincidís, para poner la jerarquía bajo el nombre. Si falla, la
     conversación se abre igual: es contexto, no contenido. */
  const contactos = await api.get<ChatContact[]>('/me/chats/contacts').catch(() => []);
  const comun = contactos.find((contacto) => contacto.userId === peerId)?.proyectos ?? [];

  // Solo se bloquea si no hay proyectos en común Y NO ES ADMIN Y NO HAY MENSAJES PREVIOS
  if (comun.length === 0 && !isAdmin && safePage.items.length === 0) return notFound();

  return (
    <DirectConversation
      peerId={peerId}
      /* `personName` y no `personLabel` con un respaldo a mano: es quien
         distingue «esta cuenta ya no existe» de «no se pudo consultar», que
         antes se leían las dos como lo primero. */
      peerNombre={personName(directorio, peerId)}
      proyectosEnComun={comun}
      page={safePage}
      directorio={directorio}
      currentUserId={userId}
      isAdmin={isAdmin}
    />
  );
}
