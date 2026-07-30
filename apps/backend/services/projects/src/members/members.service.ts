import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  AddMemberDto,
  NotificationType,
  RemoveMemberDto,
} from '@praxis/contracts';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectRolesService } from '../project-roles/project-roles.service';

const LIST_CACHE_TTL = 60;

@Injectable()
export class MembersService {
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
    if (!role)    throw new RpcException({ statusCode: 404, message: 'Rol de proyecto no encontrado' });

    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
    });
    if (existing) {
      throw new RpcException({ statusCode: 409, message: 'El usuario ya es miembro del proyecto' });
    }

    const member = await this.prisma.projectMember.create({
      data: {
        projectId:     dto.projectId,
        userId:        dto.userId,
        projectRoleId: dto.projectRoleId,
      },
      include: { projectRole: true },
    });

    await this.redis.del(`members:project:${dto.projectId}`);
    // El detalle cacheado trae _count.members: si no, el contador se queda viejo.
    await this.redis.del(`project:${dto.projectId}`);
    await this.projectRolesService.invalidatePermissionCache(dto.userId, dto.projectId);
    return member;
  }

  async removeMember(dto: RemoveMemberDto) {
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

    await this.prisma.projectMember.delete({ where: { id: member.id } });
    await this.redis.del(`members:project:${dto.projectId}`);
    // El detalle cacheado trae _count.members: si no, el contador se queda viejo.
    await this.redis.del(`project:${dto.projectId}`);
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

  async findMembers(projectId: string) {
    const cacheKey = `members:project:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const members = await this.prisma.projectMember.findMany({
      where:   { projectId },
      orderBy: { joinedAt: 'asc' },
      include: { projectRole: true },
    });

    await this.redis.set(cacheKey, members, LIST_CACHE_TTL);
    return members;
  }
}
