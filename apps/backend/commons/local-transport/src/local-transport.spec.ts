import 'reflect-metadata';
import { Controller, type INestMicroservice, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  type ClientProxy,
  ClientProxyFactory,
  MessagePattern,
  Payload,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { firstValueFrom, lastValueFrom, of, toArray } from 'rxjs';
import { LocalClient } from './local.client';
import { LocalServer } from './local.server';

/*
 * La prueba que importa: el mismo controlador servido por TCP de verdad y por el
 * transporte en proceso tiene que dar **el mismo resultado**, caso a caso. No se
 * comprueba contra lo que creemos que hace TCP, sino contra TCP.
 */

let ultimoRecibido: any;
const estadoDelServidor = { lista: [1, 2, 3] };

@Controller()
class EcoController {
  @MessagePattern({ cmd: 'eco' })
  eco(@Payload() data: unknown) {
    ultimoRecibido = data;
    return data;
  }

  @MessagePattern({ cmd: 'fecha' })
  fecha() {
    return { cuando: new Date('2026-09-29T10:00:00.000Z'), nada: undefined };
  }

  @MessagePattern({ cmd: 'mutar' })
  mutar(@Payload() data: { lista: number[] }) {
    data.lista.push(99);
    return { ok: true };
  }

  @MessagePattern({ cmd: 'estado' })
  estado() {
    return estadoDelServidor;
  }

  @MessagePattern({ cmd: 'no-encontrado' })
  noEncontrado() {
    throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
  }

  @MessagePattern({ cmd: 'revienta' })
  revienta() {
    throw new Error('algo interno');
  }

  @MessagePattern({ cmd: 'varios' })
  varios() {
    return of(1, 2, 3);
  }

  @MessagePattern({ cmd: 'promesa' })
  async promesa(@Payload() data: { n: number }) {
    await new Promise((r) => setTimeout(r, 5));
    return data.n * 2;
  }

  @MessagePattern({ cmd: 'vacio' })
  vacio() {
    return undefined;
  }
}

@Module({ controllers: [EcoController] })
class EcoModule {}

const PUERTO = 39_000 + Math.floor(Math.random() * 1000);

type Montaje = { nombre: string; app: INestMicroservice; cliente: ClientProxy };
const montajes: Montaje[] = [];

beforeAll(async () => {
  const tcp = await NestFactory.createMicroservice(EcoModule, {
    transport: Transport.TCP,
    options: { host: '127.0.0.1', port: PUERTO },
    logger: false,
  });
  await tcp.listen();
  montajes.push({
    nombre: 'tcp',
    app: tcp,
    cliente: ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: PUERTO },
    }),
  });

  const local = await NestFactory.createMicroservice(EcoModule, {
    strategy: new LocalServer('eco'),
    logger: false,
  });
  await local.listen();
  montajes.push({
    nombre: 'local',
    app: local,
    cliente: ClientProxyFactory.create({ customClass: LocalClient, options: { servicio: 'eco' } }),
  });
});

afterAll(async () => {
  for (const m of montajes) {
    m.cliente.close();
    await m.app.close();
  }
});

async function enLosDos<T>(prueba: (cliente: ClientProxy) => Promise<T>): Promise<[T, T]> {
  const [tcp, local] = montajes;
  return [await prueba(tcp.cliente), await prueba(local.cliente)];
}

async function errorDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('se esperaba un error');
}

describe('transporte en proceso frente a TCP', () => {
  it('una fecha llega como cadena y undefined desaparece', async () => {
    const [tcp, local] = await enLosDos((c) => firstValueFrom(c.send({ cmd: 'fecha' }, {})));
    expect(local).toEqual(tcp);
    expect(local).toEqual({ cuando: '2026-09-29T10:00:00.000Z' });
    expect('nada' in (local as object)).toBe(false);
  });

  it('lo que se manda llega copiado, no compartido', async () => {
    const enviado = { lista: [1, 2], cuando: new Date('2026-01-01T00:00:00.000Z') };
    const [tcp, local] = await enLosDos(async (c) => {
      await firstValueFrom(c.send({ cmd: 'mutar' }, enviado));
      return structuredClone(enviado.lista);
    });
    expect(local).toEqual(tcp);
    expect(enviado.lista).toEqual([1, 2]);

    await firstValueFrom(montajes[1].cliente.send({ cmd: 'eco' }, enviado));
    expect(ultimoRecibido).not.toBe(enviado);
    expect(ultimoRecibido.cuando).toBe('2026-01-01T00:00:00.000Z');
  });

  it('lo que se devuelve también llega copiado', async () => {
    const [, local] = await enLosDos((c) => firstValueFrom(c.send({ cmd: 'estado' }, {})));
    (local as { lista: number[] }).lista.push(4);
    expect(estadoDelServidor.lista).toEqual([1, 2, 3]);
  });

  it('una RpcException llega con la misma forma', async () => {
    const [tcp, local] = await enLosDos((c) =>
      errorDe(firstValueFrom(c.send({ cmd: 'no-encontrado' }, {}))),
    );
    expect(local).toEqual(tcp);
    expect(local).toMatchObject({ statusCode: 404, message: 'Proyecto no encontrado' });
  });

  it('un Error cualquiera llega igual de opaco', async () => {
    const [tcp, local] = await enLosDos((c) =>
      errorDe(firstValueFrom(c.send({ cmd: 'revienta' }, {}))),
    );
    expect(local).toEqual(tcp);
  });

  it('un Observable de varios valores llega entero y en orden', async () => {
    const [tcp, local] = await enLosDos((c) =>
      lastValueFrom(c.send({ cmd: 'varios' }, {}).pipe(toArray())),
    );
    expect(local).toEqual(tcp);
    expect(local).toEqual([1, 2, 3]);
  });

  it('una promesa se espera', async () => {
    const [tcp, local] = await enLosDos((c) =>
      firstValueFrom(c.send({ cmd: 'promesa' }, { n: 21 })),
    );
    expect(local).toEqual(tcp);
    expect(local).toBe(42);
  });

  it('un manejador que no devuelve nada completa sin valor', async () => {
    const [tcp, local] = await enLosDos((c) =>
      lastValueFrom(c.send({ cmd: 'vacio' }, {}).pipe(toArray())),
    );
    expect(local).toEqual(tcp);
  });

  it('un patrón que no existe da el mismo error', async () => {
    const [tcp, local] = await enLosDos((c) =>
      errorDe(firstValueFrom(c.send({ cmd: 'no-existe' }, {}))),
    );
    expect(local).toEqual(tcp);
  });

  it('nunca responde en el mismo tick', async () => {
    let respondido = false;
    const sub = montajes[1].cliente.send({ cmd: 'eco' }, { a: 1 }).subscribe(() => {
      respondido = true;
    });
    expect(respondido).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(respondido).toBe(true);
    sub.unsubscribe();
  });

  it('un servicio que no está registrado falla, no se cuelga', async () => {
    const huerfano = ClientProxyFactory.create({
      customClass: LocalClient,
      options: { servicio: 'nadie' },
    });
    const error = await errorDe(firstValueFrom(huerfano.send({ cmd: 'eco' }, {})));
    expect(error).toMatchObject({ status: 'error' });
  });
});
