'use client';

import { Button } from '@praxis/commons';
import { useEffect } from 'react';

/**
 * Frontera de error de la zona del asistente.
 *
 * Cubre lo que `loadPrivateChrome`, la cuota o el listado de proyectos puedan
 * lanzar. No se enseña `error.message` tal cual: puede traer detalles del
 * backend que no pintan nada en pantalla.
 *
 * ⚠️ **Los fallos de una respuesta del modelo NO llegan aquí**, y es correcto:
 * la conversación es una isla de cliente y los atrapa ella, para poder dejar el
 * historial en pie y ofrecer reintentar ese turno. Tumbar la pantalla entera
 * porque una pregunta falló borraría todo lo hablado.
 */
export default function AssistantError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[assistant]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <h2 className="font-display text-3xl text-text-primary">No pudimos cargar esta página</h2>
        <p className="font-sans text-sm text-white">
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
