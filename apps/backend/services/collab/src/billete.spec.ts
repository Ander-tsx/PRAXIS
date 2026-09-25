import { COLLAB_TICKET_TYP } from '@praxis/contracts';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { validarBillete } from './billete.js';

const SECRETO = 'secreto-de-prueba';
const DOC = '11111111-1111-4111-8111-111111111111';

function firmar(claims: object, secreto = SECRETO, opciones: jwt.SignOptions = { expiresIn: 60 }) {
  return jwt.sign(claims, secreto, { algorithm: 'HS256', ...opciones });
}

describe('validarBillete', () => {
  it('acepta un billete de este documento y devuelve su modo', () => {
    const token = firmar({ typ: COLLAB_TICKET_TYP, doc: DOC, mode: 'edit', sub: 'u1' });
    expect(validarBillete(token, DOC, SECRETO)).toMatchObject({ doc: DOC, mode: 'edit' });
  });

  it('rechaza la firma de otro secreto', () => {
    const token = firmar({ typ: COLLAB_TICKET_TYP, doc: DOC, mode: 'read' }, 'otro');
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow();
  });

  it('rechaza un billete caducado', () => {
    const token = firmar({ typ: COLLAB_TICKET_TYP, doc: DOC, mode: 'read' }, SECRETO, {
      expiresIn: -1,
    });
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow();
  });

  // Una sesión se firma con el mismo secreto: sin mirar `typ`, cualquier
  // cookie de sesión abriría cualquier documento.
  it('rechaza un JWT de sesión aunque la firma sea buena', () => {
    const token = firmar({ sub: 'u1', email: 'a@b.c' });
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow('No es un billete');
  });

  it('rechaza un billete de otro documento', () => {
    const token = firmar({ typ: COLLAB_TICKET_TYP, doc: 'otro', mode: 'edit' });
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow('otro documento');
  });

  it('rechaza un modo desconocido', () => {
    const token = firmar({ typ: COLLAB_TICKET_TYP, doc: DOC, mode: 'admin' });
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow('Modo desconocido');
  });

  it('rechaza el algoritmo none', () => {
    const token = jwt.sign({ typ: COLLAB_TICKET_TYP, doc: DOC, mode: 'edit' }, '', {
      algorithm: 'none',
    });
    expect(() => validarBillete(token, DOC, SECRETO)).toThrow();
  });
});
