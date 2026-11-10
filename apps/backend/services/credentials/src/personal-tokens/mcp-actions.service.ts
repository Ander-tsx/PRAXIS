import { Injectable } from '@nestjs/common';
import { type AgentKind, type TaskAgentEditor, asAgentKind } from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

export interface RegistrarAccion {
  userId: string;
  agentId: string;
  agentName: string;
  agentKind: AgentKind;
  route: string;
  area: 'task' | 'checklist' | 'comment' | 'other';
  entityId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
}

/**
 * El registro de coautoría del MCP. Solo lo escribe el gateway y solo con lo que
 * trae el JWT firmado de la llamada.
 */
@Injectable()
export class McpActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(dto: RegistrarAccion): Promise<void> {
    await this.prisma.mcpAction.create({
      data: {
        userId: dto.userId,
        agentId: dto.agentId,
        agentName: dto.agentName.slice(0, 120),
        agentKind: asAgentKind(dto.agentKind),
        route: dto.route.slice(0, 200),
        area: dto.area,
        entityId: dto.entityId ?? null,
        taskId: dto.taskId ?? null,
        projectId: dto.projectId ?? null,
      },
    });
  }

  /**
   * Quién ha editado esta tarea por MCP: una fila por (persona, agente), con el
   * último momento. Solo la tarea en sí —título, descripción, columna, encargados,
   * campos…—; el checklist y las notas llevan su marca en cada elemento.
   */
  async editoresDeTarea(taskId: string): Promise<TaskAgentEditor[]> {
    const filas = await this.prisma.mcpAction.groupBy({
      by: ['userId', 'agentKind', 'agentName'],
      where: { taskId, area: 'task' },
      _max: { createdAt: true },
    });
    return filas
      .map((f) => ({
        userId: f.userId,
        agentKind: asAgentKind(f.agentKind),
        agentName: f.agentName,
        lastAt: (f._max.createdAt ?? new Date(0)).toISOString(),
      }))
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }
}
