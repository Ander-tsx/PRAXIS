import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateDocumentBodyDto, ProjectPermission, UpdateDocumentBodyDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Documentos de un espacio (`docs/PLAN-DOCUMENTOS.md`).
 *
 * Todas las rutas llevan `:workspaceId` para que el guard resuelva el proyecto
 * por el camino que ya tiene; que el documento sea de ese espacio lo comprueba
 * projects-service.
 */
@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('workspaces/:workspaceId/documents')
export class DocumentsController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Documentos del espacio, con su contenido' })
  findAll(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'document_find_by_workspace' }, { workspaceId }),
    );
  }

  @Get(':documentId')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Un documento' })
  findOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) id: string,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'document_find_one' }, { id, workspaceId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_DOCUMENTS)
  @ApiOperation({ summary: 'Crea un documento en el espacio' })
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Request() req: Express.Request,
    @Body() body: CreateDocumentBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'document_create' },
        { ...body, workspaceId, requesterId: req.user!.userId },
      ),
    );
  }

  @Patch(':documentId')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_DOCUMENTS)
  @ApiOperation({ summary: 'Guarda un documento si nadie lo cambió desde que se abrió' })
  @ApiResponse({ status: 409, description: 'DOCUMENT_CHANGED: alguien guardó entre medias' })
  update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) id: string,
    @Request() req: Express.Request,
    @Body() body: UpdateDocumentBodyDto,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'document_update' },
        { ...body, id, workspaceId, requesterId: req.user!.userId },
      ),
    );
  }

  @Delete(':documentId')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_DOCUMENTS)
  @ApiOperation({ summary: 'Borra un documento. No se deshace' })
  remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('documentId', ParseUUIDPipe) id: string,
  ) {
    return firstValueFrom(
      this.projectsClient.send({ cmd: 'document_delete' }, { id, workspaceId }),
    );
  }
}
