'use client';

import { createContext, useContext } from 'react';

/**
 * Lo que las vistas de nodo necesitan del documento que las contiene: se
 * pintan en portales de React dentro de `EditorContent`, así que el contexto
 * les llega aunque ProseMirror las monte por su cuenta.
 */
export interface ContextoDelDocumento {
  documentId: string;
  /** Token del enlace compartido, si se entró por él: las imágenes lo necesitan. */
  k: string | null;
  editable: boolean;
  /** Con sesión: las vistas previas de enlaces se piden al gateway con ella. */
  conSesion: boolean;
  subirImagen: (archivo: File) => Promise<string | null>;
}

export const Contexto = createContext<ContextoDelDocumento | null>(null);

export function useDocumento(): ContextoDelDocumento {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('Vista de nodo fuera de un DocumentEditor');
  return valor;
}

/** `/api/doc/<id>/<resto>` con el token del enlace si lo hay. */
export function rutaDeDocumento(documentId: string, resto = '', k: string | null = null): string {
  const base = `/api/doc/${documentId}${resto}`;
  if (!k) return base;
  return `${base}${base.includes('?') ? '&' : '?'}k=${encodeURIComponent(k)}`;
}

/**
 * La imagen se guarda con la ruta del gateway (`/documents/:id/assets/:assetId`)
 * —sin dominio ni token, que no son del documento sino de quien lo mira— y aquí
 * se convierte en la que sirve esta aplicación.
 */
export function srcDeImagen(src: string, k: string | null): string {
  const m = src.match(/^\/documents\/([0-9a-f-]{36})\/assets\/([0-9a-f-]{36})$/i);
  if (!m) return src;
  return rutaDeDocumento(m[1], `/assets/${m[2]}`, k);
}
