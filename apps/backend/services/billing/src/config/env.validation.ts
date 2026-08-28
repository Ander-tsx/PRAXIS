import * as Joi from 'joi';

/**
 * ⚠️ **Ni un solo `*_SERVICE_HOST`, y es la decisión de diseño del servicio.**
 *
 * billing-service **no habla con nadie**. No pregunta cuántos proyectos tienes
 * ni cuántos miembros hay en un tablero: contesta *qué plan tienes y qué da ese
 * plan*, y quien cuenta y quien niega es el gateway, que ya tiene delante los
 * clientes de projects, tasks y assistant.
 *
 * Repartirlo al revés —que billing contase— habría metido aquí un cliente TCP
 * por cada cosa medible, y cada cuota nueva sería una dependencia nueva de un
 * servicio que solo tiene que saber quién paga.
 */
export const billingEnvValidationSchema = Joi.object({
  /* La caché de lecturas. Opcional: sin ella cada lectura va a Postgres y todo
     sigue funcionando más despacio, que es como falla una caché bien puesta. */
  REDIS_URL: Joi.string().optional().allow(''),
  DATABASE_URL: Joi.string().required(),
  /**
   * ⚠️ **3009, y `valid()` en vez de un `default`.** Mismo patrón que los otros
   * ocho: un puerto equivocado no da un error claro —el servicio arranca, el
   * gateway le habla a otro y las respuestas salen vacías o con
   * `BAD_GATEWAY`— así que se prefiere que no arranque. La lista de verdad está
   * en `scripts/dev-cli/config/services.mjs`.
   */
  TCP_PORT: Joi.number().valid(3009).required(),
  /** Cuánto vive una invitación. Una semana por defecto. */
  INVITE_TTL_HOURS: Joi.number().integer().min(1).max(720).default(168),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
});
