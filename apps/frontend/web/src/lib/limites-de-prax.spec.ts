import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
  ASSISTANT_PDF_MAX_INLINE_PAGES,
  ASSISTANT_TEXT_MAX_CHARS,
  TIPOS_DE_ADJUNTO,
} from '@praxis/commons/api/assistant';
import { describe, expect, it } from 'vitest';

/**
 * Los límites de los adjuntos de PRAX, frontend contra backend (D17 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * `commons` no puede importar `@praxis/contracts` —trae decoradores de Nest y
 * class-validator al navegador—, así que los números están escritos dos veces.
 * Esto los compara leyendo el archivo del backend: si alguien sube un tope en
 * un lado y no en el otro, el menú promete algo que el servidor rechaza.
 */
const CONTRATO = readFileSync(
  join(__dirname, '../../../../backend/commons/contracts/src/assistant/assistant.dto.ts'),
  'utf8',
);

function numero(nombre: string): number {
  const hallado = CONTRATO.match(new RegExp(`export const ${nombre}[^=]*=\\s*([^;]+);`));
  if (!hallado) throw new Error(`${nombre} no está en el contrato`);
  // biome-ignore lint/security/noGlobalEval: es una expresión numérica del propio repositorio
  return Number(eval(hallado[1].replaceAll('_', '')));
}

describe('límites de los adjuntos de PRAX', () => {
  it('los números coinciden con los del contrato', () => {
    expect(ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE).toBe(numero('ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE'));
    expect(ASSISTANT_ATTACHMENT_MAX_BYTES).toBe(numero('ASSISTANT_ATTACHMENT_MAX_BYTES'));
    expect(ASSISTANT_PDF_MAX_INLINE_PAGES).toBe(numero('ASSISTANT_PDF_MAX_INLINE_PAGES'));
    expect(ASSISTANT_TEXT_MAX_CHARS).toBe(numero('ASSISTANT_TEXT_MAX_CHARS'));
  });

  it('el menú no ofrece ningún tipo que el servidor no acepte', () => {
    const permitidos = new Set<string>(ASSISTANT_ATTACHMENT_ALLOWED_MIME);
    for (const tipo of TIPOS_DE_ADJUNTO) {
      for (const aceptado of tipo.accept.split(',')) {
        if (aceptado.startsWith('.')) continue;
        expect(permitidos.has(aceptado), `${tipo.id}: ${aceptado}`).toBe(true);
      }
    }
  });
});
