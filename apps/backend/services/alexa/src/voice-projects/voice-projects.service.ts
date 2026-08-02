import { Injectable, Logger } from '@nestjs/common';
import { VoiceProjectsQueryDto } from '@praxis/contracts';

import { AlexaAuthService } from '../alexa-auth/alexa-auth.service';
import { PraxisDataService } from '../clients/praxis-data.service';

@Injectable()
export class VoiceProjectsService {
  private readonly logger = new Logger(VoiceProjectsService.name);

  constructor(
    private readonly data: PraxisDataService,
    private readonly alexaAuth: AlexaAuthService,
  ) {}

  /**
   * Lista plana y ligera de proyectos: la skill hace el matching difuso por nombre.
   */
  async findAll(dto: VoiceProjectsQueryDto) {
    const projects = await this.data.getProjectsForUser(dto.userId);

    this.alexaAuth.logQuery({ userId: dto.userId, queryType: 'projects_list' });

    const items = projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      isOwner: project.ownerId === dto.userId,
    }));

    return {
      items,
      total: items.length,
    };
  }
}
