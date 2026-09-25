import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LinkTaskDocumentBodyDto, ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

interface Vinculo {
  documentId: string;
  linkedBy: string;
  createdAt: string;
}
interface MetaDoc {
  id: string;
  title: string;
  workspaceId: string;
  projectId: string;
  updatedAt: string;
}

/**
 * Los documentos de una tarea (E9 de `docs/PLAN-DOCUMENTOS.md`).
 *
 * Se compone aquí porque nadie lo tiene entero: tasks-service guarda el
 * vínculo y no sabe de documentos; projects-service tiene los documentos y no
 * sabe de tareas. Y es aquí donde se comprueba que el documento es **del
 * mismo proyecto**: sin eso, vincular el id de un documento ajeno lo dejaría
 * enlazado —y su título a la vista— en una tarea que no tiene nada que ver.
 */
@ApiTags('Tareas')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('tasks/:taskId/documents')
export class TaskDocumentsController {
  constructor(
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Documentos vinculados a la tarea' })
  async findAll(@Param('taskId') taskId: string, @Request() req: Express.Request) {
    const vinculos = await firstValueFrom(
      this.tasksClient.send<Vinculo[]>(
        { cmd: 'task_documents' },
        { taskId, projectId: req.projectId },
      ),
    );
    return this.componer(vinculos, req.projectId as string);
  }

  @Post()
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Vincula un documento del proyecto a la tarea' })
  async link(
    @Param('taskId') taskId: string,
    @Request() req: Express.Request,
    @Body() body: LinkTaskDocumentBodyDto,
  ) {
    const [meta] = await firstValueFrom(
      this.projectsClient.send<MetaDoc[]>(
        { cmd: 'document_meta_many' },
        { ids: [body.documentId] },
      ),
    );
    if (!meta || meta.projectId !== req.projectId) {
      throw new BadRequestException('Ese documento no es de este proyecto.');
    }
    const vinculos = await firstValueFrom(
      this.tasksClient.send<Vinculo[]>(
        { cmd: 'task_document_link' },
        {
          taskId,
          projectId: req.projectId,
          documentId: body.documentId,
          requesterId: req.user!.userId,
        },
      ),
    );
    return this.componer(vinculos, req.projectId as string);
  }

  @Delete(':documentId')
  @RequireProjectPermission(ProjectPermission.CAN_EDIT_TASK)
  @ApiOperation({ summary: 'Quita un documento de la tarea (el documento no se borra)' })
  async unlink(
    @Param('taskId') taskId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Request() req: Express.Request,
  ) {
    const vinculos = await firstValueFrom(
      this.tasksClient.send<Vinculo[]>(
        { cmd: 'task_document_unlink' },
        { taskId, projectId: req.projectId, documentId, requesterId: req.user!.userId },
      ),
    );
    return this.componer(vinculos, req.projectId as string);
  }

  /** Los vínculos con su título; los de documentos borrados o ajenos, fuera. */
  private async componer(vinculos: Vinculo[], projectId: string) {
    if (vinculos.length === 0) return [];
    const metas = await firstValueFrom(
      this.projectsClient.send<MetaDoc[]>(
        { cmd: 'document_meta_many' },
        { ids: vinculos.map((v) => v.documentId) },
      ),
    );
    const porId = new Map(metas.filter((m) => m.projectId === projectId).map((m) => [m.id, m]));
    return vinculos
      .filter((v) => porId.has(v.documentId))
      .map((v) => ({ ...porId.get(v.documentId), linkedAt: v.createdAt }));
  }
}
