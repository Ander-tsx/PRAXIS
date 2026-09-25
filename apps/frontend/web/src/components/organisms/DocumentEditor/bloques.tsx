'use client';

import type { Editor, Range } from '@tiptap/core';
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Info,
  Link2,
  List,
  ListOrdered,
  Minus,
  PlaySquare,
  Quote,
  Table,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Lo que se puede insertar con «/» o con el «+» del asa de cada bloque.
 *
 * `palabras` es lo que se puede teclear para encontrarlo además del título:
 * quien escribe «/h1», «/todo» o «/youtube» tiene que llegar a donde espera.
 */
export interface Bloque {
  id: string;
  titulo: string;
  detalle: string;
  grupo: 'Texto' | 'Bloques' | 'Multimedia';
  icono: ReactNode;
  palabras: string[];
  ejecutar: (editor: Editor, rango: Range | null) => void;
}

/** Empieza la cadena en el rango del «/» (que se borra) o donde esté el cursor. */
function desde(editor: Editor, rango: Range | null) {
  const cadena = editor.chain().focus();
  return rango ? cadena.deleteRange(rango) : cadena;
}

const I = 'h-4 w-4';

export function bloquesDisponibles(abrirImagen: () => void): Bloque[] {
  return [
    {
      id: 'texto',
      titulo: 'Texto',
      detalle: 'Un párrafo normal',
      grupo: 'Texto',
      icono: <Type className={I} />,
      palabras: ['parrafo', 'p', 'text'],
      ejecutar: (e, r) => desde(e, r).setParagraph().run(),
    },
    ...([1, 2, 3] as const).map((nivel) => ({
      id: `h${nivel}`,
      titulo: `Título ${nivel}`,
      detalle: nivel === 1 ? 'Sección principal' : nivel === 2 ? 'Apartado' : 'Subapartado',
      grupo: 'Texto' as const,
      icono:
        nivel === 1 ? (
          <Heading1 className={I} />
        ) : nivel === 2 ? (
          <Heading2 className={I} />
        ) : (
          <Heading3 className={I} />
        ),
      palabras: [`h${nivel}`, 'titulo', 'heading', '#'.repeat(nivel)],
      ejecutar: (e: Editor, r: Range | null) => desde(e, r).setHeading({ level: nivel }).run(),
    })),
    {
      id: 'lista',
      titulo: 'Lista',
      detalle: 'Con viñetas',
      grupo: 'Texto',
      icono: <List className={I} />,
      palabras: ['viñetas', 'ul', 'bullet', '-'],
      ejecutar: (e, r) => desde(e, r).toggleBulletList().run(),
    },
    {
      id: 'numerada',
      titulo: 'Lista numerada',
      detalle: '1, 2, 3…',
      grupo: 'Texto',
      icono: <ListOrdered className={I} />,
      palabras: ['ol', 'numeros', 'ordered'],
      ejecutar: (e, r) => desde(e, r).toggleOrderedList().run(),
    },
    {
      id: 'tareas',
      titulo: 'Lista de tareas',
      detalle: 'Casillas que se marcan',
      grupo: 'Texto',
      icono: <CheckSquare className={I} />,
      palabras: ['todo', 'checklist', 'casillas', '[]'],
      ejecutar: (e, r) => desde(e, r).toggleTaskList().run(),
    },
    {
      id: 'cita',
      titulo: 'Cita',
      detalle: 'Texto citado',
      grupo: 'Bloques',
      icono: <Quote className={I} />,
      palabras: ['quote', 'blockquote', '>'],
      ejecutar: (e, r) => desde(e, r).toggleBlockquote().run(),
    },
    {
      id: 'aviso',
      titulo: 'Aviso',
      detalle: 'Una nota que destaca',
      grupo: 'Bloques',
      icono: <Info className={I} />,
      palabras: ['callout', 'nota', 'importante', 'warning', 'tip'],
      ejecutar: (e, r) =>
        desde(e, r)
          .insertContent({
            type: 'callout',
            attrs: { variant: 'note' },
            content: [{ type: 'paragraph' }],
          })
          .run(),
    },
    {
      id: 'codigo',
      titulo: 'Código',
      detalle: 'Bloque de código',
      grupo: 'Bloques',
      icono: <Code2 className={I} />,
      palabras: ['code', 'pre', '```'],
      ejecutar: (e, r) => desde(e, r).toggleCodeBlock().run(),
    },
    {
      id: 'tabla',
      titulo: 'Tabla',
      detalle: 'Tres por tres para empezar',
      grupo: 'Bloques',
      icono: <Table className={I} />,
      palabras: ['table', 'grid'],
      ejecutar: (e, r) => desde(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'separador',
      titulo: 'Separador',
      detalle: 'Una línea',
      grupo: 'Bloques',
      icono: <Minus className={I} />,
      palabras: ['hr', 'divider', 'linea', '---'],
      ejecutar: (e, r) => desde(e, r).setHorizontalRule().run(),
    },
    {
      id: 'imagen',
      titulo: 'Imagen',
      detalle: 'Súbela desde tu equipo',
      grupo: 'Multimedia',
      icono: <ImageIcon className={I} />,
      palabras: ['image', 'foto', 'png', 'jpg'],
      ejecutar: (e, r) => {
        desde(e, r).run();
        abrirImagen();
      },
    },
    {
      id: 'enlace',
      titulo: 'Enlace con vista previa',
      detalle: 'Docs, Sheets, Meet, cualquier web',
      grupo: 'Multimedia',
      icono: <Link2 className={I} />,
      palabras: ['link', 'url', 'bookmark', 'drive', 'docs', 'sheets', 'meet'],
      ejecutar: (e, r) =>
        desde(e, r)
          .insertContent({ type: 'linkCard', attrs: { url: '', display: 'card' } })
          .run(),
    },
    {
      id: 'incrustar',
      titulo: 'Incrustar',
      detalle: 'YouTube, Loom, Figma, un Doc…',
      grupo: 'Multimedia',
      icono: <PlaySquare className={I} />,
      palabras: ['embed', 'video', 'youtube', 'loom', 'vimeo', 'figma', 'miro'],
      ejecutar: (e, r) =>
        desde(e, r)
          .insertContent({ type: 'linkCard', attrs: { url: '', display: 'embed' } })
          .run(),
    },
  ];
}

/** Sin tildes y en minúsculas: «/titulo» encuentra «Título». */
function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function filtrarBloques(bloques: Bloque[], consulta: string): Bloque[] {
  const q = normalizar(consulta.trim());
  if (!q) return bloques;
  return bloques.filter(
    (b) => normalizar(b.titulo).includes(q) || b.palabras.some((p) => normalizar(p).startsWith(q)),
  );
}
