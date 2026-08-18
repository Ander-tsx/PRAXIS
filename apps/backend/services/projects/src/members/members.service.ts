import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  AddMemberDto,
  ChangeMemberRoleDto,
  NotificationType,
  RemoveMemberDto,
} from '@praxis/contracts';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectDomainOutboxFactory } from '../domain-events/project-domain-outbox.factory';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectRolesService } from '../project-roles/project-roles.service';
import { RedisService } from '../redis/redis.service';

const LIST_CACHE_TTL = 60;

@Injectable()
export class MembersService {
  private readonly domainOutbox = new ProjectDomainOutboxFactory();
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly projectRolesService: ProjectRolesService,
    private readonly notifications: NotificationsService,
  ) {}

  async addMember(dto: AddMemberDto) {
    const [project, role] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: dto.projectId } }),
      this.prisma.projectRole.findUnique({ where: { id: dto.projectRoleId } }),
    ]);

    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    if (!role)
      throw new RpcException({ statusCode: 404, message: 'Rol de proyecto no encontrado' });

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
    });
    if (existing) {
      throw new RpcException({ statusCode: 409, message: 'El usuario ya es miembro del proyecto' });
    }

    const member = await this.prisma.projectMember.create({
      data: {
        projectId: dto.projectId,
        userId: dto.userId,
        projectRoleId: dto.projectRoleId,
      },
      include: { projectRole: true },
    });

    await this.redis.del(`members:project:${dto.projectId}`);
    // El detalle cacheado trae _count.members: si no, el contador se queda viejo.
    await this.redis.del(`project:${dto.projectId}`);
    /* Y su lista de proyectos, que acaba de ganar uno. Ver la nota de
       `invalidarListasDe` en projects.service. */
    await this.redis.del(`projects:member:${dto.userId}`);
    await this.projectRolesService.invalidatePermissionCache(dto.userId, dto.projectId);
    return member;
  }

  async removeMember(dto: RemoveMemberDto) {
    if (!dto.requesterId) {
      throw new RpcException({ statusCode: 400, message: 'Falta actor confiable' });
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
    });
    if (!member) {
      throw new RpcException({ statusCode: 404, message: 'El usuario no es miembro del proyecto' });
    }

    /* El nombre se lee **antes** de borrar, para guardarlo como copia en el
       aviso: quien deja de ser miembro ya no puede consultarlo después. */
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { name: true },
    });

    await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.projectMember.findUniqueOrThrow({ where: { id: member.id } });
      if (snapshot.projectId !== dto.projectId || snapshot.userId !== dto.userId) {
        throw new RpcException({ statusCode: 403, message: 'Forbidden' });
      }
      await tx.projectMember.delete({ where: { id: snapshot.id } });
      await this.domainOutbox.persist(tx, {
        projectId: snapshot.projectId,
        subject: { type: 'PROJECT_MEMBER', id: snapshot.id },
        actor: { type: 'USER', id: dto.requesterId },
        correlationId: randomUUID(),
      }, { type: 'project.member-removed.v1', payload: { userId: snapshot.userId } });
    });
    await this.redis.del(`members:project:${dto.projectId}`);
    // El detalle cacheado trae _count.members: si no, el contador se queda viejo.
    await this.redis.del(`project:${dto.projectId}`);
    /* Y su lista, que acaba de perder uno: seguir enseñándolo es ofrecer una
       puerta que el guard ya cerró. */
    await this.redis.del(`projects:member:${dto.userId}`);
    await this.projectRolesService.invalidatePermissionCache(dto.userId, dto.projectId);

    await this.notifications.emit({
      userId: dto.userId,
      type: NotificationType.MEMBER_REMOVED,
      actorId: dto.requesterId,
      projectId: dto.projectId,
      projectName: project?.name,
    });

    return { success: true };
  }

  /**
   * Cambiar el rol de alguien que ya es miembro.
   *
   * No existía, y la única forma de hacerlo era sacarlo del proyecto y volver a
   * meterlo: eso le borraba la fecha de entrada, le mandaba dos avisos —uno
   * diciendo que lo habían sacado— y entre las dos operaciones lo dejaba sin
   * ningún permiso. Un cambio de rol no es una baja seguida de un alta.
   *
   * ⚠️ **Invalida la caché de permisos de esa persona.** Sin eso el rol nuevo
   * tarda hasta 300 s en surtir efecto, y el caso peor no es el de alguien que
   * gana permisos —espera un rato— sino el de alguien a quien se los quitan y
   * los conserva cinco minutos.
   */
  async changeMemberRole(dto: ChangeMemberRoleDto) {
    const [member, role] = await Promise.all([
      this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
      }),
      this.prisma.projectRole.findUnique({ where: { id: dto.projectRoleId } }),
    ]);

    if (!member) {
      throw new RpcException({ statusCode: 404, message: 'El usuario no es miembro del proyecto' });
    }
    if (!role || role.projectId !== dto.projectId) {
      /* Un rol de otro proyecto daría permisos escritos para un tablero que no
         es este. Se comprueba aquí porque el id solo dice que existe. */
      throw new RpcException({ statusCode: 404, message: 'Rol de proyecto no encontrado' });
    }

    if (member.projectRoleId === dto.projectRoleId) return member;

    const actualizado = await this.prisma.projectMember.update({
      where: { id: member.id },
      data: { projectRoleId: dto.projectRoleId },
      include: { projectRole: true },
    });

    await this.redis.del(`members:project:${dto.projectId}`);
    await this.projectRolesService.invalidatePermissionCache(dto.userId, dto.projectId);

    return actualizado;
  }

  async findMembers(projectId: string) {
    const cacheKey = `members:project:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: 'asc' },
      include: { projectRole: true },
    });

    await this.redis.set(cacheKey, members, LIST_CACHE_TTL);
    return members;
  }
}
