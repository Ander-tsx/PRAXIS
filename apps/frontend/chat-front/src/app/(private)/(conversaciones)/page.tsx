import { ULTIMO_CHAT_COOKIE, conversacionRecordada } from '@/lib/ultimo-chat';
import type { DirectConversation } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Un chat de proyecto en la bandeja, con lo poco que hace falta aquí. */
interface ChatDeProyecto {
  project: { id: string };
}

/**
 * Mensajes, sin conversación en la URL.
 *
 * ## Vuelve a donde lo dejaste
 *
 * Salir a Avisos o a Análisis y volver reiniciaba la vista: el índice de
 * Mensajes es una pantalla distinta de la conversación, así que volver a `/chat`
 * dejaba la columna derecha vacía y había que buscar otra vez con quién estabas
 * hablando. Ahora el proxy de la zona anota la última conversación abierta en
 * una cookie y aquí se redirige a ella.
 *
 * La cookie se valida al leerla (`conversacionRecordada`): su valor termina en
 * un `redirect()`, y una cookie es algo que manda el navegador, no algo en lo
 * que se pueda confiar por haberla escrito nosotros.
 *
 * ## 🔴 Y validar la **forma** no basta: hay que comprobar que siga existiendo
 *
 * Reportado por el usuario: entrar en Mensajes redirigía solo a una conversación
 * y daba **404**. La cookie era correcta —un UUID bien formado, escrito por
 * nosotros— pero apuntaba a alguien que ya no comparte proyecto, o a una cuenta
 * que ya no está.
 *
 * Lo grave no es el 404: es que ocurría **al entrar**, así que la persona no
 * podía llegar al directorio **nunca**. Cada intento de abrir Mensajes la
 * mandaba de vuelta al mismo 404, sin forma de salir salvo conociendo otra URL.
 * Un atajo de conveniencia dejaba inservible la pantalla entera.
 *
 * Por eso ahora se comprueba contra las conversaciones que la persona tiene de
 * verdad. Si la recordada ya no está, **no se redirige** y se enseña el
 * directorio, que es exactamente lo que hace falta en ese momento.
 *
 * ⚠️ La cookie obsoleta **no se borra aquí**: una page no puede escribir
 * cookies, solo puede hacerlo el proxy o una Server Action. No hace falta —
 * queda inerte y la pisa la próxima conversación que se abra.
 *
 * ⚠️ **No redirige a la primera de la lista cuando no hay recuerdo**, que era la
 * razón original de que esta pantalla existiera: abrir una conversación que
 * nadie pidió **marca sus mensajes como leídos** sin que los haya visto nadie.
 * Volver a la que tú abriste no tiene ese problema — ya la habías leído.
 */
export default async function ChatVacioPage() {
  const { get: getCookie } = await cookies();
  const { get: getHeader } = await headers();
  
  const recordada = conversacionRecordada(getCookie(ULTIMO_CHAT_COOKIE)?.value);
  const userAgent = getHeader('user-agent') || '';
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);

  // En móvil, la lista de chats y la conversación ocupan la misma pantalla.
  // Si redirigimos siempre al último chat, el usuario se queda atrapado en esa
  // conversación y no puede volver a ver el directorio para elegir otra.
  if (!isMobile && recordada && (await sigueAccesible(recordada))) {
    /* Ruta **interna** de la zona: Next le antepone el basePath (`/chat`) al
       redirigir. Con el `/chat/` de cuando esto vivía en dashboard-front saldría
       `/chat/chat/<uuid>`, que es un 404. */
    redirect(`/${recordada}`);
  }

  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8">
      <p className="max-w-sm text-center font-sans text-sm text-text-secondary">
        Elige a alguien de la izquierda para empezar a hablar. Aquí sale quien comparte algún
        proyecto contigo.
      </p>
    </div>
  );
}

/**
 * ¿La conversación recordada sigue estando entre las suyas?
 *
 * Se pregunta por las listas que ya alimentan el directorio, así que no se
 * inventa una comprobación nueva: si sale en la columna de la izquierda, se
 * puede abrir; si no sale, redirigir allí es mandar a un 404.
 *
 * ⚠️ **Ante un fallo de red se responde `false`, no `true`.** Las dos opciones
 * son malas y hay que elegir la que se pueda deshacer: no redirigir deja el
 * directorio delante —con su propio mensaje si tampoco cargó— y quien mira
 * puede pulsar. Redirigir a ciegas sobre un gateway caído reproduce justo el
 * fallo que esto arregla, y sin salida.
 */
async function sigueAccesible(recordada: string): Promise<boolean> {
  const api = createServerApiClient();
  const deProyecto = recordada.startsWith('proyecto/');

  if (deProyecto) {
    const projectId = recordada.slice('proyecto/'.length);
    const chats = await api.get<ChatDeProyecto[]>('/me/chats/projects').catch(() => null);
    return chats?.some((chat) => chat.project.id === projectId) ?? false;
  }

  const conversaciones = await api.get<DirectConversation[]>('/me/chats').catch(() => null);
  return conversaciones?.some((conversacion) => conversacion.peerId === recordada) ?? false;
}
