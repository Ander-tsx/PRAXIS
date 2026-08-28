import { AutomationRuleStatus } from '@praxis/contracts';
import { of } from 'rxjs';
import type { QuotaService } from '../billing/quota.service';
import { ProjectAutomationsController } from './project-automations.controller';

/** Un `QuotaService` que solo sabe apuntar a quién le preguntaron. */
function quotaFalso() {
  return { exigirAutomatizacion: jest.fn(async () => undefined) };
}

describe('ProjectAutomationsController', () => {
  it('inyecta projectId y actor desde la solicitud autenticada, sin aceptar esos campos del body', async () => {
    const client = { send: jest.fn(() => of({ id: 'rule-a' })) };
    const quota = quotaFalso();
    const controller = new ProjectAutomationsController(
      client as never,
      quota as unknown as QuotaService,
    );
    const req = { projectId: 'project-route', user: { userId: 'user-jwt' } };
    const body = {
      name: 'Regla válida',
      trigger: { type: 'TASK_DUE_SOON', config: { leadTimeMinutes: 60 } },
      conditions: [],
      actions: [{ type: 'SEND_EMAIL', config: { template: 'due-soon' } }],
      projectId: 'project-client',
      createdBy: 'user-client',
    };

    await controller.create(req as never, body as never);

    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'automation_rule_create' },
      expect.objectContaining({ projectId: 'project-route', createdBy: 'user-jwt' }),
    );
  });

  /**
   * La mitad de la decisión D2: el tope es de reglas **en marcha**. Redactar una
   * y dejarla pausada no puede gastar cupo, o «pausa una» dejaría de ser una
   * salida.
   */
  it('no consulta la cuota al crear una regla que nace pausada', async () => {
    const client = { send: jest.fn(() => of({ id: 'rule-a' })) };
    const quota = quotaFalso();
    const controller = new ProjectAutomationsController(
      client as never,
      quota as unknown as QuotaService,
    );

    await controller.create(
      { projectId: 'p1', user: { userId: 'u1' } } as never,
      { name: 'Borrador', status: AutomationRuleStatus.DISABLED } as never,
    );

    expect(quota.exigirAutomatizacion).not.toHaveBeenCalled();
  });

  it('consulta la cuota cuando la regla nace activa', async () => {
    const client = { send: jest.fn(() => of({ id: 'rule-a' })) };
    const quota = quotaFalso();
    const controller = new ProjectAutomationsController(
      client as never,
      quota as unknown as QuotaService,
    );

    await controller.create(
      { projectId: 'p1', user: { userId: 'u1' } } as never,
      { name: 'Activa', status: AutomationRuleStatus.ENABLED } as never,
    );

    expect(quota.exigirAutomatizacion).toHaveBeenCalledWith('u1', 'p1');
  });

  /**
   * 🔴 La puerta trasera. Sin esto el tope se salta pausando y reactivando, y no
   * lo cuenta ningún error.
   */
  it('consulta la cuota al reactivar, excluyéndose del conteo', async () => {
    const client = { send: jest.fn(() => of({ id: 'rule-a' })) };
    const quota = quotaFalso();
    const controller = new ProjectAutomationsController(
      client as never,
      quota as unknown as QuotaService,
    );

    await controller.update(
      { projectId: 'p1', user: { userId: 'u1' } } as never,
      'rule-a',
      { name: 'Reactivada', status: AutomationRuleStatus.ENABLED } as never,
    );

    /* El propio id como excepción: si ya estaba activa, contarla dentro del
       total la haría negarse a sí misma con el cupo justo. */
    expect(quota.exigirAutomatizacion).toHaveBeenCalledWith('u1', 'p1', 'rule-a');
  });
});
