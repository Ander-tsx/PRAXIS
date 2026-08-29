import { ULTIMO_CHAT_COOKIE, conversacionRecordada } from '@/lib/ultimo-chat';
import { type ChatContact, type DirectConversation, resolveProfiles } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChatSearch } from '@/components/organisms/ChatSearch';

interface ChatDeProyecto {
  project: { id: string };
}

export default async function ChatVacioPage() {
  const { get: getCookie } = await cookies();
  const { get: getHeader } = await headers();

  const recordada = conversacionRecordada(getCookie(ULTIMO_CHAT_COOKIE)?.value);
  const userAgent = getHeader('user-agent') || '';
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(userAgent);

  const api = createServerApiClient();

  // En móvil, si redirigimos siempre al último chat y no tienen cómo abrir el sidebar fácil, 
  // podría ser un problema, pero ahora el sidebar está en el AppShell.
  // Mantenemos la redirección si hay chat recordado y sigue accesible.
  if (!isMobile && recordada) {
    const deProyecto = recordada.startsWith('proyecto/');
    let accesible = false;

    if (deProyecto) {
      const projectId = recordada.slice('proyecto/'.length);
      const chats = await api.get<ChatDeProyecto[]>('/me/chats/projects').catch(() => null);
      accesible = chats?.some((chat) => chat.project.id === projectId) ?? false;
    } else {
      const conversaciones = await api.get<DirectConversation[]>('/me/chats').catch(() => null);
      accesible = conversaciones?.some((conversacion) => conversacion.peerId === recordada) ?? false;
    }

    if (accesible) {
      redirect(`/${recordada}`);
    }
  }

  // Si llegamos aquí (no hay redirección), mostramos el buscador de contactos
  const contactos = await api.get<ChatContact[]>('/me/chats/contacts').catch(() => [] as ChatContact[]);
  const directorio = await resolveProfiles(api, contactos.map(c => c.userId));
  
  // Obtenemos zonePath desde la cabecera x-invoke-path o asumiendo el default '/chat'
  const zonePath = '/chat'; 

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
            <svg className="w-8 h-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">Tus mensajes</h2>
          <p className="text-sm text-white/50 max-w-sm">
            Busca un contacto para iniciar una conversación nueva, o selecciona uno existente desde la barra lateral.
          </p>
        </div>
        
        <ChatSearch contactos={contactos} directorio={directorio} zonePath={zonePath} />
      </div>
    </div>
  );
}
