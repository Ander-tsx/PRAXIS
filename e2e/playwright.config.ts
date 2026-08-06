import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de las pruebas end-to-end de PRAXIS.
 *
 * ## Por qué Playwright y no Cypress
 *
 * PRAXIS es un multi-zone: el navegador vive en el origen del shell (4100) pero
 * cada zona se sirve desde su propio puerto por detrás de un `rewrite()`. Y la
 * sesión vive en una cookie **httpOnly**, que el JS de la página no puede leer.
 *
 * Eso descarta a Cypress por dos motivos concretos:
 *
 * 1. Cypress corre dentro del propio navegador y arrastra restricciones de
 *    origen que el multi-zone provoca constantemente.
 * 2. La mitad de lo que hay que verificar aquí **no es interfaz**: es el
 *    contrato del gateway —el sobre `{success,data,meta}`, los guards, la
 *    semántica de los tokens—. Playwright ejecuta pruebas de API y de navegador
 *    en la misma suite, con el mismo runner y el mismo informe. Cypress
 *    necesitaría una segunda herramienta.
 *
 * ## Los dos proyectos
 *
 * - `api` — contra el gateway (3000). Sin navegador, milisegundos por prueba.
 *   Cubre autenticación, autorización y el contrato de respuesta.
 * - `ui`  — contra el shell (4100), en Chromium. Cubre los guards de zona, el
 *   recorrido de login y la navegación entre zonas.
 *
 * `api` corre primero: si el contrato está roto, los fallos de interfaz que
 * vengan detrás son ruido derivado y no información nueva.
 *
 * ⚠️ **El orden se consigue declarando `api` antes, no con `dependencies`.**
 * Un proyecto listado en `dependencies` se ejecuta **entero, ignorando los
 * filtros**: con `dependencies: ['api']` puesto, `--grep-invert @security`
 * devolvía las 95 pruebas en lugar de las 81, porque `api` entraba como
 * dependencia y el filtro no le aplicaba. Eso rompía justo lo que separa la red
 * de seguridad del endurecimiento, que es el motivo de tener etiquetas.
 */

const GATEWAY_URL = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000';
const SHELL_URL = process.env.E2E_SHELL_URL ?? 'http://localhost:4100';

export default defineConfig({
  testDir: './tests',

  /**
   * Barrido de las cuentas que crea la suite.
   *
   * Cada prueba se registra la suya para aislarse, y eso deja más de cien por
   * ejecución en una base de desarrollo compartida. Sin esto se acumulan hasta
   * falsear cualquier listado — y una vez llegaron a romper la pestaña Equipo.
   * Ver `limpieza.ts`.
   */
  globalTeardown: './limpieza.ts',

  /**
   * Sin paralelismo entre archivos.
   *
   * Las pruebas comparten una base de datos real y varias tocan cuota, límite
   * de intentos y sesión —estado global por usuario—. En paralelo se pisan y
   * producen fallos que no se reproducen, que es peor que no tener prueba.
   */
  fullyParallel: false,
  workers: 1,

  /** Un `.only` olvidado no debe dar verde en CI. */
  forbidOnly: !!process.env.CI,

  /**
   * Cero reintentos a propósito, también en CI. Una prueba que solo pasa al
   * segundo intento está informando de una carrera real; ocultarla con un
   * retry es tirar el dato.
   */
  retries: 0,

  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: GATEWAY_URL },
    },
    {
      name: 'ui',
      testDir: './tests/ui',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: SHELL_URL,
        /**
         * El shell y las zonas se sirven en HTTP en local. Sin esto, la cookie
         * de sesión —que lleva `secure` fuera de desarrollo— no se guardaría.
         */
        ignoreHTTPSErrors: true,
      },
    },
  ],
});
