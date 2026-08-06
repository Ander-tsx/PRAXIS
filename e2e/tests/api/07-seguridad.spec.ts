import { expect, test } from '@playwright/test';
import { comoBearer, correoUnico, data, registrar } from '../../fixtures/api';
import { crearMundo } from '../../fixtures/mundo';

/**
 * # Endurecimiento — etiquetadas `@security`
 *
 * ⚠️ **Estas pruebas describen el comportamiento que queremos, no el que había.**
 * Nacieron en rojo, a propósito: cada una fija un hallazgo de la auditoría del
 * 2026-08-05 y se pone verde cuando ese hallazgo se corrige.
 *
 * Por eso viven aparte del resto y llevan etiqueta:
 *
 * - `pnpm --filter @praxis/e2e test:regresion` — todo **menos** esto. Es la red
 *   de seguridad: verde antes de tocar nada y verde después.
 * - `pnpm --filter @praxis/e2e test:seguridad` — solo esto. Mide el avance del
 *   endurecimiento.
 *
 * Mezclarlas sería perder las dos señales a la vez: un rojo esperado tapa un
 * rojo nuevo.
 */

/** Lee el payload de un JWT sin verificar la firma. Para inspección, no para confiar. */
function payloadDe(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

test.describe('Semántica de los tokens', () => {
  /**
   * 🔴 **Hallazgo 1 — el refresh token es un access token.**
   *
   * `signAccess` y `signRefresh` firman `{ sub }` con el mismo secreto y la
   * única diferencia es `expiresIn`. El `JwtGuard` solo comprueba firma y `exp`,
   * así que el token de 7 días abre toda la API igual que el de 15 minutos.
   *
   * Eso anula la contención: la ventana de 15 minutos existe precisamente para
   * limitar el daño de un token robado, y al lado viaja uno de una semana con
   * los mismos poderes.
   */
  test('el refresh token no vale como Bearer @security', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/users/me', {
      headers: comoBearer(usuario.refreshToken),
    });

    expect(
      respuesta.status(),
      'Un refresh token no debe abrir rutas de negocio: son tokens distintos con propósitos distintos',
    ).toBe(401);
  });

  test('los tokens se distinguen por un claim de tipo @security', async ({ request }) => {
    const usuario = await registrar(request);

    const acceso = payloadDe(usuario.accessToken);
    const refresco = payloadDe(usuario.refreshToken);

    /* Sin un claim que los separe, «distinguirlos» solo se puede hacer por la
       duración, y eso no es una comprobación: es una coincidencia. */
    expect(acceso.typ, 'El access token debería declararse como tal').toBe('access');
    expect(refresco.typ, 'El refresh token debería declararse como tal').toBe('refresh');
  });

  test('el access token sigue funcionando con normalidad @security', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.get('/api/users/me', {
      headers: comoBearer(usuario.accessToken),
    });

    /* La otra mitad del cambio: separar los tokens no puede romper el normal.
       Esta ya estaba verde y tiene que seguirlo. */
    expect(respuesta.status()).toBe(200);
  });

  test('el access token no se acepta en /auth/refresh @security', async ({ request }) => {
    const usuario = await registrar(request);

    const respuesta = await request.post('/api/auth/refresh', {
      data: { refreshToken: usuario.accessToken },
    });

    /* La confusión en el sentido contrario. Menos grave —no escala privilegios—
       pero es el mismo fallo de diseño y se cierra con el mismo claim. */
    expect(respuesta.status(), 'Un access token no es canjeable por otro').toBe(401);
  });
});

/**
 * 🔴 **Hallazgo 0 — el más grave, y no estaba en la auditoría inicial: lo
 * encontraron estas pruebas.**
 *
 * `ProjectPermissionGuard` **deja pasar cuando el handler no declara permiso**:
 *
 * ```ts
 * if (!requiredPermission) return true;
 * ```
 *
 * Es lo correcto para las rutas de `/me/*`, que ya están acotadas al usuario del
 * token. Pero cinco rutas anidadas bajo un proyecto se quedaron sin el decorador
 * `@RequireProjectPermission`, y ahí esa línea significa «cualquiera con sesión».
 *
 * `GET /projects/:id` responde 403 a un extraño, como debe. Sus rutas hermanas
 * responden **200**: la lista de miembros con sus roles y su matriz de permisos
 * completa, los nombres de los espacios y los de los tableros. Solo el contenido
 * de las tareas queda protegido.
 *
 * Basta con un UUID —que viaja en cualquier URL compartida— y una cuenta
 * cualquiera, que se crea sola con `POST /auth/register`.
 */
type Mundo = Awaited<ReturnType<typeof crearMundo>>;

/** Las cinco rutas anidadas que hoy responden 200 a cualquiera con sesión. */
const RUTAS_QUE_DEBEN_DENEGAR: { nombre: string; ruta: (m: Mundo) => string }[] = [
  { nombre: 'miembros del proyecto', ruta: (m) => `/api/projects/${m.proyecto.id}/members` },
  { nombre: 'espacios del proyecto', ruta: (m) => `/api/projects/${m.proyecto.id}/workspaces` },
  { nombre: 'detalle del espacio', ruta: (m) => `/api/workspaces/${m.workspaceId}` },
  { nombre: 'tableros del espacio', ruta: (m) => `/api/workspaces/${m.workspaceId}/boards` },
  { nombre: 'detalle del tablero', ruta: (m) => `/api/boards/${m.boardId}` },
];

test.describe('Control de acceso en rutas anidadas', () => {
  for (const caso of RUTAS_QUE_DEBEN_DENEGAR) {
    test(`un extraño no puede leer ${caso.nombre} @security`, async ({ request }) => {
      const mundo = await crearMundo(request);
      const intrusa = await registrar(request);

      const respuesta = await request.get(caso.ruta(mundo), {
        headers: comoBearer(intrusa.accessToken),
      });

      expect(
        [403, 404],
        `Fuga de datos: llegó ${respuesta.status()} en ${caso.ruta(mundo)}`,
      ).toContain(respuesta.status());
    });
  }

  test('el miembro legítimo sigue leyendo lo suyo @security', async ({ request }) => {
    const mundo = await crearMundo(request);

    /* La otra mitad: cerrar la fuga no puede cerrar la puerta a quien sí entra.
       Sin esta prueba, «denegar siempre» daría verde en las cinco de arriba. */
    for (const caso of RUTAS_QUE_DEBEN_DENEGAR) {
      const respuesta = await request.get(caso.ruta(mundo), {
        headers: comoBearer(mundo.duenno.accessToken),
      });
      expect(respuesta.status(), `El dueño debería poder leer ${caso.nombre}`).toBe(200);
    }
  });

  /**
   * El mismo fallo por la otra cara: `MembersController` y `WorkspacesController`
   * leen `@Param('projectId')` **en crudo** en vez de `req.projectId`, que es lo
   * que el guard deja ya traducido.
   *
   * Con un slug en la ruta el guard lo resuelve y concede, pero al microservicio
   * le llega la cadena literal: responde **200 con una lista vacía**. Nadie ve un
   * error; se ve un desplegable en blanco, que es la forma de fallo más cara de
   * diagnosticar.
   */
  test('una ruta anidada con slug no devuelve una lista vacía en silencio @security', async ({
    request,
  }) => {
    const mundo = await crearMundo(request);
    const cabeceras = comoBearer(mundo.duenno.accessToken);

    const porId = await request.get(`/api/projects/${mundo.proyecto.id}/members`, {
      headers: cabeceras,
    });
    const miembrosPorId = await data<unknown[]>(porId);
    expect(miembrosPorId.length, 'El dueño siempre es miembro').toBeGreaterThan(0);

    const porSlug = await request.get(`/api/projects/${mundo.proyecto.slug}/members`, {
      headers: cabeceras,
    });

    if (porSlug.status() === 200) {
      const miembrosPorSlug = await data<unknown[]>(porSlug);
      expect(
        miembrosPorSlug.length,
        'Si la ruta responde 200 con el slug, tiene que devolver los mismos datos que con el UUID',
      ).toBe(miembrosPorId.length);
    } else {
      expect([400, 404]).toContain(porSlug.status());
    }
  });
});

test.describe('Límite de intentos', () => {
  /**
   * 🔴 **Hallazgo 3 — el rate limiting está configurado y desconectado.**
   *
   * `AppModule` importa `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`
   * pero **no registra el `ThrottlerGuard`** en ningún sitio: ni `APP_GUARD` ni
   * `@UseGuards`. La política existe y nada la aplica, así que `/auth/login`
   * acepta intentos ilimitados contra bcrypt.
   */
  test('el login corta tras varios intentos fallidos seguidos @security', async ({ request }) => {
    const email = correoUnico('fuerza-bruta');

    let ultimoEstado = 0;
    const estados: number[] = [];

    /* 14 intentos contra un límite de 10/min: el margen evita que un test
       marginalmente más lento dé un falso verde. */
    for (let intento = 0; intento < 14; intento++) {
      const respuesta = await request.post('/api/auth/login', {
        data: { email, password: `Incorrecta${intento}@12345!` },
      });
      ultimoEstado = respuesta.status();
      estados.push(ultimoEstado);

      if (ultimoEstado === 429) break;
    }

    expect(
      ultimoEstado,
      `Ningún intento fue limitado. Códigos recibidos: ${estados.join(', ')}`,
    ).toBe(429);
  });
});

test.describe('Cabeceras de respuesta', () => {
  /**
   * 🔴 **Hallazgo 5 — el gateway no pone cabeceras de seguridad.**
   *
   * Sin `helmet` no hay `nosniff`, ni `X-Frame-Options`, ni HSTS. Hoy el impacto
   * es limitado porque el navegador nunca habla directo con el gateway, pero la
   * descarga de adjuntos sí devuelve bytes de usuario y depende de que su propio
   * `nosniff` esté puesto a mano en ese controlador.
   */
  test('el gateway responde con nosniff @security', async ({ request }) => {
    const respuesta = await request.post('/api/auth/login', {
      data: { email: 'nadie@praxis.test', password: 'NoExiste@12345!' },
    });

    expect(
      respuesta.headers()['x-content-type-options'],
      'helmet debería estar montado en main.ts',
    ).toBe('nosniff');
  });

  test('el gateway no anuncia que es Express @security', async ({ request }) => {
    const respuesta = await request.get('/api/users/me');

    /* `X-Powered-By` regala la pila a quien busca exploits conocidos. helmet lo
       quita por defecto. */
    expect(respuesta.headers()['x-powered-by']).toBeUndefined();
  });
});
