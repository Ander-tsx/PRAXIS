'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  CheckSquare,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * La barra de formato encima del teclado, **solo en móvil** (M5 de
 * `docs/PLAN-MOVIL.md`).
 *
 * En escritorio el formato está en la burbuja que sale al seleccionar y en el
 * menú «/». En un teléfono seleccionar con el dedo ya abre el menú del sistema
 * —copiar, pegar— encima de la burbuja, y escribir «/» con el teclado en
 * pantalla es un gesto que nadie hace. Las apps de notas resuelven esto con una
 * fila de botones pegada al teclado, y eso es esto.
 *
 * - Sale solo con el editor enfocado: sin teclado no hay nada que formatear.
 * - Va encima del teclado: `bottom: var(--teclado)` para iOS, que no encoge la
 *   ventana (ver `GestosMoviles`); en Android la ventana ya encoge y vale 0.
 * - Los botones **no le quitan el foco al editor** (`preventDefault` en
 *   `pointerdown`): si lo hicieran, el teclado se cerraría con cada toque.
 */
export function BarraDeFormatoMovil({
  editor,
  onImagen,
}: {
  editor: Editor;
  onImagen?: () => void;
}) {
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      enfocado: e.isFocused,
      negrita: e.isActive('bold'),
      cursiva: e.isActive('italic'),
      tachado: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      lista: e.isActive('bulletList'),
      numerada: e.isActive('orderedList'),
      tareas: e.isActive('taskList'),
      cita: e.isActive('blockquote'),
      deshacer: e.can().undo(),
      rehacer: e.can().redo(),
    }),
  });

  if (!estado.enfocado) return null;

  const cadena = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formato"
      className="scrollbar-none fixed inset-x-0 z-40 flex h-12 items-center gap-0.5 overflow-x-auto border-t border-white/10 bg-surface-2/95 px-1.5 backdrop-blur-md md:hidden"
      style={{ bottom: 'var(--teclado, 0px)' }}
    >
      <Boton
        etiqueta="Deshacer"
        deshabilitado={!estado.deshacer}
        onPulsar={() => cadena().undo().run()}
      >
        <Undo2 />
      </Boton>
      <Boton
        etiqueta="Rehacer"
        deshabilitado={!estado.rehacer}
        onPulsar={() => cadena().redo().run()}
      >
        <Redo2 />
      </Boton>
      <Separador />
      <Boton
        etiqueta="Título"
        activo={estado.h1}
        onPulsar={() => cadena().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 />
      </Boton>
      <Boton
        etiqueta="Subtítulo"
        activo={estado.h2}
        onPulsar={() => cadena().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </Boton>
      <Boton
        etiqueta="Negrita"
        activo={estado.negrita}
        onPulsar={() => cadena().toggleBold().run()}
      >
        <Bold />
      </Boton>
      <Boton
        etiqueta="Cursiva"
        activo={estado.cursiva}
        onPulsar={() => cadena().toggleItalic().run()}
      >
        <Italic />
      </Boton>
      <Boton
        etiqueta="Tachado"
        activo={estado.tachado}
        onPulsar={() => cadena().toggleStrike().run()}
      >
        <Strikethrough />
      </Boton>
      <Separador />
      <Boton
        etiqueta="Lista"
        activo={estado.lista}
        onPulsar={() => cadena().toggleBulletList().run()}
      >
        <List />
      </Boton>
      <Boton
        etiqueta="Lista numerada"
        activo={estado.numerada}
        onPulsar={() => cadena().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Boton>
      <Boton
        etiqueta="Lista de tareas"
        activo={estado.tareas}
        onPulsar={() => cadena().toggleTaskList().run()}
      >
        <CheckSquare />
      </Boton>
      <Boton
        etiqueta="Cita"
        activo={estado.cita}
        onPulsar={() => cadena().toggleBlockquote().run()}
      >
        <Quote />
      </Boton>
      {onImagen && (
        <Boton etiqueta="Imagen" onPulsar={onImagen}>
          <ImagePlus />
        </Boton>
      )}
    </div>
  );
}

function Boton({
  etiqueta,
  activo = false,
  deshabilitado = false,
  onPulsar,
  children,
}: {
  etiqueta: string;
  activo?: boolean;
  deshabilitado?: boolean;
  onPulsar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      aria-pressed={activo}
      disabled={deshabilitado}
      /* Sin esto el toque le quita el foco al editor y se cierra el teclado. */
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPulsar}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 [&>svg]:h-[18px] [&>svg]:w-[18px] ${
        activo ? 'bg-white/15 text-white' : 'text-text-secondary active:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/10" />;
}
