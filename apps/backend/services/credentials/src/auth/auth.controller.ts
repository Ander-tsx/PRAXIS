import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  GoogleLoginDto,
  KylooLoginDto,
  LoginDto,
  RegisterDto,
  VerifyTokenDto,
} from '@praxis/contracts';

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

  @MessagePattern({ cmd: 'auth_kyloo' })
  loginWithKyloo(@Payload() dto: KylooLoginDto) {
    return this.authService.loginWithKyloo(dto);
  }

  @MessagePattern({ cmd: 'auth_legacy_verify' })
  verificarCredencialHeredada(@Payload() dto: { email: string; password: string }) {
    return this.authService.verificarCredencialHeredada(dto.email, dto.password);
  }

  @MessagePattern({ cmd: 'auth_revoke_all_of' })
  revocarTodoDe(@Payload() dto: { sub: string; email: string }) {
    return this.authService.revocarTodoDe(dto.sub, dto.email);
  }

  @MessagePattern({ cmd: 'auth_google' })
  loginWithGoogle(@Payload() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }

  /**
   * Manda el correo de una invitación a una organización.
   *
   * 🔴 **Es un comando acotado, no un relé de correo.** Este es el único
   * servicio con `MailService`, y abrirle al gateway una ruta de «manda este
   * HTML a esta dirección» sería exactamente eso: un relé, con la reputación de
   * envío de PRAXIS detrás. Aquí llega **qué** hay que decir —a quién, de qué
   * organización, quién invita y con qué enlace— y la plantilla vive de este
   * lado, donde vive el resto del correo del producto.
   *
   * ⚠️ **No devuelve el token ni lo toca**: lo genera billing-service y solo
   * viaja dentro del enlace ya montado. Este servicio no sabe qué es una
   * invitación ni puede crear una.
   *
   * ⚠️ **Y no falla hacia fuera.** Si el correo no sale, la invitación ya está
   * creada y el enlace se devuelve igualmente en la respuesta para poder
   * pasarlo a mano — que es justo por lo que se sigue devolviendo.
   */
  @MessagePattern({ cmd: 'mail_send_invitation' })
  sendInvitation(
    @Payload()
    dto: { email: string; organizacion: string; invitaPor: string | null; enlace: string },
  ) {
    return this.authService.enviarInvitacion(dto);
  }

  /** Invitación a un documento (E8 de `docs/PLAN-DOCUMENTOS.md`). No falla hacia fuera. */
  @MessagePattern({ cmd: 'mail_send_document_invite' })
  sendDocumentInvite(
    @Payload()
    dto: {
      email: string;
      titulo: string;
      invitaPor: string | null;
      puedeEditar: boolean;
      enlace: string;
    },
  ) {
    return this.authService.enviarDocumentoCompartido(dto);
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
