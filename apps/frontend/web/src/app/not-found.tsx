import { NotFound } from '@praxis/commons';

/**
 * El 404 de la aplicación, y ahora sí es **el central**.
 *
 * En el multi-zone no había ninguno: el shell solo atendía lo que no casaba con
 * ningún `rewrites()`, y lo que caía dentro del prefijo de una zona lo resolvía
 * —o lo rechazaba— esa zona. Por eso cada una montaba el suyo.
 *
 * Las secciones conservan el suyo igualmente, porque el `not-found` más cercano
 * en el árbol es el que gana y devuelve a esa sección en vez de a la landing.
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
