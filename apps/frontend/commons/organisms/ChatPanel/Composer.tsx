'use client';

import { KanbanIcon, SquareCheckIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { COLOR_POR_TIPO_DE_REF, type ChatRefKind } from '../../api/chat-refs';
import {
  CHAT_ATTACHMENT_ALLOWED_MIME,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  type ChatAttachment,
  formatBytes,
} from '../../api/domain';
import { alpha, colors } from '../../tokens';
import {
  CapaEtiquetas,
  type Etiqueta,
  TIPOGRAFIA_CAMPO,
  serializarCampo,
  trozosDeCampo,
  visibleDe,
} from './etiquetado';

/** Tope de un mensaje. Espejo de `CHAT_MESSAGE_MAX` en `@praxis/contracts`. */
export const CHAT_MESSAGE_MAX = 4000;

/** Cuántas opciones se enseñan a la vez. Más no cabe sin convertirlo en lista. */
const MAX_SUGERENCIAS = 7;

export interface Sugerencia {
  kind: ChatRefKind;
  id: string;
  label: string;
  /** De dónde cuelga: «Sprint 1 · Rediseño», el correo de una persona. */
  contexto: string;
  /** Solo en tareas: en qué columna está. */
  estado?: string;
}

export interface ComposerProps {
  onEnviar: (cuerpo: string, attachmentIds: string[]) => void;
  enviando: boolean;
  deshabilitado?: boolean;
  placeholder: string;
  sugerencias: Sugerencia[];
  onPedirSugerencias: () => void;
  /**
   * Si `@` ofrece personas.
   *
   * En una conversación privada va apagado: sois dos, mencionar a quien tienes
   * delante no aporta nada, y el desplegable saltando con cada correo que se
   * teclea sí molesta.
   */
  permiteMenciones: boolean;
  respuestaSlot?: ReactNode;
  /**
   * El id del mensaje al que se está respondiendo, si hay uno.
   *
   * Solo para enfocar: al pulsar «Responder» en una burbuja, el cursor debe
   * caer solo en el campo sin que haya que ir a buscarlo con el ratón. Un
   * booleano no bastaría —pulsar «Responder» dos veces sobre el mismo mensaje
   * es el mismo valor y el efecto no volvería a correr—, así que es el id.
   */
  citaId?: string | null;
  /** Los archivos que esperan a que envíes el mensaje. */
  adjuntosPendientes: ChatAttachment[];
  /** Llamar al elegir un archivo del selector: ya subido como borrador. */
  onAdjuntar: (file: File) => void;
  /** Quitar un borrador antes de enviar: se borra del almacenamiento. */
  onQuitarAdjunto: (attachmentId: string) => void;
  /** Verdadero mientras el archivo elegido está subiendo. */
  subiendo: boolean;
}

/** Qué se está escribiendo tras un `@` o un `/`, y desde dónde. */
interface Disparador {
  sigil: '@' | '/';
  desde: number;
  consulta: string;
}

/**
 * Encuentra la etiqueta que se está escribiendo en el cursor.
 *
 * ⚠️ Solo cuenta si el signo va **al principio de palabra**: sin esa condición,
 * un correo (`ana@praxis.dev`) o una fecha (`12/08`) abrirían el desplegable a
 * media frase. Se mira el carácter anterior y se exige que sea espacio, salto o
 * el principio del texto.
 *
 * ⚠️ **Los espacios no cortan la búsqueda**, al revés que en la primera versión:
 * los títulos de tarea los tienen casi siempre («Rediseñar el panel»), y cortar
 * en el primero hacía imposible afinar más allá de una palabra.
 */
function disparadorEn(texto: string, cursor: number): Disparador | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const caracter = texto[i] as string;
    if (caracter === '\n') return null;

    if (caracter === '@' || caracter === '/') {
      const anterior = i === 0 ? '' : (texto[i - 1] as string);
      if (i !== 0 && anterior !== ' ' && anterior !== '\n') return null;
      return { sigil: caracter, desde: i, consulta: texto.slice(i + 1, cursor) };
    }
  }
  return null;
}

/**
 * Ordena las candidatas por lo bien que encajan con lo escrito.
 *
 * Con cien tareas en un proyecto y siete huecos, **el orden es el buscador**. Una
 * que empieza por lo que has escrito va antes que otra que lo lleva en medio, y
 * entre iguales gana la de título más corto — que casi siempre es la buscada.
 */
function ordenarPorCoincidencia(candidatas: Sugerencia[], consulta: string): Sugerencia[] {
  if (!consulta) return candidatas;

  const q = consulta.toLowerCase();
  return [...candidatas].sort((a, b) => {
    const ia = a.label.toLowerCase().indexOf(q);
    const ib = b.label.toLowerCase().indexOf(q);
    if (ia !== ib) return ia - ib;
    return a.label.length - b.label.length;
  });
}

/**
 * El redactor: texto, sugerencias de `@` y `/`, y la cita a la que respondes.
 *
 * ## Lo que se ve y lo que se envía son dos cosas
 *
 * El `<textarea>` contiene **texto legible**: `Oye @María García`. Los ids viven
 * aparte, en `etiquetas`, y solo se pegan al enviar. Antes el campo contenía la
 * etiqueta completa con su UUID a la vista: ilegible mientras escribes, y encima
 * invita a editarla y romperla.
 *
 * El resaltado se pinta con **una capa debajo** que repite el mismo texto: el
 * `<textarea>` va con la tinta transparente y solo se le ve el cursor. Es la
 * única forma de colorear un trozo de un campo de texto, y funciona porque las
 * dos capas contienen exactamente la misma cadena — si divergieran, el cursor
 * dejaría de coincidir con lo que se lee.
 */
export function Composer({
  onEnviar,
  enviando,
  deshabilitado,
  placeholder,
  sugerencias,
  onPedirSugerencias,
  permiteMenciones,
  respuestaSlot,
  citaId,
  adjuntosPendientes,
  onAdjuntar,
  onQuitarAdjunto,
  subiendo,
}: ComposerProps) {
  const [texto, setTexto] = useState('');
  const [cursor, setCursor] = useState(0);
  const [marcada, setMarcada] = useState(0);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const pedidas = useRef(false);

  const disparador = useMemo(() => disparadorEn(texto, cursor), [texto, cursor]);

  /* El catálogo se pide **la primera vez que hace falta**, no al montar: la
     mayoría de los mensajes no llevan etiqueta, y traerlo siempre sería pagar
     una consulta con las tareas de todos los tableros por cada chat abierto. */
  useEffect(() => {
    if (disparador && !pedidas.current) {
      pedidas.current = true;
      onPedirSugerencias();
    }
  }, [disparador, onPedirSugerencias]);

  const candidatas = useMemo(() => {
    if (!disparador) return [];
    if (disparador.sigil === '@' && !permiteMenciones) return [];

    const consulta = disparador.consulta.toLowerCase();
    const delTipo = sugerencias.filter((sugerencia) =>
      disparador.sigil === '@'
        ? sugerencia.kind === 'user'
        : sugerencia.kind === 'task' || sugerencia.kind === 'board',
    );

    return ordenarPorCoincidencia(
      delTipo.filter((sugerencia) => sugerencia.label.toLowerCase().includes(consulta)),
      disparador.consulta,
    ).slice(0, MAX_SUGERENCIAS);
  }, [disparador, sugerencias, permiteMenciones]);

  const abierto = disparador !== null && candidatas.length > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `candidatas` es el disparador; su contenido no se lee aquí
  useEffect(() => setMarcada(0), [candidatas]);

  function elegir(sugerencia: Sugerencia) {
    if (!disparador) return;

    const visible = visibleDe(sugerencia.kind, sugerencia.label);

    /* Un espacio detrás: sin él, seguir escribiendo pega la palabra a la
       etiqueta y el desplegable se vuelve a abrir sobre ella. */
    const nuevo = `${texto.slice(0, disparador.desde)}${visible} ${texto.slice(cursor)}`;
    const posicion = disparador.desde + visible.length + 1;

    setTexto(nuevo);
    setCursor(posicion);
    setEtiquetas((previas) => [...previas, { kind: sugerencia.kind, id: sugerencia.id, visible }]);

    /**
     * ⚠️ **El cursor se coloca en un efecto de layout, no aquí ni en un
     * `queueMicrotask`.**
     *
     * Aquí estaba lo segundo, con un comentario que explicaba bien el problema y
     * elegía mal la herramienta: una microtarea corre **antes** de que React
     * confirme el DOM, así que `setSelectionRange` se aplicaba sobre el valor
     * viejo del textarea. Al repintar con el texto nuevo, el navegador recolocaba
     * la selección por su cuenta —normalmente al final— y el efecto era el que se
     * veía: el cursor «se adelantaba» al texto y seguir escribiendo metía las
     * letras donde no era.
     *
     * `useLayoutEffect` corre **después** del commit y antes de que el navegador
     * pinte, así que la posición se aplica sobre el valor definitivo y no se ve
     * ningún salto intermedio.
     */
    setCursorPendiente(posicion);
  }

  /* `null` = no hay nada que recolocar. Se usa un objeto y no el número a secas
     para que insertar dos menciones en la misma posición vuelva a disparar el
     efecto: con un número, la segunda no cambiaría el estado y no correría. */
  const [cursorPendiente, setCursorPendiente] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (cursorPendiente === null) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(cursorPendiente, cursorPendiente);
    setCursorPendiente(null);
  }, [cursorPendiente]);

  /**
   * Al pulsar «Responder», el cursor cae solo en el campo.
   *
   * Sin esto, quien pulsó «Responder» tenía que ir a buscar el campo con el
   * ratón o el dedo para escribir — un paso de más que la propia cita ya
   * anuncia que toca. Al final del texto, no al principio: es donde se sigue
   * escribiendo.
   */
  useEffect(() => {
    if (!citaId) return;
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    const fin = area.value.length;
    area.setSelectionRange(fin, fin);
  }, [citaId]);

  /** Los trozos del texto, marcando cuáles son etiqueta. Ver `etiquetado.tsx`. */
  const trozos = useMemo(() => trozosDeCampo(texto, etiquetas), [texto, etiquetas]);

  function enviar() {
    /* Un mensaje puede ir solo con archivos: si no hay texto ni adjuntos, no
       hay nada que enviar. */
    const puedeEnviar = adjuntosPendientes.length > 0 || texto.trim().length > 0;
    if (!puedeEnviar || enviando || subiendo) return;
    onEnviar(
      serializarCampo(trozos).trim(),
      adjuntosPendientes.map((a) => a.id),
    );
    setTexto('');
    setCursor(0);
    setEtiquetas([]);
    const area = areaRef.current;
    if (area) area.style.height = 'auto';
  }

  function alTeclear(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (abierto) {
      if (evento.key === 'ArrowDown') {
        evento.preventDefault();
        setMarcada((previa) => (previa + 1) % candidatas.length);
        return;
      }
      if (evento.key === 'ArrowUp') {
        evento.preventDefault();
        setMarcada((previa) => (previa - 1 + candidatas.length) % candidatas.length);
        return;
      }
      /* Enter y Tab eligen mientras el desplegable está abierto. Sin esto, Enter
         enviaría el mensaje con la etiqueta a medio escribir. */
      if (evento.key === 'Enter' || evento.key === 'Tab') {
        evento.preventDefault();
        const elegida = candidatas[marcada];
        if (elegida) elegir(elegida);
        return;
      }
      if (evento.key === 'Escape') {
        evento.preventDefault();
        setCursor(texto.length);
        return;
      }
    }

    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  }

  const restantes = CHAT_MESSAGE_MAX - texto.length;

  /* Al elegir un archivo se lo pasa al panel, que lo sube como borrador. El
     campo se vacía para que elegir el mismo archivo dos veces vuelva a
     disparar `onChange`. */
  function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    onAdjuntar(archivo);
    evento.target.value = '';
  }

  /**
   * Pegar una imagen con Ctrl+V la sube como adjunto, como hace Slack.
   *
   * ⚠️ Solo se traga el portapapeles cuando lo que viaja es **imagen** (una
   * captura de pantalla, un recorte). Si hay texto —o no hay nada—, se deja
   * pasar sin `preventDefault` y el pegado normal del textarea sigue su curso.
   * Una captura puede venir en varios formatos (`image/png`, `image/jpeg`…);
   * solo se acepta si además está en la whitelist, que es lo que el backend
   * admite al subir.
   */
  function alPegar(evento: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(evento.clipboardData.items);
    const imagen = items.find(
      (item) =>
        item.kind === 'file' &&
        (CHAT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(item.type),
    );
    const archivo = imagen?.getAsFile();
    if (!archivo) return;

    evento.preventDefault();
    if (adjuntosPendientes.length < CHAT_ATTACHMENT_MAX_PER_MESSAGE) onAdjuntar(archivo);
  }

  return (
    <div className="relative flex flex-col gap-2">
      {respuestaSlot}

      {adjuntosPendientes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {adjuntosPendientes.map((adjunto) => (
            <span
              key={adjunto.id}
              className="flex items-center gap-1.5 rounded-lg border border-border py-1 pl-2.5 pr-1 font-sans text-xs text-text-secondary"
              style={{ background: colors.surfaceElevated }}
            >
              <span className="max-w-40 truncate" title={adjunto.filename}>
                {adjunto.filename}
              </span>
              <span className="shrink-0 text-[10px] text-text-disabled">
                {formatBytes(adjunto.size)}
              </span>
              <button
                type="button"
                onClick={() => onQuitarAdjunto(adjunto.id)}
                disabled={subiendo}
                aria-label={`Quitar ${adjunto.filename}`}
                title="Quitar"
                className="shrink-0 cursor-pointer rounded p-0.5 text-text-disabled transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {abierto && (
        /* Mismo patrón que el átomo `Select`: un `listbox` propio porque el
           `<datalist>` nativo no admite dos líneas ni insignias, y `tabIndex={-1}`
           porque **el foco se queda en el textarea a propósito** — moverlo aquí
           cerraría el teclado en móvil y perdería el cursor de inserción. */
        <ul
          role="listbox"
          tabIndex={-1}
          aria-label="Sugerencias"
          className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-md overflow-hidden rounded-xl border border-border"
          style={{
            background: colors.surfaceElevated,
            boxShadow: `0 16px 40px ${alpha(colors.overlay, 55)}`,
          }}
        >
          {candidatas.map((sugerencia, indice) => (
            /* El teclado lo lleva el textarea, que es quien conserva el foco a
               propósito: moverlo aquí cerraría el teclado en móvil. */
            <li
              key={`${sugerencia.kind}:${sugerencia.id}`}
              role="option"
              aria-selected={indice === marcada}
              onMouseEnter={() => setMarcada(indice)}
              /* `onMouseDown` y no `onClick`: al pulsar, el textarea perdería el
                 foco antes del clic y el cursor dejaría de estar donde hay que
                 insertar. `preventDefault` evita ese salto. */
              onMouseDown={(evento) => {
                evento.preventDefault();
                elegir(sugerencia);
              }}
              className="flex cursor-pointer items-center gap-2 px-3 py-2"
              style={indice === marcada ? { background: alpha(colors.primary, 14) } : undefined}
            >
              {/* El icono es lo que distingue tarea de tablero de un vistazo:
                  los dos comparten el mismo desplegable de `/` y sin él, «Sprint
                  1» (un tablero) y «Sprint 1 — revisar métricas» (una tarea)
                  se leen igual hasta fijarse en el contexto de la derecha. */}
              {sugerencia.kind !== 'user' &&
                (sugerencia.kind === 'board' ? (
                  <KanbanIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: COLOR_POR_TIPO_DE_REF[sugerencia.kind] }}
                  />
                ) : (
                  <SquareCheckIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: COLOR_POR_TIPO_DE_REF[sugerencia.kind] }}
                  />
                ))}
              <span className="truncate font-sans text-sm text-text-primary">
                {sugerencia.label}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {sugerencia.estado && (
                  <span
                    className="rounded px-1.5 py-0.5 font-sans text-[10px]"
                    style={{ background: alpha(colors.success, 15), color: colors.success }}
                  >
                    {sugerencia.estado}
                  </span>
                )}
                <span className="max-w-40 truncate font-sans text-[11px] text-text-disabled">
                  {sugerencia.contexto}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div
        className="flex items-end gap-2 rounded-xl border border-border p-2 transition-colors focus-within:border-primary"
        style={{ background: colors.surfaceElevated }}
      >
        <div className="relative min-w-0 flex-1">
          {/* La capa de debajo: el mismo texto, con las etiquetas pintadas. */}
          <CapaEtiquetas trozos={trozos} capaRef={capaRef} className="max-h-40 overflow-hidden" />

          <textarea
            ref={areaRef}
            value={texto}
            disabled={deshabilitado}
            maxLength={CHAT_MESSAGE_MAX}
            placeholder={placeholder}
            aria-label="Nuevo mensaje"
            rows={1}
            onChange={(evento) => {
              setTexto(evento.target.value);
              setCursor(evento.target.selectionStart ?? 0);
            }}
            onKeyUp={(evento) => setCursor(evento.currentTarget.selectionStart ?? 0)}
            onClick={(evento) => setCursor(evento.currentTarget.selectionStart ?? 0)}
            onKeyDown={alTeclear}
            onPaste={alPegar}
            /* Las dos capas se desplazan juntas: si no, al pasar de cuatro
               líneas el resaltado se queda quieto y el texto sube. */
            onScroll={(evento) => {
              if (capaRef.current) capaRef.current.scrollTop = evento.currentTarget.scrollTop;
            }}
            onInput={(evento) => {
              const area = evento.currentTarget;
              area.style.height = 'auto';
              area.style.height = `${Math.min(area.scrollHeight, 160)}px`;
            }}
            /* ⚠️ Tinta transparente: lo que se lee es la capa de abajo. El cursor
               se pinta aparte con `caret-color`, o el campo parecería muerto. */
            className={`relative max-h-40 w-full resize-none bg-transparent text-transparent outline-none placeholder:text-text-disabled disabled:cursor-not-allowed ${TIPOGRAFIA_CAMPO}`}
            style={{ caretColor: colors.textPrimary }}
          />
        </div>

        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={
            deshabilitado ||
            subiendo ||
            adjuntosPendientes.length >= CHAT_ATTACHMENT_MAX_PER_MESSAGE
          }
          aria-label="Adjuntar un archivo"
          title="Adjuntar archivo"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-disabled transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {subiendo ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              />
            </svg>
          )}
        </button>

        {/* Escondido: lo abre el botón del clip. Se elige un archivo y se sube
            al instante; no se guarda en el formulario. */}
        <input
          ref={archivoRef}
          type="file"
          multiple={false}
          accept={CHAT_ATTACHMENT_ALLOWED_MIME.join(',')}
          onChange={alElegirArchivo}
          className="hidden"
        />

        <button
          type="button"
          onClick={enviar}
          disabled={
            enviando ||
            deshabilitado ||
            subiendo ||
            (adjuntosPendientes.length === 0 && texto.trim().length === 0)
          }
          aria-label="Enviar mensaje"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: alpha(colors.primary, 22), color: colors.primary }}
        >
          {enviando ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="font-sans text-[11px] text-text-disabled">
          <kbd className="font-sans">Enter</kbd> envía ·{' '}
          <kbd className="font-sans">Mayús+Enter</kbd> salta de línea
          {permiteMenciones && (
            <>
              {' · '}
              <kbd className="font-sans">@</kbd> menciona
            </>
          )}
          {' · '}
          <kbd className="font-sans">/</kbd> enlaza una tarea
          {' · '}
          <kbd className="font-sans">Ctrl+V</kbd> pega una imagen
        </p>

        {/* Solo cuando de verdad queda poco: enseñarlo siempre es ruido. */}
        {restantes < 200 && (
          <span
            className="shrink-0 font-sans text-[11px] tabular-nums"
            style={{ color: restantes < 0 ? colors.error : colors.textDisabled }}
          >
            {restantes}
          </span>
        )}
      </div>
    </div>
  );
}
