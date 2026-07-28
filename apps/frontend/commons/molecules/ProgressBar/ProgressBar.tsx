export interface ProgressBarProps {
  label?: string;
  value: string | number;
  percentage: number;
  color?: string;
  height?: number;
}

/**
 * ProgressBar — barra de avance con etiqueta y valor.
 * Pensada para porcentajes de progreso (tareas completadas, avance de un tablero).
 * Used in LandingHowItWorks role cards.
 */
export function ProgressBar({
  label,
  value,
  percentage,
  color = 'var(--color-primary)',
  height = 6,
}: ProgressBarProps) {
  const clampedPct = Math.min(100, Math.max(0, percentage));

  return (
    <div className="flex flex-col gap-1.5">
      {(label !== undefined || value !== undefined) && (
        <div className="flex justify-between">
          {label && <span className="font-sans text-xs text-text-disabled">{label}</span>}
          {value !== undefined && (
            <span className="font-sans text-xs font-medium text-text-primary">{value}</span>
          )}
        </div>
      )}
      <div
        className="rounded-full overflow-hidden"
        style={{ height, background: 'var(--color-border)' }}
        role="progressbar"
        aria-valuenow={clampedPct}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${clampedPct}%`, background: color }}
        />
      </div>
    </div>
  );
}
