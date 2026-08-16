import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { GoogleLoginDto, LoginDto, RegisterDto, VerifyTokenDto } from '@praxis/contracts';

import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern({ cmd: 'auth_register' })
  register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @MessagePattern({ cmd: 'auth_login' })
  login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @MessagePattern({ cmd: 'auth_google' })
  loginWithGoogle(@Payload() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  @MessagePattern({ cmd: 'auth_verify_email' })
  verifyEmail(@Payload() dto: { token: string }) {
    return this.authService.verifyEmail(dto.token);
  }

  @MessagePattern({ cmd: 'auth_resend_verification' })
  resendVerification(@Payload() dto: { email: string }) {
    return this.authService.resendVerification(dto.email);
  }

  @MessagePattern({ cmd: 'auth_forgot_password' })
  forgotPassword(@Payload() dto: { email: string }) {
    return this.authService.forgotPassword(dto.email);
  }

  @MessagePattern({ cmd: 'auth_reset_password' })
  resetPassword(@Payload() dto: { token: string; password: string }) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @MessagePattern({ cmd: 'auth_verify_token' })
  verifyToken(@Payload() dto: VerifyTokenDto) {
    return this.authService.verifyToken(dto);
  }

  @MessagePattern({ cmd: 'auth_refresh' })
  refresh(@Payload() dto: { refreshToken: string }) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Con `refreshToken` cierra solo esa sesión; sin él, todas. Ver `logout()`. */
  @MessagePattern({ cmd: 'auth_logout' })
  logout(@Payload() dto: { userId: string; refreshToken?: string }) {
    return this.authService.logout(dto.userId, dto.refreshToken);
  }
}
