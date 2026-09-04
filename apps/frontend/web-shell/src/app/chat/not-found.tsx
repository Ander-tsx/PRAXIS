import { NotFound } from '@praxis/commons';

/**
 * El 404 de chat-front.
 *
 * ⚠️ En multi-zones **no hay un 404 central**: el shell solo atiende lo que
 * no casa con ningún `rewrites()`, y todo lo que cae dentro del prefijo de
 * una zona lo resuelve —o lo rechaza— esa zona. Por eso cada una monta el
 * suyo, apuntando a su propio sitio de vuelta.
 *
 * Aquí cae, además de una dirección inventada, el caso real: un enlace a una
 * conversación con alguien que ya no comparte ningún proyecto contigo.
 */
export default function NoEncontrado() {
  return (
    <NotFound
      href={'/chat'}
      hrefLabel={'Ir a mensajes'}
      descripcion="Esta conversación no existe o ya no tienes acceso a ella."
    />
  );
}
