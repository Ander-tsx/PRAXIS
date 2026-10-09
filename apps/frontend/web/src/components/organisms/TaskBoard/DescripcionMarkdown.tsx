'use client';

import {
  descripcionAJson,
  extensionesDeDescripcion,
  jsonADescripcion,
} from '@praxis/editor-schema';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import {
  Bold,
  CheckSquare,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { BarraDeFormatoMovil } from '../DocumentEditor/BarraDeFormatoMovil';
import '../DocumentEditor/editor.css';

/**
 * La descripción de una tarea, con **Markdown simplificado en vivo**: se
 * escribe `## ` y la línea se vuelve subtítulo, `**texto**` se pone en negrita
 * al cerrar el asterisco, `- ` abre una lista. Sin modo «vista previa»: lo que
 * ves mientras escribes es lo que se queda.
 *
 * Lo que sale al formulario es **Markdown en un `<input type="hidden">`** con el
 * mismo nombre `description` que tenía el `<textarea>`: `TaskDialog` lee el
 * `FormData` entero al cerrar, y el backend sigue recibiendo un `string`.
 *
 * ⚠️ **El valor del `input` solo cambia cuando el usuario edita (`onUpdate`),
 * nunca al montar.** `TaskDialog` compara una firma del formulario al abrir con
 * la de al cerrar para decidir si guarda; si el viaje Markdown → editor →
 * Markdown normalizara el texto al montar (una lista con `*` que vuelve con
 * `-`), abrir una tarea sin tocarla la marcaría como editada, avisaría al equipo
 * y despertaría a las reglas de automatización.
 */
export function DescripcionMarkdown({
  initial,
  readOnly,
}: {
  initial: string;
  readOnly: boolean;
}) {
  const [valor, setValor] = useState(initial);
  const extensiones = useMemo(
    () => [
      ...extensionesDeDescripcion(),
      UndoRedo,
      Placeholder.configure({
        placeholder: readOnly ? 'Sin descripción' : 'Añade una descripción…',
      }),
    ],
    [readOnly],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: extensiones,
    content: descripcionAJson(initial),
    editorProps: {
      attributes: {
        class: 'documento-praxis descripcion-tarea',
        'aria-label': 'Descripción',
      },
    },
    onUpdate: ({ editor: e }) => setValor(jsonADescripcion(e.getJSON())),
  });

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            enfocado: e.isFocused,
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            negrita: e.isActive('bold'),
            cursiva: e.isActive('italic'),
            tachado: e.isActive('strike'),
            lista: e.isActive('bulletList'),
            numerada: e.isActive('orderedList'),
            tareas: e.isActive('taskList'),
            cita: e.isActive('blockquote'),
          }
        : null,
  });

  return (
    <div className="-mx-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.03] focus-within:bg-white/[0.04] focus-within:ring-1 focus-within:ring-white/10">
      <input type="hidden" name="description" value={valor} />

      {editor && !readOnly && estado?.enfocado && (
        <div
          role="toolbar"
          aria-label="Formato de la descripción"
          className="mb-1 hidden items-center gap-0.5 border-b border-white/[0.06] pb-1 md:flex"
        >
          <Boton
            etiqueta="Subtítulo"
            activo={estado.h2}
            onPulsar={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 />
          </Boton>
          <Boton
            etiqueta="Subtítulo pequeño"
            activo={estado.h3}
            onPulsar={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 />
          </Boton>
          <Separador />
          <Boton
            etiqueta="Negrita"
            activo={estado.negrita}
            onPulsar={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </Boton>
          <Boton
            etiqueta="Cursiva"
            activo={estado.cursiva}
            onPulsar={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </Boton>
          <Boton
            etiqueta="Tachado"
            activo={estado.tachado}
            onPulsar={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </Boton>
          <Separador />
          <Boton
            etiqueta="Viñetas"
            activo={estado.lista}
            onPulsar={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List />
          </Boton>
          <Boton
            etiqueta="Lista numerada"
            activo={estado.numerada}
            onPulsar={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </Boton>
          <Boton
            etiqueta="Pasos marcables"
            activo={estado.tareas}
            onPulsar={() => editor.chain().focus().toggleTaskList().run()}
          >
            <CheckSquare />
          </Boton>
          <Boton
            etiqueta="Cita"
            activo={estado.cita}
            onPulsar={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </Boton>
        </div>
      )}

      <EditorContent editor={editor} />
      {editor && !readOnly && <BarraDeFormatoMovil editor={editor} />}
    </div>
  );
}

function Separador() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />;
}

/**
 * Los botones **no le quitan el foco al editor** (`preventDefault` en
 * `pointerdown`): si lo hicieran, la barra desaparecería al pulsar, porque solo
 * se muestra con el editor enfocado.
 */
function Boton({
  etiqueta,
  activo,
  onPulsar,
  children,
}: {
  etiqueta: string;
  activo: boolean;
  onPulsar: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      aria-pressed={activo}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPulsar}
      className={`grid h-7 w-7 place-items-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
        activo
          ? 'bg-white/[0.12] text-text-primary'
          : 'text-text-secondary hover:bg-white/[0.07] hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
