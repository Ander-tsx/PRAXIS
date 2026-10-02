import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PersonalTokensService } from './personal-tokens.service';

/**
 * Los tokens personales, por TCP. Solo los llama el gateway.
 *
 * ⚠️ Como el resto de servicios internos, confía en el `userId` que le llega:
 * lo pone el gateway desde el JWT verificado. La pertenencia a la
 * organización y el plan los comprueba el gateway antes de `pat_create`.
 */
@Controller()
export class PersonalTokensController {
  constructor(private readonly tokens: PersonalTokensService) {}

  @MessagePattern({ cmd: 'pat_create' })
  crear(
    @Payload()
    dto: {
      userId: string;
      organizationId: string;
      name: string;
      scopes: string[];
      expiresInDays?: number;
    },
  ) {
    return this.tokens.crear(dto);
  }

  @MessagePattern({ cmd: 'pat_list' })
  listar(@Payload() dto: { userId: string }) {
    return this.tokens.listar(dto.userId);
  }

  @MessagePattern({ cmd: 'pat_revoke' })
  revocar(@Payload() dto: { userId: string; id: string }) {
    return this.tokens.revocar(dto.userId, dto.id);
  }

  /** El canje de cada llamada al MCP. El token en claro no se registra (I3). */
  @MessagePattern({ cmd: 'pat_exchange' })
  canjear(@Payload() dto: { token: string }) {
    return this.tokens.canjear(dto.token);
  }
}
