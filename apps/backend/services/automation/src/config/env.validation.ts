import * as Joi from 'joi';

export const automationEnvValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  DOMAIN_EVENTS_STREAM: Joi.string().default('praxis:domain-events'),
  DOMAIN_EVENTS_CONSUMER_GROUP: Joi.string().default('automation'),
  DOMAIN_EVENTS_CONSUMER_NAME: Joi.string().optional(),
  DOMAIN_EVENTS_BATCH_SIZE: Joi.number().integer().min(1).max(500).default(100),
  DOMAIN_EVENTS_POLL_INTERVAL_MS: Joi.number().integer().min(100).max(60000).default(1000),
  DOMAIN_EVENTS_CLAIM_IDLE_MS: Joi.number().integer().min(1000).max(3600000).default(30000),
  TCP_PORT: Joi.number().valid(3008).required(),
  PROJECTS_SERVICE_HOST: Joi.string().default('localhost'),
  PROJECTS_SERVICE_PORT: Joi.number().default(3003),
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
});
