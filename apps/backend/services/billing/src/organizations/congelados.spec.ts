import { MembershipStatus } from '@praxis/contracts';
import { type MiembroParaCongelar, calcularCorte, ordenarPorAntiguedad } from './congelados';

/**
 * Lo que se prueba aquí es **el orden**, que es donde vive toda la decisión.
 *
 * El corte en sí es un `slice`. Lo difícil —y lo que se contestó en D8 y D9— es
 * quién va delante de quién, y ninguna de esas reglas se rompe con un error:
 * se rompe congelando a la persona equivocada, que desde fuera es
 * indistinguible de que la hayan echado.
 */
describe('congelados', () => {
  const dia = (numero: number) => new Date(`2026-0${numero}-01T00:00:00.000Z`);

  const miembro = (
    parcial: Partial<MiembroParaCongelar> & Pick<MiembroParaCongelar, 'id'>,
  ): MiembroParaCongelar => ({
    userId: parcial.id,
    email: `${parcial.id}@praxis.test`,
    status: MembershipStatus.ACTIVE,
    invitedAt: dia(1),
    joinedAt: dia(1),
    puedePagar: false,
    ...parcial,
  });

  const ids = (miembros: { id: string }[]) => miembros.map((uno) => uno.id);

  describe('el orden de la cola', () => {
    it('primero quien lleva más tiempo dentro: se congela la cola', () => {
      const orden = ordenarPorAntiguedad([
        miembro({ id: 'c', joinedAt: dia(3) }),
        miembro({ id: 'a', joinedAt: dia(1) }),
        miembro({ id: 'b', joinedAt: dia(2) }),
      ]);

      expect(ids(orden)).toEqual(['a', 'b', 'c']);
    });

    it('vale `joinedAt`, no `invitedAt`: aceptar ayer no da antigüedad (D2)', () => {
      /* Invitado en enero y dentro desde marzo, contra invitado y dentro en
         febrero. Manda cuándo empezó a trabajar. */
      const orden = ordenarPorAntiguedad([
        miembro({ id: 'tarde', invitedAt: dia(1), joinedAt: dia(3) }),
        miembro({ id: 'pronto', invitedAt: dia(2), joinedAt: dia(2) }),
      ]);

      expect(ids(orden)).toEqual(['pronto', 'tarde']);
    });

    it('🔴 una invitación vieja sin aceptar NO congela a quien lleva un mes dentro (D9)', () => {
      /* Con un `COALESCE(joinedAt, invitedAt)` a secas, la invitación de enero
         ganaría a quien entró en marzo y se congelaría a la persona que está
         trabajando. Antigüedad es haber estado dentro. */
      const orden = ordenarPorAntiguedad([
        miembro({
          id: 'invitada-en-enero',
          status: MembershipStatus.INVITED,
          userId: null,
          invitedAt: dia(1),
          joinedAt: null,
        }),
        miembro({ id: 'dentro-desde-marzo', invitedAt: dia(3), joinedAt: dia(3) }),
      ]);

      expect(ids(orden)).toEqual(['dentro-desde-marzo', 'invitada-en-enero']);
    });

    it('quien puede pagar va el primero aunque sea el último en llegar (D8)', () => {
      const orden = ordenarPorAntiguedad([
        miembro({ id: 'veterana', joinedAt: dia(1) }),
        miembro({ id: 'tesorera', joinedAt: dia(5), puedePagar: true }),
      ]);

      expect(ids(orden)).toEqual(['tesorera', 'veterana']);
    });

    it('🔴 el orden es estable con fechas idénticas: desempata el id (invariante 5)', () => {
      /* Dos filas de la misma transacción comparten `invitedAt` al milisegundo.
         Sin desempate, hoy se congela una y mañana la otra. */
      const mismos = [miembro({ id: 'b2' }), miembro({ id: 'a1' }), miembro({ id: 'c3' })];

      expect(ids(ordenarPorAntiguedad(mismos))).toEqual(['a1', 'b2', 'c3']);
      expect(ids(ordenarPorAntiguedad([...mismos].reverse()))).toEqual(['a1', 'b2', 'c3']);
    });
  });

  describe('el corte', () => {
    const corteDe = (miembros: MiembroParaCongelar[], tope: number | null) =>
      calcularCorte({ miembros, ownerUserId: 'dueña', tope });

    const equipoDeCinco = () => [
      miembro({ id: 'dueña', joinedAt: dia(1) }),
      miembro({ id: 'segunda', joinedAt: dia(2) }),
      miembro({ id: 'tercera', joinedAt: dia(3) }),
      miembro({ id: 'cuarta', joinedAt: dia(4) }),
      miembro({ id: 'quinta', joinedAt: dia(5) }),
    ];

    it('🔴 el caso del encargo: cinco personas, tope de tres, se congelan las dos últimas', () => {
      const corte = corteDe(equipoDeCinco(), 3);

      expect(ids(corte.congelados)).toEqual(['cuarta', 'quinta']);
      expect(corte.ocupados).toBe(5);
    });

    it('el puesto dice quién vuelve primero al liberarse un asiento', () => {
      const corte = corteDe(equipoDeCinco(), 3);

      expect(corte.congelados.map((uno) => uno.puesto)).toEqual([1, 2]);
      expect(corte.congelados[0].email).toBe('cuarta@praxis.test');
    });

    it('el dueño nunca se congela, ni siendo el último en llegar (D3)', () => {
      const alReves = equipoDeCinco().map((uno) =>
        uno.id === 'dueña' ? { ...uno, joinedAt: dia(9) } : uno,
      );

      expect(ids(corteDe(alReves, 3).congelados)).not.toContain('dueña');
      /* Y con un solo asiento se lo queda él: no quedan turnos para nadie más. */
      expect(ids(corteDe(alReves, 1).congelados)).toEqual([
        'segunda',
        'tercera',
        'cuarta',
        'quinta',
      ]);
    });

    it('🔴 el dueño descuenta su asiento del tope, o el gratuito daría uno menos', () => {
      /* Tres asientos con el dueño dentro son «tú y dos más», que es lo que
         promete FREE. Sin el descuento serían tres además del dueño. */
      const corte = corteDe(equipoDeCinco(), 3);

      expect(corte.congelados).toHaveLength(2);
      expect(ids(corte.congelados)).toEqual(['cuarta', 'quinta']);
    });

    it('cabiendo todos no se congela nadie', () => {
      expect(corteDe(equipoDeCinco(), 5)).toMatchObject({ congelados: [] });
      expect(corteDe(equipoDeCinco(), 9).congelados).toHaveLength(0);
    });

    it('🔴 sin tope no se congela a nadie: `null - 1` habría congelado la organización entera', () => {
      const corte = corteDe(equipoDeCinco(), null);

      expect(corte.congelados).toHaveLength(0);
      expect(corte.tope).toBeNull();
    });

    it('quien puede pagar ocupa asiento pero no se congela: se congela quien va detrás (D8)', () => {
      const equipo = [
        miembro({ id: 'dueña', joinedAt: dia(1) }),
        miembro({ id: 'veterana', joinedAt: dia(2) }),
        miembro({ id: 'tesorera', joinedAt: dia(5), puedePagar: true }),
      ];

      /* Dos asientos: uno del dueño, uno para la cola. La tesorera va delante
         de la veterana, así que se congela la veterana. */
      const corte = calcularCorte({ miembros: equipo, ownerUserId: 'dueña', tope: 2 });

      expect(ids(corte.congelados)).toEqual(['veterana']);
    });

    it('🔴 dar `canManageBilling` a todo el mundo NO evita el corte', () => {
      /* Si salvarse sacara de la cuenta en vez de ordenar, cinco papeles con
         permiso de pagar dejarían el tope de asientos decorativo — el mismo
         agujero que A1 acaba de tapar. */
      const todosPagan = equipoDeCinco().map((uno) => ({ ...uno, puedePagar: true }));
      const corte = corteDe(todosPagan, 3);

      expect(corte.congelados).toHaveLength(2);
      expect(ids(corte.congelados)).toEqual(['cuarta', 'quinta']);
    });

    it('las invitaciones pendientes ocupan asiento y se congelan antes que nadie activo (D9)', () => {
      const equipo = [
        miembro({ id: 'dueña', joinedAt: dia(1) }),
        miembro({
          id: 'pendiente',
          status: MembershipStatus.INVITED,
          userId: null,
          invitedAt: dia(2),
          joinedAt: null,
        }),
        miembro({ id: 'recién-llegada', joinedAt: dia(4) }),
      ];

      const corte = calcularCorte({ miembros: equipo, ownerUserId: 'dueña', tope: 2 });

      expect(ids(corte.congelados)).toEqual(['pendiente']);
      /* Y sigue contando: son tres ocupados sobre dos, no dos sobre dos. */
      expect(corte.ocupados).toBe(3);
    });

    it('una organización personal de un asiento no congela a su dueño', () => {
      const sola = [miembro({ id: 'dueña' })];

      expect(calcularCorte({ miembros: sola, ownerUserId: 'dueña', tope: 1 }).congelados).toEqual(
        [],
      );
    });
  });
});
