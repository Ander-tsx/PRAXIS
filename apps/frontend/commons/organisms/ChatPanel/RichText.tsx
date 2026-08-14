import type { ChatRefKind } from '../../api/chat-refs';
import { trocearMensaje } from '../../api/chat-refs';
import { alpha, colors } from '../../tokens';

/**
 * A dónde lleva cada tipo de referencia, y cómo se pinta.
 *
 * ⚠️ Las rutas llevan el prefijo de zona completo porque una etiqueta puede
 * pintarse desde cualquier sitio —una mención escrita en el chat de un proyecto
 * se lee también desde el centro de mensajes—, así que la navegación es dura.
 *
 * `project`, `workspace` y `board` **cuelgan todos de la ruta del proyecto**: la
 * pantalla del proyecto es la que sabe abrir un espacio o un tablero concreto, y
 * no hay URL propia para ellos. Con el id en vez del slug la URL sale fea, pero
 * el guard acepta las dos formas y una etiqueta que lleva a algún sitio vale más
 * que una bonita que no lleva.
 */
const ESTILO_POR_TIPO: Record<ChatRefKind, { color: string; icono: string }> = {
  user: { color: colors.primary, icono: '' },
  /* Los tres siguientes ya no se ofrecen al escribir —`/` solo enlaza tareas—
     pero siguen apareciendo en mensajes escritos antes del cambio, así que se
     pintan igual. Un mensaje viejo se lee como se escribió. */
  project: { color: colors.accent, icono: '◆' },
  workspace: { color: colors.accent, icono: '▦' },
  board: { color: colors.info, icono: '▤' },
  task: { color: colors.success, icono: '✓' },
};

/**
 * A dónde lleva cada etiqueta **sin necesidad de saber en qué chat estás**.
 *
 * ⚠️ Antes esto lo ponía cada zona, y por eso una tarea enlazaba en el chat de un
 * proyecto y **no en una conversación privada**: allí no se sabe de qué proyecto
 * es la tarea, y la etiqueta solo lleva su id.
 *
 * Se resuelve con `/projects/tarea/<id>`, una ruta que busca la tarea, encuentra
 * su proyecto y redirige. Así la misma etiqueta funciona en los dos sitios y no
 * hubo que cambiar el formato de los mensajes ya escritos.
 *
 * Una mención lleva a la conversación privada con esa persona: es lo que
 * cualquiera espera al pulsar un nombre.
 */
function destinoDe(kind: ChatRefKind, id: string): string | null {
  switch (kind) {
    case 'user':
      return `/dashboard/chat/${id}`;
    case 'task':
      return `/projects/tarea/${id}`;
    /* Un proyecto se abre por su id: el guard acepta id y slug, así que la URL
       sale fea pero lleva a algún sitio — que es lo que importa. Espacios y
       tableros necesitan el proyecto en la ruta y la etiqueta no lo trae, así
       que se quedan sin enlace en vez de llevar a un 404. */
    case 'project':
      return `/projects/${id}`;
    default:
      return null;
  }
}

export interface RichTextProps {
  cuerpo: string;
  /**
   * Traduce una referencia a una URL. Lo pone quien monta el chat, que es quien
   * conoce el proyecto en el que está.
   *
   * Si devuelve `null`, la etiqueta se pinta igual pero **sin enlace**: es lo que
   * pasa con una tarea vista desde una conversación privada, donde no se sabe de
   * qué proyecto es.
   */
  hrefDeRef?: (kind: ChatRefKind, id: string) => string | null;
  /** Se resalta distinto cuando la mención eres tú. */
  currentUserId?: string;
}

/**
 * El cuerpo de un mensaje, con sus menciones y referencias pintadas.
 *
 * ⚠️ **Nunca se renderiza como HTML.** Se trocea el texto y se pinta cada parte
 * como nodo de React, así que lo que escribió una persona no puede convertirse
 * en marcado. El formato de las etiquetas es cerrado y su id tiene forma de
 * UUID: una cadena cualquiera entre paréntesis no pasa por referencia.
 *
 * ⚠️ **Una etiqueta cuyo destino ya no existe se pinta igual.** El nombre está
 * escrito dentro del mensaje, así que no hay nada que resolver ni nada que pueda
 * fallar: como mucho pierde el enlace. Es justo lo que se buscaba al meter el
 * nombre en el formato.
 */
export function RichText({ cuerpo, hrefDeRef, currentUserId }: RichTextProps) {
  const trozos = trocearMensaje(cuerpo);

  return (
    /* `overflow-wrap:anywhere` y no solo `break-words`: aquel no parte un
         token larguísimo sin espacios —una URL pegada— y eso basta para sacar
         barra horizontal en toda la conversación. */
    <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-primary [overflow-wrap:anywhere]">
      {trozos.map((trozo, indice) => {
        if (trozo.tipo === 'texto') {
          // biome-ignore lint/suspicious/noArrayIndexKey: los trozos no tienen id propio y la lista solo cambia si cambia el mensaje entero
          return <span key={indice}>{trozo.texto}</span>;
        }

        const estilo = ESTILO_POR_TIPO[trozo.kind];
        const esYo = trozo.kind === 'user' && trozo.id === currentUserId?.toLowerCase();
        /* Tu propia mención no enlaza: escribirte a ti mismo no existe, y el
           backend lo rechaza con un 400. */
        const destino = esYo
          ? null
          : (hrefDeRef?.(trozo.kind, trozo.id) ?? destinoDe(trozo.kind, trozo.id));

        const contenido = (
          <>
            {/* El separador va dentro del texto y no en un `gap`: sin caja
                flex no hay `gap` que valga, y un margen no se colapsa al
                partirse la línea. */}
            {estilo.icono && (
              <span aria-hidden="true" className="text-[0.85em] opacity-70">
                {`${estilo.icono} `}
              </span>
            )}
            {trozo.sigil === '@' ? `@${trozo.label}` : trozo.label}
          </>
        );

        const clases =
          /**
           * ⚠️ **`inline` y no `inline-flex`.** Un `inline-flex` es una caja que
           * **no se parte nunca**: una tarea con título largo empujaba el ancho
           * de la burbuja hasta sacar barra horizontal en toda la conversación.
           * En `inline` el texto fluye y se corta por donde toque.
           */
          'mx-0.5 rounded px-1.5 py-0.5 font-medium [overflow-wrap:anywhere]';
        const pintura = {
          /* Al mencionarte a ti, más contraste: es lo que hace que encuentres tu
             nombre recorriendo la conversación sin leerla entera. */
          background: alpha(estilo.color, esYo ? 30 : 14),
          color: estilo.color,
        };

        return destino ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: ídem
            key={indice}
            href={destino}
            className={`${clases} transition-opacity hover:opacity-80`}
            style={pintura}
          >
            {contenido}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: ídem
          <span key={indice} className={clases} style={pintura}>
            {contenido}
          </span>
        );
      })}
    </p>
  );
}
