/// <reference types="jest" />

import { RpcException } from '@nestjs/microservices';
import { AlexaAuthService } from './alexa-auth.service';

/**
 * El límite de intentos del canje de frase.
 *
 * ## Por qué esto es una prueba unitaria y no end-to-end
 *
 * El contador que de verdad limita va **por IP**, y una prueba de extremo a
 * extremo tendría que gastarlo entero desde la IP de la suite. La ventana es de
 * 600 s, así que a partir de ahí `12-voz` —que canjea frases de verdad— fallaría
 * con 429 durante diez minutos: una prueba que rompe a la de al lado y solo a
 * veces, según lo que se tarde en volver a ejecutar. Ese es exactamente el fallo
 * que ya se pagó una vez con el límite de `/auth/login`, y que obligó a poner una
 * espera de 61 segundos en `entrar()`.
 *
 * Aquí las dependencias son falsas, así que la regla se comprueba entera y sin
 * tocar ni Redis ni la base.
 *
 * ## Qué se comprueba
 *
 * Que **rotar un campo del cuerpo no reinicia el contador**. `alexaUserId` y
 * `deviceId` llegan en el cuerpo de la única ruta pública de la capa de voz, así
 * que un contador indexado solo por ellos no limita nada: se comprobó contra el
 * stack real, cuarenta peticiones rotando `alexaUserId` no producían ni un 429.
 */

/** Redis en memoria, con lo justo que usa el servicio. */
function redisFalso() {
  const almacén = new Map<string, unknown>();
  return {
    almacén,
    get: jest.fn(async (key: string) => almacén.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => {
      almacén.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      almacén.delete(key);
    }),
  };
}

/**
 * Prisma que no encuentra ninguna frase.
 *
 * Es lo que hace la prueba legible: toda frase es inválida, así que el único
 * motivo por el que una respuesta puede dejar de ser 400 es que haya saltado el
 * límite. No hace falta fabricar frases válidas para medir un contador.
 */
const prismaFalso = () =>
  ({
    alexaLinkCode: { findUnique: jest.fn(async () => null) },
  }) as never;

/**
 * Prisma con **una frase que sí vale**, para el canje que sale bien.
 *
 * Lleva lo justo del camino feliz: encontrar la frase, marcarla como canjeada,
 * revocar la sesión anterior y crear la nueva.
 */
const prismaConFraseVálida = () =>
  ({
    alexaLinkCode: {
      findUnique: jest.fn(async () => ({
        id: 'code-1',
        userId: 'user-1',
        redeemedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      })),
      update: jest.fn(async () => ({})),
    },
    alexaSession: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async () => ({})),
    },
  }) as never;

const configFalso = (valores: Record<string, number>) =>
  ({
    get: jest.fn((clave: string, porDefecto?: number) => valores[clave] ?? porDefecto),
  }) as never;

/** El código de un `RpcException`, que es lo que se acaba traduciendo a HTTP. */
function códigoDe(error: unknown): number | undefined {
  if (!(error instanceof RpcException)) return undefined;
  return (error.getError() as { statusCode?: number }).statusCode;
}

/** Canjea y devuelve el código, en vez de propagar. */
async function canjear(
  servicio: AlexaAuthService,
  dto: { alexaUserId: string; deviceId?: string; clientIp?: string },
): Promise<number | undefined> {
  try {
    await servicio.redeemSeedPhrase({ phrase: 'nube perla trigo zorro vela', ...dto });
    return 200;
  } catch (error) {
    return códigoDe(error);
  }
}

describe('límite de intentos del canje de frase', () => {
  const construir = (
    limites: { porAparato: number; porIp: number },
    prisma: ReturnType<typeof prismaFalso> = prismaFalso(),
  ) =>
    new AlexaAuthService(
      prisma,
      redisFalso() as never,
      configFalso({
        VOICE_REDEEM_MAX_ATTEMPTS: limites.porAparato,
        VOICE_REDEEM_MAX_ATTEMPTS_PER_IP: limites.porIp,
        VOICE_REDEEM_WINDOW_SECONDS: 600,
      }),
      { getUser: jest.fn(async () => ({ firstName: 'Ana', lastName: 'Ruiz' })) } as never,
    );

  it('con el mismo aparato salta al llegar al límite por aparato', async () => {
    const servicio = construir({ porAparato: 3, porIp: 100 });
    const códigos: (number | undefined)[] = [];

    for (let i = 0; i < 5; i++) {
      códigos.push(
        await canjear(servicio, {
          alexaUserId: 'amzn1.fijo',
          deviceId: 'd1',
          clientIp: '10.0.0.1',
        }),
      );
    }

    expect(códigos).toEqual([400, 400, 400, 429, 429]);
  });

  it('rotando alexaUserId sigue saltando: el contador por IP no se reinicia', async () => {
    const servicio = construir({ porAparato: 3, porIp: 5 });
    const códigos: (number | undefined)[] = [];

    /* Cada intento se presenta como un aparato distinto, que es justo lo que
       desactivaba el límite entero antes de que la IP entrara en la cuenta. */
    for (let i = 0; i < 8; i++) {
      códigos.push(
        await canjear(servicio, {
          alexaUserId: `amzn1.rota.${i}`,
          deviceId: `d${i}`,
          clientIp: '10.0.0.1',
        }),
      );
    }

    expect(códigos).toEqual([400, 400, 400, 400, 400, 429, 429, 429]);
  });

  it('y dos IPs distintas no se gastan el presupuesto la una a la otra', async () => {
    const servicio = construir({ porAparato: 100, porIp: 2 });

    await canjear(servicio, { alexaUserId: 'a', clientIp: '10.0.0.1' });
    await canjear(servicio, { alexaUserId: 'b', clientIp: '10.0.0.1' });

    /* La otra mitad. Un límite por IP que se comparte entre IPs es un límite
       global: el primero que abuse deja fuera a todo el mundo. */
    expect(await canjear(servicio, { alexaUserId: 'c', clientIp: '10.0.0.1' })).toBe(429);
    expect(await canjear(servicio, { alexaUserId: 'd', clientIp: '10.0.0.2' })).toBe(400);
  });

  it('acertar no gasta presupuesto: se cuentan los fallos, no las peticiones', async () => {
    /* El tope por IP es 3, y se canjean cinco frases **válidas** desde la misma
       IP. Con el contador midiendo peticiones, la cuarta daba 429.
       Es literalmente lo que tumbó diez pruebas de `12-voz`, que canjea frases
       buenas una detrás de otra: el número no era el problema, lo era qué se
       contaba. Vincular varios aparatos no puede parecerse a un ataque. */
    const servicio = construir({ porAparato: 3, porIp: 3 }, prismaConFraseVálida());
    const códigos: (number | undefined)[] = [];

    for (let i = 0; i < 5; i++) {
      códigos.push(
        await canjear(servicio, { alexaUserId: `amzn1.casa.${i}`, clientIp: '10.0.0.1' }),
      );
    }

    expect(códigos).toEqual([200, 200, 200, 200, 200]);
  });

  it('sin IP queda solo el límite por aparato, y se avisa', async () => {
    const servicio = construir({ porAparato: 2, porIp: 5 });
    const aviso = jest.spyOn((servicio as never as { logger: { warn: jest.Mock } }).logger, 'warn');

    /* Una llamada por TCP que no pase por el gateway no trae IP. No se rechaza
       —hoy no ocurre desde fuera— pero deja rastro: es la señal de que alguien
       está hablando con el microservicio por detrás. */
    expect(await canjear(servicio, { alexaUserId: 'sin-ip' })).toBe(400);
    expect(aviso).toHaveBeenCalled();

    await canjear(servicio, { alexaUserId: 'sin-ip' });
    expect(await canjear(servicio, { alexaUserId: 'sin-ip' })).toBe(429);
  });
});
