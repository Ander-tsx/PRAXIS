import { COLLAB_TICKET_TYP, type CollabTicketClaims } from '@praxis/contracts';
import jwt from 'jsonwebtoken';

/**
 * Valida el billete que firma el gateway (E3 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * Tres cosas y ninguna menos: la firma (el mismo `JWT_SECRET`), que sea un
 * billete de tiempo real y no una sesión, y que sea **de este documento** —un
 * billete no abre ningún otro—.
 */
export function validarBillete(
  token: string,
  documento: string,
  secreto: string,
): CollabTicketClaims {
  const claims = jwt.verify(token, secreto, { algorithms: ['HS256'] }) as CollabTicketClaims;
  if (claims.typ !== COLLAB_TICKET_TYP) throw new Error('No es un billete de tiempo real');
  if (claims.doc !== documento) throw new Error('El billete es de otro documento');
  if (claims.mode !== 'read' && claims.mode !== 'edit') throw new Error('Modo desconocido');
  return claims;
}
