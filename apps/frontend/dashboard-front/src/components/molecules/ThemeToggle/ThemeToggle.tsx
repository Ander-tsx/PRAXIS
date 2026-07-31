'use client';

import { useState, useTransition } from 'react';
import { setThemeAction } from '@/app/(private)/configuracion/actions';

/**
 * Copia local de `ThemeName` (`@praxis/commons/theme`).
 *
 * Ese módulo es de servidor —usa `next/headers`— y no se importa desde un
 * componente de cliente ni siquiera solo por el tipo: más vale un `'dark' |
 * 'light'` repetido que arriesgarse a que un import se cuele en el bundle del
 * navegador.
 */
type ThemeName = 'dark' | 'light';

export interface ThemeToggleProps {
  initialTheme: ThemeName;
}

const OPTIONS: { value: ThemeName; label: string }[] = [
  { value: 'dark', label: 'Oscuro' },
  { value: 'light', label: 'Claro' },
];

/** 32px de botón + 4px de padding a cada lado: el thumb desliza entre esas dos posiciones. */
const BUTTON_SIZE = 32;
const PADDING = 4;

/**
 * Selector de tema: un switch de dos posiciones, no dos botones de texto.
 *
 * La primera versión eran dos botones con la palabra completa («Oscuro» /
 * «Claro») y se veía estirada de más para lo poco que dice. Con solo los
 * iconos —sol y luna, los mismos de siempre para esta idea— cabe en un
 * círculo de 32px cada uno, y una marca deslizante (`aria-hidden`) detrás
 * indica cuál está activo sin repetir el color en cada botón.
 *
 * Cambia de vista al instante —el estado local se adelanta al servidor— y
 * confirma con `setThemeAction`, que escribe la cookie y revalida el layout
 * raíz de esta zona. Las otras cuatro la recogen la próxima vez que el
 * servidor las renderice, que es siempre: no hay navegación de zona sin un
 * salto de página completo (ESTADO-ACTUAL §16).
 */
export function ThemeToggle({ initialTheme }: ThemeToggleProps) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const [pending, startTransition] = useTransition();

  function select(value: ThemeName) {
    if (value === theme || pending) return;
    setTheme(value);
    startTransition(async () => {
      await setThemeAction(value);
    });
  }

  const activeIndex = OPTIONS.findIndex((option) => option.value === theme);

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className="relative inline-flex items-center rounded-full border border-border bg-surface"
      style={{ padding: PADDING }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full bg-primary transition-transform duration-200 ease-out"
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          top: PADDING,
          left: PADDING,
          transform: `translateX(${activeIndex * BUTTON_SIZE}px)`,
        }}
      />

      {OPTIONS.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            disabled={pending}
            onClick={() => select(option.value)}
            className={[
              'relative z-10 flex items-center justify-center rounded-full transition-colors duration-150',
              active ? 'text-primary-foreground' : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
          >
            {option.value === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>
        );
      })}
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 2.5v2.5" />
        <path d="M12 19v2.5" />
        <path d="M4.4 4.4l1.8 1.8" />
        <path d="M17.8 17.8l1.8 1.8" />
        <path d="M2.5 12h2.5" />
        <path d="M19 12h2.5" />
        <path d="M4.4 19.6l1.8-1.8" />
        <path d="M17.8 6.2l1.8-1.8" />
      </g>
    </svg>
  );
}
