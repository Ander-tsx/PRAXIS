'use client';

import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link,
  List,
  Quote,
  Strikethrough,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

/**
 * El menú de formato que aparece sobre lo seleccionado. Lo que Markdown sabe
 * guardar, y nada más: sin subrayado ni colores, que no tendrían forma en el
 * archivo (D2).
 */
export function Burbuja({ editor }: { editor: Editor }) {
  const [enlazando, setEnlazando] = useState(false);
  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrita: e.isActive('bold'),
      cursiva: e.isActive('italic'),
      tachado: e.isActive('strike'),
      codigo: e.isActive('code'),
      resaltado: e.isActive('highlight'),
      enlace: e.isActive('link'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      lista: e.isActive('bulletList'),
      tareas: e.isActive('taskList'),
      cita: e.isActive('blockquote'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
    }),
  });

  function alEnlazar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valor = String(new FormData(evento.currentTarget).get('href') ?? '').trim();
    const cadena = editor.chain().focus().extendMarkRange('link');
    if (!valor) cadena.unsetLink().run();
    else cadena.setLink({ href: /^[a-z]+:/i.test(valor) ? valor : `https://${valor}` }).run();
    setEnlazando(false);
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state }) => {
        const { empty } = state.selection;
        if (empty || !e.isEditable) return false;
        if (e.isActive('codeBlock') || e.isActive('image') || e.isActive('linkCard')) return false;
        return true;
      }}
      data-tone="dark"
      className="flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-2xl"
    >
      {enlazando ? (
        <form onSubmit={alEnlazar} className="flex items-center gap-1">
          <input
            name="href"
            defaultValue={estado.href}
            placeholder="Pega o escribe un enlace"
            // biome-ignore lint/a11y/noAutofocus: se abre para escribir en él
            autoFocus
            onKeyDown={(e) => e.key === 'Escape' && setEnlazando(false)}
            className="h-7 w-60 rounded-md bg-background px-2 font-sans text-xs text-text-primary outline-none placeholder:text-text-secondary"
          />
          <button
            type="submit"
            className="h-7 cursor-pointer rounded-md px-2 font-sans text-xs text-primary hover:bg-white/[0.07]"
          >
            Listo
          </button>
        </form>
      ) : (
        <>
          <Boton
            activo={estado.negrita}
            titulo="Negrita (⌘B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </Boton>
          <Boton
            activo={estado.cursiva}
            titulo="Cursiva (⌘I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </Boton>
          <Boton
            activo={estado.tachado}
            titulo="Tachado"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </Boton>
          <Boton
            activo={estado.codigo}
            titulo="Código"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code />
          </Boton>
          <Boton
            activo={estado.resaltado}
            titulo="Resaltar"
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter />
          </Boton>
          <Boton activo={estado.enlace} titulo="Enlace (⌘K)" onClick={() => setEnlazando(true)}>
            <Link />
          </Boton>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
          <Boton
            activo={estado.h1}
            titulo="Título 1"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 />
          </Boton>
          <Boton
            activo={estado.h2}
            titulo="Título 2"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 />
          </Boton>
          <Boton
            activo={estado.lista}
            titulo="Lista"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List />
          </Boton>
          <Boton
            activo={estado.tareas}
            titulo="Tareas"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <CheckSquare />
          </Boton>
          <Boton
            activo={estado.cita}
            titulo="Cita"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </Boton>
        </>
      )}
    </BubbleMenu>
  );
}

function Boton({
  activo,
  titulo,
  onClick,
  children,
}: {
  activo: boolean;
  titulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5 ${
        activo
          ? 'bg-primary/15 text-primary'
          : 'text-text-secondary hover:bg-white/[0.07] hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
