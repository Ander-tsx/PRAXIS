import { Params } from 'nestjs-pino';

export const pinoConfig: Params = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',

    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
            },
          }
        : undefined,

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
      ],
      remove: true,
    },
  },
};