import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { AgentActionsInterceptor } from './agent-actions.interceptor';

function contexto(req: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const AGENTE = { via: 'mcp', agentId: 'tok-1', agentName: 'Claude Code', agentKind: 'claude' };

describe('AgentActionsInterceptor', () => {
  let send: jest.Mock;
  let interceptor: AgentActionsInterceptor;

  beforeEach(() => {
    send = jest.fn(() => of(undefined));
    interceptor = new AgentActionsInterceptor({ send } as never);
  });

  const correr = (req: Record<string, unknown>, respuesta: unknown = { id: 'x' }) =>
    firstValueFrom(
      interceptor.intercept(contexto(req), { handle: () => of(respuesta) } as CallHandler),
    );

  it('anota una escritura de un agente, con la tarea y el área', async () => {
    await correr({
      method: 'PATCH',
      route: { path: '/api/tasks/:id' },
      params: { id: 'tarea-1' },
      user: { userId: 'ana', agent: AGENTE },
      projectId: 'p-1',
    });
    expect(send).toHaveBeenCalledWith(
      { cmd: 'mcp_action_record' },
      expect.objectContaining({
        userId: 'ana',
        agentKind: 'claude',
        area: 'task',
        taskId: 'tarea-1',
        projectId: 'p-1',
        route: 'PATCH /tasks/:id',
      }),
    );
  });

  it('un paso del checklist y una nota son su propia área, no «editar la tarea»', async () => {
    await correr({
      method: 'POST',
      route: { path: '/api/tasks/:taskId/checklists/:id/toggle' },
      params: { taskId: 't-1', id: 'item-1' },
      user: { userId: 'ana', agent: AGENTE },
    });
    await correr({
      method: 'POST',
      route: { path: '/api/tasks/:taskId/comments' },
      params: { taskId: 't-1' },
      user: { userId: 'ana', agent: AGENTE },
    });
    expect(send.mock.calls.map(([, d]) => d.area)).toEqual(['checklist', 'comment']);
  });

  it('crear una tarea toma su id de la respuesta', async () => {
    await correr(
      {
        method: 'POST',
        route: { path: '/api/boards/:boardId/tasks' },
        params: { boardId: 'b-1' },
        user: { userId: 'ana', agent: AGENTE },
      },
      { id: 'nueva' },
    );
    expect(send.mock.calls[0][1]).toMatchObject({ area: 'task', taskId: 'nueva' });
  });

  it('una persona sin marca, o una lectura, no deja rastro', async () => {
    await correr({
      method: 'PATCH',
      route: { path: '/api/tasks/:id' },
      params: { id: 't-1' },
      user: { userId: 'ana' },
    });
    await correr({
      method: 'GET',
      route: { path: '/api/tasks/:id' },
      params: { id: 't-1' },
      user: { userId: 'ana', agent: AGENTE },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('si el registro falla, la respuesta sale igual', async () => {
    send.mockReturnValue(
      new (require('rxjs').Observable)((o: { error: (e: unknown) => void }) => o.error('caído')),
    );
    await expect(
      correr({
        method: 'POST',
        route: { path: '/api/tasks/:taskId/comments' },
        params: { taskId: 't-1' },
        user: { userId: 'ana', agent: AGENTE },
      }),
    ).resolves.toEqual({ id: 'x' });
  });
});
