import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';

/** Lo que viaja por el canal. Lo justo para pintar el aviso emergente. */
export interface AvisoEnVivo {
  type: string;
  actorId: string | null;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
}

/**
 * El patrón al que se suscribe el gateway. Espejo de `canalDeAvisos()` en
 * projects-service: si allí cambia el prefijo, aquí deja de llegar nada.
 */
const PATRON_DE_CANALES = 'avisos:*';

/**
 * Reparte los avisos que publica projects-service a los navegadores conectados.
 *
 * projects-service publica en `avisos:<userId>` cuando crea una notificación.
 * Aquí hay **una sola** conexión de Redis en modo suscriptor para todo el
 * proceso, escuchando el patrón, y un `Subject` por persona con una pestaña
 * abierta.
 *
 * ⚠️ Una conexión compartida y no una por usuario conectado. En modo suscriptor
 * un cliente de Redis no puede ejecutar ningún otro comando, así que la
 * alternativa era abrir un socket a Redis por cada pestaña de cada persona. Con
 * `psubscribe` el coste es constante y el reparto se hace en memoria.
 *
 * ⚠️ **El aislamiento lo da el nombre del canal, no un filtro nuestro.** El
 * `userId` se extrae del canal por el que llegó el mensaje, no del contenido:
 * un emisor que se equivocara al rellenar el cuerpo no puede colar un aviso en
 * la conexión de otra persona.
 */
@Injectable()
export class NotificationsStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsStreamService.name);
  private suscriptor!: Redis;

  /**
   * Oyentes por usuario. Un `Set` porque la misma persona puede tener varias
   * pestañas, y las dos tienen que recibir el aviso.
   */
  private readonly oyentes = new Map<string, Set<Subject<AvisoEnVivo>>>();

  onModuleInit() {
    this.suscriptor = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      /* Sin esto, ioredis encola los comandos mientras no hay conexión y el
         `psubscribe` de abajo se queda esperando en silencio a que Redis
         aparezca. Preferimos que falle y se reintente. */
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
    });

    this.suscriptor.on('error', (error) => {
      /* Redis caído degrada el tiempo real, no la aplicación: la bandeja sigue
         funcionando por HTTP. Por eso es un aviso y no un fallo de arranque. */
      this.logger.warn(`Redis no disponible para avisos en vivo: ${error.message}`);
    });

    this.suscriptor.on('ready', () => {
      this.suscriptor
        .psubscribe(PATRON_DE_CANALES)
        .catch((error: Error) =>
          this.logger.warn(`No se pudo suscribir a los avisos: ${error.message}`),
        );
    });

    this.suscriptor.on('pmessage', (_patron: string, canal: string, carga: string) => {
      const userId = canal.slice(canal.indexOf(':') + 1);
      const destinatarios = this.oyentes.get(userId);
      if (!destinatarios?.size) return;

      let aviso: AvisoEnVivo;
      try {
        aviso = JSON.parse(carga) as AvisoEnVivo;
      } catch {
        this.logger.warn(`Aviso ilegible en ${canal}`);
        return;
      }

      for (const destinatario of destinatarios) destinatario.next(aviso);
    });
  }

  onModuleDestroy() {
    for (const destinatarios of this.oyentes.values()) {
      for (const destinatario of destinatarios) destinatario.complete();
    }
    this.oyentes.clear();
    this.suscriptor?.disconnect();
  }

  /**
   * El flujo de avisos de una persona.
   *
   * Se limpia solo: cuando el navegador cierra la conexión, RxJS ejecuta la
   * función de retorno del `Observable` y el oyente se da de baja. Sin eso,
   * cada recarga de página dejaría un `Subject` vivo para siempre.
   */
  suscribir(userId: string): Observable<AvisoEnVivo> {
    return new Observable<AvisoEnVivo>((observador) => {
      const canal = new Subject<AvisoEnVivo>();
      const suscripcion = canal.subscribe(observador);

      const destinatarios = this.oyentes.get(userId) ?? new Set<Subject<AvisoEnVivo>>();
      destinatarios.add(canal);
      this.oyentes.set(userId, destinatarios);

      return () => {
        suscripcion.unsubscribe();
        canal.complete();

        const actuales = this.oyentes.get(userId);
        if (!actuales) return;
        actuales.delete(canal);
        /* Sin pestañas abiertas no se deja la entrada vacía: sería una fuga
           lenta, una clave por cada persona que haya entrado alguna vez. */
        if (actuales.size === 0) this.oyentes.delete(userId);
      };
    });
  }
}
