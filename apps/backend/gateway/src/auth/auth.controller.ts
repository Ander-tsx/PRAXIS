import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { LoginDto, RegisterDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

@Controller('auth')
export class AuthController {
  constructor(@Inject('AUTH_SERVICE') private readonly authClient: ClientProxy) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return firstValueFrom(this.authClient.send({ cmd: 'auth_login' }, body));
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return firstValueFrom(this.authClient.send({ cmd: 'auth_register ' }, body));
  }
}
