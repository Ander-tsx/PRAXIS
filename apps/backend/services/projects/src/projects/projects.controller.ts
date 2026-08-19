import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  CreateProjectDto,
  DeleteProjectDto,
  FindOneProjectDto,
  FindProjectsByMemberDto,
  FindProjectsDto,
  type ProjectStatus,
  SetProjectStatusDto,
  UpdateProjectDto,
} from '@praxis/contracts';

import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /* ─── Projects ───────────────────────────────────────────────────── */

  @MessagePattern({ cmd: 'project_create' })
  create(@Payload() dto: CreateProjectDto) {
    return this.projectsService.createProject(dto);
  }

  @MessagePattern({ cmd: 'project_find_all' })
  findAll(@Payload() dto: FindProjectsDto) {
    return this.projectsService.findAllProjects(dto);
  }

  /** Proyectos donde el usuario es dueño o miembro */
  @MessagePattern({ cmd: 'project_find_by_member' })
  findByMember(@Payload() dto: FindProjectsByMemberDto) {
    return this.projectsService.findProjectsByMember(dto);
  }

  @MessagePattern({ cmd: 'project_find_one' })
  findOne(@Payload() dto: FindOneProjectDto) {
    return this.projectsService.findOneProject(dto.id);
  }

  @MessagePattern({ cmd: 'project_update' })
  update(@Payload() dto: UpdateProjectDto) {
    return this.projectsService.updateProject(dto);
  }

  @MessagePattern({ cmd: 'project_delete' })
  delete(@Payload() dto: DeleteProjectDto) {
    return this.projectsService.deleteProject(dto.id);
  }

  /* ─── Administración de la plataforma ────────────────────────────── */

  /**
   * Cambia el estado administrativo. Comando aparte de `project_update`, que es
   * el de renombrar: el estado no lo decide quien edita el proyecto sino quien
   * administra la plataforma, y son rutas distintas con guards distintos.
   */
  @MessagePattern({ cmd: 'project_set_status' })
  setStatus(@Payload() dto: SetProjectStatusDto) {
    return this.projectsService.setStatus({
      id: dto.id,
      status: dto.status,
      reason: dto.reason,
      actorId: dto.actorId,
      correlationId: dto.correlationId,
      causationId: dto.causationId,
    });
  }

  /** El inventario del panel: todos los proyectos, archivados incluidos. */
  @MessagePattern({ cmd: 'project_find_all_admin' })
  findAllForAdmin(
    @Payload()
    dto: { page?: number; limit?: number; search?: string; status?: ProjectStatus },
  ) {
    return this.projectsService.findAllForAdmin(dto);
  }

  /** El detalle para el panel, sin pasar por la caché que lee el guard. */
  @MessagePattern({ cmd: 'project_find_one_admin' })
  findOneForAdmin(@Payload() dto: FindOneProjectDto) {
    return this.projectsService.findOneForAdmin(dto.id);
  }

  @MessagePattern({ cmd: 'project_resolve_resource' })
  resolveResource(@Payload() dto: { workspaceId?: string; boardId?: string }) {
    return this.projectsService.resolveResource(dto);
  }

  /** Slug de la URL → id real. Lo usa el guard del gateway. */
  @MessagePattern({ cmd: 'project_resolve_slug' })
  resolveSlug(@Payload() dto: { slug: string }) {
    return this.projectsService.resolveSlug(dto);
  }
}
