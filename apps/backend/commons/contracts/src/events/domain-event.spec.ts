/// <reference types="jest" />

import { isInitialDomainEvent, type DomainEvent } from './domain-event';

describe('DomainEvent inicial', () => {
  const event: DomainEvent<'task.created.v1', { taskId: string; boardId: string; columnId: string }> = {
    id: 'event-1', type: 'task.created.v1', source: 'tasks-service', occurredAt: '2026-08-18T00:00:00.000Z',
    projectId: 'project-1', subject: { type: 'TASK', id: 'task-1' }, actor: { type: 'AUTOMATION' },
    correlationId: 'correlation-1', payload: { taskId: 'task-1', boardId: 'board-1', columnId: 'column-1' },
  };

  it('conserva versión, actor de automatización y causación al serializar', () => {
    const restored = JSON.parse(JSON.stringify({ ...event, causationId: 'cause-1' }));
    expect(isInitialDomainEvent(restored)).toBe(true);
    expect(restored.type).toBe('task.created.v1');
    expect(restored.actor).toEqual({ type: 'AUTOMATION' });
    expect(restored.causationId).toBe('cause-1');
  });

  it('rechaza un sobre incompleto antes de persistencia o transporte', () => {
    expect(isInitialDomainEvent({ ...event, projectId: undefined })).toBe(false);
    expect(isInitialDomainEvent({ ...event, type: 'task.created.v2' })).toBe(false);
  });
});
