import { FilterBar } from '@/components/molecules/FilterBar';
import { AdminHeader } from '@/components/organisms/admin/AdminHeader';
import { UsersTable } from '@/components/organisms/admin/UsersTable';
import { type AdminUserPage, ESTADOS, FILAS_POR_PAGINA } from '@/lib/admin/admin';
import { AppHeader, Pagination, type UserStatusName, colors } from '@praxis/commons';
import { createServerApiClient, loadCurrentUser } from '@praxis/commons/auth';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Cuentas' };

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}

const ESTADOS_VALIDOS: readonly string[] = ['ACTIVE', 'SUSPENDED', 'INACTIVE'];

/** Las opciones del filtro, en el orden en que se piensan. */
const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'ACTIVE', etiqueta: ESTADOS.ACTIVE.etiqueta },
  { id: 'SUSPENDED', etiqueta: ESTADOS.SUSPENDED.etiqueta },
  { id: 'INACTIVE', etiqueta: ESTADOS.INACTIVE.etiqueta },
];

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
 *
 * ## Las tres consultas de más, y por qué se pagan
 *
 * ⚠️ El listado devuelve el `total` **de lo que se está viendo**, no el de la
 * plataforma: con un filtro puesto no hay forma de saber cuántas cuentas hay ni
 * cuántas están suspendidas sin preguntarlo aparte. Son tres consultas con
 * `limit=1` —solo interesa el contador— que salen en paralelo con la principal y
 * **degradan a `null` por separado**.
 *
 * Se pagan porque «¿hay algo mal ahora mismo?» es la pregunta con la que se abre
 * este panel, y antes había que filtrar por «Suspendidas» y leer el contador para
 * responderla. Tres contadores indexados a cambio de eso salen baratos.
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

  const api = createServerApiClient();

  const [listado, enTotal, suspendidas, bajas] = await Promise.all([
    /**
     * ⚠️ **Con su propio `catch`, igual que las tres cifras.** Sin él, que
     * admin-service estuviera caído tumbaba la pantalla entera con un 500 en
     * vez de enseñar la tabla vacía con un aviso — la misma trampa que ya
     * evitaban las tres cifras de al lado, pero se había colado justo en la
     * consulta principal.
     */
    api
      .get<AdminUserPage>(`/admin/users?${params.toString()}`)
      .catch(() => null),
    /* `limit=1`: de estas tres solo se mira el `total`. Y cada una con su propio
       `catch`: que no se pueda contar una no puede llevarse a las otras ni, mucho
       menos, tumbar el listado. */
    contar(api, '/admin/users?limit=1'),
    contar(api, '/admin/users?status=SUSPENDED&limit=1'),
    contar(api, '/admin/users?status=INACTIVE&limit=1'),
  ]);

  const items = listado?.items ?? [];
  const total = listado?.total ?? 0;

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
      <div data-tone="dark" className="flex w-full flex-col gap-6 pb-16">
        <AdminHeader
          titulo="Cuentas"
          descripcion="Quién puede entrar, con qué rol y con qué plan. Suspender es reversible; borrar no existe aquí."
          cifras={[
            /* El total va sin color de estado: es el tamaño de la plataforma, no
               una alarma. Los otros dos sí lo llevan, porque significan algo. */
            { etiqueta: 'En total', valor: enTotal, tono: colors.textPrimary },
            { etiqueta: 'Suspendidas', valor: suspendidas, tono: colors.error },
            { etiqueta: 'De baja', valor: bajas, tono: colors.warning },
          ]}
        />

        <FilterBar
          basePath="/"
          busqueda={busqueda}
          placeholder="Nombre, apellido o correo"
          filtros={FILTROS}
          filtroActivo={estadoFiltro}
          idTodos="todas"
          total={total}
          nombreSingular="cuenta"
          nombrePlural="cuentas"
        />

        {listado === null ? (
          <p className="rounded-xl border border-white/10 bg-surface px-6 py-16 text-center font-sans text-sm text-error">
            No se pudieron cargar las cuentas. Vuelve a intentarlo.
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-surface px-6 py-16 text-center font-sans text-sm text-white/50">
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

/**
 * Cuántas filas hay, sin traérselas.
 *
 * `limit=1` porque de la respuesta solo se lee `total`, y `null` cuando falla:
 * un contador que no se pudo leer **no es un cero**, y `AdminHeader` lo pinta
 * como «—» justamente para no decir «no hay ninguna suspendida» cuando lo que
 * pasa es que no se pudo preguntar.
 */
function contar(
  api: ReturnType<typeof createServerApiClient>,
  ruta: string,
): Promise<number | null> {
  return api
    .get<AdminUserPage>(ruta)
    .then((respuesta) => respuesta.total)
    .catch(() => null);
}
