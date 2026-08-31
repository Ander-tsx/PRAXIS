'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Los dos controles del compositor de PRAX: el selector de modelo («Auto», junto
 * a Enviar) y el menú de ajustes/personalización (junto al «+»).
 *
 * ⚠️ **Ahora mismo son un armazón.** El cambio de modelo real y el modo agente
 * llegan más adelante; lo único que hacen hoy es recordar la elección en
 * `localStorage`. Los recursos por proyecto tampoco filtran nada todavía — el
 * backend del asistente sin foco no los lee aún.
 */

/* ─── Selector de modelo ────────────────────────────────────────────────── */

interface OpcionModelo {
  id: string;
  nombre: string;
  detalle?: string;
  disponible: boolean;
}

/**
 * El único disponible es el Gemini que usamos hoy (`gemini-flash-latest`) y el
 * modo `auto`, que usa ese mismo. El resto es catálogo apagado.
 */
const MODELOS: { grupo: string; opciones: OpcionModelo[] }[] = [
  {
    grupo: '',
    opciones: [
      { id: 'auto', nombre: 'Auto', detalle: 'Elige el mejor disponible', disponible: true },
    ],
  },
  {
    grupo: 'Gemini',
    opciones: [
      {
        id: 'gemini-flash-latest',
        nombre: 'Gemini 3.1 Flash',
        detalle: 'El que usa PRAX ahora',
        disponible: true,
      },
      { id: 'gemini-3.1-pro', nombre: 'Gemini 3.1 Pro', disponible: false },
    ],
  },
  {
    grupo: 'Claude',
    opciones: [
      { id: 'claude-sonnet-5', nombre: 'Claude Sonnet 5', disponible: false },
      { id: 'claude-haiku-5', nombre: 'Claude Haiku 5', disponible: false },
    ],
  },
];

const MODELO_KEY = 'praxis_prax_modelo';

function nombreDeModelo(id: string): string {
  for (const g of MODELOS) {
    const o = g.opciones.find((x) => x.id === id);
    if (o) return o.nombre;
  }
  return 'Auto';
}

function useMenuAbierto() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);
  return { abierto, setAbierto, ref };
}

export function ModeloSelector() {
  const { abierto, setAbierto, ref } = useMenuAbierto();
  const [modelo, setModelo] = useState('auto');

  useEffect(() => {
    try {
      const g = localStorage.getItem(MODELO_KEY);
      if (g) setModelo(g);
    } catch {}
  }, []);

  function elegir(id: string) {
    setModelo(id);
    try {
      localStorage.setItem(MODELO_KEY, id);
    } catch {}
    setAbierto(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 font-sans text-xs font-medium text-white transition-colors hover:bg-white/5 hover:text-text-primary"
      >
        {nombreDeModelo(modelo)}
        <svg
          className="h-3 w-3 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-40 mb-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl"
        >
          {MODELOS.map((g) => (
            <div key={g.grupo || 'auto'}>
              {g.grupo && (
                <div className="px-3 pt-2 pb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-white">
                  {g.grupo}
                </div>
              )}
              {g.opciones.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={modelo === o.id}
                  disabled={!o.disponible}
                  onClick={() => o.disponible && elegir(o.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    o.disponible
                      ? modelo === o.id
                        ? 'bg-white/10 text-white'
                        : 'text-white hover:bg-white/5 hover:text-white'
                      : 'cursor-not-allowed text-white'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[13px]">{o.nombre}</span>
                    {o.detalle && (
                      <span className="block truncate font-sans text-[11px] text-white">
                        {o.detalle}
                      </span>
                    )}
                  </span>
                  {!o.disponible && (
                    <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-white">
                      Pronto
                    </span>
                  )}
                  {o.disponible && modelo === o.id && (
                    <svg
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
          <p className="px-3 pt-1.5 pb-1 font-sans text-[10px] leading-snug text-white">
            El cambio real de modelo llegará más adelante.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Ajustes / personalización ─────────────────────────────────────────── */

interface Proyecto {
  id: string;
  name: string;
}

interface RecursosCfg {
  total: boolean;
  permitidos: string[];
}

function recursosKey(orgId: string | null) {
  return `praxis_prax_recursos:${orgId ?? 'sin-org'}`;
}

export function AjustesMenu({
  gatewayPath,
  organizacionActivaId,
}: {
  gatewayPath: string;
  organizacionActivaId: string | null;
}) {
  const { abierto, setAbierto, ref } = useMenuAbierto();
  const [sub, setSub] = useState<'recursos' | 'modo' | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cfg, setCfg] = useState<RecursosCfg>({ total: true, permitidos: [] });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(recursosKey(organizacionActivaId));
      if (raw) {
        const p = JSON.parse(raw) as RecursosCfg;
        if (typeof p?.total === 'boolean')
          setCfg({ total: p.total, permitidos: p.permitidos ?? [] });
      }
    } catch {}
  }, [organizacionActivaId]);

  const guardar = useCallback(
    (next: RecursosCfg) => {
      setCfg(next);
      try {
        localStorage.setItem(recursosKey(organizacionActivaId), JSON.stringify(next));
      } catch {}
    },
    [organizacionActivaId],
  );

  /* Los proyectos de la organización activa, para el submenú de Recursos. Se
     piden al abrir el menú, no antes. */
  useEffect(() => {
    if (!abierto || proyectos.length > 0) return;
    const params = new URLSearchParams({ limit: '50' });
    if (organizacionActivaId) params.set('organizationId', organizacionActivaId);
    fetch(`${gatewayPath}/projects?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        const items: any[] = body?.data?.items ?? (Array.isArray(body?.data) ? body.data : []);
        setProyectos(items.map((p) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, [abierto, gatewayPath, organizacionActivaId, proyectos.length]);

  const nProyectosOn = cfg.total ? proyectos.length : cfg.permitidos.length;

  function toggleProyecto(id: string) {
    const set = new Set(cfg.permitidos);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    guardar({ total: false, permitidos: [...set] });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Ajustes de PRAX"
        title="Ajustes"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 hover:text-text-primary"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 8h9M18 8h1M5 16h1M10 16h9M13 5v6M8 13v6"
          />
        </svg>
      </button>

      {abierto && (
        <div
          role="menu"
          /* Los submenús se abren **arriba** de este menú (`bottom-full`), como un
             panel aparte apilado encima — no tapándolo ni a un lado (a un lado se
             salía del minichat). Se abren con clic, no con hover. */
          className="absolute bottom-full left-0 z-40 mb-2 w-60 rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl"
        >
          {/* ── Vista principal ── */}
          <button
            type="button"
            onClick={() => setSub((s) => (s === 'recursos' ? null : 'recursos'))}
            aria-expanded={sub === 'recursos'}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-sans text-[13px] transition-colors hover:bg-white/5 hover:text-white ${
              sub === 'recursos' ? 'bg-white/5 text-white' : 'text-white'
            }`}
          >
            <IconoRecurso />
            <span className="flex-1">Recursos</span>
            <span className="font-sans text-[11px] text-white">{nProyectosOn}</span>
            <IconoFlechaDerecha />
          </button>

          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-left font-sans text-[13px] text-white"
          >
            <IconoMcp />
            <span className="flex-1">MCP</span>
            <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-white">
              Pronto
            </span>
          </button>

          <div className="my-1 border-t border-white/5" />

          <button
            type="button"
            onClick={() => setSub((s) => (s === 'modo' ? null : 'modo'))}
            aria-expanded={sub === 'modo'}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-sans text-[13px] transition-colors hover:bg-white/5 hover:text-white ${
              sub === 'modo' ? 'bg-white/5 text-white' : 'text-white'
            }`}
          >
            <IconoModo />
            <span className="flex-1">Modo</span>
            <span className="font-sans text-[11px] text-white">Default</span>
            <IconoFlechaDerecha />
          </button>

          {/* ── Submenú: Recursos (arriba) ── */}
          {sub === 'recursos' && (
            <div className="absolute bottom-full left-0 z-50 mb-2 flex max-h-[22rem] w-full flex-col rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl">
              <SubHeader titulo="Recursos" onVolver={() => setSub(null)} />
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
                <FilaToggle
                  etiqueta="Acceso total"
                  detalle="A todo lo que puedes ver"
                  activo={cfg.total}
                  onToggle={() => guardar({ total: !cfg.total, permitidos: cfg.permitidos })}
                />
                <div className="my-1 border-t border-white/5" />
                {proyectos.length === 0 ? (
                  <p className="px-3 py-2 font-sans text-[11px] text-white">
                    Sin proyectos en esta organización.
                  </p>
                ) : (
                  proyectos.map((p) => (
                    <FilaToggle
                      key={p.id}
                      etiqueta={p.name}
                      activo={cfg.total || cfg.permitidos.includes(p.id)}
                      atenuado={cfg.total}
                      onToggle={() => toggleProyecto(p.id)}
                    />
                  ))
                )}
                <div className="my-1 border-t border-white/5" />
                <FilaToggle
                  etiqueta="Servidores MCP"
                  detalle="Beta"
                  activo={false}
                  bloqueado
                  onToggle={() => {}}
                />
              </div>
              <p className="shrink-0 px-3 pt-1 font-sans text-[10px] leading-snug text-white">
                PRAX solo mira lo que marques aquí.
              </p>
            </div>
          )}

          {/* ── Submenú: Modo (arriba) ── */}
          {sub === 'modo' && (
            <div className="absolute bottom-full left-0 z-50 mb-2 flex w-full flex-col rounded-xl border border-white/10 bg-[#0f0f0e] p-1 shadow-2xl">
              <SubHeader titulo="Modo" onVolver={() => setSub(null)} />
              <button
                type="button"
                role="menuitemradio"
                aria-checked="true"
                className="flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-white"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-[13px]">Default</span>
                  <span className="block font-sans text-[11px] text-white">
                    PRAX propone; nunca ejecuta.
                  </span>
                </span>
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-left text-white"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-sans text-[13px]">Auto</span>
                  <span className="block font-sans text-[11px] text-white">
                    Actúa por su cuenta.
                  </span>
                </span>
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-wider text-white">
                  Pronto
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** La cabecera de un submenú: título y una flecha para volver al menú. */
function SubHeader({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  return (
    <button
      type="button"
      onClick={onVolver}
      className="mb-1 flex w-full shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-sans text-[11px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-white/5 hover:text-white"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
      </svg>
      {titulo}
    </button>
  );
}

function FilaToggle({
  etiqueta,
  detalle,
  activo,
  atenuado = false,
  bloqueado = false,
  onToggle,
}: {
  etiqueta: string;
  detalle?: string;
  activo: boolean;
  atenuado?: boolean;
  bloqueado?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={bloqueado}
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
        bloqueado ? 'cursor-not-allowed' : 'hover:bg-white/5'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-sans text-[13px] ${
            bloqueado ? 'text-white' : atenuado ? 'text-white' : 'text-white'
          }`}
        >
          {etiqueta}
        </span>
        {detalle && <span className="block font-sans text-[10px] text-white">{detalle}</span>}
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          activo ? 'bg-primary' : 'bg-white/15'
        } ${bloqueado ? 'opacity-40' : ''}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            activo ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function IconoFlechaDerecha() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}
function IconoRecurso() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v6m0 0l3-3m-3 3L9 6M5 13a3 3 0 106 0 3 3 0 00-6 0zm8 0a3 3 0 106 0 3 3 0 00-6 0z"
      />
    </svg>
  );
}
function IconoMcp() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 3v4M15 3v4M6 7h12l-1 6a5 5 0 01-10 0L6 7zM9 21v-4M15 21v-4"
      />
    </svg>
  );
}
function IconoModo() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20l6-6M13 3l8 8-9 9H4v-8l9-9z" />
    </svg>
  );
}
