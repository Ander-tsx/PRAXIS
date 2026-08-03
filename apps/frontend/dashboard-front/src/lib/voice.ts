/**
 * Vinculación de la cuenta con **Praxis Voice**, la skill de Alexa.
 *
 * Las formas se declaran aquí y no se importan de `@praxis/contracts` por lo
 * mismo que `billing.ts`: ese paquete es de backend —arrastra `class-validator`
 * y los decoradores de Swagger— y esta pantalla solo necesita la forma.
 *
 * ## Cómo funciona la vinculación
 *
 * No hay «usuario y contraseña» por voz, y no puede haberlo: dictarle una
 * contraseña a un altavoz que está en el salón es exactamente lo que no se
 * quiere. En su lugar la app web genera una **frase semilla** de cinco palabras
 * comunes, el usuario se la dicta a Alexa, y la skill la canjea por un token de
 * voz de solo lectura.
 *
 * La frase **caduca a los cinco minutos y es de un solo uso**. Generar una nueva
 * invalida la anterior que siguiera sin canjear: el backend lo hace en el mismo
 * `generateSeedPhrase`, así que nunca hay dos vivas a la vez.
 */

/** Lo que devuelve `POST /api/alexa/link`. */
export interface VoiceSeedPhrase {
  /** Las palabras, separadas por espacios. Ya vienen sin acentos ni signos. */
  phrase: string;
  /** ISO 8601. Cuándo deja de servir. */
  expiresAt: string;
  /** Los mismos segundos, ya calculados por el backend. Hoy 300. */
  expiresInSeconds: number;
}

/**
 * Una sesión de voz viva, de `GET /api/alexa/links`.
 *
 * ⚠️ `alexaUserId` y `deviceId` son identificadores opacos de Amazon, no algo
 * que se pueda enseñar tal cual: son cadenas larguísimas que no significan nada
 * para quien las lee. La pantalla los usa solo para distinguir una entrada de
 * otra; lo que se enseña son las fechas.
 */
export interface VoiceLink {
  id: string;
  alexaUserId: string;
  deviceId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

/** ¿Sigue sirviendo esta vinculación? Ni revocada ni caducada. */
export function estaActiva(link: VoiceLink): boolean {
  if (link.revokedAt) return false;
  return new Date(link.expiresAt).getTime() > Date.now();
}

/**
 * «2026-08-03T21:57:40.952Z» → «3 de agosto de 2026».
 *
 * Devuelve `null` en vez de «Invalid Date» si la cadena no es una fecha: quien
 * llama decide qué poner, que casi siempre es no poner nada.
 */
export function formatoFecha(iso: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha);
}

/** `154` → `2:34`. Para la cuenta atrás de la frase. */
export function formatoCuentaAtras(segundos: number): string {
  const seguro = Math.max(0, Math.floor(segundos));
  const min = Math.floor(seguro / 60);
  const seg = seguro % 60;
  return `${min}:${String(seg).padStart(2, '0')}`;
}
