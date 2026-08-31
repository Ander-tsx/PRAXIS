import type { ReactNode } from 'react';

export interface StatItemProps {
  value: ReactNode;
  label: string;
}

/**
 * StatItem — número grande + etiqueta descriptiva.
 * Usado en la sección hero para mostrar métricas del producto
 * (ej: "11 Módulos", "4 Ciclos", "∞ Permisos").
 */
export function StatItem({ value, label }: StatItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-2xl text-text-primary">{value}</span>
      <span className="font-sans text-xs text-white uppercase tracking-wide">{label}</span>
    </div>
  );
}
