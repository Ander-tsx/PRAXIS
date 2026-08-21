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
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateAutomationRuleBodyDto,
  ProjectPermission,
  UpdateAutomationRuleBodyDto,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

@ApiTags('Automations')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/automations')
export class ProjectAutomationsController {
  constructor(@Inject('AUTOMATION_SERVICE') private readonly automationClient: ClientProxy) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Lista las reglas de automatización del proyecto' })
  list(@Request() req: Express.Request) {
    return firstValueFrom(
      this.automationClient.send({ cmd: 'automation_rule_list' }, { projectId: req.projectId }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Crea una regla de automatización sin ejecutarla' })
  @ApiResponse({
    status: 201,
    description: 'Regla creada y deshabilitada o habilitada según su estado',
  })
  create(@Request() req: Express.Request, @Body() body: CreateAutomationRuleBodyDto) {
    const createdBy = req.user?.userId;
    if (!createdBy) throw new UnauthorizedException();
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_rule_create' },
        { ...body, projectId: req.projectId, createdBy },
      ),
    );
  }

  @Post('review')
  @HttpCode(HttpStatus.OK)
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Revisa ahora vencimientos y tareas estancadas del proyecto' })
  review(@Request() req: Express.Request) {
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_project_review' },
        { projectId: req.projectId },
      ),
    );
  }

  @Get('catalog')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Disparadores, condiciones y acciones que admite una regla' })
  catalog() {
    return firstValueFrom(this.automationClient.send({ cmd: 'automation_catalog' }, {}));
  }

  @Get('executions')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Lista las ejecuciones recientes de automatización' })
  executions(@Request() req: Express.Request) {
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_execution_list' },
        { projectId: req.projectId, limit: 20 },
      ),
    );
  }

  @Get(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Obtiene una regla del proyecto' })
  find(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_rule_find_one' },
        { id, projectId: req.projectId },
      ),
    );
  }

  @Patch(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Actualiza una regla e incrementa su versión' })
  update(
    @Request() req: Express.Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAutomationRuleBodyDto,
  ) {
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_rule_update' },
        { ...body, id, projectId: req.projectId },
      ),
    );
  }

  @Delete(':id')
  @RequireProjectPermission(ProjectPermission.CAN_MANAGE_AUTOMATIONS)
  @ApiOperation({ summary: 'Elimina una regla de automatización' })
  remove(@Request() req: Express.Request, @Param('id', ParseUUIDPipe) id: string) {
    return firstValueFrom(
      this.automationClient.send(
        { cmd: 'automation_rule_delete' },
        { id, projectId: req.projectId },
      ),
    );
  }
}
