import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  HTTP_PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),

  JWT_SECRET: Joi.string().required(),

  /**
   * Cuántos intermediarios nuestros hay delante del gateway.
   *
   * Solo lo usa el limitador de peticiones, y **solo para lo que no lleva
   * sesión** —el login y el registro—: todo lo demás se cuenta por cuenta (ver
   * `IdentityThrottlerGuard`).
   *
   * ⚠️ Por defecto **cero, que significa «no te creas `x-forwarded-for`»**. Esa
   * cabecera la escribe quien quiera, así que darla por buena sin saber cuántos
   * saltos son de fiar convierte el límite por IP en decorativo: basta con
   * cambiarla en cada intento para tener intentos infinitos contra bcrypt.
   *
   * En despliegue se pone el número real de saltos (con un balanceador delante,
   * `1`). En local no hay ninguno y el valor correcto es el de por defecto.
   */
  TRUSTED_PROXY_HOPS: Joi.number().min(0).default(0),

  /**
   * Cuántos flujos SSE puede tener abiertos una misma cuenta a la vez.
   *
   * Cada uno es un socket sostenido, un `Subject` en memoria y un latido cada
   * 25 s indefinidamente; sin tope, cien pestañas son cien conexiones. Ver
   * `NotificationsStreamService.hayCupo`.
   *
   * El 10 por defecto sale de lo que hace una persona de verdad: una pestaña
   * por zona abierta y alguna repetida. Desde que el chat tiene zona propia,
   * cruzar entre el panel y los mensajes puede solapar dos brevemente, así que
   * apretarlo a 3 o 4 daría falsos positivos.
   */
  SSE_MAX_CONEXIONES_POR_CUENTA: Joi.number().min(1).default(10),

  // credentials-service (auth + users) — TCP 3001
  CREDENTIALS_SERVICE_HOST: Joi.string().default('localhost'),
  CREDENTIALS_SERVICE_PORT: Joi.number().default(3001),

  // permissions-service — TCP 3002
  PERMISSIONS_SERVICE_HOST: Joi.string().default('localhost'),
  PERMISSIONS_SERVICE_PORT: Joi.number().default(3002),

  // projects-service — TCP 3003
  PROJECTS_SERVICE_HOST: Joi.string().default('localhost'),
  PROJECTS_SERVICE_PORT: Joi.number().default(3003),

  // tasks-service — TCP 3004
  TASKS_SERVICE_HOST: Joi.string().default('localhost'),
  TASKS_SERVICE_PORT: Joi.number().default(3004),

  // assistant-service — TCP 3006
  //
  // ⚠️ La clave de Gemini NO va aquí: vive solo en el .env de assistant-service.
  // El gateway sigue siendo un router y no habla con ningún tercero.
  ASSISTANT_SERVICE_HOST: Joi.string().default('localhost'),
  ASSISTANT_SERVICE_PORT: Joi.number().default(3006),

  // automation-service — TCP 3008. El cliente no se usa hasta bloques posteriores.
  AUTOMATION_SERVICE_HOST: Joi.string().default('localhost'),
  AUTOMATION_SERVICE_PORT: Joi.number().default(3008),

  // billing-service — TCP 3009. Quién paga, qué plan y qué da ese plan.
  BILLING_SERVICE_HOST: Joi.string().default('localhost'),
  BILLING_SERVICE_PORT: Joi.number().default(3009),

  /**
   * Stripe. Las tres **opcionales**, y a propósito.
   *
   * ⚠️ Marcarlas obligatorias dejaría el gateway sin arrancar en cualquier
   * entorno sin cuenta de Stripe: el de cada persona del equipo y el de CI. Con
   * esto, la facturación se apaga sola, `StripeService` lo avisa una vez al
   * arrancar y los endpoints de pago responden 503 con un mensaje claro. Es la
   * misma decisión que ya toma `MAIL_API_KEY` en credentials-service.
   *
   * ⚠️ Esta es la **única** excepción a que el gateway no hable con terceros —la
   * clave de Gemini vive solo en assistant-service, ver la nota de arriba—, y
   * no hay alternativa: el webhook de Stripe necesita una URL pública, y la
   * única superficie pública que tiene el sistema es el gateway.
   */
  STRIPE_SECRET_KEY: Joi.string().optional().allow(''),
  /**
   * Un precio recurrente por plan de pago, `price_...`.
   *
   * ⚠️ **Cada uno que falte apaga solo su plan**, no el cobro entero: la
   * pantalla de precios pregunta cuáles se pueden contratar y no ofrece los
   * demás. Así se puede desplegar un peldaño antes que el siguiente sin dejar un
   * botón que responde 503 al pulsarlo.
   */
  STRIPE_PRICE_PRO: Joi.string().optional().allow(''),
  /**
   * Kyloo Accounts como servidor de autorización del MCP (docs/PLAN-OAUTH-KYLOO.md).
   * Sin `KYLOO_ISSUER` el MCP solo admite tokens personales, y las rutas internas
   * que llama Accounts responden 503. Las tres juntas o ninguna.
   */
  KYLOO_ISSUER: Joi.string()
    .uri()
    .when('AUTH_MODE', {
      is: 'kyloo',
      // biome-ignore lint/suspicious/noThenProperty: `then` es la API de Joi.
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  /**
   * Cómo se autentica la gente (docs/PLAN-AUTH-KYLOO.md). `local`: contraseña y Google de siempre.
   * `kyloo`: Kyloo Accounts es la única puerta y las rutas propias responden 403 `AUTH_DELEGATED`.
   */
  AUTH_MODE: Joi.string().valid('local', 'kyloo').default('local'),
  /** La dirección pública del MCP, que es el `aud` de los tokens OAuth. */
  MCP_RESOURCE_URL: Joi.string().uri().optional().allow(''),
  /** Secreto compartido con Accounts para firmar sus llamadas internas (HMAC). 32+ caracteres. */
  KYLOO_INTERNAL_SECRET: Joi.string().min(32).optional().allow(''),
  STRIPE_PRICE_TEAM: Joi.string().optional().allow(''),
  STRIPE_PRICE_BUSINESS: Joi.string().optional().allow(''),
  /**
   * El secreto con el que se firma el webhook, `whsec_...`.
   *
   * Sin él, el manejador rechaza **todo**: es la única autenticación que tiene
   * ese endpoint, y aceptarlo sin firma sería regalar cualquier plan de pago a
   * quien supiera hacer un `curl`.
   */
  STRIPE_WEBHOOK_SECRET: Joi.string().optional().allow(''),

  /**
   * La base de las URLs de vuelta del pago.
   *
   * La misma variable que ya usan los enlaces de los correos. Sin ella, Stripe
   * devolvería el navegador a `localhost` desde producción.
   */
  PUBLIC_APP_URL: Joi.string().optional().allow(''),
  /** Dónde conecta el navegador al tiempo real de los documentos (`wss://` en producción). */
  COLLAB_PUBLIC_URL: Joi.string().optional().allow(''),
});
