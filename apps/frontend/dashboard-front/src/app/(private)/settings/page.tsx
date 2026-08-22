import { redirect } from 'next/navigation';

/**
 * Configuración dejó de ser una pantalla y pasó a ser una sección.
 *
 * Tenía tres tarjetas sin relación entre sí —la voz, el plan y el tema— y el
 * plan salía además en otra entrada del menú. Ahora la facturación tiene su
 * propia página y el resto vive en Praxis Voice; «Configuración» es el
 * desplegable que las agrupa en la barra lateral.
 *
 * ⚠️ **Esta ruta se queda como redirección y no se borra.** La enlazan el
 * acceso rápido del panel, el `return_url` del portal de Stripe de antes de
 * este cambio, y los marcadores de cualquiera que la tuviera guardada. Un 404
 * ahí es una pantalla en blanco después de pagar.
 */
export default function SettingsPage() {
  /* Sin el basePath: `redirect` habla de rutas del App Router de esta app, y
     ahí la zona es la raíz. Ver la nota de `revalidatePath` en las acciones. */
  redirect('/voice');
}
