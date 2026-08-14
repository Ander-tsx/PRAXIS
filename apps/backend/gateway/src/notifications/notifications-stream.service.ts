import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

/** Lo que viaja por el canal. Lo justo para pintar el aviso emergente. */
export interface AvisoEnVivo {
  type: string;
  actorId: string | null;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  createdAt: string;
  /**
   * El nombre de quien lo provocó, resuelto **aquí** y no por el emisor.
   *
   * projects-service publica solo el `actorId` porque no conoce a los usuarios:
   * viven en credentials-service, en otro esquema y bajo otro dueño. Hacer que
   * los resolviera él añadiría un salto de red **por cada mensaje de chat**, que
   * es el evento más frecuente de todo el sistema.
   *
   * El gateway sí sabe hacerlo —ya cruza `userId` con nombres para el asistente—
   * y además es el último punto por el que pasa el aviso antes del navegador. Se
   * resuelve una vez por persona y se guarda en memoria: un chat activo entre
   * cinco personas son cinco consultas en toda la sesión, no una por mensaje.
   *
   * `null` cuando no se pudo resolver o cuando el aviso no tiene actor. La
   * pantalla ya sabe leerlo en impersonal, que es como se leía antes.
   */
  actorName?: string | null;
}

/**
 * Cuánto se recuerda un nombre.
 *
 * Diez minutos: lo suficiente para que una conversación entera no vuelva a
 * preguntar, y lo bastante poco para que un cambio de nombre se note sin tener
 * que reiniciar el gateway. No es una caché de datos sensibles —un nombre ya se
 * ve en cualquier listado— así que el riesgo de tenerlo viejo es cosmético.
 */
const CADUCIDAD_DEL_NOMBRE_MS = 10 * 60 * 1000;

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

  /**
   * `userId` → nombre, con caducidad.
   *
   * En memoria del proceso y no en Redis a propósito: es una caché de
   * conveniencia sobre un dato público, y meterla en Redis costaría una ida y
   * vuelta por aviso, que es exactamente lo que se está evitando. Se pierde al
   * reiniciar y no pasa nada.
   */
  private readonly nombres = new Map<string, { nombre: string; hasta: number }>();

  constructor(@Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy) {}

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

      /* El nombre se resuelve aparte y el aviso sale igual si falla o si tarda:
         un aviso que llega tarde por esperar un nombre es peor que uno que
         llega a tiempo en impersonal, que es como se leía hasta ahora. */
      void this.conNombre(aviso).then((completo) => {
        for (const destinatario of destinatarios) destinatario.next(completo);
      });
    });
  }

  /**
   * El aviso con el nombre de quien lo provocó, si se puede saber.
   *
   * Nunca lanza: cualquier fallo devuelve el aviso tal cual. La alternativa
   * —dejar caer el aviso porque no se pudo poner un nombre— convertiría una
   * degradación cosmética en una pérdida de información.
   */
  private async conNombre(aviso: AvisoEnVivo): Promise<AvisoEnVivo> {
    if (!aviso.actorId) return aviso;

    const guardado = this.nombres.get(aviso.actorId);
    if (guardado && guardado.hasta > Date.now()) {
      return { ...aviso, actorName: guardado.nombre };
    }

    try {
      const perfil = await firstValueFrom(
        this.credentialsClient
          .send<{ firstName?: string | null; lastName?: string | null } | null>(
            { cmd: 'user_find_one' },
            { id: aviso.actorId },
          )
          /* Sin tope, un credentials-service lento congelaría el aviso —y con él
             el sonido y la tarjeta— hasta que la petición cayera por su cuenta. */
          .pipe(timeout(1500)),
      );

      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      if (!nombre) return aviso;

      this.nombres.set(aviso.actorId, {
        nombre,
        hasta: Date.now() + CADUCIDAD_DEL_NOMBRE_MS,
      });
      return { ...aviso, actorName: nombre };
    } catch {
      return aviso;
    }
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
