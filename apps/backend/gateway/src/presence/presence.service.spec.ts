/// <reference types="jest" />

import { PresenceService } from './presence.service';

/**
 * La regla que decide qué estado se le enseña a la gente.
 *
 * ## Por qué se prueba aquí y no solo por la API
 *
 * `efectiva` es una función pura de dos entradas, y **es toda la corrección de
 * la presencia**: lo elegido por la persona y si hay una conexión abierta. Por
 * la API solo se puede llegar a la mitad de la tabla —sin flujo SSE, la
 * respuesta es siempre `AWAY`—, así que la otra mitad, la que hace que un «No
 * molestar» sobreviva y un «Disponible» olvidado no, no tendría cobertura
 * ninguna. Aquí sí, y sin montar nada.
 *
 * ## El fallo que existe para evitar
 *
 * El estado era front-driven: el navegador avisaba al cerrar la pestaña. Una
 * conexión que se corta, una batería que se agota o un navegador que se cae no
 * mandan ese aviso, y la cuenta se quedaba «Disponible» **para siempre**. La
 * segunda entrada —el hecho, no la intención— es lo que lo arregla, y si alguien
 * la quita porque «total, ya está en la base», vuelve el mismo fantasma.
 */
describe('PresenceService.efectiva', () => {
  /* `efectiva` no toca Redis ni ninguna otra dependencia: se instancia el
     servicio con dobles vacíos para poder llamarla suelta. Si algún día
     necesitara algo, este `as never` fallaría al compilar y sería la señal de
     que la regla dejó de ser pura. */
  const clienteInerte = { send: () => undefined } as never;
  const presencia = new PresenceService(clienteInerte, clienteInerte, clienteInerte);

  const ELEGIBLES = ['BUSY', 'IN_MEETING', 'EATING', 'DO_NOT_DISTURB'] as const;

  describe('sin conexión abierta', () => {
    it('da AWAY pase lo que pase en la base', () => {
      /* Esta es la fila que mata a los usuarios fantasma: da igual lo que la
         columna diga, si no hay flujo no hay nadie. */
      for (const elegida of [...ELEGIBLES, 'AVAILABLE', 'AWAY', null, undefined]) {
        expect(presencia.efectiva(elegida, false)).toBe('AWAY');
      }
    });
  });

  describe('con conexión abierta', () => {
    it('sin nada elegido, da AVAILABLE', () => {
      /* `AWAY` es el valor por defecto de la columna y el selector ni siquiera
         lo ofrece: en la base significa «no he elegido nada». Por eso conectarse
         basta para salir en verde, sin tener que marcarse «Disponible» al
         llegar. */
      expect(presencia.efectiva('AWAY', true)).toBe('AVAILABLE');
      expect(presencia.efectiva(null, true)).toBe('AVAILABLE');
      expect(presencia.efectiva(undefined, true)).toBe('AVAILABLE');
      expect(presencia.efectiva('', true)).toBe('AVAILABLE');
    });

    it('respeta lo que la persona eligió', () => {
      /* Quien se puso «No molestar» sigue en «No molestar» mientras esté
         conectado, por mucho que esté tecleando. Si la conexión pisara la
         elección, el selector sería decorativo. */
      for (const elegida of ELEGIBLES) {
        expect(presencia.efectiva(elegida, true)).toBe(elegida);
      }
      expect(presencia.efectiva('AVAILABLE', true)).toBe('AVAILABLE');
    });
  });
});
