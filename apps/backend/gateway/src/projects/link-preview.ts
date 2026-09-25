import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * Leer una página ajena para sacar su título e imagen (E7 de
 * `docs/PLAN-DOCUMENTOS.md`), **sin abrir un SSRF**.
 *
 * El peligro: el gateway vive dentro de la red, así que un «enlace» a
 * `http://169.254.169.254/` o a `http://localhost:3003` le haría leer cosas que
 * ningún usuario debería ver. Las defensas:
 *
 * - Solo `http:` y `https:`, puertos 80/443.
 * - **La IP se comprueba al conectar**, en el `lookup` del socket, y no en una
 *   resolución previa: si se resolviera antes, un DNS que cambia entre la
 *   comprobación y la conexión (rebinding) colaría una IP interna.
 * - Cada redirección vuelve a pasar por lo mismo; como mucho tres.
 * - 4 s y 512 KB como mucho, y solo HTML.
 */

const bloqueadas = new BlockList();
for (const [red, prefijo] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  bloqueadas.addSubnet(red, prefijo, 'ipv4');
}
for (const [red, prefijo] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  bloqueadas.addSubnet(red, prefijo, 'ipv6');
}

export function esDireccionPublica(ip: string): boolean {
  const version = isIP(ip);
  if (version === 0) return false;
  if (version === 6 && ip.toLowerCase().startsWith('::ffff:')) {
    return esDireccionPublica(ip.slice(7));
  }
  return !bloqueadas.check(ip, version === 4 ? 'ipv4' : 'ipv6');
}

/** El `lookup` del socket: resuelve y rechaza si alguna dirección no es pública. */
const lookupSeguro: typeof dnsLookup = ((
  hostname: string,
  options: object,
  callback: (error: Error | null, address: string, family: number) => void,
) => {
  dnsLookup(hostname, { ...options, all: false }, (error, address, family) => {
    if (error) return callback(error, '', 0);
    if (!esDireccionPublica(address as string)) {
      return callback(new Error('Dirección no permitida'), '', 0);
    }
    callback(null, address as string, family as number);
  });
}) as typeof dnsLookup;

export interface VistaPrevia {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const MAX_BYTES = 512 * 1024;
const TIEMPO_MS = 4000;

function pedir(url: URL): Promise<{ status: number; location?: string; html?: string }> {
  return new Promise((resolve, reject) => {
    const cliente = url.protocol === 'https:' ? https : http;
    const peticion = cliente.request(
      url,
      {
        method: 'GET',
        lookup: lookupSeguro,
        timeout: TIEMPO_MS,
        headers: {
          'user-agent': 'PraxisBot/1.0 (+vista previa de enlaces)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'es,en;q=0.8',
        },
      },
      (respuesta) => {
        const status = respuesta.statusCode ?? 0;
        if (status >= 300 && status < 400 && respuesta.headers.location) {
          respuesta.resume();
          return resolve({ status, location: respuesta.headers.location });
        }
        const tipo = String(respuesta.headers['content-type'] ?? '');
        if (status !== 200 || !tipo.includes('html')) {
          respuesta.resume();
          return resolve({ status });
        }
        let recibidos = 0;
        const trozos: Buffer[] = [];
        respuesta.on('data', (trozo: Buffer) => {
          recibidos += trozo.length;
          if (recibidos > MAX_BYTES) {
            respuesta.destroy();
            return;
          }
          trozos.push(trozo);
        });
        respuesta.on('close', () =>
          resolve({ status, html: Buffer.concat(trozos).toString('utf8') }),
        );
      },
    );
    peticion.on('timeout', () => peticion.destroy(new Error('Tiempo agotado')));
    peticion.on('error', reject);
    peticion.end();
  });
}

function puertoPermitido(url: URL) {
  return url.port === '' || url.port === '80' || url.port === '443';
}

/** Descodifica las entidades HTML que aparecen en títulos de verdad. */
function texto(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const limpio = valor
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
  return limpio ? limpio.slice(0, 300) : null;
}

function meta(html: string, ...nombres: string[]): string | null {
  for (const nombre of nombres) {
    const patrones = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${nombre}["'][^>]*content=["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nombre}["']`,
        'i',
      ),
    ];
    for (const patron of patrones) {
      const hallado = html.match(patron)?.[1];
      if (hallado) return hallado;
    }
  }
  return null;
}

export async function leerVistaPrevia(entrada: string): Promise<VistaPrevia | null> {
  let url: URL;
  try {
    url = new URL(entrada);
  } catch {
    return null;
  }

  for (let salto = 0; salto <= 3; salto++) {
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !puertoPermitido(url)) {
      return null;
    }
    /* Una IP literal no pasa por el `lookup`: se comprueba aquí. */
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !esDireccionPublica(host)) return null;

    const respuesta = await pedir(url).catch(() => null);
    if (!respuesta) return null;
    if (respuesta.location) {
      url = new URL(respuesta.location, url);
      continue;
    }
    if (!respuesta.html) return null;

    const html = respuesta.html;
    const imagen = meta(html, 'og:image', 'twitter:image');
    let imagenAbsoluta: string | null = null;
    if (imagen) {
      try {
        const u = new URL(texto(imagen) ?? '', url);
        if (u.protocol === 'https:' || u.protocol === 'http:') imagenAbsoluta = u.toString();
      } catch {
        imagenAbsoluta = null;
      }
    }
    return {
      url: url.toString(),
      title: texto(meta(html, 'og:title', 'twitter:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]),
      description: texto(meta(html, 'og:description', 'twitter:description', 'description')),
      image: imagenAbsoluta,
      siteName: texto(meta(html, 'og:site_name')) ?? url.hostname.replace(/^www\./, ''),
    };
  }
  return null;
}
