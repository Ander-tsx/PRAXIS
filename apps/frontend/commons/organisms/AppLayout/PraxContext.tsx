'use client';

import { createContext, useContext } from 'react';

/**
 * El contexto de PRAX global, **solo**: sin componentes, para que `AssistantChat`
 * pueda leerlo (`usePrax`) sin cerrar un ciclo de imports con `PraxWindow`, que
 * es quien monta el `AssistantChat`.
 */

/**
 * El proyecto que tiene delante quien abre PRAX.
 *
 * Lo pone la pantalla del proyecto (`PraxProjectButton`) al montarse y lo quita
 * al desmontarse. Solo llega si la persona tiene `canViewReports` ahí: es lo que
 * pide `POST /projects/:id/assistant/chat`, y ofrecer un foco que responde 403 a
 * la primera pregunta sería peor que hablar sin él.
 */
export interface FocoDePrax {
  id: string;
  name: string;
  /** `userId` → nombre, para que las propuestas no hablen en UUID. */
  nombres: Record<string, string>;
  /** `labelId` → nombre. */
  etiquetas: Record<string, string>;
}

export interface PraxContextValue {
  /** La ruta pública de la zona (`/projects`, `/assistant`…). */
  zonePath: string;
  abierto: boolean;
  abrir: () => void;
  cerrar: () => void;
  alternar: () => void;
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
  /** El proyecto de la pantalla, o `null` fuera de uno. Ver `FocoDePrax`. */
  foco: FocoDePrax | null;
  fijarFoco: (foco: FocoDePrax | null) => void;
}

export const PraxContext = createContext<PraxContextValue | null>(null);

/** `null` fuera del armazón privado —igual que `useDock`—. */
export function usePrax(): PraxContextValue | null {
  return useContext(PraxContext);
}
