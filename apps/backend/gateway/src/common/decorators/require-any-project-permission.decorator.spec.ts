/// <reference types="jest" />

import { RequireAnyProjectPermission } from './require-any-project-permission.decorator';

describe('RequireAnyProjectPermission', () => {
  it('rechaza una declaración sin permisos para que no pueda desproteger una ruta', () => {
    expect(() => RequireAnyProjectPermission()).toThrow('al menos un permiso');
  });
});
