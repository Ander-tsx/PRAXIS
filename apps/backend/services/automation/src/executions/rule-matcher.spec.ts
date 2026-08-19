import { matchesAllConditions, matchesTrigger } from './rule-matcher';

const event = { type: 'task.created.v1' } as never;

describe('matcher de reglas', () => {
  it('vincula trigger con evento admitido', () =>
    expect(matchesTrigger('TASK_DUE_SOON', event)).toBe(true));
  it('evalúa condiciones con AND', () =>
    expect(
      matchesAllConditions(
        [
          { field: 'status', operator: 'EQUALS', value: 'OPEN' },
          { field: 'priority', operator: 'EQUALS', value: 'HIGH' },
        ],
        { status: 'OPEN', priority: 'LOW' },
      ),
    ).toBe(false));
});
