'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  type AssistantQuota,
  PRAX_CONTEXTO_LARGO,
  type UsoDelTurno,
  formatearTokens,
  formatoReinicio,
} from '../../api/assistant';

/**
 * Cuánto pesa la conversación, como el anillo de contexto de cualquier chat de
 * IA (D9 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué un anillo y no una frase
 *
 * Esto era una línea fija encima del compositor —«Esta conversación: 8,2 mil
 * tokens PRAX · te quedan…»— que decía lo mismo en cada turno y ocupaba el sitio
 * más caro de la pantalla. El dueño del producto pidió lo que ya conoce de los
 * LLM: un anillo que se va llenando junto a «Recursos», y el desglose al
 * pulsarlo. Quien no lo busca no lo lee; quien lo busca lo tiene a un clic.
 *
 * ## Qué llena el anillo
 *
 * El **contexto** del último turno —lo que reenviará el siguiente— contra
 * `PRAX_CONTEXTO_LARGO`. No el gasto acumulado: una conversación larga no
 * cuesta más una vez, cuesta más **en cada mensaje**, y eso es lo que el anillo
 * tiene que avisar. Al llenarse se pone ámbar y el desglose ofrece empezar otra.
 *
 * ⚠️ Se llaman **tokens**, sin apellido. «Tokens PRAX» obligaba a explicar una
 * unidad inventada; la ponderación (`tokensPrax()` en los contratos) sigue
 * existiendo por dentro y el plan lo explica donde se paga.
 */
export function MedidorDeTokens({
  usos,
  cuota,
  onNueva,
}: {
  /** Los `uso` de las respuestas de PRAX de esta conversación, en orden. */
  usos: UsoDelTurno[];
  cuota: AssistantQuota | null;
  onNueva: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  const ultimo = usos[usos.length - 1] ?? null;
  const contexto = ultimo?.contexto ?? 0;
  const gastado = usos.reduce((total, uso) => total + uso.tokensPrax, 0);
  const fraccion = Math.min(1, contexto / PRAX_CONTEXTO_LARGO);
  const largo = contexto >= PRAX_CONTEXTO_LARGO;
  const delMes = cuota ? Math.min(1, cuota.usados / Math.max(1, cuota.limite)) : 0;

  /* Sin nada que medir todavía —conversación nueva y sin cuota— no se pinta:
     un anillo vacío que al pulsarlo dice «0» es ruido. */
  if (!ultimo && !cuota) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={panelId}
        aria-label={`Contexto: ${Math.round(fraccion * 100)} %. Ver consumo de tokens`}
        title="Consumo de tokens"
        className="group flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
      >
        <Anillo fraccion={fraccion} aviso={largo} />
        {ultimo && (
          <span
            className={[
              'font-mono text-[10.5px] tabular-nums transition-colors',
              largo ? 'text-warning' : 'text-text-disabled group-hover:text-text-secondary',
            ].join(' ')}
          >
            {Math.round(fraccion * 100)}%
          </span>
        )}
      </button>

      {abierto && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Consumo de tokens"
          data-tone="dark"
          className="animate-desplegar-panel absolute bottom-full left-0 z-40 mb-2 flex w-72 flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-3.5 shadow-2xl"
        >
          <Fila
            etiqueta="Contexto"
            valor={`${formatearTokens(contexto)} / ${formatearTokens(PRAX_CONTEXTO_LARGO)}`}
          />
          <Barra fraccion={fraccion} aviso={largo} />
          <p className="-mt-1 font-sans text-[11px] leading-snug text-text-secondary">
            {largo
              ? 'La conversación ya es larga: cada mensaje la reenvía entera y gasta mucho más que empezar otra.'
              : 'Cada mensaje reenvía la conversación entera: cuanto más larga, más gasta.'}
          </p>

          {ultimo && (
            <>
              <div className="border-t border-border" />
              <Fila etiqueta="Esta conversación" valor={`${formatearTokens(gastado)} tokens`} />
              <Fila
                etiqueta="Última respuesta"
                valor={`${formatearTokens(ultimo.tokensPrax)} tokens`}
              />
              <dl className="-mt-1.5 grid grid-cols-3 gap-1 font-mono text-[10.5px] tabular-nums text-text-secondary">
                <Dato etiqueta="entrada" valor={ultimo.entrada} />
                <Dato etiqueta="salida" valor={ultimo.salida} />
                <Dato etiqueta="razonar" valor={ultimo.razonamiento} />
              </dl>
            </>
          )}

          {cuota && (
            <>
              <div className="border-t border-border" />
              <Fila
                etiqueta="Este mes"
                valor={`${formatearTokens(cuota.usados)} / ${formatearTokens(cuota.limite)}`}
              />
              <Barra fraccion={delMes} aviso={delMes >= 0.9} />
              <p className="-mt-1 font-sans text-[11px] text-text-secondary">
                Tu cuota personal en esta organización. Vuelve el {formatoReinicio(cuota.reinicia)}.
              </p>
            </>
          )}

          {largo && (
            <button
              type="button"
              onClick={() => {
                setAbierto(false);
                onNueva();
              }}
              className="rounded-lg border border-border px-3 py-1.5 font-sans text-xs font-medium text-text-primary transition-colors hover:bg-surface"
            >
              Empezar una conversación nueva
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** El anillo: una pista tenue y el arco que se llena, con transición. */
function Anillo({ fraccion, aviso }: { fraccion: number; aviso: boolean }) {
  const radio = 6.5;
  const vuelta = 2 * Math.PI * radio;
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] -rotate-90" aria-hidden="true">
      <circle
        cx="9"
        cy="9"
        r={radio}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.18}
        strokeWidth={2.25}
      />
      <circle
        cx="9"
        cy="9"
        r={radio}
        fill="none"
        stroke={aviso ? 'var(--color-warning)' : 'currentColor'}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeDasharray={vuelta}
        /* Un mínimo visible: con 1 % el arco no se vería y parecería roto. */
        strokeDashoffset={vuelta * (1 - Math.max(fraccion, fraccion > 0 ? 0.04 : 0))}
        style={{
          transition: 'stroke-dashoffset 700ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms',
        }}
      />
    </svg>
  );
}

function Barra({ fraccion, aviso }: { fraccion: number; aviso: boolean }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-border">
      <div
        className={['h-full rounded-full', aviso ? 'bg-warning' : 'bg-text-primary'].join(' ')}
        style={{
          width: `${Math.max(fraccion * 100, fraccion > 0 ? 2 : 0)}%`,
          transition: 'width 700ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-sans text-xs">
      <span className="text-text-secondary">{etiqueta}</span>
      <span className="font-medium tabular-nums text-text-primary">{valor}</span>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-text-disabled">{etiqueta}</dt>
      <dd className="text-text-secondary">{formatearTokens(valor)}</dd>
    </div>
  );
}
