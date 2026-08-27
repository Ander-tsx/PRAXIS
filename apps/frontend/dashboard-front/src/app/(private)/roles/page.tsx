import { createServerApiClient } from '@praxis/commons/auth';
import type { OrganizationView } from '@praxis/commons/billing/planes';
import { getOrganizacionActiva } from '@praxis/commons/theme';
import { redirect } from 'next/navigation';

/**
 * `/dashboard/roles` — la entrada de la barra lateral, que **no es una pantalla**.
 *
 * ## Por qué redirige en vez de tener contenido propio
 *
 * Porque los papeles pertenecen a **una** organización, y la barra lateral no
 * puede saber a cuál sin preguntarlo. Lo que sí sabe es cuál estás mirando: la
 * misma cookie que usa el selector. Con ella se entra directo; sin ella, a la
 * lista de organizaciones, que es donde se elige.
 *
 * ⚠️ **La entrada del sidebar existía apagada con «Pronto»** desde el rediseño
 * de Kyloo, apuntando aquí. Encenderla sin esta ruta habría dado un 404, que es
 * exactamente lo que aquel «Pronto» evitaba.
 *
 * ⚠️ Sin el basePath: `redirect` habla de rutas del App Router de esta app, y
 * ahí la zona es la raíz.
 */
export default async function RolesEntryPage() {
  const activa = await getOrganizacionActiva();
  if (activa) redirect(`/organizations/${activa}/roles`);

  /* Sin ninguna elegida: si solo hay una, no hay nada que preguntar y se entra.
     Con varias, se elige en la lista — inventar una aquí sería enseñar los
     papeles de una organización que la persona no estaba mirando. */
  const organizaciones = await createServerApiClient()
    .get<OrganizationView[]>('/me/organizations')
    .catch(() => [] as OrganizationView[]);

  if (organizaciones.length === 1) redirect(`/organizations/${organizaciones[0].id}/roles`);
  redirect('/organizations');
}
