import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  EmailOnlyDto,
  GoogleLoginDto,
  KylooLoginDto,
  LoginDto,
  LogoutBodyDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from './jwt.guard';
import { ModoLocalGuard } from './modo-local.guard';

/**
 * Apretón para las dos rutas donde adivinar sale a cuenta: 10 por minuto y por
 * IP, frente a las 300 del resto de la API.
 *
 * ⚠️ Va bajo la clave `default` **a propósito**. `@Throttle` no crea perfiles:
 * reajusta por handler los que ya declara `ThrottlerModule.forRoot`, y ahí solo
 * hay uno. Nombrarlo `auth` obligaría a declararlo en el módulo, y toda entrada
 * declarada allí se aplica a **todas** las rutas — que es como la API entera
 * acabó en 10 peticiones por minuto.
 */
const LIMITE_AUTENTICACION = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    /* Solo para crear el espacio personal al registrarse. Ver `register`. */
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
  ) {}

  /**
   * Crea el espacio personal sin esperarlo (ver `register`). Es idempotente: `billing_personal_org`
   * devuelve el que ya existe, así que también se puede llamar tras cada entrada con Kyloo.
   */
  private crearEspacioPersonal(userId: string, email?: string): void {
    firstValueFrom(
      this.credentialsClient.send<{ firstName?: string }[]>(
        { cmd: 'user_find_by_ids' },
        { ids: [userId] },
      ),
    )
      .then((perfiles) =>
        firstValueFrom(
          this.billingClient.send(
            { cmd: 'billing_personal_org' },
            {
              userId: userId,
              name: perfiles[0]?.firstName ? `Espacio de ${perfiles[0].firstName}` : 'Mi espacio',
              email: email,
            },
          ),
        ),
      )
      .catch((error: Error) => {
        this.logger.warn(`No se pudo crear el espacio de ${userId}: ${error.message}`);
      });
  }

  @Post('login')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiResponse({ status: 200, description: 'Inicio de sesión exitoso' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos; espera un minuto' })
  async login(@Body() body: LoginDto) {
    this.logger.log('POST /auth/login → credentials-service');
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_login' }, body));
  }

  @Post('register')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de registro inválidos' })
  async register(@Body() body: RegisterDto) {
    this.logger.log('POST /auth/register → credentials-service');
    // credentials-service crea la credencial y el perfil de usuario en un solo paso
    const alta = await firstValueFrom(
      this.credentialsClient.send<{ userId?: string; email?: string }>(
        { cmd: 'auth_register' },
        body,
      ),
    );

    /**
     * 🔴 **Su espacio personal nace aquí, no la primera vez que hace falta.**
     *
     * Se creaba perezosamente —al pagar, al aceptar una invitación— porque
     * mientras una organización solo repartía topes, una fila vacía para todo el
     * mundo era una migración pendiente disfrazada. Desde que la organización
     * **contiene** los proyectos eso dejó de valer: sin ella, quien acaba de
     * registrarse abre el selector de la barra lateral y no ve **nada**, ni
     * siquiera su propio espacio.
     *
     * ⚠️ **Y no se espera a que termine.** Si billing-service no contesta, el
     * registro no puede fallar por eso: la cuenta ya existe, y `personalDe` la
     * crea igualmente la primera vez que alguien la necesite. Lo que se pierde
     * es que salga en el selector hasta entonces, no la cuenta.
     */
    if (alta?.userId) this.crearEspacioPersonal(alta.userId, alta.email);

    return alta;
  }

  /**
   * Confirma un correo con el token del enlace.
   *
   * Pública y con el mismo apretón que el login: el token es la única
   * credencial y probar a ciegas tiene que costar tiempo.
   */
  @Post('verify-email')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Confirma el correo de una cuenta' })
  @ApiResponse({ status: 200, description: 'Correo confirmado' })
  @ApiResponse({ status: 400, description: 'El enlace caducó o ya se usó' })
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_verify_email' }, body));
  }

  /**
   * Reenvía el correo de confirmación.
   *
   * ⚠️ Responde 200 exista o no la cuenta: cualquier otra cosa la convierte en
   * un comprobador de quién está registrado aquí.
   */
  @Post('resend-verification')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Reenvía el correo de confirmación' })
  @ApiResponse({ status: 200, description: 'Si la cuenta existe y falta confirmar, se envió' })
  async resendVerification(@Body() body: EmailOnlyDto) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_resend_verification' }, body));
  }

  /** Arranca la recuperación. Responde igual exista o no la cuenta. */
  @Post('forgot-password')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Manda el enlace para elegir contraseña nueva' })
  @ApiResponse({ status: 200, description: 'Si la cuenta existe, se envió el enlace' })
  async forgotPassword(@Body() body: EmailOnlyDto) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_forgot_password' }, body));
  }

  /** Fija la contraseña nueva con el token del enlace y cierra las sesiones. */
  @Post('reset-password')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Fija una contraseña nueva con el enlace recibido' })
  @ApiResponse({ status: 200, description: 'Contraseña cambiada' })
  @ApiResponse({ status: 400, description: 'El enlace caducó o ya se usó' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_reset_password' }, body));
  }

  @Post('kyloo')
  @HttpCode(HttpStatus.OK)
  /* Mismo apretón que google: cada intento canjea un código contra Accounts y
     puede acabar creando una cuenta. */
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Iniciar sesión con Kyloo Accounts' })
  @ApiBody({ type: KylooLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Sesión iniciada; devuelve los mismos tokens que login',
  })
  @ApiResponse({
    status: 401,
    description: 'Kyloo no aceptó el intento o el correo no está verificado',
  })
  @ApiResponse({
    status: 409,
    description: 'Hay una cuenta con ese correo sin confirmar: no se vincula sola',
  })
  @ApiResponse({
    status: 503,
    description: 'La entrada con Kyloo no está configurada en este entorno',
  })
  async kyloo(@Body() body: KylooLoginDto) {
    this.logger.log('POST /auth/kyloo → credentials-service');
    const sesion = await firstValueFrom(
      this.credentialsClient.send<{ userId?: string }>({ cmd: 'auth_kyloo' }, body),
    );
    /* Con Kyloo como única puerta, las cuentas nuevas nacen aquí y no por `register`: sin esto
       quien se registra no tendría espacio personal hasta que alguien lo pidiera. */
    if (sesion?.userId) this.crearEspacioPersonal(sesion.userId);
    return sesion;
  }

  @Post('google')
  @UseGuards(ModoLocalGuard)
  @HttpCode(HttpStatus.OK)
  /* Mismo apretón que login: aunque aquí no se adivinan contraseñas, cada
     intento obliga a verificar una firma y puede acabar creando una cuenta. */
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Iniciar sesión con Google' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Sesión iniciada; devuelve los mismos tokens que login',
  })
  @ApiResponse({
    status: 401,
    description: 'El token de Google no es válido o el correo no está verificado',
  })
  @ApiResponse({
    status: 409,
    description:
      'Ya existe una cuenta con ese correo y contraseña. No se vincula sola: hay que entrar con la contraseña primero',
  })
  @ApiResponse({
    status: 503,
    description: 'La entrada con Google no está configurada en este entorno',
  })
  async google(@Body() body: GoogleLoginDto) {
    this.logger.log('POST /auth/google → credentials-service');
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_google' }, body));
  }

  /**
   * 🔴 **Esta ruta NO puede llevar el apretón del login.**
   *
   * Lo llevaba —10 por minuto y por IP, el mismo que `login` y `register`— y era
   * un cierre de sesión disfrazado de límite de tasa:
   *
   * - a esta ruta **no la llama una persona**, la llama `refresh-proxy.ts` desde
   *   el middleware de cada zona, en cada navegación en la que el access token
   *   está a menos de un minuto de caducar;
   * - las **seis zonas** salen por la misma IP, y en desarrollo todo es `::1`,
   *   así que las diez se gastan entre pestañas sin que nadie note nada;
   * - y al pasarse, el gateway responde **429**, que no es «tu refresh no
   *   sirve» sino «ahora no». El proxy lo trataba como un rechazo y borraba las
   *   dos cookies: sesión cerrada, sin un error a la vista y sin relación
   *   aparente con nada.
   *
   * Se arregla por los dos lados: aquí se sube el límite a algo pensado para un
   * cliente automático, y en `refresh-proxy.ts` **solo un 401/403 cuenta como
   * sesión muerta**.
   *
   * Adivinar un refresh token no es un ataque realista —es un JWT firmado— así
   * que el apretón aquí no protege de nada que la firma no proteja ya. Lo que
   * queda es un tope de cortesía, por encima de lo que gasta una persona
   * navegando rápido entre zonas y por debajo de las 300 globales.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Refrescar token de acceso' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Token de acceso renovado' })
  @ApiResponse({ status: 401, description: 'Token de refresco inválido o expirado' })
  async refresh(@Body() body: { refreshToken: string }) {
    this.logger.log('POST /auth/refresh → credentials-service');
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_refresh' }, body));
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada exitosamente' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  async logout(@Request() req: Express.Request, @Body() body?: LogoutBodyDto) {
    this.logger.log('POST /auth/logout → credentials-service');
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    /**
     * El `refreshToken` es **opcional y sirve para cerrar solo esta sesión**.
     *
     * Ahora que una cuenta puede tener varias abiertas, «cerrar sesión» en el
     * portátil no debe echar del móvil. Quien manda el token dice cuál cierra;
     * quien no lo manda —una integración antigua— sigue cerrándolas todas, que
     * es el comportamiento seguro por defecto.
     *
     * El `userId` sale del token de la petición, nunca del cuerpo.
     */
    return firstValueFrom(
      this.credentialsClient.send(
        { cmd: 'auth_logout' },
        { userId, refreshToken: body?.refreshToken },
      ),
    );
  }
}
