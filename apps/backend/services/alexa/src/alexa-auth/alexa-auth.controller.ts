import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  FindAlexaLinksDto,
  GenerateSeedPhraseDto,
  RedeemSeedPhraseDto,
  RevokeAlexaLinkDto,
  VerifyAlexaTokenDto,
} from '@praxis/contracts';
import { AlexaAuthService } from './alexa-auth.service';

@Controller()
export class AlexaAuthController {
  constructor(private readonly authService: AlexaAuthService) {}

  /** La app web genera la frase semilla que el usuario dictará a Alexa */
  @MessagePattern({ cmd: 'alexa_link_generate' })
  generateSeedPhrase(@Payload() dto: GenerateSeedPhraseDto) {
    return this.authService.generateSeedPhrase(dto);
  }

  /** La skill envía la frase dictada por el usuario para obtener un alexaToken */
  @MessagePattern({ cmd: 'alexa_link_redeem' })
  redeem(@Payload() dto: RedeemSeedPhraseDto) {
    return this.authService.redeemSeedPhrase(dto);
  }

  /** El VoiceTokenGuard/AlexaTokenGuard del gateway invoca este comando en cada consulta */
  @MessagePattern({ cmd: 'alexa_verify_token' })
  verifyToken(@Payload() dto: VerifyAlexaTokenDto) {
    return this.authService.verifyToken(dto);
  }

  /** Obtiene la información básica del usuario de voz autenticado */
  @MessagePattern({ cmd: 'alexa_me' })
  getMe(@Payload() payload: { userId: string }) {
    return this.authService.getMe(payload);
  }

  /** Revoca la sesión activa asociada a un alexaToken */
  @MessagePattern({ cmd: 'alexa_logout' })
  logout(@Payload() payload: { token: string }) {
    return this.authService.logout(payload);
  }

  /** Revocación manual desde la app web */
  @MessagePattern({ cmd: 'alexa_link_revoke' })
  revokeLink(@Payload() dto: RevokeAlexaLinkDto) {
    return this.authService.revokeLink(dto);
  }

  /** Lista todas las vinculaciones/sesiones de voz de un usuario */
  @MessagePattern({ cmd: 'alexa_link_find_all' })
  findLinks(@Payload() dto: FindAlexaLinksDto) {
    return this.authService.findLinks(dto);
  }
}
