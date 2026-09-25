import { describe, expect, it } from 'vitest';
import { jsonAMarkdown, markdownAJson, reconocerProveedor } from './index';

/**
 * El Markdown es la copia legible del documento (E2 de
 * `docs/PLAN-DOCUMENTOS.md`): lo que el editor escribe tiene que volver a
 * leerse igual. Si un bloque no hace el viaje de ida y vuelta, el primer
 * documento viejo que se abra en el editor nuevo lo pierde.
 */
const ida = (md: string) => jsonAMarkdown(markdownAJson(md));

describe('Markdown de un documento', () => {
  it.each([
    ['títulos', '# Uno\n\n## Dos\n\n### Tres'],
    ['formato', 'Texto con **negrita**, *cursiva*, ~~tachado~~ y `código`.'],
    ['enlace', 'Ver [la guía](https://example.com/guia).'],
    ['listas', '- uno\n- dos\n\n1. primero\n2. segundo'],
    ['tareas', '- [ ] pendiente\n- [x] hecha'],
    ['cita', '> Una cita'],
    ['código', '```ts\nconst a = 1;\n```'],
    ['separador', 'Arriba\n\n---\n\nAbajo'],
    ['imagen', '![Diagrama](/documents/abc/assets/def)'],
    ['aviso', '> [!WARNING]\n> Cuidado con esto'],
    ['tarjeta', '[card](https://docs.google.com/document/d/abc123/edit)'],
    ['incrustado', '[embed](https://www.youtube.com/watch?v=dQw4w9WgXcQ)'],
    ['resaltado', 'Esto es ==importante==.'],
  ])('%s hace el viaje de ida y vuelta', (_, md) => {
    expect(ida(md)).toBe(md);
  });

  it('una tabla GFM se conserva', () => {
    const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    expect(ida(md).replace(/ +/g, ' ')).toContain('| A | B |');
    expect(markdownAJson(md).content?.[0]?.type).toBe('table');
  });

  it('el aviso se lee como su propio nodo, no como una cita', () => {
    expect(markdownAJson('> [!TIP]\n> Consejo').content?.[0]).toMatchObject({
      type: 'callout',
      attrs: { variant: 'tip' },
    });
  });

  it('un documento vacío abre con un párrafo', () => {
    expect(markdownAJson('').content).toEqual([{ type: 'paragraph' }]);
  });
});

describe('proveedores', () => {
  it('reconoce un documento de Google y da su vista incrustable', () => {
    expect(reconocerProveedor('https://docs.google.com/document/d/abc_1/edit')).toMatchObject({
      id: 'google-docs',
      embed: 'https://docs.google.com/document/d/abc_1/preview',
    });
  });
  it('una reunión de Meet no se incrusta', () => {
    expect(reconocerProveedor('https://meet.google.com/abc-defg-hij')?.embed).toBeNull();
  });
  it('YouTube va sin cookies', () => {
    expect(reconocerProveedor('https://youtu.be/xyz')?.embed).toBe(
      'https://www.youtube-nocookie.com/embed/xyz',
    );
  });
});
