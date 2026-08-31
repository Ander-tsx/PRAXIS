import { loadPrivateChrome } from '@praxis/commons/auth';
import { redirect } from 'next/navigation';

/**
 * `/dashboard/roles` — la entrada de la barra lateral, que **no es una pantalla**.
 *
 * ## Por qué redirige en vez de tener contenido propio
 *
 * Porque los papeles pertenecen a **una** organización, y la barra lateral no
 * puede saber a cuál sin preguntarlo. Lo que sí sabe es cuál estás mirando: la
 * organización activa, que desde 2026-08-28 siempre existe.
 *
 * ## 🔴 Esto preguntaba, y era justo el roce de esta etapa
 *
 * Antes, sin cookie, mandaba a `/organizations?elegir=roles` para que la persona
 * eligiera organización — y con dos o tres equipos, eso pasaba **cada vez** que
 * se pulsaba «Roles y permisos». Ahora no hay nada que preguntar: se entra en la
 * activa, y para ver los papeles de otra se cambia en el selector de la barra
 * lateral, que es donde se cambia todo lo demás.
 *
 * ⚠️ **`loadPrivateChrome` y no la cookie a pelo.** Es lo que aplica el
 * repliegue: una cookie que apunte a una organización de la que ya te fueron
 * daría aquí un 404 con cara de enlace roto. Es la misma llamada que ya hace el
 * layout, así que no cuesta un salto de red nuevo.
 *
 * ⚠️ Sin el basePath: `redirect` habla de rutas del App Router de esta app, y
 * ahí la zona es la raíz.
 */
export default async function RolesEntryPage() {
  const { organizacionActivaId } = await loadPrivateChrome();

  /* `null` solo si la lista de organizaciones vino vacía, que es una carga que
     falló: la lista de organizaciones lo explica mejor que una pantalla de
     papeles sin papeles. */
  if (!organizacionActivaId) redirect('/organizations');

  redirect(`/organizations/${organizacionActivaId}/roles`);
}
