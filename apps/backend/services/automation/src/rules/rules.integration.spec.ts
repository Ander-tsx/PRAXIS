/// <reference types="jest" />

import { randomUUID } from 'node:crypto';
import { of } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from './rules.service';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://praxis:praxis123@localhost:5432/praxis?schema=automation';

describe('RulesService integration', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService({ getOrThrow: <T>() => databaseUrl } as never);
    await prisma.onModuleInit();
  });

  afterAll(async () => prisma.onModuleDestroy());

  it('aísla CRUD, versión y purga entre dos proyectos', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const columnA = randomUUID();
    const columnB = randomUUID();
    const projectsClient = {
      send: ({ cmd }: { cmd: string }, payload?: Record<string, unknown>) => {
        if (cmd === 'project_find_one') {
          return of({ id: payload?.id, ownerId: payload?.id === projectA ? ownerA : ownerB });
        }
        if (cmd === 'project_check_permission') return of({ allowed: true });
        if (cmd === 'column_find_by_ids') {
          const id = (payload?.ids as string[])[0];
          return of([{ id, boardId: id === columnA ? 'board-a' : 'board-b' }]);
        }
        if (cmd === 'project_resolve_resource') {
          return of({ projectId: payload?.boardId === 'board-a' ? projectA : projectB });
        }
        throw new Error(`Comando inesperado: ${cmd}`);
      },
    };
    const service = new RulesService(prisma, projectsClient as never);
    const rule = (projectId: string, ownerId: string, columnId: string, name: string) => ({
      projectId,
      createdBy: ownerId,
      name,
      trigger: { type: 'GITHUB_PULL_REQUEST_OPENED' as const, config: {} },
      conditions: [{ field: 'repositoryId', operator: 'EQUALS', value: 'repo' }],
      actions: [{ type: 'MOVE_TASK' as const, config: { targetColumnId: columnId } }],
    });

    try {
      const createdA = await service.create(rule(projectA, ownerA, columnA, 'A'));
      const createdB = await service.create(rule(projectB, ownerB, columnB, 'B'));
      const updatedA = await service.update({
        ...rule(projectA, ownerA, columnA, 'A editada'),
        id: createdA.id,
      });

      expect(updatedA.version).toBe(2);
      expect((await service.list(projectA)).map((item) => item.id)).toEqual([createdA.id]);
      expect((await service.list(projectB)).map((item) => item.id)).toEqual([createdB.id]);
      await expect(service.find(projectB, createdA.id)).rejects.toMatchObject({
        error: { statusCode: 404 },
      });

      await service.purgeProject(projectA);
      expect(await prisma.automationRule.findUnique({ where: { id: createdA.id } })).toBeNull();
      expect(await prisma.automationRule.findUnique({ where: { id: createdB.id } })).toMatchObject({
        projectId: projectB,
      });
    } finally {
      await prisma.automationRule.deleteMany({
        where: { projectId: { in: [projectA, projectB] } },
      });
    }
  });
});
