import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, RpcException, Transport } from '@nestjs/microservices';
import {
  type AssistantChatResult,
  type AssistantPlanName,
  type AssistantProposal,
  MAX_HISTORIAL,
  type ReportChartShape,
  type ReportMetric,
  validarGrafico,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

import { ConversationsService } from './conversations.service';
import { GeminiClient, GeminiError } from './gemini.client';
import { systemInstruction } from './prompt';
import { QuotaService } from './quota.service';
import { herramientasPara } from './tools';

/** Lo que el gateway manda en cada turno. Todo lo de permisos llega resuelto. */
interface ChatPayload {
  projectId: string;
  userId: string;
  message: string;
  /**
   * La conversación que continúa. Sin él se abre una nueva.
   *
   * ⚠️ **`history` ya no se usa y se ignora.** Lo mandaba el cliente en cada
   * turno porque no había dónde guardarlo; ahora sale de la base, así que el
   * modelo ve exactamente el mismo hilo que la pantalla. Se deja declarado
   * para que una petición vieja no reviente, pero no entra en el prompt.
   */
  conversationId?: string;
  history?: { role: string; text: string }[];
  /** Mapa efectivo, ya expandido por jerarquía. Lo resuelve el gateway. */
  permisos: Record<string, boolean>;
  miembros: { userId: string; nombre: string }[];
  /**
   * Lo último que se dijo en el chat del equipo, ya resuelto por el gateway.
   *
   * ⚠️ **Solo el de este proyecto.** Las conversaciones privadas no llegan aquí
   * ni deben: son de dos personas, y meterlas en el contexto de un asistente de
   * proyecto sería enseñárselas a cualquiera con acceso al proyecto.
   *
   * Opcional para que una petición vieja —o un gateway sin actualizar— no
   * reviente el turno.
   */
  chat?: { autor: string; texto: string; cuando: string }[];
}

/** La forma del briefing, en lo que hace falta para validar lo que propone. */
interface Briefing {
  /**
   * Las columnas de **todo** el proyecto, con el tablero de cada una.
   *
   * ⚠️ `tableroId` es lo que faltaba. Sin él esta lista mezclaba las columnas de
   * todos los tableros —cada uno numera las suyas desde 0— y cualquier «la
   * primera» era una cualquiera.
   */
  columnas: {
    id: string;
    nombre: string;
    orden: number;
    tableroId?: string;
    tablero?: string;
  }[];
  /** La jerarquía real. La fuente de verdad desde que hay varios tableros. */
  tableros?: {
    id: string;
    nombre: string;
    espacio: string;
    columnas: { id: string; nombre: string; orden: number }[];
  }[];
  etiquetas: { id: string; nombre: string }[];
  /** El inventario con ids: lo que permite validar un `taskId` antes de enseñarlo. */
  tareas?: {
    id: string;
    titulo: string;
    cerrada: boolean;
    columnId: string;
    columna: string;
    /** En qué tablero está. Lo resuelve reports-service. */
    boardId?: string;
    tablero?: string | null;
    /** Los pasos del checklist, si los tiene. Es lo que permite validar los ids. */
    pasos?: { id: string; texto: string; hecho: boolean }[];
  }[];
}

@Injectable()
export class AssistantService {
  private readonly log = new Logger(AssistantService.name);
  private readonly reportsClient: ClientProxy;

  /**
   * Un solo cliente, hacia reports.
   *
   * Este servicio **no consulta tareas ni proyectos por su cuenta**: el contexto
   * ya lo arma `reports-service`, que es quien sabe cruzar las dos mitades y
   * quien tiene la caché. Se crea con `ClientProxyFactory` y no con
   * `ClientsModule` siguiendo el patrón de `reports.service.ts` y
   * `tasks.service.ts`.
   */
  constructor(
    private readonly config: ConfigService,
    private readonly quota: QuotaService,
    private readonly gemini: GeminiClient,
    private readonly conversaciones: ConversationsService,
  ) {
    this.reportsClient = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: this.config.get<string>('REPORTS_SERVICE_HOST'),
        port: this.config.get<number>('REPORTS_SERVICE_PORT'),
      },
    });
  }

  /** Cuánto lleva gastado. Lo pide la página al cargar, para pintar el contador. */
  estadoCuota(userId: string) {
    return this.quota.estado(userId);
  }

  /**
   * Asignar plan a mano. Lo llama administración.
   *
   * Sigue existiendo con la pasarela puesta: es la vía para regalar PRO, para
   * arreglar un cobro que salió mal y para quitarlo sin pasar por Stripe.
   */
  cambiarPlan(userId: string, plan: AssistantPlanName) {
    return this.quota.cambiarPlan(userId, plan);
  }

  /** Los planes de una tanda de usuarios, para la lista de administración. */
  planesDe(userIds: string[]) {
    return this.quota.planesDe(userIds);
  }

  /** Lo que hace falta para abrir un pago: el cliente de Stripe, si ya lo hay. */
  facturacionDe(userId: string) {
    return this.quota.facturacionDe(userId);
  }

  /** Aplica lo que dijo el webhook de Stripe. Idempotente a propósito. */
  vincularSuscripcion(datos: {
    userId: string;
    plan: AssistantPlanName;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }) {
    return this.quota.vincularSuscripcion(datos);
  }

  /** De quién es una suscripción de Stripe. Para las bajas, que no traen userId. */
  porSuscripcion(stripeSubscriptionId: string) {
    return this.quota.porSuscripcion(stripeSubscriptionId);
  }

  /**
   * Un turno de conversación.
   *
   * El orden de los pasos es la mitad del diseño:
   *
   * 1. **Cuota primero.** Si está agotada no se llama a Gemini: sería gastar
   *    dinero del equipo en una respuesta que se va a tirar.
   * 2. La conversación —la que continúa o una nueva— y su hilo.
   * 3. Contexto, con el bloque de personas solo si hay `canViewReports`.
   * 4. Gemini, con las herramientas que los permisos de esta persona permiten.
   * 5. **Se consume después**, y solo si respondió bien.
   * 6. Se guarda el turno, ya con las propuestas validadas.
   *
   * El guardado va al final **y a propósito**: si Gemini falla, no queda una
   * pregunta suelta en el historial esperando una respuesta que no llegó. El
   * precio es que un fallo al escribir en la base pierde un turno que sí se
   * cobró — se prefiere eso a un hilo con huecos, que es lo que se lee.
   */
  async chat(payload: ChatPayload): Promise<AssistantChatResult> {
    const cuotaPrevia = await this.quota.estado(payload.userId);

    if (cuotaPrevia.usados >= cuotaPrevia.limite) {
      /* 429 y no 403: no es que no pueda, es que ya no le quedan. El mensaje
         lleva la fecha de reinicio porque un límite sin fecha es un muro. */
      throw new RpcException({
        statusCode: 429,
        message:
          `Has gastado los ${cuotaPrevia.limite} mensajes de este mes. ` +
          'Vuelven el dia 1 del mes que viene.',
        details: { cuota: cuotaPrevia },
      });
    }

    const conversationId = await this.conversaciones.resolver(
      payload.userId,
      payload.projectId,
      payload.message,
      payload.conversationId,
    );
    const history = await this.conversaciones.historial(conversationId);

    const briefing = await firstValueFrom(
      this.reportsClient.send<Briefing>(
        { cmd: 'report_briefing' },
        {
          projectId: payload.projectId,
          /* La línea de `canViewReports`, resuelta por el gateway. Lo que no se
             trae no se puede filtrar mal más adelante. */
          incluirPersonas: payload.permisos.canViewReports === true,
        },
      ),
    );

    const herramientas = herramientasPara(payload.permisos);

    const respuesta = await this.gemini.chat({
      system: systemInstruction(
        briefing,
        payload.miembros,
        herramientas.map((herramienta) => herramienta.name),
        payload.chat ?? [],
        /* Quién pregunta sale de la lista de miembros que ya llega resuelta: no
           hace falta ninguna consulta más. Si no estuviera —no debería pasar—
           el prompt simplemente omite el bloque en vez de mentir con un id. */
        payload.miembros.find((miembro) => miembro.userId === payload.userId),
      ),
      /* Sale de la base, ya recortado a MAX_HISTORIAL. */
      history,
      message: payload.message,
      tools: herramientas,
    });

    /* Si Gemini falló, `chat` ya lanzó y no se llega aquí: la cuota no se toca.
       Ver `GeminiError`. */
    const cuota = await this.quota.consumir(payload.userId);

    const validadas = respuesta.calls
      .map((call) => this.validarPropuesta(call, briefing, payload))
      .filter((propuesta): propuesta is AssistantProposal => propuesta !== null);

    const reply = respuesta.text || this.textoPorDefecto(validadas);

    /* Las propuestas vuelven **con su id**: es lo que necesita el cliente para
       marcarlas como aceptadas o descartadas después. */
    const proposals = await this.conversaciones.guardarTurno({
      conversationId,
      pregunta: payload.message,
      respuesta: reply,
      proposals: validadas,
    });

    return {
      conversationId,
      reply,
      proposals: proposals as unknown as AssistantProposal[],
      cuota,
    };
  }

  /** Las conversaciones, delegadas. El gateway habla con este servicio. */
  listarConversaciones(userId: string, projectId: string) {
    return this.conversaciones.listar(userId, projectId);
  }

  detalleConversacion(userId: string, projectId: string, conversationId: string) {
    return this.conversaciones.detalle(userId, projectId, conversationId);
  }

  renombrarConversacion(userId: string, projectId: string, conversationId: string, title: string) {
    return this.conversaciones.renombrar(userId, projectId, conversationId, title);
  }

  borrarConversacion(userId: string, projectId: string, conversationId: string) {
    return this.conversaciones.borrar(userId, projectId, conversationId);
  }

  resolverPropuesta(userId: string, proposalId: string, status: 'ACCEPTED' | 'DISCARDED') {
    return this.conversaciones.resolverPropuesta(userId, proposalId, status);
  }

  purgarConversaciones(projectId: string) {
    return this.conversaciones.purgar(projectId);
  }

  /**
   * Qué se dice cuando Gemini no manda texto.
   *
   * **Con function calling eso es lo normal, no la excepción:** el modelo
   * devuelve la llamada y ni una palabra. Una burbuja en blanco encima de una
   * tarjeta de propuesta se lee como un fallo, así que se rellena aquí y no en
   * el frontend.
   *
   * ⚠️ **Ya no se componen los `porQue`.** Antes se unían y se devolvían como
   * texto, porque la tarjeta los descartaba y era la única forma de que la
   * justificación se leyera en alguna parte. Desde que cada tarjeta pinta el
   * suyo, hacer eso escribe la misma frase dos veces, una encima de otra.
   *
   * Lo que queda es un encuadre que dice **cuántas** propuestas hay, que es lo
   * único que el texto puede aportar y la tarjeta no.
   */
  private textoPorDefecto(propuestas: AssistantProposal[]): string {
    if (propuestas.length === 1) return 'Te propongo esto. Revisalo antes de aceptar.';
    if (propuestas.length > 1) {
      return `Te propongo ${propuestas.length} cambios. Revisa cada uno antes de aceptarlo.`;
    }
    return 'No he sabido responder a eso.';
  }

  /**
   * Comprueba lo que el modelo devolvió **contra el proyecto de verdad**.
   *
   * Un id de columna o de etiqueta inventado no se descubriría hasta que alguien
   * pulsara «Aceptar» y el gateway respondiera 400, y para entonces la tarjeta
   * ya le habría prometido una tarea que no se puede crear. Se comprueba aquí,
   * mientras todavía hay dónde ponerlo.
   *
   * Los ids que no cuadran **se quitan en vez de tumbar la propuesta**: que el
   * modelo se invente una etiqueta no es motivo para tirar un título bueno. Un
   * `columnId` malo sí lo es —es obligatorio y no hay a dónde crear la tarea—,
   * así que se sustituye por la primera columna del tablero, que además es lo
   * que se le pidió por defecto.
   *
   * ⚠️ Nada de esto es la barrera de seguridad. La barrera es que **esto no
   * ejecuta nada**: sale como propuesta, la persona la acepta, y ahí el gateway
   * vuelve a comprobar permisos y a validar el DTO como con cualquier
   * formulario. Esto solo evita enseñar una propuesta rota.
   */
  private validarPropuesta(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
    payload: ChatPayload,
  ): AssistantProposal | null {
    const permitidas = new Set(herramientasPara(payload.permisos).map((t) => t.name));
    if (!permitidas.has(call.name)) {
      /* No debería pasar: la herramienta no se le declaró. Si pasa, es que el
         modelo se la inventó, y se descarta sin ruido para el usuario. */
      this.log.warn(`El modelo llamo a ${call.name}, que no se le habia declarado`);
      return null;
    }

    const miembros = new Set(payload.miembros.map((m) => m.userId));

    if (call.name === 'proponer_tarea') {
      const columnas = [...briefing.columnas].sort((a, b) => a.orden - b.orden);
      if (columnas.length === 0) return null;

      const pedida = String(call.args.columnId ?? '');
      const elegida = columnas.find((c) => c.id === pedida);

      /**
       * ⚠️ **Con varios tableros ya no se adivina, y ese era el fallo.**
       *
       * Esto hacía `?? columnas[0]`: si el modelo no daba una columna válida se
       * caía a «la primera» de una lista que mezcla los tableros de todo el
       * proyecto. La tarjeta decía «se creará en Por hacer» y la tarea aparecía
       * en un tablero que nadie había mencionado — sin error, sin aviso, y con
       * la propuesta pareciendo correcta.
       *
       * Con **un solo** tablero la caída sigue siendo válida: solo hay un sitio
       * posible y ahorrarle a la persona decirlo es la conveniencia de siempre.
       * Con varios se descarta la propuesta, y la regla del prompt hace que el
       * modelo pregunte en vez de callarse.
       */
      const tableros = new Set(columnas.map((c) => c.tableroId ?? 'unico'));
      const columna = elegida ?? (tableros.size === 1 ? columnas[0] : undefined);

      if (!columna) {
        this.log.warn(
          `El modelo propuso una tarea sin columna valida y hay ${tableros.size} tableros: se descarta`,
        );
        return null;
      }

      const etiquetas = this.soloConocidos(
        call.args.labelIds,
        new Set(briefing.etiquetas.map((l) => l.id)),
      );
      const encargados = this.soloConocidos(call.args.assigneeIds, miembros);

      return {
        tool: call.name,
        args: {
          title: String(call.args.title ?? '').slice(0, 120),
          ...(call.args.description ? { description: String(call.args.description) } : {}),
          columnId: columna.id,
          /* El nombre de la columna viaja en la propuesta porque quien la
             ejecute lo necesita: `status` tiene que igualar el nombre de la
             columna destino, y el frontend no tiene por qué volver a buscarlo.
             También es lo que enseña la tarjeta. */
          columnName: columna.nombre,
          /* El tablero viaja con la propuesta para que la tarjeta pueda decir
             DONDE se va a crear. Con varios tableros, «columna Por hacer» no
             identifica ningun sitio: las cuatro lo tienen. */
          ...(columna.tablero ? { boardName: columna.tablero } : {}),
          priority: this.prioridadValida(call.args.priority),
          ...(this.fechaValida(call.args.dueDate) ? { dueDate: call.args.dueDate } : {}),
          ...(encargados.length > 0 ? { assigneeIds: encargados } : {}),
          ...(etiquetas.length > 0 ? { labelIds: etiquetas } : {}),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    if (call.name === 'proponer_asignacion') {
      const taskId = String(call.args.taskId ?? '');
      if (!taskId) return null;

      /**
       * El `taskId` se comprueba contra el inventario, que antes no existía.
       *
       * Mientras el id tenía que darlo la persona a mano, aquí no había con qué
       * contrastarlo y pasaba tal cual: un id mal copiado llegaba a la tarjeta y
       * moría en el 404 al aceptar. Ahora el contexto trae las tareas del
       * proyecto, así que una propuesta sobre algo que no existe —o sobre una
       * tarea de otro proyecto— se descarta antes de pintarse.
       *
       * Se descarta la propuesta entera y no solo el campo: sin tarea válida no
       * queda nada que proponer, al revés que con una etiqueta inventada.
       */
      const tarea = briefing.tareas?.find((t) => t.id === taskId);
      if (briefing.tareas && !tarea) {
        this.log.warn(`El modelo propuso asignar ${taskId}, que no esta en el proyecto`);
        return null;
      }

      return {
        tool: call.name,
        args: {
          taskId,
          /* El título viaja con la propuesta para que la tarjeta pueda decir
             sobre qué tarea es sin ir a buscarla. */
          ...(tarea ? { taskTitle: tarea.titulo } : {}),
          assigneeIds: this.soloConocidos(call.args.assigneeIds, miembros),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /**
     * Un mensaje para el chat del equipo.
     *
     * ⚠️ **No apunta a ninguna tarea**, así que va antes del filtro de abajo: si
     * pasara por él se descartaría siempre por no traer `taskId`, y el modelo
     * parecería estar ignorando la herramienta.
     *
     * Las menciones que traiga el texto **no se validan aquí**, y es a propósito:
     * el nombre lo escribe quien redacta, así que una etiqueta apuntando a
     * alguien que ya no está solo se pinta como texto plano — que es justo lo que
     * hace el formato. Lo único que se comprueba es que haya texto.
     */
    if (call.name === 'proponer_mensaje') {
      const body = String(call.args.body ?? '').trim();
      if (!body) return null;

      return {
        tool: call.name,
        args: {
          body: body.slice(0, 2000),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /**
     * Marcar pasos del checklist.
     *
     * ⚠️ **Los ids se comprueban contra los pasos de esa tarea**, no solo contra
     * el inventario: un id de otro paso —o de otra tarea— llegaría a la tarjeta
     * y moriría en un 404 al aceptar. Y se descartan los que **ya están
     * hechos**: marcarlos otra vez no hace nada y confunde a quien revise.
     *
     * Si no queda ninguno válido se descarta la propuesta entera: una tarjeta
     * que no va a cambiar nada es peor que ninguna tarjeta.
     */
    if (call.name === 'proponer_marcar_pasos') {
      const taskId = String(call.args.taskId ?? '');
      const tarea = briefing.tareas?.find((t) => t.id === taskId);
      if (!tarea) {
        this.log.warn(`El modelo propuso marcar pasos de ${taskId}, que no esta en el proyecto`);
        return null;
      }

      const pendientes = new Set(
        (tarea.pasos ?? []).filter((paso) => !paso.hecho).map((paso) => paso.id),
      );
      const itemIds = this.soloConocidos(call.args.itemIds, pendientes);
      if (itemIds.length === 0) return null;

      return {
        tool: call.name,
        args: {
          taskId,
          taskTitle: tarea.titulo,
          itemIds,
          /* Los textos viajan con la propuesta: la tarjeta tiene que poder decir
             QUÉ pasos se van a marcar sin ir a buscarlos. */
          items: (tarea.pasos ?? [])
            .filter((paso) => itemIds.includes(paso.id))
            .map((paso) => paso.texto),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /**
     * Un gráfico para el lienzo de quien pregunta.
     *
     * ⚠️ **Aquí es donde se cierra el conjunto cerrado.** El `enum` que se le
     * declara a Gemini es una sugerencia con muy buena tasa de acierto, no una
     * garantía: nada impide que devuelva una métrica inventada o una
     * combinación que no se puede dibujar. `validarGrafico` es la comprobación
     * de verdad, y es la **misma función** que aplica el DTO del gateway al
     * guardar el lienzo — dos puertas, una sola definición de qué es válido.
     *
     * Cuando no pasa se descarta la propuesta y se registra el motivo. No se
     * «arregla» cayendo a una forma que sí valga, al contrario que
     * `proponer_tarea` con su columna: ahí el destino es un matiz de algo que
     * se pidió, aquí la forma **es** lo que se pidió, y dibujar otra cosa
     * distinta de la que dice la tarjeta sería mentir en la propia tarjeta.
     */
    if (call.name === 'proponer_grafico') {
      const grafico = {
        forma: String(call.args.forma ?? '') as ReportChartShape,
        metrica: String(call.args.metrica ?? '') as ReportMetric,
        ...(Number.isInteger(call.args.dias) ? { dias: Number(call.args.dias) } : {}),
        ...(call.args.soloVencidas === true ? { soloVencidas: true } : {}),
        ...(Number.isInteger(call.args.topN) ? { topN: Number(call.args.topN) } : {}),
        titulo: String(call.args.titulo ?? '')
          .trim()
          .slice(0, 80),
      };

      const problema = validarGrafico(grafico);
      if (problema) {
        this.log.warn(`El modelo propuso un grafico que no se puede dibujar: ${problema}`);
        return null;
      }

      return {
        tool: call.name,
        args: {
          grafico,
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /* Las cuatro de la capa 2 comparten la misma puerta: todas apuntan a una
       tarea que ya existe, y ninguna vale sin ella. */
    const sobreTarea = this.tareaDeLaPropuesta(call, briefing);
    if (!sobreTarea) return null;
    const { taskId, tarea } = sobreTarea;
    const base = {
      taskId,
      ...(tarea ? { taskTitle: tarea.titulo } : {}),
      ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
    };

    if (call.name === 'proponer_edicion') {
      const cambios: Record<string, unknown> = {};

      if (call.args.title) cambios.title = String(call.args.title).slice(0, 120);
      if (call.args.description) cambios.description = String(call.args.description);
      if (call.args.priority) cambios.priority = this.prioridadValida(call.args.priority);
      if (this.fechaValida(call.args.dueDate)) cambios.dueDate = call.args.dueDate;
      /* `labelIds` sí puede llegar vacío con intención —«quítale las etiquetas»—
         así que se distingue «no lo mandó» de «lo mandó vacío». */
      if (Array.isArray(call.args.labelIds)) {
        cambios.labelIds = this.soloConocidos(
          call.args.labelIds,
          new Set(briefing.etiquetas.map((l) => l.id)),
        );
      }

      /* Una edición que no cambia nada es una tarjeta que promete algo y no
         hace nada al aceptarla. Pasa cuando el modelo manda solo el porQue. */
      if (Object.keys(cambios).length === 0) {
        this.log.warn('El modelo propuso una edicion sin ningun campo que cambiar');
        return null;
      }

      return { tool: call.name, args: { ...base, ...cambios } };
    }

    if (call.name === 'proponer_movimiento') {
      const columna = briefing.columnas.find((c) => c.id === String(call.args.columnId ?? ''));
      /* Sin columna válida no hay a dónde mover, y aquí **no** se cae a la
         primera del tablero como en `proponer_tarea`: crear en otra columna es
         un matiz, mover a otra columna es otra acción. */
      if (!columna) return null;
      /* Mover a donde ya está no cambia nada y la tarjeta mentiría. */
      if (tarea && tarea.columnId === columna.id) return null;

      return {
        tool: call.name,
        args: {
          ...base,
          columnId: columna.id,
          /* El nombre viaja para la tarjeta y para el `status`, que el contrato
             exige que iguale al de la columna destino. */
          columnName: columna.nombre,
          /* El tablero destino y el de origen: mover entre tableros es valido, y
             una tarjeta que solo diga «a Por hacer» no deja ver que la tarea
             cambia de tablero, que es el cambio grande de los dos. */
          ...(columna.tablero ? { boardName: columna.tablero } : {}),
          ...(tarea ? { columnaActual: tarea.columna } : {}),
          ...(tarea?.tablero ? { tableroActual: tarea.tablero } : {}),
        },
      };
    }

    if (call.name === 'proponer_checklist') {
      const items = (Array.isArray(call.args.items) ? call.args.items : [])
        .map((paso) => String(paso).trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 10);

      if (items.length === 0) return null;
      return { tool: call.name, args: { ...base, items } };
    }

    if (call.name === 'proponer_comentario') {
      const body = String(call.args.body ?? '')
        .trim()
        .slice(0, 2000);
      if (body.length === 0) return null;
      return { tool: call.name, args: { ...base, body } };
    }

    return null;
  }

  /**
   * La tarea sobre la que va una propuesta, comprobada contra el inventario.
   *
   * Lo comparten las cuatro herramientas que actúan sobre algo que ya existe.
   * Devuelve `null` —y con ello se descarta la propuesta entera— cuando el id
   * falta o no es de este proyecto: sin tarea no queda nada que proponer, al
   * revés que con una etiqueta inventada, que solo se quita.
   *
   * `tarea` puede venir indefinida si el briefing no trajera inventario. Es un
   * caso que hoy no ocurre, pero el código no se apoya en que no ocurra.
   */
  private tareaDeLaPropuesta(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
  ): {
    taskId: string;
    tarea?: {
      id: string;
      titulo: string;
      columnId?: string;
      columna?: string;
      /** En qué tablero está hoy. Lo usa la tarjeta para decir «de X a Y». */
      tablero?: string | null;
    };
  } | null {
    const taskId = String(call.args.taskId ?? '').trim();
    if (!taskId) return null;

    const tarea = briefing.tareas?.find((t) => t.id === taskId);
    if (briefing.tareas && !tarea) {
      this.log.warn(`El modelo llamo a ${call.name} sobre ${taskId}, que no esta en el proyecto`);
      return null;
    }

    return { taskId, tarea };
  }

  /** Se queda con los ids que existen de verdad y descarta el resto. */
  private soloConocidos(valor: unknown, conocidos: Set<string>): string[] {
    if (!Array.isArray(valor)) return [];
    return valor.map(String).filter((id) => conocidos.has(id));
  }

  private prioridadValida(valor: unknown): string {
    const prioridad = String(valor ?? '').toUpperCase();
    return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(prioridad) ? prioridad : 'MEDIUM';
  }

  /**
   * `YYYY-MM-DD` y nada más.
   *
   * El modelo tiende a devolver fechas en cualquier formato que le suene, y una
   * que no case aquí se descarta entera: es mejor una propuesta sin fecha que
   * una con una fecha que nadie pidió.
   */
  private fechaValida(valor: unknown): boolean {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    return !Number.isNaN(new Date(valor).getTime());
  }

  /** Traduce el fallo de Gemini a algo que el gateway pueda devolver. */
  static comoRpc(error: unknown): RpcException {
    if (error instanceof GeminiError) {
      return new RpcException({ statusCode: 502, message: error.message, details: {} });
    }
    if (error instanceof RpcException) return error;
    return new RpcException({
      statusCode: 500,
      message: 'El asistente no ha podido responder.',
      details: {},
    });
  }
}
