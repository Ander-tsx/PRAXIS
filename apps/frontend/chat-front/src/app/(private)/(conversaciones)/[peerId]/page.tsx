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
 * ## Quién puede abrirla no se decide aquí, y esa es toda la regla
 *
 * Lo decide el gateway: `/me/chats/:peerId/messages` solo devuelve algo si
 * `DirectChatController.puedeHablarCon` lo permite. Si no, responde 403 y esta
 * pantalla cae a `notFound()` — no se enseña «no tienes permiso», que ya sería
 * confirmar que esa cuenta existe.
 *
 * ## 🔴 La puerta es la organización, no el proyecto en común
 *
 * ⚠️ Desde el 2026-08-28 (D5/B7 de `PLAN-ORGANIZACION-ACTIVA`) se puede escribir
 * a **quien comparta alguna organización contigo**, no solo a quien comparta un
 * tablero. El asiento ya es la frontera del producto: exigir además un proyecto
 * impedía escribirle a alguien de tu propio equipo al que todavía no has metido
 * en nada.
 *
 * **Esta pantalla siguió aplicando la regla vieja durante toda la etapa**, y por
 * su cuenta: `GET /me/chats/contacts` devolvía al compañero —el gateway lo
 * compone a propósito con `proyectos: []`, y su comentario lo dice— el buscador
 * lo ofrecía, y al pulsarlo este archivo respondía 404. Se retiró: **la única
 * comprobación es la del gateway**, que es la que no se puede falsificar.
 *
 * Lo que sí sigue aquí es `proyectosEnComun`, y solo para **contarlo**: es la
 * jerarquía que se pinta bajo el nombre («Administrador en Rediseño»). Vacío es
 * un dato legítimo, no una negativa.
 */
export default async function ConversacionPage({ params }: PageProps) {
  const { peerId } = await params;
  const { userId, roles } = await loadCurrentUser();
  const api = createServerApiClient();

  /* Un 403 aquí significa que no compartís **organización**; un 404, que ese id
     no es nadie. Los dos acaban igual: esta página no existe para ti. */
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

  /* 🕳️ Aquí había una segunda puerta —«sin proyecto en común, 404»— y le cerraba
     el paso a gente a la que el gateway ya había dejado entrar. Ver el aviso de
     la cabecera. La única comprobación es la de arriba: si `messages` respondió,
     puedes estar aquí. */

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
      /* 🔴 **Se puede escribir si el gateway dejó leer.** `page` es nulo solo
         cuando `GET /me/chats/:peerId/messages` falló, y entonces ni siquiera
         sabemos de qué canal es esta conversación (ver `safePage`): abrir el
         compositor sería prometer un envío que no tiene a dónde ir.

         Lo que NO se comprueba aquí es si compartís proyecto. Esa era la regla
         de antes del 2026-08-28 y la aplicaba el navegador por su cuenta,
         apagando el compositor con gente a la que el servidor sí deja
         escribir. */
      canWrite={page !== null}
      isAdmin={isAdmin}
    />
  );
}
