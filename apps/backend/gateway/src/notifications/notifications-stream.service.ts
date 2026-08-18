import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { PresenceService } from '../presence/presence.service';

/**
 * Lo que viaja por el canal, ya con el nombre del actor puesto.
 *
 * ⚠️ **Es un sobre con `tipo` en la raíz y el gateway no lo interpreta.** Por
 * aquí pasan avisos de bandeja, mensajes de chat, ediciones, borrados,
 * reacciones, fijados y marcas de lectura; el gateway solo reparte y añade el
 * nombre. El contrato de verdad —qué campos lleva cada `tipo`— vive en
 * `projects-service/src/realtime/events.ts`, con su espejo en el frontend.
 *
 * Tiparlo aquí como una unión cerrada obligaría a tocar el gateway cada vez que
 * projects-service estrenara un evento, para un servicio que **no lee el
 * contenido**. Se tipa lo que sí toca —`tipo`, `actorId`— y el resto pasa.
 */
export interface LiveEvent {
  tipo: string;
  actorId?: string | null;
  [clave: string]: unknown;
  /**
   * El nombre de quien lo provocó, resuelto **aquí** y no por el emisor.
   *
   * projects-service publica solo el `actorId` porque no conoce a los usuarios:
   * viven en credentials-service, en otro esquema y bajo otro dueño. Hacer que
   * los resolviera él añadiría un salto de red **por cada mensaje de chat**, que
   * es el evento más frecuente de todo el sistema.
   *
   * El gateway sí sabe hacerlo —ya cruza `userId` con nombres para el asistente—
   * y además es el último punto por el que pasa el evento antes del navegador. Se
   * resuelve una vez por persona y se guarda en memoria: un chat activo entre
   * cinco personas son cinco consultas en toda la sesión, no una por mensaje.
   *
   * `null` cuando no se pudo resolver o cuando el evento no tiene actor. La
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
 * El canal de una persona. Espejo de `liveEventChannel()` en projects-service: si
 * allí cambia el prefijo, aquí deja de llegar nada.
 */
function canalDe(userId: string): string {
  return `avisos:${userId}`;
}

/**
 * Reparte los avisos que publica projects-service a los navegadores conectados.
 *
 * projects-service publica en `avisos:<userId>` cuando pasa algo. Aquí hay **una
 * sola** conexión de Redis en modo suscriptor para todo el proceso, y un
 * `Subject` por pestaña abierta.
 *
 * ⚠️ **Una conexión compartida, pero suscrita canal a canal.** En modo
 * suscriptor un cliente de Redis no puede ejecutar ningún otro comando, de ahí
 * que la conexión sea aparte y única. Lo que **no** se sigue de eso es que haya
 * que suscribirse al patrón entero: una sola conexión admite miles de canales,
 * así que se abre `avisos:<userId>` con la primera pestaña de esa persona y se
 * cierra con la última.
 *
 * Esto era un `psubscribe('avisos:*')`, que hacía que **cada instancia del
 * gateway recibiera cada evento de cada usuario** para descartar los ajenos: el
 * tráfico de pub/sub se multiplicaba por el número de instancias. Con canal por
 * usuario, cada instancia recibe solo lo de su gente, y añadir instancias deja
 * de encarecer a las demás.
 *
 * ⚠️ **El aislamiento lo da el nombre del canal, no un filtro nuestro.** El
 * `userId` se extrae del canal por el que llegó el mensaje, no del contenido:
 * un emisor que se equivocara al rellenar el cuerpo no puede colar un aviso en
 * la conexión de otra persona. Ahora, además, ni siquiera llega: sin
 * suscripción no hay entrega.
 */
@Injectable()
export class NotificationsStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsStreamService.name);
  private suscriptor!: Redis;

  /**
   * Oyentes por usuario. Un `Set` porque la misma persona puede tener varias
   * pestañas, y las dos tienen que recibir el aviso.
   */
  private readonly oyentes = new Map<string, Set<Subject<LiveEvent>>>();

  /**
   * `userId` → nombre, con caducidad.
   *
   * En memoria del proceso y no en Redis a propósito: es una caché de
   * conveniencia sobre un dato público, y meterla en Redis costaría una ida y
   * vuelta por aviso, que es exactamente lo que se está evitando. Se pierde al
   * reiniciar y no pasa nada.
   */
  private readonly nombres = new Map<string, { nombre: string; hasta: number }>();

  /**
   * Tope de flujos simultáneos por cuenta.
   *
   * ⚠️ **Se lee aquí y no en una constante del módulo**, que es la trampa 17 de
   * CLAUDE.md: `ConfigModule.forRoot()` carga el `.env` al **inicializar**, y
   * los `import` se evalúan antes. Un `process.env.X` arriba del archivo no ve
   * el `.env` — no falla, coge el valor por defecto en silencio, que es peor.
   */
  private readonly maxConexiones: number;

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    private readonly presencia: PresenceService,
    config: ConfigService,
  ) {
    this.maxConexiones = config.get<number>('SSE_MAX_CONEXIONES_POR_CUENTA', 10);
  }

  /**
   * ¿Le queda cupo de conexiones en vivo a esta cuenta?
   *
   * ## Por qué hace falta un tope
   *
   * Cada flujo abierto es un socket sostenido contra el gateway, un `Subject`
   * en memoria y un latido cada 25 s **para siempre**. Sin tope, cien pestañas
   * son cien conexiones, y no hace falta mala fe: basta con dejar el portátil
   * con sesiones abiertas. Es una denegación de servicio trivial contra uno
   * mismo y, compartiendo proceso, contra los demás.
   *
   * ## Por qué se rechaza la nueva y no se cierra la vieja
   *
   * Cerrar la más antigua parece más amable —tu pestaña actual funciona— pero
   * entra en bucle: `EventSource` **reconecta solo** cuando el flujo se corta,
   * así que la pestaña desalojada volvería inmediatamente, desalojando a la
   * siguiente. Un tope implementado así es una tormenta de reconexiones.
   *
   * Rechazar antes de abrir no tiene ese problema, y es por una regla del
   * propio `EventSource`: ante una respuesta que **no** es 200 con
   * `text/event-stream`, el navegador da la conexión por fallida y **no
   * reintenta**. Por eso la comprobación vive aquí y la responde el controlador
   * con un 429, en vez de dentro del `Observable`.
   *
   * ⚠️ Hay una carrera si dos pestañas abren a la vez: las dos pueden ver hueco
   * y pasar. Está asumido — el desvío es de una conexión, no de cien, y cerrarla
   * exigiría un candado por cuenta para defenderse de un caso que no es el
   * ataque.
   */
  hayCupo(userId: string): boolean {
    return (this.oyentes.get(userId)?.size ?? 0) < this.maxConexiones;
  }

  /** Cuántas conexiones tiene abiertas ahora mismo. Para el mensaje de error. */
  conexionesDe(userId: string): number {
    return this.oyentes.get(userId)?.size ?? 0;
  }

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

    /**
     * Al (re)conectar, volver a suscribirse a lo que haya abierto ahora mismo.
     *
     * ioredis ya reemite sus suscripciones al reconectar, pero esto cubre el
     * hueco que no cubre: las conexiones que se abrieron **mientras Redis estaba
     * caído**. Con `enableOfflineQueue: false` esos `SUBSCRIBE` fallaron y nadie
     * los reintentaría; sin esto, esas personas se quedarían sin tiempo real
     * hasta recargar, y en silencio.
     */
    this.suscriptor.on('ready', () => {
      const canales = [...this.oyentes.keys()].map(canalDe);
      if (canales.length === 0) return;
      this.suscriptor
        .subscribe(...canales)
        .catch((error: Error) =>
          this.logger.warn(`No se pudo resuscribir a los avisos: ${error.message}`),
        );
    });

    this.suscriptor.on('message', (canal: string, carga: string) => {
      const userId = canal.slice(canal.indexOf(':') + 1);
      const destinatarios = this.oyentes.get(userId);
      if (!destinatarios?.size) return;

      let evento: LiveEvent;
      try {
        evento = JSON.parse(carga) as LiveEvent;
      } catch {
        this.logger.warn(`Evento ilegible en ${canal}`);
        return;
      }

      /**
       * El nombre se resuelve aparte y el evento sale igual si falla o si tarda.
       *
       * ⚠️ **Solo se resuelve para lo que lo va a enseñar.** Una marca de
       * lectura o una reacción no escriben el nombre de nadie en pantalla, y
       * pedirlo igualmente era una llamada TCP a credentials por cada tecla que
       * alguien pulsara en un chat activo. Con la caché de diez minutos casi
       * siempre acierta, pero «casi siempre» multiplicado por el evento más
       * frecuente del sistema no es un buen trato.
       */
      const necesitaNombre = evento.tipo === 'aviso' || evento.tipo === 'chat.mensaje';
      if (!necesitaNombre) {
        for (const destinatario of destinatarios) destinatario.next(evento);
        return;
      }

      /**
       * ⚠️ **El `.catch()` no sobra aunque `conNombre` no lance.**
       *
       * Lo que puede rechazar no es la promesa de arriba, es el `.then`: repartir
       * a los oyentes llama a `next()` sobre cada `Subject`, y un `Subject` con
       * un suscriptor que lanza propaga la excepción hacia fuera. Como esto no
       * se espera, ese rechazo llega a `unhandledRejection`, que en Node **mata
       * el proceso** — o sea que un oyente con un fallo se llevaba por delante el
       * gateway entero, y con él el flujo de todo el mundo.
       *
       * Que hoy no pueda pasar depende de que `conNombre` siga sin lanzar, y eso
       * es una invariante de la función de abajo. Una línea aquí lo desacopla.
       */
      this.conNombre(evento)
        .then((completo) => {
          for (const destinatario of destinatarios) destinatario.next(completo);
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `No se pudo repartir un evento de ${canal}: ${(error as Error).message}`,
          ),
        );
    });
  }

  /**
   * El aviso con el nombre de quien lo provocó, si se puede saber.
   *
   * Nunca lanza: cualquier fallo devuelve el aviso tal cual. La alternativa
   * —dejar caer el aviso porque no se pudo poner un nombre— convertiría una
   * degradación cosmética en una pérdida de información.
   */
  private async conNombre(evento: LiveEvent): Promise<LiveEvent> {
    if (!evento.actorId) return evento;

    const guardado = this.nombres.get(evento.actorId);
    if (guardado && guardado.hasta > Date.now()) {
      return { ...evento, actorName: guardado.nombre };
    }

    try {
      const perfil = await firstValueFrom(
        this.credentialsClient
          .send<{ firstName?: string | null; lastName?: string | null } | null>(
            { cmd: 'user_find_one' },
            { id: evento.actorId },
          )
          /* Sin tope, un credentials-service lento congelaría el aviso —y con él
             el sonido y la tarjeta— hasta que la petición cayera por su cuenta. */
          .pipe(timeout(1500)),
      );

      const nombre = [perfil?.firstName, perfil?.lastName].filter(Boolean).join(' ').trim();
      if (!nombre) return evento;

      this.nombres.set(evento.actorId, {
        nombre,
        hasta: Date.now() + CADUCIDAD_DEL_NOMBRE_MS,
      });
      return { ...evento, actorName: nombre };
    } catch {
      return evento;
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
  suscribir(userId: string): Observable<LiveEvent> {
    return new Observable<LiveEvent>((observador) => {
      const canal = new Subject<LiveEvent>();
      const suscripcion = canal.subscribe(observador);

      const destinatarios = this.oyentes.get(userId) ?? new Set<Subject<LiveEvent>>();
      const eraLaPrimera = destinatarios.size === 0;
      destinatarios.add(canal);
      this.oyentes.set(userId, destinatarios);

      /**
       * La primera pestaña de esta persona abre su canal en Redis.
       *
       * ⚠️ **Antes esto era un `psubscribe('avisos:*')` global**, y funcionaba —
       * pero significaba que **cada instancia del gateway recibía cada evento de
       * cada usuario** de toda la plataforma, para descartar los que no le
       * tocaban. Con tres instancias, el tráfico de pub/sub se multiplicaba por
       * tres; con veinte, por veinte. Era el techo de escalado horizontal del
       * tiempo real, y no daba ningún síntoma hasta chocar contra él.
       *
       * El comentario que lo defendía decía que la alternativa era «un socket a
       * Redis por cada pestaña». Es una falsa disyuntiva: una **sola** conexión
       * suscriptora admite miles de canales. Lo que cambia no es el número de
       * sockets —sigue siendo uno— sino a qué se suscribe.
       *
       * ⚠️ Se suscribe solo en la primera y se cancela solo en la última, no por
       * pestaña: `SUBSCRIBE` al mismo canal dos veces no acumula, así que un
       * `UNSUBSCRIBE` al cerrar cualquiera dejaría a las demás pestañas sordas.
       * Son los mismos dos puntos que ya marcan la presencia.
       */
      if (eraLaPrimera) {
        this.suscriptor
          .subscribe(canalDe(userId))
          .catch((error: Error) =>
            this.logger.warn(`No se pudo abrir el canal de ${userId}: ${error.message}`),
          );
      }

      /**
       * ⚠️ **Abrir este flujo *es* estar conectado.**
       *
       * La presencia era front-driven: el navegador avisaba al cerrar la
       * pestaña (`pagehide`) y con temporizadores de inactividad. Eso falla
       * exactamente cuando importa —se va la red, se acaba la batería, el
       * navegador se cae— y dejaba cuentas «Disponible» **para siempre**.
       *
       * Aquí no hace falta que el cliente coopere: si hay flujo, hay conexión.
       * Se anuncia solo en la **primera** pestaña; las demás refrescan la marca
       * con cada latido pero no vuelven a anunciar nada.
       */
      void this.presencia.marcarVivo(userId).then(async () => {
        if (!eraLaPrimera) return;
        const elegida = await this.presencia.elegidaDe(userId);
        void this.presencia.anunciar(userId, this.presencia.efectiva(elegida, true));
      });

      return () => {
        suscripcion.unsubscribe();
        canal.complete();

        const actuales = this.oyentes.get(userId);
        if (!actuales) return;
        actuales.delete(canal);
        /* Sin pestañas abiertas no se deja la entrada vacía: sería una fuga
           lenta, una clave por cada persona que haya entrado alguna vez. */
        if (actuales.size === 0) {
          this.oyentes.delete(userId);

          /* Se ha ido la última pestaña: se cierra su canal en Redis. Sin esto,
             el gateway seguiría recibiendo los eventos de todo el que haya
             entrado alguna vez desde que arrancó — la misma fuga que el
             `psubscribe` global, solo que creciendo poco a poco. */
          this.suscriptor
            .unsubscribe(canalDe(userId))
            .catch((error: Error) =>
              this.logger.warn(`No se pudo cerrar el canal de ${userId}: ${error.message}`),
            );
          /**
           * La última pestaña se ha ido: ausente, y se anuncia.
           *
           * ⚠️ **Esto cubre también las caídas sucias.** El gateway escribe un
           * latido cada 25 s; sobre un socket muerto esa escritura falla, Nest
           * cierra la petición y RxJS ejecuta esta función. O sea que un
           * portátil al que se le acaba la batería queda ausente en menos de
           * medio minuto, sin que su navegador haya avisado de nada.
           *
           * La caducidad de la clave en Redis es la red de seguridad para el
           * caso que esto no cubre: que el que se caiga sea el propio gateway.
           */
          void this.presencia.marcarIdo(userId);
          void this.presencia.anunciar(userId, 'AWAY');
        }
      };
    });
  }
}
