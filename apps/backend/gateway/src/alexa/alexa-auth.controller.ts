import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RedeemSeedPhraseDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';

/**
 * Autenticación y vinculación de cuentas de Alexa.
 * `POST /api/alexa/link` requiere el JWT de plataforma (App Web).
 * `POST /api/alexa/link/redeem` es público e invocado por la Alexa Skill.
 */
@ApiTags('Alexa · Auth')
@Controller('alexa')
export class AlexaAuthController {
  constructor(
    @Inject('ALEXA_SERVICE') private readonly alexaClient: ClientProxy,
  ) {}

  @Post('link')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Genera la frase semilla que el usuario dictará a Alexa (expira en 5 minutos)',
  })
  @ApiResponse({ status: 201, description: 'Frase semilla generada' })
  generateSeedPhrase(@Request() req: Express.Request) {
    return firstValueFrom(
      this.alexaClient.send({ cmd: 'alexa_link_generate' }, { userId: req.user!.userId }),
    );
  }

  @Post('link/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Canjea la frase semilla dictada por un alexaToken' })
  @ApiResponse({ status: 200, description: 'Vinculación creada y alexaToken emitido' })
  @ApiResponse({ status: 400, description: 'Frase inválida' })
  @ApiResponse({ status: 410, description: 'Frase expirada o ya utilizada' })
  @ApiResponse({ status: 429, description: 'Demasiados intentos' })
  redeem(@Body() body: RedeemSeedPhraseDto) {
    return firstValueFrom(this.alexaClient.send({ cmd: 'alexa_link_redeem' }, body));
  }

  @Get('links')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista las vinculaciones de voz del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Vinculaciones recuperadas' })
  findLinks(@Request() req: Express.Request) {
    return firstValueFrom(
      this.alexaClient.send({ cmd: 'alexa_link_find_all' }, { userId: req.user!.userId }),
    );
  }

  @Delete('links/:linkId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca una vinculación de voz concreta' })
  @ApiResponse({ status: 200, description: 'Vinculación revocada' })
  revokeOne(@Request() req: Express.Request, @Param('linkId') linkId: string) {
    return firstValueFrom(
      this.alexaClient.send(
        { cmd: 'alexa_link_revoke' },
        { userId: req.user!.userId, linkId },
      ),
    );
  }

  @Delete('links')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca todas las vinculaciones de voz del usuario' })
  @ApiResponse({ status: 200, description: 'Vinculaciones revocadas' })
  revokeAll(@Request() req: Express.Request) {
    return firstValueFrom(
      this.alexaClient.send({ cmd: 'alexa_link_revoke' }, { userId: req.user!.userId }),
    );
  }
}
