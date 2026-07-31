'use client';

import { Button } from '@praxis/commons';
import { useEffect } from 'react';

/**
 * Frontera de error del panel.
 *
 * Cubre lo que `loadCurrentUser` o `GET /projects` puedan lanzar. No se enseña
 * `error.message` tal cual: puede traer detalles del backend que no pintan
 * nada en pantalla.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[projects]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h2 className="font-display text-3xl text-text-primary">No pudimos cargar esta página</h2>
        <p className="font-sans text-sm text-text-secondary">
          Puede ser un corte temporal con el servidor. Vuelve a intentarlo; si sigue fallando,
          cierra sesión y entra de nuevo.
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  );
}
