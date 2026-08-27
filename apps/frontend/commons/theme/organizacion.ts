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
 * La organización activa, si hay alguna elegida.
 *
 * Solo desde Server Components, layouts o Server Actions.
 *
 * ⚠️ Devuelve `null` cuando no hay cookie, y **eso significa «todas»**, no «la
 * personal». Es lo que hace que quien nunca ha tocado el selector siga viendo
 * todos sus proyectos, que es lo que veía antes de que esto existiera.
 */
export async function getOrganizacionActiva(): Promise<string | null> {
  const store = await cookies();
  const valor = store.get(ORG_COOKIE)?.value?.trim();
  return valor ? valor : null;
}
