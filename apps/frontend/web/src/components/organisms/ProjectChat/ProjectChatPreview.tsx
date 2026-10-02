import type { ChatMessagePage, Directory } from '@praxis/commons';
import { personName, textoPlano } from '@praxis/commons';

export interface ProjectChatPreviewProps {
  projectId: string;
  projectName: string;
  /** La última página del chat, ya pedida en el servidor. */
  page: ChatMessagePage;
  /** Quién es quién, y si se pudo preguntar. Ver `commons/api/directory.ts`. */
  directorio: Directory;
  currentUserId: string;
}

/** Cuántos mensajes se enseñan. Los justos para saber de qué se habla. */
const CUANTOS = 4;

/**
 * Una muestra del chat del equipo, con su enlace.
 *
 * ## Por qué una muestra y no el chat
 *
 * El chat entero estuvo aquí y era la peor pantalla para leerlo: por encima
 * iban el título del proyecto, la descripción, la fecha, los contadores y la
 * fila de pestañas, así que a la conversación le quedaba un tercio del alto y
 * había que bajar para verla. Ahora vive en Mensajes, junto a las
 * conversaciones privadas, con la pantalla entera.
 *
 * Lo que hace falta **aquí** es otra cosa: enterarte de que hay conversación y
 * poder entrar. Eso son cuatro líneas y un enlace.
 *
 * Es un componente de servidor a propósito: no hay estado, no hay acciones y no
 * necesita hidratarse.
 */
export function ProjectChatPreview({
  projectId,
  projectName,
  page,
  directorio,
  currentUserId,
}: ProjectChatPreviewProps) {
  /* Los últimos, del más antiguo al más nuevo: el mismo orden que en el chat. */
  const ultimos = page.items.slice(-CUANTOS);

  /* Delega en `personName`: distingue «esta cuenta ya no existe» de «no se
     pudo consultar el directorio», que antes se leían las dos como lo primero. */
  const nombreDe = (userId: string) => personName(directorio, userId, currentUserId);

  /* Cruza de zona —el centro de mensajes tiene la suya propia desde E3— así que
     la ruta lleva el prefijo completo y se navega con un `<a>` duro.

     ⚠️ Con el **UUID** y no con el slug: todo lo anidado bajo `/projects/:id`
     en el gateway espera el UUID (CLAUDE.md). */
  const href = `/chat/proyecto/${projectId}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-sans font-semibold text-2xl text-text-primary">Chat del equipo</h3>
          <p className="font-sans text-sm text-white">
            Lo que se escriba aquí lo ve todo el equipo de {projectName}.
          </p>
        </div>

        <a
          href={href}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-text-inverse transition-opacity hover:opacity-90"
        >
          {page.unread > 0 ? `Abrir el chat · ${page.unread} sin leer` : 'Abrir el chat'}
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7-7 7M21 12H4" />
          </svg>
        </a>
      </div>

      {ultimos.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-elevated px-4 py-6 text-center font-sans text-sm text-white">
          Todavía no hay mensajes en este proyecto.
        </p>
      ) : (
        <a
          href={href}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 transition-colors hover:border-primary"
        >
          {ultimos.map((mensaje) => (
            <span key={mensaje.id} className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-sans text-xs font-semibold text-text-primary">
                {nombreDe(mensaje.authorId)}:
              </span>
              {/* Una línea por mensaje: es una muestra, no la conversación.
                  `textoPlano` quita el formato de las referencias, que aquí
                  solo serían ruido. */}
              <span className="truncate font-sans text-xs text-white">
                {textoPlano(mensaje.body) ||
                  (mensaje.attachments.length > 0 ? 'Ha enviado un archivo' : '')}
              </span>
            </span>
          ))}

          <span className="pt-1 font-sans text-xs text-primary">Ver la conversación entera →</span>
        </a>
      )}
    </section>
  );
}
