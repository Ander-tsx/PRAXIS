import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ASSISTANT_EXTRACT_BUDGET_CHARS, MAX_HISTORIAL } from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { textoConAdjuntos } from './attachment-text';

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
/**
 * Desde qué organización se mira (D6 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * `incluirLegado` es para la organización **personal**: ahí se enseñan también
 * las conversaciones de antes de que existiera la columna (`organizationId: ''`),
 * que de otro modo no saldrían en ninguna.
 */
export interface AmbitoDeOrganizacion {
  organizationId: string;
  incluirLegado: boolean;
}

function filtroDeOrganizacion(ambito?: AmbitoDeOrganizacion) {
  if (!ambito) return {};
  return ambito.incluirLegado
    ? { organizationId: { in: [ambito.organizationId, ''] } }
    : { organizationId: ambito.organizationId };
}

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
  async listar(userId: string, ambito?: AmbitoDeOrganizacion) {
    const conversaciones = await this.prisma.conversation.findMany({
      where: { userId, ...filtroDeOrganizacion(ambito) },
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
  async detalle(userId: string, conversationId: string, ambito?: AmbitoDeOrganizacion) {
    const conversacion = await this.prisma.conversation.findFirst({
      /* Sin `projectId`: la conversación es de la persona y puede haber pasado
         por varios. El `userId` sigue siendo la clave de acceso, y una ajena
         responde 404 y no 403 — un 403 confirmaría que ese id existe.

         Y la de **otra organización** también responde 404 (D6): desde la
         organización activa no existe, igual que un proyecto de otra no sale en
         la lista. */
      where: { id: conversationId, userId, ...filtroDeOrganizacion(ambito) },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            proposals: true,
            /* Sin bytes: para la burbuja bastan nombre, tipo y tamaño. El
               contenido se pide aparte, y solo si alguien lo abre — incluirlo
               aquí metería cada archivo del hilo en cada lectura. */
            attachments: { select: { id: true, filename: true, mimeType: true, size: true } },
          },
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
        /* Solo los turnos del usuario tienen: PRAX responde texto y propuestas,
           nunca archivos. Y los anteriores a que se guardaran vienen vacíos —
           entonces viajaban con la pregunta y se descartaban. */
        attachments: mensaje.attachments,
        /* Lo que costó cada respuesta de PRAX (D9). Solo en las del modelo, y
           solo desde que se guarda. */
        ...(mensaje.uso ? { uso: mensaje.uso } : {}),
        ...(mensaje.pensamiento ? { pensamiento: mensaje.pensamiento } : {}),
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
   *
   * ## Y aquí es donde los archivos vuelven a existir
   *
   * El texto de un mensaje se guarda **tal y como se escribió**, sin los
   * archivos pegados: un turno con cuarenta mil caracteres de un `.md` dentro no
   * se lee como conversación. Así que el archivo se recompone al armar el hilo,
   * a partir del `extract` que se calculó al subirlo.
   *
   * Sin esto, PRAX olvidaba el documento en cuanto contestaba: los bytes viajan
   * con su turno y no se reenvían nunca más. Con esto —y con el presupuesto de
   * `ASSISTANT_EXTRACT_BUDGET_CHARS`— sigue delante mientras la conversación
   * quepa.
   */
  /** Cuántos mensajes tiene el hilo entero: para decir cuántos no ve el modelo (D9). */
  contar(conversationId: string): Promise<number> {
    return this.prisma.message.count({ where: { conversationId } });
  }

  async historial(conversationId: string) {
    const mensajes = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORIAL,
      select: {
        role: true,
        text: true,
        /* Solo aquí. `detalle()` no los pide: la burbuja no necesita el
           contenido y traerlo metería cada documento del hilo en cada lectura
           de la pantalla. */
        attachments: { select: { filename: true, mimeType: true, extract: true } },
      },
    });

    /**
     * ⚠️ **El presupuesto se gasta del más reciente hacia atrás**, y por eso se
     * recorre la lista tal cual viene —ordenada `desc`— y se le da la vuelta al
     * final. Lo último que se adjuntó es lo que se está usando; lo de hace ocho
     * turnos es lo que se puede recortar sin que nadie lo note.
     *
     * Sin tope esto sería una factura garantizada: 3 adjuntos por mensaje ×
     * 40 000 caracteres × 12 turnos son 360 000 caracteres **en cada pregunta**.
     */
    let presupuesto: number = ASSISTANT_EXTRACT_BUDGET_CHARS;
    const conArchivos = mensajes.map((mensaje) => {
      const compuesto = textoConAdjuntos(mensaje.text, mensaje.attachments, presupuesto);
      presupuesto = compuesto.presupuesto;
      return { role: mensaje.role === 'USER' ? 'user' : 'model', text: compuesto.texto };
    });

    return conArchivos.reverse();
  }

  /**
   * La conversación sobre la que va este turno: la que digan, o una nueva.
   *
   * El título sale de las primeras palabras del primer mensaje. Se descartó
   * pedírselo a Gemini: sería una llamada más —y una unidad más de cuota— para
   * algo que se resuelve cortando una cadena, y que además se puede renombrar.
   */
  async resolver(
    userId: string,
    projectId: string | null,
    mensaje: string,
    conversationId?: string,
    /** La organización del turno. `null` solo si el gateway no pudo resolverla. */
    organizationId?: string | null,
  ) {
    if (conversationId) {
      const existente = await this.prisma.conversation.findFirst({
        /* Sin `projectId` en el `where`: **una conversación puede cambiar de
           foco**, así que exigir que coincida con el del turno actual daría 404
           justo al preguntar por otro proyecto — que es el gesto que todo esto
           viene a permitir. Lo que sigue protegiendo el hilo es el `userId`. */
        where: { id: conversationId, userId },
        select: { id: true, projectId: true, organizationId: true },
      });
      if (!existente) {
        throw new RpcException({ statusCode: 404, message: 'Conversación no encontrada' });
      }

      /**
       * 🔴 **Una conversación no cruza de organización** (D6), por lo mismo que no
       * cambia de proyecto: lo que se dijo en una empresa no se reenvía al modelo
       * en el turno de otra. 403 `NOT_IN_ORG`, que es lo que dice cualquier otra
       * ruta cuando lo que no encaja es la organización.
       */
      if (
        existente.organizationId &&
        organizationId &&
        existente.organizationId !== organizationId
      ) {
        throw new RpcException({
          statusCode: 403,
          code: 'NOT_IN_ORG',
          message: 'Esta conversación es de otra organización. Cámbiate a ella para seguirla.',
        });
      }

      /* Una de antes de la columna adopta la organización de su primer turno. */
      if (!existente.organizationId && organizationId) {
        await this.prisma.conversation.update({
          where: { id: existente.id },
          data: { organizationId },
        });
      }

      /**
       * ⚠️ **Una conversación NO cambia de proyecto.** Decisión de producto del
       * 2026-08-18, y el motivo es el mismo que llevó a un foco por conversación
       * en vez de multiproyecto: el hilo que ve el modelo se reenvía entero en
       * cada turno, así que una conversación que empezó hablando del proyecto A
       * y sigue en el B le mete **los dos contextos en la ventana** — con sus
       * tareas, sus columnas y su gente mezcladas. Las propuestas salen apuntando
       * a ids del proyecto equivocado, y la validación las descarta: por fuera se
       * ve como un asistente que de pronto no entiende nada.
       *
       * Hubo una versión en que sí cambiaba y el `projectId` de la conversación
       * era «el del último turno». Se retira: cada proyecto, su conversación.
       *
       * Se responde 409 y no 404 a propósito: la conversación existe y es tuya —
       * lo que no encaja es el proyecto—, y un 404 mandaría a buscar un id que
       * está perfectamente.
       */
      if (existente.projectId && projectId && existente.projectId !== projectId) {
        throw new RpcException({
          statusCode: 409,
          message: 'Esta conversación es de otro proyecto. Empieza una nueva para hablar de este.',
        });
      }

      /**
       * ⚠️ **Y al revés tampoco: una conversación con proyecto no vuelve a no
       * tenerlo.**
       *
       * Este caso solo puede llegar de un cliente descolocado —una pestaña
       * abierta desde antes de adoptar el proyecto, que sigue mandando el turno
       * por la ruta sin foco—. Aceptarlo silenciosamente sería peor que
       * rechazarlo: ese turno se respondería **sin el briefing**, así que PRAX
       * diría que no tiene datos de un proyecto que la pantalla está enseñando
       * como cargado, y no habría forma de entender por qué.
       */
      if (existente.projectId && !projectId) {
        throw new RpcException({
          statusCode: 409,
          message: 'Esta conversación ya es de un proyecto. Vuelve a abrirla para seguir.',
        });
      }

      /**
       * La primera pregunta de una conversación sin foco es la que lo fija.
       *
       * Es también **el momento en que una conversación sin proyecto lo
       * adopta**: se acepta `proponer_abrir_proyecto` —o se crea uno desde una
       * plantilla—, la pantalla vuelve por la ruta del proyecto con el mismo
       * `conversationId`, y el hilo entero sigue ahí. Sin esto habría que
       * empezar de cero justo después de haberle contado todo.
       */
      if (!existente.projectId && projectId) {
        await this.prisma.conversation.update({
          where: { id: existente.id },
          data: { projectId },
        });
      }

      return existente.id;
    }

    const creada = await this.prisma.conversation.create({
      data: {
        userId,
        projectId,
        organizationId: organizationId ?? '',
        title: this.titulo(mensaje),
      },
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
     *
     * `null` en los turnos de una conversación sin foco, que es lo que permite
     * distinguir después **dónde se dejó de hablar en abstracto**: los mensajes
     * anteriores a adoptar un proyecto no eran sobre él.
     */
    projectId: string | null;
    pregunta: string;
    respuesta: string;
    /** Lo que costó la respuesta (D9). Se guarda en el mensaje del modelo. */
    uso?: Record<string, number>;
    /** Los pasos del turno. Se guarda en el mensaje del modelo. */
    pensamiento?: { pasos: { clase: string; texto: string; detalle?: string }[]; ms: number };
    proposals: { tool: string; args: Record<string, unknown> }[];
    /** Quién pregunta. Solo se usa para no reclamar borradores de otra persona. */
    userId: string;
    /**
     * Los borradores que este turno se lleva consigo.
     *
     * ⚠️ **Se reclaman aquí dentro y no antes, a propósito.** Un adjunto atado a
     * un mensaje que no llegó a crearse sería una fila colgando; dentro de la
     * transacción, o hay turno y archivos, o no hay ninguna de las dos cosas.
     */
    attachmentIds: string[];
  }) {
    const { conversationId, projectId, pregunta, respuesta, proposals } = params;

    return this.prisma.$transaction(async (tx) => {
      const delUsuario = await tx.message.create({
        data: { conversationId, projectId, role: 'USER', text: pregunta },
      });

      if (params.attachmentIds.length > 0) {
        /* `messageId: null` en el filtro es lo que lo hace idempotente: un
           reintento no le roba el archivo a un turno que ya lo tenía. */
        await tx.attachment.updateMany({
          where: {
            id: { in: params.attachmentIds },
            uploadedBy: params.userId,
            messageId: null,
          },
          data: { conversationId, messageId: delUsuario.id },
        });
      }

      const delModelo = await tx.message.create({
        data: {
          conversationId,
          projectId,
          role: 'MODEL',
          text: respuesta,
          ...(params.uso ? { uso: params.uso } : {}),
          ...(params.pensamiento ? { pensamiento: params.pensamiento } : {}),
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
  /**
   * ¿Es de esta persona? Para firmar un mensaje de chat como «enviado con
   * PRAX» (D13 de docs/PLAN-PRAX-SEMIAGENTICO.md): quien lo manda tiene que
   * poder señalar una conversación suya, no la de cualquiera.
   */
  async esDe(userId: string, conversationId: string): Promise<boolean> {
    return (await this.prisma.conversation.count({ where: { id: conversationId, userId } })) > 0;
  }

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
