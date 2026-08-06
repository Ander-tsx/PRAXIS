import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Genera una frase semilla desde la app web para vincular un dispositivo Alexa. */
export class GenerateSeedPhraseDto {
  @IsUUID()
  userId: string;
}

/**
 * Cuerpo de `POST /alexa/link/redeem`.
 *
 * ⚠️ **Es la única ruta pública de la capa de voz**: la skill aún no tiene token
 * cuando la llama. Todo lo que hay aquí lo elige quien llama, incluidos
 * `alexaUserId` y `deviceId` — que se declaran sin `@IsUUID` a propósito, porque
 * son identificadores de Amazon y no tienen ese formato.
 */
export class RedeemSeedPhraseBodyDto {
  @IsString()
  @MinLength(3)
  phrase: string;

  @IsString()
  alexaUserId: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

/**
 * Payload al microservicio: el cuerpo + lo que inyecta el gateway.
 *
 * `clientIp` **no está en el cuerpo** y no puede estarlo: es lo único de esta
 * petición que quien llama no elige, y por eso es lo único con lo que se puede
 * limitar de verdad. Lo pone el gateway después del spread del cuerpo, igual que
 * el `projectId` de las rutas de tarea, para que un valor del cliente no gane.
 */
export class RedeemSeedPhraseDto extends RedeemSeedPhraseBodyDto {
  @IsOptional()
  @IsString()
  clientIp?: string;
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
