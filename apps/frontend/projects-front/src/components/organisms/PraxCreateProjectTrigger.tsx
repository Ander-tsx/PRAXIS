'use client';

import { useDock } from '@praxis/commons';
import { useCallback } from 'react';

interface PraxCreateProjectTriggerProps {
  triggerVariant?: 'boton' | 'tarjeta';
}

/**
 * ⚠️ **La variante `tarjeta` tenía altura fija (`h-[184px]`) y por eso no
 * cuadraba.** Una `ProjectCard` no mide 184: mide lo que mida la fila, que
 * depende de si el proyecto tiene descripción, cuántas etiquetas lleva y si el
 * nombre parte en dos líneas. Al lado de tarjetas de 210 o 230, esta se quedaba
 * corta y la rejilla salía con un escalón.
 *
 * Ahora estira con la fila (`h-full`, más el `flex` del `li` que la envuelve en
 * `ProjectGrid`) y conserva el 184 como **mínimo**, que es lo que la sostiene
 * cuando cae sola en su fila y no hay ninguna tarjeta que le marque la altura.
 * El `p-5` es el de `ProjectCard`, no el `p-6` de antes: con la misma caja y
 * distinto acolchado, el texto no se alineaba con el de al lado.
 */
export function PraxCreateProjectTrigger({
  triggerVariant = 'boton',
}: PraxCreateProjectTriggerProps) {
  const dock = useDock();

  const onClick = useCallback(() => {
    if (window.innerWidth < 768) {
      window.location.assign('/assistant');
    } else if (dock) {
      dock.abrir();
    }
  }, [dock]);

  if (triggerVariant === 'tarjeta') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative flex h-full min-h-[184px] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border bg-transparent p-5 transition-all hover:border-primary/50 hover:bg-primary/5"
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-elevated text-text-secondary transition-colors group-hover:bg-primary/10 group-hover:text-primary"
          aria-hidden="true"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </span>
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-base font-medium text-text-primary group-hover:text-primary">
            Crear proyecto con PRAX
          </span>
          <span className="font-sans text-xs text-text-secondary">
            Cuéntale a PRAX qué necesitas y él preparará el proyecto.
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content transition-colors hover:bg-primary-strong"
    >
      Crear proyecto con PRAX
    </button>
  );
}
