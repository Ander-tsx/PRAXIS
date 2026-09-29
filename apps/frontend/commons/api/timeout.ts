import { ApiError } from './envelope';

/**
 * Plazo máximo para cualquier petición al gateway.
 *
 * ## Por qué existe
 *
 * `fetch` **no tiene tiempo límite**, ni en el navegador ni en Node. Una
 * conexión que se queda a medias —el otro extremo desaparece sin cerrar el
 * socket— no falla: se queda esperando hasta que lo corte el sistema
 * operativo, que son minutos, y a veces no lo corta nunca.
 *
 * Eso, aquí, salía como **un botón de carga girando para siempre**. La cadena
 * es esta: `revalidatePath()` dentro de una Server Action re-renderiza la
 * página en curso y manda el resultado **en la misma respuesta** —está medido
 * en ESTADO-ACTUAL §24.4—, así que `pending` de `useActionState` no se apaga
 * hasta que ese render termina. El render pide sus datos al gateway con estos
 * clientes. Si una de esas peticiones no vuelve, la respuesta de la acción no
 * se cierra y el botón se queda cargando **aunque la acción ya se haya
 * ejecutado y guardado**. De ahí el síntoma que lo delató: la invitación
 * aparecía al recargar, pero el botón seguía girando.
 *
 * Por eso es un fallo de todos los botones a la vez y no de uno: no está en
 * ningún formulario, está en que una petición podía no terminar nunca.
 *
 * ⚠️ **Esto arregla una de las dos causas, no las dos.** Con el plazo puesto,
 * ninguna petición se queda colgada y el render de la revalidación termina
 * siempre. Pero el botón podía seguir girando por un camino que no pasa por la
 * red: la promesa que Next usa para cerrar la transición del router **no se
 * resuelve** cuando su acción se marca `discarded`, y eso ocurre con una
 * navegación encima de una acción en vuelo. La explicación entera y el arreglo
 * están en `commons/hooks/useAccion`, que es lo que hoy mide la espera de los
 * botones. Los dos fallos dan exactamente el mismo síntoma, así que si vuelve a
 * aparecer, hay que descartar los dos.
 *
 * ## El número
 *
 * 15 segundos. El gateway está a un salto de red —dentro de la misma VPC en el
 * despliegue, en localhost en desarrollo— y ninguna de sus rutas hace trabajo
 * largo, así que cualquier cosa por encima de eso ya no es lentitud, es una
 * conexión rota. Es holgado a propósito: lo que se busca es que un cuelgue
 * termine en un mensaje, no recortar peticiones lentas pero vivas.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * El plazo de las subidas de archivo, que es otra cosa.
 *
 * Aquí el tiempo se va en mover bytes, no en esperar a que alguien conteste, y
 * con el mismo plazo que una consulta un adjunto grande moriría a mitad de
 * viaje **por funcionar despacio**, que es justo lo que no se quiere cortar.
 */
export const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * El plazo de un turno de PRAX, que tampoco es una consulta.
 *
 * Gemini con un briefing grande tarda más de 15 s sin estar colgado, y el
 * cliente de Gemini reintenta hasta tres veces lo que falla de forma
 * transitoria. Con el plazo común, el navegador pintaba un error mientras el
 * backend terminaba, cobraba el mensaje y guardaba la respuesta: la persona la
 * veía solo al recargar. Es la causa más probable de «PRAX no responde»
 * (docs/PLAN-PRAX-SEMIAGENTICO.md §1.3). Lo sustituye el turno por SSE (F3).
 */
export const PRAX_TIMEOUT_MS = 120_000;

/**
 * El error de un plazo agotado, en el mismo formato que el resto.
 *
 * 504 y no 503: `BAD_GATEWAY` con 503 ya significa «no se pudo conectar», y son
 * dos cosas distintas de cara a quien lee el mensaje —una es que el servidor no
 * está, la otra que está y no contesta—.
 */
export function timeoutError(): ApiError {
  return new ApiError(504, 'BAD_GATEWAY', 'El servidor tardó demasiado en responder.');
}

/** ¿Este error es el de nuestro plazo agotado? */
export function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

/**
 * La señal de aborto que hay que pasarle a `fetch`.
 *
 * Si quien llama ya traía la suya, se combinan: cancelar por cualquiera de las
 * dos vías tiene que seguir funcionando. `AbortSignal.any` es lo que hace esa
 * combinación, y se comprueba antes de usarla porque es reciente —Safari no la
 * tuvo hasta 17.4—; sin ella se conserva el plazo, que es lo que este archivo
 * viene a garantizar.
 */
export function timeoutSignal(
  existing?: AbortSignal | null,
  ms: number = REQUEST_TIMEOUT_MS,
): AbortSignal {
  const limite = AbortSignal.timeout(ms);

  if (!existing) return limite;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([existing, limite]);

  return limite;
}
