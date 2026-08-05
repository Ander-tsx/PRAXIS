import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Crea la estructura de carpetas para los logs de un servicio.
 *
 * Estructura resultante:
 *   logs/<serviceName>/
 *     ├── debug.log
 *     ├── info.log
 *     ├── warn.log
 *     └── error.log
 *
 * @param serviceName Nombre del servicio (ej: 'gateway', 'credentials')
 * @returns La ruta absoluta al directorio de logs del servicio
 */
export function ensureLogDirs(serviceName: string): string {
  const baseDir = resolve(process.cwd(), 'logs', serviceName);
  mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

/**
 * Devuelve la ruta completa al archivo de log de un nivel específico.
 */
export function getLogFilePath(serviceName: string, level: string): string {
  const baseDir = ensureLogDirs(serviceName);
  return join(baseDir, `${level}.log`);
}
