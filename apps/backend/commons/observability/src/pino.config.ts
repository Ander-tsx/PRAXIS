import { Params } from 'nestjs-pino';
import { getLogFilePath } from './ensure-log-dirs';

/**
 * Opciones para configurar el logger de un servicio.
 */
export interface LoggerOptions {
  /** Nombre del servicio (ej: 'gateway', 'credentials'). Determina la carpeta de logs. */
  serviceName: string;
}

/**
 * Campos sensibles que se eliminan de los logs para no exponer información privada.
 * Incluye headers de autorización, cookies, contraseñas, tokens, etc.
 */
const SENSITIVE_FIELDS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'creditCard',
  'ssn',
];

/**
 * Genera la configuración de Pino para un servicio específico.
 *
 * - En **desarrollo**: los logs de debug se escriben a archivo. Nivel mínimo = 'debug'.
 * - En **producción**: los logs de debug NO se generan. Nivel mínimo = 'info'.
 * - Cada nivel (debug, info, warn, error) se escribe en su propio archivo
 *   dentro de `logs/<serviceName>/`.
 * - Información sensible se redacta automáticamente.
 *
 * @param options Configuración del logger, incluyendo el nombre del servicio.
 * @returns Configuración para nestjs-pino (Params).
 */
export function createPinoConfig(options: LoggerOptions): Params {
  const { serviceName } = options;
  const isProduction = process.env.NODE_ENV === 'production';
  const minLevel = isProduction ? 'info' : (process.env.LOG_LEVEL ?? 'debug');

  // Mapeo numérico de niveles de pino
  const levelValues: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  };

  // Niveles a los que se les crea archivo
  const fileLevels = isProduction
    ? ['info', 'warn', 'error']
    : ['debug', 'info', 'warn', 'error'];

  // Construir los targets de transporte: un archivo por nivel
  const targets = fileLevels.map((level) => ({
    target: 'pino/file',
    level,
    options: {
      destination: getLogFilePath(serviceName, level),
      mkdir: true,
    },
  }));

  return {
    pinoHttp: {
      level: minLevel,

      // Usar transporte multi-destino para separar niveles en archivos distintos
      transport: {
        targets,
      },

      // Redactar campos sensibles para no exponer información privada
      redact: {
        paths: SENSITIVE_FIELDS,
        remove: true,
      },

      // Añadir nombre del servicio como campo base en cada log
      base: {
        service: serviceName,
      },

      // Serializar requests y responses de forma segura
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          // No incluir headers completos ni body para evitar filtrar datos sensibles
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  };
}
