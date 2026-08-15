'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type ChatRefKind, componerReferencia } from '../../api/chat-refs';
import { alpha, colors } from '../../tokens';

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

/**
 * Una etiqueta ya insertada.
 *
 * ⚠️ **El campo guarda el texto que se lee, no el que se envía.** El id vive
 * aquí, fuera del `<textarea>`, y solo se pega al serializar. Antes el campo
 * contenía la etiqueta entera —`@[María García](user:2222…)`— y quien escribía
 * veía un UUID de 36 caracteres en mitad de su frase.
 */
interface Etiqueta {
  kind: ChatRefKind;
  id: string;
  /** Lo que se ve en el campo: `@María García`, o el título de la tarea. */
  visible: string;
}

export interface ComposerProps {
  onEnviar: (cuerpo: string) => void;
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
}: ComposerProps) {
  const [texto, setTexto] = useState('');
  const [cursor, setCursor] = useState(0);
  const [marcada, setMarcada] = useState(0);
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const capaRef = useRef<HTMLDivElement>(null);
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
      disparador.sigil === '@' ? sugerencia.kind === 'user' : sugerencia.kind === 'task',
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

    const visible = sugerencia.kind === 'user' ? `@${sugerencia.label}` : sugerencia.label;

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
   * Los trozos del texto, marcando cuáles son etiqueta.
   *
   * Recorre las etiquetas **en el orden en que se insertaron** y busca cada una a
   * partir de donde acabó la anterior. Eso resuelve dos personas con el mismo
   * nombre y, sobre todo, **una etiqueta que ya no está**: si alguien borró ese
   * trozo del texto, no se encuentra y se ignora — el mensaje sale con lo que de
   * verdad quedó escrito.
   */
  const trozos = useMemo(() => {
    const salida: { texto: string; etiqueta?: Etiqueta }[] = [];
    let desde = 0;

    for (const etiqueta of etiquetas) {
      const posicion = texto.indexOf(etiqueta.visible, desde);
      if (posicion === -1) continue;
      if (posicion > desde) salida.push({ texto: texto.slice(desde, posicion) });
      salida.push({ texto: etiqueta.visible, etiqueta });
      desde = posicion + etiqueta.visible.length;
    }

    if (desde < texto.length) salida.push({ texto: texto.slice(desde) });
    return salida;
  }, [texto, etiquetas]);

  /** Lo mismo, pero con los ids pegados: es lo que viaja al servidor. */
  function serializar(): string {
    return trozos
      .map((trozo) =>
        trozo.etiqueta
          ? componerReferencia(
              trozo.etiqueta.kind,
              trozo.etiqueta.id,
              /* La `@` es del formato, no del nombre: se quita antes de componer. */
              trozo.etiqueta.kind === 'user' ? trozo.texto.slice(1) : trozo.texto,
            )
          : trozo.texto,
      )
      .join('');
  }

  function enviar() {
    if (!texto.trim() || enviando) return;
    onEnviar(serializar().trim());
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

  /* Las dos capas tienen que medir igual carácter a carácter, así que comparten
     estas clases exactas. Cualquier diferencia de fuente o relleno desplaza el
     resaltado respecto al cursor. */
  const tipografia = 'px-2 py-1.5 font-sans text-sm leading-relaxed';

  return (
    <div className="relative flex flex-col gap-2">
      {respuestaSlot}

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
          <div
            ref={capaRef}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 max-h-40 overflow-hidden whitespace-pre-wrap break-words text-text-primary ${tipografia}`}
          >
            {trozos.map((trozo, indice) =>
              trozo.etiqueta ? (
                /**
                 * ⚠️ **La etiqueta no puede ocupar ni un píxel de más, y ese era
                 * el fallo del cursor.**
                 *
                 * Esto llevaba `px-1` y `font-medium`. Las dos cosas cambian el
                 * ancho del texto: el relleno mete 8 px por etiqueta y el peso
                 * cambia las métricas de cada glifo. Pero el `<textarea>` de
                 * debajo —que es quien dibuja el cursor— tiene el texto **crudo**,
                 * sin relleno y con el peso normal. A partir de la primera
                 * etiqueta las dos capas dejaban de coincidir y el cursor
                 * aparecía desplazado respecto a las letras que se veían, cada
                 * vez más cuantas más etiquetas hubiera.
                 *
                 * La píldora se dibuja ahora con `box-shadow`, que **no ocupa
                 * espacio**: extiende el fondo hacia los lados sin mover el
                 * texto. El resultado se ve igual y mide exactamente lo mismo
                 * que la capa de abajo.
                 *
                 * Si alguna vez hay que darle más aire, va por ahí — cualquier
                 * `padding`, `border`, `letter-spacing` o cambio de peso vuelve
                 * a desalinear el cursor.
                 */
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: los trozos no tienen id propio y la lista se recalcula entera con el texto
                  key={indice}
                  style={{
                    background: alpha(
                      trozo.etiqueta.kind === 'user' ? colors.primary : colors.success,
                      16,
                    ),
                    color: trozo.etiqueta.kind === 'user' ? colors.primary : colors.success,
                    borderRadius: 3,
                    boxShadow: `0 0 0 2px ${alpha(
                      trozo.etiqueta.kind === 'user' ? colors.primary : colors.success,
                      16,
                    )}`,
                  }}
                >
                  {trozo.texto}
                </span>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: ídem
                <span key={indice}>{trozo.texto}</span>
              ),
            )}
          </div>

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
            className={`relative max-h-40 w-full resize-none bg-transparent text-transparent outline-none placeholder:text-text-disabled disabled:cursor-not-allowed ${tipografia}`}
            style={{ caretColor: colors.textPrimary }}
          />
        </div>

        <button
          type="button"
          onClick={enviar}
          disabled={enviando || deshabilitado || texto.trim().length === 0}
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
