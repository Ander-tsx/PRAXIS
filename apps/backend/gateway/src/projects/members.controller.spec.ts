/// <reference types="jest" />
import { of } from 'rxjs';
import { MembersController } from './members.controller';

describe('MembersController', () => {
  it('no reenvía contexto causal controlado por cuerpo HTTP', async () => {
    const send = jest.fn(() => of({ success: true }));
    const controller = new MembersController({ send } as never);

    await controller.remove(
      { projectId: 'project-1', user: { userId: 'requester-1' } } as never,
      {
        userId: 'member-1',
        correlationId: '00000000-0000-4000-8000-000000000001',
        causationId: '00000000-0000-4000-8000-000000000002',
      } as never,
    );

    expect(send).toHaveBeenCalledWith(
      { cmd: 'member_remove' },
      { projectId: 'project-1', userId: 'member-1', requesterId: 'requester-1' },
    );
  });
});
