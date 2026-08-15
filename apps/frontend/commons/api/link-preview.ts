/**
 * Preview de enlaces (unfurl).
 *
 * Toma una URL de un mensaje del chat, la pide por HTTP y saca el título, la
 * descripción y la imagen de los metadatos Open Graph —o del `<title>` si no
 * hay OG—. Devuelve `null` cuando no se puede (web sin metadatos, error,
 * contenido que no es HTML).
 *
 * ⚠️ **Es código de servidor.** Hace un `fetch` a una URL arbitraria, así que
 * se importa SOLO desde server actions o route handlers — nunca desde el índice
 * raíz de commons ni desde un componente cliente, que no tienen ni `dns` ni
 * por qué abrir conexiones a terceros desde el navegador de la persona.
 *
 * 🔒 **El guard SSRF no es decorativo.** La persona que escribe un link no es
 * la única que puede leer: el servidor haría la petición, y una URL con
 * `localhost`, `169.254.x.x` o un rango privado podría alcanzar servicios que
 * no deberían estar expuestos —la base de datos, Redis, otros microservicios
 * del monorepo—. Por eso:
 *   1. Solo `http:`/`https:`.
 *   2. El hostname se resuelve con `dns.lookup` y se rechaza si **todas** las
 *      IPs caen en rango privado o de loopback.
 *   3. Se sigue la redirección manualmente y **cada** salto vuelve a pasar el
 *      guard: un host público que redirige a `http://10.0.0.1/` se corta.
 *   4. Timeout corto y límite de bytes leídos: es una vista previa, no una
 *      descarga.
 *
 * No se renderiza NADA de lo que devuelve como HTML: solo se extraen texto
 * (`title`/`description`) y una URL de imagen, y esa URL de imagen se abre en
 * un `<img>` nativo, que no ejecuta scripts.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
}

/** Hasta dónde se lee del cuerpo antes de rendirse: una preview, no una descarga. */
const MAX_BYTES = 256 * 1024;
/** Cuánto se espera a la respuesta y a los bytes. */
const TIMEOUT_MS = 5_000;
/** Saltos de redirección como mucho. */
const MAX_SALTOS = 5;

const ES_PRIVADA = (ip: string): boolean => {
  if (ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;
  if (isIP(ip) === 6) {
    /* IPv6 mapeada de IPv4 se evalúa como la IPv4 que contiene. */
    const v4 = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : null;
    return v4 ? ES_PRIVADA(v4) : true;
  }
  const partes = ip.split('.').map(Number);
  if (partes.length !== 4) return true;
  const a = partes[0] as number;
  const b = partes[1] as number;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

/** Resuelve el host y rechaza si no hay ni una IP pública a la que ir. */
async function validarHost(hostname: string): Promise<void> {
  const direcciones = await lookup(hostname, { all: true, verbatim: true });
  const publicas = direcciones.filter(({ address }) => !ES_PRIVADA(address));
  if (publicas.length === 0) {
    throw new Error(`el host ${hostname} no resuelve a una IP pública`);
  }
}

/** Vale solo `http` y `https`, y por la API del nodo no se le puede dar un protocolo raro. */
function nuevoUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
}

/** Extrae el primer meta Open Graph que pida, o el `<title>` como último recurso. */
function extraerMetadatos(html: string): { title?: string; description?: string; image?: string } {
  const meta = (propiedad: string): string | undefined => {
    const patron = new RegExp(
      `<meta[^>]+(?:property|name)=["']${propiedad}["'][^>]*content=["']([^"']*)["']`,
      'i',
    );
    const con = patron.exec(html);
    if (con) return (con[1] as string).trim();
    /* El orden propiedad→contenido puede venir invertido en la etiqueta. */
    const invertido = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propiedad}["']`,
      'i',
    ).exec(html);
    return invertido?.[1]?.trim() || undefined;
  };

  const title = meta('og:title') || /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) return {};
  const description = meta('og:description') || meta('description');
  const image = meta('og:image') || meta('og:image:secure_url');
  /* Construcción imperativa y no con spreads condicionales: la inferencia de
     un `...(... ? { description } : {})` sale con `description?: string | undefined`
     y choca con `exactOptionalPropertyTypes`. */
  const resultado: { title: string; description?: string; image?: string } = { title };
  if (description) resultado.description = description;
  if (image) resultado.image = image;
  return resultado;
}

async function pedir(raw: string, saltos: number): Promise<Response> {
  const url = nuevoUrl(raw);
  if (!url) throw new Error('URL no válida');
  await validarHost(url.hostname);

  const control = new AbortController();
  const plazo = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const respuesta = await fetch(url, {
      redirect: 'manual',
      signal: control.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PRAXIS link-preview)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    const status = respuesta.status;
    if (status >= 300 && status < 400) {
      if (saltos >= MAX_SALTOS) throw new Error('demasiadas redirecciones');
      const destino = respuesta.headers.get('location');
      if (!destino) throw new Error('redirección sin destino');
      /* La URL de la redirección se valida de nuevo — host, protocolo, todo. */
      return pedir(new URL(destino, url).toString(), saltos + 1);
    }

    if (!respuesta.ok || !(respuesta.headers.get('content-type') ?? '').includes('text/html')) {
      throw new Error('no es una página HTML');
    }

    const lector = respuesta.body?.getReader();
    if (!lector) throw new Error('sin cuerpo');
    const trozos: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await lector.read();
      if (done) break;
      const sobrante = MAX_BYTES - total;
      trozos.push(value.length <= sobrante ? value : value.slice(0, sobrante));
      total += Math.min(value.length, sobrante);
    }
    lector.cancel().catch(() => {});
    /* Los trozos van en un solo `Blob`: `new Blob(trozos)` falla con
       `Uint8Array<ArrayBufferLike>` bajo los tipos de Node 5.7+, así que se
       concatena y se entrega un solo `Uint8Array`. */
    const unidos = new Uint8Array(trozos.reduce((n, trozo) => n + trozo.length, 0));
    let posicion = 0;
    for (const trozo of trozos) {
      unidos.set(trozo, posicion);
      posicion += trozo.length;
    }
    return new Response(new Blob([unidos.buffer]), { status: 200 });
  } finally {
    clearTimeout(plazo);
  }
}

/**
 * Saca el preview de una URL, o `null` si no hay metadatos o no se pudo leer.
 * Nunca lanza: una preview que falla no debe romper un mensaje.
 */
export async function obtenerPreviewDeEnlace(raw: string): Promise<LinkPreview | null> {
  const url = nuevoUrl(raw);
  if (!url) return null;

  let respuesta: Response;
  try {
    respuesta = await pedir(raw, 0);
  } catch {
    return null;
  }

  try {
    const html = await respuesta.text();
    const { title, description, image } = extraerMetadatos(html);
    if (!title) return null;

    const previa: LinkPreview = { url: url.toString(), title };
    if (description && description.length <= 300) previa.description = description;
    if (image) {
      /* La imagen OG puede venir relativa o ser de otro esquema; solo se admite
         una URL http/https que además pase el guard — se valida igual que la
         página, porque el servidor es quien la lee. */
      const imgUrl = nuevoUrl(new URL(image, url).toString());
      if (imgUrl) {
        try {
          await validarHost(imgUrl.hostname);
          previa.image = imgUrl.toString();
        } catch {
          /* La imagen que no se puede validar se descarta; el resto del preview vive. */
        }
      }
    }
    return previa;
  } catch {
    return null;
  }
}
