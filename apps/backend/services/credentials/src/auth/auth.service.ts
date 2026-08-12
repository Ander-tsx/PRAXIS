import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { type LoginTicket, OAuth2Client, type TokenPayload } from 'google-auth-library';

import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { RedisService } from '../redis/redis.service';

import {
  RegisterDto,
  LoginDto,
  VerifyTokenDto,
  JwtPayloadDto,
  GoogleLoginDto,
} from '@praxis/contracts';

const SALT_ROUNDS = 10;
const TOKEN_CACHE_TTL = 300; // 5 min
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 días

/**
 * Valores del claim `typ`. El gateway compara contra el primero; `refresh()`,
 * contra el segundo. Si cambian aquí, hay que cambiarlos en `jwt.guard.ts`.
 */
export const TOKEN_ACCESO = 'access';
export const TOKEN_REFRESCO = 'refresh';

@Injectable()
export class AuthService {
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

  private async signRefresh(userId: string): Promise<string> {
    const expiresIn = this.config.get<any>('REFRESH_TOKEN_EXPIRES_IN', '7d');
    return this.jwt.signAsync({ sub: userId, typ: TOKEN_REFRESCO }, { expiresIn });
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
    void this.tokens.enviarVerificacion(credential.id, credential.email);

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
      await this.redis.del(`auth:session:${credential.user.id}`);
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
    const refreshToken = await this.signRefresh(userId);

    await this.redis.set(`auth:session:${userId}`, { refreshToken }, SESSION_TTL);

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

    const session = await this.redis.get(`auth:session:${payload.sub}`);
    if (!session) {
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

    const sessionKey = `auth:session:${payload.sub}`;
    const session = await this.redis.get<{ refreshToken: string }>(sessionKey);

    if (!session || session.refreshToken !== refreshToken) {
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
      /* Se retira la sesión: si no, cada navegación volvería a preguntar y a
         recibir el mismo 401. */
      await this.redis.del(sessionKey);
      throw new RpcException({ statusCode: 401, message: 'Cuenta suspendida o inactiva' });
    }

    const accessToken = await this.signAccess(payload.sub);
    return { accessToken };
  }

  async logout(userId: string) {
    await this.redis.del(`auth:session:${userId}`);
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
        data: { googleSub: perfil.sub },
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
    const refreshToken = await this.signRefresh(userId);

    await this.redis.set(`auth:session:${userId}`, { refreshToken }, SESSION_TTL);

    return { userId, accessToken, refreshToken };
  }
}
