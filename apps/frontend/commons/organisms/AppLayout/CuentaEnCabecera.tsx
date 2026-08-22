import { Badge } from '../../atoms/Badge';
import { createServerApiClient } from '../../auth/server-client';
import type { BillingSummary } from '../../billing/planes';
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
 * Si el plan no se puede leer no se pinta ninguna insignia y ya está. Una
 * cabecera sin ese dato es una cabecera normal; una que dijera «FREE» porque no
 * pudo preguntar sería una mentira sobre algo que alguien está pagando.
 *
 * ## De dónde sale el plan
 *
 * ⚠️ **De `/me/billing/resumen`, y antes salía de la cuota del asistente.** Ese
 * endpoint devuelve el plan de `AssistantSubscription`, que solo conoce FREE y
 * PRO: desde que hay cinco, a alguien con Plus le ponía «FREE» y a quien tiene
 * el plan de su empresa, también — la insignia decía que no paga nadie justo en
 * la esquina que se mira de reojo. El plan efectivo lo resuelve billing, que es
 * el único que sabe mirar todas tus organizaciones.
 */
export async function CuentaEnCabecera({ roles }: { roles: readonly string[] }) {
  const resumen = await createServerApiClient()
    .get<BillingSummary>('/me/billing/resumen')
    .catch(() => null);

  return (
    <>
      <GlobalRoleBadges roles={roles} />
      {resumen && (
        /* Lo de pago destaca y el gratuito no: es la excepción, y una insignia
           que resalta lo que tiene todo el mundo no informa de nada. */
        <Badge variant={resumen.tier === 'FREE' ? 'primary' : 'accent'}>
          {NOMBRE_CORTO[resumen.tier]}
        </Badge>
      )}
    </>
  );
}

/**
 * El plan en una palabra, para una insignia de la cabecera.
 *
 * ⚠️ **No se pide el catálogo para esto.** El nombre bueno vive en `PLANS`, sí,
 * pero traerlo aquí sería una llamada más en **cada zona y cada navegación**
 * para escribir una palabra que no cambia. Si algún día se renombra un plan,
 * esta tabla es el segundo sitio que hay que tocar y está dicho aquí.
 */
const NOMBRE_CORTO: Record<string, string> = {
  FREE: 'Gratis',
  PLUS: 'Plus',
  PRO: 'Pro',
  TEAM: 'Equipo',
  BUSINESS: 'Empresa',
};
