import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { LoginDto, RegisterDto, VerifyTokenDto } from '@praxis/contracts';
import type { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'auth_register ' })
  register(@Payload() data: RegisterDto) {
    return this.authService.register(data);
  }

  @MessagePattern({ cmd: 'auth_login' })
  login(@Payload() data: LoginDto) {
    return this.authService.login(data);
  }

  @MessagePattern({ cmd: 'auth_verify_token' })
  verifyToken(@Payload() data: VerifyTokenDto) {
    return this.authService.verifyToken(data.token);
  }
}
