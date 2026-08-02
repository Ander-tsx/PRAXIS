import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import {
  CreateProjectDto,
  FindProjectsByMemberDto,
  FindProjectsDto,
  FindOneProjectDto,
  UpdateProjectDto,
  DeleteProjectDto,
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

  @MessagePattern({ cmd: 'project_resolve_resource' })
  resolveResource(@Payload() dto: { workspaceId?: string; boardId?: string }) {
    return this.projectsService.resolveResource(dto);
  }
}
