import { Injectable, Logger } from '@nestjs/common';
import { VoiceProjectQueryDto } from '@praxis/contracts';

import { PraxisDataService } from '../clients/praxis-data.service';
import { VoiceConfigService } from '../common/voice-config.service';
import { AlexaAuthService } from '../alexa-auth/alexa-auth.service';
import { addDays, daysSince, isWithin, weekWindows } from '../common/date.util';
import type { VoiceTask } from '../common/voice-task.types';

@Injectable()
export class VoiceAnalyticsService {
  private readonly logger = new Logger(VoiceAnalyticsService.name);

  constructor(
    private readonly data: PraxisDataService,
    private readonly voiceConfig: VoiceConfigService,
    private readonly voiceAuth: AlexaAuthService,
  ) {}

  /**
   * Las subtareas son ítems hijos: contarlas junto a sus padres inflaría el avance.
   * Toda la analítica trabaja sobre tareas de primer nivel.
   */
  private topLevel(tasks: VoiceTask[]): VoiceTask[] {
    return tasks.filter((task) => !task.parentTaskId);
  }

  private completed(tasks: VoiceTask[]): VoiceTask[] {
    return tasks.filter((task) => this.voiceConfig.isCompleted(task.status));
  }

  // ─── Avance del proyecto ──────────────────────────────────────────────────

  async progress(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const tasks = this.topLevel(await this.data.getProjectTasks(dto.projectId));

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'project_progress',
    });

    const totalTasks = tasks.length;
    const completedTasks = this.completed(tasks).length;

    // Proyecto sin tareas: se responde 0 %, nunca una división entre cero
    const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    return {
      projectId: project.id,
      projectName: project.name,
      totalTasks,
      completedTasks,
      pendingTasks: totalTasks - completedTasks,
      percentage,
      hasData: totalTasks > 0,
    };
  }

  // ─── Productividad semanal ────────────────────────────────────────────────

  async weeklyProductivity(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const tasks = this.topLevel(await this.data.getProjectTasks(dto.projectId));

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'weekly_productivity',
    });

    const windows = weekWindows(this.voiceConfig.weekMode);
    const completed = this.completed(tasks);

    // No existe campo completedAt: updatedAt es la mejor señal de cuándo se cerró
    const completedThisWeek = completed.filter((task) =>
      isWithin(task.updatedAt, windows.currentStart, windows.currentEnd),
    ).length;

    const completedLastWeek = completed.filter((task) =>
      isWithin(task.updatedAt, windows.previousStart, windows.previousEnd),
    ).length;

    let deltaPercent: number;
    if (completedLastWeek === 0) {
      deltaPercent = completedThisWeek === 0 ? 0 : 100;
    } else {
      deltaPercent = Math.round(
        ((completedThisWeek - completedLastWeek) / completedLastWeek) * 100,
      );
    }

    const trend = deltaPercent > 0 ? 'up' : deltaPercent < 0 ? 'down' : 'stable';

    return {
      projectId: project.id,
      projectName: project.name,
      completedThisWeek,
      completedLastWeek,
      deltaPercent,
      trend,
      weekMode: this.voiceConfig.weekMode,
      currentWeekStart: windows.currentStart.toISOString(),
      previousWeekStart: windows.previousStart.toISOString(),
    };
  }

  // ─── Pronóstico de finalización ───────────────────────────────────────────

  async forecast(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const tasks = this.topLevel(await this.data.getProjectTasks(dto.projectId));

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'forecast',
    });

    const completed = this.completed(tasks);
    const remainingTasks = tasks.length - completed.length;

    const weeks = this.voiceConfig.forecastWeeks;
    const windowStart = addDays(new Date(), -7 * weeks);

    const completedInWindow = completed.filter(
      (task) => new Date(task.updatedAt) >= windowStart,
    ).length;

    const velocityPerWeek = completedInWindow / weeks;

    const base = {
      projectId: project.id,
      projectName: project.name,
      totalTasks: tasks.length,
      completedTasks: completed.length,
      remainingTasks,
      velocityPerWeek: Math.round(velocityPerWeek * 100) / 100,
      windowWeeks: weeks,
    };

    if (remainingTasks === 0 && tasks.length > 0) {
      return {
        ...base,
        estimatedDays: 0,
        estimatedDate: new Date().toISOString(),
        reason: 'COMPLETED',
      };
    }

    // Sin velocidad no hay forma honesta de estimar: se responde null y la skill lo dice
    if (velocityPerWeek <= 0) {
      return { ...base, estimatedDays: null, estimatedDate: null, reason: 'INSUFFICIENT_DATA' };
    }

    const weeksRemaining = remainingTasks / velocityPerWeek;
    const estimatedDays = Math.ceil(weeksRemaining * 7);

    return {
      ...base,
      estimatedDays,
      estimatedWeeks: Math.round(weeksRemaining * 10) / 10,
      estimatedDate: addDays(new Date(), estimatedDays).toISOString(),
      reason: 'OK',
    };
  }

  // ─── Tareas bloqueadas o estancadas ───────────────────────────────────────

  /**
   * Task.status no tiene un estado BLOCKED formal, así que se consideran bloqueadas
   * tanto las marcadas con un estado de bloqueo configurado como las tareas abiertas
   * que llevan demasiados días sin cambios.
   */
  async blockedTasks(dto: VoiceProjectQueryDto) {
    const project = await this.data.assertProjectAccess(dto.userId, dto.projectId);
    const [tasks, members] = await Promise.all([
      this.data.getProjectTasks(dto.projectId),
      this.data.getProjectMembers(dto.projectId),
    ]);

    this.voiceAuth.logQuery({
      userId: dto.userId,
      projectId: dto.projectId,
      queryType: 'blocked_tasks',
    });

    const nameById = new Map(members.map((member) => [member.id, member.name]));
    const staleDays = this.voiceConfig.staleDays;
    const now = new Date();

    const items = tasks
      .filter((task) => !this.voiceConfig.isCompleted(task.status))
      .map((task) => {
        const daysStalled = daysSince(task.updatedAt, now);
        const byStatus = this.voiceConfig.isBlockedStatus(task.status);
        const byStaleness = daysStalled >= staleDays;

        return {
          id: task.id,
          title: task.title,
          status: task.status,
          daysStalled,
          assigneeId: task.assigneeId,
          assigneeName: task.assigneeId ? (nameById.get(task.assigneeId) ?? null) : null,
          priority: task.priority,
          reason: byStatus ? 'BLOCKED_STATUS' : 'STALLED',
          isBlocked: byStatus || byStaleness,
        };
      })
      .filter((task) => task.isBlocked)
      // La skill lee solo las primeras, así que el orden lo define el backend
      .sort((a, b) => b.daysStalled - a.daysStalled);

    return {
      projectId: project.id,
      projectName: project.name,
      staleThresholdDays: staleDays,
      total: items.length,
      items: items.map(({ isBlocked, ...task }) => task),
    };
  }
}
