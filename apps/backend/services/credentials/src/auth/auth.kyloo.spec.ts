import { AuthService } from './auth.service';

const dto = { code: 'c', codeVerifier: 'v'.repeat(43), redirectUri: 'r', nonce: 'n' };
const perfil = { sub: 'kyloo-sub-1', email: 'ana@ejemplo.com', name: 'Ana María Pérez' };

function montar() {
  const credential = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  const kyloo = { perfilDesdeCodigo: jest.fn().mockResolvedValue(perfil) };
  // biome-ignore lint/suspicious/noExplicitAny: dobles de prueba
  const servicio = new AuthService(
    { credential } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    kyloo as any,
  );
  // biome-ignore lint/suspicious/noExplicitAny: método privado
  const emitir = jest.spyOn(servicio as any, 'emitirSesion').mockResolvedValue({ userId: 'u1' });
  return { servicio, credential, emitir };
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
