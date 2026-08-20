import { describe, expect, it } from 'vitest';
import { emptyDraft } from './automation-draft';
import { validateAutomationDraft } from './validation';

function reglaValida() {
  const draft = emptyDraft('TASK_DUE_SOON');
  draft.name = 'Avisar vencimiento';
  return draft;
}

describe('validateAutomationDraft', () => {
  it('acepta una regla mínima válida', () => {
    expect(validateAutomationDraft(reglaValida())).toBeNull();
  });

  it('rechaza un nombre vacío', () => {
    const draft = reglaValida();
    draft.name = '  ';
    expect(validateAutomationDraft(draft)).toMatch(/nombre/i);
  });

  it('rechaza un nombre de más de 120 caracteres', () => {
    const draft = reglaValida();
    draft.name = 'x'.repeat(121);
    expect(validateAutomationDraft(draft)).toMatch(/120/);
  });

  it('rechaza una descripción de más de 1000 caracteres', () => {
    const draft = reglaValida();
    draft.description = 'x'.repeat(1001);
    expect(validateAutomationDraft(draft)).toMatch(/1000/);
  });

  it('rechaza leadTimeMinutes ausente en TASK_DUE_SOON', () => {
    const draft = reglaValida();
    // biome-ignore lint/performance/noDelete: simula un campo requerido que no llegó
    delete (draft.triggerConfig as Record<string, unknown>).leadTimeMinutes;
    expect(validateAutomationDraft(draft)).toMatch(/[Ll]ead|antelaci/);
  });

  it('rechaza leadTimeMinutes menor a 1', () => {
    const draft = reglaValida();
    draft.triggerConfig.leadTimeMinutes = 0;
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('acepta days ausente en TASK_STALE (opcional, el servidor pone 7)', () => {
    const draft = emptyDraft('TASK_STALE');
    draft.name = 'Avisar estancamiento';
    // biome-ignore lint/performance/noDelete: days es opcional
    delete (draft.triggerConfig as Record<string, unknown>).days;
    expect(validateAutomationDraft(draft)).toBeNull();
  });

  it('rechaza cero acciones', () => {
    const draft = reglaValida();
    draft.actions = [];
    expect(validateAutomationDraft(draft)).toMatch(/acci/i);
  });

  it('rechaza seis acciones', () => {
    const draft = reglaValida();
    draft.actions = Array(6).fill({ type: 'CREATE_NOTIFICATION' });
    expect(validateAutomationDraft(draft)).toMatch(/cinco/i);
  });

  it('rechaza un campo de condición del otro trigger', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'staleDays', operator: 'EQUALS', value: 3 }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza IN con un valor escalar (no lista)', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'IN', value: 'HIGH' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza EQUALS con una lista (no escalar)', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: ['HIGH', 'URGENT'] }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un entero no entero en assigneeCount', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'assigneeCount', operator: 'EQUALS', value: 1.5 }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un valor no booleano en overdue (TASK_STALE)', () => {
    const draft = emptyDraft('TASK_STALE');
    draft.name = 'Avisar estancamiento';
    draft.conditions = [{ field: 'overdue', operator: 'EQUALS', value: 'sí' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza una fecha con formato inválido en dueDate', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'dueDate', operator: 'EQUALS', value: '21/08/2026' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('rechaza un valor de enum no reconocido en priority', () => {
    const draft = reglaValida();
    draft.conditions = [{ field: 'priority', operator: 'EQUALS', value: 'CASI_URGENTE' }];
    expect(validateAutomationDraft(draft)).not.toBeNull();
  });

  it('acepta condiciones válidas combinadas por AND', () => {
    const draft = reglaValida();
    draft.conditions = [
      { field: 'priority', operator: 'EQUALS', value: 'HIGH' },
      { field: 'assigneeCount', operator: 'IN', value: [1, 2, 3] },
    ];
    expect(validateAutomationDraft(draft)).toBeNull();
  });
});
