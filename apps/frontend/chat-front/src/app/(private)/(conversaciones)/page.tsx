import { ULTIMO_CHAT_COOKIE, conversacionRecordada } from '@/lib/ultimo-chat';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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
 * ⚠️ **No redirige a la primera de la lista cuando no hay recuerdo**, que era la
 * razón original de que esta pantalla existiera: abrir una conversación que
 * nadie pidió **marca sus mensajes como leídos** sin que los haya visto nadie.
 * Volver a la que tú abriste no tiene ese problema — ya la habías leído.
 */
export default async function ChatVacioPage() {
  const recordada = conversacionRecordada((await cookies()).get(ULTIMO_CHAT_COOKIE)?.value);
  /* Ruta **interna** de la zona: Next le antepone el basePath (`/chat`) al
     redirigir. Con el `/chat/` de cuando esto vivía en dashboard-front saldría
     `/chat/chat/<uuid>`, que es un 404. */
  if (recordada) redirect(`/${recordada}`);

  return (
    <div className="flex min-h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8">
      <p className="max-w-sm text-center font-sans text-sm text-text-secondary">
        Elige a alguien de la izquierda para empezar a hablar. Aquí sale quien comparte algún
        proyecto contigo.
      </p>
    </div>
  );
}
