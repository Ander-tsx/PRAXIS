import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ProjectRolesService } from '../project-roles/project-roles.service';

/**
 * Invitaciones a un proyecto.
 *
 * Antes no existían: `POST /projects/:id/members` daba de alta directamente y
 * la persona se enteraba al abrir el proyecto, sin poder aceptar ni rechazar.
 *
 * Regla central: **la membresía se crea al aceptar, no al invitar.** Mientras
 * la invitación está pendiente no hay `ProjectMember`, así que tampoco hay
 * permisos ni aparece el proyecto en la lista de esa persona.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly projectRolesService: ProjectRolesService,
  ) {}

  async invite(dto: {
    projectId: string;
    userId: string;
    projectRoleId: string;
    invitedBy: string;
  }) {
    const [project, role] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: dto.projectId } }),
      this.prisma.projectRole.findUnique({ where: { id: dto.projectRoleId } }),
    ]);

    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    if (!role || role.projectId !== dto.projectId) {
      throw new RpcException({
        statusCode: 404,
        message: 'Ese rol no pertenece a este proyecto',
      });
    }

    if (dto.userId === project.ownerId) {
      throw new RpcException({
        statusCode: 409,
        message: 'El dueño del proyecto ya tiene acceso total',
      });
    }

    const alreadyMember = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
    });
    if (alreadyMember) {
      throw new RpcException({
        statusCode: 409,
        message: 'Esa persona ya forma parte del proyecto',
      });
    }

    const pending = await this.prisma.projectInvitation.findFirst({
      where: { projectId: dto.projectId, userId: dto.userId, status: 'PENDING' },
    });
    if (pending) {
      throw new RpcException({
        statusCode: 409,
        message: 'Esa persona ya tiene una invitación pendiente',
      });
    }

    const invitation = await this.prisma.projectInvitation.create({
      data: {
        projectId: dto.projectId,
        userId: dto.userId,
        projectRoleId: dto.projectRoleId,
        invitedBy: dto.invitedBy,
      },
      include: { projectRole: true, project: { select: { id: true, name: true } } },
    });

    await this.redis.del(`invitations:project:${dto.projectId}`);
    return invitation;
  }

  /** Invitaciones pendientes de una persona, con el proyecto y el rol. */
  async findForUser(userId: string) {
    return this.prisma.projectInvitation.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        projectRole: true,
        project: { select: { id: true, name: true, description: true, ownerId: true } },
      },
    });
  }

  /** Invitaciones de un proyecto. Las pendientes son las que interesan. */
  async findForProject(projectId: string) {
    return this.prisma.projectInvitation.findMany({
      where: { projectId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { projectRole: true },
    });
  }

  /**
   * Aceptar: crea la membresía y marca la invitación.
   *
   * Va en una transacción porque una invitación aceptada sin membresía dejaría
   * a la persona fuera del proyecto sin forma de volver a entrar.
   */
  async accept(dto: { invitationId: string; userId: string }) {
    const invitation = await this.requireOwnPending(dto.invitationId, dto.userId);

    const member = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectMember.create({
        data: {
          projectId: invitation.projectId,
          userId: invitation.userId,
          projectRoleId: invitation.projectRoleId,
        },
        include: { projectRole: true },
      });

      await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      return created;
    });

    await this.invalidate(invitation.projectId, invitation.userId);
    return member;
  }

  async reject(dto: { invitationId: string; userId: string }) {
    const invitation = await this.requireOwnPending(dto.invitationId, dto.userId);

    await this.prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: 'REJECTED', respondedAt: new Date() },
    });

    await this.redis.del(`invitations:project:${invitation.projectId}`);
    return { success: true };
  }

  /** La retira quien administra el proyecto, antes de que respondan. */
  async cancel(dto: { invitationId: string; projectId: string }) {
    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { id: dto.invitationId },
    });

    if (!invitation || invitation.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 404, message: 'Invitación no encontrada' });
    }
    if (invitation.status !== 'PENDING') {
      throw new RpcException({
        statusCode: 409,
        message: 'Esa invitación ya fue respondida',
      });
    }

    await this.prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });

    await this.redis.del(`invitations:project:${dto.projectId}`);
    return { success: true };
  }

  /**
   * Salir de un proyecto por voluntad propia.
   *
   * El dueño no puede: se quedaría sin acceso a su propio proyecto y nadie
   * podría recuperarlo, porque el bypass del guard va por `ownerId`.
   */
  async leave(dto: { projectId: string; userId: string }) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { ownerId: true },
    });

    if (!project) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });

    if (project.ownerId === dto.userId) {
      throw new RpcException({
        statusCode: 409,
        message: 'El dueño no puede salir de su propio proyecto',
      });
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: dto.projectId, userId: dto.userId } },
    });
    if (!member) {
      throw new RpcException({ statusCode: 404, message: 'No formas parte de este proyecto' });
    }

    await this.prisma.projectMember.delete({ where: { id: member.id } });
    await this.invalidate(dto.projectId, dto.userId);
    return { success: true };
  }

  // ---------------------------------------------------------------------------

  /** Solo el destinatario puede responder, y solo si sigue pendiente. */
  private async requireOwnPending(invitationId: string, userId: string) {
    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.userId !== userId) {
      throw new RpcException({ statusCode: 404, message: 'Invitación no encontrada' });
    }
    if (invitation.status !== 'PENDING') {
      throw new RpcException({
        statusCode: 409,
        message: 'Esa invitación ya fue respondida',
      });
    }

    return invitation;
  }

  private async invalidate(projectId: string, userId: string) {
    await this.redis.del(`members:project:${projectId}`);
    await this.redis.del(`project:${projectId}`);
    await this.redis.del(`invitations:project:${projectId}`);
    await this.projectRolesService.invalidatePermissionCache(userId, projectId);
  }
}
