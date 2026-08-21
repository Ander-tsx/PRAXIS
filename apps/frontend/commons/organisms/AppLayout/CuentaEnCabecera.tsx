import { Badge } from '../../atoms/Badge';
import { createServerApiClient } from '../../auth/server-client';
import { GlobalRoleBadges } from '../../molecules/GlobalRoleBadges';

/**
 * Quién eres, arriba a la derecha, en todas las pantallas.
 *
 * ## Por qué existe
 *
 * La esquina derecha de la cabecera estaba vacía en casi toda la aplicación: el
 * único sitio donde salía el rol global era Configuración, y el plan no se veía
 * en ninguna parte salvo entrando a buscarlo. Dos datos que valen justo para lo
 * contrario de lo que hacían — se consultan de reojo, no se van a buscar.
 *
 * ## Por qué es un componente de servidor y va por el layout
 *
 * El rol y el plan no cambian al navegar dentro de una zona, así que esto se
 * monta en el `layout.tsx` —que Next conserva entre pantallas— y no en cada
 * página. Ponerlo en las veinte páginas habría sido veinte sitios que actualizar
 * y una petición por navegación.
 *
 * `roles` llega por props porque el layout **ya los tiene**: `loadPrivateChrome()`
 * los devuelve. Pedirlos otra vez aquí sería un salto de red por gusto.
 *
 * ⚠️ **No se exporta desde ningún índice de `commons`.** Usa
 * `createServerApiClient`, que es código de servidor: si acabara en el barril
 * que importan los componentes de cliente, se colaría en el paquete del
 * navegador. Las zonas lo importan por su ruta completa.
 *
 * ## Lo que hace cuando algo falla
 *
 * Si la cuota no se puede leer —assistant-service caído— no se pinta ninguna
 * insignia de plan y ya está. Una cabecera sin ese dato es una cabecera normal;
 * una que dijera «FREE» porque no pudo preguntar sería una mentira sobre algo
 * que alguien está pagando.
 */
export async function CuentaEnCabecera({ roles }: { roles: readonly string[] }) {
  const cuota = await createServerApiClient()
    .get<{ plan: 'FREE' | 'PRO' }>('/me/assistant/quota')
    .catch(() => null);

  return (
    <>
      <GlobalRoleBadges roles={roles} />
      {cuota && (
        /* PRO destaca y FREE no: el plan de pago es la excepción, y una insignia
           que resalta lo que tiene todo el mundo no informa de nada. */
        <Badge variant={cuota.plan === 'PRO' ? 'accent' : 'primary'}>{cuota.plan}</Badge>
      )}
    </>
  );
}
