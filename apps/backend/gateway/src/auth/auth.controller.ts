import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GoogleLoginDto, LoginDto, RefreshTokenDto, RegisterDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from './jwt.guard';

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

  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy) {}

  @Post('login')
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
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de registro inválidos' })
  async register(@Body() body: RegisterDto) {
    this.logger.log('POST /auth/register → credentials-service');
    // credentials-service crea la credencial y el perfil de usuario en un solo paso
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_register' }, body));
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  /* Mismo apretón que login: aunque aquí no se adivinan contraseñas, cada
     intento obliga a verificar una firma y puede acabar creando una cuenta. */
  @Throttle(LIMITE_AUTENTICACION)
  @ApiOperation({ summary: 'Iniciar sesión con Google' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiResponse({ status: 200, description: 'Sesión iniciada; devuelve los mismos tokens que login' })
  @ApiResponse({ status: 401, description: 'El token de Google no es válido o el correo no está verificado' })
  @ApiResponse({
    status: 409,
    description:
      'Ya existe una cuenta con ese correo y contraseña. No se vincula sola: hay que entrar con la contraseña primero',
  })
  @ApiResponse({ status: 503, description: 'La entrada con Google no está configurada en este entorno' })
  async google(@Body() body: GoogleLoginDto) {
    this.logger.log('POST /auth/google → credentials-service');
    return firstValueFrom(this.credentialsClient.send({ cmd: 'auth_google' }, body));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITE_AUTENTICACION)
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
  async logout(@Request() req: Express.Request) {
    this.logger.log('POST /auth/logout → credentials-service');
    return firstValueFrom(
      this.credentialsClient.send({ cmd: 'auth_logout' }, { userId: req.user!.userId }),
    );
  }
}
