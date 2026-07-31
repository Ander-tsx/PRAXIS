import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import {
  ATTACHMENT_ALLOWED_MIME,
  ATTACHMENT_MAX_BYTES,
  ProjectPermission,
  isInlineMime,
} from '@praxis/contracts';

/**
 * Archivos adjuntos a una tarea.
 *
 * Se guardan en Postgres. La alternativa era meter almacenamiento de objetos en
 * el compose, y con la escala de esta aplicación no compensa otro servicio que
 * levantar, respaldar y explicar. Los bytes viven en su propia tabla para que
 * ningún listado pueda arrastrarlos.
 *
 * ⚠️ Aquí viven las tres decisiones de seguridad de esta pieza:
 * el tope de tamaño, la lista blanca de tipos y **cómo se sirven al descargar**.
 */
@ApiTags('Task Attachments')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/attachments')
export class AttachmentsController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Adjuntos de una tarea (metadatos, sin contenido)' })
  @ApiResponse({ status: 200, description: 'Lista de adjuntos' })
  findAll(@Param('taskId') taskId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.tasksClient.send({ cmd: 'attachment_find_all' }, { taskId, projectId: req.projectId }),
    );
  }

  /**
   * Sube un archivo.
   *
   * `memoryStorage` y no disco: el archivo va a la base, así que escribirlo en
   * el disco del gateway sería un rodeo y dejaría basura si algo falla después.
   * El límite de multer corta el caudal en cuanto se pasa, sin llegar a leerlo
   * entero en memoria.
   *
   * Multipart no pasa por el parser de JSON, así que el límite de cuerpo del
   * gateway no estorba.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ATTACHMENT_MAX_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Adjunta un archivo a una tarea' })
  @ApiResponse({ status: 201, description: 'Archivo adjuntado' })
  upload(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No llegó ningún archivo en el campo «file»');
    }
    if (!(ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(`Tipo de archivo no admitido: ${file.mimetype}`);
    }
    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'attachment_create' },
        {
          taskId,
          projectId: req.projectId,
          requesterId: req.user!.userId,
          filename: sanitizeFilename(file.originalname),
          mimeType: file.mimetype,
          // El tamaño real de lo recibido, no lo que declare nadie.
          size: file.size,
          // Base64 por el salto TCP: ver `CreateAttachmentDto`.
          content: file.buffer.toString('base64'),
        },
      ),
    );
  }

  /**
   * Descarga el contenido.
   *
   * **Solo las imágenes rasterizadas se sirven en línea.** Todo lo demás va con
   * `Content-Disposition: attachment`, y el SVG ni siquiera se admite al subir:
   * es XML con scripts dentro, y servirlo en línea desde el mismo origen que la
   * aplicación —que es el caso, porque las zonas pasan por su propio proxy— es
   * XSS directo. `nosniff` cierra la otra vía: que el navegador adivine un tipo
   * distinto del declarado.
   */
  @Get(':id/content')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Descarga el contenido de un adjunto' })
  @ApiResponse({ status: 200, description: 'Bytes del archivo' })
  async download(
    @Param('id') id: string,
    @Request() req: Express.Request,
    @Res() res: Response,
  ) {
    const file = await firstValueFrom(
      this.tasksClient.send(
        { cmd: 'attachment_get_content' },
        { id, projectId: req.projectId },
      ),
    );

    const buffer = Buffer.from(file.content, 'base64');
    const disposition = isInlineMime(file.mimeType) ? 'inline' : 'attachment';

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* El nombre va en `filename*` con codificación RFC 5987: los acentos y los
       espacios rompen el `filename` simple. */
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    /* Privado: es contenido de un proyecto, no debe quedar en caché compartida. */
    res.setHeader('Cache-Control', 'private, max-age=300');

    res.end(buffer);
  }

  /** Lo borra quien lo subió, o quien pueda eliminar tareas. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Elimina un adjunto propio, o cualquiera si puedes moderar' })
  @ApiResponse({ status: 200, description: 'Adjunto eliminado' })
  async delete(@Param('id') id: string, @Request() req: Express.Request) {
    const canModerate = await this.canDeleteTasks(req.user!.userId, req.projectId!);

    return firstValueFrom(
      this.tasksClient.send(
        { cmd: 'attachment_delete' },
        { id, projectId: req.projectId, requesterId: req.user!.userId, canModerate },
      ),
    );
  }

  /** ¿Puede esta persona eliminar tareas del proyecto? El dueño siempre. */
  private async canDeleteTasks(userId: string, projectId: string): Promise<boolean> {
    try {
      const project = await firstValueFrom(
        this.projectsClient.send({ cmd: 'project_find_one' }, { id: projectId }),
      );
      if (project?.ownerId === userId) return true;

      const { allowed } = await firstValueFrom(
        this.projectsClient.send(
          { cmd: 'project_check_permission' },
          { userId, projectId, permission: ProjectPermission.CAN_DELETE_TASK },
        ),
      );
      return !!allowed;
    } catch {
      return false;
    }
  }
}

/**
 * Deja el nombre en algo seguro de devolver en una cabecera.
 *
 * Quita separadores de ruta —un `../` en el nombre no debe poder salir de
 * ningún sitio— y los caracteres de control, que romperían la cabecera.
 */
function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[/\\]/g, '_')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: es justo lo que hay que quitar
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();

  return clean.slice(0, 255) || 'archivo';
}
