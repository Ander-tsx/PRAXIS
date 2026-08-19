import { of } from 'rxjs';
import { ProjectAutomationsController } from './project-automations.controller';

describe('ProjectAutomationsController', () => {
  it('inyecta projectId y actor desde la solicitud autenticada, sin aceptar esos campos del body', async () => {
    const client = { send: jest.fn(() => of({ id: 'rule-a' })) };
    const controller = new ProjectAutomationsController(client as never);
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
});
