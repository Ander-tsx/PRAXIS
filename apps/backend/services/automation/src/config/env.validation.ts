import * as Joi from 'joi';

export const automationEnvValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  TCP_PORT: Joi.number().valid(3008).required(),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
});
