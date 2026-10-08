import { RpcException } from '@nestjs/microservices';
import { of } from 'rxjs';

import { CustomFieldsService } from './custom-fields.service';

/**
 * Lo que fija este archivo es la **validación por tipo** y las dos fronteras
 * que el guard no puede ver: que la tarea y el campo sean del proyecto de la
 * ruta, y que una opción borrada desaparezca de las tareas.
 */

const PROJECT = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const FIELD = '44444444-4444-4444-8444-444444444444';
const MEMBER = '55555555-5555-4555-8555-555555555555';
const STRANGER = '66666666-6666-4666-8666-666666666666';

type Field = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  options: unknown;
};

function build(field: Partial<Field> = {}, taskProject = PROJECT) {
  const storedField: Field = {
    id: FIELD,
    projectId: PROJECT,
    name: 'Reviewer',
    type: 'TEXT',
    options: [],
    ...field,
  };
  const prisma = {
    task: {
      findUnique: jest.fn().mockResolvedValue({ id: TASK, projectId: taskProject, boardId: 'b1' }),
    },
    customField: {
      findUnique: jest.fn().mockResolvedValue(storedField),
      update: jest.fn().mockImplementation(({ data }) => ({ ...storedField, ...data })),
    },
    taskFieldValue: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new CustomFieldsService(prisma as never, redis as never, config as never);
  /* Sin red: projects-service responde que solo MEMBER es miembro. */
  (service as unknown as { projectsClient: { send: jest.Mock } }).projectsClient = {
    send: jest.fn((pattern: { cmd: string }) =>
      pattern.cmd === 'member_find_all'
        ? of([{ userId: MEMBER }])
        : of({ id: PROJECT, ownerId: MEMBER }),
    ),
  };
  return { service, prisma, redis };
}

function set(service: CustomFieldsService, value: unknown) {
  return service.setValue({
    taskId: TASK,
    fieldId: FIELD,
    projectId: PROJECT,
    requesterId: MEMBER,
    value,
  });
}

async function rejects(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RpcException);
  expect((error as RpcException).getError()).toMatchObject({ statusCode: status });
}

describe('CustomFieldsService.setValue', () => {
  it('guarda un texto recortado en la columna `text`', async () => {
    const { service, prisma } = build();
    await set(service, '  Ana  ');
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ text: 'Ana', ids: [] }) }),
    );
  });

  it('vaciar —null, cadena vacía o lista vacía— borra la fila', async () => {
    for (const empty of [null, '', '   ', []]) {
      const { service, prisma } = build();
      await set(service, empty);
      expect(prisma.taskFieldValue.deleteMany).toHaveBeenCalled();
      expect(prisma.taskFieldValue.upsert).not.toHaveBeenCalled();
    }
  });

  it('`false` en una casilla es un valor, no vaciarla', async () => {
    const { service, prisma } = build({ type: 'CHECKBOX' });
    await set(service, false);
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ bool: false }) }),
    );
  });

  it('un número acepta coma decimal y rechaza lo que no es número', async () => {
    const { service, prisma } = build({ type: 'NUMBER' });
    await set(service, '3,5');
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ number: 3.5 }) }),
    );
    await rejects(set(build({ type: 'NUMBER' }).service, 'tres'), 400);
  });

  it('una fecha se guarda a mediodía UTC para no cambiar de día', async () => {
    const { service, prisma } = build({ type: 'DATE' });
    await set(service, '2026-10-07');
    const { update } = prisma.taskFieldValue.upsert.mock.calls[0][0];
    expect(update.date.toISOString()).toBe('2026-10-07T12:00:00.000Z');
    await rejects(set(build({ type: 'DATE' }).service, '07/10/2026'), 400);
  });

  it('un enlace tiene que ser http(s)', async () => {
    await rejects(set(build({ type: 'URL' }).service, 'javascript:alert(1)'), 400);
    const { service, prisma } = build({ type: 'URL' });
    await set(service, 'https://github.com/x/y/pull/1');
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalled();
  });

  it('una selección solo admite opciones del campo', async () => {
    const options = [{ id: 'o1', name: 'Alta', color: 'error' }];
    await rejects(set(build({ type: 'SELECT', options }).service, 'o9'), 400);
    const { service, prisma } = build({ type: 'SELECT', options });
    await set(service, 'o1');
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ text: 'o1' }) }),
    );
  });

  it('una persona tiene que ser del proyecto', async () => {
    await rejects(set(build({ type: 'PERSON' }).service, [STRANGER]), 400);
    const { service, prisma } = build({ type: 'PERSON' });
    await set(service, [MEMBER, MEMBER]);
    expect(prisma.taskFieldValue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ ids: [MEMBER] }) }),
    );
  });

  it('un campo de otro proyecto no se escribe en esta tarea', async () => {
    await rejects(set(build({ projectId: OTHER_PROJECT }).service, 'x'), 403);
  });

  it('una tarea de otro proyecto tampoco', async () => {
    await rejects(set(build({}, OTHER_PROJECT).service, 'x'), 403);
  });

  it('invalida la tarea y el tablero por prefijo, no con un `del` exacto', async () => {
    const { service, redis } = build();
    await set(service, 'Ana');
    expect(redis.del).toHaveBeenCalledWith(`task:${TASK}`);
    expect(redis.delByPrefix).toHaveBeenCalledWith('tasks:board:b1');
  });
});

describe('CustomFieldsService.updateField', () => {
  it('quitar una opción de un SELECT vacía las tareas que la tenían', async () => {
    const options = [
      { id: 'o1', name: 'Alta', color: 'error' },
      { id: 'o2', name: 'Baja', color: 'info' },
    ];
    const { service, prisma } = build({ type: 'SELECT', options });
    await service.updateField({
      id: FIELD,
      projectId: PROJECT,
      requesterId: MEMBER,
      options: [{ id: 'o1', name: 'Alta', color: 'error' }],
    });
    expect(prisma.taskFieldValue.deleteMany).toHaveBeenCalledWith({
      where: { fieldId: FIELD, text: { in: ['o2'] } },
    });
  });

  it('repinta las tareas que tenían la opción, averiguándolas ANTES de borrarla', async () => {
    const options = [
      { id: 'o1', name: 'Alta', color: 'error' },
      { id: 'o2', name: 'Baja', color: 'info' },
    ];
    const { service, prisma, redis } = build({ type: 'SELECT', options });
    /* La fila existe hasta el `deleteMany`; después, la consulta ya no la ve. */
    let borrado = false;
    prisma.taskFieldValue.findMany.mockImplementation(async () =>
      borrado ? [] : [{ task: { id: TASK, boardId: 'b1' } }],
    );
    prisma.taskFieldValue.deleteMany.mockImplementation(async () => {
      borrado = true;
      return { count: 1 };
    });
    await service.updateField({
      id: FIELD,
      projectId: PROJECT,
      requesterId: MEMBER,
      options: [{ id: 'o1', name: 'Alta', color: 'error' }],
    });
    expect(redis.del).toHaveBeenCalledWith(`task:${TASK}`);
    expect(redis.delByPrefix).toHaveBeenCalledWith('tasks:board:b1');
  });

  it('conserva el id de las opciones que ya existían y da uno nuevo a las demás', async () => {
    const options = [{ id: 'o1', name: 'Alta', color: 'error' }];
    const { service, prisma } = build({ type: 'MULTI_SELECT', options });
    await service.updateField({
      id: FIELD,
      projectId: PROJECT,
      requesterId: MEMBER,
      options: [
        { id: 'o1', name: 'Muy alta', color: 'error' },
        { id: 'inventado', name: 'Nueva', color: 'info' },
      ],
    });
    const saved = prisma.customField.update.mock.calls[0][0].data.options;
    expect(saved[0]).toEqual({ id: 'o1', name: 'Muy alta', color: 'error' });
    expect(saved[1].id).not.toBe('inventado');
  });

  it('rechaza opciones con el mismo nombre', async () => {
    const { service } = build({ type: 'SELECT', options: [] });
    await rejects(
      service.updateField({
        id: FIELD,
        projectId: PROJECT,
        requesterId: MEMBER,
        options: [
          { name: 'Alta', color: 'error' },
          { name: 'alta', color: 'info' },
        ],
      }),
      400,
    );
  });
});
