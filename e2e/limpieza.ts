import { request } from '@playwright/test';
import { SEED } from './fixtures/api';

/**
 * Barrido final: borra las cuentas que creó la suite.
 *
 * ## Por qué existe
 *
 * Cada prueba se aísla registrando su propia cuenta —es lo que evita que una
 * ensucie a la siguiente— y eso deja **más de cien cuentas por ejecución** en la
 * base de desarrollo, que es compartida.
 *
 * Lo que parecía inofensivo no lo era: la pantalla de proyecto resolvía los
 * nombres de sus miembros contra `/users?limit=100`, la primera página del
 * directorio de toda la plataforma. Con la base llena de cuentas de usar y
 * tirar, los miembros de verdad dejaron de caber ahí y la pestaña Equipo pasó a
 * enseñar UUIDs crudos y «Correo no disponible», con el selector de encargados
 * vacío. Un rato de diagnóstico para algo que era basura de las pruebas.
 *
 * Ese fallo ya está corregido de raíz —ahora se piden solo los ids que hacen
 * falta— pero **dejar 1800 cuentas muertas seguía siendo un mal vecino**: falsea
 * cualquier listado, cualquier búsqueda y cualquier contador que se mire a ojo.
 *
 * ## Qué borra, y qué no
 *
 * Solo cuentas con correo `@praxis.test`, que es el dominio que usa
 * `correoUnico()` y **nada más en el repositorio**. Las cuentas de los seeds
 * (`@praxis.dev`) y las de personas reales no se tocan.
 *
 * No aborta la ejecución si algo falla: un barrido a medias es un incordio, un
 * `globalTeardown` que tumba una suite verde es peor.
 *
 * ## ⚠️ Lo que **no** limpia: los proyectos
 *
 * `DELETE /users/:id` borra la cuenta, pero **sus proyectos se quedan**: viven
 * en otro servicio, con su propio esquema, y no hay clave foránea entre los dos
 * que arrastre la cascada. Cada ejecución deja ~130 proyectos sin dueño.
 *
 * No rompen nada —`GET /projects` filtra por dueño o miembro, y ninguno de los
 * dos existe ya, así que no le salen a nadie— pero ocupan sitio y engordan la
 * base con el tiempo. Para vaciarla del todo, `pnpm prisma:reset`.
 *
 * Se limpian las cuentas y no los proyectos porque el daño real estaba ahí: el
 * directorio de usuarios es lo que consultan varias pantallas, y llenarlo de
 * basura sí se veía.
 */
export default async function limpiarCuentasDePrueba(): Promise<void> {
  const gateway = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000';
  const api = await request.newContext({ baseURL: gateway });

  try {
    /**
     * ⚠️ El barrido corre justo después de la prueba de fuerza bruta, que deja
     * la IP frenada un minuto a propósito. Sin esta espera, el `globalTeardown`
     * se rendía siempre en la ejecución completa — y el barrido no ocurría nunca
     * salvo lanzando la suite a trozos.
     */
    let entrada = await api.post('/api/auth/login', { data: SEED.admin });

    if (entrada.status() === 429) {
      await new Promise((listo) => setTimeout(listo, 61_000));
      entrada = await api.post('/api/auth/login', { data: SEED.admin });
    }

    if (!entrada.ok()) {
      console.warn('[limpieza] no se pudo entrar como admin; se deja la base como está');
      return;
    }

    const { data } = await entrada.json();
    const cabeceras = { Authorization: `Bearer ${data.accessToken}` };

    /* Se pagina hasta agotar: `limit` está topado en 100 por el DTO, y una
       ejecución larga deja bastantes más. Siempre se pide la página 1 porque
       cada borrado corre la lista. */
    let borradas = 0;
    for (let vuelta = 0; vuelta < 60; vuelta++) {
      const listado = await api.get('/api/users?page=1&limit=100', { headers: cabeceras });
      if (!listado.ok()) break;

      const { data: pagina } = await listado.json();
      const desechables = (pagina.items as { id: string; credential: { email: string } }[]).filter(
        (u) => u.credential.email.endsWith('@praxis.test'),
      );

      if (desechables.length === 0) break;

      for (const usuario of desechables) {
        const borrado = await api.delete(`/api/users/${usuario.id}`, { headers: cabeceras });
        if (borrado.ok()) borradas++;
      }
    }

    if (borradas > 0) console.log(`[limpieza] ${borradas} cuentas de prueba retiradas`);
  } catch (fallo) {
    console.warn(`[limpieza] barrido incompleto: ${(fallo as Error).message}`);
  } finally {
    await api.dispose();
  }
}
