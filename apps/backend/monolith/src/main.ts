import 'reflect-metadata';
import type { INestApplication, INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
/* Solo el tipo: el valor se carga con `require` después de componer el entorno. */
import type * as Transporte from '@praxis/local-transport';
import { componerEntorno, schemasEnUso } from './entorno.js';
import { quitarSondeoDeRedis } from './redis-sin-sondeo.js';

/**
 * El backend entero en un proceso (docs/PLAN-MONOLITO.md).
 *
 * Cada servicio conserva su `AppModule` y su contenedor de inyección; lo único
 * que cambia es que, en vez de escuchar en un puerto TCP, se registra en un bus
 * del proceso y los demás le hablan por ahí (`@praxis/local-transport`), con la
 * misma ida y vuelta por JSON que el socket.
 */

componerEntorno();

/*
 * Los `require` van **después** de componer el entorno, y cada uno justo detrás
 * de fijar su `TCP_PORT`: `ConfigModule.forRoot` valida `process.env` en el
 * momento de cargar el `app.module` —al evaluar el decorador— y se guarda esa
 * copia. `automation` exige `TCP_PORT` 3008 y `billing` 3009 con `.valid()`, así
 * que un solo valor para todos tumbaría a uno de los dos.
 */
const SERVICIOS = [
  { nombre: 'credentials', puerto: 3001 },
  { nombre: 'permissions', puerto: 3002 },
  { nombre: 'projects', puerto: 3003 },
  { nombre: 'tasks', puerto: 3004 },
  { nombre: 'reports', puerto: 3005 },
  { nombre: 'assistant', puerto: 3006 },
  { nombre: 'automation', puerto: 3008 },
  { nombre: 'billing', puerto: 3009 },
] as const;

async function arrancar(): Promise<void> {
  const { LocalClient, LocalServer } = require('@praxis/local-transport') as typeof Transporte;

  const servicios: { nombre: string; app: INestMicroservice }[] = [];
  for (const { nombre, puerto } of SERVICIOS) {
    process.env.TCP_PORT = String(puerto);
    const { AppModule } = require(`@praxis/${nombre}-service/dist/app.module`);
    const app = await NestFactory.createMicroservice(AppModule, {
      strategy: new LocalServer(nombre),
    });
    /* Sin `useGlobalPipes`: hoy el ValidationPipe de los servicios no se aplica
       a los mensajes TCP (nunca tuvieron `inheritAppConfig`), y activarlo aquí
       rompería llamadas que funcionan. Ver M5. */
    await app.listen();
    servicios.push({ nombre, app });
  }

  /* collab es ESM: se carga con un `import()` de verdad, que `module: node16`
     conserva en vez de convertirlo en `require`. No publica tipos. */
  const { arrancarCollab } = (await import('@praxis/collab-service/dist/servidor.js')) as {
    arrancarCollab: (opciones: {
      puerto: number;
      direccion?: string;
      secreto: string;
      proyectos: InstanceType<typeof LocalClient>;
    }) => Promise<{ destroy(): Promise<unknown> }>;
  };
  const collab = await arrancarCollab({
    puerto: Number(process.env.COLLAB_SERVICE_PORT),
    direccion: '127.0.0.1',
    secreto: process.env.JWT_SECRET ?? '',
    proyectos: new LocalClient({ servicio: 'projects' }),
  });

  const { arrancarGateway } = require('@praxis/gateway/dist/arranque') as {
    arrancarGateway: () => Promise<INestApplication>;
  };
  const gateway = await arrancarGateway();

  console.log(
    `[monolito] ${servicios.length} servicios, collab y gateway en un proceso · ${schemasEnUso()}`,
  );

  /* Sin esto, Redis sondea cada conexión cada 5 minutos y Railway no duerme el
     servicio nunca (docs/PLAN-MONOLITO.md, M-K). */
  await quitarSondeoDeRedis(process.env.REDIS_URL);

  /*
   * El apagado lo lleva el monolito, no cada contexto. `enableShutdownHooks` en
   * cada uno registraría diez manejadores de SIGTERM, y el primero en saltar
   * cerraría su app y **re-lanzaría la señal al proceso** con las otras nueve a
   * medias. Aquí: primero deja de entrar tráfico, después los servicios en
   * orden inverso, y al final se sale.
   */
  let apagando = false;
  const apagar = async (senal: NodeJS.Signals) => {
    if (apagando) return;
    apagando = true;
    console.log(`[monolito] ${senal}: cerrando`);
    const conPlazo = setTimeout(() => process.exit(1), 10_000);
    try {
      await gateway.close();
      await collab.destroy();
      for (const { app } of [...servicios].reverse()) await app.close();
    } finally {
      clearTimeout(conPlazo);
      process.exit(0);
    }
  };
  process.once('SIGTERM', apagar);
  process.once('SIGINT', apagar);
}

arrancar().catch((error) => {
  console.error('[monolito] no arrancó:', error);
  process.exit(1);
});
