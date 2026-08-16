import { alpha, colors } from '@praxis/commons';
import type { ReactNode } from 'react';

export interface PanelCardProps {
  title: string;
  /** Qué se hace aquí, en una frase. */
  description?: string;
  /** Un icono ya dibujado, de 18 px. Va en la pastilla de la izquierda. */
  icon?: ReactNode;
  /**
   * Lo que va en la esquina derecha del encabezado: una insignia, un contador
   * o **el propio control**, cuando el ajuste cabe en un interruptor y la
   * tarjeta se queda en una banda de una fila (ver «Apariencia»).
   */
  aside?: ReactNode;
  /**
   * `danger` tiñe el borde y el icono de rojo. Solo para lo que no se deshace:
   * si lo lleva más de un bloque, deja de significar nada.
   */
  tone?: 'default' | 'danger';
  className?: string;
  /** Opcional: una tarjeta cuyo control entero vive en `aside` no tiene cuerpo. */
  children?: ReactNode;
}

/**
 * Un bloque de una pantalla de ajustes: tu cuenta o Configuración.
 *
 * ## Por qué no es `SettingsSection`
 *
 * Aquella era un título, una frase y el contenido suelto debajo, con una regla
 * horizontal separando una sección de la siguiente. Con eso, las dos pantallas
 * acababan igual: franjas a lo ancho de 1400 px con dos líneas dentro —una
 * banda entera para un interruptor de 72 px, en el caso de «Apariencia»— y la
 * división viéndose más que lo dividido.
 *
 * Esto es la misma idea metida en una tarjeta, que es lo que permite ponerlas
 * **una al lado de otra** en una rejilla. `h-full` para que dos vecinas de la
 * misma fila midan lo mismo aunque una tenga más dentro.
 *
 * Sustituyó a `SettingsSection`, que se quedó sin ningún uso y se borró: dos
 * maneras de dibujar el mismo bloque es exactamente lo que aquella existía para
 * evitar.
 */
export function PanelCard({
  title,
  description,
  icon,
  aside,
  tone = 'default',
  className = '',
  children,
}: PanelCardProps) {
  const peligro = tone === 'danger';

  return (
    <section
      className={`flex h-full flex-col gap-5 rounded-2xl border bg-surface p-5 sm:p-6 ${className}`}
      style={{ borderColor: peligro ? alpha(colors.error, 35) : colors.border }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: peligro ? alpha(colors.error, 12) : alpha(colors.primary, 12),
                color: peligro ? colors.error : colors.primary,
              }}
            >
              {icon}
            </span>
          )}

          <div className="flex min-w-0 flex-col gap-1">
            {/* `<h2>`: el `<h1>` de la pantalla lo pone `AppHeader`, y estos
                encabezados son los que dan el esquema a un lector de pantalla. */}
            <h2 className="font-display text-xl text-text-primary">{title}</h2>
            {description && <p className="font-sans text-sm text-text-secondary">{description}</p>}
          </div>
        </div>

        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>

      {children}
    </section>
  );
}
