import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `/sw.js`: el service worker, **generado en el build** con su versión dentro.
 *
 * El código vive en `src/service-worker/sw.js` (no en `public/`, que se
 * serviría tal cual y sin versión). Aquí se le antepone `const VERSION`, de
 * modo que cada build produce un script con bytes distintos: es lo que hace
 * que el navegador detecte una versión nueva sin depender de la URL. Ver
 * «Versiones» en el propio `sw.js` y D6 de `docs/PLAN-MOVIL.md`.
 *
 * `force-static`: se genera una vez al compilar. El archivo se lee entonces,
 * así que en ejecución no hace falta que `src/` exista.
 */
export const dynamic = 'force-static';

const FUENTE = readFileSync(path.join(process.cwd(), 'src/service-worker/sw.js'), 'utf8');
const VERSION = process.env.NEXT_PUBLIC_VERSION_APP ?? 'dev';

export function GET() {
  return new Response(`const VERSION = ${JSON.stringify(VERSION)};\n${FUENTE}`, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
