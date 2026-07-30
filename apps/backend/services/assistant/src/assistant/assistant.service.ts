import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClientProxy,
  ClientProxyFactory,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import {
  type AssistantChatResult,
  type AssistantProposal,
  MAX_HISTORIAL,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

import { GeminiClient, GeminiError } from './gemini.client';
import { systemInstruction } from './prompt';
import { QuotaService } from './quota.service';
import { herramientasPara } from './tools';

/** Lo que el gateway manda en cada turno. Todo lo de permisos llega resuelto. */
interface ChatPayload {
  projectId: string;
  userId: string;
  message: string;
  history?: { role: string; text: string }[];
  /** Mapa efectivo, ya expandido por jerarquía. Lo resuelve el gateway. */
  permisos: Record<string, boolean>;
  miembros: { userId: string; nombre: string }[];
}

/** La forma del briefing, en lo que hace falta para validar lo que propone. */
interface Briefing {
  columnas: { id: string; nombre: string; orden: number }[];
  etiquetas: { id: string; nombre: string }[];
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
   * Un turno de conversación.
   *
   * El orden de los pasos es la mitad del diseño:
   *
   * 1. **Cuota primero.** Si está agotada no se llama a Gemini: sería gastar
   *    dinero del equipo en una respuesta que se va a tirar.
   * 2. Contexto, con el bloque de personas solo si hay `canViewReports`.
   * 3. Gemini, con las herramientas que los permisos de esta persona permiten.
   * 4. **Se consume después**, y solo si respondió bien.
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

    const respuesta = await this.gemini.chat({
      system: systemInstruction(briefing, payload.miembros),
      /* El historial lo manda el cliente y aquí se recorta otra vez: el DTO del
         gateway ya lo acota, pero este servicio también responde por TCP y no
         puede dar por hecho quién llama. */
      history: (payload.history ?? []).slice(-MAX_HISTORIAL),
      message: payload.message,
      tools: herramientasPara(payload.permisos),
    });

    /* Si Gemini falló, `chat` ya lanzó y no se llega aquí: la cuota no se toca.
       Ver `GeminiError`. */
    const cuota = await this.quota.consumir(payload.userId);

    const proposals = respuesta.calls
      .map((call) => this.validarPropuesta(call, briefing, payload))
      .filter((propuesta): propuesta is AssistantProposal => propuesta !== null);

    return {
      reply: respuesta.text || this.textoPorDefecto(proposals),
      proposals,
      cuota,
    };
  }

  /**
   * Qué se dice cuando Gemini no manda texto.
   *
   * **Con function calling eso es lo normal, no la excepción:** el modelo
   * devuelve la llamada y ni una palabra. Por eso el «por qué» es un parámetro
   * obligatorio de la herramienta y no una petición en el prompt — pedirlo por
   * prompt no funcionó— y por eso se puede usar aquí.
   *
   * Se rellena en el servidor y no en el frontend porque una burbuja en blanco
   * encima de una tarjeta de propuesta se lee como un fallo.
   */
  private textoPorDefecto(propuestas: AssistantProposal[]): string {
    const razones = propuestas
      .map((propuesta) => String(propuesta.args.porQue ?? '').trim())
      .filter(Boolean);

    if (razones.length > 0) return razones.join('\n\n');
    if (propuestas.length > 0) return 'Te propongo esto. Revisalo antes de aceptar.';
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
      const columna = columnas.find((c) => c.id === pedida) ?? columnas[0];

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

      return {
        tool: call.name,
        args: {
          taskId,
          assigneeIds: this.soloConocidos(call.args.assigneeIds, miembros),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    return null;
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
