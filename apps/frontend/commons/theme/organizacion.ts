import { cookies } from 'next/headers';

/**
 * Qué organización se está mirando, **en una cookie y leída en el servidor**.
 *
 * ## Por qué vive aquí, junto al tema y a la barra plegada
 *
 * Por lo mismo que aquellas dos: es una preferencia que el servidor tiene que
 * conocer **al pintar**, o parpadea. Si la organización activa saliera de
 * `localStorage`, cada carga serviría la lista de proyectos de todas y luego la
 * recortaría tras hidratar — y en Multi-Zones cada cambio de zona es una carga
 * completa de página, así que pasaría constantemente.
 *
 * ⚠️ `path: '/'` por lo mismo que las otras dos: el navegador ve un único origen
 * —el del web-shell— y las siete zonas tienen que leer la misma cookie. Sin eso,
 * cambiar de organización en el panel no la cambiaría en proyectos.
 *
 * ## 🔴 No es una credencial, y por eso no protege nada
 *
 * No es `httpOnly`: la escribe el selector desde el cliente, y cualquiera puede
 * poner ahí el identificador que quiera. **El servidor la trata como un filtro,
 * nunca como un permiso**: `GET /projects?organizationId=…` se suma al filtro de
 * «dueño o miembro» que ya había, no lo sustituye. Escribir el identificador de
 * una empresa ajena en esta cookie devuelve exactamente cero proyectos, que es
 * lo correcto — no los suyos.
 *
 * Es la misma regla de siempre: la pantalla acota lo que enseña, el servidor
 * decide lo que hay.
 */
export const ORG_COOKIE = 'praxis_org';

/** Un año: es una preferencia de la persona, no una sesión. */
export const ORG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Lo que hay escrito en la cookie, **en crudo y sin comprobar**.
 *
 * Solo desde Server Components, layouts o Server Actions.
 *
 * ⚠️ **Casi nunca es lo que quieres.** Devuelve lo que puso el navegador, que
 * puede ser una organización de la que ya te fueron, una que nunca fue tuya o
 * nada en absoluto. Quien pinta una pantalla quiere `resolverOrganizacionActiva`,
 * que además repliega. Esto se exporta para el propio `resolver` y para las
 * pruebas.
 */
export async function getOrganizacionActiva(): Promise<string | null> {
  const store = await cookies();
  const valor = store.get(ORG_COOKIE)?.value?.trim();
  return valor ? valor : null;
}

/** Lo mínimo que hace falta de una organización para poder elegirla. */
interface OrganizacionElegible {
  id: string;
  kind?: 'PERSONAL' | 'ENTERPRISE';
}

/**
 * Qué organización se está mirando **de verdad**.
 *
 * ## 🔴 Ya no existe «todas»
 *
 * Hasta 2026-08-28, `null` significaba «todas tus organizaciones» y era lo que
 * veía quien no había tocado el selector. Se retiró a propósito: mientras
 * existía, cada pantalla que necesitaba una organización concreta —Suscripción,
 * Roles y permisos— tenía que volver a preguntarla, y elegirla dos veces para la
 * misma sesión es exactamente el roce que esta etapa viene a quitar.
 *
 * Ahora siempre hay una. Sin cookie, la **personal**, que todo el mundo tiene.
 *
 * ## Y por eso hace falta replegar
 *
 * ⚠️ **Una cookie puede apuntar a una organización que ya no es tuya**: te
 * fueron del equipo, o se borró. Con el «todas» eso se absorbía solo —se veía
 * todo—; sin él, la pantalla se quedaría vacía en todas partes y las de
 * organización responderían `403 NOT_IN_ORG`, sin que nada dijera por qué.
 *
 * Así que se comprueba contra la lista que la barra lateral ya trae en cada
 * carga (`loadPrivateChrome`), y si no está, se cae en la personal. No cuesta
 * ninguna petición: la lista ya estaba pedida.
 *
 * ⚠️ **Esto no autoriza nada, y no puede.** Sigue siendo un filtro sobre lo que
 * ya puedes ver: la lista viene del servidor, sí, pero quien decide lo que hay
 * es cada endpoint con su guard. Ver la nota de arriba sobre la cookie.
 */
export function resolverOrganizacionActiva(
  organizaciones: OrganizacionElegible[],
  cookieId: string | null,
): string | null {
  if (cookieId && organizaciones.some((organizacion) => organizacion.id === cookieId)) {
    return cookieId;
  }

  const personal = organizaciones.find((organizacion) => organizacion.kind === 'PERSONAL');
  /* La personal primero, y la primera de la lista como último recurso: si por lo
     que sea no hubiera personal, dejar esto en `null` devolvería el «todas» que
     acabamos de quitar. `null` solo si no hay ninguna. */
  return personal?.id ?? organizaciones[0]?.id ?? null;
}
