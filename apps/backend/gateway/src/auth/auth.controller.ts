import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { LoginDto, RegisterDto } from '@praxis/contracts'

@Controller('auth')
export class AuthController {
    constructor(
        @Inject('AUTH_SERVICE') private readonly authClient: ClientProxy,
    ) {}

    @Post('login')
    @HttpCode(HttpStatus.OK)
    login(@Body() body: LoginDto){
        return firstValueFrom(
            this.authClient.send({ cmd: 'auth_login' }, body),
        );
    }

    @Post('register')
    register(@Body() body: RegisterDto) {
        return firstValueFrom(
            this.authClient.send({ cmd: 'auth_register '}, body),
        );
    }
}