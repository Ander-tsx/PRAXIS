import { createApiClient } from '../api/client';

/**
 * Notificaciones push desde el navegador (`docs/PLAN-PUSH.md`).
 *
 * Todo cuelga de `/me/push` del gateway. La identidad de un dispositivo es el
 * `endpoint` de su suscripción: lo da el navegador y es lo que el servidor
 * guarda para poder escribirle.
 */
const GATEWAY = '/api/gateway';

export type EstadoPush =
  /* El navegador no puede (o es iOS sin instalar la app). `instalar` distingue el segundo. */
  | { tipo: 'no-disponible'; instalar: boolean }
  | { tipo: 'apagado-por-servidor' }
  | { tipo: 'bloqueado' }
  | { tipo: 'apagado' }
  | { tipo: 'activo' };

function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function instalada(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    matchMedia('(display-mode: standalone)').matches
  );
}

function soportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** El service worker solo se registra en producción: en `next dev` no hay push. */
async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

function claveAUint8(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const binario = atob((base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  const salida = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

export async function leerEstadoPush(): Promise<EstadoPush> {
  if (!soportado()) return { tipo: 'no-disponible', instalar: esIOS() && !instalada() };
  if (Notification.permission === 'denied') return { tipo: 'bloqueado' };
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { tipo: 'apagado' };
  try {
    const api = createApiClient({ gatewayPath: GATEWAY });
    const estado = await api.get<{ habilitado: boolean; esteDispositivo: boolean }>(
      `/me/push/state?endpoint=${encodeURIComponent(sub.endpoint)}`,
    );
    if (!estado.habilitado) return { tipo: 'apagado-por-servidor' };
    if (estado.esteDispositivo) return { tipo: 'activo' };
    /* El navegador tiene suscripción pero el servidor no la tiene a nombre de
       esta persona (otra cuenta en el mismo teléfono, o se borró): se vuelve a
       registrar en silencio, que ya hay permiso. */
    await registrarEnServidor(sub);
    return { tipo: 'activo' };
  } catch {
    return { tipo: 'apagado' };
  }
}

async function registrarEnServidor(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await createApiClient({ gatewayPath: GATEWAY }).post('/me/push/subscribe', {
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  });
}

/**
 * Pide permiso, suscribe y registra el dispositivo. **Hay que llamarla desde un
 * toque**: iOS ignora el permiso pedido fuera de un gesto.
 */
export async function activarPush(): Promise<EstadoPush> {
  if (!soportado()) return { tipo: 'no-disponible', instalar: esIOS() && !instalada() };
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { tipo: permiso === 'denied' ? 'bloqueado' : 'apagado' };

  const reg = await registro();
  if (!reg) return { tipo: 'no-disponible', instalar: false };
  const api = createApiClient({ gatewayPath: GATEWAY });
  const { publicKey } = await api.get<{ publicKey: string | null }>('/me/push/key');
  if (!publicKey) return { tipo: 'apagado-por-servidor' };

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveAUint8(publicKey),
    }));
  await registrarEnServidor(sub);
  return { tipo: 'activo' };
}

/** Quita este dispositivo, en el servidor y en el navegador. Nunca lanza. */
export async function desactivarPush(): Promise<void> {
  try {
    const sub = await (await registro())?.pushManager.getSubscription();
    if (!sub) return;
    await createApiClient({ gatewayPath: GATEWAY })
      .delete('/me/push/subscribe', { endpoint: sub.endpoint })
      .catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    /* Sin push no pasa nada: la sesión se cierra igual. */
  }
}
