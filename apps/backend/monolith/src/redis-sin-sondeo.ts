import Redis from 'ioredis';

/**
 * Quita el `tcp-keepalive` del Redis del backend, para que Railway pueda dormirlo.
 *
 * ## Qué pasaba (medido en producción el 2026-09-29)
 *
 * Con el reposo de M-K los sondeos de la aplicación paraban, y aun así
 * `praxis-api` no se dormía nunca. Los logs de red de Railway lo enseñaron: cada
 * **300 s**, Redis manda un paquete de keepalive a cada conexión abierta y el
 * contenedor lo contesta. Es el `tcp-keepalive 300` que Redis trae por defecto
 * desde la 3.2. Esa respuesta es tráfico saliente, y Railway solo duerme un
 * servicio tras **10 minutos** sin él: con un paquete cada 5, nunca.
 *
 * En local no se ve: en Docker Desktop para Mac, el proxy de red de Docker se
 * interpone y los keepalives mueren ahí sin llegar al proceso. Por eso el
 * monolito midió 0 bytes en 11 minutos de reposo en local y en Railway no dormía.
 *
 * ## Por qué desde aquí
 *
 * `CONFIG SET` no sobrevive a un reinicio de Redis, pero **cada despertar de
 * Railway es un arranque de este proceso**, que lo vuelve a aplicar. Así no hay
 * que tocar el comando de arranque del servicio de Redis en Railway.
 *
 * El precio es que Redis tardará más en darse cuenta de un cliente muerto. Aquí
 * no importa: su único cliente es este proceso, y cuando muere se lleva todas
 * las conexiones con él.
 *
 * ⚠️ Si Railway no deja usar `CONFIG`, se avisa y se sigue. El backend funciona
 * igual; solo que no se dormirá.
 */
export async function quitarSondeoDeRedis(url: string | undefined): Promise<void> {
  if (!url) return;
  const cliente = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  cliente.on('error', () => {
    /* El fallo se cuenta abajo; sin este oyente, ioredis lo tira al log como
       «Unhandled error event». */
  });
  try {
    await cliente.connect();
    await cliente.config('SET', 'tcp-keepalive', '0');
    console.log('[monolito] Redis sin tcp-keepalive: Railway puede dormir el servicio en reposo');
  } catch (error) {
    console.warn(
      `[monolito] no se pudo quitar el tcp-keepalive de Redis (${(error as Error).message}): ` +
        'el backend funciona igual, pero Railway no podrá dormirlo',
    );
  } finally {
    cliente.disconnect();
  }
}
