import { ChatSearch } from '@/components/organisms/ChatSearch';
import { ULTIMO_CHAT_COOKIE, conversacionRecordada } from '@/lib/ultimo-chat';
import {
  Avatar,
  type ChatContact,
  type DirectConversation,
  ProjectMonogram,
  type ProjectChatSummary,
  avatarHref,
  personName,
  resolveProfiles,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** El proxy de esta zona, para las fotos. Su basePath es `/chat`. */
const ZONE_PATH = '/chat';

interface PageProps {
  searchParams: Promise<{ lista?: string }>;
}

/**
 * El índice de Mensajes: tus conversaciones, y un buscador para abrir una nueva.
 *
 * ## 🔴 Lo que había, y por qué no valía
 *
 * Esta pantalla decidía por **`user-agent`**:
 *
 * ```ts
 * const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);
 * if (!isMobile && recordada) redirect(`/${recordada}`);
 * ```
 *
 * Dos problemas, y el segundo es el gordo.
 *
 * 1. **Sniffing en un Server Component.** Falla en una ventana estrecha de
 *    escritorio y en una tableta, y el CSS no puede corregirlo después porque la
 *    decisión ya se tomó en el servidor.
 *
 * 2. 🔴 **Era el parche de un bucle.** Una conversación en móvil se pinta a
 *    pantalla completa (`pantallaCompletaEnMovil`) y su única salida es un enlace
 *    a `/chat`. Con el redirect activo, `/chat` devuelve **a la conversación que
 *    se acaba de dejar**: pulsar «Conversaciones» no hacía nada. Apagar el
 *    redirect en móvil lo escondía, a costa de que quien entrara desde un
 *    teléfono no viera nunca sus conversaciones — solo el buscador de contactos,
 *    que es **con quién puedes hablar**, no con quién ya hablas.
 *
 * ## Lo que hay ahora
 *
 * El recuerdo se conserva —abrir Mensajes y caer donde lo dejaste está bien— y
 * la salida de móvil pide explícitamente el índice con `?lista=1`. Es
 * determinista, no mira el `user-agent`, y las dos plataformas se comportan
 * igual: quien quiere la lista la pide, y quien no dice nada vuelve a lo último.
 *
 * Y el índice enseña **las conversaciones**, no solo el buscador. En un teléfono
 * es la pantalla de la lista de cualquier app de mensajería; en escritorio es
 * redundante con la barra lateral, que es una redundancia barata.
 */
export default async function ChatVacioPage({ searchParams }: PageProps) {
  const { lista } = await searchParams;
  const { get: getCookie } = await cookies();

  const api = createServerApiClient();

  const recordada = conversacionRecordada(getCookie(ULTIMO_CHAT_COOKIE)?.value);

  /* Las dos listas hacen falta igualmente: para pintar el índice, y para
     comprobar que lo recordado sigue siendo accesible antes de redirigir a
     ello. Pedirlas antes del `redirect()` no cuesta nada en el camino largo. */
  const [directas, deProyecto, contactos] = await Promise.all([
    api.get<DirectConversation[]>('/me/chats').catch(() => [] as DirectConversation[]),
    api.get<ProjectChatSummary[]>('/me/chats/projects').catch(() => [] as ProjectChatSummary[]),
    api.get<ChatContact[]>('/me/chats/contacts').catch(() => [] as ChatContact[]),
  ]);

  /* `?lista=1` es «quiero el índice», y lo pide la salida de móvil de una
     conversación. Sin él se vuelve a lo último abierto, si sigue accesible. */
  if (lista !== '1' && recordada) {
    const accesible = recordada.startsWith('proyecto/')
      ? deProyecto.some((chat) => chat.project.id === recordada.slice('proyecto/'.length))
      : directas.some((conversacion) => conversacion.peerId === recordada);

    if (accesible) redirect(`/${recordada}`);
  }

  /* Un solo viaje al directorio para todo lo que pinta un nombre: los
     interlocutores de las conversaciones abiertas y los contactos del buscador.
     Eran dos, y el limitador del gateway cuenta a toda la plataforma en el mismo
     cubo (ver `commons/api/directory.ts`). */
  const directorio = await resolveProfiles(api, [
    ...directas.map((conversacion) => conversacion.peerId),
    ...contactos.map((contacto) => contacto.userId),
  ]);

  const hayConversaciones = directas.length > 0 || deProyecto.some((chat) => chat.channelId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-4 sm:p-8">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl text-text-primary">Tus mensajes</h2>
        <p className="font-sans text-sm text-text-secondary">
          {hayConversaciones
            ? 'Sigue donde lo dejaste, o busca a alguien para empezar una conversación nueva.'
            : 'Todavía no tienes ninguna conversación. Busca a alguien de tu organización para empezar.'}
        </p>
      </header>

      {hayConversaciones && (
        <section className="flex flex-col gap-1">
          <h3 className="px-1 pb-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Conversaciones
          </h3>

          {deProyecto
            /* Sin canal es un proyecto en el que nadie ha escrito nunca: sale en
               la barra lateral —desde donde se abre y se estrena— pero no en una
               lista que dice «tus conversaciones». */
            .filter((chat) => chat.channelId)
            .map((chat) => (
              <Link
                key={chat.project.id}
                href={`/proyecto/${chat.project.id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/5"
              >
                <ProjectMonogram
                  id={chat.project.id}
                  name={chat.project.name}
                  iconKey={chat.project.iconKey}
                  color={chat.project.color}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-sm font-medium text-text-primary">
                    {chat.project.name}
                  </span>
                  <span className="truncate font-sans text-xs text-text-secondary">
                    {resumen(chat.ultimo)}
                  </span>
                </span>
                <Insignia cuantos={chat.unread} />
              </Link>
            ))}

          {directas.map((conversacion) => (
            <Link
              key={conversacion.peerId}
              href={`/${conversacion.peerId}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/5"
            >
              <Avatar
                label={personName(directorio, conversacion.peerId)}
                size="sm"
                src={avatarHref(
                  directorio.perfiles.get(conversacion.peerId)?.avatarUrl,
                  `${ZONE_PATH}/api/gateway`,
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-sm font-medium text-text-primary">
                  {personName(directorio, conversacion.peerId)}
                </span>
                <span className="truncate font-sans text-xs text-text-secondary">
                  {resumen(conversacion.ultimo)}
                </span>
              </span>
              <Insignia cuantos={conversacion.unread} />
            </Link>
          ))}
        </section>
      )}

      <ChatSearch contactos={contactos} directorio={directorio} zonePath={ZONE_PATH} />
    </div>
  );
}

/**
 * El resumen de una fila.
 *
 * ⚠️ `deletedAt` antes que `body`: al borrar, el servidor vacía el cuerpo, así
 * que sin esta rama la fila de una conversación cuyo último mensaje se borró se
 * queda en blanco y se lee como si estuviera vacía.
 */
function resumen(ultimo: { body: string; deletedAt?: string | null } | null): string {
  if (!ultimo) return 'Sin mensajes';
  if (ultimo.deletedAt) return 'Mensaje eliminado';
  /* El cuerpo puede traer marcado; en un resumen de una línea estorba. */
  const plano = ultimo.body.replace(/<[^>]*>?/g, '').trim();
  return plano.length > 60 ? `${plano.slice(0, 60)}…` : plano || 'Sin mensajes';
}

/** Sin nada pendiente no se pinta: una insignia con un cero no informa de nada. */
function Insignia({ cuantos }: { cuantos: number }) {
  if (cuantos <= 0) return null;
  return (
    <span
      className="min-w-[18px] shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-center font-sans text-[10px] font-semibold text-primary-foreground"
      aria-label={`${cuantos} sin leer`}
    >
      {cuantos > 99 ? '99+' : cuantos}
    </span>
  );
}
