import { of } from 'rxjs';
import { RulesService } from './rules.service';

const projectId = '00000000-0000-4000-8000-000000000010';
const userId = '00000000-0000-4000-8000-000000000011';
const dto = {
  projectId,
  createdBy: userId,
  name: 'Avisar vencimiento',
  trigger: { type: 'TASK_DUE_SOON' as const, config: { leadTimeMinutes: 120 } },
  conditions: [],
  actions: [{ type: 'CREATE_NOTIFICATION' as const, config: { recipientSelector: 'ASSIGNEES' } }],
};

const serviceFor = (projectStatus = 'ACTIVE') => {
  const tx = {
    automationCondition: { deleteMany: jest.fn() },
    automationAction: { deleteMany: jest.fn() },
    automationRule: {
      update: jest.fn(async (args) => ({ id: 'rule-a', version: 2, ...args.data })),
    },
  };
  const prisma = {
    automationRule: {
      create: jest.fn(async (args) => ({ id: 'rule-a', ...args.data })),
      findFirst: jest.fn(async ({ where }) =>
        where.id === 'other-rule'
          ? null
          : { id: 'rule-a', projectId, createdBy: userId, version: 1 },
      ),
      findMany: jest.fn(async () => []),
      delete: jest.fn(async () => ({ id: 'rule-a' })),
      deleteMany: jest.fn(async ({ where }) => ({ count: where.projectId === projectId ? 1 : 0 })),
    },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const projectsClient = {
    send: ({ cmd }: { cmd: string }) => {
      if (cmd === 'project_find_one')
        return of({ id: projectId, ownerId: userId, status: projectStatus });
      throw new Error(`Comando inesperado: ${cmd}`);
    },
  };
  return { service: new RulesService(prisma as never, projectsClient as never), prisma, tx };
};

describe('RulesService', () => {
  it('persiste una regla con orden AND y principal delegado del servidor', async () => {
    const { service, prisma } = serviceFor();

    await service.create(dto);

    expect(prisma.automationRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId, createdBy: userId, status: 'DISABLED' }),
      }),
    );
  });

  it('rechaza crear reglas en un proyecto suspendido antes de persistir', async () => {
    const { service, prisma } = serviceFor('SUSPENDED');

    await expect(service.create(dto)).rejects.toMatchObject({
      error: expect.objectContaining({ statusCode: 403 }),
    });
    expect(prisma.automationRule.create).not.toHaveBeenCalled();
  });

  it('propaga configuración inválida como error TCP 400', async () => {
    const { service } = serviceFor();

    await expect(
      service.create({ ...dto, actions: Array.from({ length: 6 }, () => dto.actions[0]) }),
    ).rejects.toMatchObject({ error: { statusCode: 400 } });
  });

  it('actualiza atómicamente, conserva el principal delegado e incrementa versión', async () => {
    const { service, prisma, tx } = serviceFor();

    await service.update({ ...dto, id: 'rule-a', projectId });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.automationCondition.deleteMany).toHaveBeenCalledWith({ where: { ruleId: 'rule-a' } });
    expect(tx.automationAction.deleteMany).toHaveBeenCalledWith({ where: { ruleId: 'rule-a' } });
    expect(tx.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
  });

  it('purga exclusivamente las reglas del proyecto solicitado', async () => {
    const { service, prisma } = serviceFor();

    await expect(service.purgeProject(projectId)).resolves.toEqual({ deleted: 1 });
    await expect(service.purgeProject('00000000-0000-4000-8000-000000000098')).resolves.toEqual({
      deleted: 0,
    });

    expect(prisma.automationRule.deleteMany).toHaveBeenNthCalledWith(1, { where: { projectId } });
  });
});
