'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../../atoms';
import { PraxAvatar } from '../../atoms/PraxAvatar';
import { alpha, colors } from '../../tokens';

/**
 * La guía en L que cuelga de la fila de arriba.
 */
function Guia({ ultimo, columnas }: { ultimo: boolean; columnas?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute left-0 w-px ${ultimo ? 'h-[18px]' : 'h-full'}`}
        style={{ top: 0, background: colors.border }}
      />
      <span
        aria-hidden="true"
        className="absolute left-0 h-px"
        style={{ top: 18, width: columnas ? 12 : 16, background: colors.border }}
      />
    </>
  );
}

/**
 * Tarjeta de la propuesta.
 */
function Tarjeta({
  titulo,
  etiqueta,
  tono,
}: {
  titulo: string;
  etiqueta: string;
  tono: string;
}) {
  return (
    <div className="flex w-full flex-col items-start rounded-lg border border-border px-3 py-2 text-left bg-surface">
      <span className="flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: alpha(tono, 15), color: tono }}
        >
          {etiqueta}
        </span>
        <span className="font-sans text-sm font-medium text-text-primary">{titulo}</span>
      </span>
    </div>
  );
}

/**
 * Columna de la propuesta.
 */
function ColumnaChip({ nombre, cierra }: { nombre: string; cierra?: boolean }) {
  const tono = cierra ? colors.success : colors.textSecondary;

  return (
    <div
      className="rounded-md px-2 py-1 font-sans text-xs font-medium"
      style={{ background: alpha(tono, 15), color: tono }}
    >
      {nombre}
      {cierra && <span className="ml-1 opacity-70">· cierra tareas</span>}
    </div>
  );
}

export function MockMiniChat({ onCancelar }: { onCancelar: () => void }) {
  const [messages, setMessages] = useState<
    { role: 'user' | 'model'; text: string; hasProposal?: boolean }[]
  >([
    {
      role: 'model',
      text: '¡Hola! Cuéntame qué tipo de proyecto quieres crear y prepararé una propuesta con los espacios, tableros y columnas necesarios.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', text: inputValue }]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: 'He preparado esta estructura para tu proyecto. Puedes revisar y ajustar lo que no necesites.',
          hasProposal: true,
        },
      ]);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-surface-elevated border border-border rounded-sm overflow-hidden shadow-sm relative">
      <header className="flex items-center gap-3 border-b border-border p-4 bg-surface shrink-0">
        <PraxAvatar size="sm" mood={isTyping ? 'thinking' : 'idle'} />
        <div>
          <h3 className="font-sans font-semibold text-text-primary text-sm">Asistente PRAX</h3>
          <p className="font-sans text-xs text-text-secondary">Diseñando tu proyecto</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'self-end flex-row-reverse' : 'self-start'}`}
          >
            {msg.role === 'model' && <PraxAvatar size="xs" mood="idle" className="mt-1 shrink-0" />}
            <div className="flex flex-col gap-2 min-w-0">
              <div
                className={`px-4 py-2.5 rounded-sm font-sans text-[15px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-surface border border-border text-text-primary rounded-tl-sm'}`}
              >
                {msg.text}
              </div>

              {msg.hasProposal && (
                <div className="border border-border rounded-sm bg-surface shadow-sm mt-2 flex flex-col overflow-hidden w-[400px] max-w-full">
                  <div className="bg-hover/50 p-3 border-b border-border flex items-center gap-2">
                    <div className="bg-primary/10 text-primary p-1 rounded-md">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                    </div>
                    <span className="font-sans font-semibold text-sm text-text-primary">
                      Estructura de trabajo
                    </span>
                  </div>

                  <div className="p-4 bg-surface">
                    <ul className="flex flex-col gap-3">
                      <li>
                        <Tarjeta titulo="Desarrollo" etiqueta="Espacio" tono={colors.primary} />
                        <ul className="mt-2 flex flex-col gap-2 pl-3">
                          <li className="relative pl-5">
                            <Guia ultimo={true} />
                            <Tarjeta titulo="Sprints" etiqueta="Tablero" tono={colors.info} />
                            <div className="relative mt-2 pl-5">
                              <Guia ultimo={true} columnas />
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ColumnaChip nombre="To Do" />
                                <ColumnaChip nombre="In Progress" />
                                <ColumnaChip nombre="Review" />
                                <ColumnaChip nombre="Done" cierra />
                              </div>
                            </div>
                          </li>
                        </ul>
                      </li>
                      <li>
                        <Tarjeta titulo="Diseño" etiqueta="Espacio" tono={colors.primary} />
                        <ul className="mt-2 flex flex-col gap-2 pl-3">
                          <li className="relative pl-5">
                            <Guia ultimo={true} />
                            <Tarjeta titulo="UI/UX" etiqueta="Tablero" tono={colors.info} />
                            <div className="relative mt-2 pl-5">
                              <Guia ultimo={true} columnas />
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ColumnaChip nombre="Backlog" />
                                <ColumnaChip nombre="Wireframes" />
                                <ColumnaChip nombre="Aprobado" cierra />
                              </div>
                            </div>
                          </li>
                        </ul>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-surface-elevated border-t border-border p-3 flex justify-end gap-2 shrink-0">
                    <Button variant="secondary" size="sm">
                      Ajustar
                    </Button>
                    <Button variant="primary" size="sm">
                      Crear proyecto
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3 max-w-[85%] self-start items-center text-text-secondary font-sans text-[13px]">
            <PraxAvatar size="xs" mood="thinking" />
            <span className="animate-pulse">Escribiendo propuesta...</span>
          </div>
        )}
      </div>

      <div className="p-4 bg-surface shrink-0">
        <form
          onSubmit={handleSend}
          className="flex items-end gap-2 bg-[#F0F2F6] border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-[20px] pl-5 pr-2 py-2 transition-shadow"
        >
          <textarea
            rows={1}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onInput={(e) => {
              const area = e.currentTarget;
              area.style.height = 'auto';
              area.style.height = `${Math.min(area.scrollHeight, 60)}px`;
            }}
            placeholder="Escribe un mensaje..."
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none font-sans text-[15px] placeholder:text-text-secondary py-1.5 resize-none"
            disabled={isTyping}
          />

          <button
            type="button"
            className="p-2 text-text-secondary hover:text-text-primary rounded-sm transition-colors shrink-0"
            aria-label="Adjuntar archivo"
          >
            <svg
              className="w-5 h-5 transform -rotate-45"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>

          <button
            type="submit"
            disabled={!inputValue.trim() || isTyping}
            className="p-2 bg-[#E6E4F4] text-primary disabled:opacity-50 rounded-[14px] transition-colors shrink-0"
            aria-label="Enviar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
