import { MembershipStatus, type Tope } from '@praxis/contracts';

/**
 * Lo mínimo de una membresía para saber si le toca congelarse.
 *
 * ⚠️ **No es la fila de Prisma.** Este módulo vive fuera del servicio a
 * propósito, igual que `asientos.ts`: el orden y el corte son la parte que hay
 * que poder probar sin base de datos, porque son la parte que decide quién se
 * queda en solo lectura.
 */
export interface MiembroParaCongelar {
  /** El id de la fila. Es el desempate final — ver el invariante 5. */
  id: string;
  /** `null` mientras la invitación esté sin aceptar. */
  userId: string | null;
  email: string;
  status: MembershipStatus | string;
  invitedAt: Date;
  joinedAt: Date | null;
  /**
   * Si su papel lleva `canManageBilling`.
   *
   * ⚠️ **Solo puede ser cierto en una membresía activa** (D9): quien no ha
   * aceptado todavía no puede pagar nada, por mucho que el papel que le espera
   * lo permita. Quien construye estas filas es responsable de no ponerlo a
   * cierto en una invitación pendiente.
   */
  puedePagar: boolean;
}

/** Alguien que se ha quedado en solo lectura, y en qué puesto de la cola. */
export interface Congelado {
  id: string;
  userId: string | null;
  email: string;
  /**
   * Su turno para descongelarse: **1 es el primero que vuelve** al liberarse un
   * asiento.
   *
   * Existe para que la pantalla pueda decir algo distinto de «estás congelado».
   * «Eres el primero de dos» es una frase que se puede esperar; la otra es una
   * puerta cerrada sin reloj.
   */
  puesto: number;
}

/** El resultado entero, con lo que hace falta para explicarlo. */
export interface Corte {
  congelados: Congelado[];
  /** Cuánta gente cabe. `null` = sin tope, y entonces no se congela nadie. */
  tope: Tope;
  /** Cuántas filas hay, dueño incluido. Es el mismo número que `seatsUsed`. */
  ocupados: number;
}

/** Qué cuenta como antigüedad: haber entrado, y si no, cuándo se invitó (D2). */
const desdeCuando = (miembro: MiembroParaCongelar): number =>
  (miembro.joinedAt ?? miembro.invitedAt).getTime();

const esActivo = (miembro: MiembroParaCongelar): boolean =>
  miembro.status === MembershipStatus.ACTIVE;

/**
 * La cola, de quien más derecho tiene a quedarse a quien menos.
 *
 * Cuatro criterios, y **el orden entre ellos es la decisión**, no un detalle:
 *
 * 1. **Quien puede pagar, primero** (D8). No sale de la cuenta —ocupa su
 *    asiento como todo el mundo— pero nunca está en la cola de atrás: congelar
 *    a la única persona que puede meter la tarjeta deja la organización sin
 *    llave por dentro. Excluirlo del recuento en vez de ordenarlo habría hecho
 *    del papel la puerta de escape: cinco `canManageBilling` y no se congela
 *    nadie.
 * 2. **Quien está dentro, antes que quien fue invitado** (D9). Es el criterio
 *    que no era obvio: con la fecha a secas, una invitación de hace tres meses
 *    que nadie aceptó congela a alguien que lleva un mes trabajando. Antigüedad
 *    es haber estado dentro, no haber recibido un correo.
 * 3. **La fecha**, ascendente: `joinedAt` y, si no ha aceptado, `invitedAt`.
 * 4. **El `id`**, para desempatar.
 *
 * 🔴 **El cuarto criterio no es decorativo.** Dos filas creadas en la misma
 * transacción —la semilla, o una importación— comparten `invitedAt` al
 * milisegundo. Sin desempate, `Array.prototype.sort` puede devolverlas en
 * cualquier orden entre dos peticiones: hoy se congela una y mañana la otra, la
 * pantalla parpadea y nadie encuentra el motivo porque no hay ningún error.
 * Es el invariante 5 del plan.
 */
export function ordenarPorAntiguedad(
  miembros: readonly MiembroParaCongelar[],
): MiembroParaCongelar[] {
  return [...miembros].sort((uno, otro) => {
    if (uno.puedePagar !== otro.puedePagar) return uno.puedePagar ? -1 : 1;

    const unoDentro = esActivo(uno);
    const otroDentro = esActivo(otro);
    if (unoDentro !== otroDentro) return unoDentro ? -1 : 1;

    const diferencia = desdeCuando(uno) - desdeCuando(otro);
    if (diferencia !== 0) return diferencia;

    return uno.id < otro.id ? -1 : uno.id > otro.id ? 1 : 0;
  });
}

/**
 * Quién se queda en solo lectura cuando el techo baja por debajo de la gente.
 *
 * ## Qué hace, en una frase
 *
 * Saca al dueño, ordena al resto por la cola de arriba, y congela lo que sobre
 * del tope. Nada se escribe: **congelado se deriva** (D1), y por eso volver a
 * pagar descongela en el mismo instante sin que nadie tenga que tocar nada.
 *
 * ## El dueño sale y **se lleva su asiento**
 *
 * D3, y es distinto de lo que hace D8 con quien puede pagar. El dueño no
 * aparece en la cola *y además* descuenta uno del tope, porque su fila cuenta
 * en `ocupados` igual que las demás: sin el descuento, una organización de tres
 * asientos con el dueño dentro solo dejaría escribir a dos personas más de las
 * tres que promete el plan gratuito —«tú y dos más»—, y el gratuito se quedaría
 * en «tú y uno más» sin que nadie lo hubiera decidido.
 *
 * ## Sin tope no se congela a nadie
 *
 * `null` es «sin límite», solo Empresa. Se comprueba **antes** de restar: un
 * `null - 1` es `-1`, y con eso se congelaría la organización entera, empezando
 * por la única que paga más.
 */
export function calcularCorte(datos: {
  miembros: readonly MiembroParaCongelar[];
  ownerUserId: string;
  tope: Tope;
}): Corte {
  const { miembros, ownerUserId, tope } = datos;
  const ocupados = miembros.length;

  if (tope === null) return { congelados: [], tope, ocupados };

  const dueno = miembros.filter(
    (miembro) => miembro.userId !== null && miembro.userId === ownerUserId,
  );
  const resto = miembros.filter(
    (miembro) => miembro.userId === null || miembro.userId !== ownerUserId,
  );

  /* Lo que queda para los demás después de descontar el asiento del dueño. Se
     acota a cero: un tope de 0 —que hoy ningún plan tiene, pero es un número en
     un catálogo editable— no puede volverse negativo y desplazar el corte. */
  const disponibles = Math.max(tope - dueno.length, 0);

  return {
    congelados: ordenarPorAntiguedad(resto)
      .slice(disponibles)
      .map((miembro, indice) => ({
        id: miembro.id,
        userId: miembro.userId,
        email: miembro.email,
        puesto: indice + 1,
      })),
    tope,
    ocupados,
  };
}
