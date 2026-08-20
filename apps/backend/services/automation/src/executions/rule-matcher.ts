import type { InitialDomainEvent } from '@praxis/contracts';

import { triggerForEvent, triggerSpec } from '../rules/catalog';

export type RuleCondition = { field: string; operator: string; value: unknown };

/**
 * Si este hecho de dominio despierta a este disparador.
 *
 * ⚠️ **La correspondencia ya no vive aquí.** Estaba escrita a mano en un mapa
 * de este archivo, y decía cosas que no eran: `TASK_DUE_SOON` figuraba
 * reaccionando a cinco eventos cuando es un disparador **de barrido** que no
 * reacciona a ninguno. Ahora la respuesta la da el catálogo, que es el mismo
 * sitio del que sale el formulario.
 */
export function matchesTrigger(type: string, event: InitialDomainEvent): boolean {
  const spec = triggerSpec(type);
  if (!spec || spec.kind !== 'reactive') return false;
  return spec.eventType === event.type;
}

/** El disparador reactivo que atiende este hecho, si hay alguno. */
export { triggerForEvent };

/**
 * Si **todas** las condiciones se cumplen sobre este contexto.
 *
 * Las condiciones son una Y lógica y nada más: no hay O, ni paréntesis, ni
 * anidamiento. Es una decisión, no una carencia — una regla que hay que leer
 * dos veces para saber cuándo salta es una regla que alguien va a entender mal,
 * y las que hacen falta de verdad se escriben como dos reglas.
 *
 * ## ⚠️ Un campo que no existe en el contexto NO se cumple
 *
 * Ni siquiera con `NOT_EQUALS`. La tentación es tratar `undefined !== 'ALTA'`
 * como cierto, y es exactamente el fallo que llena la bandeja de avisos: una
 * condición sobre un campo mal escrito pasaría **siempre**, y la regla actuaría
 * sobre todo el proyecto. Ante la duda, no actuar.
 */
export function matchesAllConditions(
  conditions: RuleCondition[],
  context: Record<string, unknown>,
): boolean {
  return conditions.every(({ field, operator, value }) => {
    const actual = context[field];
    if (actual === undefined || actual === null) return false;

    switch (operator) {
      case 'EQUALS':
        return Array.isArray(actual) ? igualALista(actual, value) : actual === value;
      case 'NOT_EQUALS':
        /* Sobre una lista, «no es» significa «no la contiene»: es lo que
           alguien quiere decir con «que no lleve la etiqueta urgente». */
        return Array.isArray(actual) ? !actual.includes(value) : actual !== value;
      case 'IN':
        return Array.isArray(value) && value.includes(actual);
      case 'CONTAINS':
        if (Array.isArray(actual)) return actual.includes(value);
        /* En texto, sin distinguir mayúsculas: nadie escribe una condición
           pensando en la caja de las letras, y que dependa de ella es una
           regla que a veces salta y a veces no por un motivo invisible. */
        return (
          typeof actual === 'string' &&
          typeof value === 'string' &&
          actual.toLowerCase().includes(value.toLowerCase())
        );
      case 'GT':
      case 'GTE':
      case 'LT':
      case 'LTE': {
        const izquierda = comparable(actual);
        const derecha = comparable(value);
        if (izquierda === null || derecha === null) return false;
        if (operator === 'GT') return izquierda > derecha;
        if (operator === 'GTE') return izquierda >= derecha;
        if (operator === 'LT') return izquierda < derecha;
        return izquierda <= derecha;
      }
      default:
        /* Un operador que este motor no conoce **no se cumple**, y no es lo
           mismo que fallar: la regla se queda quieta y la ejecución lo deja
           anotado, en vez de tumbar la revisión entera del proyecto. */
        return false;
    }
  });
}

/** Igualdad contra una lista: se cumple cuando la lista es exactamente ese valor. */
function igualALista(actual: unknown[], value: unknown): boolean {
  return actual.length === 1 && actual[0] === value;
}

/**
 * El valor como número comparable, o `null` si no lo es.
 *
 * Las fechas entran como `AAAA-MM-DD` y salen como el instante que representan:
 * comparar dos fechas como texto funciona **solo** con ese formato, y basta con
 * que alguien escriba una en otro para que el orden salga silenciosamente mal.
 */
function comparable(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string') {
    const fecha = Date.parse(valor.length === 10 ? `${valor}T00:00:00.000Z` : valor);
    return Number.isNaN(fecha) ? null : fecha;
  }
  return null;
}
