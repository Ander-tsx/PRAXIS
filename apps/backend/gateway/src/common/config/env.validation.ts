import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  HTTP_PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),

  JWT_SECRET: Joi.string().required(),

  // credentials-service (auth + users) — TCP 3001
  CREDENTIALS_SERVICE_HOST: Joi.string().default('localhost'),
  CREDENTIALS_SERVICE_PORT: Joi.number().default(3001),

  // roles-service — TCP 3002
  ROLES_SERVICE_HOST: Joi.string().default('localhost'),
  ROLES_SERVICE_PORT: Joi.number().default(3002),

  // projects-service — TCP 3003
  PROJECTS_SERVICE_HOST: Joi.string().default('localhost'),
  PROJECTS_SERVICE_PORT: Joi.number().default(3003),

  // tasks-service — TCP 3004
  TASKS_SERVICE_HOST: Joi.string().default('localhost'),
  TASKS_SERVICE_PORT: Joi.number().default(3004),
});

