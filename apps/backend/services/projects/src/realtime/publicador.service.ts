import { Injectable } from '@nestjs/common';
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
   * Los datos del canal que hacen falta para repartir y para pintar la tarjeta.
   *
   * Se pide una vez por evento. Es una fila por `id` con dos relaciones
   * escalares: barato, y evita que cada emisor tenga que saber cómo se
   * distingue un canal de proyecto de uno privado.
   */
  private async canal(channelId: string) {
    return this.prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        kind: true,
        directUserA: true,
        directUserB: true,
        project: { select: { id: true, name: true, slug: true } },
      },
    });
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
  private participantes(canal: {
    kind: string;
    directUserA: string | null;
    directUserB: string | null;
    project: { id: string } | null;
  }): Promise<string[]> {
    if (canal.kind === 'DIRECT') {
      return Promise.resolve(
        [canal.directUserA, canal.directUserB].filter((id): id is string => Boolean(id)),
      );
    }

    if (!canal.project) return Promise.resolve([]);

    return this.prisma.projectMember
      .findMany({ where: { projectId: canal.project.id }, select: { userId: true } })
      .then((miembros) => miembros.map((miembro) => miembro.userId));
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

      const destinatarios = await this.participantes(canal);
      if (destinatarios.length === 0) return;

      /* Quién lo tiene silenciado, en **una** consulta para todos los
         destinatarios. Una por persona serían veinte viajes a la base por
         mensaje en el chat de un equipo. */
      const callados = new Set(
        (
          await this.prisma.chatChannelState.findMany({
            where: { channelId, userId: { in: destinatarios }, mutedAt: { not: null } },
            select: { userId: true },
          })
        ).map((estado) => estado.userId),
      );

      for (const destinatario of destinatarios) {
        const evento = construir({
          destinatario,
          silenciado: callados.has(destinatario),
          channelKind: canal.kind as 'PROJECT' | 'DIRECT',
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
