'use client';

import { type ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { useEventoEnVivo } from './FuenteEnVivo';

/**
 * Las presencias que han cambiado desde que se cargó la página.
 *
 * Un `Map` de `userId` → presencia efectiva. Lo de la petición inicial sigue
 * viniendo en cada perfil (el gateway ya lo cruza al servirlo); esto solo pisa
 * lo que haya cambiado **después**.
 */
const Contexto = createContext<Map<string, string>>(new Map());

/**
 * Mantiene al día el punto de estado de todo el mundo, sin pedir nada.
 *
 * ## Qué reemplaza
 *
 * La presencia era **front-driven** y estaba mal por construcción: el navegador
 * decidía cuándo alguien estaba ausente con temporizadores de inactividad y un
 * manejador de `pagehide`, y avisaba al servidor. Eso falla exactamente cuando
 * importa —se corta la red, se acaba la batería, el navegador se cae— porque
 * entonces el aviso **no se manda nunca** y la cuenta se queda «Disponible»
 * para siempre. Usuarios fantasma.
 *
 * Ahora lo gobierna el servidor: tener el flujo abierto **es** estar conectado,
 * y una caída se detecta porque el gateway no puede escribir el siguiente
 * latido. Lo único que hace el navegador es escuchar.
 *
 * ## Por qué un contexto y no un estado por avatar
 *
 * Un evento de presencia puede afectar a docenas de avatares a la vez —la misma
 * persona sale en la lista de conversaciones, en cada una de sus burbujas y en
 * el equipo del proyecto—. Con estado por componente, cada avatar tendría que
 * suscribirse por su cuenta: cincuenta suscripciones para el mismo dato. Aquí se
 * escucha una vez y se reparte por contexto.
 */
export function PresenciasEnVivo({ children }: { children: ReactNode }) {
  const [cambios, setCambios] = useState<Map<string, string>>(new Map());

  useEventoEnVivo('presencia', (evento) => {
    setCambios((previas) => {
      /* Si ya decía eso, no se crea un `Map` nuevo: un `Map` distinto en el
         contexto vuelve a renderizar a todos sus consumidores, y una ráfaga de
         eventos repetidos —varias pestañas de la misma persona conectándose—
         repintaría la pantalla entera sin cambiar un píxel. */
      if (previas.get(evento.userId) === evento.presencia) return previas;
      return new Map(previas).set(evento.userId, evento.presencia);
    });
  });

  const valor = useMemo(() => cambios, [cambios]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * La presencia de alguien, con lo último que se sepa.
 *
 * `guardada` es lo que trajo el perfil en la última petición —ya cruzada por el
 * gateway con la conexión real, así que no es la elegida a secas—. Si desde
 * entonces ha llegado un evento para esa persona, gana el evento.
 *
 * Fuera del proveedor devuelve lo guardado, sin romper nada: hay pantallas que
 * pintan avatares fuera del armazón privado.
 */
export function usePresencia(
  userId: string | null | undefined,
  guardada: string | null | undefined,
): string | null {
  const cambios = useContext(Contexto);
  if (!userId) return guardada ?? null;
  return cambios.get(userId) ?? guardada ?? null;
}
