import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

import { RedisService } from '../redis/redis.service';
import { displayName } from '../common/text.util';
import type { VoiceMember, VoiceProject, VoiceTask } from '../common/voice-task.types';

/** Alexa corta la espera cerca de los 8 s: ningún viaje TCP debe pasar de 3 s. */
const RPC_TIMEOUT_MS = 3000;

const PROJECTS_TTL = 60;    // proyectos visibles por usuario
const PROJECT_TTL = 120;    // detalle de proyecto
const TASKS_TTL = 60;       // tareas del proyecto
const MEMBERS_TTL = 120;    // miembros del proyecto (ya enriquecidos con nombre)
const ACCESS_TTL = 120;     // resultado de la verificación de acceso

/**
 * Única puerta de entrada a los datos de otros microservicios.
 * alexa-service no tiene tablas de negocio propias: lee por TCP y cachea en Redis
 * para responder dentro del presupuesto de latencia de la voz.
 */
@Injectable()
export class PraxisDataService {
  private readonly logger = new Logger(PraxisDataService.name);

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
    private readonly redis: RedisService,
  ) {}

  private async send<T>(client: ClientProxy, cmd: string, payload: unknown): Promise<T> {
    this.logger.debug(`RPC ${cmd} → ${JSON.stringify(payload)}`);
    return firstValueFrom(
      client.send<T>({ cmd }, payload).pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  // ─── Proyectos ────────────────────────────────────────────────────────────

  /** Proyectos donde el usuario es dueño o miembro. */
  async getProjectsForUser(userId: string): Promise<VoiceProject[]> {
    const cacheKey = `alexa:projects:user:${userId}`;
    const cached = await this.redis.get<VoiceProject[]>(cacheKey);
    if (cached) return cached;

    const projects = await this.send<VoiceProject[]>(
      this.projectsClient,
      'project_find_by_member',
      { userId },
    );

    const result = Array.isArray(projects) ? projects : [];
    await this.redis.set(cacheKey, result, PROJECTS_TTL);
    return result;
  }

  async getProject(projectId: string): Promise<VoiceProject> {
    const cacheKey = `alexa:project:${projectId}`;
    const cached = await this.redis.get<VoiceProject>(cacheKey);
    if (cached) return cached;

    const project = await this.send<VoiceProject>(
      this.projectsClient,
      'project_find_one',
      { id: projectId },
    );

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    await this.redis.set(cacheKey, project, PROJECT_TTL);
    return project;
  }

  /**
   * Verifica que el usuario de voz pueda leer el proyecto.
   * El token de voz es de solo lectura, así que basta con ser dueño o miembro.
   */
  async assertProjectAccess(userId: string, projectId: string): Promise<VoiceProject> {
    const cacheKey = `alexa:access:${userId}:${projectId}`;
    const cached = await this.redis.get<{ allowed: boolean }>(cacheKey);

    const project = await this.getProject(projectId);

    if (cached) {
      if (!cached.allowed) {
        throw new RpcException({
          statusCode: 403,
          message: 'No tienes acceso a este proyecto',
        });
      }
      return project;
    }

    let allowed = project.ownerId === userId;

    if (!allowed) {
      const members = await this.getRawMembers(projectId);
      allowed = members.some((member) => member.userId === userId);
    }

    await this.redis.set(cacheKey, { allowed }, ACCESS_TTL);

    if (!allowed) {
      this.logger.warn(`Acceso de voz denegado: usuario ${userId} → proyecto ${projectId}`);
      throw new RpcException({
        statusCode: 403,
        message: 'No tienes acceso a este proyecto',
      });
    }

    return project;
  }

  // ─── Tareas ───────────────────────────────────────────────────────────────

  async getProjectTasks(projectId: string): Promise<VoiceTask[]> {
    const cacheKey = `alexa:tasks:project:${projectId}`;
    const cached = await this.redis.get<VoiceTask[]>(cacheKey);
    if (cached) return cached;

    const tasks = await this.send<VoiceTask[]>(
      this.tasksClient,
      'task_find_by_project',
      { projectId },
    );

    const result = Array.isArray(tasks) ? tasks : [];
    await this.redis.set(cacheKey, result, TASKS_TTL);
    return result;
  }

  // ─── Miembros ─────────────────────────────────────────────────────────────

  private async getRawMembers(
    projectId: string,
  ): Promise<Array<{ userId: string; projectRole?: { name?: string } }>> {
    const members = await this.send<Array<{ userId: string; projectRole?: { name?: string } }>>(
      this.projectsClient,
      'member_find_all',
      { projectId },
    );
    return Array.isArray(members) ? members : [];
  }

  /**
   * Miembros del proyecto ya enriquecidos con nombre y correo.
   * La skill hace el matching difuso por nombre, así que el nombre debe venir resuelto.
   */
  async getProjectMembers(projectId: string): Promise<VoiceMember[]> {
    const cacheKey = `alexa:members:project:${projectId}`;
    const cached = await this.redis.get<VoiceMember[]>(cacheKey);
    if (cached) return cached;

    const [project, rawMembers] = await Promise.all([
      this.getProject(projectId),
      this.getRawMembers(projectId),
    ]);

    const userIds = [...new Set(rawMembers.map((member) => member.userId))];
    // El dueño puede no estar registrado como miembro; igual debe aparecer en el equipo
    if (project.ownerId && !userIds.includes(project.ownerId)) {
      userIds.push(project.ownerId);
    }

    const profiles = await this.getUsersByIds(userIds);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const roleByUserId = new Map(
      rawMembers.map((member) => [member.userId, member.projectRole?.name ?? null]),
    );

    const members: VoiceMember[] = userIds.map((id) => {
      const profile = profileById.get(id);
      return {
        id,
        name: profile ? displayName(profile) : id,
        email: profile?.credential?.email ?? null,
        roleName: roleByUserId.get(id) ?? null,
        isOwner: id === project.ownerId,
      };
    });

    await this.redis.set(cacheKey, members, MEMBERS_TTL);
    return members;
  }

  async getUsersByIds(ids: string[]): Promise<
    Array<{
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      credential?: { email?: string | null } | null;
    }>
  > {
    if (ids.length === 0) return [];

    try {
      const users = await this.send<any[]>(this.credentialsClient, 'user_find_by_ids', { ids });
      return Array.isArray(users) ? users : [];
    } catch (error) {
      // Sin nombres la respuesta hablada pierde calidad, pero no debe romper la consulta
      this.logger.warn(
        `No se pudieron resolver los perfiles de usuario: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /** Valida credenciales delegando en credentials-service (bcrypt vive allí). */
  async login(email: string, password: string): Promise<{ userId: string }> {
    return this.send<{ userId: string }>(this.credentialsClient, 'auth_login', {
      email,
      password,
    });
  }

  async getUser(userId: string) {
    const [user] = await this.getUsersByIds([userId]);
    return user ?? null;
  }
}
