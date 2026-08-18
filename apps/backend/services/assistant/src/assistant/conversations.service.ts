import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { MAX_HISTORIAL } from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';

/** Lo que cabe en un título antes de dejar de leerse de un vistazo. */
const MAX_TITULO = 60;

/**
 * Las conversaciones guardadas del asistente.
 *
 * ## La regla de acceso
 *
 * **Una conversación es de quien la escribió.** `canViewReports` es un permiso
 * del proyecto, así que por sí solo dejaría a cualquier compañero con ese rol
 * leer estos hilos — y lo que alguien le escribe a un asistente no es un dato
 * del proyecto, es suyo.
 *
 * Por eso **todos** los métodos que tocan una conversación reciben `userId` y
 * lo comprueban, y ninguno acepta un `conversationId` sin él. La comprobación
 * está aquí y no en el gateway a propósito: el gateway ya filtra por permiso,
 * pero este servicio también responde por TCP y no puede dar por hecho quién
 * llama.
 *
 * ## Por qué 404 y no 403
 *
 * Una conversación ajena responde **404, no 403**: un 403 confirmaría que ese
 * id existe y es de otra persona, que es justo lo que no hace falta saber.
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * **Mis** conversaciones, la última movida arriba.
   *
   * ⚠️ Ya no filtra por proyecto, y ese es el cambio: el historial era «las de
   * este proyecto» y estaba partido en tantas listas como proyectos tuvieras, así
   * que para encontrar aquella conversación de la semana pasada había que
   * acordarse primero de sobre qué proyecto fue.
   *
   * `projectId` viaja en cada fila —el **último** del que se habló— para que la
   * lista pueda decir de qué iba cada una sin abrirla. Es `null` en las que nunca
   * llegaron a elegir foco.
   */
  async listar(userId: string) {
    const conversaciones = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });

    return conversaciones.map((conversacion) => ({
      id: conversacion.id,
      title: conversacion.title,
      projectId: conversacion.projectId,
      createdAt: conversacion.createdAt,
      updatedAt: conversacion.updatedAt,
      mensajes: conversacion._count.messages,
    }));
  }

  /**
   * Una conversación entera, con sus propuestas y el estado de cada una.
   *
   * Las propuestas viajan con su `status` porque de eso depende si la tarjeta
   * lleva botones al releer: solo las `PENDING` se pueden aplicar todavía.
   */
  async detalle(userId: string, conversationId: string) {
    const conversacion = await this.prisma.conversation.findFirst({
      /* Sin `projectId`: la conversación es de la persona y puede haber pasado
         por varios. El `userId` sigue siendo la clave de acceso, y una ajena
         responde 404 y no 403 — un 403 confirmaría que ese id existe. */
      where: { id: conversationId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { proposals: true },
        },
      },
    });

    if (!conversacion) {
      throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
    }

    return {
      id: conversacion.id,
      title: conversacion.title,
      /**
       * ⚠️ **De qué proyecto iba, y sin esto no se podía seguir hablando.**
       *
       * Al abrir una conversación vieja desde el historial, la pantalla no tenía
       * forma de saber su proyecto: se quedaba sin foco y por tanto **sin
       * compositor**, así que se podía leer el hilo y no continuarlo. Con esto,
       * abrir una conversación recupera también su foco.
       */
      projectId: conversacion.projectId,
      createdAt: conversacion.createdAt,
      updatedAt: conversacion.updatedAt,
      mensajes: conversacion.messages.map((mensaje) => ({
        id: mensaje.id,
        role: mensaje.role === 'USER' ? 'user' : 'model',
        text: mensaje.text,
        createdAt: mensaje.createdAt,
        proposals: mensaje.proposals.map((propuesta) => ({
          id: propuesta.id,
          tool: propuesta.tool,
          args: propuesta.args,
          status: propuesta.status,
        })),
      })),
    };
  }

  /**
   * El hilo que se le pasa a Gemini, sacado de la base.
   *
   * Antes lo mandaba el cliente en cada turno. Se trae de aquí porque ahora hay
   * dónde: se acabaron los recortes mal hechos en el navegador, y el modelo ve
   * el mismo hilo que la pantalla.
   *
   * Se recorta a los últimos `MAX_HISTORIAL` turnos, que es el mismo tope de
   * siempre — la ventana del modelo no ha crecido porque ahora guardemos más.
   */
  async historial(conversationId: string) {
    const mensajes = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORIAL,
      select: { role: true, text: true },
    });

    return mensajes
      .reverse()
      .map((mensaje) => ({ role: mensaje.role === 'USER' ? 'user' : 'model', text: mensaje.text }));
  }

  /**
   * La conversación sobre la que va este turno: la que digan, o una nueva.
   *
   * El título sale de las primeras palabras del primer mensaje. Se descartó
   * pedírselo a Gemini: sería una llamada más —y una unidad más de cuota— para
   * algo que se resuelve cortando una cadena, y que además se puede renombrar.
   */
  async resolver(userId: string, projectId: string, mensaje: string, conversationId?: string) {
    if (conversationId) {
      const existente = await this.prisma.conversation.findFirst({
        /* Sin `projectId` en el `where`: **una conversación puede cambiar de
           foco**, así que exigir que coincida con el del turno actual daría 404
           justo al preguntar por otro proyecto — que es el gesto que todo esto
           viene a permitir. Lo que sigue protegiendo el hilo es el `userId`. */
        where: { id: conversationId, userId },
        select: { id: true, projectId: true },
      });
      if (!existente) {
        throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
      }

      /* El foco de la conversación es el del último turno: es lo que la lista
         del historial enseña. Solo se escribe si cambió, para no tocar la fila
         —y su `updatedAt`— en cada mensaje del mismo proyecto. */
      if (existente.projectId !== projectId) {
        await this.prisma.conversation.update({
          where: { id: existente.id },
          data: { projectId },
        });
      }

      return existente.id;
    }

    const creada = await this.prisma.conversation.create({
      data: { userId, projectId, title: this.titulo(mensaje) },
      select: { id: true },
    });
    return creada.id;
  }

  /**
   * Guarda el turno completo: lo que se preguntó y lo que se respondió.
   *
   * Va en **una transacción** porque un turno a medias no es un turno: una
   * pregunta sin respuesta se leería como que el asistente se quedó callado, y
   * una respuesta sin pregunta no se puede leer en absoluto.
   *
   * Devuelve las propuestas **con su id**, que es lo que el cliente necesita
   * para poder marcarlas como aceptadas o descartadas más tarde.
   */
  async guardarTurno(params: {
    conversationId: string;
    /**
     * De qué proyecto iba este turno.
     *
     * ⚠️ Se guarda en los **dos** mensajes y no solo en la conversación: el foco
     * cambia a mitad, y sin esto un hilo que pasó por dos proyectos parecería
     * entero del último al releerlo — con sus propuestas apuntando al proyecto
     * equivocado a ojos de quien lo lee.
     */
    projectId: string;
    pregunta: string;
    respuesta: string;
    proposals: { tool: string; args: Record<string, unknown> }[];
  }) {
    const { conversationId, projectId, pregunta, respuesta, proposals } = params;

    return this.prisma.$transaction(async (tx) => {
      await tx.message.create({
        data: { conversationId, projectId, role: 'USER', text: pregunta },
      });

      const delModelo = await tx.message.create({
        data: {
          conversationId,
          projectId,
          role: 'MODEL',
          text: respuesta,
          proposals: {
            create: proposals.map((propuesta) => ({
              tool: propuesta.tool,
              args: propuesta.args as object,
            })),
          },
        },
        include: { proposals: true },
      });

      /* `updatedAt` es el orden del listado, y Prisma no lo toca al crear un
         hijo: sin este update, una conversación activa se hunde en la lista. */
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return delModelo.proposals.map((propuesta) => ({
        id: propuesta.id,
        tool: propuesta.tool,
        args: propuesta.args,
        status: propuesta.status,
      }));
    });
  }

  /**
   * Marca una propuesta como aceptada o descartada.
   *
   * Lo llama el cliente **después** de que la acción haya salido bien, no antes:
   * si se marcara al pulsar, un fallo del gateway dejaría una propuesta que dice
   * «aceptada» sin que se haya creado nada.
   *
   * Solo se resuelve lo que está `PENDING`. Reintentar sobre algo ya resuelto no
   * es un error del que haya que avisar —el estado final es el que se quería—
   * pero tampoco puede reescribir la fecha ni el veredicto.
   */
  async resolverPropuesta(userId: string, proposalId: string, status: 'ACCEPTED' | 'DISCARDED') {
    const propuesta = await this.prisma.proposal.findFirst({
      where: { id: proposalId, message: { conversation: { userId } } },
      select: { id: true, status: true },
    });

    if (!propuesta) {
      throw new RpcException({ statusCode: 404, message: 'Propuesta no encontrada' });
    }

    if (propuesta.status !== 'PENDING') return { id: propuesta.id, status: propuesta.status };

    const actualizada = await this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status, resolvedAt: new Date() },
      select: { id: true, status: true },
    });

    return actualizada;
  }

  /** Renombrar. El título es lo único que se puede editar de una conversación. */
  async renombrar(userId: string, conversationId: string, title: string) {
    const limpio = title.trim().slice(0, MAX_TITULO);
    if (limpio.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'El título no puede estar vacío' });
    }

    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { title: limpio },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
    }
    return { id: conversationId, title: limpio };
  }

  /**
   * Borrar una conversación propia.
   *
   * ⚠️ Esto **no contradice** la regla de que el asistente nunca borra nada: ahí
   * quien borraría sería el modelo, sobre el trabajo de un equipo. Aquí borra
   * una persona sus propios mensajes, que es lo contrario — y lo mínimo que se
   * le debe a quien ahora deja rastro de lo que escribe.
   *
   * Los mensajes y las propuestas caen en cascada.
   */
  async borrar(userId: string, conversationId: string) {
    const { count } = await this.prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });

    if (count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
    }
    return { id: conversationId };
  }

  /**
   * Todas las conversaciones de un proyecto, de todo el mundo.
   *
   * Lo llama el gateway al borrar un proyecto, igual que `TaskPurgeService` con
   * las tareas: no hay clave foránea entre servicios, así que la cascada no
   * llega hasta aquí y estas filas quedarían hablando de un proyecto que ya no
   * existe.
   */
  async purgar(projectId: string) {
    const { count } = await this.prisma.conversation.deleteMany({ where: { projectId } });
    return { borradas: count };
  }

  private titulo(mensaje: string): string {
    const limpio = mensaje.trim().replace(/\s+/g, ' ');
    if (limpio.length <= MAX_TITULO) return limpio || 'Conversación';
    /* Cortar por la última palabra entera: un título partido a mitad de palabra
       se lee peor que uno más corto. */
    const recortado = limpio.slice(0, MAX_TITULO);
    const ultimoEspacio = recortado.lastIndexOf(' ');
    return `${ultimoEspacio > 30 ? recortado.slice(0, ultimoEspacio) : recortado}…`;
  }
}
