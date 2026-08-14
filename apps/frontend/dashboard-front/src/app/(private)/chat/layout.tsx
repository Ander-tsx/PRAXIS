import { type ChatDeProyecto, ChatDirectory } from '@/components/organisms/ChatDirectory';
import {
  AppHeader,
  type ChatContact,
  type DirectConversation,
  type UserProfile,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat',
};

/**
 * El armazón del chat privado: la lista a la izquierda, la conversación a la
 * derecha.
 *
 * ## Por qué la lista vive en el layout y no en cada página
 *
 * Next conserva los layouts entre navegaciones del mismo segmento, así que
 * cambiar de conversación **no vuelve a pedir la lista ni la remonta**. Con la
 * lista dentro de la página, cada clic la desmontaría: parpadearían los nombres,
 * las insignias y la posición del desplazamiento, y se perdería el sitio en el
 * que estabas mirando.
 *
 * ## De dónde sale a quién puedes escribir
 *
 * De `/me/chats/contacts`, que devuelve **solo a quien comparte proyecto
 * contigo**. Esa regla la aplica projects-service y no esta pantalla: aquí solo
 * se pinta. Si se pintara desde el directorio de la plataforma, saldría gente a
 * la que el backend rechazaría al escribir.
 */
export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  /* El layout no recibe los params del hijo, así que quién está activo se
     resuelve abajo — ver la nota de `activoDesde`. */
  params?: Promise<Record<string, string>>;
}) {
  const api = createServerApiClient();

  /* Cada `catch` deja su bloque vacío en vez de tumbar la pantalla: que falle
     una lista no puede impedir leer la conversación que ya está abierta. */
  const [conversaciones, contactos, proyectos] = await Promise.all([
    api.get<DirectConversation[]>('/me/chats').catch(() => [] as DirectConversation[]),
    api.get<ChatContact[]>('/me/chats/contacts').catch(() => [] as ChatContact[]),
    /* Los chats de proyecto salen aquí para que enterarte de que hay algo nuevo
       no obligue a recorrer proyecto por proyecto. Al pulsarlos se sale de esta
       zona, a la pantalla del proyecto, que es donde el chat tiene sentido. */
    api
      .get<ChatDeProyecto[]>('/me/chats/projects')
      .catch(() => [] as ChatDeProyecto[]),
  ]);

  /**
   * Los perfiles de todo el que salga en la columna.
   *
   * ⚠️ Se piden **por id**, no con `/users?limit=100`. Aquello es la primera
   * página del directorio de toda la plataforma y deja de contener a tu gente en
   * cuanto hay más de cien cuentas — el mismo fallo que ya se arregló en la
   * pestaña Equipo, que enseñaba el UUID crudo y «Correo no disponible».
   */
  const ids = [
    ...new Set([
      ...conversaciones.map((conversacion) => conversacion.peerId),
      ...contactos.map((contacto) => contacto.userId),
      /* Quien escribió el último mensaje de un chat de proyecto puede no estar
         en tus contactos —salió del equipo después—, y su nombre hace falta para
         el resumen de la fila. */
      ...proyectos.map((chat) => chat.ultimo?.authorId).filter((id): id is string => Boolean(id)),
    ]),
  ];

  const perfiles = await Promise.all(
    ids.map((id) => api.get<UserProfile>(`/users/${id}`).catch(() => null)),
  );

  const usersById = new Map(
    perfiles.filter((perfil): perfil is UserProfile => perfil !== null).map((p) => [p.id, p]),
  );

  const activo = (await params)?.peerId ?? null;

  return (
    <AppHeader title="Chat">
      <div className="flex flex-col gap-5 sm:flex-row">
        <ChatDirectory
          conversaciones={conversaciones}
          contactos={contactos}
          proyectos={proyectos}
          usersById={usersById}
          activo={activo}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AppHeader>
  );
}
