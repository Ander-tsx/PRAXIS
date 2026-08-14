import { NotFound } from '@praxis/commons';

/**
 * El 404 de web-shell.
 *
 * ⚠️ En multi-zones **no hay un 404 central**: el shell solo atiende lo que
 * no casa con ningún `rewrites()`, y todo lo que cae dentro del prefijo de
 * una zona lo resuelve —o lo rechaza— esa zona. Por eso cada una monta el
 * suyo, apuntando a su propio sitio de vuelta.
 */
export default function NoEncontrado() {
  return (
    <NotFound
      href={'/'}
      hrefLabel={'Volver al inicio'}
      descripcion="La página que buscas no existe, o ya no está donde estaba."
    />
  );
}
