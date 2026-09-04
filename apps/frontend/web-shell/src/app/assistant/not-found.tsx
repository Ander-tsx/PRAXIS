import { NotFound } from '@praxis/commons';

/**
 * El 404 del asistente.
 *
 * ⚠️ Sigue existiendo aunque el shell ya tenga el suyo, y no es redundante: el
 * `not-found` más cercano en el árbol es el que gana, y este devuelve **a PRAX**
 * en vez de a la landing pública, que es lo que quiere quien se ha perdido
 * dentro del asistente.
 */
export default function NoEncontrado() {
  return (
    <NotFound
      href={'/assistant'}
      hrefLabel={'Hablar con PRAX'}
      descripcion="Esta dirección no lleva a ninguna parte dentro del asistente."
    />
  );
}
