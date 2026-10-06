'use client';

import { createContext, useContext } from 'react';

/**
 * El título de cada documento del proyecto, por id, para la marca de la
 * tarjeta.
 *
 * Una tarea solo sabe los **ids** de sus documentos (`Task.documents`): el
 * título vive en projects-service. Quien sí lo tiene es `WorkspaceCanvas`, que
 * recibe todos los espacios del proyecto con sus documentos, así que lo pone
 * aquí una vez en vez de bajarlo prop a prop por cuatro componentes que no lo
 * usan.
 *
 * Fuera del proveedor el mapa está vacío y la marca no sale: nunca rompe.
 */
const TitulosDeDocumentos = createContext<ReadonlyMap<string, string>>(new Map());

export const TitulosDeDocumentosProvider = TitulosDeDocumentos.Provider;

export function useTitulosDeDocumentos(): ReadonlyMap<string, string> {
  return useContext(TitulosDeDocumentos);
}
