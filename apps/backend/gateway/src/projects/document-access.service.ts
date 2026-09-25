import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { DocumentLinkAccess, DocumentRole, ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { QuotaService } from '../billing/quota.service';

export type ModoDeAcceso = 'edit' | 'read';

export interface MetaDeDocumento {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  linkAccess: DocumentLinkAccess;
  linkToken: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  inviteRole: DocumentRole | null;
}

export interface AccesoADocumento {
  meta: MetaDeDocumento;
  mode: ModoDeAcceso;
  /** Miembro del proyecto: ve el documento dentro de su espacio. */
  esMiembro: boolean;
  /** Puede cambiar cómo se comparte: miembro con `canEditDocuments`. */
  puedeCompartir: boolean;
  userId: string | null;
  email: string | null;
  nombre: string | null;
}

/** Códigos de los 401/403 de un documento: la página los distingue. */
export const DOCUMENT_LOGIN_REQUIRED = 'DOCUMENT_LOGIN_REQUIRED';
export const DOCUMENT_NO_ACCESS = 'DOCUMENT_NO_ACCESS';

/**
 * Quién puede leer o editar un documento, y por qué (E8 de
 * `docs/PLAN-DOCUMENTOS.md`).
 *
 * Existe porque el acceso a un documento compartido **no pasa por el guard de
 * proyecto**: un invitado por correo no es miembro, no ocupa asiento
 * (decisión 4) y no puede ver nada más del proyecto. Así que se decide aquí,
 * con las mismas piezas que usa el guard para los miembros:
 *
 * 1. El estado del proyecto: archivado es 404 para todos; suspendido, lectura.
 * 2. Miembro: `canEditDocuments` edita, `canViewProject` lee. Con el asiento
 *    congelado, lee.
 * 3. Invitación a **su correo**: lo que diga su papel.
 * 4. El enlace, si trae el token vigente: leer siempre; editar solo con
 *    sesión (decisión 1).
 *
 * Gana el acceso más alto de los que apliquen.
 */
@Injectable()
export class DocumentAccessService {
  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly quota: QuotaService,
  ) {}

  async resolver(
    documentId: string,
    userId: string | null,
    token: string | null,
  ): Promise<AccesoADocumento> {
    const perfil = userId ? await this.perfil(userId) : null;
    const email = perfil?.email ?? null;

    const meta = await firstValueFrom(
      this.projectsClient.send<MetaDeDocumento>(
        { cmd: 'document_meta' },
        { id: documentId, email },
      ),
    ).catch(() => {
      throw new NotFoundException('Documento no encontrado');
    });

    const proyecto = await firstValueFrom(
      this.projectsClient.send<{ ownerId?: string; status?: string; organizationId?: string }>(
        { cmd: 'project_find_one' },
        { id: meta.projectId },
      ),
    ).catch(() => null);
    if (!proyecto || proyecto.status === 'DELETED') {
      throw new NotFoundException('Documento no encontrado');
    }
    const soloLectura = proyecto.status === 'SUSPENDED';

    const modos: ModoDeAcceso[] = [];
    let esMiembro = false;
    let puedeCompartir = false;

    if (userId) {
      const esDueno = proyecto.ownerId === userId;
      const [edita, ve] = esDueno
        ? [true, true]
        : await Promise.all([
            this.permiso(userId, meta.projectId, ProjectPermission.CAN_EDIT_DOCUMENTS),
            this.permiso(userId, meta.projectId, ProjectPermission.CAN_VIEW_PROJECT),
          ]);
      esMiembro = ve;
      if (edita) {
        const congelado = await this.quota
          .exigirAsientoVivo(userId, proyecto.organizationId ?? null)
          .then(() => false)
          .catch(() => true);
        modos.push(congelado ? 'read' : 'edit');
        puedeCompartir = !congelado;
      } else if (ve) {
        modos.push('read');
      }
    }

    if (meta.inviteRole) modos.push(meta.inviteRole === DocumentRole.EDIT ? 'edit' : 'read');

    const tokenVale = !!token && !!meta.linkToken && token === meta.linkToken;
    if (tokenVale && meta.linkAccess !== DocumentLinkAccess.NONE) {
      modos.push(meta.linkAccess === DocumentLinkAccess.EDIT && userId ? 'edit' : 'read');
    }

    if (modos.length === 0) {
      /* Sin sesión, la salida es entrar —quizá con el correo invitado—; con
         sesión, este correo no tiene acceso y hay que decirlo así. */
      if (!userId) {
        throw new UnauthorizedException({
          code: DOCUMENT_LOGIN_REQUIRED,
          message: 'Entra con tu cuenta para abrir este documento.',
        });
      }
      throw new ForbiddenException({
        code: DOCUMENT_NO_ACCESS,
        message: 'No tienes acceso a este documento. Pide que lo compartan con tu correo.',
      });
    }

    const mode: ModoDeAcceso = !soloLectura && modos.includes('edit') ? 'edit' : 'read';
    return {
      meta,
      mode,
      esMiembro,
      puedeCompartir: puedeCompartir && !soloLectura,
      userId,
      email,
      nombre: perfil?.nombre ?? null,
    };
  }

  /** Lo mismo, exigiendo poder editar. */
  async exigirEdicion(documentId: string, userId: string | null, token: string | null) {
    const acceso = await this.resolver(documentId, userId, token);
    if (acceso.mode !== 'edit') {
      throw new ForbiddenException('Solo puedes leer este documento.');
    }
    return acceso;
  }

  async exigirCompartir(documentId: string, userId: string) {
    const acceso = await this.resolver(documentId, userId, null);
    if (!acceso.puedeCompartir) {
      throw new ForbiddenException('Solo quien edita documentos en el proyecto puede compartirlo.');
    }
    return acceso;
  }

  private permiso(userId: string, projectId: string, permission: ProjectPermission) {
    return firstValueFrom(
      this.projectsClient.send<{ allowed: boolean }>(
        { cmd: 'project_check_permission' },
        { userId, projectId, permission },
      ),
    )
      .then((r) => !!r?.allowed)
      .catch(() => false);
  }

  private perfil(userId: string): Promise<{ email: string | null; nombre: string } | null> {
    return firstValueFrom(
      this.credentialsClient.send<{
        firstName?: string | null;
        lastName?: string | null;
        credential?: { email?: string };
      }>({ cmd: 'user_find_one' }, { id: userId }),
    )
      .then((u) => ({
        email: u?.credential?.email?.toLowerCase() ?? null,
        nombre:
          [u?.firstName, u?.lastName].filter(Boolean).join(' ') ||
          u?.credential?.email?.split('@')[0] ||
          'Alguien',
      }))
      .catch(() => null);
  }
}
