'use client';
import { type ReactNode, useContext, useEffect } from 'react';
import { WidgetContext } from '../../organisms/ReportCanvas/WidgetContext';

export function HowToRead({ children }: { children: ReactNode }) {
  const { flipped, setFlipped, setHasHelp } = useContext(WidgetContext);

  useEffect(() => {
    setHasHelp(true);
    return () => setHasHelp(false);
  }, [setHasHelp]);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-surface p-5 rounded-2xl z-10"
      style={{
        pointerEvents: flipped ? 'auto' : 'none',
        visibility: flipped ? 'visible' : 'hidden',
        opacity: flipped ? 1 : 0,
        transition: 'opacity 0.2s ease, visibility 0.2s ease',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFlipped(false)}
          className="shrink-0 rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          title="Volver al gráfico"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h3 className="font-display text-lg text-text-primary">Cómo se lee esto</h3>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-3 font-sans text-sm leading-relaxed text-text-secondary [&_strong]:font-semibold [&_strong]:text-text-primary">
          {children}
        </div>
      </div>
    </div>
  );
}
