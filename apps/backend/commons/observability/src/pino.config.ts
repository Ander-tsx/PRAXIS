import { join, resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';

/**
 * Campos sensibles que se eliminan de todos los logs.
 * Nunca se registran tokens, contraseñas, cookies ni headers de autenticación.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'JWT_SECRET',
  'DATABASE_URL',
];

/**
 * Encuentra la raíz del monorepo buscando turbo.json hacia arriba.
 * Fallback: usa process.cwd().
 */
function findMonorepoRoot(): string {
  let dir = process.cwd();

  // Subir hasta 6 niveles buscando turbo.json (marcador del monorepo)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'turbo.json'))) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break; // llegamos al filesystem root
    dir = parent;
  }

  return process.cwd();
}

/**
 * Directorio raíz para los archivos de log.
 * Prioridad:
 *   1. Variable de entorno LOGS_DIR (ruta absoluta o relativa al cwd)
 *   2. <monorepo-root>/logs/
 *
 * Estructura final:
 *   logs/
 *   ├── gateway/
 *   │   ├── debug.log      ← solo en desarrollo
 *   │   ├── info.log
 *   │   ├── warn.log
 *   │   └── error.log
 *   ├── credentials-service/
 *   ├── permissions-service/
 *   ├── projects-service/
 *   └── tasks-service/
 */
function resolveLogsDir(): string {
  if (process.env.LOGS_DIR) {
    return resolve(process.env.LOGS_DIR);
  }
  return join(findMonorepoRoot(), 'logs');
}

/**
 * Crea los archivos-destino de pino para un servicio.
 * Cada nivel se escribe en un archivo independiente dentro de la carpeta del servicio.
 *
 * En producción: NO se genera el archivo debug.log (checklist #6).
 */
function buildFileTargets(serviceName: string): Array<{
  target: string;
  options: Record<string, unknown>;
  level: string;
}> {
  const serviceDir = join(resolveLogsDir(), serviceName);

  // Crear la estructura de carpetas si no existe
  if (!existsSync(serviceDir)) {
    mkdirSync(serviceDir, { recursive: true });
  }

  const isProduction = process.env.NODE_ENV === 'production';

  const levels = isProduction
    ? ['info', 'warn', 'error']          // En producción: sin debug
    : ['debug', 'info', 'warn', 'error']; // En desarrollo: todos los niveles

  return levels.map((level) => ({
    target: 'pino/file',
    options: {
      destination: join(serviceDir, `${level}.log`),
      mkdir: true,
    },
    level,
  }));
}

/**
 * Genera la configuración de pino para un servicio/gateway específico.
 *
 * @param serviceName — Nombre del servicio (ej: 'gateway', 'credentials-service').
 *                      Define la subcarpeta dentro de logs/.
 *
 * Checklist cubierto:
 *  ✅ 1. No imprime en terminal → solo archivos (en producción)
 *  ✅ 2. Usa pino (via nestjs-pino)
 *  ✅ 3. Niveles separados por archivo (debug.log, info.log, warn.log, error.log)
 *  ✅ 4. Redacta información sensible (tokens, passwords, DB URLs)
 *  ✅ 5. Estructura de carpetas por servicio (logs/<service>/)
 *  ✅ 6. Debug solo en desarrollo (producción no genera debug.log)
 */
export function createPinoConfig(serviceName: string): Record<string, any> {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredLevel = process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

  const fileTargets = buildFileTargets(serviceName);

  // En desarrollo: además de archivos, agregamos pino-pretty en la terminal
  // para facilitar el debugging. En producción: solo archivos.
  const targets = isProduction
    ? fileTargets
    : [
        ...fileTargets,
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
          },
          level: configuredLevel,
        },
      ];

  return {
    pinoHttp: {
      level: configuredLevel,

      transport: {
        targets,
      },

      // Metadatos base que se incluyen en cada línea de log
      base: {
        service: serviceName,
        pid: process.pid,
      },

      // Formato del timestamp ISO 8601
      timestamp: () => `,"time":"${new Date().toISOString()}"`,

      // Nunca loguear información sensible
      redact: {
        paths: REDACTED_PATHS,
        remove: true,
      },

      // Serializers personalizados para evitar filtrar data sensible
      serializers: {
        req(req: Record<string, unknown>) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            // No incluimos headers completos ni body para evitar leaks
          };
        },
        res(res: Record<string, unknown>) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
    },
  };
}
