/**
 * Que un Escape cierre lo de dentro —una lista, un editor— y **no** el panel
 * de la tarea que lo contiene.
 *
 * ⚠️ **`stopPropagation()` no basta, y no da ningún error.** El panel
 * (`SlideOver`) escucha Escape con un `addEventListener` en `document`, y en el
 * App Router de Next React también delega sus eventos **en `document`**: los
 * dos oyentes están en el mismo nodo, y parar la propagación no frena a otro
 * oyente del mismo nodo. El de React se registró antes —al hidratar—, así que
 * `stopImmediatePropagation()` sobre el evento nativo sí impide que el del
 * panel llegue a ejecutarse. Sin esto, cerrar la lista de personas con Escape
 * cerraba también la tarea.
 */
export function swallowEscape(event: React.KeyboardEvent): void {
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}
