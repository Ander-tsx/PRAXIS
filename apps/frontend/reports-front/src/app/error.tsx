'use client';

import { Button } from '@praxis/commons';
import { useEffect } from 'react';

/**
 * Frontera de error de **Reportes**.
 *
 * Cubre lo que `loadCurrentUser`, `GET /projects` o el `snapshot` puedan lanzar.
 * No se enseña `error.message` tal cual: puede traer detalles del backend que no
 * pintan nada en pantalla.
 *
 * ⚠️ Es la que recoge el fallo del índice de la sección, y por eso importa que
 * exista: esa pantalla atrapaba el error y lo enseñaba como «todavía no estás en
 * ningún proyecto». Con el `catch` quitado, un corte llega aquí y se lee como lo
 * que es, con un botón para reintentar.
 */
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* ⚠️ Decía `[projects]`: este archivo se copió de projects-front y la
       etiqueta se vino con él. Un fallo de Reportes que se anuncia como de
       Proyectos manda a mirar la zona equivocada, que es justo lo que uno hace
       con la consola delante. */
    console.error('[reports]', error);
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
