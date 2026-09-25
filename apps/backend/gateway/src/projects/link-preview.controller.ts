import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { type VistaPrevia, leerVistaPrevia } from './link-preview';

/** Lo ya leído, un día. Un mapa acotado: sin Redis en el gateway, y no hace falta. */
const cache = new Map<string, { hasta: number; valor: VistaPrevia | null }>();
const UN_DIA = 86_400_000;
const MAX_ENTRADAS = 1000;

/**
 * Vista previa de un enlace para las tarjetas del editor (E7 de
 * `docs/PLAN-DOCUMENTOS.md`). Con sesión: la pide quien inserta el enlace, y
 * lo que devuelve se guarda en el propio documento, así que quien lo lee
 * después —también sin cuenta— no vuelve a pedir nada.
 */
@ApiTags('Documentos compartidos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('link-preview')
export class LinkPreviewController {
  @Get()
  @ApiOperation({ summary: 'Título, descripción e imagen de una página' })
  async preview(@Query('url') url: string | undefined) {
    if (!url || url.length > 2048) throw new BadRequestException('Falta el enlace.');
    const guardado = cache.get(url);
    if (guardado && guardado.hasta > Date.now()) return guardado.valor ?? { url };

    const valor = await leerVistaPrevia(url);
    if (cache.size >= MAX_ENTRADAS) cache.delete(cache.keys().next().value as string);
    cache.set(url, { hasta: Date.now() + UN_DIA, valor });
    return valor ?? { url };
  }
}
