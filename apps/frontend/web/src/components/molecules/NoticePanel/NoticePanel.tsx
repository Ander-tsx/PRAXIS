import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface NoticePanelProps {
  /** Color del asunto: rojo para lo vencido, ámbar para lo que espera decisión. */
  tone: string;
  /** Icono del asunto. Va dentro de un disco del mismo tono. */
  icon: ReactNode;
  title: string;
  hint: string;
  /** Número grande a la derecha. Se omite cuando el título ya lo dice. */
  count?: number;
  children: ReactNode;
}

/**
 * Un aviso del panel: invitaciones pendientes, tareas vencidas, tareas por
 * vencer.
 *
 * **Sustituye a la barra lateral de color.** Antes cada aviso era un rectángulo
 * teñido con un `inset 3px 0 0` a la izquierda: una franja dura, del ancho de un
 * error de validación, que competía con el contenido y no aportaba más
 * información que el propio color de fondo.
 *
 * Lo que hace ahora, en orden de peso visual:
 *
 * 1. **Un disco con el icono del asunto.** Es lo que se lee primero y dice de
 *    qué va el aviso sin tener que empezar por el texto.
 * 2. **El número, grande y a la derecha.** Cuántas son es la pregunta que se
 *    hace quien mira el panel de reojo.
 * 3. **Un tinte muy suave en diagonal desde la esquina**, en vez de fondo plano:
 *    da el color del asunto sin teñir el texto ni pelearse con las filas.
 *
 * El borde es el mismo `border` de las tarjetas de proyecto, así que los avisos
 * y la rejilla se leen como piezas del mismo panel y no como parches pegados
 * arriba.
 */
export function NoticePanel({ tone, icon, title, hint, count, children }: NoticePanelProps) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-2xl border p-5"
      style={{
        borderColor: alpha(tone, 25),
        background: `radial-gradient(120% 120% at 0% 0%, ${alpha(tone, 9)}, transparent 55%), ${colors.surface}`,
      }}
    >
      <header className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: alpha(tone, 15), color: tone }}
        >
          {icon}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <h3 className="font-sans font-semibold text-xl leading-tight text-text-primary">
            {title}
          </h3>
          <span className="font-sans text-sm text-white">{hint}</span>
        </span>

        {count !== undefined && (
          <span
            className="shrink-0 font-sans font-semibold text-3xl leading-none tabular-nums"
            style={{ color: tone }}
          >
            {count}
          </span>
        )}
      </header>

      {children}
    </section>
  );
}
