'use client';

export type VistaTablero = 'kanban' | 'calendario' | 'tabla' | 'backlog' | 'sprint';

export const VISTAS: VistaTablero[] = ['kanban', 'calendario', 'tabla'];

/**
 * Las dos que añade Scrum (D1 de `docs/PLAN-SCRUM-KANBAN.md`). Van **después**
 * de las de siempre y solo en un tablero con Scrum: son capa encima del
 * Kanban, no alternativas a él.
 */
export const VISTAS_SCRUM: VistaTablero[] = ['backlog', 'sprint'];

export function esVista(v: string | undefined | null): v is VistaTablero {
  return v === 'kanban' || v === 'calendario' || v === 'tabla' || v === 'backlog' || v === 'sprint';
}

export function esVistaScrum(v: VistaTablero): boolean {
  return VISTAS_SCRUM.includes(v);
}

const CONFIG: Record<VistaTablero, { etiqueta: string; d: string }> = {
  kanban: { etiqueta: 'Kanban', d: 'M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z' },
  calendario: {
    etiqueta: 'Calendario',
    d: 'M4 8h16M8 3v3M16 3v3M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  },
  tabla: { etiqueta: 'Tabla', d: 'M4 6h16M4 12h16M4 18h16M9 6v12' },
  backlog: { etiqueta: 'Backlog', d: 'M4 6h11M4 12h11M4 18h7M18 5v14m0 0l-3-3m3 3l3-3' },
  sprint: { etiqueta: 'Sprint', d: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
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
  scrum = false,
}: {
  value: VistaTablero;
  onChange: (v: VistaTablero) => void;
  /** Tablero con Scrum encendido: añade Backlog y Sprint. */
  scrum?: boolean;
}) {
  const vistas = scrum ? [...VISTAS, ...VISTAS_SCRUM] : VISTAS;
  return (
    <div
      role="tablist"
      aria-label="Vista del tablero"
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/10 bg-[#191919] p-0.5"
    >
      {vistas.map((v) => {
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
              activo ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'
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
