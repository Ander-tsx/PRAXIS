import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  DeleteWorkspaceDto,
} from '@praxis/contracts';
import { WorkspacesService } from './workspaces.service';

@Controller()
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @MessagePattern({ cmd: 'workspace_create' })
  createWorkspace(@Payload() dto: CreateWorkspaceDto) {
    return this.workspacesService.createWorkspace(dto);
  }

  @MessagePattern({ cmd: 'workspace_find_all' })
  findWorkspaces(@Payload() dto: { projectId: string }) {
    return this.workspacesService.findWorkspaces(dto.projectId);
  }

  @MessagePattern({ cmd: 'workspace_update' })
  updateWorkspace(@Payload() dto: UpdateWorkspaceDto) {
    return this.workspacesService.updateWorkspace(dto);
  }

  @MessagePattern({ cmd: 'workspace_delete' })
  deleteWorkspace(@Payload() dto: DeleteWorkspaceDto) {
    return this.workspacesService.deleteWorkspace(dto.id);
  }
}
