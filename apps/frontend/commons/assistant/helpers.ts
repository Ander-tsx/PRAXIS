import { createServerApiClient } from '../auth/server-client';
import { getSession } from '../auth/session';

/* Los traductores de errores viven en `errores.ts`, que el cliente también puede
   importar: este archivo arrastra código de servidor. Se reexportan para que nada
   de lo que ya los usaba cambie. */
export { conversationIdDelError, cuotaDelError, describe } from './errores';

/**
 * Los ayudantes que comparten los dos archivos de acciones del asistente.
 *
 * ## ⚠️ Por qué viven aparte y no dentro del `'use server'`
 *
 * Un módulo marcado con `'use server'` **solo puede exportar funciones
 * asíncronas**: es el contrato de las Server Functions, y Next lo comprueba al
 * compilar. Así que un `describe()` síncrono o una interfaz no caben ahí como
 * exportación, y dejarlos privados obligaba a tener una copia en cada archivo de
 * acciones —que es justo lo que pasaba, porque hasta ahora solo había uno—.
 *
 * Este archivo **no** lleva `'use server'`. Solo lo importan módulos que sí lo
 * llevan, así que nunca acaba en el navegador.
 */

/**
 * El cliente del gateway, o `null` si la sesión ya no vale.
 *
 * Cada acción lo comprueba por su cuenta, como las del tablero: una Server
 * Function viaja como POST a la ruta donde se usa, y un cambio de `matcher` en
 * el `proxy.ts` de una zona podría dejarla fuera del guard sin que nada avise.
 */
export async function requireApi() {
  const session = await getSession();
  if (!session) return null;
  return createServerApiClient();
}
