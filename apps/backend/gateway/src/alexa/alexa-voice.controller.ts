import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { firstValueFrom } from 'rxjs';
import { AlexaTokenGuard } from '../common/guards/alexa-token.guard';

/**
 * Consultas de la skill de Alexa. Exigen un alexaToken válido en el encabezado Authorization: Bearer <token>.
 */
@ApiTags('Alexa · Consultas')
@ApiBearerAuth()
@UseGuards(AlexaTokenGuard)
@Controller('alexa')
export class AlexaVoiceController {
  constructor(
    @Inject('ALEXA_SERVICE') private readonly alexaClient: ClientProxy,
  ) {}

  private query(cmd: string, payload: Record<string, unknown>) {
    return firstValueFrom(this.alexaClient.send({ cmd }, payload));
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtiene el perfil básico del usuario de voz autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil recuperado ({ id, displayName })' })
  me(@Request() req: Express.Request) {
    return this.query('alexa_me', { userId: req.user!.userId });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra la sesión de voz del alexaToken activo' })
  @ApiResponse({ status: 200, description: 'Sesión revocada' })
  logout(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.split(' ')[1] ?? '';
    return this.query('alexa_logout', { token });
  }

  @Get('projects')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Proyectos visibles para el usuario de voz' })
  @ApiResponse({ status: 200, description: 'Lista de proyectos' })
  projects(@Request() req: Express.Request) {
    return this.query('alexa_projects_find_all', { userId: req.user!.userId });
  }

  @Post('projects/:projectId/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma la selección del proyecto activo' })
  @ApiResponse({ status: 200, description: 'Selección confirmada' })
  select(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return { success: true, lastProjectId: projectId };
  }

  @Get('projects/:projectId/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avance del proyecto' })
  @ApiResponse({ status: 200, description: 'Porcentaje y conteo de tareas' })
  progress(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_progress', { userId: req.user!.userId, projectId });
  }

  @Get('projects/:projectId/productivity/weekly')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Productividad de la semana frente a la anterior' })
  @ApiResponse({ status: 200, description: 'Comparativa semanal' })
  weeklyProductivity(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_productivity_weekly', {
      userId: req.user!.userId,
      projectId,
    });
  }

  @Get('projects/:projectId/forecast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimación de finalización según la velocidad reciente' })
  @ApiResponse({ status: 200, description: 'Días estimados o null si no hay datos suficientes' })
  forecast(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_forecast', { userId: req.user!.userId, projectId });
  }

  @Get('projects/:projectId/blocked-tasks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tareas bloqueadas o estancadas, ordenadas por días sin cambios' })
  @ApiResponse({ status: 200, description: 'Lista de tareas bloqueadas' })
  blockedTasks(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_blocked_tasks', { userId: req.user!.userId, projectId });
  }

  @Get('projects/:projectId/workload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Distribución de carga de trabajo por integrante' })
  @ApiResponse({ status: 200, description: 'Carga por integrante' })
  workload(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_workload', { userId: req.user!.userId, projectId });
  }

  @Get('projects/:projectId/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Integrantes del proyecto con nombre resuelto' })
  @ApiResponse({ status: 200, description: 'Lista de integrantes' })
  members(@Request() req: Express.Request, @Param('projectId') projectId: string) {
    return this.query('alexa_project_members', { userId: req.user!.userId, projectId });
  }

  @Get('projects/:projectId/members/:memberId/performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desempeño individual de un integrante' })
  @ApiResponse({ status: 200, description: 'Métricas del integrante' })
  @ApiResponse({ status: 404, description: 'El integrante no pertenece al proyecto' })
  memberPerformance(
    @Request() req: Express.Request,
    @Param('projectId') projectId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.query('alexa_member_performance', {
      userId: req.user!.userId,
      projectId,
      memberId,
    });
  }
}
