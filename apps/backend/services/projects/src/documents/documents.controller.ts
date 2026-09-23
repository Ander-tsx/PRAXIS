import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateDocumentDto, DocumentRefDto, UpdateDocumentDto } from '@praxis/contracts';
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
}
