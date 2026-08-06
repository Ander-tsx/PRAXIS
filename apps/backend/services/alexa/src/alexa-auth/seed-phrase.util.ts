import { randomInt } from 'node:crypto';
import { normalizeText } from '../common/text.util';

/**
 * Palabras cortas, comunes y fáciles de dictar y reconocer por voz en español.
 * Se evitan homófonas y palabras que Alexa suele transcribir mal.
 */
export const SEED_WORDS: readonly string[] = [
  'agua',
  'arbol',
  'arena',
  'barco',
  'brisa',
  'cable',
  'campo',
  'carta',
  'cielo',
  'clave',
  'cobre',
  'copa',
  'cuerda',
  'dedo',
  'diente',
  'disco',
  'faro',
  'fiesta',
  'flecha',
  'flor',
  'fresa',
  'fruta',
  'fuego',
  'globo',
  'grano',
  'hielo',
  'hierro',
  'hoja',
  'horno',
  'huevo',
  'humo',
  'isla',
  'jardin',
  'jugo',
  'lago',
  'lampara',
  'lapiz',
  'leche',
  'libro',
  'lluvia',
  'luna',
  'madera',
  'mano',
  'mapa',
  'marco',
  'mesa',
  'miel',
  'monte',
  'nieve',
  'nube',
  'nudo',
  'olivo',
  'onda',
  'oro',
  'pan',
  'papel',
  'pasto',
  'perla',
  'piedra',
  'pino',
  'planta',
  'playa',
  'pluma',
  'puente',
  'puerta',
  'queso',
  'rama',
  'reloj',
  'rio',
  'roca',
  'rueda',
  'sal',
  'selva',
  'sombra',
  'sopa',
  'techo',
  'tierra',
  'tinta',
  'torre',
  'trigo',
  'trueno',
  'uva',
  'vela',
  'ventana',
  'verde',
  'viento',
  'vidrio',
  'zorro',
];

/** Genera una frase memorizable tipo BIP-39 usando aleatoriedad criptográfica. */
export function generateSeedPhrase(words: number): string {
  const chosen: string[] = [];
  for (let i = 0; i < words; i += 1) {
    chosen.push(SEED_WORDS[randomInt(SEED_WORDS.length)]);
  }
  return chosen.join(' ');
}

/**
 * Canoniza lo que Alexa transcribió: sin acentos, sin signos, sin espacios dobles.
 * Así "Cielo, mesa, puente" y "cielo mesa puente" resuelven a la misma frase.
 */
export function canonicalizePhrase(phrase: string): string {
  return normalizeText(phrase)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}
