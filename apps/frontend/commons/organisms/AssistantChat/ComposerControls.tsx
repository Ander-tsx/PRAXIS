'use client';

import { useEffect, useRef, useState } from 'react';
import { type AssistantModelo, MODELOS_DE_PRAX } from '../../api/assistant';
import { type AlcanceDePrax, alcanceAction, guardarAlcanceAction } from '../../assistant/actions';

/**
 * «Recursos» de PRAX: qué proyectos de la organización activa puede consultar
 * (D5 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Qué cambió (F2)
 *
 * Esto era un armazón. Guardaba la elección en `localStorage` y el backend no la
 * leía nunca, así que el texto «PRAX solo mira lo que marques aquí» era falso.
 * Ahora la elección se guarda en el servidor por persona y organización, el
 * gateway comprueba cada proyecto al guardar, y el turno la aplica.
 *
 * Se fueron también los controles que no hacían nada: el selector de modelo
 * (el modelo es uno, `gemini-flash-latest`), el modo «Auto» y los servidores
 * MCP, todos marcados «Pronto». Un interruptor que no cambia nada enseña a no
 * fiarse de los que sí.
 */
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

export function RecursosMenu({ organizacionActivaId }: { organizacionActivaId: string | null }) {
  const { abierto, setAbierto, ref } = useMenuAbierto();
  const [alcance, setAlcance] = useState<AlcanceDePrax | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Se pide al abrir, y otra vez si cambia la organización: los recursos son de
     una organización, y los de la anterior no valen en esta. */
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setCargando(true);
    setError(null);
    alcanceAction()
      .then((recibido) => {
        if (vigente) setAlcance(recibido);
      })
      .catch(() => {
        if (vigente) setError('No se han podido cargar los recursos.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, organizacionActivaId]);

  async function guardar(modo: 'ALL' | 'SELECTED', projectIds: string[]) {
    if (!alcance) return;
    const anterior = alcance;
    /* Optimista: el interruptor responde en el acto. Si el servidor dice que no,
       se vuelve a lo que había y se explica por qué. */
    setAlcance({
      ...alcance,
      modo,
      proyectos: alcance.proyectos.map((p) => ({
        ...p,
        incluido: modo === 'ALL' || projectIds.includes(p.id),
      })),
    });
    setGuardando(true);
    setError(null);
    const { alcance: guardado, error: fallo } = await guardarAlcanceAction(modo, projectIds);
    setGuardando(false);
    if (fallo || !guardado) {
      setAlcance(anterior);
      setError(fallo ?? 'No se han podido guardar los recursos.');
      return;
    }
    setAlcance(guardado);
  }

  function alternarTodo() {
    if (!alcance) return;
    if (alcance.modo === 'ALL') {
      /* Al dejar «todo», se parte de todo marcado: quitar uno es el gesto que
         sigue, y empezar de cero obligaría a marcarlos todos para quitar uno. */
      void guardar(
        'SELECTED',
        alcance.proyectos.map((p) => p.id),
      );
    } else {
      void guardar('ALL', []);
    }
  }

  function alternarProyecto(id: string) {
    if (!alcance) return;
    const marcados = new Set(alcance.proyectos.filter((p) => p.incluido).map((p) => p.id));
    if (marcados.has(id)) marcados.delete(id);
    else marcados.add(id);
    void guardar('SELECTED', [...marcados]);
  }

  const incluidos = alcance?.proyectos.filter((p) => p.incluido).length ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label="Recursos de PRAX"
        title="Recursos de PRAX"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <IconoRecurso />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Recursos de PRAX"
          /* Sin `data-tone="dark"`, los tokens de superficie resuelven a la paleta
             azulada general y el panel desentona del monocromo de PRAX. Ver la
             nota gemela en `projects/[id]/page.tsx`. */
          data-tone="dark"
          className="absolute bottom-full left-0 z-40 mb-2 flex max-h-[22rem] w-64 flex-col rounded-xl border border-border bg-surface-elevated p-1 shadow-2xl"
        >
          <div className="flex shrink-0 items-baseline justify-between px-3 pt-2 pb-1">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Recursos
            </span>
            {alcance && (
              <span className="font-sans text-[11px] text-text-secondary">
                {incluidos} de {alcance.proyectos.length}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">
            {cargando && !alcance ? (
              <p className="px-3 py-2 font-sans text-[12px] text-text-secondary">Cargando…</p>
            ) : !alcance ? null : (
              <>
                <FilaToggle
                  etiqueta="Todos los proyectos"
                  detalle="Los que puedes ver en esta organización"
                  activo={alcance.modo === 'ALL'}
                  bloqueado={guardando}
                  onToggle={alternarTodo}
                />
                <div className="my-1 border-t border-border" />
                {alcance.proyectos.length === 0 ? (
                  <p className="px-3 py-2 font-sans text-[12px] text-text-secondary">
                    No hay proyectos de los que puedas hablar con PRAX en esta organización.
                  </p>
                ) : (
                  alcance.proyectos.map((p) => (
                    <FilaToggle
                      key={p.id}
                      etiqueta={p.nombre}
                      activo={p.incluido}
                      atenuado={alcance.modo === 'ALL'}
                      bloqueado={guardando}
                      onToggle={() => alternarProyecto(p.id)}
                    />
                  ))
                )}
              </>
            )}
          </div>

          {error ? (
            <p role="alert" className="shrink-0 px-3 pt-1 pb-1 font-sans text-[11px] text-error">
              {error}
            </p>
          ) : (
            <p className="shrink-0 px-3 pt-1 pb-1 font-sans text-[11px] leading-snug text-text-secondary">
              PRAX solo consulta los proyectos marcados. El que tengas abierto cuenta siempre.
            </p>
          )}
        </div>
      )}
    </div>
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
        bloqueado ? 'cursor-wait' : 'hover:bg-surface'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-sans text-[13px] ${
            atenuado ? 'text-text-secondary' : 'text-text-primary'
          }`}
        >
          {etiqueta}
        </span>
        {detalle && (
          <span className="block font-sans text-[10px] text-text-secondary">{detalle}</span>
        )}
      </span>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          activo ? 'bg-primary' : 'bg-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-text-primary transition-transform ${
            activo ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function IconoRecurso() {
  return (
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
        d="M4 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

const CLAVE_DEL_MODELO = 'praxis_prax_modelo';

/**
 * El modelo con el que responde PRAX, recordado en este navegador.
 *
 * `localStorage` y no el servidor: es una preferencia de quien mira, sin nada
 * que compartir ni que proteger, y si se pierde vuelve a Gemini, que es lo
 * seguro. Leer y escribir van en `try` porque en una ventana privada o con los
 * datos del sitio bloqueados el acceso mismo lanza.
 */
export function useModeloDePrax(): [AssistantModelo, (modelo: AssistantModelo) => void] {
  const [modelo, setModelo] = useState<AssistantModelo>('gemini');
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_DEL_MODELO);
      if (MODELOS_DE_PRAX.some((m) => m.id === guardado)) setModelo(guardado as AssistantModelo);
    } catch {
      /* Sin almacenamiento: se queda en Gemini. */
    }
  }, []);
  const elegir = (nuevo: AssistantModelo) => {
    setModelo(nuevo);
    try {
      window.localStorage.setItem(CLAVE_DEL_MODELO, nuevo);
    } catch {
      /* Sin almacenamiento: vale para esta visita. */
    }
  };
  return [modelo, elegir];
}

/**
 * El selector de modelo del compositor.
 *
 * Volvió en 2026-09-30 con **dos opciones que hacen algo**: F2 lo había quitado
 * porque entonces solo había un modelo y el selector era de adorno. Cada una
 * dice en qué se diferencia, y la limitación de gpt-oss —solo texto— se dice
 * aquí, antes de elegirlo, no después de adjuntar una imagen.
 */
export function SelectorDeModelo({
  modelo,
  onElegir,
  disabled = false,
}: {
  modelo: AssistantModelo;
  onElegir: (modelo: AssistantModelo) => void;
  disabled?: boolean;
}) {
  const { abierto, setAbierto, ref } = useMenuAbierto();
  const actual = MODELOS_DE_PRAX.find((m) => m.id === modelo) ?? MODELOS_DE_PRAX[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Modelo: ${actual.nombre}`}
        title="Modelo de PRAX"
        className="flex h-8 items-center gap-1 rounded-lg px-2 font-sans text-xs font-medium text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary disabled:opacity-50"
      >
        {actual.nombre}
        <svg
          className={['h-3 w-3 transition-transform', abierto ? 'rotate-180' : ''].join(' ')}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {abierto && (
        <div
          role="listbox"
          aria-label="Modelo de PRAX"
          data-tone="dark"
          className="animate-desplegar-panel absolute right-0 bottom-full z-40 mb-2 flex w-72 flex-col rounded-xl border border-border bg-surface-elevated p-1 shadow-2xl"
        >
          {MODELOS_DE_PRAX.map((opcion) => {
            const elegido = opcion.id === modelo;
            return (
              <button
                key={opcion.id}
                type="button"
                role="option"
                aria-selected={elegido}
                onClick={() => {
                  onElegir(opcion.id);
                  setAbierto(false);
                }}
                className={[
                  'flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface',
                  elegido ? 'bg-surface' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    elegido ? 'bg-primary' : 'bg-transparent',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-sans text-[13px] font-medium text-text-primary">
                    {opcion.nombre}
                  </span>
                  <span className="font-sans text-[11px] leading-snug text-text-secondary">
                    {opcion.detalle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
