'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Preferencia = 'dark' | 'light' | 'system';

/** Espejo de `THEME_COOKIE` de `commons/theme/cookie.ts` (ese módulo es de servidor). */
const COOKIE = 'praxis_theme';
const UN_ANO = 60 * 60 * 24 * 365;

const OPCIONES: { valor: Preferencia; etiqueta: string; Icono: typeof Moon }[] = [
  { valor: 'dark', etiqueta: 'Tema oscuro', Icono: Moon },
  { valor: 'light', etiqueta: 'Tema claro', Icono: Sun },
  { valor: 'system', etiqueta: 'Seguir al sistema', Icono: Monitor },
];

function leerPreferencia(): Preferencia {
  const m = document.cookie.match(/(?:^|; )praxis_theme=([^;]+)/);
  const valor = m ? decodeURIComponent(m[1]) : 'dark';
  return valor === 'light' || valor === 'system' ? valor : 'dark';
}

/** El que sigue al sistema: se queda escuchando mientras la preferencia sea `system`. */
let oyenteDelSistema: (() => void) | null = null;

function aplicar(preferencia: Preferencia) {
  const html = document.documentElement;
  const consulta = window.matchMedia('(prefers-color-scheme: light)');
  oyenteDelSistema?.();
  oyenteDelSistema = null;

  if (preferencia === 'system') {
    const poner = () => html.setAttribute('data-theme', consulta.matches ? 'light' : 'dark');
    poner();
    consulta.addEventListener('change', poner);
    oyenteDelSistema = () => consulta.removeEventListener('change', poner);
  } else {
    html.setAttribute('data-theme', preferencia);
  }
}

/**
 * El selector de tema: **tres iconos** —oscuro, claro y seguir al sistema— en una píldora
 * compacta. Oscuro es el de siempre y el predeterminado.
 *
 * Se aplica **al instante** (`data-theme` en el `<html>`) y se guarda en la cookie `praxis_theme`,
 * que es la que lee el servidor al pintar y la que comparte con el resto de la aplicación. No
 * lleva Server Action ni refresco: cambiar de color no cambia ningún dato.
 *
 * Lee la cookie al montar y no en el primer pintado: el servidor no sabe qué opción está activa
 * hasta que el navegador se lo dice, y pintar una al azar y corregirla en el efecto es mejor que
 * un desajuste de hidratación.
 */
export function SelectorDeTema({ className = '' }: { className?: string }) {
  const [activa, setActiva] = useState<Preferencia>('dark');

  useEffect(() => {
    setActiva(leerPreferencia());
  }, []);

  function elegir(preferencia: Preferencia) {
    setActiva(preferencia);
    document.cookie = `${COOKIE}=${preferencia}; path=/; max-age=${UN_ANO}; samesite=lax`;
    aplicar(preferencia);
  }

  return (
    <div
      // biome-ignore lint/a11y/useSemanticElements: tres botones de icono en una píldora; un fieldset no encaja
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ${className}`}
    >
      {OPCIONES.map(({ valor, etiqueta, Icono }) => {
        const seleccionada = activa === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={seleccionada}
            aria-label={etiqueta}
            title={etiqueta}
            onClick={() => elegir(valor)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              seleccionada
                ? 'bg-white/15 text-white'
                : 'text-text-secondary hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icono className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
