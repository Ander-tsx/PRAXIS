import 'reflect-metadata';
import 'dotenv/config';
import { Database } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import * as Y from 'yjs';
import { validarBillete } from './billete.js';
import { estadoAMarkdown, markdownAEstado } from './conversion.js';

/**
 * collab-service: el tiempo real de los documentos (E3 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Hocuspocus sobre WebSocket. El navegador conecta **directo**, sin pasar por
 * el proxy de Next —que no sabe de WebSockets—, con un billete de un minuto
 * que firma el gateway después de comprobar el acceso. Aquí solo se valida.
 *
 * Carga y guarda por TCP a través de projects-service, como cualquier otro
 * servicio: ninguno toca la base de otro.
 */

const puerto = Number(process.env.COLLAB_PORT ?? 3010);
const secreto = process.env.JWT_SECRET;
if (!secreto) {
  throw new Error('Falta JWT_SECRET: sin él no se puede validar ningún billete.');
}

const proyectos = ClientProxyFactory.create({
  transport: Transport.TCP,
  options: {
    host: process.env.PROJECTS_SERVICE_HOST ?? 'localhost',
    port: Number(process.env.PROJECTS_SERVICE_PORT ?? 3003),
  },
});

interface Contexto {
  userId: string | null;
  name: string;
}

/** Quién escribió en cada documento desde el último guardado: firma la versión (E5). */
const autores = new Map<string, Set<string>>();

const servidor = new Server<Contexto>({
  port: puerto,
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

servidor
  .listen()
  .then(() => console.log(`[collab] Tiempo real de documentos en ws://localhost:${puerto}`));
