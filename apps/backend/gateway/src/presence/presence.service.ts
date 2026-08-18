import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

/**
 * Los estados que puede elegir una persona. Espejo de `UserPresence` en el
 * esquema de credentials y de `USER_PRESENCES` en `@praxis/contracts`.
 */
export type Presence = 'AVAILABLE' | 'BUSY' | 'IN_MEETING' | 'EATING' | 'AWAY' | 'DO_NOT_DISTURB';

/**
 * Cuánto vive la marca de «tiene una conexión abierta».
 *
 * Tres latidos del flujo SSE (25 s cada uno). No es el mecanismo principal para
 * detectar que alguien se ha ido —de eso se encarga el cierre del propio flujo,
 * ver más abajo— sino **la red de seguridad para cuando el que se cae es el
 * gateway**: si el proceso muere sin ejecutar sus limpiezas, estas claves
 * caducan solas y nadie se queda «Disponible» para siempre.
 *
 * Tres y no dos: con dos, un latido perdido por congestión de red bastaría para
 * marcar como ausente a alguien que está delante de la pantalla.
 */
const VIGENCIA_S = 75;

/** Prefijo de las claves. Una por persona conectada. */
const CLAVE = 'presencia:conectado:';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private cliente!: Redis;

  constructor(
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  onModuleInit() {
    /**
     * ⚠️ **Un cliente de Redis propio, y no el de
     * `NotificationsStreamService`.** Aquel está en modo suscriptor, y un
     * cliente suscrito **no puede ejecutar ningún otro comando**: ni `SET`, ni
     * `GET`, ni `PUBLISH`. Reutilizarlo daría un error en tiempo de ejecución
     * que además solo aparecería al conectarse el primer usuario.
     */
    this.cliente = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    this.cliente.on('error', (error) => {
      /* Redis caído degrada la presencia, no la aplicación: sin él nadie
         aparece conectado, que es el valor seguro. Por eso es un aviso. */
      this.logger.warn(`Redis no disponible para la presencia: ${error.message}`);
    });
  }

  onModuleDestroy() {
    this.cliente?.disconnect();
  }

  /**
   * Marca a alguien como conectado y refresca la vigencia.
   *
   * Se llama al abrirse un flujo SSE **y en cada latido**. Que sea la misma
   * operación en los dos casos es lo que hace que varias pestañas no necesiten
   * contarse: cualquiera de ellas mantiene viva la clave, y cuando se cierra la
   * última deja de refrescarse.
   */
  async marcarVivo(userId: string): Promise<void> {
    await this.cliente.set(`${CLAVE}${userId}`, '1', 'EX', VIGENCIA_S).catch(() => undefined);
  }

  /**
   * Retira la marca. Se llama cuando se cierra **la última** conexión.
   *
   * ⚠️ Es lo que hace que la desconexión sea inmediata en el caso normal, en vez
   * de esperar a que caduque la clave. El caso «sucio» —se va la luz, se cae la
   * red— también lo cubre el cierre del flujo: el gateway escribe un latido cada
   * 25 s, la escritura falla sobre un socket muerto y el flujo se cierra solo.
   * La caducidad solo hace falta si el que muere es el gateway.
   */
  async marcarIdo(userId: string): Promise<void> {
    await this.cliente.del(`${CLAVE}${userId}`).catch(() => undefined);
  }

  /** ¿Tiene alguna conexión abierta ahora mismo? */
  async estaConectado(userId: string): Promise<boolean> {
    const valor = await this.cliente.get(`${CLAVE}${userId}`).catch(() => null);
    return valor !== null;
  }

  /**
   * Lo mismo para varios, en **una** ida y vuelta.
   *
   * `MGET` y no un `GET` por persona: esto se llama al resolver cualquier lista
   * de usuarios —el equipo de un proyecto, la columna de conversaciones— y una
   * consulta por fila sería el mismo N+1 que ya se quitó en las peticiones HTTP.
   */
  async conectados(userIds: string[]): Promise<Set<string>> {
    const unicos = [...new Set(userIds)].filter(Boolean);
    if (unicos.length === 0) return new Set();

    const valores = await this.cliente
      .mget(unicos.map((id) => `${CLAVE}${id}`))
      .catch(() => [] as (string | null)[]);

    const vivos = new Set<string>();
    unicos.forEach((id, indice) => {
      if (valores[indice] !== null && valores[indice] !== undefined) vivos.add(id);
    });
    return vivos;
  }

  /**
   * La presencia que se le enseña al resto, cruzando las dos mitades.
   *
   * ## Por qué son dos y no una
   *
   * `User.presence` en la base es **lo que la persona eligió**, y por sí solo
   * miente: era front-driven —el navegador avisaba al cerrar la pestaña— así que
   * si se iba la conexión, se acababa la batería o el navegador se caía, ese
   * aviso no llegaba nunca y la cuenta se quedaba «Disponible» **para siempre**.
   * Usuarios fantasma.
   *
   * La otra mitad es un hecho que solo conoce el servidor: si hay un flujo
   * abierto. Con las dos:
   *
   * | Conexión | Elegido | Se enseña |
   * |---|---|---|
   * | no | lo que sea | `AWAY` |
   * | sí | `AWAY` (o sea, nada elegido) | `AVAILABLE` |
   * | sí | `BUSY`, `IN_MEETING`, `EATING`, `DO_NOT_DISTURB` | lo elegido |
   *
   * La segunda fila es la que hace que no haya que marcarse «Disponible» al
   * llegar: `AWAY` es el valor por defecto de la columna y el selector ni
   * siquiera lo ofrece, así que en la base significa «no he elegido nada».
   *
   * La tercera es la que respeta la intención: quien se puso «No molestar» sigue
   * en «No molestar» mientras esté conectado, por mucho que esté tecleando.
   */
  efectiva(elegida: string | null | undefined, conectado: boolean): Presence {
    if (!conectado) return 'AWAY';
    if (!elegida || elegida === 'AWAY') return 'AVAILABLE';
    return elegida as Presence;
  }

  /**
   * Anuncia un cambio de presencia a quien le importa.
   *
   * ## A quién, y por qué no a todo el mundo
   *
   * Solo a **quien comparte algún proyecto contigo**, que es exactamente la
   * misma regla que decide con quién puedes hablar. Difundirlo a toda la
   * plataforma convertiría la presencia en un directorio de quién está
   * conectado en cada momento, que es justo el dato que una herramienta de
   * trabajo no debe regalar.
   *
   * ## Y por qué se puede permitir preguntar quiénes son
   *
   * Porque esto se dispara al **conectarse, desconectarse o cambiar de estado a
   * mano**: unas pocas veces por sesión, no por mensaje. Un mensaje de chat no
   * pasa por aquí.
   *
   * ⚠️ **Nunca lanza.** Que no se pueda anunciar un cambio de presencia no puede
   * tumbar la conexión que lo provocó: el dato se recalcula en la siguiente
   * lectura de cualquier lista de usuarios, así que lo peor que pasa es que un
   * punto de color tarde en cambiar de tono.
   */
  async anunciar(userId: string, presencia: Presence): Promise<void> {
    try {
      /* `chat_peer_ids` y no `chat_contacts`: aquel devuelve por cada persona
         todos los proyectos en común con su nombre, su slug y su rol, y de todo
         eso aquí se usaba **una columna**. Ver `idsDeContactos` en
         projects-service. */
      const contactos = await firstValueFrom(
        this.projectsClient.send<string[]>({ cmd: 'chat_peer_ids' }, { userId }).pipe(timeout(2000)),
      );

      const at = new Date().toISOString();

      /**
       * También a uno mismo, y marcado como propio.
       *
       * ⚠️ **`mio` lo resuelve el servidor**, igual que en los eventos de chat, y
       * aquí evita un problema concreto: el selector de estado de la barra
       * lateral necesita saber si un cambio de presencia le incumbe, y **no
       * conoce el id de quien tiene delante** —le llega solo el valor—. Sin este
       * campo habría que enhebrar el `userId` por las seis zonas hasta el
       * armazón para una comparación que aquí es una línea.
       */
      for (const destinatario of [userId, ...(contactos ?? [])]) {
        /* ⚠️ El `.catch()` no sobra: esto **no se espera**, así que un rechazo
           de `publish` cae fuera del `try` de esta función y llega a
           `unhandledRejection`, que en Node mata el proceso. Sería el gateway
           entero cayéndose porque Redis parpadeó mientras alguien cambiaba de
           estado. El mismo caso que en `EventDispatcher.repartir`. */
        this.cliente
          .publish(
            `avisos:${destinatario}`,
            JSON.stringify({
              tipo: 'presencia',
              userId,
              presencia,
              at,
              mio: destinatario === userId,
            }),
          )
          .catch(() => undefined);
      }
    } catch {
      /* Ver la nota de arriba. */
    }
  }

  /** La presencia elegida de alguien, tal como está guardada. `null` si no se pudo. */
  async elegidaDe(userId: string): Promise<string | null> {
    try {
      const perfil = await firstValueFrom(
        this.credentialsClient
          .send<{ presence?: string | null } | null>({ cmd: 'user_find_one' }, { id: userId })
          .pipe(timeout(2000)),
      );
      return perfil?.presence ?? null;
    } catch {
      return null;
    }
  }
}
