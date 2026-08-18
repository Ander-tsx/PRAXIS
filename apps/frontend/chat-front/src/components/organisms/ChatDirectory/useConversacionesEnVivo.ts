'use client';

import type { DirectConversation } from '@praxis/commons';
import { useEventoEnVivo, useReconexion } from '@praxis/commons';
import { createApiClient } from '@praxis/commons';
import { useCallback, useEffect, useState } from 'react';
import type { ChatDeProyecto } from './ChatDirectory';

/**
 * El proxy de **esta** zona, y tiene que serlo.
 *
 * Es una ruta del navegador, así que lleva el prefijo público completo y no la
 * ruta interna: aquí `basePath` no pinta nada. Apuntarla a la de otra zona
 * seguiría funcionando detrás del shell —cada zona monta su propio proxy— y
 * eso es justo lo que la vuelve peligrosa: se rompe el día que las zonas se
 * sirvan por separado, no el día que alguien se equivoque.
 */
const GATEWAY = '/chat/api/gateway';

interface Listas {
  directos: DirectConversation[];
  proyectos: ChatDeProyecto[];
}

/**
 * Las listas de conversaciones, **vivas**.
 *
 * ## El fallo que arregla
 *
 * ⚠️ **«Estando en el chat de un proyecto me llega un mensaje privado, sale la
 * tarjeta y el contador de Directos no se mueve.»** Las dos listas venían del
 * `layout.tsx`, es decir, del servidor, y solo cambiaban cuando algo revalidaba
 * esa ruta. Nada lo hacía: el flujo en vivo únicamente sabía pintar la tarjeta.
 * El número correcto no aparecía hasta cambiar de página o recargar, que es
 * justo cuando ya no hace falta.
 *
 * ## Cómo funciona
 *
 * Lo del servidor es el **punto de partida**, no la verdad permanente: se copia
 * a estado local en el primer render y a partir de ahí manda el flujo.
 *
 * - `chat.mensaje` → sube el contador de su canal y actualiza el resumen de la
 *   fila («Fulano: …»), que también estaba congelado.
 * - `chat.leido` con `mio` → pone ese contador a cero. Llega **también desde tus
 *   otras sesiones**, así que leer una conversación en el móvil apaga la
 *   insignia en el portátil. La revalidación que había antes no hacía eso.
 *
 * ⚠️ **Un mensaje de un canal que no está en la lista la vuelve a pedir.** Es el
 * caso de la primera conversación con alguien: no hay fila que actualizar
 * todavía. Es una petición y solo ocurre la primera vez de cada conversación —
 * inventarse la fila desde el evento significaría adivinar el `channelId`, el
 * `peerId` y el estado de silenciado, y equivocarse en cualquiera de los tres
 * deja una fila fantasma que no lleva a ninguna parte.
 */
export function useConversacionesEnVivo(
  directosIniciales: DirectConversation[],
  proyectosIniciales: ChatDeProyecto[],
): Listas {
  const [listas, setListas] = useState<Listas>({
    directos: directosIniciales,
    proyectos: proyectosIniciales,
  });

  /**
   * El servidor vuelve a mandar: se acepta lo suyo.
   *
   * Pasa al navegar a otra conversación —el layout se conserva pero la página se
   * vuelve a renderizar— y ahí lo del servidor es más fresco que lo acumulado
   * aquí. Sin esto, una lista que llevara horas viva iría acumulando deriva
   * respecto a lo que de verdad hay guardado.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: son los datos del servidor, y la intención es exactamente reemplazar el estado cuando llegan otros — no leer nada más
  useEffect(() => {
    setListas({ directos: directosIniciales, proyectos: proyectosIniciales });
  }, [directosIniciales, proyectosIniciales]);

  const volverAPedir = useCallback(() => {
    const api = createApiClient({ gatewayPath: GATEWAY });
    Promise.all([
      api.get<DirectConversation[]>('/me/chats').catch(() => null),
      api.get<ChatDeProyecto[]>('/me/chats/projects').catch(() => null),
    ]).then(([directos, proyectos]) => {
      setListas((previas) => ({
        directos: directos ?? previas.directos,
        proyectos: proyectos ?? previas.proyectos,
      }));
    });
  }, []);

  useEventoEnVivo('chat.mensaje', (evento) => {
    /* Lo tuyo no cuenta como no leído: acabas de escribirlo. */
    const suma = evento.mio ? 0 : 1;

    const resumen = {
      body: evento.mensaje.body,
      authorId: evento.mensaje.authorId,
      createdAt: evento.mensaje.createdAt,
      deletedAt: evento.mensaje.deletedAt,
    };

    let encontrado = false;

    setListas((previas) => {
      const directos = previas.directos.map((conversacion) => {
        if (conversacion.channelId !== evento.channelId) return conversacion;
        encontrado = true;
        return { ...conversacion, unread: conversacion.unread + suma, ultimo: resumen };
      });

      const proyectos = previas.proyectos.map((chat) => {
        if (chat.channelId !== evento.channelId) return chat;
        encontrado = true;
        return { ...chat, unread: chat.unread + suma, ultimo: resumen };
      });

      return { directos, proyectos };
    });

    /* Un canal que no está en ninguna de las dos listas: la primera vez que
       alguien te escribe. No hay fila que actualizar, así que se pide. */
    if (!encontrado) volverAPedir();
  });

  useEventoEnVivo('chat.leido', (evento) => {
    /* Solo la tuya apaga tu contador. Que otro haya leído mueve sus checks de
       «visto», que es cosa del panel, no de esta lista. */
    if (!evento.mio) return;

    setListas((previas) => ({
      directos: previas.directos.map((conversacion) =>
        conversacion.channelId === evento.channelId ? { ...conversacion, unread: 0 } : conversacion,
      ),
      proyectos: previas.proyectos.map((chat) =>
        chat.channelId === evento.channelId ? { ...chat, unread: 0 } : chat,
      ),
    }));
  });

  /* Tras un corte, los contadores acumulados aquí pueden haberse quedado atrás:
     se vuelven a pedir enteros en vez de intentar adivinar el hueco. */
  useReconexion(volverAPedir);

  return listas;
}
