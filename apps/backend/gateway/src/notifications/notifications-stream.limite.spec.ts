/// <reference types="jest" />

import { NotificationsStreamService } from './notifications-stream.service';

/**
 * El tope de flujos en vivo por cuenta (E6.3).
 *
 * ## Por qué existe el tope
 *
 * Cada flujo abierto es un socket sostenido contra el gateway, un `Subject` en
 * memoria y un latido cada 25 s **indefinidamente**. Sin tope, cien pestañas son
 * cien conexiones, y no hace falta mala fe para llegar ahí: basta con dejar el
 * portátil con sesiones abiertas. Es una denegación de servicio trivial contra
 * uno mismo y, compartiendo proceso, contra los demás.
 *
 * ## Por qué se prueba aquí y no por la API
 *
 * Llegar al tope por HTTP exige abrir once flujos SSE de verdad y mantenerlos
 * vivos, cada uno con su latido: una prueba lenta, frágil y que dejaría sockets
 * colgando si falla a medias. La regla, en cambio, es contar — y contar es lo
 * único que hay que acertar.
 *
 * ## Lo que se fija
 *
 * Que el cupo se **libera al cerrar**. Esa es la parte que un tope mal hecho
 * rompe: si la cuenta no baja al desconectar, el tope deja de ser un límite de
 * concurrencia y se convierte en un límite de por vida — a las diez pestañas
 * abiertas y cerradas de una jornada, esa cuenta se queda sin tiempo real hasta
 * que alguien reinicie el gateway, y el síntoma es «a mí no me llegan los
 * mensajes» sin un solo error en ninguna consola.
 */
describe('NotificationsStreamService — tope de conexiones', () => {
  const ALGUIEN = '11111111-1111-4111-8111-111111111111';
  const OTRA = '22222222-2222-4222-8222-222222222222';

  /**
   * El servicio con dobles inertes.
   *
   * `suscribir` toca dos cosas además de contar: la presencia (al abrir y al
   * cerrar) y **el suscriptor de Redis**, desde que cada persona tiene su propio
   * canal en vez de haber un patrón global (E6.8). Las dos se doblan con
   * promesas resueltas: lo que se prueba aquí es la contabilidad.
   *
   * ⚠️ El suscriptor se inyecta escribiendo el campo privado, que normalmente
   * rellena `onModuleInit`. La alternativa era llamar a `onModuleInit` y abrir
   * una conexión de verdad a Redis, que convertiría tres pruebas de aritmética
   * en una prueba de integración con un servicio externo.
   */
  function servicio(max: number): NotificationsStreamService {
    const presenciaInerte = {
      marcarVivo: () => Promise.resolve(),
      marcarIdo: () => Promise.resolve(),
      anunciar: () => Promise.resolve(),
      elegidaDe: () => Promise.resolve('AVAILABLE'),
      efectiva: () => 'AVAILABLE',
    } as never;

    const config = { get: () => max } as never;

    const instancia = new NotificationsStreamService(
      { send: () => undefined } as never,
      presenciaInerte,
      config,
    );

    (instancia as unknown as { suscriptor: unknown }).suscriptor = {
      subscribe: () => Promise.resolve(1),
      unsubscribe: () => Promise.resolve(0),
    };

    return instancia;
  }

  it('deja abrir hasta el tope y no más', () => {
    const servicioConTope = servicio(3);
    const abiertas: { unsubscribe: () => void }[] = [];

    for (let i = 0; i < 3; i++) {
      expect(servicioConTope.hayCupo(ALGUIEN)).toBe(true);
      abiertas.push(servicioConTope.suscribir(ALGUIEN).subscribe());
    }

    expect(servicioConTope.conexionesDe(ALGUIEN)).toBe(3);
    expect(servicioConTope.hayCupo(ALGUIEN)).toBe(false);

    for (const abierta of abiertas) abierta.unsubscribe();
  });

  it('el cupo se libera al cerrar', () => {
    const servicioConTope = servicio(2);

    const primera = servicioConTope.suscribir(ALGUIEN).subscribe();
    const segunda = servicioConTope.suscribir(ALGUIEN).subscribe();
    expect(servicioConTope.hayCupo(ALGUIEN)).toBe(false);

    primera.unsubscribe();

    /* Lo importante: cerrar devuelve el hueco. Sin esto el tope sería un límite
       de por vida en vez de uno de concurrencia. */
    expect(servicioConTope.hayCupo(ALGUIEN)).toBe(true);
    expect(servicioConTope.conexionesDe(ALGUIEN)).toBe(1);

    segunda.unsubscribe();
    expect(servicioConTope.conexionesDe(ALGUIEN)).toBe(0);
  });

  it('el tope es por cuenta: agotar una no afecta a otra', () => {
    const servicioConTope = servicio(1);

    const deAlguien = servicioConTope.suscribir(ALGUIEN).subscribe();
    expect(servicioConTope.hayCupo(ALGUIEN)).toBe(false);

    /* Si el tope fuera global —contar conexiones totales en vez de por cuenta—
       una sola persona con muchas pestañas dejaría sin tiempo real a toda la
       plataforma. Sería un fallo peor que el que el tope viene a arreglar. */
    expect(servicioConTope.hayCupo(OTRA)).toBe(true);

    deAlguien.unsubscribe();
  });
});

/**
 * Un canal de Redis por persona, no un patrón global (E6.8).
 *
 * ## Qué se cambió
 *
 * Esto era `psubscribe('avisos:*')`: **cada instancia del gateway recibía cada
 * evento de cada usuario** de la plataforma y descartaba los ajenos. Funcionaba,
 * y por eso duró — el descarte es una búsqueda en un `Map` y no se nota con poca
 * gente. Lo que no se ve mirando una instancia es que el tráfico de pub/sub se
 * multiplica por el número de instancias: es un techo de escalado, no un fallo.
 *
 * ## Por qué esto merece prueba
 *
 * Porque las dos formas de equivocarse son **mudas**:
 *
 * - Suscribirse en cada pestaña en vez de solo en la primera parece inofensivo
 *   —`SUBSCRIBE` al mismo canal no acumula— hasta que se cierra **una** pestaña
 *   de las varias abiertas: el `UNSUBSCRIBE` correspondiente deja sordas a las
 *   demás, que siguen abiertas y sin recibir nada.
 * - No cancelar al cerrar la última devuelve poco a poco al problema original:
 *   el gateway acaba suscrito a todo el que haya entrado desde que arrancó.
 *
 * Ninguna de las dos da un error. Las dos salen como «a veces no me llegan los
 * mensajes».
 */
describe('NotificationsStreamService — un canal por persona', () => {
  const ALGUIEN = '11111111-1111-4111-8111-111111111111';

  function servicioConRedisEspiado() {
    const suscritos: string[] = [];
    const cancelados: string[] = [];

    const presenciaInerte = {
      marcarVivo: () => Promise.resolve(),
      marcarIdo: () => Promise.resolve(),
      anunciar: () => Promise.resolve(),
      elegidaDe: () => Promise.resolve('AVAILABLE'),
      efectiva: () => 'AVAILABLE',
    } as never;

    const instancia = new NotificationsStreamService(
      { send: () => undefined } as never,
      presenciaInerte,
      { get: () => 10 } as never,
    );

    (instancia as unknown as { suscriptor: unknown }).suscriptor = {
      subscribe: (canal: string) => {
        suscritos.push(canal);
        return Promise.resolve(1);
      },
      unsubscribe: (canal: string) => {
        cancelados.push(canal);
        return Promise.resolve(0);
      },
    };

    return { instancia, suscritos, cancelados };
  }

  it('abre el canal en la primera pestaña y no en las siguientes', () => {
    const { instancia, suscritos } = servicioConRedisEspiado();

    const primera = instancia.suscribir(ALGUIEN).subscribe();
    expect(suscritos).toEqual([`avisos:${ALGUIEN}`]);

    const segunda = instancia.suscribir(ALGUIEN).subscribe();
    /* Sigue habiendo **una** suscripción: la segunda pestaña reutiliza el canal.
       Suscribir otra vez no rompe nada por sí solo, pero emparejaría con un
       `UNSUBSCRIBE` al cerrar esa pestaña y dejaría sorda a la primera. */
    expect(suscritos).toEqual([`avisos:${ALGUIEN}`]);

    primera.unsubscribe();
    segunda.unsubscribe();
  });

  it('cierra el canal solo cuando se va la última pestaña', () => {
    const { instancia, cancelados } = servicioConRedisEspiado();

    const primera = instancia.suscribir(ALGUIEN).subscribe();
    const segunda = instancia.suscribir(ALGUIEN).subscribe();

    primera.unsubscribe();
    /* Queda una pestaña abierta: cancelar aquí la dejaría sin eventos con la
       conexión viva, que es la forma silenciosa de romper esto. */
    expect(cancelados).toEqual([]);

    segunda.unsubscribe();
    expect(cancelados).toEqual([`avisos:${ALGUIEN}`]);
  });
});
