import { DocumentsService } from './documents.service';

describe('DocumentsService.borrarInvitacionesDe', () => {
  it('borra las invitaciones a su correo, en minúsculas, y nada más', async () => {
    const llamadas: unknown[] = [];
    const prisma = {
      documentInvite: {
        deleteMany: async (args: unknown) => {
          llamadas.push(args);
          return { count: 4 };
        },
      },
    };
    const servicio = new DocumentsService(prisma as never, {} as never);
    await expect(servicio.borrarInvitacionesDe('Ana@Ejemplo.com')).resolves.toEqual({
      borradas: 4,
    });
    expect(llamadas).toEqual([{ where: { email: 'ana@ejemplo.com' } }]);
  });
});
