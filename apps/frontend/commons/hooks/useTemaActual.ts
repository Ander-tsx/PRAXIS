'use client';

import { useEffect, useState } from 'react';

/** Los dos temas. Espejo de `ThemeName` en `commons/theme/cookie.ts`. */
export type TemaActual = 'dark' | 'light';

/**
 * El tema que hay puesto ahora mismo, leído del `<html>`.
 *
 * ## Por qué del DOM y no de la cookie ni de una prop
 *
 * El tema se guarda en la cookie `praxis_theme`, la lee el `layout.tsx` de cada
 * zona en el servidor y la estampa como `data-theme` en el `<html>` para que no
 * haya parpadeo al hidratar. Eso significa que **el atributo del `<html>` es la
 * verdad**, y que ya está puesto antes de que se ejecute una sola línea de
 * JavaScript.
 *
 * - Leer la cookie desde el cliente duplicaría la lógica y podría discrepar del
 *   atributo durante un instante.
 * - Pasarlo por props obligaría a enhebrarlo desde las seis zonas hasta el
 *   armazón, para un dato que ya está a mano en `document.documentElement`.
 *
 * ⚠️ **Y hay un observador, no una lectura y ya.** Cambiar de tema hace
 * `revalidatePath('/', 'layout')`: React vuelve a renderizar el `<html>` con el
 * atributo nuevo **sin recargar la página**, así que una lectura única se
 * quedaría con el tema viejo hasta la siguiente navegación completa.
 *
 * Empieza en `dark` —el valor por defecto de la aplicación— para que el primer
 * render del servidor y el del cliente coincidan: devolver otra cosa aquí sería
 * un desajuste de hidratación.
 */
export function useTemaActual(): TemaActual {
  const [tema, setTema] = useState<TemaActual>('dark');

  useEffect(() => {
    const raiz = document.documentElement;

    const leer = () => {
      const valor = raiz.getAttribute('data-theme');
      setTema(valor === 'light' ? 'light' : 'dark');
    };

    leer();

    const observador = new MutationObserver(leer);
    observador.observe(raiz, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observador.disconnect();
  }, []);

  return tema;
}
