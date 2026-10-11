import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModoLocalGuard, ModoLocalORespaldoGuard } from './modo-local.guard';

describe('ModoLocalGuard', () => {
  it('deja pasar en modo local, que es el predeterminado', () => {
    expect(new ModoLocalGuard(new ConfigService({})).canActivate()).toBe(true);
    expect(new ModoLocalGuard(new ConfigService({ AUTH_MODE: 'local' })).canActivate()).toBe(true);
  });

  it('cierra con AUTH_DELEGATED cuando Kyloo es la única puerta', () => {
    const guard = new ModoLocalGuard(new ConfigService({ AUTH_MODE: 'kyloo' }));
    expect(() => guard.canActivate()).toThrow(ForbiddenException);
    try {
      guard.canActivate();
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'AUTH_DELEGATED' });
    }
  });

  describe('red de seguridad', () => {
    const kyloo = { AUTH_MODE: 'kyloo' };

    it('deja pasar contraseña y Google aunque Kyloo sea la única puerta', () => {
      expect(new ModoLocalORespaldoGuard(new ConfigService(kyloo)).canActivate()).toBe(true);
      expect(
        new ModoLocalORespaldoGuard(
          new ConfigService({ ...kyloo, AUTH_FALLBACK_LOCAL: 'true' }),
        ).canActivate(),
      ).toBe(true);
    });

    it('se cierra con AUTH_FALLBACK_LOCAL=false', () => {
      const guard = new ModoLocalORespaldoGuard(
        new ConfigService({ ...kyloo, AUTH_FALLBACK_LOCAL: 'false' }),
      );
      expect(() => guard.canActivate()).toThrow(ForbiddenException);
    });

    it('el guard estricto (registro, recuperación…) sigue cerrado con la red abierta', () => {
      const config = new ConfigService({ ...kyloo, AUTH_FALLBACK_LOCAL: 'true' });
      expect(() => new ModoLocalGuard(config).canActivate()).toThrow(ForbiddenException);
    });
  });
});
