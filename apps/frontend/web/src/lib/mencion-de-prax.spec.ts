import { componerReferencia, splitMessage } from '@praxis/commons/api/chat-refs';
import { describe, expect, it } from 'vitest';

/**
 * La mención a PRAX en el chat (D15 de docs/PLAN-PRAX-SEMIAGENTICO.md). Su id no
 * es un UUID —PRAX no es una cuenta—, y el patrón de referencias solo aceptaba
 * UUID: sin ampliarlo, `@PRAX` salía como texto crudo con el `(assistant:prax)`
 * a la vista y el gateway no la reconocía.
 */
describe('mención a PRAX', () => {
  it('se compone con @ y se vuelve a leer como referencia', () => {
    const cuerpo = `${componerReferencia('assistant', 'prax', 'PRAX')} ¿qué falta?`;
    expect(cuerpo).toBe('@[PRAX](assistant:prax) ¿qué falta?');
    expect(splitMessage(cuerpo)[0]).toMatchObject({
      tipo: 'ref',
      sigil: '@',
      kind: 'assistant',
      id: 'prax',
      label: 'PRAX',
    });
  });

  it('una persona sigue exigiendo un UUID', () => {
    expect(splitMessage('@[Ana](user:prax)')[0]).toMatchObject({ tipo: 'texto' });
  });
});
