import { AppHeader, type Paginated, type Project } from '@praxis/commons';
import { createServerApiClient } from '@praxis/commons/auth';
import { redirect } from 'next/navigation';
import { NoReportsAccess } from '@/components/molecules/NoReportsAccess';

/**
 * Puerta de la sección.
 *
 * **Entra directamente al primer proyecto** en vez de enseñar una lista para
 * elegir. Antes era una rejilla de tarjetas, y sobraba desde que el proyecto se
 * cambia con un desplegable dentro del propio informe: la lista solo servía para
 * dar un clic más antes de ver nada.
 *
 * Solo queda pantalla propia para el caso en que no haya ningún proyecto, que es
 * lo único que esta ruta puede decir y el informe no.
 *
 * ⚠️ **Los reportes son de un proyecto, no globales**, y no por comodidad: no
 * existe ningún permiso comprobable sobre «todos tus proyectos a la vez» —el
 * mismo motivo por el que `/me/tasks` y `/me/notifications` cuelgan de `/me`— y
 * un agregado que cruzara proyectos mezclaría equipos que no se conocen.
 */
export default async function ReportsIndexPage() {
  const api = createServerApiClient();

  /**
   * Solo los proyectos cuyo informe puedes abrir. Entrar al primero de la lista
   * sin filtrar mandaría a la pantalla de «no tienes acceso» a cualquiera que
   * pulse Reportes en la barra lateral y tenga de primer proyecto uno donde no
   * se lo han abierto.
   */
  const conAcceso = await api
    .get<Paginated<Project>>('/projects?limit=100&permission=canViewReports')
    .catch(() => ({ items: [] as Project[], total: 0 }));

  const primero = conAcceso.items[0];
  // Sin el basePath: es una ruta del App Router de esta app. Ver §17.4.
  if (primero) redirect(`/${primero.id}`);

  /**
   * Sin ninguno hay dos motivos distintos, y confundirlos manda a pedir un
   * permiso a quien lo que necesita es que le añadan a un proyecto. La segunda
   * consulta solo se hace en este caso, que es el raro: `limit=1` porque de
   * esta lista únicamente se mira el `total`.
   */
  const todos = await api
    .get<Paginated<Project>>('/projects?limit=1')
    .catch(() => ({ items: [] as Project[], total: 0 }));

  if (todos.total > 0) {
    return (
      <AppHeader title="Reportes">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
              Cómo va el trabajo
            </h2>
            <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
              Cuánto hay, cómo se mueve, cuánto tarda y qué cabe esperar.
            </p>
          </div>

          <NoReportsAccess />
        </div>
      </AppHeader>
    );
  }

  return (
    <AppHeader title="Reportes">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl text-text-primary sm:text-4xl">
            Cómo va el trabajo
          </h2>
          <p className="max-w-2xl font-serif text-lg italic text-text-secondary">
            Cuánto hay, cómo se mueve, cuánto tarda y qué cabe esperar.
          </p>
        </div>

        <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-display text-lg text-text-primary">
            Todavía no estás en ningún proyecto
          </p>
          <p className="mt-1 font-sans text-sm text-text-secondary">
            Los reportes se calculan sobre el trabajo de un proyecto, así que
            necesitas estar en al menos uno.
          </p>
        </div>
      </div>
    </AppHeader>
  );
}
