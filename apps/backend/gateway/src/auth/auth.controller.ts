import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { LoginDto, RegisterDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto) {
    this.logger.log('Incoming request: POST /auth/login - Forwarding to AUTH_SERVICE');
    this.logger.debug(`Request payload: ${JSON.stringify(body)}`);

    const response = await firstValueFrom(this.authClient.send({ cmd: 'auth_login' }, body));

    this.logger.debug(`Inter-microservice response from AUTH_SERVICE: ${JSON.stringify(response)}`);

    return response;
  }

  @Post('register')
  async register(@Body() body: RegisterDto) {
    this.logger.log('Incoming request: POST /auth/register - Forwarding to AUTH_SERVICE');
    this.logger.debug(`Request payload: ${JSON.stringify(body)}`);

    const response = await firstValueFrom(this.authClient.send({ cmd: 'auth_register ' }, body));

    this.logger.debug(`Inter-microservice response from AUTH_SERVICE: ${JSON.stringify(response)}`);

    return response;
  }
}
