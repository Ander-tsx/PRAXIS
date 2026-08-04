import { AppHeader, Pagination, type UserStatusName } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';
import { AdminTabs } from '@/components/organisms/AdminTabs';
import { UsersTable } from '@/components/organisms/UsersTable';
import { UsersToolbar } from '@/components/organisms/UsersToolbar';
import { type AdminUserPage, FILAS_POR_PAGINA } from '@/lib/admin';

export const metadata: Metadata = { title: 'Cuentas' };

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}

const ESTADOS_VALIDOS: readonly string[] = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];

/**
 * Cuentas de la plataforma: listar, buscar, suspender y cambiar el rol global.
 *
 * ## Los filtros viven en la URL
 *
 * `?q=`, `?estado=` y `?page=`, no en estado de cliente. Así se puede compartir
 * «las cuentas suspendidas», el botón atrás hace lo que se espera, y esta página
 * sigue siendo un Server Component: la tabla se pinta con datos frescos del
 * gateway en cada navegación en vez de tener que sincronizar una copia en el
 * navegador.
 *
 * ## Por qué se pasa el `userId` a la tabla
 *
 * Para poder **apagar las acciones de tu propia fila**. El backend lo rechaza
 * igual —«No puedes administrar tu propia cuenta desde el panel»— pero un botón
 * que existe para dar un error es un botón que sobra. Lo mismo con las cuentas de
 * nivel igual o superior, que la tabla resuelve con el rol de quien mira.
 *
 * ## Sin borrar cuentas
 *
 * No hay acción de borrado, y es una decisión: borrar deja tareas, comentarios e
 * historial apuntando a alguien que ya no está, y esos datos viven en otros
 * microservicios donde la cascada no llega. Suspender cubre el caso real y se
 * deshace.
 */
export default async function UsersPage({ searchParams }: PageProps) {
  const { q, estado, page: pageParam } = await searchParams;
  const { userId, roles } = await loadCurrentUser();

  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const busqueda = q?.trim() ?? '';
  const estadoFiltro = ESTADOS_VALIDOS.includes(estado ?? '')
    ? (estado as UserStatusName)
    : undefined;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(FILAS_POR_PAGINA),
  });
  if (busqueda) params.set('search', busqueda);
  if (estadoFiltro) params.set('status', estadoFiltro);

  const { items, total } = await createServerApiClient().get<AdminUserPage>(
    `/admin/users?${params.toString()}`,
  );

  /** Conserva los filtros al cambiar de página: perderlos es el fallo clásico. */
  const hrefFor = (destino: number) => {
    const otros = new URLSearchParams();
    if (busqueda) otros.set('q', busqueda);
    if (estadoFiltro) otros.set('estado', estadoFiltro);
    if (destino > 1) otros.set('page', String(destino));
    const qs = otros.toString();
    return qs ? `/admin?${qs}` : '/admin';
  };

  return (
    <AppHeader title="Administración">
      <div className="flex flex-col gap-6">
        <AdminTabs activo="cuentas" />

        <UsersToolbar busqueda={busqueda} estado={estadoFiltro} total={total} />

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-6 py-12 text-center font-sans text-sm text-text-secondary">
            {busqueda || estadoFiltro
              ? 'Ninguna cuenta encaja con lo que buscas.'
              : 'Todavía no hay cuentas en la plataforma.'}
          </p>
        ) : (
          <>
            <UsersTable usuarios={items} miId={userId} misRoles={roles} />

            <Pagination
              page={page}
              limit={FILAS_POR_PAGINA}
              total={total}
              hrefFor={hrefFor}
              nombre="cuentas"
            />
          </>
        )}
      </div>
    </AppHeader>
  );
}
