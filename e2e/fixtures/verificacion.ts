import { Client } from 'pg';

/**
 * Confirmar el correo de una cuenta recién creada, desde las pruebas.
 *
 * ## Por qué esto existe y por qué toca la base directamente
 *
 * Desde `2bc9983`, registrarse **ya no abre sesión**: la cuenta nace sin
 * confirmar y `POST /auth/login` responde 403 `EMAIL_NOT_VERIFIED`. La única
 * forma de confirmarla por la API es `POST /auth/verify-email` con el token del
 * enlace, y ese token **no se puede obtener**: se guarda como SHA-256
 * (`AuthToken.tokenHash`) y en claro solo existe dentro del correo.
 *
 * O sea: hay un paso fuera de banda —abrir un correo— que una prueba automática
 * no puede dar. Cuando eso pasa, lo honesto es saltárselo por el camino más
 * corto y decirlo, en vez de abrir una puerta trasera en la API «solo para
 * pruebas» que acabaría existiendo también en producción.
 *
 * ⚠️ **Esto es lo único que las pruebas hacen sin pasar por la API.** Todo lo
 * demás —permisos, aislamiento entre cuentas, validaciones— se ejercita contra
 * el gateway igual que lo haría un navegador. Si algún día hay que tocar la base
 * para otra cosa, es señal de que falta un endpoint, no de que este archivo
 * tenga que crecer.
 *
 * Es también el motivo de que `pg` sea la única dependencia de este paquete
 * aparte de Playwright.
 */

/**
 * La misma base que usa el stack.
 *
 * `credentials` como esquema por defecto porque es donde vive la tabla. La URL
 * se puede sobrescribir para apuntar a otro entorno.
 */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  /* Las mismas credenciales por defecto que `docker-compose.yml` y que el
     `.env` de credentials-service. Si el stack corre en otro sitio, se cambia
     con `E2E_DATABASE_URL` en vez de tocar esto. */
  'postgresql://praxis:praxis123@localhost:5432/praxis?schema=credentials';

/**
 * Marca una cuenta como confirmada.
 *
 * Se escribe `emailVerifiedAt` en vez de insertar un token y llamar a
 * `verify-email`: el resultado es idéntico —lo que mira el login es esa columna—
 * y por el otro camino habría que replicar el cálculo del hash y la caducidad,
 * que son detalles internos de credentials-service y cambiarían sin avisar.
 *
 * Abre y cierra la conexión en cada llamada. Son unos milisegundos y evita tener
 * que coordinar el cierre de un cliente compartido con el ciclo de vida de
 * Playwright, que ejecuta los archivos en paralelo y en procesos distintos.
 */
export async function confirmarCorreo(email: string): Promise<void> {
  const cliente = new Client({ connectionString: DATABASE_URL });
  await cliente.connect();

  try {
    const resultado = await cliente.query(
      'UPDATE credentials.credentials SET "emailVerifiedAt" = NOW() WHERE email = $1',
      [email],
    );

    if (resultado.rowCount === 0) {
      throw new Error(
        `No se pudo confirmar ${email}: no existe esa credencial. ` +
          '¿Falló el registro justo antes?',
      );
    }
  } finally {
    await cliente.end();
  }
}
