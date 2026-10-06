import { ULTIMO_CHAT_COOKIE, conversacionRecordada } from '@/lib/ultimo-chat';
import {
  type DirectConversation,
  ListaDeChatsMovil,
  type ProjectChatSummary,
} from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { getEsMovilInicial } from '@praxis/commons/theme';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * El prefijo de esta sección dentro de la aplicación.
 *
 * ⚠️ **Va escrito en cada enlace, y antes no.** Mientras el chat fue una zona,
 * `/chat` era su `basePath` y el router lo ponía solo: los enlaces internos
 * eran `/<peerId>`. Desde F3 de la fusión no hay `basePath` que poner, así que
 * un `/<peerId>` llevaría a la raíz de la aplicación — a la landing.
 */
const CHAT_PATH = '/chat';

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
 * if (!isMobile && recordada) redirect(`${CHAT_PATH}/${recordada}`);
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
 * Y el índice enseña **las conversaciones**, pero solo en móvil: en escritorio
 * la barra lateral ya las lista, así que la pantalla vacía se reduce a un
 * aviso de que hay que elegir un chat.
 *
 * ## En móvil no se vuelve a la última (M8 de `docs/PLAN-MOVIL.md`)
 *
 * La pestaña Chat de la barra inferior pide `?lista=1`, y además el servidor
 * no redirige cuando la pista del dispositivo dice teléfono
 * (`getEsMovilInicial`): en una app de mensajes, la pestaña abre la lista. La
 * pista solo **quita** una redirección, así que equivocarse con ella —una
 * tableta, una ventana estrecha— deja ver el índice, nunca otra cosa.
 *
 * La lista de móvil la pinta el cliente (`ListaDeChatsMovil`) con el directorio
 * del armazón, que está vivo: un mensaje que llega sube su fila y su insignia
 * sin recargar. Antes se pintaba aquí, en el servidor, y se quedaba quieta.
 */
export default async function ChatVacioPage({ searchParams }: PageProps) {
  const { lista } = await searchParams;
  const { get: getCookie } = await cookies();

  const recordada = conversacionRecordada(getCookie(ULTIMO_CHAT_COOKIE)?.value);

  /* `?lista=1` es «quiero el índice», y lo pide la pestaña de móvil. Sin él se
     vuelve a lo último abierto, si sigue accesible — salvo en un teléfono. */
  if (lista !== '1' && recordada && !(await getEsMovilInicial())) {
    const api = createServerApiClient();
    const [directas, deProyecto] = await Promise.all([
      api.get<DirectConversation[]>('/me/chats').catch(() => [] as DirectConversation[]),
      api.get<ProjectChatSummary[]>('/me/chats/projects').catch(() => [] as ProjectChatSummary[]),
    ]);
    const accesible = recordada.startsWith('proyecto/')
      ? deProyecto.some((chat) => chat.project.id === recordada.slice('proyecto/'.length))
      : directas.some((conversacion) => conversacion.peerId === recordada);

    if (accesible) redirect(`${CHAT_PATH}/${recordada}`);
  }

  return (
    <>
      {/* Escritorio: la barra lateral ya lista los chats, así que aquí solo
          hace falta decir qué hacer. Sin buscador, sin lista duplicada. */}
      <div className="mx-auto hidden w-full max-w-md flex-1 flex-col items-center justify-center gap-1 p-8 text-center md:flex">
        <p className="font-sans font-semibold text-xl text-text-primary">Selecciona un chat</p>
        <p className="font-sans text-sm text-text-secondary">
          Elige una conversación de la barra lateral para empezar a escribir.
        </p>
      </div>

      {/* Móvil: esta pantalla es la lista de conversaciones. El armazón del
          chat es `lleno` (no desplaza `<main>`), así que desplaza esta capa;
          los márgenes negativos devuelven el relleno de `AppHeader` para que
          el buscador caiga en el mismo sitio que en Inicio.
          ⚠️ El relleno va en una capa **dentro** de la que desplaza, como en
          `AppHeader`: puesto en la que desplaza, Chromium pega el buscador
          16 px más abajo (cuenta el relleno al fijar lo `sticky`). */}
      <div className="-m-4 flex min-h-0 flex-1 flex-col overflow-y-auto md:hidden">
        <div className="p-4">
          <ListaDeChatsMovil />
        </div>
      </div>
    </>
  );
}
