import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * El error que devuelve billing-service, traducido a HTTP.
 *
 * ## Por qué billing-service devuelve el error en vez de lanzarlo
 *
 * Porque un `RpcException` por TCP llega al otro lado como un error de
 * transporte y **pierde el motivo por el camino**: el gateway acabaría
 * respondiendo 500 a «no quedan asientos». Devolverlo como un valor lo mantiene
 * entero, y quien sabe si eso es un 400, un 403 o un 409 es este lado, que es
 * el único que habla HTTP.
 *
 * ## Los siete códigos no se colapsan en uno
 *
 * ⚠️ **`NO_ERES_MIEMBRO` y `SIN_PERMISO` son dos frases distintas en la
 * pantalla**: la primera se arregla pidiendo una invitación y la segunda no se
 * arregla de ninguna manera salvo hablando con quien manda. Meterlas las dos en
 * un 403 genérico obliga a leer el texto para saber qué ofrecer.
 *
 * Y `SIN_ASIENTOS` es **409 y no 402**: el 402 lo reserva `QuotaService` para
 * las cuotas del plan, que se arreglan pagando. Quedarse sin asientos también
 * se arregla pagando, sí, pero el número de asientos ya lo eligió quien
 * contrató, así que la salida es ampliar o sacar a alguien — no «pasa a Pro».
 */
export interface FalloDeBilling {
  error: string;
  codigo:
    | 'NO_EXISTE'
    | 'NO_ERES_MIEMBRO'
    | 'SIN_PERMISO'
    | 'SIN_ASIENTOS'
    | 'YA_ESTA'
    | 'NO_VALE'
    | 'INVITACION_INVALIDA';
}

const ESTADOS: Record<FalloDeBilling['codigo'], HttpStatus> = {
  NO_EXISTE: HttpStatus.NOT_FOUND,
  NO_ERES_MIEMBRO: HttpStatus.FORBIDDEN,
  SIN_PERMISO: HttpStatus.FORBIDDEN,
  SIN_ASIENTOS: HttpStatus.CONFLICT,
  YA_ESTA: HttpStatus.CONFLICT,
  NO_VALE: HttpStatus.BAD_REQUEST,
  INVITACION_INVALIDA: HttpStatus.GONE,
};

/** ¿Lo que contestó billing-service es un fallo y no el dato pedido? */
export function esFallo(valor: unknown): valor is FalloDeBilling {
  return typeof valor === 'object' && valor !== null && 'codigo' in valor && 'error' in valor;
}

/**
 * Deja pasar el dato, o lanza el HTTP que corresponda.
 *
 * ⚠️ **Siempre por aquí.** Un comando de billing-service que se devuelva tal
 * cual respondería **200 con `{ error, codigo }` dentro**, que para el
 * navegador es un éxito: la pantalla pintaría la lista vacía de una
 * organización a la que no perteneces sin decir por qué, y el `catch` del
 * cliente no se dispararía nunca.
 */
export function oFalla<T>(valor: T | FalloDeBilling): T {
  if (esFallo(valor)) {
    throw new HttpException(
      { code: valor.codigo, message: valor.error, details: {} },
      ESTADOS[valor.codigo] ?? HttpStatus.BAD_REQUEST,
    );
  }
  return valor;
}
