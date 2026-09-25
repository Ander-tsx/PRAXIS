'use client';

import { type Proveedor, reconocerProveedor } from '@praxis/editor-schema';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  CalendarDays,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Globe,
  Link2,
  PanelsTopLeft,
  PenTool,
  PlaySquare,
  Presentation,
  Trash2,
  Video,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useDocumento } from './contexto';

const ICONOS: Record<string, ReactNode> = {
  'google-docs': <FileText className="h-4 w-4 text-[#4285f4]" />,
  'google-sheets': <FileSpreadsheet className="h-4 w-4 text-[#0f9d58]" />,
  'google-slides': <Presentation className="h-4 w-4 text-[#f4b400]" />,
  'google-forms': <FileText className="h-4 w-4 text-[#7248b9]" />,
  'google-drive': <FileText className="h-4 w-4 text-[#4285f4]" />,
  'google-meet': <Video className="h-4 w-4 text-[#00897b]" />,
  'google-calendar': <CalendarDays className="h-4 w-4 text-[#4285f4]" />,
  youtube: <PlaySquare className="h-4 w-4 text-[#ff0033]" />,
  loom: <PlaySquare className="h-4 w-4 text-[#625df5]" />,
  vimeo: <PlaySquare className="h-4 w-4 text-[#1ab7ea]" />,
  figma: <PenTool className="h-4 w-4 text-[#a259ff]" />,
  miro: <PanelsTopLeft className="h-4 w-4 text-[#ffd02f]" />,
  github: <GitBranch className="h-4 w-4" />,
  zoom: <Video className="h-4 w-4 text-[#2d8cff]" />,
  teams: <Video className="h-4 w-4 text-[#6264a7]" />,
};

function iconoDe(proveedor: Proveedor | null) {
  return (proveedor && ICONOS[proveedor.id]) ?? <Globe className="h-4 w-4 text-text-secondary" />;
}

function hostDe(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Un enlace que ocupa su bloque (E7 de `docs/PLAN-DOCUMENTOS.md`): tarjeta con
 * vista previa, o el contenido incrustado si el servicio lo permite.
 *
 * - Sin URL todavía (recién insertado desde «/»): un campo para pegarla.
 * - Tarjeta: icono del servicio, título, descripción e imagen. Si faltan y se
 *   puede editar, se piden una vez al gateway y se guardan **en el nodo**:
 *   quien lo lea después, también sin cuenta, no vuelve a pedir nada.
 * - Incrustado: un `<iframe>` aislado (`sandbox`) con la URL de incrustar que
 *   da el servicio, nunca la que se pegó.
 *
 * ⚠️ Un documento **privado** de Google no deja leer su título desde fuera:
 * la tarjeta dice «Documento de Google» y abre el enlace. Si se incrusta, se ve
 * solo si quien lo mira tiene sesión de Google con acceso a él.
 */
export function VistaTarjeta({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { editable, conSesion } = useDocumento();
  const url: string = node.attrs.url ?? '';
  const display: 'card' | 'embed' = node.attrs.display === 'embed' ? 'embed' : 'card';
  const proveedor = url ? reconocerProveedor(url) : null;
  const pedida = useRef(false);

  useEffect(() => {
    if (!url || node.attrs.title || !editable || !conSesion || pedida.current) return;
    pedida.current = true;
    fetch(`/api/gateway/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cuerpo) => {
        const datos = cuerpo?.data;
        if (!datos) return;
        updateAttributes({
          title: datos.title ?? null,
          description: datos.description ?? null,
          image: datos.image ?? null,
          siteName: datos.siteName ?? null,
        });
      })
      .catch(() => undefined);
  }, [url, node.attrs.title, editable, conSesion, updateAttributes]);

  if (!url) {
    return (
      <NodeViewWrapper data-drag-handle className="my-3">
        <PedirEnlace
          modo={display}
          editable={editable}
          onEnlace={(nuevo) => {
            const p = reconocerProveedor(nuevo);
            updateAttributes({
              url: nuevo,
              display: display === 'embed' && !p?.embed ? 'card' : display,
            });
          }}
          onQuitar={deleteNode}
        />
      </NodeViewWrapper>
    );
  }

  const titulo = node.attrs.title || proveedor?.tipo || hostDe(url);
  const sitio = node.attrs.siteName || proveedor?.nombre || hostDe(url);
  const incrustado = display === 'embed' && proveedor?.embed;

  return (
    <NodeViewWrapper
      className={`group relative my-3 rounded-xl transition-shadow ${selected ? 'ring-2 ring-primary/60' : ''}`}
      data-drag-handle
    >
      {incrustado ? (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            <iframe
              src={proveedor.embed ?? undefined}
              title={titulo}
              loading="lazy"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-forms"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 border-t border-border px-3 py-2 font-sans text-xs text-text-secondary hover:text-text-primary"
            contentEditable={false}
          >
            {iconoDe(proveedor)}
            <span className="truncate">{titulo}</span>
          </a>
        </div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          contentEditable={false}
          className="flex overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-border-strong"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3">
            <span className="flex items-center gap-2 font-sans text-[11px] text-text-secondary">
              {iconoDe(proveedor)}
              <span className="truncate">{sitio}</span>
            </span>
            <span className="truncate font-sans text-sm font-medium text-text-primary">
              {titulo}
            </span>
            {node.attrs.description && (
              <span className="line-clamp-2 font-sans text-xs text-text-secondary">
                {node.attrs.description}
              </span>
            )}
          </span>
          {node.attrs.image && (
            <span className="hidden w-40 shrink-0 border-l border-border sm:block">
              <img
                src={node.attrs.image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </span>
          )}
        </a>
      )}

      {editable && (
        <span
          contentEditable={false}
          className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          {proveedor?.embed && (
            <>
              <BotonDeTarjeta
                activo={display === 'card'}
                onClick={() => updateAttributes({ display: 'card' })}
              >
                Tarjeta
              </BotonDeTarjeta>
              <BotonDeTarjeta
                activo={display === 'embed'}
                onClick={() => updateAttributes({ display: 'embed' })}
              >
                Incrustado
              </BotonDeTarjeta>
            </>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-white/[0.07] hover:text-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            title="Quitar"
            onClick={deleteNode}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-white/[0.07] hover:text-error"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

function BotonDeTarjeta({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 cursor-pointer rounded-md px-2 font-sans text-[11px] transition-colors ${
        activo ? 'bg-white/[0.08] text-text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function PedirEnlace({
  modo,
  editable,
  onEnlace,
  onQuitar,
}: {
  modo: 'card' | 'embed';
  editable: boolean;
  onEnlace: (url: string) => void;
  onQuitar: () => void;
}) {
  const [valor, setValor] = useState('');
  const [error, setError] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);

  if (!editable) return null;

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    const texto = valor.trim();
    const conProtocolo = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
    try {
      new URL(conProtocolo);
      onEnlace(conProtocolo);
    } catch {
      setError(true);
    }
  }

  return (
    <form
      onSubmit={alEnviar}
      contentEditable={false}
      className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5"
    >
      {modo === 'embed' ? (
        <PlaySquare className="h-4 w-4 shrink-0 text-text-secondary" />
      ) : (
        <Link2 className="h-4 w-4 shrink-0 text-text-secondary" />
      )}
      <input
        ref={campo}
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || (e.key === 'Backspace' && !valor)) onQuitar();
        }}
        placeholder={
          modo === 'embed'
            ? 'Pega el enlace de YouTube, Loom, Figma, un Doc…'
            : 'Pega un enlace: un Doc, una hoja, una reunión de Meet…'
        }
        className={`min-w-0 flex-1 bg-transparent font-sans text-sm text-text-primary outline-none placeholder:text-text-secondary ${error ? 'text-error' : ''}`}
      />
    </form>
  );
}
