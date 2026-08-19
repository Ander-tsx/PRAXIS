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
export type TaskDueDateChangedPayload = {
  taskId: string;
  previousDueDate: string | null;
  dueDate: string | null;
};
export type TaskCompletedPayload = { taskId: string; completedAt: string };
export type TaskReopenedPayload = { taskId: string };
export type TaskDeletedPayload = { taskId: string };
export type TaskAssigneesChangedPayload = { taskId: string; assigneeIds: string[] };
export type ProjectStatusChangedPayload = {
  previousStatus: string;
  status: string;
  reason?: string | null;
};
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
  if (!isRecord(value)) return false;
  const event = value as Partial<DomainEvent>;
  if (
    !hasString(event.id) ||
    !hasString(event.type) ||
    !(DOMAIN_EVENT_TYPES as readonly string[]).includes(event.type) ||
    !hasString(event.projectId) ||
    !hasString(event.correlationId) ||
    !hasIsoDate(event.occurredAt) ||
    !isSubject(event.subject) ||
    !isActor(event.actor) ||
    (event.causationId !== undefined && !hasString(event.causationId)) ||
    !isRecord(event.payload)
  ) {
    return false;
  }

  const payload = event.payload;
  switch (event.type) {
    case 'task.created.v1':
      return isTaskEvent(event, payload) && hasStrings(payload, 'taskId', 'boardId', 'columnId');
    case 'task.moved.v1':
      return (
        isTaskEvent(event, payload) && hasStrings(payload, 'taskId', 'fromColumnId', 'toColumnId')
      );
    case 'task.due-date-changed.v1':
      return (
        isTaskEvent(event, payload) &&
        hasStrings(payload, 'taskId') &&
        isNullableIsoDate(payload.previousDueDate) &&
        isNullableIsoDate(payload.dueDate)
      );
    case 'task.completed.v1':
      return (
        isTaskEvent(event, payload) &&
        hasStrings(payload, 'taskId') &&
        hasIsoDate(payload.completedAt)
      );
    case 'task.reopened.v1':
    case 'task.deleted.v1':
      return isTaskEvent(event, payload) && hasStrings(payload, 'taskId');
    case 'task.assignees-changed.v1':
      return (
        isTaskEvent(event, payload) &&
        hasStrings(payload, 'taskId') &&
        Array.isArray(payload.assigneeIds) &&
        payload.assigneeIds.every(hasString)
      );
    case 'project.status-changed.v1':
      return (
        isProjectEvent(event, 'PROJECT') &&
        event.subject.id === event.projectId &&
        hasStrings(payload, 'previousStatus', 'status') &&
        (payload.reason === undefined || payload.reason === null || hasString(payload.reason))
      );
    case 'project.member-removed.v1':
      return isProjectEvent(event, 'PROJECT_MEMBER') && hasStrings(payload, 'userId');
    case 'project.role-deleted.v1':
      return (
        isProjectEvent(event, 'PROJECT_ROLE') &&
        hasStrings(payload, 'roleId') &&
        payload.roleId === event.subject.id
      );
  }
}

function isTaskEvent(event: Partial<DomainEvent>, payload: Record<string, unknown>): boolean {
  return (
    event.source === 'tasks-service' &&
    event.subject?.type === 'TASK' &&
    hasString(payload.taskId) &&
    payload.taskId === event.subject.id
  );
}

function isProjectEvent(
  event: Partial<DomainEvent>,
  subjectType: DomainEventSubject['type'],
): boolean {
  return event.source === 'projects-service' && event.subject?.type === subjectType;
}

function isActor(value: unknown): value is DomainEventActor {
  return (
    isRecord(value) &&
    ['USER', 'AUTOMATION', 'EXTERNAL', 'SYSTEM'].includes(value.type as string) &&
    (value.id === undefined || hasString(value.id))
  );
}

function isSubject(value: unknown): value is DomainEventSubject {
  return (
    isRecord(value) &&
    ['TASK', 'PROJECT', 'PROJECT_MEMBER', 'PROJECT_ROLE'].includes(value.type as string) &&
    hasString(value.id)
  );
}

function isNullableIsoDate(value: unknown): boolean {
  return value === null || hasIsoDate(value);
}

function hasIsoDate(value: unknown): value is string {
  return hasString(value) && !Number.isNaN(Date.parse(value));
}

function hasStrings(record: Record<string, unknown>, ...keys: string[]): boolean {
  return keys.every((key) => hasString(record[key]));
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
