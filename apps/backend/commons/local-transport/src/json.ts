/**
 * La ida y vuelta por JSON que hace TCP, sin el socket.
 *
 * Es lo que hace que el transporte en proceso se comporte **igual** que TCP y no
 * un poco mejor: un `Date` llega como cadena, `undefined` desaparece, una clase
 * llega como objeto plano y nadie comparte referencias. Los servicios se
 * escribieron contra eso. Pasar el objeto tal cual no daría ningún error: daría
 * un `Date` donde el código espera un `string`, o una lista que el que llama
 * modifica por debajo del que respondió.
 */
export function copiaJson<T>(valor: T): T {
  if (valor === undefined) return valor;
  return JSON.parse(JSON.stringify(valor)) as T;
}
