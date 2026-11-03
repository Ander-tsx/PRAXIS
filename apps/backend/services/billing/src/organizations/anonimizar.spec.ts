import { OrganizationsService } from './organizations.service';

function montar() {
  const llamadas: Array<{ op: string; args: unknown }> = [];
  const prisma = {
    organizationMember: {
      deleteMany: async (args: unknown) => {
        llamadas.push({ op: 'deleteMany', args });
        return { count: 2 };
      },
      updateMany: async (args: unknown) => {
        llamadas.push({ op: 'updateMany', args });
        return { count: 3 };
      },
    },
  };
  const servicio = new OrganizationsService(
    prisma as never,
    {} as never,
    { get: () => undefined } as never,
  );
  return { servicio, llamadas };
}

describe('OrganizationsService.anonimizarPersona', () => {
  it('borra solo las invitaciones PENDIENTES a su correo y anonimiza el correo de sus membresías', async () => {
    const { servicio, llamadas } = montar();
    await expect(servicio.anonimizarPersona('u-1', 'Ana@Ejemplo.com')).resolves.toEqual({
      invitacionesBorradas: 2,
      membresiasAnonimizadas: 3,
    });
    expect(llamadas[0]).toEqual({
      op: 'deleteMany',
      args: {
        where: { status: 'INVITED', email: { equals: 'Ana@Ejemplo.com', mode: 'insensitive' } },
      },
    });
    expect(llamadas[1]).toEqual({
      op: 'updateMany',
      args: { where: { userId: 'u-1' }, data: { email: 'eliminada-u-1@eliminada.invalid' } },
    });
  });

  it('🔴 no cambia quién es miembro ni de quién es una organización: solo el correo', async () => {
    const { servicio, llamadas } = montar();
    await servicio.anonimizarPersona('u-1', 'ana@ejemplo.com');
    const cambio = llamadas.find((llamada) => llamada.op === 'updateMany')?.args as {
      data: Record<string, unknown>;
    };
    expect(Object.keys(cambio.data)).toEqual(['email']);
  });
});
