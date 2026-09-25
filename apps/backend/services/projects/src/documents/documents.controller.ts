import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CreateDocumentDto,
  DocumentLinkAccess,
  DocumentRefDto,
  DocumentRole,
  UpdateDocumentDto,
} from '@praxis/contracts';
import { DocumentsService } from './documents.service';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @MessagePattern({ cmd: 'document_find_by_workspace' })
  findByWorkspace(@Payload() dto: { workspaceId: string }) {
    return this.documents.findByWorkspace(dto.workspaceId);
  }

  @MessagePattern({ cmd: 'document_find_one' })
  findOne(@Payload() dto: DocumentRefDto) {
    return this.documents.findOne(dto);
  }

  @MessagePattern({ cmd: 'document_create' })
  create(@Payload() dto: CreateDocumentDto) {
    return this.documents.create(dto);
  }

  @MessagePattern({ cmd: 'document_update' })
  update(@Payload() dto: UpdateDocumentDto) {
    return this.documents.update(dto);
  }

  @MessagePattern({ cmd: 'document_delete' })
  remove(@Payload() dto: DocumentRefDto) {
    return this.documents.remove(dto);
  }

  /* ─── Etapa 2: acceso, tiempo real, compartir, imágenes y versiones ───── */

  @MessagePattern({ cmd: 'document_meta' })
  meta(@Payload() dto: { id: string; email?: string | null }) {
    return this.documents.meta(dto.id, dto.email);
  }

  @MessagePattern({ cmd: 'document_meta_many' })
  metaDeVarios(@Payload() dto: { ids: string[] }) {
    return this.documents.metaDeVarios(dto.ids ?? []);
  }

  @MessagePattern({ cmd: 'document_collab_load' })
  collabLoad(@Payload() dto: { id: string }) {
    return this.documents.collabLoad(dto.id);
  }

  @MessagePattern({ cmd: 'document_collab_store' })
  collabStore(
    @Payload() dto: { id: string; yState: string; content: string; userIds: string[] },
  ) {
    return this.documents.collabStore(dto);
  }

  @MessagePattern({ cmd: 'document_share' })
  share(@Payload() dto: { id: string }) {
    return this.documents.share(dto.id);
  }

  @MessagePattern({ cmd: 'document_share_update' })
  updateShare(
    @Payload() dto: { id: string; linkAccess?: DocumentLinkAccess; regenerateLink?: boolean },
  ) {
    return this.documents.updateShare(dto);
  }

  @MessagePattern({ cmd: 'document_invite' })
  invite(
    @Payload() dto: { documentId: string; email: string; role: DocumentRole; invitedBy: string },
  ) {
    return this.documents.invite(dto);
  }

  @MessagePattern({ cmd: 'document_uninvite' })
  uninvite(@Payload() dto: { documentId: string; inviteId: string }) {
    return this.documents.uninvite(dto);
  }

  @MessagePattern({ cmd: 'document_shared_with' })
  sharedWith(@Payload() dto: { email: string }) {
    return this.documents.sharedWith(dto.email);
  }

  @MessagePattern({ cmd: 'document_asset_create' })
  createAsset(
    @Payload()
    dto: {
      documentId: string;
      filename: string;
      mimeType: string;
      size: number;
      content: string;
      uploadedBy: string;
    },
  ) {
    return this.documents.createAsset(dto);
  }

  @MessagePattern({ cmd: 'document_asset_content' })
  assetContent(@Payload() dto: { documentId: string; assetId: string }) {
    return this.documents.assetContent(dto);
  }

  @MessagePattern({ cmd: 'document_asset_bytes_of_projects' })
  assetBytesOfProjects(@Payload() dto: { projectIds: string[] }) {
    return this.documents.assetBytesOfProjects(dto.projectIds ?? []);
  }

  @MessagePattern({ cmd: 'document_revisions' })
  revisions(@Payload() dto: { documentId: string }) {
    return this.documents.revisions(dto.documentId);
  }

  @MessagePattern({ cmd: 'document_revision' })
  revision(@Payload() dto: { documentId: string; revisionId: string }) {
    return this.documents.revision(dto);
  }
}
