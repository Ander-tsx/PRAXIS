import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModoLocalGuard } from './modo-local.guard';

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
});
