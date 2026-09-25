/// <reference types="jest" />

import { RpcException } from '@nestjs/microservices';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { SprintsService } from './sprints.service';

/**
 * Las reglas del ciclo de vida de un sprint (auditoría de
 * `docs/PLAN-SCRUM-KANBAN.md`). Cada caso fue un hueco real: devolvía 201 o
 * 200 donde tenía que negarse, sin ningún error.
 */

type Fila = Record<string, unknown>;

function montar(opciones: {
  sprint?: Fila | null;
  board?: Fila | null;
  activo?: Fila | null;
  planeado?: Fila | null;
  alActualizar?: () => Promise<Fila>;
}) {
  const prisma = {
    board: { findUnique: jest.fn().mockResolvedValue(opciones.board ?? null) },
    sprint: {
      findUnique: jest.fn().mockResolvedValue(opciones.sprint ?? null),
      findFirst: jest.fn(({ where }: { where: { status: string } }) =>
        Promise.resolve(
          where.status === 'ACTIVE' ? (opciones.activo ?? null) : (opciones.planeado ?? null),
        ),
      ),
      update: jest.fn(opciones.alActualizar ?? (() => Promise.resolve({}))),
      create: jest.fn().mockResolvedValue({ id: 'nuevo' }),
    },
  };
  const redis = { del: jest.fn(), get: jest.fn(), set: jest.fn() };
  return {
    servicio: new SprintsService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    ),
    prisma,
  };
}

async function codigo(promesa: Promise<unknown>): Promise<number | null> {
  try {
    await promesa;
    return null;
  } catch (error) {
    if (!(error instanceof RpcException)) throw error;
    return (error.getError() as { statusCode: number }).statusCode;
  }
}

const planeado = { id: 's1', boardId: 'b1', status: 'PLANNED', name: 'Sprint 1' };
const fechas = { startDate: '2026-09-21T06:00:00.000Z', endDate: '2026-10-04T05:59:59.999Z' };

describe('SprintsService', () => {
  it('no arranca un sprint con Scrum apagado (S8)', async () => {
    const { servicio } = montar({ sprint: planeado, board: { scrumEnabled: false } });
    expect(await codigo(servicio.startSprint({ id: 's1', boardId: 'b1', ...fechas }))).toBe(400);
  });

  it('dos inicios a la vez: el índice parcial gana y responde 409, no 500 (S9)', async () => {
    const { servicio } = montar({
      sprint: planeado,
      board: { scrumEnabled: true },
      alActualizar: () => Promise.reject(Object.assign(new Error('único'), { code: 'P2002' })),
    });
    expect(await codigo(servicio.startSprint({ id: 's1', boardId: 'b1', ...fechas }))).toBe(409);
  });

  it('al arrancar guarda el instante real, no solo la fecha (S1)', async () => {
    const { servicio, prisma } = montar({ sprint: planeado, board: { scrumEnabled: true } });
    await servicio.startSprint({ id: 's1', boardId: 'b1', ...fechas });
    const datos = prisma.sprint.update.mock.calls[0][0].data as { startedAt: Date };
    expect(datos.startedAt).toBeInstanceOf(Date);
  });

  it('un segundo planeado se rechaza: no habría dónde verlo (S4)', async () => {
    const { servicio } = montar({ board: { scrumEnabled: true }, planeado });
    expect(await codigo(servicio.createSprint({ boardId: 'b1', name: 'Otro' }))).toBe(409);
  });

  it('un sprint cerrado no se edita', async () => {
    const { servicio } = montar({ sprint: { ...planeado, status: 'CLOSED' } });
    expect(await codigo(servicio.updateSprint({ id: 's1', boardId: 'b1', goal: 'x' }))).toBe(409);
  });

  it('de uno en curso no se mueve el inicio', async () => {
    const { servicio } = montar({ sprint: { ...planeado, status: 'ACTIVE' } });
    expect(
      await codigo(servicio.updateSprint({ id: 's1', boardId: 'b1', startDate: fechas.startDate })),
    ).toBe(400);
  });

  it('solo se descarta un sprint que no ha empezado', async () => {
    const { servicio } = montar({ sprint: { ...planeado, status: 'ACTIVE' } });
    expect(await codigo(servicio.deletePlannedSprint('s1', 'b1'))).toBe(409);
  });
});
