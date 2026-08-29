import { loadPrivateChrome } from '@praxis/commons/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `/dashboard/organizations` — ya no es una pantalla, **redirige**.
 *
 * 🔴 Era una rejilla de **todas** tus organizaciones, y eso contradice la
 * decisión D1 de `docs/PLAN-ORGANIZACION-ACTIVA.md`: no existe «Todas las
 * organizaciones», siempre hay **una activa** y todo cuelga de ella. Elegir cuál
 * se hace en el selector de la barra lateral y no se vuelve a preguntar, así que
 * una galería para navegar entre organizaciones es un resto de la etapa
 * anterior.
 *
 * Se entra en el portal de la organización activa. Para ver otra se cambia en el
 * selector, que es donde se cambia todo lo demás.
 *
 * ⚠️ **`loadPrivateChrome` y no la cookie a pelo**: aplica el repliegue a la
 * personal si la cookie apunta a una organización de la que ya te fueron. Es la
 * misma llamada que hace el layout, así que no cuesta un salto de red nuevo.
 * Mismo patrón que `/dashboard/roles`.
 *
 * ⚠️ Sin el basePath: `redirect` habla de rutas del App Router de esta app, y
 * ahí la zona es la raíz.
 */
export default async function OrganizationsEntryPage() {
  const { organizacionActivaId } = await loadPrivateChrome();

  if (!organizacionActivaId) redirect('/organizations/new');

  redirect(`/organizations/${organizacionActivaId}`);
}
