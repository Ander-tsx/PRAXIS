/**
 * `local` cuando todos los servicios comparten proceso (el monolito); `tcp` en
 * cualquier otro caso, que es el de desarrollo y el de las pruebas de
 * integración. Se lee de `process.env` y no de un `ConfigService` porque es una
 * propiedad del **proceso**, no de un servicio: la pone el arranque del
 * monolito antes de cargar ninguno.
 */
export function transporteDelProceso(): 'local' | 'tcp' {
  return process.env.PRAXIS_TRANSPORT === 'local' ? 'local' : 'tcp';
}
