import { Injectable } from '@nestjs/common';

/** La fila tal cual sale de la consulta de `canal()`. */
interface CanalCrudo {
  id: string;
  kind: 'PROJECT' | 'DIRECT';
  directUserA: string | null;
  directUserB: string | null;
  projectId: string | null;
  projectName: string | null;
  projectSlug: string | null;
  miembros: string[];
  callados: string[];
}

/** Lo mismo, ya en la forma que usa el reparto. */
interface CanalParaRepartir {
  id: string;
  kind: 'PROJECT' | 'DIRECT';
  directUserA: string | null;
  directUserB: string | null;
  project: { id: string; name: string | null; slug: string | null } | null;
  /** El equipo del proyecto. Vacío en un canal privado. */
  miembros: string[];
  /** Quiénes lo tienen silenciado, ya como conjunto. */
  callados: Set<string>;
}
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { type ContextoDeCanal, type EventoEnVivo, canalDeEventos } from './eventos';

/**
 * Quién debe enterarse de lo que pasa en un canal, y el reparto del evento.
 *
 * ## Por qué existe como servicio aparte
 *
 * Cada operación del chat —enviar, editar, borrar, reaccionar, fijar, leer—
 * tiene que avisar a **la misma lista de gente**, resuelta de la misma forma.
 * Antes solo avisaba `send`, con la lista construida a mano dentro de
 * `notifyOthers`; las otras cinco no avisaban de nada, y por eso una edición o
 * un borrado no se veían en el otro extremo hasta recargar.
 *
 * Teniéndolo en un sitio, añadir un evento nuevo es una línea y no volver a
 * escribir la consulta de destinatarios. Y sobre todo: **la lista de
 * destinatarios se calcula aquí, desde la base, nunca desde la petición**. Eso
 * es una decisión de seguridad — el nombre del canal de Redis es lo único que
 * separa la conexión de una persona de la de otra.
 */
@Injectable()
export class PublicadorDeEventos {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Todo lo que hace falta para repartir un evento, en **una** sentencia.
   *
   * ## Qué había antes
   *
   * Cuatro viajes a la base por cada evento —el canal, su proyecto, los miembros
   * del proyecto y quién lo tiene silenciado—, o sea cuatro por **cada mensaje**
   * del chat de un equipo. Y por cada edición, cada borrado, cada reacción y
   * cada marca de lectura.
   *
   * ## Por qué SQL crudo y no relaciones anidadas
   *
   * ⚠️ **Porque `select` anidado de Prisma no genera un `JOIN`.** Emite **una
   * consulta por relación** y las cose en memoria, así que escribir esto como un
   * `findUnique` con `project: { select: { members } }` y `states` daba
   * exactamente las mismas cuatro sentencias, solo que con mejor pinta.
   * Comprobado con `log_statement='all'` en Postgres, no supuesto — un intento
   * anterior dio por hecho el `JOIN` y estaba equivocado.
   *
   * Prisma 6 sí sabe hacerlo con `relationLoadStrategy: 'join'`, pero eso exige
   * el preview `relationJoins` en el generador y **regenerar el cliente**, que
   * en este repositorio es la operación delicada de siempre (ver CLAUDE.md: con
   * los vigilantes en marcha deja `dist` a medias). Para una consulta se paga
   * más de lo que vale.
   *
   * Los `LATERAL` agregan cada lista a un array en la propia base, así que no
   * hay multiplicación de filas: sale **una fila** con todo dentro.
   *
   * ## Por qué no una caché, que era lo que proponía el plan
   *
   * El plan decía cachear el canal y sus miembros con 30 s de vida, y esa
   * segunda mitad es un agujero: durante esa ventana, alguien a quien acaban de
   * **sacar** de un proyecto seguiría recibiendo los mensajes del equipo. La
   * lista de destinatarios es lo único que separa una conversación de otra, así
   * que no puede ir con retraso. Y cachear solo el canal no compensaba: es un
   * acceso por clave primaria, y a cambio traía caducidad, invalidación al
   * renombrar un proyecto —el `slug` viaja en el evento y se regenera— y un modo
   * de fallo nuevo. Esto quita los cuatro viajes **sin** nada de eso.
   */
  private async canal(channelId: string): Promise<CanalParaRepartir | null> {
    const [fila] = await this.prisma.$queryRaw<CanalCrudo[]>`
      SELECT
        c."id",
        c."kind"::text AS kind,
        c."directUserA",
        c."directUserB",
        p."id"   AS "projectId",
        p."name" AS "projectName",
        p."slug" AS "projectSlug",
        COALESCE(m.miembros, ARRAY[]::text[]) AS miembros,
        COALESCE(s.callados, ARRAY[]::text[]) AS callados
      FROM "projects"."chat_channels" c
      LEFT JOIN "projects"."projects" p ON p."id" = c."projectId"
      LEFT JOIN LATERAL (
        SELECT array_agg(pm."userId") AS miembros
        FROM "projects"."project_members" pm
        WHERE pm."projectId" = c."projectId"
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT array_agg(st."userId") AS callados
        FROM "projects"."chat_channel_states" st
        WHERE st."channelId" = c."id" AND st."mutedAt" IS NOT NULL
      ) s ON true
      WHERE c."id" = ${channelId}
    `;

    if (!fila) return null;

    return {
      id: fila.id,
      kind: fila.kind,
      directUserA: fila.directUserA,
      directUserB: fila.directUserB,
      project: fila.projectId
        ? { id: fila.projectId, name: fila.projectName, slug: fila.projectSlug }
        : null,
      miembros: fila.miembros,
      callados: new Set(fila.callados),
    };
  }

  /**
   * Quién está en un canal.
   *
   * En uno privado son sus dos extremos; en uno de proyecto, el equipo entero.
   *
   * ⚠️ **Incluye a quien provocó el evento**, y eso es deliberado. La misma
   * persona puede tener el chat abierto en dos pestañas y en el móvil: si el
   * autor no recibiera su propio eco, esas otras sesiones no verían su mensaje
   * hasta recargar. Que no suene ni salga tarjeta lo decide el cliente
   * comparando `actorId` con quien es — es un asunto de presentación, no de
   * reparto.
   */
  private participantes(canal: CanalParaRepartir): string[] {
    if (canal.kind === 'DIRECT') {
      return [canal.directUserA, canal.directUserB].filter((id): id is string => Boolean(id));
    }

    /* Ya vienen con el canal: ver la nota de `canal()`. Esto dejó de ser una
       consulta y pasó a ser leer un campo. */
    return canal.project ? canal.miembros : [];
  }

  /**
   * Reparte un evento de chat a todos los participantes del canal.
   *
   * `construir` recibe el contexto **ya resuelto para ese destinatario** —con su
   * `peerId` y si lo tiene silenciado— y devuelve el evento que le toca. Es una
   * función y no un objeto fijo porque `peerId` y `silenciado` son distintos
   * para cada persona, y calcularlos fuera obligaría a cada emisor a repetir esa
   * lógica.
   *
   * ⚠️ **Nunca lanza y nunca se espera.** Publicar es un extra sobre algo que ya
   * está guardado en la base: que Redis esté caído degrada el tiempo real y no
   * puede tumbar el envío de un mensaje, que es lo que de verdad importa. Quien
   * llama lo hace con `void`.
   */
  async repartir(
    channelId: string,
    construir: (
      contexto: ContextoDeCanal & { destinatario: string; silenciado: boolean },
    ) => EventoEnVivo,
  ): Promise<void> {
    try {
      const canal = await this.canal(channelId);
      if (!canal) return;

      const destinatarios = this.participantes(canal);
      if (destinatarios.length === 0) return;

      /* Quién lo tiene silenciado llega con el canal, ya filtrado y agregado por
         la base: ver la nota de `canal()`. Era una consulta aparte. */
      for (const destinatario of destinatarios) {
        const evento = construir({
          destinatario,
          silenciado: canal.callados.has(destinatario),
          channelKind: canal.kind,
          projectId: canal.project?.id ?? null,
          projectName: canal.project?.name ?? null,
          projectSlug: canal.project?.slug ?? null,
          /* La «otra persona» vista desde este destinatario. En un canal de
             proyecto no hay interlocutor y va nulo. */
          peerId:
            canal.kind === 'DIRECT'
              ? ((canal.directUserA === destinatario ? canal.directUserB : canal.directUserA) ??
                null)
              : null,
        });

        /**
         * ⚠️ **`mio` lo pone el servidor, no lo deduce el cliente.**
         *
         * Cada superficie del navegador necesita saber si el evento lo provocó
         * quien lo está recibiendo: es lo que decide si suena, si sale tarjeta y
         * si el contador de no leídos sube. Dejar esa comparación en el cliente
         * significa repetir `actorId === currentUserId` en cinco sitios, y
         * bastaba con equivocarse en uno para que alguien se anunciara a sí
         * mismo — o peor, para que no se enterara de lo ajeno.
         *
         * Aquí se sabe con certeza porque el evento **se construye por
         * destinatario**, así que se calcula una vez y viaja resuelto.
         */
        /**
         * ⚠️ **El `.catch()` no sobra aunque `RedisService.publish` ya trague.**
         *
         * Esto no se espera —no hay motivo para que un mensaje tarde más porque
         * haya veinte destinatarios—, y una promesa que se rechaza sin que nadie
         * la escuche es un `unhandledRejection`, que **mata el proceso** en Node
         * desde la v15. El `try` de abajo no lo cubre: para cuando el rechazo
         * ocurre, la función ya salió de él.
         *
         * Que hoy no pueda pasar depende de que `publish` siga tragando sus
         * errores, y eso es una invariante de otro archivo: el día que alguien la
         * quite —con toda la razón, porque un servicio que se traga los fallos es
         * discutible— el síntoma sería el servicio de proyectos cayéndose entero
         * porque Redis parpadeó. Una línea aquí lo desacopla.
         */
        this.redis
          .publish(canalDeEventos(destinatario), {
            ...evento,
            mio: 'actorId' in evento && evento.actorId === destinatario,
          })
          .catch(() => undefined);
      }
    } catch {
      /* Un fallo repartiendo no puede propagarse: el dato ya está guardado y se
         verá al recargar. El tiempo real es una capa encima de la bandeja, no su
         sustituto. */
    }
  }

  /** Publica un evento ya construido a una sola persona. Para los avisos de bandeja. */
  async aUnaPersona(userId: string, evento: EventoEnVivo): Promise<void> {
    await this.redis.publish(canalDeEventos(userId), evento);
  }
}
