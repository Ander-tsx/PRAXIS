'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '../api/client';
import { useEventoEnVivo, useReconexion } from './FuenteEnVivo';

/**
 * Cuánto se espera antes de reconciliar el contador a la baja.
 *
 * Bajar exige preguntarle al servidor —ver abajo— y `chat.leido` se dispara con
 * **cada** mensaje que llega mientras tienes la conversación abierta. Sin esta
 * ventana, una conversación viva sería una petición por mensaje: exactamente el
 * goteo que la fase anterior vino a quitar.
 */
const ESPERA_DE_RECONCILIACION_MS = 2500;

/**
 * Los mensajes sin leer —privados y de equipo—, para la insignia de la barra
 * lateral.
 *
 * ## El fallo que cierra
 *
 * ⚠️ **La insignia solo aparecía al recargar la página.** El número lo calcula
 * `loadPrivateChrome()` en el `layout.tsx`, o sea en el servidor, y lo único que
 * lo actualizaba era un `router.refresh()` que se disparaba con cada evento del
 * chat. Al quitar ese refresco —era la mitad del atasco de la cola del App
 * Router— esta insignia se quedó **sin ninguna fuente**: sonaba el aviso y el
 * número no se movía.
 *
 * La solución no es devolver el refresco, sino darle a la insignia lo mismo que
 * ya tienen la lista de conversaciones y el chat: el flujo en vivo.
 *
 * ## Las dos direcciones no son simétricas, y por eso se tratan distinto
 *
 * **Subir es exacto y gratis**: llega un mensaje directo que no es tuyo, es uno
 * más. Se aplica al instante, que es la dirección que la persona está esperando
 * ver.
 *
 * **Bajar no se puede calcular aquí.** Al leer una conversación hay que restar
 * *lo que esa conversación tenía pendiente*, y ese desglose por canal no está en
 * la barra lateral: solo llega el total. Restar «uno» sería adivinar, y adivinar
 * en un contador acaba en números negativos o en insignias que no se apagan. Así
 * que se le pregunta al servidor —una petición pequeña, agrupada, y solo cuando
 * hay algo que bajar—.
 */
export function useContadorDeMensajes(inicial: number, gatewayPath: string): number {
  const [total, setTotal] = useState(inicial);

  /* Lo que sirvió el servidor manda cuando cambia: pasa al navegar, y ahí es
     más fresco que lo acumulado aquí. */
  useEffect(() => setTotal(inicial), [inicial]);

  const temporizador = useRef<number | null>(null);

  const reconciliar = useCallback(() => {
    if (temporizador.current !== null) return;

    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      const api = createApiClient({ gatewayPath });
      /* Los dos orígenes, los mismos que suma el servidor. Cada uno degrada por
         su cuenta: que falle uno no debe borrar lo que aporta el otro. */
      Promise.all([
        api.get<{ unread?: number }[]>('/me/chats').catch(() => null),
        api.get<{ unread?: number }[]>('/me/chats/projects').catch(() => null),
      ]).then(([directos, proyectos]) => {
        /* Si fallaron las dos se deja el número que había: una insignia con un
           valor algo viejo informa mejor que una que desaparece. */
        if (!directos && !proyectos) return;
        setTotal(
          [...(directos ?? []), ...(proyectos ?? [])].reduce(
            (suma, canal) => suma + (canal.unread ?? 0),
            0,
          ),
        );
      });
    }, ESPERA_DE_RECONCILIACION_MS);
  }, [gatewayPath]);

  useEffect(
    () => () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    },
    [],
  );

  useEventoEnVivo('chat.mensaje', (evento) => {
    /* Lo tuyo no cuenta como no leído: acabas de escribirlo. Lo de equipo **sí**
       cuenta — la entrada se llama «Mensajes» y lleva a una pantalla con las dos
       pestañas, así que dejarlos fuera hacía que un mensaje de proyecto sonara,
       saliera en la lista y no moviera la insignia. El servidor suma los mismos
       dos orígenes (`loadChatUnreadCount`). */
    if (evento.mio) return;
    setTotal((previo) => previo + 1);
  });

  useEventoEnVivo('chat.leido', (evento) => {
    if (!evento.mio) return;
    /* Si ya está a cero no hay nada que bajar: se ahorra la petición, que es lo
       que mantiene acotado el goteo en una conversación activa. */
    setTotal((previo) => {
      if (previo > 0) reconciliar();
      return previo;
    });
  });

  /* Tras un corte, lo acumulado aquí puede haberse quedado atrás. */
  useReconexion(reconciliar);

  return total;
}
