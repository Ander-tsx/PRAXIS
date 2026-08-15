/**
 * La plantilla de arranque, del lado del servidor.
 *
 * ⚠️ **Código de servidor.** Usa `createServerApiClient`, así que no sale por el
 * índice raíz de `commons` ni se importa desde un componente cliente — misma
 * regla que `@praxis/commons/auth`. Los tipos, que sí necesita el navegador,
 * viven en `commons/api/domain.ts` y salen por el índice de siempre.
 */

export { aplicarPlantilla } from './aplicar';
export { pedirBorrador } from './borrador';
