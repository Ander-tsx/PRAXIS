'use client';

import { createContext, useContext } from 'react';

/**
 * El contexto de PRAX global, **solo**: sin componentes, para que `AssistantChat`
 * pueda leerlo (`usePrax`) sin cerrar un ciclo de imports con `PraxWindow`, que
 * es quien monta el `AssistantChat`.
 */

export type PraxModo = 'flotante' | 'acoplado';

export interface PraxContextValue {
  /** La ruta pública de la zona (`/projects`, `/assistant`…). */
  zonePath: string;
  abierto: boolean;
  modo: PraxModo;
  abrir: () => void;
  cerrar: () => void;
  alternar: () => void;
  ponerModo: (modo: PraxModo) => void;
  /** Sale del minichat y lleva a `/assistant`. */
  aPantallaCompleta: () => void;
  /**
   * Abre PRAX y deja un texto puesto en el compositor —**sin enviarlo**—.
   *
   * Lo usa «Crear con PRAX». Va por aquí y no por un `CustomEvent` para no
   * depender de que el minichat ya esté montado y escuchando: se abre y el
   * texto viaja como prop (`sugerenciaExterna`).
   */
  sugerir: (texto: string) => void;
}

export const PraxContext = createContext<PraxContextValue | null>(null);

/** `null` fuera del armazón privado —igual que `useDock`—. */
export function usePrax(): PraxContextValue | null {
  return useContext(PraxContext);
}
