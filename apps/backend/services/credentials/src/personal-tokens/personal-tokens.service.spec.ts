import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PAT_MAX_PER_USER } from '@praxis/contracts';
import type { PrismaService } from '../prisma/prisma.service';
import { PersonalTokensService } from './personal-tokens.service';

/**
 * M1–M2 de docs/PLAN-MCP.md: el hash, el alcance por defecto, que listar no
 * devuelve nunca el token, y que el canje solo emite un `access` para un token
 * vivo de una cuenta activa.
 */
describe('PersonalTokensService', () => {
  type Fila = Record<string, unknown> & {
    id: string;
    userId: string;
    tokenHash: string;
    revokedAt: Date | null;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
  };
  let filas: Fila[];
  let estado: string;

  const elegir = (fila: Fila, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]])) : fila;

  const prisma = {
    personalAccessToken: {
      count: jest.fn(
        async () =>
          filas.filter((f) => !f.revokedAt && (!f.expiresAt || f.expiresAt > new Date())).length,
      ),
      create: jest.fn(
        async ({ data, select }: { data: Partial<Fila>; select: Record<string, boolean> }) => {
          const fila = {
            id: `pat-${filas.length + 1}`,
            revokedAt: null,
            lastUsedAt: null,
            createdAt: new Date(),
            ...data,
          } as Fila;
          filas.push(fila);
          return elegir(fila, select);
        },
      ),
      findMany: jest.fn(async ({ select }: { select: Record<string, boolean> }) =>
        filas.map((f) => elegir(f, select)),
      ),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        const fila = filas.find((f) => f.tokenHash === where.tokenHash);
        return fila ? { ...fila, user: { status: estado } } : null;
      }),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; userId: string } }) =>
          filas.find((f) => f.id === where.id && f.userId === where.userId) ?? null,
      ),
      update: jest.fn(
        async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: Partial<Fila>;
          select?: Record<string, boolean>;
        }) => {
          const fila = filas.find((f) => f.id === where.id) as Fila;
          Object.assign(fila, data);
          return elegir(fila, select);
        },
      ),
      updateMany: jest.fn(async ({ data }: { data: Partial<Fila> }) => {
        for (const fila of filas) if (!fila.revokedAt) Object.assign(fila, data);
      }),
    },
    /* Cambiar la contraseña también revoca las conexiones por OAuth. */
    mcpConnection: { updateMany: jest.fn(async () => ({ count: 0 })) },
  };

  const jwt = new JwtService({ secret: 'secreto-de-prueba' });
  const servicio = new PersonalTokensService(prisma as unknown as PrismaService, jwt);

  beforeEach(() => {
    filas = [];
    estado = 'ACTIVE';
  });

  const crear = (scopes = ['read'], expiresInDays?: number) =>
    servicio.crear({
      userId: 'ana',
      organizationId: 'org-1',
      name: ' Mi Claude ',
      scopes,
      expiresInDays,
    });

  it('guarda solo el hash y devuelve el token en claro una vez', async () => {
    const { token, personalToken } = await crear();

    expect(token).toMatch(/^prx_/);
    expect(filas[0].tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(personalToken)).not.toContain(token);
    expect(personalToken.prefix).toBe(token.slice(0, 12));
    expect(personalToken.name).toBe('Mi Claude');
  });

  it('🔴 listar no devuelve nunca ni el token ni su hash (I3)', async () => {
    const { token } = await crear();
    const lista = await servicio.listar('ana');

    expect(JSON.stringify(lista)).not.toContain(token);
    expect(JSON.stringify(lista)).not.toContain(filas[0].tokenHash);
  });

  it('normaliza los alcances y caduca a los 90 días por defecto', async () => {
    const { personalToken } = await crear(['delete', 'read', 'read']);

    expect(personalToken.scopes).toEqual(['read', 'delete']);
    const dias = (Date.parse(personalToken.expiresAt as string) - Date.now()) / 86_400_000;
    expect(Math.round(dias)).toBe(90);
  });

  it('con 0 días no caduca', async () => {
    const { personalToken } = await crear(['read'], 0);
    expect(personalToken.expiresAt).toBeNull();
  });

  it(`no deja tener más de ${PAT_MAX_PER_USER} vivos`, async () => {
    for (let i = 0; i < PAT_MAX_PER_USER; i++) await crear();
    await expect(crear()).rejects.toMatchObject({ error: { statusCode: 409 } });
  });

  it('el canje emite un JWT de acceso, no de refresco, con el dueño como sub', async () => {
    const { token } = await crear(['read', 'write']);
    const canje = await servicio.canjear(token);

    const payload = jwt.verify(canje.accessToken);
    expect(payload).toMatchObject({ sub: 'ana', typ: 'access' });
    expect(canje).toMatchObject({
      userId: 'ana',
      organizationId: 'org-1',
      scopes: ['read', 'write'],
    });
  });

  it.each([
    [
      'revocado',
      () => {
        filas[0].revokedAt = new Date();
      },
    ],
    [
      'caducado',
      () => {
        filas[0].expiresAt = new Date(Date.now() - 1000);
      },
    ],
    [
      'de una cuenta suspendida',
      () => {
        estado = 'SUSPENDED';
      },
    ],
  ])('🔴 un token %s no se canjea (I4)', async (_caso, preparar) => {
    const { token } = await crear();
    preparar();
    await expect(servicio.canjear(token)).rejects.toMatchObject({ error: { statusCode: 401 } });
  });

  it('un token inventado da el mismo 401', async () => {
    await expect(servicio.canjear('prx_inventado')).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
    await expect(servicio.canjear('otra-cosa')).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
  });

  it('revocar todos (cambio de contraseña) deja fuera a los que había', async () => {
    const { token } = await crear();
    await servicio.revocarTodos('ana');
    await expect(servicio.canjear(token)).rejects.toMatchObject({ error: { statusCode: 401 } });
    expect(prisma.mcpConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'ana', revokedAt: null } }),
    );
  });

  it('no se revoca el token de otra persona', async () => {
    await crear();
    await expect(servicio.revocar('beto', 'pat-1')).rejects.toMatchObject({
      error: { statusCode: 404 },
    });
  });
});
