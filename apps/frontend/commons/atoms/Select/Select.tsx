'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { alpha, colors } from '../../tokens';

/**
 * Un desplegable propio, no el del sistema.
 *
 * El nativo no se puede estilar por dentro: la lista la pinta el sistema
 * operativo, así que en un producto con tema claro y oscuro aparecía una
 * ventanita del sistema encima de la interfaz, con su tipografía y su tamaño.
 * Y sobre todo **no puede enseñar un color**, que es justo lo que pide elegir
 * el color de una etiqueta: se leía «Rojo» en texto en vez de verse rojo.
 *
 * ## Sigue siendo un campo de formulario
 *
 * Un `<div>` no se envía. Debajo hay un `<input type="hidden">` con el `name`,
 * así que las Server Actions que ya usaban este átomo —crear una tarea, una
 * etiqueta, invitar a alguien— siguen recibiendo su campo sin enterarse.
 *
 * ⚠️ Lo que **sí** se pierde respecto al nativo es funcionar sin JavaScript. Se
 * acepta porque estos desplegables viven dentro de diálogos que ya son
 * componentes de cliente.
 *
 * ## Accesibilidad
 *
 * Es un `combobox` con su `listbox`, no un `div` con un `onClick`: flechas para
 * moverse, `Inicio`/`Fin` para los extremos, `Enter` o `Espacio` para elegir,
 * `Escape` para cerrar sin cambiar nada, y escribir salta a la opción que
 * empieza por esas letras —lo que hace el nativo y la gente tiene en los dedos—.
 * Al cerrar, el foco vuelve al botón: perderlo dejaría al teclado al principio
 * de la página.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Color de la muestra que acompaña a la opción.
   *
   * Es media razón de que este componente exista: el nativo no puede pintarla,
   * y elegir «el rojo» leyendo la palabra «Rojo» es lo que había antes.
   */
  color?: string;
}

export interface SelectProps {
  label?: string;
  /** Mensaje de error o de ayuda bajo el campo. */
  message?: string;
  variant?: 'default' | 'error';
  options: SelectOption[];
  /** Texto cuando no hay nada elegido. Fuerza una elección consciente. */
  placeholder?: string;
  fullWidth?: boolean;
  /** El campo que recibirá la Server Action. Sin él no se envía nada. */
  name?: string;
  /** Controlado: si se pasa, manda quien lo pasa. */
  value?: string;
  /** Sin controlar: el valor inicial. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
}

const variantClasses = {
  default: 'border-border hover:border-border-strong',
  error: 'border-error',
} as const;

export function Select({
  label,
  message,
  variant = 'default',
  options,
  placeholder,
  fullWidth = false,
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
  id,
  required,
  className = '',
}: SelectProps) {
  const generado = useId();
  const campoId = id ?? generado;
  const listaId = `${campoId}-lista`;

  const controlado = value !== undefined;
  const [interno, setInterno] = useState(defaultValue ?? '');
  const actual = controlado ? value : interno;

  const [abierto, setAbierto] = useState(false);
  /** Qué opción resalta el teclado, que no es lo mismo que la elegida. */
  const [marcada, setMarcada] = useState(0);

  const raizRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  /** Letras tecleadas seguidas, para el salto por inicial. */
  const tecleado = useRef({ texto: '', cuando: 0 });

  const elegida = options.find((opcion) => opcion.value === actual);

  /* Pulsar fuera cierra. `mousedown` y no `click`: cerrando en el `click`, un
     botón de debajo recibiría el suyo en el mismo gesto. */
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: MouseEvent) => {
      if (!raizRef.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierto]);

  /* La opción resaltada, siempre a la vista: con doce colores la lista tiene
     barra y el teclado se movería fuera de cuadro. */
  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.querySelector('[data-marcada="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [abierto, marcada]);

  function abrir() {
    if (disabled) return;
    const indice = options.findIndex((opcion) => opcion.value === actual);
    setMarcada(indice >= 0 ? indice : 0);
    setAbierto(true);
  }

  function elegir(opcion: SelectOption) {
    if (opcion.disabled) return;
    if (!controlado) setInterno(opcion.value);
    onValueChange?.(opcion.value);
    setAbierto(false);
    botonRef.current?.focus();
  }

  /** Mueve el resaltado saltándose las deshabilitadas. */
  function mover(desde: number, paso: number) {
    const total = options.length;
    if (total === 0) return 0;
    for (let i = 1; i <= total; i++) {
      const siguiente = (((desde + paso * i) % total) + total) % total;
      if (!options[siguiente]?.disabled) return siguiente;
    }
    return desde;
  }

  function alTeclear(evento: React.KeyboardEvent) {
    if (disabled) return;

    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(evento.key)) {
        evento.preventDefault();
        abrir();
      }
      return;
    }

    switch (evento.key) {
      case 'Escape':
        evento.preventDefault();
        /* Cierra la lista y **nada más**. Un panel lateral (`SlideOver`)
           también escucha Escape en `document`, y React delega sus eventos en
           ese mismo nodo: `stopPropagation()` no frena a un oyente del mismo
           nodo, `stopImmediatePropagation()` sí. Sin esto, cerrar la lista de
           prioridad cerraba la tarea entera. */
        evento.stopPropagation();
        evento.nativeEvent.stopImmediatePropagation();
        setAbierto(false);
        botonRef.current?.focus();
        return;
      case 'ArrowDown':
        evento.preventDefault();
        setMarcada((previa) => mover(previa, 1));
        return;
      case 'ArrowUp':
        evento.preventDefault();
        setMarcada((previa) => mover(previa, -1));
        return;
      case 'Home':
        evento.preventDefault();
        setMarcada(mover(-1, 1));
        return;
      case 'End':
        evento.preventDefault();
        setMarcada(mover(options.length, -1));
        return;
      case 'Enter':
      case ' ': {
        evento.preventDefault();
        const opcion = options[marcada];
        if (opcion) elegir(opcion);
        return;
      }
      case 'Tab':
        /* Tabular cierra sin elegir: el foco se va, y dejar la lista flotando
           sobre el campo siguiente es lo que hace mal el nativo. */
        setAbierto(false);
        return;
      default:
        break;
    }

    /* Salto por inicial. Un segundo de margen: «ro» seguido busca «rojo», pero
       dos letras separadas son dos búsquedas distintas. */
    if (evento.key.length === 1) {
      const ahora = Date.now();
      const texto =
        ahora - tecleado.current.cuando < 1000 ? tecleado.current.texto + evento.key : evento.key;
      tecleado.current = { texto, cuando: ahora };

      const encontrada = options.findIndex(
        (opcion) => !opcion.disabled && opcion.label.toLowerCase().startsWith(texto.toLowerCase()),
      );
      if (encontrada >= 0) setMarcada(encontrada);
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <span
          id={`${campoId}-etiqueta`}
          className="font-sans text-sm font-medium text-text-primary"
        >
          {label}
        </span>
      )}

      <div ref={raizRef} className="relative">
        {/* Lo que se envía: un div no participa en un formulario. */}
        {name && <input type="hidden" name={name} value={actual} required={required} />}

        <button
          ref={botonRef}
          type="button"
          id={campoId}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-haspopup="listbox"
          aria-labelledby={label ? `${campoId}-etiqueta ${campoId}` : undefined}
          disabled={disabled}
          onClick={() => (abierto ? setAbierto(false) : abrir())}
          onKeyDown={alTeclear}
          className={[
            'flex h-10 w-full items-center gap-2 rounded-xl border bg-surface py-2 pl-3 pr-9 shadow-sm',
            'font-sans text-sm text-text-primary outline-none transition-all duration-150',
            'focus-visible:ring-2 focus-visible:ring-white/60',
            'disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-md',
            variantClasses[variant],
            className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {elegida?.color && <Muestra color={elegida.color} />}
          <span className={`truncate ${elegida ? '' : 'text-text-secondary'}`}>
            {elegida?.label ?? placeholder ?? 'Elige una opción'}
          </span>

          <svg
            className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${
              abierto ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {abierto && (
          // biome-ignore lint/a11y/useKeyWithClickEvents: el teclado lo lleva el combobox, y cada opción es role="option" dentro del listbox
          <ul
            ref={listaRef}
            id={listaId}
            role="listbox"
            aria-labelledby={label ? `${campoId}-etiqueta` : undefined}
            tabIndex={-1}
            onKeyDown={alTeclear}
            className="absolute z-50 mt-1 max-h-60 w-full origin-top animate-desplegar-menu overflow-y-auto rounded-xl border border-border py-1"
            style={{
              background: colors.surfaceElevated,
              boxShadow: `0 8px 24px ${alpha(colors.overlay, 45)}`,
            }}
          >
            {options.map((opcion, indice) => {
              const seleccionada = opcion.value === actual;
              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: ídem
                <li
                  key={opcion.value}
                  role="option"
                  aria-selected={seleccionada}
                  aria-disabled={opcion.disabled}
                  data-marcada={indice === marcada}
                  onMouseEnter={() => setMarcada(indice)}
                  onClick={() => elegir(opcion)}
                  className={[
                    'flex cursor-pointer items-center gap-2 px-3 py-2 font-sans text-sm',
                    opcion.disabled ? 'cursor-not-allowed opacity-40' : '',
                    seleccionada ? 'text-text-primary' : 'text-text-secondary',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    indice === marcada && !opcion.disabled
                      ? { background: alpha(colors.primary, 14) }
                      : undefined
                  }
                >
                  {opcion.color && <Muestra color={opcion.color} />}
                  <span className="truncate">{opcion.label}</span>
                  {seleccionada && (
                    <svg
                      className="ml-auto h-4 w-4 shrink-0 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {message && (
        <p
          className={`font-sans text-xs ${
            variant === 'error' ? 'text-error' : 'text-text-secondary'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** El punto de color de una opción. Decorativo: la etiqueta ya dice cuál es. */
function Muestra({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
      style={{ background: color }}
    />
  );
}
