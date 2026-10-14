import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}));

const enviar = webpush.sendNotification as jest.Mock;

function montar(claves: boolean, conectados: string[] = []) {
  const prisma = {
    pushSubscription: {
      findMany: jest.fn().mockResolvedValue([
        { id: 's1', userId: 'u1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a' },
        { id: 's2', userId: 'u1', endpoint: 'https://push/2', p256dh: 'k', auth: 'a' },
      ]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const redis = {
    get: jest.fn((clave: string) =>
      Promise.resolve(conectados.some((id) => clave.endsWith(id)) ? 1 : null),
    ),
  };
  const config = {
    get: (k: string) =>
      claves ? { PUSH_VAPID_PUBLIC_KEY: 'pub', PUSH_VAPID_PRIVATE_KEY: 'priv' }[k] : '',
  } as unknown as ConfigService;
  // biome-ignore lint/suspicious/noExplicitAny: dobles de prueba
  const servicio = new PushService(config, prisma as any, redis as any);
  return { servicio, prisma, redis };
}

describe('PushService', () => {
  beforeEach(() => enviar.mockReset());

  it('sin claves VAPID no envía nada ni toca la base', async () => {
    const { servicio, prisma } = montar(false);
    expect(servicio.habilitado).toBe(false);
    await expect(servicio.enviar(['u1'], { title: 't', body: 'b', url: '/' })).resolves.toEqual({
      enviados: 0,
    });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('borra las suscripciones que el servicio de push da por muertas (410)', async () => {
    const { servicio, prisma } = montar(true);
    enviar.mockResolvedValueOnce({}).mockRejectedValueOnce({ statusCode: 410 });
    const r = await servicio.enviar(['u1'], { title: 't', body: 'b', url: '/' });
    expect(r.enviados).toBe(1);
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s2'] } },
    });
  });

  it('un error que no es 404/410 no borra la suscripción', async () => {
    const { servicio, prisma } = montar(true);
    enviar.mockRejectedValue({ statusCode: 500, message: 'caído' });
    await servicio.enviar(['u1'], { title: 't', body: 'b', url: '/' });
    expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it('los mensajes no se mandan a quien tiene la aplicación abierta', async () => {
    const { servicio, prisma } = montar(true, ['u1']);
    await servicio.avisarMensaje(['u1'], { title: 't', body: 'b', url: '/' });
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
});
