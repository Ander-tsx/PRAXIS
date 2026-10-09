import { McpConnectionsService } from './mcp-connections.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

function montar() {
  const mcpConnection = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const credential = { findUnique: jest.fn(), findFirst: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('jwt-corto') };
  // biome-ignore lint/suspicious/noExplicitAny: dobles de prueba
  const servicio = new McpConnectionsService({ mcpConnection, credential } as any, jwt as any);
  return { servicio, mcpConnection, credential, jwt };
}

const fila = (extra = {}) => ({
  id: 'c1',
  userId: 'u1',
  clientId: 'chatgpt',
  clientName: 'ChatGPT',
  kylooSub: 'sub-1',
  allowedOrgIds: [ORG_A, ORG_B],
  activeOrgId: ORG_A,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  user: { status: 'ACTIVE' },
  ...extra,
});

describe('McpConnectionsService.sesion', () => {
  it('abre la sesión de una conexión viva con el sub correcto', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.findUnique.mockResolvedValue(fila());
    mcpConnection.update.mockResolvedValue({});
    await expect(servicio.sesion({ connectionId: 'c1', sub: 'sub-1' })).resolves.toMatchObject({
      userId: 'u1',
      activeOrgId: ORG_A,
      allowedOrgIds: [ORG_A, ORG_B],
      accessToken: 'jwt-corto',
    });
  });

  it.each([
    ['no existe', null],
    ['está revocada', fila({ revokedAt: new Date() })],
    ['es de otra identidad de Kyloo', fila({ kylooSub: 'sub-de-otra-persona' })],
    ['la cuenta está suspendida', fila({ user: { status: 'SUSPENDED' } })],
  ])('responde el mismo 401 si %s', async (_caso, existente) => {
    const { servicio, mcpConnection, jwt } = montar();
    mcpConnection.findUnique.mockResolvedValue(existente);
    await expect(servicio.sesion({ connectionId: 'c1', sub: 'sub-1' })).rejects.toMatchObject({
      error: { statusCode: 401 },
    });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});

describe('McpConnectionsService.actualizar', () => {
  it('cambia la organización activa entre las permitidas, sin reconectar', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.findFirst.mockResolvedValue(fila());
    mcpConnection.update.mockImplementation(async ({ data }) => fila(data));
    const vista = await servicio.actualizar('u1', 'c1', { activeOrgId: ORG_B });
    expect(vista.activeOrgId).toBe(ORG_B);
  });

  it('rechaza activar una organización que la conexión no tiene', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.findFirst.mockResolvedValue(fila({ allowedOrgIds: [ORG_A] }));
    await expect(servicio.actualizar('u1', 'c1', { activeOrgId: ORG_B })).rejects.toMatchObject({
      error: { statusCode: 400 },
    });
  });

  it('quitar la activa de las permitidas deja otra, no una conexión sin organización', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.findFirst.mockResolvedValue(fila());
    mcpConnection.update.mockImplementation(async ({ data }) => fila(data));
    const vista = await servicio.actualizar('u1', 'c1', { allowedOrgIds: [ORG_B] });
    expect(vista.activeOrgId).toBe(ORG_B);
    expect(vista.allowedOrgIds).toEqual([ORG_B]);
  });

  it('una conexión ajena o revocada es un 404', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.findFirst.mockResolvedValue(null);
    await expect(servicio.actualizar('u1', 'x', {})).rejects.toMatchObject({
      error: { statusCode: 404 },
    });
    mcpConnection.findFirst.mockResolvedValue(fila({ revokedAt: new Date() }));
    await expect(servicio.actualizar('u1', 'c1', {})).rejects.toMatchObject({
      error: { statusCode: 404 },
    });
  });
});

describe('McpConnectionsService.guardar', () => {
  it('rechaza una activa fuera de las permitidas', async () => {
    const { servicio } = montar();
    await expect(
      servicio.guardar({
        userId: 'u1',
        kylooSub: 's',
        clientId: 'c',
        clientName: 'x',
        allowedOrgIds: [ORG_A],
        activeOrgId: ORG_B,
      }),
    ).rejects.toMatchObject({ error: { statusCode: 400 } });
  });

  it('reconectar el mismo cliente reactiva la fila en vez de duplicarla', async () => {
    const { servicio, mcpConnection } = montar();
    mcpConnection.upsert.mockResolvedValue(fila());
    await servicio.guardar({
      userId: 'u1',
      kylooSub: 's',
      clientId: 'chatgpt',
      clientName: 'ChatGPT',
      allowedOrgIds: [ORG_A, ORG_A],
      activeOrgId: ORG_A,
    });
    const arg = mcpConnection.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_clientId: { userId: 'u1', clientId: 'chatgpt' } });
    expect(arg.update.revokedAt).toBeNull();
    expect(arg.update.allowedOrgIds).toEqual([ORG_A]);
  });
});

describe('McpConnectionsService.identificar', () => {
  const user = { id: 'u1', status: 'ACTIVE' };

  it('por kylooSub', async () => {
    const { servicio, credential } = montar();
    credential.findUnique.mockResolvedValue({ user });
    await expect(servicio.identificar({ sub: 's', email: 'a@b.c' })).resolves.toEqual({
      userId: 'u1',
    });
  });

  it('por correo solo si la cuenta ya confirmó su buzón', async () => {
    const { servicio, credential } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue(null);
    await expect(servicio.identificar({ sub: 's', email: 'a@b.c' })).resolves.toBeNull();
    const filtro = credential.findFirst.mock.calls[0][0].where;
    expect(filtro.emailVerifiedAt).toEqual({ not: null });
    expect(filtro.kylooSub).toBeNull();
  });

  it('una cuenta suspendida no se identifica', async () => {
    const { servicio, credential } = montar();
    credential.findUnique.mockResolvedValue({ user: { id: 'u1', status: 'SUSPENDED' } });
    await expect(servicio.identificar({ sub: 's', email: 'a@b.c' })).resolves.toBeNull();
  });
});
