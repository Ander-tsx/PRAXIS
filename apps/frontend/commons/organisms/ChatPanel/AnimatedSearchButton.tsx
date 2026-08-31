'use client';
import { useState, useRef, useEffect } from 'react';

export function AnimatedSearchButton({ onSearch, onClear }: { onSearch: (t: string) => void, onClear: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [termino, setTermino] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierta) {
      inputRef.current?.focus();
    } else {
      setTermino('');
      onClear();
    }
  }, [abierta, onClear]);

  return (
    <div className={`flex shrink-0 items-center overflow-hidden rounded-full border border-border bg-[#191919] transition-all duration-300 ${abierta ? 'w-48' : 'w-8 hover:bg-white/5'}`}>
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-label="Buscar"
        title="Buscar"
        className="flex h-8 w-8 shrink-0 items-center justify-center text-white transition-colors hover:text-text-primary"
      >
        {abierta ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        type="text"
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch(termino);
          if (e.key === 'Escape') setAbierta(false);
        }}
        placeholder="Buscar..."
        className={`flex-1 bg-transparent pr-3 font-sans text-xs text-text-primary outline-none placeholder:text-white transition-opacity duration-200 ${abierta ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
