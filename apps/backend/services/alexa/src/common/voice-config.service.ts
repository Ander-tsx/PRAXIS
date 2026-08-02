import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeText, parseStatusList } from './text.util';

/**
 * Centraliza las convenciones de negocio configurables por entorno.
 * Task.status es un String libre en tasks-service, así que la interpretación
 * de "completada", "en progreso" y "bloqueada" vive aquí y en ningún otro lado.
 */
@Injectable()
export class VoiceConfigService {
  private readonly completed: Set<string>;
  private readonly inProgress: Set<string>;
  private readonly blocked: Set<string>;

  readonly staleDays: number;
  readonly forecastWeeks: number;
  readonly weekMode: 'calendar' | 'rolling';

  constructor(private readonly config: ConfigService) {
    this.completed = parseStatusList(this.config.get<string>('VOICE_COMPLETED_STATUSES'));
    this.inProgress = parseStatusList(this.config.get<string>('VOICE_IN_PROGRESS_STATUSES'));
    this.blocked = parseStatusList(this.config.get<string>('VOICE_BLOCKED_STATUSES'));

    this.staleDays = this.config.get<number>('VOICE_STALE_DAYS', 7);
    this.forecastWeeks = this.config.get<number>('VOICE_FORECAST_WEEKS', 4);
    this.weekMode = this.config.get<'calendar' | 'rolling'>('VOICE_WEEK_MODE', 'calendar');
  }

  isCompleted(status: string | null | undefined): boolean {
    return this.completed.has(normalizeText(status));
  }

  isInProgress(status: string | null | undefined): boolean {
    return this.inProgress.has(normalizeText(status));
  }

  isBlockedStatus(status: string | null | undefined): boolean {
    return this.blocked.has(normalizeText(status));
  }
}
