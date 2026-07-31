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

/**
 * Selector de tema, dos opciones.
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

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => select(option.value)}
            className={[
              'rounded-md px-4 py-2 font-sans text-sm font-medium transition-all duration-150',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
