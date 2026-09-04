import { NotFound } from '@praxis/commons';

/**
 * El 404 de auth-front.
 *
 * ⚠️ En multi-zones **no hay un 404 central**: el shell solo atiende lo que
 * no casa con ningún `rewrites()`, y todo lo que cae dentro del prefijo de
 * una zona lo resuelve —o lo rechaza— esa zona. Por eso cada una monta el
 * suyo, apuntando a su propio sitio de vuelta.
 */
export default function NoEncontrado() {
  return (
    <NotFound
      href={'/auth/login'}
      hrefLabel={'Ir a entrar'}
      descripcion="Esta dirección no lleva a ninguna parte. Entra y sigue desde el panel."
    />
  );
}
