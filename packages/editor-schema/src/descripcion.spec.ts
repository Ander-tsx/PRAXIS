import { describe, expect, it } from 'vitest';
import { descripcionAJson, jsonADescripcion } from './index.js';

const ida = (md: string) => jsonADescripcion(descripcionAJson(md));

describe('Markdown de la descripción de una tarea', () => {
  it.each([
    ['subtítulos', '## Contexto\n\n### Detalle'],
    ['formato', 'Texto con **negrita**, *cursiva*, ~~tachado~~ y `código`.'],
    ['listas', '- uno\n- dos\n\n1. primero\n2. segundo'],
    ['pasos marcables', '- [ ] pendiente\n- [x] hecho'],
    ['cita', '> Una nota'],
    ['enlace', 'Ver [la guía](https://example.com/guia).'],
  ])('%s hace el viaje de ida y vuelta', (_, md) => {
    expect(ida(md)).toBe(md);
  });

  it('un texto plano de antes se conserva tal cual', () => {
    expect(ida('Arreglar el login\ny probarlo')).toContain('Arreglar el login');
  });

  it('vacío sigue vacío', () => {
    expect(ida('')).toBe('');
  });

  it('una tabla no existe aquí: se queda como texto', () => {
    expect(descripcionAJson('| A | B |\n| --- | --- |').content?.[0]?.type).not.toBe('table');
  });
});
