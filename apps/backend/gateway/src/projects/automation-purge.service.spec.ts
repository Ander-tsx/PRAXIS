import { of, throwError } from 'rxjs';
import { AutomationPurgeService } from './automation-purge.service';

describe('AutomationPurgeService', () => {
  it('envía la purga interna con el único projectId eliminado', async () => {
    const client = { send: jest.fn(() => of({ deleted: 1 })) };
    const service = new AutomationPurgeService(client as never);

    await service.afterProjectDeleted('project-a');

    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'automation_project_purge' },
      { projectId: 'project-a' },
    );
  });

  it('no convierte un fallo de purga en un borrado exitoso silencioso', async () => {
    const service = new AutomationPurgeService({
      send: () => throwError(() => new Error('down')),
    } as never);

    await expect(service.afterProjectDeleted('project-a')).rejects.toThrow('down');
  });
});
