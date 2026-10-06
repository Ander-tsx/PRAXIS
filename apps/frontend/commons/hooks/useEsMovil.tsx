'use client';

import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';

/** El corte de todo el plan móvil: por debajo de `md` (D1 de `docs/PLAN-MOVIL.md`). */
export const CONSULTA_MOVIL = '(max-width: 767px)';

const PistaDelServidor = createContext(false);

/**
 * Lo que el servidor adivinó para la primera pintura (`getEsMovilInicial`).
 * Lo pone el armazón; fuera de él vale `false` (escritorio).
 */
export function EsMovilProvider({ inicial, children }: { inicial: boolean; children: ReactNode }) {
  return <PistaDelServidor.Provider value={inicial}>{children}</PistaDelServidor.Provider>;
}

function suscribir(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOVIL);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

/**
 * ¿Se está viendo en móvil?
 *
 * Durante el render del servidor y la hidratación devuelve **la pista del
 * servidor**, así que el HTML y el primer render del cliente coinciden y no hay
 * error de hidratación. Justo después, `useSyncExternalStore` lee el ancho
 * real: si la pista se equivocó —un escritorio con la ventana estrecha, una
 * tableta—, corrige con un render más. Y sigue escuchando: girar la tableta o
 * estrechar la ventana cambia de versión en caliente.
 *
 * ⚠️ **Úsalo solo para lo que CSS no puede.** Lo que se resuelva con `max-md:`
 * o `md:hidden` no pregunta a nadie y no puede equivocarse.
 */
export function useEsMovil(): boolean {
  const pista = useContext(PistaDelServidor);
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA_MOVIL).matches,
    () => pista,
  );
}
