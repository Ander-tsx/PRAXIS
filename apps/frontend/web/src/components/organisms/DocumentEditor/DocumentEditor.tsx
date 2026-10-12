'use client';

import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  CAMPO_YJS,
  Callout,
  ImagenDeDocumento,
  LinkCard,
  extensionesDelDocumento,
  markdownAJson,
  reconocerProveedor,
} from '@praxis/editor-schema';
import type { AnyExtension, Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { Dropcursor, Gapcursor, Placeholder, TrailingNode } from '@tiptap/extensions';
import type { Node as NodoPM } from '@tiptap/pm/model';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import { CloudOff, GripVertical, LoaderCircle, Plus } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { BarraDeFormatoMovil } from './BarraDeFormatoMovil';
import { Burbuja } from './Burbuja';
import { RevisionDePrax } from './RevisionDePrax';
import { VistaAviso } from './VistaAviso';
import { VistaImagen } from './VistaImagen';
import { VistaTabla } from './VistaTabla';
import { VistaTarjeta } from './VistaTarjeta';
import { crearBarra } from './barra';
import { bloquesDisponibles } from './bloques';
import { Contexto, type ContextoDelDocumento, rutaDeDocumento } from './contexto';
import './editor.css';

/** Tope y formatos de las imágenes: los mismos que comprueba el gateway (E6). */
const MAX_IMAGEN = 5 * 1024 * 1024;
const FORMATOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export type ModoDelDocumento = 'edit' | 'read';

/**
 * Un enlace pegado solo: los vídeos y los diseños se incrustan, que es lo que
 * se quiere ver; los archivos de Google van como tarjeta, porque si son
 * privados el incrustado solo se ve con sesión de Google. Se cambia con un clic.
 */
function modoAlPegar(url: string): 'card' | 'embed' {
  const p = reconocerProveedor(url);
  if (!p?.embed) return 'card';
  return ['youtube', 'loom', 'vimeo', 'figma', 'miro'].includes(p.id) ? 'embed' : 'card';
}

/**
 * ¿Este texto pegado es Markdown? Basta una señal de bloque (título, lista,
 * cita, código, tabla, regla) o dos de línea (negrita, enlace, código en
 * línea). Una frase suelta no lo es: ahí se pega como texto normal.
 */
function pareceMarkdown(texto: string): boolean {
  if (!texto.includes('\n') && !/^#{1,6}\s|^```/.test(texto)) return false;
  if (/^(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|\|.+\||-{3,}$)/m.test(texto)) return true;
  const senales = [/\*\*[^*\n]+\*\*/, /\[[^\]\n]+\]\([^)\n]+\)/, /`[^`\n]+`/];
  return senales.filter((r) => r.test(texto)).length >= 2;
}

/**
 * Dos o más líneas que empiezan por «# » en el texto plano: es Markdown en
 * crudo aunque el portapapeles traiga HTML (un bloque de código de un chat
 * llega como `<pre>`). Una página renderizada, en cambio, pega «Título», sin
 * almohadillas.
 */
function tituloLiteral(texto: string): boolean {
  return (texto.match(/^#{1,6}\s+\S/gm)?.length ?? 0) >= 2;
}

/**
 * El portapapeles trae HTML de verdad —una página web, Word, Notion— cuando
 * tiene estructura: ahí manda el HTML. Un editor de código (VS Code) manda
 * HTML solo con `<span>` de color, y ese es Markdown en crudo.
 */
function htmlConEstructura(html: string): boolean {
  return /<(h[1-6]|ul|ol|li|table|blockquote|pre|strong|em|b|i|a)[\s>]/i.test(html);
}

interface Billete {
  ticket: string;
  url: string;
  mode: ModoDelDocumento;
  name: string;
  color: string;
}

type Carga =
  | { estado: 'cargando' }
  | { estado: 'listo'; billete: Billete }
  | { estado: 'login' }
  | { estado: 'sin-acceso'; mensaje: string }
  | { estado: 'error'; mensaje: string };

export interface DocumentEditorProps {
  documentId: string;
  /** Token del enlace compartido (`?k=`), si se entró por él. */
  k?: string | null;
  /** Hay sesión: las vistas previas de enlaces se piden con ella. */
  conSesion: boolean;
  titulo: string;
  /** Renombrar. Sin él, el título es de solo lectura (invitados, lectores). */
  onTitulo?: (titulo: string) => void;
  /** Acciones de la cabecera: compartir, historial, borrar. Las pone quien lo usa. */
  acciones?: (modo: ModoDelDocumento, editor: Editor | null) => ReactNode;
  /** Lo que se enseña bajo el título: quién editó y cuándo. */
  subtitulo?: ReactNode;
  /** Qué hacer si hace falta sesión (la página pública manda al login). */
  alPedirSesion?: () => void;
}

/**
 * El editor de documentos (E1 y E3 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * **Se escribe sobre lo ya pintado**: no hay modo «Escribir/Leer». Bloques con
 * «/», el asa de cada bloque para moverlo o insertar debajo, atajos de Markdown
 * al teclear (`# `, `- `, `> `, ``` ` ``` ```), menú de formato al seleccionar,
 * imágenes pegando o soltando, y un enlace pegado solo en una línea se vuelve
 * tarjeta —o se incrusta, si el servicio lo permite—.
 *
 * **En tiempo real**: varios escriben a la vez y se ven los cursores. Por
 * detrás se guarda como estado de Yjs y como Markdown (E2). Quien solo puede
 * leer ve el mismo documento sin cursor.
 *
 * El billete para conectar lo pide aquí, a `/api/doc/<id>/collab-ticket`, que
 * funciona con sesión o con el token del enlace.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { documentId, k = null } = props;
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' });

  const pedirBillete = useCallback(async (): Promise<Billete> => {
    const respuesta = await fetch(rutaDeDocumento(documentId, '/collab-ticket', k), {
      method: 'POST',
    });
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      const error = new Error(cuerpo?.error?.message ?? 'No se pudo abrir el documento.');
      (error as Error & { status?: number }).status = respuesta.status;
      throw error;
    }
    return cuerpo.data as Billete;
  }, [documentId, k]);

  useEffect(() => {
    let vigente = true;
    setCarga({ estado: 'cargando' });
    pedirBillete()
      .then((billete) => vigente && setCarga({ estado: 'listo', billete }))
      .catch((error: Error & { status?: number }) => {
        if (!vigente) return;
        if (error.status === 401) setCarga({ estado: 'login' });
        else if (error.status === 403 || error.status === 404)
          setCarga({ estado: 'sin-acceso', mensaje: error.message });
        else setCarga({ estado: 'error', mensaje: error.message });
      });
    return () => {
      vigente = false;
    };
  }, [pedirBillete]);

  if (carga.estado === 'listo') {
    return <EditorVivo {...props} billete={carga.billete} pedirBillete={pedirBillete} />;
  }
  if (carga.estado === 'cargando') return <Esqueleto titulo={props.titulo} />;
  if (carga.estado === 'login') {
    return <PedirSesion alPedirSesion={props.alPedirSesion} />;
  }
  return (
    <Aviso
      titulo={carga.estado === 'sin-acceso' ? 'Sin acceso' : 'No se pudo abrir'}
      texto={carga.mensaje}
    />
  );
}

function EditorVivo({
  documentId,
  k = null,
  conSesion,
  titulo,
  onTitulo,
  acciones,
  subtitulo,
  billete,
  pedirBillete,
}: DocumentEditorProps & { billete: Billete; pedirBillete: () => Promise<Billete> }) {
  const editable = billete.mode === 'edit';

  /* El documento y la conexión viven lo que vive este componente. Se crean
     **en un efecto**, no en el inicializador de `useState`: en modo estricto
     React monta, desmonta y vuelve a montar, y un proveedor creado fuera del
     efecto se destruía en la primera limpieza y se reutilizaba destruido —el
     editor se quedaba «conectando» para siempre—. El primer billete ya está
     pedido; los siguientes (reconexiones) se piden de nuevo, porque caducan en
     un minuto. */
  const [conexion, setConexion] = useState<{
    documento: Y.Doc;
    proveedor: HocuspocusProvider;
  } | null>(null);
  useEffect(() => {
    const documento = new Y.Doc();
    let primero: string | null = billete.ticket;
    const proveedor = new HocuspocusProvider({
      url: billete.url,
      name: documentId,
      document: documento,
      token: async () => {
        if (primero) {
          const t = primero;
          primero = null;
          return t;
        }
        return (await pedirBillete()).ticket;
      },
    });
    setConexion({ documento, proveedor });
    return () => {
      proveedor.destroy();
      documento.destroy();
    };
  }, [billete, documentId, pedirBillete]);

  const [sincronizado, setSincronizado] = useState(false);
  const [estadoRed, setEstadoRed] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting',
  );
  const [pendientes, setPendientes] = useState(0);
  const [presentes, setPresentes] = useState<{ name: string; color: string; id: number }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!conexion) return;
    const p = conexion.proveedor;
    const alSincronizar = () => setSincronizado(true);
    const alEstado = ({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) =>
      setEstadoRed(status);
    const alPendiente = ({ number }: { number: number }) => setPendientes(number);
    const alPresencia = () => {
      const estados = [...(p.awareness?.getStates().entries() ?? [])];
      setPresentes(
        estados
          .filter(([id, e]) => id !== p.awareness?.clientID && e.user)
          .map(([id, e]) => ({ id, name: e.user.name, color: e.user.color })),
      );
    };
    if (p.isSynced) setSincronizado(true);
    p.on('synced', alSincronizar);
    p.on('status', alEstado);
    p.on('unsyncedChanges', alPendiente);
    p.awareness?.on('change', alPresencia);
    return () => {
      p.off('synced', alSincronizar);
      p.off('status', alEstado);
      p.off('unsyncedChanges', alPendiente);
      p.awareness?.off('change', alPresencia);
    };
  }, [conexion]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const subirImagen = useCallback(
    async (archivo: File): Promise<string | null> => {
      if (!FORMATOS.includes(archivo.type)) {
        setAviso('Solo imágenes PNG, JPEG, GIF o WebP.');
        return null;
      }
      if (archivo.size > MAX_IMAGEN) {
        setAviso('La imagen pasa de 5 MB.');
        return null;
      }
      const datos = new FormData();
      datos.append('file', archivo);
      setAviso('Subiendo la imagen…');
      const respuesta = await fetch(rutaDeDocumento(documentId, '/assets', k), {
        method: 'POST',
        body: datos,
      }).catch(() => null);
      const cuerpo = await respuesta?.json().catch(() => null);
      if (!respuesta?.ok || !cuerpo?.data?.src) {
        setAviso(cuerpo?.error?.message ?? 'No se pudo subir la imagen.');
        return null;
      }
      setAviso(null);
      return cuerpo.data.src as string;
    },
    [documentId, k],
  );

  const inputImagen = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const insertarImagenes = useCallback(
    async (archivos: File[], posicion?: number) => {
      for (const archivo of archivos) {
        const src = await subirImagen(archivo);
        const editor = editorRef.current;
        if (!src || !editor) continue;
        const nodo = { type: 'image', attrs: { src, alt: archivo.name.replace(/\.[^.]+$/, '') } };
        if (posicion !== undefined) editor.chain().focus().insertContentAt(posicion, nodo).run();
        else editor.chain().focus().insertContent(nodo).run();
      }
    },
    [subirImagen],
  );

  const bloques = useMemo(() => bloquesDisponibles(() => inputImagen.current?.click()), []);

  const extensiones = useMemo<AnyExtension[]>(() => {
    /* Sin conexión todavía, el esquema a secas: el editor se rehace con la
       colaboración en cuanto llega, y mientras tanto no se pinta. */
    if (!conexion) return extensionesDelDocumento();
    const vistas: Record<string, AnyExtension> = {
      callout: Callout.extend({ addNodeView: () => ReactNodeViewRenderer(VistaAviso) }),
      linkCard: LinkCard.extend({ addNodeView: () => ReactNodeViewRenderer(VistaTarjeta) }),
      image: ImagenDeDocumento.extend({ addNodeView: () => ReactNodeViewRenderer(VistaImagen) }),
    };
    return [
      ...extensionesDelDocumento().map((e) =>
        e.name === 'tableKit'
          ? e.configure({ table: { resizable: false, cellMinWidth: 120, View: VistaTabla } })
          : (vistas[e.name] ?? e),
      ),
      Collaboration.configure({ document: conexion.documento, field: CAMPO_YJS }),
      CollaborationCaret.configure({
        provider: conexion.proveedor,
        user: { name: billete.name, color: billete.color },
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === 'heading'
            ? `Título ${node.attrs.level}`
            : 'Escribe, o presiona «/» para insertar un bloque',
        showOnlyCurrent: true,
        includeChildren: false,
      }),
      Dropcursor.configure({ color: 'var(--color-primary)', width: 2 }),
      Gapcursor,
      TrailingNode,
      crearBarra(() => bloques),
    ];
  }, [conexion, billete.name, billete.color, bloques]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: extensiones,
      editorProps: {
        attributes: {
          class: 'documento-praxis',
          'aria-label': 'Contenido del documento',
        },
        /**
         * Pegar:
         * - imágenes → se suben y entran como bloque;
         * - Markdown (de un .md o del portapapeles de un editor) → bloques;
         * - un enlace solo, en una línea vacía → tarjeta (o incrustado si el
         *   servicio lo permite). En medio de un texto, sigue siendo un enlace.
         */
        handlePaste(view, evento) {
          const archivos = [...(evento.clipboardData?.files ?? [])].filter((f) =>
            f.type.startsWith('image/'),
          );
          if (archivos.length > 0) {
            void insertarImagenes(archivos);
            return true;
          }
          const texto = evento.clipboardData?.getData('text/plain').trim() ?? '';
          const html = evento.clipboardData?.getData('text/html') ?? '';
          if (
            texto &&
            pareceMarkdown(texto) &&
            (!htmlConEstructura(html) || tituloLiteral(texto))
          ) {
            editorRef.current
              ?.chain()
              .focus()
              .insertContent(markdownAJson(texto).content ?? [])
              .run();
            return true;
          }
          const { $from, empty } = view.state.selection;
          if (
            empty &&
            /^https?:\/\/\S+$/i.test(texto) &&
            $from.parent.type.name === 'paragraph' &&
            $from.parent.content.size === 0
          ) {
            editorRef.current
              ?.chain()
              .focus()
              .insertContent({
                type: 'linkCard',
                attrs: { url: texto, display: modoAlPegar(texto) },
              })
              .run();
            return true;
          }
          return false;
        },
        handleDrop(view, evento, _slice, movido) {
          if (movido) return false;
          const archivos = [...(evento.dataTransfer?.files ?? [])].filter((f) =>
            f.type.startsWith('image/'),
          );
          if (archivos.length === 0) return false;
          evento.preventDefault();
          const pos = view.posAtCoords({ left: evento.clientX, top: evento.clientY })?.pos;
          void insertarImagenes(archivos, pos);
          return true;
        },
      },
    },
    [extensiones],
  );
  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  const contexto = useMemo<ContextoDelDocumento>(
    () => ({ documentId, k, editable, conSesion, subirImagen }),
    [documentId, k, editable, conSesion, subirImagen],
  );

  /* El nodo sobre el que está el asa, para el «+» de insertar debajo. */
  const nodoDelAsa = useRef<{ nodo: NodoPM; pos: number } | null>(null);
  function insertarDebajo() {
    const actual = nodoDelAsa.current;
    if (!editor || !actual) return;
    const destino = actual.pos + actual.nodo.nodeSize;
    editor
      .chain()
      .insertContentAt(destino, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
      .focus(destino + 2)
      .run();
  }

  const guardando = pendientes > 0 || estadoRed === 'connecting';

  return (
    <Contexto.Provider value={contexto}>
      {/* A ancho completo: con `max-w-3xl` centrado, en un monitor grande el
          texto ocupaba un tercio y el resto eran márgenes. El padding lateral
          deja sitio al asa de arrastre, que cuelga a la izquierda del bloque. */}
      <div className="flex w-full flex-col gap-2 px-6 pb-24 sm:px-10 lg:px-14">
        <header className="flex flex-col gap-3 pb-2">
          <div className="flex min-h-7 flex-wrap items-center justify-end gap-3">
            <EstadoDeGuardado red={estadoRed} guardando={guardando} editable={editable} />
            <Presentes gente={presentes} />
            {acciones?.(billete.mode, editor)}
          </div>
          <Titulo valor={titulo} onCambio={editable ? onTitulo : undefined} />
          {subtitulo && <div className="font-sans text-xs text-text-secondary">{subtitulo}</div>}
          {!editable && (
            <p className="w-fit rounded-full border border-border px-2.5 py-0.5 font-sans text-[11px] text-text-secondary">
              Solo lectura
            </p>
          )}
        </header>

        {!sincronizado ? (
          <LineasFantasma />
        ) : (
          <>
            {editor && editable && <RevisionDePrax documentId={documentId} editor={editor} />}
            {editor && editable && (
              <>
                <Burbuja editor={editor} />
                <DragHandle
                  editor={editor}
                  onNodeChange={({ node, pos }) => {
                    nodoDelAsa.current = node ? { nodo: node, pos } : null;
                  }}
                >
                  <div className="asa-de-bloque" data-tone="dark">
                    <button
                      type="button"
                      aria-label="Insertar un bloque debajo"
                      title="Insertar debajo"
                      onClick={insertarDebajo}
                    >
                      <Plus />
                    </button>
                    <span title="Arrastra para mover" aria-hidden="true">
                      <GripVertical />
                    </span>
                  </div>
                </DragHandle>
              </>
            )}
            <EditorContent editor={editor} />
            {/* Móvil: el formato pegado al teclado (M5 de docs/PLAN-MOVIL.md). */}
            {editable && editor && (
              <BarraDeFormatoMovil editor={editor} onImagen={() => inputImagen.current?.click()} />
            )}
          </>
        )}

        <input
          ref={inputImagen}
          type="file"
          accept={FORMATOS.join(',')}
          multiple
          hidden
          onChange={(e) => {
            const archivos = [...(e.target.files ?? [])];
            e.target.value = '';
            void insertarImagenes(archivos);
          }}
        />

        {aviso && (
          <output
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 font-sans text-xs text-text-primary shadow-2xl"
            data-tone="dark"
          >
            {aviso}
          </output>
        )}
      </div>
    </Contexto.Provider>
  );
}

/**
 * El título: un campo grande que se guarda solo, sin botón. Enter pasa al
 * cuerpo, como en cualquier editor de documentos.
 */
function Titulo({ valor, onCambio }: { valor: string; onCambio?: (titulo: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const ultimo = useRef(valor);
  useEffect(() => {
    setTexto(valor);
    ultimo.current = valor;
  }, [valor]);

  useEffect(() => {
    if (!onCambio || texto === ultimo.current) return;
    const t = setTimeout(() => {
      ultimo.current = texto;
      onCambio(texto.trim() || 'Sin título');
    }, 700);
    return () => clearTimeout(t);
  }, [texto, onCambio]);

  if (!onCambio) {
    return (
      <h1 className="font-sans text-4xl font-bold tracking-tight text-text-primary">
        {valor || 'Sin título'}
      </h1>
    );
  }
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (document.querySelector('.documento-praxis') as HTMLElement | null)?.focus();
        }
      }}
      maxLength={200}
      placeholder="Sin título"
      aria-label="Título del documento"
      className="w-full bg-transparent font-sans text-4xl font-bold tracking-tight text-text-primary outline-none placeholder:text-text-secondary/60"
    />
  );
}

function EstadoDeGuardado({
  red,
  guardando,
  editable,
}: {
  red: 'connecting' | 'connected' | 'disconnected';
  guardando: boolean;
  editable: boolean;
}) {
  if (red === 'disconnected') {
    return (
      <span className="flex items-center gap-1.5 font-sans text-xs text-warning">
        <CloudOff className="h-3.5 w-3.5" />
        Sin conexión{editable ? ' · se guarda al volver' : ''}
      </span>
    );
  }
  if (!editable) return null;
  return (
    <span className="flex items-center gap-1.5 font-sans text-xs text-text-secondary">
      {guardando && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
      {guardando ? 'Guardando…' : 'Guardado'}
    </span>
  );
}

/** Quién más está en el documento ahora mismo. */
function Presentes({ gente }: { gente: { name: string; color: string; id: number }[] }) {
  if (gente.length === 0) return null;
  const visibles = gente.slice(0, 4);
  return (
    <span className="flex items-center" title={gente.map((g) => g.name).join(', ')}>
      {visibles.map((g) => (
        <span
          key={g.id}
          className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface font-sans text-[10px] font-semibold text-background first:ml-0"
          style={{ background: g.color }}
        >
          {g.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {gente.length > visibles.length && (
        <span className="ml-1 font-sans text-[11px] text-text-secondary">
          +{gente.length - visibles.length}
        </span>
      )}
    </span>
  );
}

function LineasFantasma() {
  return (
    <div className="flex flex-col gap-3 pt-4" aria-hidden="true">
      {[92, 78, 85, 40].map((ancho) => (
        <span
          key={ancho}
          className="h-3.5 animate-presione rounded bg-white/[0.06]"
          style={{ width: `${ancho}%` }}
        />
      ))}
    </div>
  );
}

function Esqueleto({ titulo }: { titulo: string }) {
  return (
    <div className="flex w-full flex-col gap-4 px-6 pt-10 sm:px-10 lg:px-14">
      <h1 className="font-sans text-4xl font-bold tracking-tight text-text-primary">
        {titulo || 'Sin título'}
      </h1>
      <LineasFantasma />
    </div>
  );
}

function PedirSesion({ alPedirSesion }: { alPedirSesion?: () => void }) {
  useEffect(() => alPedirSesion?.(), [alPedirSesion]);
  return <Aviso titulo="Entra para abrirlo" texto="Este documento necesita que inicies sesión." />;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-6 py-24 text-center">
      <h2 className="font-sans text-xl font-semibold text-text-primary">{titulo}</h2>
      <p className="font-sans text-sm text-text-secondary">{texto}</p>
    </div>
  );
}
