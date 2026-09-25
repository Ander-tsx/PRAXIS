import { Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

/**
 * Los nodos propios de un documento de Praxis, con su forma en Markdown
 * (E2 de `docs/PLAN-DOCUMENTOS.md`). Aquí solo el **esquema**: cómo se
 * guardan y cómo se escriben. Cómo se ven y se editan lo añade el editor con
 * `.extend({ addNodeView })`, que no le importa al servidor.
 */

export type VarianteDeAviso = 'note' | 'tip' | 'important' | 'warning' | 'caution';
const VARIANTES: VarianteDeAviso[] = ['note', 'tip', 'important', 'warning', 'caution'];

/**
 * Un aviso: el `> [!NOTE]` de GitHub. Se lee como una cita en cualquier otro
 * visor de Markdown.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'note' as VarianteDeAviso,
        parseHTML: (el) => (el.getAttribute('data-variant') as VarianteDeAviso) ?? 'note',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => src.search(/^> \[!/m),
    tokenize(src, _tokens, lexer) {
      const m = src.match(
        /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n((?:>[^\n]*(?:\n|$))*)/i,
      );
      if (!m) return undefined;
      const dentro = m[2]
        .split('\n')
        .map((linea) => linea.replace(/^> ?/, ''))
        .join('\n');
      return {
        type: 'callout',
        raw: m[0],
        variant: m[1].toLowerCase(),
        tokens: lexer.blockTokens(dentro),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const variante = VARIANTES.includes(token.variant) ? token.variant : 'note';
    const hijos = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      'callout',
      { variant: variante },
      hijos.length > 0 ? hijos : [helpers.createNode('paragraph')],
    );
  },

  renderMarkdown(node, helpers) {
    const variante = String(node.attrs?.variant ?? 'note').toUpperCase();
    const cuerpo = helpers.renderChildren(node.content ?? [], '\n\n');
    const citado = cuerpo
      .split('\n')
      .map((linea) => (linea ? `> ${linea}` : '>'))
      .join('\n');
    return `> [!${variante}]\n${citado}`;
  },
});

export type ModoDeEnlace = 'card' | 'embed';

/**
 * Un enlace que ocupa su bloque: una tarjeta con vista previa o, si el
 * servicio lo permite, el contenido incrustado (vídeo, documento de Google,
 * diseño de Figma…).
 *
 * En Markdown es **un enlace normal** en su propio párrafo —`[card](url)` o
 * `[embed](url)`—, así que fuera de Praxis se sigue pudiendo abrir. Título,
 * descripción e imagen no van al Markdown: viven en el estado en vivo, y si
 * faltan el editor los vuelve a pedir.
 */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      display: { default: 'card' as ModoDeEnlace },
      title: { default: null as string | null },
      description: { default: null as string | null },
      image: { default: null as string | null },
      siteName: { default: null as string | null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-link-card]',
        getAttrs: (el) => ({
          url: (el as HTMLElement).getAttribute('data-url') ?? '',
          display: (el as HTMLElement).getAttribute('data-display') ?? 'card',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'div',
      { 'data-link-card': '', 'data-url': node.attrs.url, 'data-display': node.attrs.display },
      [
        'a',
        { href: node.attrs.url, rel: 'noopener noreferrer' },
        node.attrs.title ?? node.attrs.url,
      ],
    ];
  },

  markdownTokenizer: {
    name: 'linkCard',
    level: 'block',
    start: (src: string) => src.search(/^\[(card|embed)\]\(/m),
    tokenize(src) {
      const m = src.match(/^\[(card|embed)\]\((\S+?)\)[ \t]*(?:\n|$)/);
      if (!m) return undefined;
      return { type: 'linkCard', raw: m[0], display: m[1], url: m[2] };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('linkCard', { url: token.url, display: token.display });
  },

  renderMarkdown(node) {
    const modo = node.attrs?.display === 'embed' ? 'embed' : 'card';
    return `[${modo}](${node.attrs?.url ?? ''})`;
  },
});

/**
 * Imagen de bloque. `src` es la ruta del gateway
 * (`/documents/:id/assets/:assetId`), sin dominio ni token: quién puede verla
 * lo decide el gateway en cada petición, y el editor le añade lo que haga falta.
 */
export const ImagenDeDocumento = Image.configure({ inline: false, allowBase64: false });
