'use client';

import { jsonAMarkdown } from '@praxis/editor-schema';
import type { Editor } from '@tiptap/core';
import { Check, ClipboardCopy, Code2, Download, FileText, Printer, Type } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { srcDeImagen } from './contexto';

interface Props {
  editor: Editor | null;
  titulo: string;
  /** Token del enlace compartido: las imágenes lo necesitan para descargarse. */
  k?: string | null;
}

const ESTILOS = `
  body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#111;max-width:46rem;margin:2rem auto;padding:0 1rem}
  h1,h2,h3,h4{font-family:Arial,Helvetica,sans-serif;line-height:1.25;margin:1.4em 0 .5em}
  h1{font-size:24pt}h2{font-size:18pt}h3{font-size:14pt}
  p{margin:.6em 0}img{max-width:100%;height:auto}
  blockquote{border-left:3px solid #bbb;margin:1em 0;padding:.1em 1em;color:#444}
  pre,code{font-family:Consolas,'Courier New',monospace;background:#f3f3f3}
  pre{padding:.8em;border-radius:4px;white-space:pre-wrap}code{padding:.1em .3em}
  table{border-collapse:collapse;width:100%;margin:1em 0}
  td,th{border:1px solid #bbb;padding:.4em .6em;vertical-align:top}th{background:#f0f0f0}
  hr{border:0;border-top:1px solid #ccc;margin:1.5em 0}
  a{color:#1a56c4}mark{background:#fff3a3}
  @media print{body{margin:0;max-width:none}}
`;

/** Nombre de archivo seguro a partir del título. */
function nombreDeArchivo(titulo: string): string {
  const limpio = titulo
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return limpio || 'Documento';
}

function descargar(contenido: BlobPart, tipo: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Una imagen del documento como `data:`, para que el archivo exportado no dependa de la sesión. */
async function aDataUri(src: string): Promise<string | null> {
  try {
    const r = await fetch(src);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.onerror = () => mal(lector.error);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** El cuerpo en HTML, con las imágenes embebidas. */
async function cuerpoHtml(editor: Editor, k: string | null): Promise<string> {
  const contenedor = document.createElement('div');
  contenedor.innerHTML = editor.getHTML();
  await Promise.all(
    [...contenedor.querySelectorAll('img')].map(async (img) => {
      const original = img.getAttribute('src') ?? '';
      if (!original || original.startsWith('data:')) return;
      const absoluta = new URL(srcDeImagen(original, k), window.location.origin).toString();
      const embebida = await aDataUri(absoluta);
      img.setAttribute('src', embebida ?? absoluta);
    }),
  );
  return contenedor.innerHTML;
}

async function paginaHtml(editor: Editor, titulo: string, k: string | null, paraWord = false) {
  const cuerpo = await cuerpoHtml(editor, k);
  const cabecera = paraWord
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    : '<!doctype html><html lang="es">';
  return `${cabecera}<head><meta charset="utf-8"><title>${escapar(titulo || 'Sin título')}</title><style>${ESTILOS}</style></head><body><h1>${escapar(titulo || 'Sin título')}</h1>${cuerpo}</body></html>`;
}

/** Copia con `clipboard` y, si el sitio no es seguro o se deniega, con el viejo `execCommand`. */
async function copiarTexto(texto: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([texto], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/**
 * Sacar el contenido de un documento: copiarlo (Markdown, texto, con formato) o
 * descargarlo (Markdown, texto, HTML, Word, PDF).
 *
 * Todo ocurre **en el navegador, desde lo que el editor ya tiene**: no hay ruta
 * nueva del servidor, y vale igual para un lector que para un editor — quien
 * puede verlo, puede copiarlo.
 *
 * - **Word** es un HTML con el espacio de nombres de Office, guardado como `.doc`:
 *   Word lo abre con su formato (títulos, listas, tablas, imágenes) sin una
 *   librería de 300 KB.
 * - **PDF** abre el diálogo de impresión del navegador sobre una copia limpia del
 *   documento; ahí se elige «Guardar como PDF». Queda texto seleccionable, no una
 *   foto de la pantalla.
 * - Las imágenes se **embeben** (`data:`): una ruta relativa de Praxis no se
 *   resuelve fuera de la sesión.
 */
export function ExportarDocumento({ editor, titulo, k = null }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 2200);
    return () => clearTimeout(t);
  }, [mensaje]);

  if (!editor) return null;
  const nombre = nombreDeArchivo(titulo);

  async function ejecutar(accion: () => Promise<string | undefined>) {
    if (!editor || trabajando) return;
    setTrabajando(true);
    try {
      const resultado = await accion();
      if (resultado) setMensaje(resultado);
      setAbierto(false);
    } catch {
      setMensaje('No se pudo exportar.');
    } finally {
      setTrabajando(false);
    }
  }

  const markdown = () => `# ${titulo || 'Sin título'}\n\n${jsonAMarkdown(editor.getJSON())}\n`;
  const texto = () =>
    `${titulo || 'Sin título'}\n\n${editor.getText({ blockSeparator: '\n\n' })}\n`;

  const acciones: {
    id: string;
    icono: ReactNode;
    etiqueta: string;
    ayuda: string;
    fn: () => Promise<string | undefined>;
  }[] = [
    {
      id: 'copiar-md',
      icono: <ClipboardCopy className="h-4 w-4" />,
      etiqueta: 'Copiar todo',
      ayuda: 'Markdown',
      fn: async () =>
        (await copiarTexto(markdown())) ? 'Copiado como Markdown' : 'No se pudo copiar',
    },
    {
      id: 'copiar-fmt',
      icono: <Type className="h-4 w-4" />,
      etiqueta: 'Copiar con formato',
      ayuda: 'Para pegar en Word o Docs',
      fn: async () =>
        (await copiarTexto(texto(), await cuerpoHtml(editor, k)))
          ? 'Copiado con formato'
          : 'No se pudo copiar',
    },
    {
      id: 'copiar-txt',
      icono: <FileText className="h-4 w-4" />,
      etiqueta: 'Copiar texto plano',
      ayuda: 'Sin formato',
      fn: async () => ((await copiarTexto(texto())) ? 'Copiado como texto' : 'No se pudo copiar'),
    },
    {
      id: 'pdf',
      icono: <Printer className="h-4 w-4" />,
      etiqueta: 'PDF',
      ayuda: 'Imprimir o guardar como PDF',
      fn: async () => {
        const html = await paginaHtml(editor, titulo, k);
        const marco = document.createElement('iframe');
        marco.setAttribute('aria-hidden', 'true');
        marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.append(marco);
        await new Promise<void>((ok) => {
          marco.onload = () => ok();
          marco.srcdoc = html;
        });
        const ventana = marco.contentWindow;
        if (!ventana) {
          marco.remove();
          return 'No se pudo preparar el PDF';
        }
        ventana.document.title = nombre;
        ventana.focus();
        ventana.onafterprint = () => marco.remove();
        ventana.print();
        setTimeout(() => marco.remove(), 120000);
        return undefined;
      },
    },
    {
      id: 'word',
      icono: <Download className="h-4 w-4" />,
      etiqueta: 'Word',
      ayuda: '.doc',
      fn: async () => {
        descargar(
          `﻿${await paginaHtml(editor, titulo, k, true)}`,
          'application/msword;charset=utf-8',
          `${nombre}.doc`,
        );
        return 'Descargado';
      },
    },
    {
      id: 'md',
      icono: <Download className="h-4 w-4" />,
      etiqueta: 'Markdown',
      ayuda: '.md',
      fn: async () => {
        descargar(markdown(), 'text/markdown;charset=utf-8', `${nombre}.md`);
        return 'Descargado';
      },
    },
    {
      id: 'html',
      icono: <Code2 className="h-4 w-4" />,
      etiqueta: 'HTML',
      ayuda: '.html, con imágenes incluidas',
      fn: async () => {
        descargar(await paginaHtml(editor, titulo, k), 'text/html;charset=utf-8', `${nombre}.html`);
        return 'Descargado';
      },
    },
    {
      id: 'txt',
      icono: <Download className="h-4 w-4" />,
      etiqueta: 'Texto',
      ayuda: '.txt',
      fn: async () => {
        descargar(texto(), 'text/plain;charset=utf-8', `${nombre}.txt`);
        return 'Descargado';
      },
    },
  ];

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        title="Copiar o exportar el documento"
        className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 font-sans text-xs text-text-secondary transition-colors hover:bg-white/[0.07] hover:text-text-primary"
      >
        {mensaje ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
        {mensaje ?? 'Exportar'}
      </button>
      {abierto && (
        <div
          role="menu"
          data-tone="dark"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-surface py-1 shadow-2xl"
        >
          {acciones.map((a, i) => (
            <div key={a.id}>
              {(i === 3 || i === 5) && <div className="my-1 border-t border-border" />}
              <button
                type="button"
                role="menuitem"
                disabled={trabajando}
                onClick={() => void ejecutar(a.fn)}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left font-sans text-sm text-text-primary transition-colors hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
              >
                <span className="text-text-secondary">{a.icono}</span>
                <span className="flex-1">{a.etiqueta}</span>
                <span className="text-xs text-text-secondary">{a.ayuda}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
