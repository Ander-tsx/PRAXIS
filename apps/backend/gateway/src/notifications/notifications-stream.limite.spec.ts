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
   * `suscribir` toca la presencia al abrir y al cerrar, así que esos métodos
   * devuelven promesas resueltas: lo que se prueba es la contabilidad, no lo que
   * se anuncia.
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

    return new NotificationsStreamService(
      { send: () => undefined } as never,
      presenciaInerte,
      config,
    );
  }

  it('deja abrir hasta el tope y no más', () => {
    const servicioConTope = servicio(3);
    const abiertas = [];

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
