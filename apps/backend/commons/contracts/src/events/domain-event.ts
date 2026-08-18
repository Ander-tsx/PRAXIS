export const DOMAIN_EVENT_TYPES = [
  'task.created.v1',
  'task.moved.v1',
  'task.due-date-changed.v1',
  'task.completed.v1',
  'task.reopened.v1',
  'task.deleted.v1',
  'task.assignees-changed.v1',
  'project.status-changed.v1',
  'project.member-removed.v1',
  'project.role-deleted.v1',
] as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];
export type DomainEventActorType = 'USER' | 'AUTOMATION' | 'EXTERNAL' | 'SYSTEM';

export interface DomainEventActor {
  type: DomainEventActorType;
  id?: string;
}

export interface DomainEventSubject {
  type: 'TASK' | 'PROJECT' | 'PROJECT_MEMBER' | 'PROJECT_ROLE';
  id: string;
}

/** Sobre durable común; los productores se incorporan en las subentregas 3.2 y 3.3. */
export interface DomainEvent<TType extends DomainEventType = DomainEventType, TPayload = unknown> {
  id: string;
  type: TType;
  source: 'tasks-service' | 'projects-service';
  occurredAt: string;
  projectId: string;
  subject: DomainEventSubject;
  actor: DomainEventActor;
  correlationId: string;
  causationId?: string;
  payload: TPayload;
}

export type TaskCreatedPayload = { taskId: string; boardId: string; columnId: string };
export type TaskMovedPayload = { taskId: string; fromColumnId: string; toColumnId: string };
export type TaskDueDateChangedPayload = { taskId: string; previousDueDate: string | null; dueDate: string | null };
export type TaskCompletedPayload = { taskId: string; completedAt: string };
export type TaskReopenedPayload = { taskId: string };
export type TaskDeletedPayload = { taskId: string };
export type TaskAssigneesChangedPayload = { taskId: string; assigneeIds: string[] };
export type ProjectStatusChangedPayload = { previousStatus: string; status: string; reason?: string | null };
export type ProjectMemberRemovedPayload = { userId: string };
export type ProjectRoleDeletedPayload = { roleId: string };

export type TaskDomainEvent =
  | DomainEvent<'task.created.v1', TaskCreatedPayload>
  | DomainEvent<'task.moved.v1', TaskMovedPayload>
  | DomainEvent<'task.due-date-changed.v1', TaskDueDateChangedPayload>
  | DomainEvent<'task.completed.v1', TaskCompletedPayload>
  | DomainEvent<'task.reopened.v1', TaskReopenedPayload>
  | DomainEvent<'task.deleted.v1', TaskDeletedPayload>
  | DomainEvent<'task.assignees-changed.v1', TaskAssigneesChangedPayload>;

export type ProjectDomainEvent =
  | DomainEvent<'project.status-changed.v1', ProjectStatusChangedPayload>
  | DomainEvent<'project.member-removed.v1', ProjectMemberRemovedPayload>
  | DomainEvent<'project.role-deleted.v1', ProjectRoleDeletedPayload>;

export type InitialDomainEvent = TaskDomainEvent | ProjectDomainEvent;

export function isInitialDomainEvent(value: unknown): value is InitialDomainEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<DomainEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.type === 'string' &&
    (DOMAIN_EVENT_TYPES as readonly string[]).includes(event.type) &&
    typeof event.source === 'string' &&
    typeof event.occurredAt === 'string' &&
    typeof event.projectId === 'string' &&
    typeof event.subject?.id === 'string' &&
    typeof event.subject?.type === 'string' &&
    typeof event.actor?.type === 'string' &&
    typeof event.correlationId === 'string'
  );
}
