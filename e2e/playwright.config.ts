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

/**
 * Corta la ejecución si `E2E_GATEWAY_URL` o `E2E_SHELL_URL` apuntan a
 * producción.
 *
 * La suite registra más de 80 cuentas reales por corrida y —desde que
 * `MailService` sí manda cuando hay `MAIL_API_KEY`— cada alta intenta un
 * correo de verdad contra Resend. Las cuentas usan `@praxis.test`, que no
 * resuelve: cada correo rebota, y con el cupo diario compartido con
 * producción (100 en el plan gratuito) una sola corrida contra el sitio real
 * se lo come entero y deja a cualquier persona registrándose de verdad sin
 * poder confirmar su correo. Ya pasó: se quemaron 234 de los 3.000 mensuales
 * y el cupo diario en bounces de `@praxis.test`, justo cuando alguien
 * intentaba registrarse de verdad.
 *
 * `E2E_PERMITIR_PRODUCCION=1` es la única forma de saltárselo, y tiene que
 * ser explícito: un `.env` con la URL de producción copiada por error no
 * debe bastar para arrancar la corrida.
 */
function asegurarNoEsProduccion(url: string, variable: string): string {
  if (process.env.E2E_PERMITIR_PRODUCCION === '1') return url;

  const host = new URL(url).hostname;
  const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';

  if (!esLocal) {
    throw new Error(
      `${variable}=${url} no es local. La suite registra cuentas reales y quema el cupo de correo de producción — ver el comentario junto a esta función. Si de verdad quieres correrla contra ese destino, pon E2E_PERMITIR_PRODUCCION=1.`,
    );
  }

  return url;
}

const GATEWAY_URL = asegurarNoEsProduccion(
  process.env.E2E_GATEWAY_URL ?? 'http://localhost:3000',
  'E2E_GATEWAY_URL',
);
const SHELL_URL = asegurarNoEsProduccion(
  process.env.E2E_SHELL_URL ?? 'http://localhost:4100',
  'E2E_SHELL_URL',
);

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

  /**
   * 90 s por prueba, no 30.
   *
   * ⚠️ **No es holgura por si acaso: es exactamente la espera del límite de
   * login.** `/auth/login` acepta 10 intentos por minuto y por IP, y la suite se
   * los gasta sola — desde que registrarse dejó de abrir sesión, cada una de las
   * 84 cuentas que crea necesita un login. Cuando se topa, `intentarLogin()`
   * espera 61 s y reintenta; con el tope en 30 s la prueba moría **a mitad de esa
   * espera**, y el fallo salía como un timeout limpio que no apunta a nada.
   *
   * 120 s y no 90: en el navegador hay que sumar el alta, la confirmación y los
   * dos intentos de login alrededor de esa misma espera de 61 s.
   *
   * Se ve enseguida si vuelve a pasar: varias pruebas fallando **todas a los
   * 30.0 s exactos** no es un problema de código, es el reloj.
   */
  timeout: 120_000,
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
        /**
         * 🔴 **Chromium completo, no `chromium-headless-shell`.** Es el que usa
         * Playwright por defecto en modo sin ventana, y no produce fotogramas:
         * `requestAnimationFrame` no avanza y una View Transition no termina
         * nunca. React 19.2 revela lo que llega por streaming dentro de una, así
         * que en esas pruebas la página quedaba a medias —el contenido servido,
         * oculto en un `<div hidden id="S:…">` al final del `<body>`, y una copia
         * pintada por el cliente— y **toda transición posterior esperaba a ese
         * límite pendiente**: el resultado de una Server Action no llegaba nunca,
         * el panel de «Crear regla» no se cerraba y `getByText` encontraba el
         * texto dos veces. Ninguna persona con la pestaña a la vista lo sufre.
         */
        channel: 'chromium',
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
