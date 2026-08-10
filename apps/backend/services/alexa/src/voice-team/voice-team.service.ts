import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { VoiceMemberQueryDto, VoiceProjectQueryDto } from '@praxis/contracts';

import { PraxisDataService } from '../clients/praxis-data.service';
import { VoiceConfigService } from '../common/voice-config.service';
import { AlexaAuthService } from '../alexa-auth/alexa-auth.service';
import { daysSince } from '../common/date.util';
import type { VoiceTask } from '../common/voice-task.types';

@Injectable()
export class VoiceTeamService {
  private readonly logger = new Logger(VoiceTeamService.name);

  constructor(
    private readonly data: PraxisDataService,
    private readonly voiceConfig: VoiceConfigService,
    private readonly voiceAuth: AlexaAuthService,
  ) {}

  private topLevel(tasks: VoiceTask[]): VoiceTask[] {
    return tasks.filter((task) => !task.parentTaskId);
  }

  /** Lista de integrantes con nombre resuelto, para que la skill haga el matching. */
  async members(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const members = await this.data.getProjectMembers(dto.projectId);

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'members_list',
    });

    return {
      projectId: project.id,
      projectName: project.name,
      total: members.length,
      items: members,
    };
  }

  private getAssigneeIds(task: VoiceTask): string[] {
    if (task.assigneeIds && task.assigneeIds.length > 0) return task.assigneeIds;
    if (task.assigneeId) return [task.assigneeId];
    return [];
  }

  /** Distribución de carga: cuántas tareas abiertas carga cada integrante. */
  async workload(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const [tasks, members] = await Promise.all([
      this.data.getProjectTasks(dto.projectId),
      this.data.getProjectMembers(dto.projectId),
    ]);

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'workload',
    });

    const relevant = this.topLevel(tasks).filter((task) => this.getAssigneeIds(task).length > 0);
    const nameById = new Map(members.map((member) => [member.id, member.name]));

    const counters = new Map<
      string,
      { assignedCount: number; completedCount: number; inProgressCount: number; openCount: number }
    >();

    for (const task of relevant) {
      for (const key of this.getAssigneeIds(task)) {
        const entry = counters.get(key) ?? {
          assignedCount: 0,
          completedCount: 0,
          inProgressCount: 0,
          openCount: 0,
        };

        entry.assignedCount += 1;
        if (this.voiceConfig.isCompleted(task.status)) {
          entry.completedCount += 1;
        } else {
          entry.openCount += 1;
          if (this.voiceConfig.isInProgress(task.status)) entry.inProgressCount += 1;
        }

        counters.set(key, entry);
      }
    }

    const items = [...counters.entries()]
      .map(([memberId, counts]) => ({
        memberId,
        memberName: nameById.get(memberId) ?? memberId,
        ...counts,
      }))
      // Carga actual = tareas abiertas; el desempate por total evita orden aleatorio
      .sort((a, b) => b.openCount - a.openCount || b.assignedCount - a.assignedCount);

    const unassignedCount = this.topLevel(tasks).filter(
      (task) =>
        this.getAssigneeIds(task).length === 0 && !this.voiceConfig.isCompleted(task.status),
    ).length;

    return {
      projectId: project.id,
      projectName: project.name,
      total: items.length,
      unassignedCount,
      items,
    };
  }

  /** Métricas individuales de un integrante dentro del proyecto. */
  async memberPerformance(dto: VoiceMemberQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const [tasks, members] = await Promise.all([
      this.data.getProjectTasks(dto.projectId),
      this.data.getProjectMembers(dto.projectId),
    ]);

    const member = members.find((candidate) => candidate.id === dto.memberId);
    if (!member) {
      this.voiceAuth.logQuery({
        userId: dto.userId,
        projectId: dto.projectId,
        queryType: 'member_performance',
        success: false,
      });
      throw new RpcException({
        statusCode: 404,
        message: 'El integrante no pertenece a este proyecto',
      });
    }

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'member_performance',
    });

    const assigned = this.topLevel(tasks).filter((task) =>
      this.getAssigneeIds(task).includes(dto.memberId),
    );
    const staleDays = this.voiceConfig.staleDays;
    const now = new Date();

    let completedCount = 0;
    let inProgressCount = 0;
    let blockedCount = 0;

    for (const task of assigned) {
      if (this.voiceConfig.isCompleted(task.status)) {
        completedCount += 1;
        continue;
      }
      if (this.voiceConfig.isInProgress(task.status)) inProgressCount += 1;
      if (
        this.voiceConfig.isBlockedStatus(task.status) ||
        daysSince(task.updatedAt, now) >= staleDays
      ) {
        blockedCount += 1;
      }
    }

    const assignedCount = assigned.length;

    return {
      projectId: project.id,
      projectName: project.name,
      memberId: member.id,
      memberName: member.name,
      roleName: member.roleName,
      assignedCount,
      completedCount,
      inProgressCount,
      blockedCount,
      openCount: assignedCount - completedCount,
      completionRate: assignedCount === 0 ? 0 : Math.round((completedCount / assignedCount) * 100),
    };
  }
}
