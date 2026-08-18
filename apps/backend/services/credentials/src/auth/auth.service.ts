import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { type LoginTicket, OAuth2Client, type TokenPayload } from 'google-auth-library';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TokensService } from './tokens.service';

import {
  GoogleLoginDto,
  JwtPayloadDto,
  LoginDto,
  RegisterDto,
  VerifyTokenDto,
} from '@praxis/contracts';

const SALT_ROUNDS = 10;
const TOKEN_CACHE_TTL = 300; // 5 min
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 días

/**
 * 🔴 **Una persona puede tener varias sesiones abiertas a la vez.**
 *
 * Antes no: la sesión vivía en `auth:session:<userId>` con **un solo** refresh
 * token dentro, y cada entrada lo sobrescribía. Consecuencia, y era el
 * síntoma que se reportaba como «se me cierra la sesión sola»:
 *
 * > Entras en el portátil. Al rato entras en el móvil, o en otro navegador, o
 * > vuelves a entrar en una ventana de incógnito. El refresh guardado pasa a
 * > ser el de la última entrada. El portátil no se entera de nada hasta que su
 * > access token cumple 15 minutos: entonces intenta renovar, el gateway
 * > responde «refresh token no válido», y `refresh-proxy.ts` —que hace lo
 * > correcto: un rechazo significa sesión muerta— borra las cookies. Te ha
 * > echado **la otra entrada tuya**, con quince minutos de retraso para que no
 * > se pueda relacionar una cosa con la otra.
 *
 * Ahora la clave es un **hash con un campo por sesión**: `auth:sessions:<userId>`
 * → `{ <jti>: <refreshToken> }`. Cada entrada añade su campo en vez de pisar el
 * de las demás, y el `jti` que las distingue viaja dentro del propio refresh
 * token, así que quien lo presenta dice **cuál** de las sesiones es.
 *
 * Se gana además lo que se pierde con una clave por usuario:
 *
 * | Gesto | Antes | Ahora |
 * |---|---|---|
 * | Cerrar sesión en un sitio | Cerraba en todos | Cierra solo ese (`HDEL`) |
 * | Suspender o borrar la cuenta | `DEL` | `DEL` — sigue cerrando todas de un golpe |
 * | Saber si la sesión existe | `GET` | `EXISTS` |
 *
 * ⚠️ **El nombre de la clave cambia** (`auth:session:` → `auth:sessions:`) a
 * propósito: la vieja guardaba una cadena JSON y `HSET` sobre una clave de tipo
 * cadena responde `WRONGTYPE`. Con un nombre nuevo no hay migración que
 * escribir; las viejas caducan solas en 7 días. El precio es que **al desplegar
 * esto, todo el mundo entra una vez más**.
 */
function claveDeSesiones(userId: string): string {
  return `auth:sessions:${userId}`;
}

/**
 * Valores del claim `typ`. El gateway compara contra el primero; `refresh()`,
 * contra el segundo. Si cambian aquí, hay que cambiarlos en `jwt.guard.ts`.
 */
export const TOKEN_ACCESO = 'access';
export const TOKEN_REFRESCO = 'refresh';

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  /**
   * El cliente de Google se crea una sola vez y se reutiliza: mantiene en
   * memoria las claves públicas con las que verifica las firmas. Crearlo por
   * petición obligaría a volver a pedírselas a Google en cada entrada.
   */
  private clienteGoogle?: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokens: TokensService,
  ) {}

  private tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * ⚠️ **El claim `typ` es lo que separa los dos tokens.**
   *
   * Los dos se firman con el mismo secreto y el mismo `sub`, así que sin él la
   * única diferencia era la duración — y eso no lo puede comprobar nadie. El
   * `JwtGuard` del gateway solo valida firma y `exp`, de modo que el refresh
   * token de 7 días abría toda la API igual que el de 15 minutos: la ventana
   * corta, que existe justo para limitar el daño de un token robado, no
   * contenía nada.
   *
   * A partir de aquí, cada token dice para qué sirve y quien lo recibe lo
   * comprueba: el gateway exige `access`, y `refresh()` exige `refresh`.
   */
  private async signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, typ: TOKEN_ACCESO });
  }

  /**
   * Firma un refresh token **con su propio identificador de sesión** (`jti`).
   *
   * Es lo que permite que convivan varias: el `jti` es el campo del hash donde
   * se guarda esta sesión y solo esta, así que entrar desde otro sitio ya no
   * pisa la de aquí. Sin él, todos los refresh de una persona eran
   * indistinguibles entre sí salvo por el valor completo del token.
   */
  private async signRefresh(userId: string): Promise<{ token: string; jti: string }> {
    const expiresIn = this.config.get<any>('REFRESH_TOKEN_EXPIRES_IN', '7d');
    const jti = crypto.randomUUID();
    const token = await this.jwt.signAsync(
      { sub: userId, typ: TOKEN_REFRESCO, jti },
      { expiresIn },
    );
    return { token, jti };
  }

  /**
   * Abre una sesión: guarda su refresh token en el campo que le toca y estira
   * el plazo de la clave entera.
   *
   * El `EXPIRE` va sobre el hash completo, así que **la clave dura lo que dure
   * la sesión más reciente**. Un campo suelto no puede caducar por su cuenta en
   * Redis, pero tampoco hace falta: el token que hay dentro lleva su propio
   * `exp` y `refresh()` lo verifica antes de mirar aquí.
   */
  private async guardarSesion(userId: string, jti: string, refreshToken: string): Promise<void> {
    const clave = claveDeSesiones(userId);
    await this.redis.hset(clave, jti, refreshToken);
    await this.redis.expire(clave, SESSION_TTL);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.credential.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'El email ya está registrado',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const credential = await this.prisma.credential.create({
      data: {
        email: dto.email,
        passwordHash,
        user: {
          create: {
            firstName: '',
            lastName: '',
          },
        },
      },
      include: { user: true },
    });

    if (!credential.user) {
      throw new Error('User profile not found');
    }

    const userId = credential.user.id;

    /**
     * ⚠️ **Registrarse ya no inicia sesión.**
     *
     * Devolvía tokens en el acto, y con la confirmación de correo puesta eso
     * sería la puerta trasera que la anula: bastaría con registrarse y quedarse
     * dentro sin abrir el correo jamás. Ahora se manda el enlace y se entra por
     * el login, como todo el mundo.
     *
     * El envío va sin `await` a propósito: la respuesta no puede depender de que
     * el proveedor de correo esté rápido, y `enviar` no lanza nunca. Si falla,
     * el token queda emitido y «reenviar» lo repite.
     */
    /**
     * ⚠️ **El `.catch()` no sobra, aunque `MailService.enviar` sí trague.**
     *
     * `enviarVerificacion` hace dos cosas, y solo una es el correo: antes llama
     * a `emitir()`, que **escribe en la base**. Esa sí puede rechazar —un hipo
     * de Postgres, el pool agotado— y como esto no se espera, el rechazo cae
     * fuera de cualquier `try` de este método y llega a `unhandledRejection`,
     * que en Node **mata el proceso**.
     *
     * O sea: una base con un tropiezo durante un alta se llevaba por delante
     * credentials-service entero, y con él la autenticación de toda la
     * plataforma. El alta ya está guardada cuando se llega aquí; lo único que se
     * pierde es el correo, y para eso está «reenviar».
     */
    this.tokens
      .enviarVerificacion(credential.id, credential.email)
      .catch((error: unknown) =>
        this.log.error(
          `No se pudo emitir la verificación de ${credential.id}: ${(error as Error).message}`,
        ),
      );

    return { userId, email: credential.email, verificacionPendiente: true };
  }

  /**
   * Reenvía el correo de confirmación.
   *
   * ⚠️ **Responde igual exista o no la cuenta.** Un «ese correo no está
   * registrado» convertiría esta ruta en un comprobador de quién tiene cuenta
   * aquí, que es justo lo que el login se cuida de no revelar.
   */
  async resendVerification(email: string) {
    const credential = await this.prisma.credential.findUnique({ where: { email } });

    if (credential && credential.emailVerifiedAt === null) {
      await this.tokens.enviarVerificacion(credential.id, credential.email);
    }

    return { enviado: true };
  }

  /**
   * Confirma un correo con el token del enlace.
   *
   * Es idempotente hacia la persona: un enlace ya usado responde con el error
   * genérico, pero si la cuenta ya está verificada no pasa nada malo —vuelve a
   * intentar entrar y funciona—.
   */
  async verifyEmail(token: string) {
    const credentialId = await this.tokens.canjear(token, 'EMAIL_VERIFICATION');

    if (!credentialId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Este enlace ya no sirve. Pide uno nuevo desde la pantalla de entrada.',
      });
    }

    await this.prisma.credential.update({
      where: { id: credentialId },
      /* Si ya estaba verificada no se pisa la fecha original: interesa cuándo se
         confirmó de verdad, no la última vez que alguien abrió un enlace. */
      data: { emailVerifiedAt: new Date() },
    });

    return { verificado: true };
  }

  /**
   * Arranca la recuperación de contraseña.
   *
   * ⚠️ **Siempre responde lo mismo**, exista la cuenta o no, y tenga contraseña
   * o entre solo con Google. Cualquier diferencia —un mensaje, un código, un
   * tiempo de respuesta notablemente distinto— convierte esto en un listado de
   * quién está registrado.
   */
  async forgotPassword(email: string) {
    const credential = await this.prisma.credential.findUnique({ where: { email } });

    /* Solo si tiene contraseña: a una cuenta que entra con Google no se le puede
       «recuperar» algo que no tiene, y crearle una por esta vía sería una forma
       de tomar el control sin pasar por Google. */
    if (credential?.passwordHash) {
      await this.tokens.enviarRecuperacion(credential.id, credential.email);
    }

    return { enviado: true };
  }

  /**
   * Fija la contraseña nueva y **cierra todas las sesiones**.
   *
   * Lo segundo no es un extra: quien recupera la contraseña suele hacerlo porque
   * sospecha que alguien más entró. Dejar viva la sesión del intruso vaciaría de
   * sentido el cambio.
   *
   * De paso da el correo por verificado: se acaba de demostrar acceso a esa
   * bandeja de entrada, que es exactamente lo que la verificación comprueba.
   */
  async resetPassword(token: string, password: string) {
    const credentialId = await this.tokens.canjear(token, 'PASSWORD_RESET');

    if (!credentialId) {
      throw new RpcException({
        statusCode: 400,
        message: 'Este enlace ya no sirve. Pide otro desde «Olvidé mi contraseña».',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const credential = await this.prisma.credential.update({
      where: { id: credentialId },
      data: { passwordHash, emailVerifiedAt: new Date() },
      include: { user: true },
    });

    if (credential.user) {
      /* Cambiar la contraseña cierra **todas** las sesiones, no solo la de
         aquí: quien la cambia suele estar echando a alguien. Un `DEL` sobre el
         hash se las lleva todas de una vez, igual que antes. */
      await this.redis.del(claveDeSesiones(credential.user.id));
    }

    return { restablecida: true };
  }

  async login(dto: LoginDto) {
    const credential = await this.prisma.credential.findUnique({
      where: { email: dto.email },
      include: { user: true },
    });

    if (!credential || !credential.user) {
      throw new RpcException({ statusCode: 401, message: 'Credenciales inválidas' });
    }

    /**
     * ⚠️ Sin contraseña guardada no hay nada que comparar: la cuenta entra solo
     * con Google.
     *
     * Esta comprobación **no es opcional**. `bcrypt.compare` con `null` no
     * devuelve false de forma limpia, y dejarlo al azar de una librería para
     * una decisión de autenticación es exactamente el tipo de descuido que
     * abre una puerta. El mensaje es el genérico de siempre, a propósito: decir
     * «esta cuenta usa Google» confirmaría que el correo existe.
     */
    if (credential.passwordHash === null) {
      throw new RpcException({ statusCode: 401, message: 'Credenciales inválidas' });
    }

    const match = await bcrypt.compare(dto.password, credential.passwordHash);
    if (!match) {
      throw new RpcException({ statusCode: 401, message: 'Credenciales inválidas' });
    }

    if (credential.user.status !== 'ACTIVE') {
      throw new RpcException({ statusCode: 403, message: 'Cuenta suspendida o inactiva' });
    }

    /**
     * ⚠️ **Sin correo confirmado no se entra.**
     *
     * Va **después** de comprobar la contraseña, y el orden es la decisión: al
     * revés, cualquiera podría escribir un correo ajeno y saber por la respuesta
     * si esa cuenta existe y está sin confirmar. Aquí solo llega quien ya ha
     * demostrado saber la contraseña.
     *
     * El código viaja aparte del mensaje porque la pantalla hace algo distinto
     * con este 403 que con el de cuenta suspendida: ofrece reenviar el correo.
     */
    if (credential.emailVerifiedAt === null) {
      throw new RpcException({
        statusCode: 403,
        message: 'Confirma tu correo antes de entrar. Te hemos mandado un enlace.',
        details: { code: 'EMAIL_NOT_VERIFIED', email: credential.email },
      });
    }

    const userId = credential.user.id;
    const accessToken = await this.signAccess(userId);
    const { token: refreshToken, jti } = await this.signRefresh(userId);

    /* Añade esta sesión; **no pisa** las que ya hubiera abiertas en otros
       dispositivos. Ver el comentario de `claveDeSesiones`. */
    await this.guardarSesion(userId, jti, refreshToken);

    return { userId, accessToken, refreshToken };
  }

  async verifyToken(dto: VerifyTokenDto): Promise<JwtPayloadDto> {
    const hash = this.tokenHash(dto.token);
    const cacheKey = `auth:token:${hash}`;

    const cached = await this.redis.get<JwtPayloadDto>(cacheKey);
    if (cached) return cached;

    let payload: JwtPayloadDto;
    try {
      payload = await this.jwt.verifyAsync<JwtPayloadDto>(dto.token);
    } catch {
      throw new RpcException({ statusCode: 401, message: 'Token inválido o expirado' });
    }

    /* Basta con que le quede **alguna** sesión abierta: este access token se
       emitió dentro de una de ellas y dura 15 minutos. Cerrar la sesión de un
       dispositivo no tiene por qué invalidar el access token que ya estaba en
       vuelo en otro. */
    if (!(await this.redis.exists(claveDeSesiones(payload.sub)))) {
      throw new RpcException({ statusCode: 401, message: 'Sesión cerrada' });
    }

    await this.redis.set(cacheKey, payload, TOKEN_CACHE_TTL);
    return payload;
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayloadDto & { typ?: string };
    try {
      payload = await this.jwt.verifyAsync<JwtPayloadDto & { typ?: string }>(refreshToken);
    } catch {
      throw new RpcException({ statusCode: 401, message: 'Refresh token inválido o expirado' });
    }

    /**
     * La confusión en el sentido contrario: un access token es un JWT válido
     * con el mismo `sub`, así que sin esta comprobación se podía canjear por
     * otro y encadenar la sesión indefinidamente sin pasar nunca por el
     * refresh que sí está guardado en Redis.
     */
    if (payload.typ !== TOKEN_REFRESCO) {
      throw new RpcException({ statusCode: 401, message: 'Refresh token inválido o expirado' });
    }

    /**
     * ⚠️ **Se busca la sesión concreta por su `jti`, no «la» sesión.**
     *
     * Un refresh token firmado antes de este cambio no lo lleva: se rechaza, y
     * está bien —hay que volver a entrar una vez, y solo una—.
     */
    const sessionKey = claveDeSesiones(payload.sub);
    const jti = payload.jti;

    if (!jti) {
      throw new RpcException({ statusCode: 401, message: 'Refresh token no válido' });
    }

    const guardado = await this.redis.hget(sessionKey, jti);

    if (guardado !== refreshToken) {
      throw new RpcException({ statusCode: 401, message: 'Refresh token no válido' });
    }

    /**
     * ⚠️ **El estado de la cuenta se vuelve a comprobar aquí.**
     *
     * Sin esto, suspender a alguien con la sesión abierta **no le echaba nunca**:
     * este método verificaba la firma, comparaba con Redis y firmaba un access
     * nuevo sin mirar `status`, y el `proxy.ts` de cada zona renueva en cada
     * navegación mientras el refresh viva. La suspensión solo impedía un login
     * nuevo — el único que esa persona no necesita.
     *
     * `setStatus` ya borra `auth:session:<id>`, así que el `if` de arriba
     * bastaría en el camino normal. Esta consulta cubre el resto: un cambio de
     * estado hecho por una migración, un arreglo a mano en la base, o un futuro
     * camino que se olvide de invalidar. Es una lectura por renovación —cada 15
     * minutos por sesión activa— y a cambio el estado de la cuenta manda siempre.
     */
    const credential = await this.prisma.credential.findFirst({
      where: { user: { id: payload.sub } },
      select: { user: { select: { status: true } } },
    });

    if (credential?.user && credential.user.status !== 'ACTIVE') {
      /* Se retiran **todas** sus sesiones: si no, cada navegación de cada
         dispositivo volvería a preguntar y a recibir el mismo 401. */
      await this.redis.del(sessionKey);
      throw new RpcException({ statusCode: 401, message: 'Cuenta suspendida o inactiva' });
    }

    /**
     * El plazo se estira en cada renovación: **mientras uses la aplicación, la
     * sesión no se va sola.**
     *
     * Antes el plazo se ponía al entrar y no se tocaba nunca más, así que
     * caducaba a los 7 días exactos de la entrada aunque hubieras estado dentro
     * cinco minutos antes. Ahora es deslizante, que es lo que cualquiera espera
     * de «recuérdame».
     *
     * ⚠️ **El tope duro sigue siendo el `exp` del propio refresh token**, que no
     * se rota: 7 días desde que se emitió, se use o no. Estirar la clave de
     * Redis no alarga un JWT ya firmado. Rotarlo en cada renovación daría una
     * sesión perpetua, pero abre una carrera real aquí: el `proxy.ts` de cada
     * zona renueva en cada navegación y dos pestañas pueden pedirlo a la vez
     * con el mismo token — con rotación estricta, la segunda se queda fuera. Se
     * prefiere un tope predecible a un cierre de sesión aleatorio, que es
     * justamente lo que este cambio viene a quitar.
     */
    await this.redis.expire(sessionKey, SESSION_TTL);

    const accessToken = await this.signAccess(payload.sub);
    return { accessToken };
  }

  /**
   * Cierra sesión.
   *
   * Con `refreshToken`, **solo la de ese dispositivo**: es lo que se espera al
   * pulsar «cerrar sesión» en un portátil prestado, y antes cerraba también la
   * del móvil sin avisar. Sin él —una llamada antigua, o un cierre desde una
   * pantalla que no tiene la cookie a mano— se cierran todas, que era el
   * comportamiento de siempre y sigue siendo el seguro por defecto.
   *
   * Cuando se va la última, la clave se borra entera: un hash vacío en Redis
   * deja de existir solo, pero así no dependemos de ese detalle y `verifyToken`
   * ve «sesión cerrada» de inmediato.
   */
  async logout(userId: string, refreshToken?: string) {
    const clave = claveDeSesiones(userId);

    if (!refreshToken) {
      await this.redis.del(clave);
      return { success: true };
    }

    let jti: string | undefined;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayloadDto>(refreshToken);
      jti = payload.jti;
    } catch {
      /* Un refresh ilegible no identifica ninguna sesión. Se cierran todas en
         vez de no cerrar ninguna: quien pide salir, sale. */
    }

    if (!jti) {
      await this.redis.del(clave);
      return { success: true };
    }

    const quedan = await this.redis.hdel(clave, jti);
    if (quedan === 0) await this.redis.del(clave);

    return { success: true };
  }

  /**
   * Entrada con Google.
   *
   * Recibe el **ID token** que emite Google Identity Services en el navegador y
   * lo verifica aquí. Nunca se confía en el correo que llegue del cliente: un
   * `{ email: "quien-sea@gmail.com" }` sin firma sería una suplantación
   * trivial. Lo único que se acepta es el token, y solo después de comprobar
   * que Google lo firmó.
   */
  async loginWithGoogle(dto: GoogleLoginDto) {
    const perfil = await this.verificarTokenDeGoogle(dto.idToken);

    /* Si Google no da el correo por verificado, no sirve para identificar a
       nadie: es exactamente el dato sobre el que se decide la vinculación. */
    if (!perfil.email || perfil.email_verified !== true) {
      throw new RpcException({
        statusCode: 401,
        message: 'Google no confirma este correo como verificado',
      });
    }

    /* 1. ¿Ya conocemos esta identidad de Google? Camino normal a partir de la
          segunda vez. Se busca por `sub`, no por correo: es lo estable. */
    const porGoogle = await this.prisma.credential.findUnique({
      where: { googleSub: perfil.sub },
      include: { user: true },
    });

    if (porGoogle?.user) {
      return this.emitirSesion(porGoogle.user.id, porGoogle.user.status);
    }

    /* 2. ¿Hay ya una cuenta con ese correo? Aquí está la decisión delicada. */
    const porCorreo = await this.prisma.credential.findUnique({
      where: { email: perfil.email },
      include: { user: true },
    });

    if (porCorreo) {
      /**
       * ⚠️ **No se vincula automáticamente con una cuenta que tiene
       * contraseña.** Parece lo cómodo y es una toma de cuenta:
       *
       *   1. Alguien registra `tu-correo@gmail.com` con una contraseña suya.
       *      Nadie comprueba que ese buzón sea realmente suyo.
       *   2. Tú entras más tarde con Google y el sistema, viendo el mismo
       *      correo, te mete en **su** cuenta.
       *   3. Él conserva la contraseña, así que entra cuando quiera a lo que
       *      tú hagas dentro.
       *
       * El `email_verified` de Google no protege de esto: verifica que el
       * correo es tuyo, no que la cuenta preexistente lo sea. La única forma
       * segura de unir ambas identidades es que alguien demuestre poseer la
       * contraseña, y eso se hace desde dentro de la sesión, no aquí.
       */
      if (porCorreo.passwordHash !== null) {
        throw new RpcException({
          statusCode: 409,
          message:
            'Ya existe una cuenta con este correo y contraseña. Entra con tu contraseña para poder vincular Google.',
        });
      }

      /* Credencial sin contraseña y sin `googleSub` — no debería existir, pero
         si aparece (un alta a medias, un arreglo a mano), adoptarla es más
         seguro que dejar a esa persona sin forma de entrar. */
      const vinculada = await this.prisma.credential.update({
        where: { id: porCorreo.id },
        /* Y verificada: entrar por Google demuestra la posesión del buzón, que
           es exactamente lo que comprueba la verificación por correo. */
        data: { googleSub: perfil.sub, emailVerifiedAt: new Date() },
        include: { user: true },
      });

      if (!vinculada.user) {
        throw new RpcException({ statusCode: 500, message: 'La cuenta no tiene perfil asociado' });
      }

      return this.emitirSesion(vinculada.user.id, vinculada.user.status);
    }

    /* 3. Nadie con ese correo: cuenta nueva, sin contraseña. */
    const creada = await this.prisma.credential.create({
      data: {
        email: perfil.email,
        passwordHash: null,
        googleSub: perfil.sub,
        /* Nace verificada: `loginWithGoogle` ya exige `email_verified` en el
           token, así que mandarle un correo para confirmar lo que Google acaba
           de confirmar sería ceremonia sin ninguna garantía añadida. */
        emailVerifiedAt: new Date(),
        user: {
          create: {
            /* `register` los deja vacíos y el perfil se completa después. Aquí
               Google ya los da, así que se aprovechan — pero se recortan: son
               campos obligatorios y `undefined` los rompería. */
            firstName: perfil.given_name ?? '',
            lastName: perfil.family_name ?? '',
            avatarUrl: perfil.picture ?? null,
          },
        },
      },
      include: { user: true },
    });

    if (!creada.user) {
      throw new RpcException({ statusCode: 500, message: 'No se pudo crear el perfil' });
    }

    return this.emitirSesion(creada.user.id, creada.user.status);
  }

  /**
   * Comprueba que el token lo firmó Google y que va dirigido a **nuestra** app.
   *
   * ⚠️ `audience` no es un detalle de configuración. Sin él se aceptaría
   * cualquier ID token válido de Google — incluido el que otra aplicación
   * cualquiera emitió para su propio uso—, y quien tuviera uno entraría aquí
   * como el usuario que dijera ese token. La librería lo valida junto con la
   * firma, el emisor y la caducidad.
   */
  private async verificarTokenDeGoogle(idToken: string): Promise<TokenPayload> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');

    /* Se valida aquí y no al arrancar a propósito: sin esta variable el resto
       de la autenticación funciona igual, así que el servicio debe levantar y
       fallar solo en este camino, con un mensaje que diga qué falta. */
    if (!clientId) {
      throw new RpcException({
        statusCode: 503,
        message: 'La entrada con Google no está configurada en este entorno',
      });
    }

    const cliente = this.clienteGoogle ?? (this.clienteGoogle = new OAuth2Client(clientId));

    let ticket: LoginTicket;
    try {
      ticket = await cliente.verifyIdToken({ idToken, audience: clientId });
    } catch {
      /* Firma inválida, caducado, `aud` de otra aplicación, o Google no
         respondió al pedir sus claves públicas. Ninguno de esos casos se
         distingue hacia fuera: todos significan «este token no vale». */
      throw new RpcException({ statusCode: 401, message: 'El token de Google no es válido' });
    }

    const perfil = ticket.getPayload();
    if (!perfil) {
      throw new RpcException({ statusCode: 401, message: 'El token de Google no trae perfil' });
    }

    return perfil;
  }

  /**
   * Los tres pasos finales de cualquier entrada, en un solo sitio.
   *
   * `register` y `login` los repiten porque son anteriores; se dejan como
   * están para no tocar caminos que ya funcionan y están probados.
   */
  private async emitirSesion(userId: string, status: string) {
    if (status !== 'ACTIVE') {
      throw new RpcException({ statusCode: 403, message: 'Cuenta suspendida o inactiva' });
    }

    const accessToken = await this.signAccess(userId);
    const { token: refreshToken, jti } = await this.signRefresh(userId);

    await this.guardarSesion(userId, jti, refreshToken);

    return { userId, accessToken, refreshToken };
  }
}
