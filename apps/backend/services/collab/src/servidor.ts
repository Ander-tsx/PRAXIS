import { Database } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';
import { validarBillete } from './billete.js';
import { estadoAMarkdown, markdownAEstado } from './conversion.js';

/**
 * collab-service: el tiempo real de los documentos (E3 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Hocuspocus sobre WebSocket. El navegador conecta con un billete de un minuto
 * que firma el gateway después de comprobar el acceso. Aquí solo se valida.
 *
 * Carga y guarda a través de projects-service, como cualquier otro servicio:
 * ninguno toca la base de otro. **Quién le da el cliente** es lo que cambia:
 * `main.ts` crea uno TCP para desarrollo, y el monolito le pasa el suyo en
 * proceso (docs/PLAN-MONOLITO.md, M6). Por eso esto es una función y no un
 * módulo que arranca solo al importarse.
 */
export interface OpcionesDeCollab {
  puerto: number;
  /** El `JWT_SECRET` de la plataforma: firma los billetes. */
  secreto: string;
  proyectos: ClientProxy;
  /** Por defecto escucha en todas las interfaces; el monolito lo ata a loopback. */
  direccion?: string;
}

interface Contexto {
  userId: string | null;
  name: string;
}

export async function arrancarCollab({
  puerto,
  secreto,
  proyectos,
  direccion,
}: OpcionesDeCollab): Promise<Server<Contexto>> {
  if (!secreto) {
    throw new Error('Falta JWT_SECRET: sin él no se puede validar ningún billete.');
  }

  /** Quién escribió en cada documento desde el último guardado: firma la versión (E5). */
  const autores = new Map<string, Set<string>>();

  const servidor = new Server<Contexto>({
    port: puerto,
    ...(direccion ? { address: direccion } : {}),
    name: 'praxis-collab',
    /* Guardar con calma: dos segundos sin cambios, diez como mucho. Un
       documento vivo no es una escritura por tecla. */
    debounce: 2000,
    maxDebounce: 10_000,
    quiet: true,

    async onAuthenticate({ token, documentName, connectionConfig }) {
      const claims = validarBillete(token, documentName, secreto);
      /* Un billete de lectura no escribe, lo intente quien lo intente: se
         rechazan sus actualizaciones aquí, no en la interfaz. */
      if (claims.mode === 'read') connectionConfig.readOnly = true;
      return { userId: claims.sub, name: claims.name } satisfies Contexto;
    },

    async onChange({ documentName, context }) {
      if (!context?.userId) return;
      let quienes = autores.get(documentName);
      if (!quienes) {
        quienes = new Set();
        autores.set(documentName, quienes);
      }
      quienes.add(context.userId);
    },

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const guardado = await firstValueFrom(
            proyectos.send<{ yState: string | null; content: string }>(
              { cmd: 'document_collab_load' },
              { id: documentName },
            ),
          );
          if (guardado.yState) return new Uint8Array(Buffer.from(guardado.yState, 'base64'));
          /* Un documento de antes del tiempo real: se construye desde su Markdown. */
          return markdownAEstado(guardado.content);
        },

        async store({ documentName, document }) {
          const quienes = [...(autores.get(documentName) ?? [])];
          autores.delete(documentName);
          await firstValueFrom(
            proyectos.send(
              { cmd: 'document_collab_store' },
              {
                id: documentName,
                yState: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64'),
                content: estadoAMarkdown(document),
                userIds: quienes,
              },
            ),
          );
        },
      }),
    ],
  });

  await servidor.listen();
  return servidor;
}
