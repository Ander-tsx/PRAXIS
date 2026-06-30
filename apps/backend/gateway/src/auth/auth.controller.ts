import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { LoginDto, RegisterDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    @Inject('USER_SERVICE') private readonly usersClient: ClientProxy
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return firstValueFrom(this.authClient.send({ cmd: 'auth_login' }, body));
  }

  @Post('register')
  async register(@Body() body: RegisterDto) {
    const { userId } = await firstValueFrom(this.authClient.send({ cmd: 'auth_register ' }, {
      email: body.email,
      password: body.password,
    }));

    await firstValueFrom(
      this.usersClient.send({ cmd: 'user_create' }, {
        authId: userId,
        email: body.email,
        firstName: body.email
      }),
    );

    //TODO: Hacer uniforme las respuestas del backend
    return { success: true };
  }
}
