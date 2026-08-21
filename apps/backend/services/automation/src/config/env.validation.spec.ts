/// <reference types="jest" />

import { automationEnvValidationSchema } from './env.validation';

describe('configuración de automation-service', () => {
  it('acepta la configuración mínima con el puerto TCP 3008', () => {
    const { error, value } = automationEnvValidationSchema.validate({
      DATABASE_URL: 'postgresql://praxis:praxis123@localhost:5432/praxis?schema=automation',
      TCP_PORT: 3008,
    });

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      TCP_PORT: 3008,
      REDIS_URL: 'redis://localhost:6379',
      DOMAIN_EVENTS_STREAM: 'praxis:domain-events',
      DOMAIN_EVENTS_CONSUMER_GROUP: 'automation',
      DOMAIN_EVENTS_BATCH_SIZE: 100,
    });
  });

  it('rechaza una configuración que mueva el servicio fuera del puerto 3008', () => {
    const { error } = automationEnvValidationSchema.validate({
      DATABASE_URL: 'postgresql://praxis:praxis123@localhost:5432/praxis?schema=automation',
      TCP_PORT: 3009,
    });

    expect(error?.message).toContain('TCP_PORT');
  });

  it('rechaza un lote de consumidor fuera de los límites seguros', () => {
    const { error } = automationEnvValidationSchema.validate({
      DATABASE_URL: 'postgresql://praxis:praxis123@localhost:5432/praxis?schema=automation',
      TCP_PORT: 3008,
      DOMAIN_EVENTS_BATCH_SIZE: 0,
    });

    expect(error?.message).toContain('DOMAIN_EVENTS_BATCH_SIZE');
  });
});
