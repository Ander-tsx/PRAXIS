import { AuthService } from './auth.service';

const dto = { code: 'c', codeVerifier: 'v'.repeat(43), redirectUri: 'r', nonce: 'n' };
const perfil = { sub: 'kyloo-sub-1', email: 'ana@ejemplo.com', name: 'Ana María Pérez' };

function montar(modo: 'local' | 'kyloo' = 'local') {
  const credential = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const redis = { del: jest.fn().mockResolvedValue(1) };
  const personalTokens = { revocarTodos: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn((clave: string) => (clave === 'AUTH_MODE' ? modo : undefined)) };
  const kyloo = { perfilDesdeCodigo: jest.fn().mockResolvedValue(perfil) };
  // biome-ignore lint/suspicious/noExplicitAny: dobles de prueba
  const servicio = new AuthService(
    { credential } as any,
    redis as any,
    {} as any,
    config as any,
    {} as any,
    personalTokens as any,
    kyloo as any,
  );
  // biome-ignore lint/suspicious/noExplicitAny: método privado
  const emitir = jest.spyOn(servicio as any, 'emitirSesion').mockResolvedValue({ userId: 'u1' });
  return { servicio, credential, emitir, redis, personalTokens };
}

const usuario = { id: 'u1', status: 'ACTIVE' };

describe('AuthService.loginWithKyloo', () => {
  it('entra por kylooSub, que es lo estable', async () => {
    const { servicio, credential, emitir } = montar();
    credential.findUnique.mockResolvedValue({ user: usuario });
    await servicio.loginWithKyloo(dto);
    expect(emitir).toHaveBeenCalledWith('u1', 'ACTIVE');
    expect(credential.findFirst).not.toHaveBeenCalled();
  });

  it('vincula una cuenta existente cuyo correo ya estaba verificado', async () => {
    const { servicio, credential, emitir } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({
      id: 'c1',
      emailVerifiedAt: new Date(),
      kylooSub: null,
    });
    credential.update.mockResolvedValue({ user: usuario });
    await servicio.loginWithKyloo(dto);
    expect(credential.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: { kylooSub: 'kyloo-sub-1' } }),
    );
    expect(emitir).toHaveBeenCalled();
  });

  it('NO vincula una cuenta con el correo sin confirmar: sería heredarla', async () => {
    const { servicio, credential, emitir } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({ id: 'c1', emailVerifiedAt: null, kylooSub: null });
    await expect(servicio.loginWithKyloo(dto)).rejects.toMatchObject({
      error: { statusCode: 409 },
    });
    expect(credential.update).not.toHaveBeenCalled();
    expect(emitir).not.toHaveBeenCalled();
  });

  it('NO reasigna una cuenta vinculada a otra identidad de Kyloo', async () => {
    const { servicio, credential } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({
      id: 'c1',
      emailVerifiedAt: new Date(),
      kylooSub: 'otra-persona',
    });
    await expect(servicio.loginWithKyloo(dto)).rejects.toMatchObject({
      error: { statusCode: 409 },
    });
    expect(credential.update).not.toHaveBeenCalled();
  });

  it('crea la cuenta si nadie tiene ese correo: sin contraseña, verificada, con su nombre', async () => {
    const { servicio, credential } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue(null);
    credential.create.mockResolvedValue({ user: usuario });
    await servicio.loginWithKyloo(dto);
    const { data } = credential.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: 'ana@ejemplo.com',
      passwordHash: null,
      kylooSub: 'kyloo-sub-1',
      user: { create: { firstName: 'Ana', lastName: 'María Pérez' } },
    });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('AuthService.loginWithKyloo con AUTH_MODE=kyloo', () => {
  it('vincula una cuenta sin confirmar: la prueba de posesión es la de Kyloo', async () => {
    const { servicio, credential, emitir } = montar('kyloo');
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({ id: 'c1', emailVerifiedAt: null, kylooSub: null });
    credential.update.mockResolvedValue({ user: usuario });
    await servicio.loginWithKyloo(dto);
    const { data } = credential.update.mock.calls[0][0];
    expect(data.kylooSub).toBe('kyloo-sub-1');
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(emitir).toHaveBeenCalled();
  });

  it('borra la contraseña heredada al vincular: la puerta vieja se cierra', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({
      id: 'c1',
      emailVerifiedAt: new Date(),
      kylooSub: null,
    });
    credential.update.mockResolvedValue({ user: usuario });
    await servicio.loginWithKyloo(dto);
    expect(credential.update.mock.calls[0][0].data.passwordHash).toBeNull();
  });

  it('sigue sin reasignar una cuenta vinculada a otra identidad', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue({
      id: 'c1',
      emailVerifiedAt: new Date(),
      kylooSub: 'otra-persona',
    });
    await expect(servicio.loginWithKyloo(dto)).rejects.toMatchObject({
      error: { statusCode: 409 },
    });
  });

  it('sigue el cambio de correo hecho en Kyloo', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue({
      id: 'c1',
      email: 'vieja@ejemplo.com',
      user: usuario,
    });
    credential.update.mockResolvedValue({});
    await servicio.loginWithKyloo(dto);
    expect(credential.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { email: 'ana@ejemplo.com' },
    });
  });

  it('en modo local no toca el correo de una cuenta ya vinculada', async () => {
    const { servicio, credential } = montar('local');
    credential.findUnique.mockResolvedValue({
      id: 'c1',
      email: 'vieja@ejemplo.com',
      user: usuario,
    });
    await servicio.loginWithKyloo(dto);
    expect(credential.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.revocarTodoDe', () => {
  it('cierra las sesiones y revoca tokens y conexiones de esa persona', async () => {
    const { servicio, credential, redis, personalTokens } = montar();
    credential.findUnique.mockResolvedValue({ user: { id: 'u1' } });
    await expect(servicio.revocarTodoDe('kyloo-sub-1', 'ana@ejemplo.com')).resolves.toEqual({
      revocadas: true,
    });
    expect(redis.del).toHaveBeenCalledWith('auth:sessions:u1');
    expect(personalTokens.revocarTodos).toHaveBeenCalledWith('u1');
  });

  it('si no conoce a esa persona, no revoca nada y no falla', async () => {
    const { servicio, credential, redis } = montar();
    credential.findUnique.mockResolvedValue(null);
    credential.findFirst.mockResolvedValue(null);
    await expect(servicio.revocarTodoDe('x', 'x@ejemplo.com')).resolves.toEqual({
      revocadas: false,
    });
    expect(redis.del).not.toHaveBeenCalled();
  });
});

describe('AuthService.seguirCambioDeCorreo', () => {
  it('actualiza el correo de la cuenta vinculada', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue({ id: 'c1', email: 'viejo@ejemplo.com' });
    await expect(
      servicio.seguirCambioDeCorreo('kyloo-sub-1', 'Nuevo@Ejemplo.com'),
    ).resolves.toEqual({
      actualizado: true,
    });
    expect(credential.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { email: 'nuevo@ejemplo.com' },
    });
  });

  it('es idempotente: el mismo evento dos veces no vuelve a escribir', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue({ id: 'c1', email: 'nuevo@ejemplo.com' });
    await expect(
      servicio.seguirCambioDeCorreo('kyloo-sub-1', 'nuevo@ejemplo.com'),
    ).resolves.toEqual({
      actualizado: false,
    });
    expect(credential.update).not.toHaveBeenCalled();
  });

  it('si el correo ya es de otra cuenta, no falla ni lo quita (se avisa en el log)', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue({ id: 'c1', email: 'viejo@ejemplo.com' });
    credential.update.mockRejectedValue(new Error('Unique constraint failed'));
    await expect(servicio.seguirCambioDeCorreo('kyloo-sub-1', 'otro@ejemplo.com')).resolves.toEqual(
      {
        actualizado: false,
      },
    );
  });

  it('en modo local no toca nada', async () => {
    const { servicio, credential } = montar('local');
    await expect(servicio.seguirCambioDeCorreo('kyloo-sub-1', 'x@ejemplo.com')).resolves.toEqual({
      actualizado: false,
    });
    expect(credential.findUnique).not.toHaveBeenCalled();
  });

  it('una persona que Praxis no conoce se ignora', async () => {
    const { servicio, credential } = montar('kyloo');
    credential.findUnique.mockResolvedValue(null);
    await expect(servicio.seguirCambioDeCorreo('nadie', 'x@ejemplo.com')).resolves.toEqual({
      actualizado: false,
    });
  });
});
