const fs = require('fs');

const controllerPath = 'apps/backend/gateway/src/users/user.controller.ts';
let controllerCode = fs.readFileSync(controllerPath, 'utf8');

const coverEndpoints = `
  @Get(':id/cover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bytes de la foto de portada' })
  async getCover(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const cover = await firstValueFrom(
      this.credentialsClient.send<{ mimeType: string; size: number; base64: string } | null>(
        { cmd: 'user_get_cover' },
        { userId: id },
      ),
    );
    if (!cover) throw new NotFoundException('Esa cuenta no tiene portada');

    const bytes = Buffer.from(cover.base64, 'base64');
    res.setHeader('Content-Type', cover.mimeType);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(bytes);
  }

  @Post(':id/cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Sube la foto de portada' })
  @ApiResponse({ status: 200, description: 'Perfil con la coverUrl nueva' })
  setCover(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('La foto tiene que ser PNG, JPEG o WebP.');
    }
    if (file.size === 0) throw new BadRequestException('El archivo está vacío');

    return this.unoConPresenciaReal(
      firstValueFrom(
        this.credentialsClient.send<any>(
          { cmd: 'user_set_cover' },
          { userId: id, mimeType: file.mimetype, base64: file.buffer.toString('base64') },
        ),
      ),
    );
  }

  @Delete(':id/cover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccountOwnerGuard)
  @ApiOperation({ summary: 'Borra la foto de portada' })
  @ApiResponse({ status: 200, description: 'Perfil sin coverUrl' })
  deleteCover(@Param('id', ParseUUIDPipe) id: string) {
    return this.unoConPresenciaReal(
      firstValueFrom(
        this.credentialsClient.send<any>({ cmd: 'user_delete_cover' }, { userId: id }),
      ),
    );
  }
`;

controllerCode = controllerCode.replace('@Get(\':id/avatar\')', coverEndpoints + '\n  @Get(\':id/avatar\')');
fs.writeFileSync(controllerPath, controllerCode);

console.log("Patched gateway controller");
