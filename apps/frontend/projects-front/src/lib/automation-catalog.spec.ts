import { describe, expect, it } from 'vitest';
import { AUTOMATION_CATALOG, conditionFieldSpecFor, triggerSpecFor } from './automation-catalog';

describe('automation-catalog', () => {
  it('declara exactamente los dos triggers del MVP académico', () => {
    expect(AUTOMATION_CATALOG.map((spec) => spec.type)).toEqual(['TASK_DUE_SOON', 'TASK_STALE']);
  });

  it('triggerSpecFor encuentra TASK_DUE_SOON con su config de leadTimeMinutes obligatorio', () => {
    const spec = triggerSpecFor('TASK_DUE_SOON');
    expect(spec?.configFields).toEqual([
      expect.objectContaining({ key: 'leadTimeMinutes', required: true, min: 1 }),
    ]);
  });

  it('triggerSpecFor encuentra TASK_STALE con days opcional y valor por defecto 7', () => {
    const spec = triggerSpecFor('TASK_STALE');
    expect(spec?.configFields).toEqual([
      expect.objectContaining({ key: 'days', required: false, defaultValue: 7 }),
    ]);
  });

  it('triggerSpecFor devuelve undefined para un trigger fuera del catálogo académico', () => {
    expect(triggerSpecFor('GITHUB_PULL_REQUEST_OPENED')).toBeUndefined();
  });

  it('conditionFieldSpecFor encuentra un campo del trigger correcto', () => {
    expect(conditionFieldSpecFor('TASK_DUE_SOON', 'assigneeCount')).toMatchObject({
      field: 'assigneeCount',
      kind: 'integer',
    });
  });

  it('conditionFieldSpecFor no encuentra un campo del otro trigger', () => {
    expect(conditionFieldSpecFor('TASK_DUE_SOON', 'staleDays')).toBeUndefined();
  });

  it('cada acción de TASK_DUE_SOON fija recipientSelector en ASSIGNEES', () => {
    const spec = triggerSpecFor('TASK_DUE_SOON');
    expect(spec?.actions[0]?.config).toEqual({ recipientSelector: 'ASSIGNEES' });
  });

  it('cada acción de TASK_STALE fija recipientSelector en PROJECT_OWNER', () => {
    const spec = triggerSpecFor('TASK_STALE');
    expect(spec?.actions[0]?.config).toEqual({ recipientSelector: 'PROJECT_OWNER' });
  });

  it('avisa cuando assigneeCount EQUALS 0 en TASK_DUE_SOON, que nunca puede coincidir', () => {
    const spec = triggerSpecFor('TASK_DUE_SOON');
    const draft = { conditions: [{ field: 'assigneeCount', operator: 'EQUALS', value: 0 }] };
    expect(spec?.warnings.some((warning) => warning.matches(draft))).toBe(true);
  });

  it('no avisa cuando la condición de assigneeCount usa otro operador', () => {
    const spec = triggerSpecFor('TASK_DUE_SOON');
    const draft = { conditions: [{ field: 'assigneeCount', operator: 'NOT_EQUALS', value: 0 }] };
    expect(spec?.warnings.some((warning) => warning.matches(draft))).toBe(false);
  });
});
