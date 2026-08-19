import { InitialDomainEvent } from '@praxis/contracts';

export type RuleCondition = { field: string; operator: string; value: unknown };

const triggerEvents: Record<string, string[]> = {
  GITHUB_PULL_REQUEST_OPENED: ['github.pull-request.opened.v1'],
  TASK_DUE_SOON: [
    'task.created.v1',
    'task.due-date-changed.v1',
    'task.completed.v1',
    'task.reopened.v1',
    'task.deleted.v1',
  ],
  TASK_STALE: [
    'task.created.v1',
    'task.moved.v1',
    'task.completed.v1',
    'task.reopened.v1',
    'task.deleted.v1',
  ],
};

export function matchesTrigger(type: string, event: InitialDomainEvent): boolean {
  return triggerEvents[type]?.includes(event.type) ?? false;
}

export function matchesAllConditions(
  conditions: RuleCondition[],
  context: Record<string, unknown>,
): boolean {
  return conditions.every(({ field, operator, value }) => {
    const actual = context[field];
    if (operator === 'EQUALS') return actual === value;
    if (operator === 'NOT_EQUALS') return actual !== value;
    if (operator === 'IN') return Array.isArray(value) && value.includes(actual);
    return false;
  });
}
