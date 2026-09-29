import 'reflect-metadata';
import 'dotenv/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { arrancarCollab } from './servidor.js';

/**
 * collab-service suelto, para desarrollo: lee su `.env` y habla con
 * projects-service por TCP. En producción lo arranca el monolito llamando a
 * `arrancarCollab` con un cliente en proceso.
 */
const puerto = Number(process.env.COLLAB_PORT ?? 3010);

const proyectos = ClientProxyFactory.create({
  transport: Transport.TCP,
  options: {
    host: process.env.PROJECTS_SERVICE_HOST ?? 'localhost',
    port: Number(process.env.PROJECTS_SERVICE_PORT ?? 3003),
  },
});

await arrancarCollab({ puerto, secreto: process.env.JWT_SECRET ?? '', proyectos });
console.log(`[collab] Tiempo real de documentos en ws://localhost:${puerto}`);
