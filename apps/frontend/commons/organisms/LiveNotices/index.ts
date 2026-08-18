/**
 * Avisos empujados por el servidor mientras la pantalla está abierta.
 *
 * Lo monta `AppShell`, así que toda zona privada lo tiene sin hacer nada. Se
 * exporta por consistencia con el resto de organismos, no porque haga falta
 * colocarlo a mano.
 *
 * ⚠️ **Ya no recibe props.** Llevaba `gatewayPath` porque abría su propia
 * conexión SSE; ahora la conexión la abre `LiveSource` —una por pestaña, en el
 * armazón— y esto es solo un consumidor.
 */
export { LiveNotices } from './LiveNotices';
