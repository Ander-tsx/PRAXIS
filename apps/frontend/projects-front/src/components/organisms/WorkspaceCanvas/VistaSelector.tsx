'use client';

export type VistaTablero = 'kanban' | 'calendario' | 'tabla';

export const VISTAS: VistaTablero[] = ['kanban', 'calendario', 'tabla'];

export function esVista(v: string | undefined | null): v is VistaTablero {
  return v === 'kanban' || v === 'calendario' || v === 'tabla';
}

const CONFIG: Record<VistaTablero, { etiqueta: string; d: string }> = {
  kanban: { etiqueta: 'Kanban', d: 'M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z' },
  calendario: {
    etiqueta: 'Calendario',
    d: 'M4 8h16M8 3v3M16 3v3M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  },
  tabla: { etiqueta: 'Tabla', d: 'M4 6h16M4 12h16M4 18h16M9 6v12' },
};

/**
 * El selector de vista del tablero: Kanban (por defecto), Calendario y Tabla.
 *
 * Es solo presentación de los **mismos datos** —las mismas tareas—, así que el
 * cambio no navega al servidor: quien lo monta lleva la elección a la URL con
 * `replaceState`.
 */
export function VistaSelector({
  value,
  onChange,
}: {
  value: VistaTablero;
  onChange: (v: VistaTablero) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Vista del tablero"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-[#131312] p-0.5"
    >
      {VISTAS.map((v) => {
        const activo = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onChange(v)}
            title={CONFIG[v].etiqueta}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
              activo ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={CONFIG[v].d} />
            </svg>
            <span className="hidden md:inline">{CONFIG[v].etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}
