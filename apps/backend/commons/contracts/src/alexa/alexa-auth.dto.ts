import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Genera una frase semilla desde la app web para vincular un dispositivo Alexa. */
export class GenerateSeedPhraseDto {
  @IsUUID()
  userId: string;
}

/** Canjea la frase semilla dictada al dispositivo Alexa por un token de sesión. */
export class RedeemSeedPhraseDto {
  @IsString()
  @MinLength(3)
  phrase: string;

  @IsString()
  alexaUserId: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

/** Verifica un alexaToken emitido por alexa-service. */
export class VerifyAlexaTokenDto {
  @IsString()
  token: string;
}
export { VerifyAlexaTokenDto as VerifyVoiceTokenDto };

/** Revoca una vinculación/sesión de voz. */
export class RevokeAlexaLinkDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  linkId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
export { RevokeAlexaLinkDto as RevokeVoiceLinkDto };

/** Lista las vinculaciones de voz de un usuario. */
export class FindAlexaLinksDto {
  @IsUUID()
  userId: string;
}
export { FindAlexaLinksDto as FindVoiceLinksDto };
