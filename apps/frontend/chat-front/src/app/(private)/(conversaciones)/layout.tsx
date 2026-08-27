import { type ChatDeProyecto, ChatDirectory } from '@/components/organisms/ChatDirectory';
import {
  AppHeader,
  type ChatContact,
  type DirectConversation,
  resolveProfiles,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';

export const metadata: Metadata = {
  title: 'Mensajes directos',
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
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
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
   * Los perfiles de todo el que salga en la columna, en **una** petición.
   *
   * ⚠️ Se piden por id y no con `/users?limit=100`: aquello es la primera página
   * del directorio de toda la plataforma y deja de contener a tu gente en cuanto
   * hay más de cien cuentas — el mismo fallo que ya se arregló en la pestaña
   * Equipo, que enseñaba el UUID crudo y «Correo no disponible».
   *
   * ⚠️ Y se piden **de una vez**, no uno a uno. Esto era un `ids.map(id =>
   * api.get('/users/'+id))`, es decir una petición por persona de la columna. Al
   * renderizarse en el servidor, todas salían con la IP del servidor de Next, y
   * el limitador del gateway las contaba en el mismo cubo que las de todos los
   * demás usuarios: se agotaba, llegaban 429, el `catch` se los tragaba y la
   * columna se llenaba de «Alguien que ya no está» sin fotos hasta que la
   * ventana del limitador se reiniciaba. Explicación entera en
   * `commons/api/directory.ts`.
   */
  const directorio = await resolveProfiles(api, [
    ...conversaciones.map((conversacion) => conversacion.peerId),
    ...contactos.map((contacto) => contacto.userId),
    /* Quien escribió el último mensaje de un chat de proyecto puede no estar en
       tus contactos —salió del equipo después—, y su nombre hace falta para el
       resumen de la fila. */
    ...proyectos.map((chat) => chat.ultimo?.authorId),
  ]);

  const cookieStore = await cookies();
  const compactoCookie = cookieStore.get('praxis_conversations_compacto')?.value === 'true';

  return (
    <AppHeader title="Mensajes directos">
      {/**
       * El contenedor que llena el resto de la pantalla.
       *
       * `AppHeader` mete el contenido en un `<main>` con desplazamiento propio y
       * relleno; un `flex-1` aquí dentro no tiene contra qué crecer, así que el
       * panel se quedaba en su tope y dejaba una franja vacía hasta el borde de
       * la pantalla. Restando la cabecera (4rem) y el relleno del `main` (3rem
       * arriba y abajo en escritorio) el chat llega justo hasta abajo.
       */}
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-5 sm:flex-row">
        {/**
         * ⚠️ **Qué conversación está abierta lo resuelve el propio directorio,
         * leyendo la ruta.**
         *
         * Salía de `params.peerId` de este layout, y ese objeto está **siempre
         * vacío**: un layout solo recibe los parámetros de los segmentos que
         * tiene por encima, y `/chat` no tiene ninguno dinámico. O sea que
         * `activo` era `null` en todos los casos: ninguna fila se marcaba nunca
         * como seleccionada y en móvil la lista no se apartaba al abrir un chat.
         * `ChatDirectory` ya es un componente de cliente, así que lo lee de
         * `usePathname()`, que sí lo sabe.
         */}
        <ChatDirectory
          conversaciones={conversaciones}
          contactos={contactos}
          proyectos={proyectos}
          directorio={directorio}
          compactoInicial={compactoCookie}
        />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </AppHeader>
  );
}
