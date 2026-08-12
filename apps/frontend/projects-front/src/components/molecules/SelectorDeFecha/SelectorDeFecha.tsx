'use client';

import { alpha, colors } from '@praxis/commons';
import { useEffect, useId, useRef, useState } from 'react';

export interface SelectorDeFechaProps {
  /** Nombre del campo que viaja en el formulario. */
  name: string;
  label: string;
  /** `yyyy-mm-dd`, o cadena vacía si no hay fecha. */
  defaultValue?: string;
  disabled?: boolean;
}

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * ⚠️ **`yyyy-mm-dd` se parte a mano, nunca con `new Date(cadena)`.**
 *
 * `new Date('2026-08-01')` es medianoche **UTC**: al oeste de Greenwich —México,
 * sin ir más lejos— eso cae el día 31 en hora local, así que el calendario
 * marcaba en azul el día anterior al que la tarea tenía puesto. Construyéndola
 * con año, mes y día por separado sale medianoche local y el día es el que dice
 * la cadena.
 */
function desdeValor(valor: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
}

/** El camino inverso, también con las partes locales. */
function aValor(fecha: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Los 42 días de la cuadrícula: el mes pedido más el relleno de sus vecinos.
 *
 * Siempre seis semanas, aunque el mes quepa en cinco. Con un número variable de
 * filas el panel cambia de alto al pasar de mes y los botones de navegación se
 * mueven bajo el puntero.
 */
function diasDelMes(mes: Date): Date[] {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  /* La semana empieza en lunes: `getDay()` da 0 para domingo, así que se rota. */
  const desplazamiento = (primero.getDay() + 6) % 7;

  return Array.from(
    { length: 42 },
    (_, indice) => new Date(mes.getFullYear(), mes.getMonth(), 1 - desplazamiento + indice),
  );
}

/**
 * Selector de fecha propio.
 *
 * Sustituye al `<input type="date">`, cuyo calendario lo dibuja el navegador:
 * no acepta ni un color del sistema, cambia de aspecto en Chrome, Safari y
 * Firefox, y en tema oscuro sale en claro.
 *
 * ⚠️ El valor sigue viajando en un `<input type="hidden">` con el mismo nombre y
 * el mismo formato `yyyy-mm-dd`. Nada de lo que hay detrás —la acción de
 * servidor, el DTO, el backend— se entera de que esto cambió, que es
 * exactamente lo que se busca: es un cambio de pintura, no de contrato.
 *
 * La fecha es **opcional**, así que quitarla tiene que ser tan fácil como
 * ponerla: hay una «×» en el propio campo y un «Quitar fecha» dentro del panel.
 */
export function SelectorDeFecha({
  name,
  label,
  defaultValue = '',
  disabled = false,
}: SelectorDeFechaProps) {
  const [valor, setValor] = useState(defaultValue);
  const [abierto, setAbierto] = useState(false);
  const hoy = new Date();
  const seleccionada = desdeValor(valor);

  const [mesVisible, setMesVisible] = useState<Date>(
    () => desdeValor(defaultValue) ?? new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );

  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const etiquetaId = useId();

  /** Escape y clic fuera. Los dos devuelven el foco al campo. */
  useEffect(() => {
    if (!abierto) return;

    function alPulsarFuera(evento: PointerEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alPulsarTecla(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return;
      /* Se detiene aquí: dentro del diálogo de tarea, dejar que suba cerraría
         también la ventana entera y se perdería lo que hubiera sin guardar. */
      evento.stopPropagation();
      setAbierto(false);
      disparador.current?.focus();
    }

    document.addEventListener('pointerdown', alPulsarFuera);
    document.addEventListener('keydown', alPulsarTecla, true);
    return () => {
      document.removeEventListener('pointerdown', alPulsarFuera);
      document.removeEventListener('keydown', alPulsarTecla, true);
    };
  }, [abierto]);

  function elegir(dia: Date) {
    setValor(aValor(dia));
    setMesVisible(new Date(dia.getFullYear(), dia.getMonth(), 1));
    setAbierto(false);
    disparador.current?.focus();
  }

  function moverMes(direccion: -1 | 1) {
    setMesVisible((actual) => new Date(actual.getFullYear(), actual.getMonth() + direccion, 1));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={etiquetaId} className="font-sans text-sm font-medium text-text-primary">
        {label}
      </span>

      {/* Lo que de verdad se envía. El botón de arriba solo lo edita. */}
      <input type="hidden" name={name} value={valor} />

      <div ref={contenedor} className="relative">
        <button
          ref={disparador}
          type="button"
          disabled={disabled}
          onClick={() => setAbierto((actual) => !actual)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-labelledby={etiquetaId}
          className={[
            'flex h-10 w-full items-center gap-2 rounded-lg border px-3 font-sans text-sm',
            'border-border bg-surface-elevated text-left outline-none transition-all duration-150',
            'hover:border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            abierto ? 'border-primary ring-2 ring-primary/20' : '',
            disabled ? '' : 'cursor-pointer',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <CalendarioIcono />
          <span className={seleccionada ? 'text-text-primary' : 'text-text-disabled'}>
            {seleccionada
              ? `${seleccionada.getDate()} de ${MESES[seleccionada.getMonth()]} de ${seleccionada.getFullYear()}`
              : 'Sin fecha límite'}
          </span>

          {seleccionada && !disabled && (
            /* Un `<span>` con `onClick`, no un `<button>`: este control vive
               dentro del botón que abre el panel, y un botón dentro de otro no
               es HTML válido. El teclado no lo necesita — tiene «Quitar fecha»
               dentro del panel, al que sí se llega tabulando. */
            // biome-ignore lint/a11y/useKeyWithClickEvents: el equivalente de teclado es «Quitar fecha», dentro del panel
            <span
              role="button"
              tabIndex={-1}
              aria-label="Quitar la fecha límite"
              title="Quitar la fecha"
              onClick={(evento) => {
                evento.stopPropagation();
                setValor('');
              }}
              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-disabled transition-colors hover:bg-surface hover:text-text-primary"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
        </button>

        {abierto && (
          <div
            role="dialog"
            aria-label="Elegir fecha"
            className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl p-3"
            style={{
              background: colors.surfaceElevated,
              boxShadow: `0 12px 32px ${alpha(colors.overlay, 55)}, 0 0 0 1px ${alpha(colors.border, 70)}`,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <FlechaMes direccion={-1} onClick={() => moverMes(-1)} />
              <span className="font-sans text-sm font-semibold text-text-primary">
                {MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
              </span>
              <FlechaMes direccion={1} onClick={() => moverMes(1)} />
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {DIAS.map((dia, indice) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: los días de la semana son una lista fija y «M» se repite
                  key={`${dia}-${indice}`}
                  className="flex h-7 items-center justify-center font-sans text-[11px] text-text-disabled"
                >
                  {dia}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {diasDelMes(mesVisible).map((dia) => {
                const deOtroMes = dia.getMonth() !== mesVisible.getMonth();
                const esHoy = mismoDia(dia, hoy);
                const esElegido = seleccionada ? mismoDia(dia, seleccionada) : false;

                return (
                  <button
                    key={dia.toISOString()}
                    type="button"
                    onClick={() => elegir(dia)}
                    aria-current={esElegido ? 'date' : undefined}
                    className={[
                      'flex h-8 w-full cursor-pointer items-center justify-center rounded-lg',
                      'font-sans text-xs tabular-nums transition-colors',
                      esElegido ? 'font-semibold' : 'hover:bg-surface',
                      deOtroMes && !esElegido ? 'text-text-disabled' : 'text-text-primary',
                    ].join(' ')}
                    style={{
                      background: esElegido ? colors.primary : undefined,
                      color: esElegido ? colors.primaryForeground : undefined,
                      /* Hoy va con un aro y no relleno: relleno competiría con
                         el día elegido y no se sabría cuál es cuál. */
                      boxShadow:
                        esHoy && !esElegido ? `inset 0 0 0 1px ${colors.primary}` : undefined,
                    }}
                  >
                    {dia.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => elegir(new Date())}
                className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  setValor('');
                  setAbierto(false);
                  disparador.current?.focus();
                }}
                className="cursor-pointer rounded-lg px-2 py-1 font-sans text-xs transition-colors hover:bg-surface"
                style={{ color: colors.textSecondary }}
              >
                Quitar fecha
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlechaMes({ direccion, onClick }: { direccion: -1 | 1; onClick: () => void }) {
  const texto = direccion === -1 ? 'Mes anterior' : 'Mes siguiente';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={texto}
      title={texto}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={direccion === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
        />
      </svg>
    </button>
  );
}

/* Heroicons v2 «calendar-days». */
function CalendarioIcono() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-text-secondary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
  );
}
