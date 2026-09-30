import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, ClientProxyFactory, RpcException } from '@nestjs/microservices';
import {
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
  ASSISTANT_PDF_MAX_INLINE_PAGES,
  ASSISTANT_TEXT_MAX_CHARS,
  ASSISTANT_TEXT_MIME,
  type AssistantChatResult,
  type AssistantProposal,
  type AssistantQuota,
  MAX_HISTORIAL,
  PLAN_POR_DEFECTO,
  QUOTA_EXCEEDED_CODE,
  type QuotaExceededDetails,
  QuotaKind,
  tokensPrax,
  type AssistantModelo,
  type PasoDePensamiento,
} from '@praxis/contracts';
import { opcionesDeCliente } from '@praxis/local-transport';
import { Observable, firstValueFrom } from 'rxjs';

import { bloqueDeArchivo } from './attachment-text';
import { AttachmentsService } from './attachments.service';
import {
  type AmbitoDeConsulta,
  type AutomatizacionesVistas,
  type DocumentoVisto,
  REVISION_MAX_CARACTERES,
  type SprintVisto,
  type TareaVista,
  ConsultasService,
  HERRAMIENTAS_DE_CONSULTA,
  esConsulta,
} from './consultas';
import { type AmbitoDeOrganizacion, ConversationsService } from './conversations.service';
import { GeminiClient, type GeminiContent, GeminiError, type UsoDeGemini } from './gemini.client';
import { instruccionSinProyecto, systemInstruction } from './prompt';
import { QuotaService } from './quota.service';
import { OpenRouterClient } from './openrouter.client';
import { RouterDeContexto } from './router';
import {
  intencionPorPalabras,
  paso,
  pasoDePropuesta,
  pasoDeRuta,
  resumenDeConsulta,
} from './pensamiento';
import { PROPONER_PLANTILLA, instruccionDePlantilla, validarPlantilla } from './template';
import { catalogoDeCapacidades, herramientasPara } from './capabilities';
import { MAX_BORRADOS_POR_LOTE, MAX_TAREAS_POR_LOTE, herramientasSinProyecto } from './tools';

/** Lo que el gateway manda en cada turno. Todo lo de permisos llega resuelto. */
interface ChatPayload {
  /**
   * De qué proyecto se habla. **`null` en una conversación sin foco.**
   *
   * ⚠️ No es «todavía no elegido»: es un modo. Sin foco no hay briefing que
   * pedir, ni permisos que resolver, ni miembros a los que nombrar — no porque
   * se ahorren, sino porque no existen. Lo que hay es PRAX conversando, leyendo
   * lo que le adjunten, y con dos salidas hacia un proyecto: abrir uno de los de
   * esa persona o montar la estructura de uno que aún no existe.
   */
  projectId: string | null;
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
  /**
   * Cuántos mensajes al mes da su plan. Lo resuelve el gateway contra billing.
   *
   * ⚠️ **Ausente significa «usa el valor por defecto», no «sin límite».** Desde
   * la etapa Enterprise hay cinco planes y el de alguien puede venir de la
   * organización de su empresa, que este servicio no conoce. Ver
   * `QuotaService.limite`.
   */
  limiteMensual?: number | null;
  /**
   * En qué organización se está gastando, para la clave del contador.
   *
   * ⚠️ **Llega resuelta por el gateway y viaja junto al tope, no aparte.** Es la
   * misma resolución que produjo `limiteMensual`: contar en una organización y
   * negar contra el tope de otra deja a alguien bloqueado sin explicación
   * posible. Ver `QuotaService.iaDe` en el gateway.
   */
  organizationId?: string | null;
  /** Con qué modelo responde. Sin él, Gemini. Ver `ASSISTANT_MODELOS`. */
  modelo?: AssistantModelo;
  /**
   * Qué plan puso ese tope. Solo se usa para **explicarlo** al agotarse.
   *
   * ⚠️ Llega del gateway junto al tope y en la misma resolución, no en dos: si
   * se pidieran por separado y alguien cambiara de plan entre medias, el 402
   * saldría diciendo «tu plan Pro llega hasta 13».
   *
   * Este servicio no lo interpreta ni lo valida — es una cadena que viaja hasta
   * el `details` del error—, así que un plan nuevo no obliga a tocarlo.
   */
  planTier?: string | null;
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
  /**
   * Los archivos que acompañan a la pregunta, **por id**.
   *
   * 🔴 **Antes venían aquí en base64 y no cabían.** La pregunta viaja por una
   * Server Action, cuyo cuerpo está topado en 1 MB: cualquier foto de teléfono
   * moría con un «Body exceeded 1 MB limit» de Next, sin traducir y sin decir
   * qué archivo. Ahora se suben aparte —multipart, por `POST
   * /me/assistant/attachments`— y aquí solo llegan los ids de los borradores.
   */
  attachmentIds?: string[];
  /**
   * Los proyectos que esta persona puede abrir. **Solo en el modo sin foco.**
   *
   * Los resuelve el gateway con su sesión (`GET /projects?permission=
   * canViewReports`, la misma consulta que usa la pantalla) y sirven para dos
   * cosas: que el modelo pueda nombrarlos, y —lo que de verdad importa— que
   * `proponer_abrir_proyecto` se valide contra esta lista. Un id que no esté
   * aquí se descarta antes de llegar a la pantalla.
   */
  proyectos?: { id: string; nombre: string }[];
}

/**
 * Cuántas preguntas y cuántas opciones se aceptan de una vez.
 *
 * Más de tres preguntas juntas dejan de ser una conversación y pasan a ser un
 * formulario, y a un formulario se responde peor —y más tarde—. Ocho opciones es
 * donde una lista deja de leerse de un vistazo y hay que ponerse a buscar.
 */
const MAX_PREGUNTAS = 3;
const MAX_OPCIONES = 8;

/**
 * Cuántas columnas admite un tablero propuesto, y cuál es el verde.
 *
 * Ocho es el techo antes de que un tablero deje de mantenerse solo; un flujo
 * normal son tres o cuatro.
 *
 * ⚠️ `success` **no es un color, es un estado**: una tarea en una columna verde
 * cuenta como cerrada en los informes y deja de avisar aunque esté vencida
 * (`DONE_COLUMN_COLOR`). Por eso solo puede haber una.
 */
/**
 * Cómo se llama cada propuesta en la frase de relleno.
 *
 * Solo se usa cuando el modelo no escribió nada, que debería ser la excepción.
 * En minúscula y con artículo porque encaja detrás de «Te propongo…».
 */
const NOMBRE_DE_PROPUESTA: Record<string, string> = {
  proponer_tarea: 'una tarea',
  proponer_tareas: 'un lote de tareas',
  proponer_borrados: 'un borrado de varias tareas',
  proponer_asignacion: 'un cambio de encargados',
  proponer_edicion: 'unos cambios en la tarea',
  proponer_movimiento: 'mover la tarea',
  proponer_checklist: 'unos pasos para la tarea',
  proponer_marcar_pasos: 'dar unos pasos por hechos',
  proponer_comentario: 'un comentario',
  proponer_mensaje: 'un mensaje para el equipo',
  proponer_borrado: 'borrar una tarea',
  proponer_tablero: 'un tablero con sus columnas',
  proponer_sprint: 'un sprint nuevo',
  proponer_iniciar_sprint: 'empezar un sprint',
  proponer_planificacion: 'repartir tareas entre backlog y sprint',
  proponer_documento: 'un documento nuevo',
  proponer_automatizacion: 'una automatizacion',
  proponer_estado_automatizacion: 'encender o pausar una automatizacion',
  proponer_mensaje_privado: 'un mensaje privado',
  proponer_revision_documento: 'una revision del documento',
  proponer_abrir_proyecto: 'abrir uno de tus proyectos',
  proponer_plantilla: 'la estructura de un proyecto nuevo',
};

/**
 * El techo de salida cuando el turno puede traer una plantilla de proyecto.
 *
 * 🔴 Con los 2048 de siempre, un plan grande —cuatro espacios, sus tableros, sus
 * columnas, seis roles con permisos y doce etiquetas— llega **cortado**: la API
 * marca `finishReason: MAX_TOKENS`, el JSON de la llamada a función queda a
 * medias y la validación lo descarta. Por fuera se ve como un asistente que no
 * ha sabido responder, sin un solo error en ninguna consola.
 */
const MAX_TOKENS_PLANTILLA = 8192;

const MAX_COLUMNAS = 8;
const COLOR_DE_CIERRE = 'success';
const COLORES_DE_COLUMNA = ['primary', 'accent', 'info', 'warning', 'error', 'success'];

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
    /** Solo en los tableros con Scrum. */
    scrum?: { sprintEnCurso: { nombre: string } | null };
  }[];
  /**
   * Los sprints que `consultar_sprints` enseñó en este turno. **No viene de
   * reports-service**: lo añade `conLoVisto` para validar, porque los ids de
   * sprint no están en el briefing.
   */
  sprintsVistos?: Map<string, SprintVisto>;
  /** Lo mismo con los documentos. */
  documentosVistos?: Map<string, DocumentoVisto>;
  /** Y con el catálogo y las reglas de automatización. */
  automatizaciones?: AutomatizacionesVistas;
  etiquetas: { id: string; nombre: string }[];
  /** El inventario con ids: lo que permite validar un `taskId` antes de enseñarlo. */
  tareas?: {
    id: string;
    titulo: string;
    descripcion?: string;
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

/**
 * Una tarea del inventario, tal y como la trae el briefing.
 *
 * ⚠️ **Se deriva de `Briefing` en vez de volver a escribirse.** Estaba
 * redeclarada a mano en el tipo de retorno de `tareaDeLaPropuesta` con cinco de
 * sus campos, y al añadir `proponer_borrado` —que necesita `pasos` y `cerrada`—
 * el compilador dijo que no existían **aunque sí estaban** en el objeto que
 * llega. Dos declaraciones de la misma forma solo coinciden hasta que alguien
 * toca una.
 */
type TareaDelBriefing = NonNullable<Briefing['tareas']>[number];

/**
 * Frases con las que el modelo dice que ya hay una propuesta preparada. Solo las
 * que afirman que existe —«he preparado», «te dejo»—, no un «te propongo que…»,
 * que es una sugerencia y no promete ninguna tarjeta.
 */
const PROPUESTA_PROMETIDA =
  /\b(he preparado|te he preparado|te dejo|aqu[ií] tienes|abajo tienes|debajo tienes)\b[^.]{0,40}\bpropuesta/i;

/** Vueltas de consulta como mucho en un turno, antes de la respuesta final (D2). */
const MAX_VUELTAS_DE_CONSULTA = 4;
/**
 * Tokens de entrada acumulados a partir de los cuales ya no se consulta más (D2).
 * Cada vuelta reenvía el contexto entero, así que el coste crece con cada una.
 */
const PRESUPUESTO_DE_ENTRADA = 120_000;

export type UsoDelTurno = NonNullable<AssistantChatResult['uso']>;

/** Lo que cuenta un turno mientras ocurre (D7). */
export type EventoDeTurno =
  | { tipo: 'inicio'; conversationId: string }
  | ({ tipo: 'paso' } & PasoDePensamiento)
  | { tipo: 'texto'; delta: string }
  | { tipo: 'fin'; resultado: AssistantChatResult };

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
    private readonly adjuntos: AttachmentsService,
    private readonly consultas: ConsultasService,
    private readonly router: RouterDeContexto,
    private readonly openrouter: OpenRouterClient,
  ) {
    this.reportsClient = ClientProxyFactory.create(opcionesDeCliente('REPORTS', this.config));
  }

  /** Cuánto lleva gastado. Lo pide la página al cargar, para pintar el contador. */
  estadoCuota(userId: string, limiteMensual?: number | null, organizationId?: string | null) {
    return this.quota.estado(userId, limiteMensual, organizationId);
  }

  /* 🕳️ Los cinco delegadores del sistema de planes viejo. Ver el hueco de
     `assistant.controller.ts` y `docs/AUDITORIA-PLANES.md`. */

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
    return this.turno(payload, () => {});
  }

  /**
   * El mismo turno, contado mientras ocurre (D7 de docs/PLAN-PRAX-SEMIAGENTICO.md).
   *
   * Emite `inicio` con la conversación, un `paso` por cada consulta, el `texto`
   * según llega de Gemini y, al final, `fin` con el resultado entero —las
   * propuestas ya guardadas y con id—. Un fallo sale como error del Observable,
   * con la misma forma que el de `chat`.
   *
   * Es el mismo código que `chat`, no una copia: `chat` es este turno sin nadie
   * escuchando los eventos.
   */
  chatEnVivo(payload: ChatPayload): Observable<EventoDeTurno> {
    return new Observable<EventoDeTurno>((suscriptor) => {
      let vivo = true;
      this.turno(payload, (evento) => {
        if (vivo) suscriptor.next(evento);
      })
        .then((resultado) => {
          if (!vivo) return;
          suscriptor.next({ tipo: 'fin', resultado });
          suscriptor.complete();
        })
        .catch((error) => {
          if (vivo) suscriptor.error(error);
        });
      return () => {
        vivo = false;
      };
    });
  }

  private async turno(
    payload: ChatPayload,
    emitir: (evento: EventoDeTurno) => void,
  ): Promise<AssistantChatResult> {
    /* El pensamiento: cada paso se emite al ocurrir y se guarda con la
       respuesta, para desplegarlo igual al releer (ver `pensamiento.ts`). */
    const inicio = Date.now();
    const pasos: PasoDePensamiento[] = [];
    const contar = (nuevo: PasoDePensamiento) => {
      pasos.push(nuevo);
      emitir({ tipo: 'paso', ...nuevo });
    };
    const cuotaPrevia = await this.quota.estado(
      payload.userId,
      payload.limiteMensual,
      payload.organizationId,
    );

    if (cuotaPrevia.usados >= cuotaPrevia.limite) {
      throw cuotaAgotada(cuotaPrevia, payload.planTier);
    }

    const conversationId = await this.conversaciones.resolver(
      payload.userId,
      payload.projectId,
      payload.message,
      payload.conversationId,
      payload.organizationId,
    );
    emitir({ tipo: 'inicio', conversationId });
    const history = await this.conversaciones.historial(conversationId);
    if (history.length > 0) {
      contar(paso('contexto', 'Releyendo la conversación', `${history.length} mensajes`));
    }

    /**
     * ⚠️ **Sin foco no se pide briefing, y no es una optimización.**
     *
     * `report_briefing` cuelga de un `projectId`: llamarlo con `null` sería
     * pedirle a reports-service el inventario de nada. Todo lo que se deriva de
     * él —las cifras, las tareas, la gente, las etiquetas— tampoco existe en
     * este modo, y esa es exactamente la diferencia que la regla 18 del prompt
     * le tiene que dejar clara al modelo.
     */
    const briefing = payload.projectId
      ? await firstValueFrom(
          this.reportsClient.send<Briefing>(
            { cmd: 'report_briefing' },
            {
              projectId: payload.projectId,
              /* La línea de `canViewReports`, resuelta por el gateway. Lo que no se
                 trae no se puede filtrar mal más adelante. */
              incluirPersonas: payload.permisos.canViewReports === true,
            },
          ),
        )
      : null;

    /**
     * Sin proyecto no hay permisos que filtrar: las tres de este modo no tocan
     * datos de ninguno. Ver `herramientasSinProyecto`.
     */
    const herramientas = briefing ? herramientasPara(payload.permisos) : herramientasSinProyecto();
    if (briefing) {
      const nombreDelProyecto =
        (briefing as { proyecto?: { nombre?: string } }).proyecto?.nombre ?? 'el proyecto';
      const tareasVistas = (briefing as { tareas?: unknown[] }).tareas?.length ?? 0;
      contar(
        paso(
          'contexto',
          `Leyendo el estado de «${nombreDelProyecto}»`,
          tareasVistas > 0 ? `${tareasVistas} tareas` : undefined,
        ),
      );
    }

    /**
     * Los archivos, repartidos en dos montones.
     *
     * ⚠️ **PDF e imágenes van como datos; texto y Markdown, como texto.** No es
     * una optimización: mandar un `.md` como `inlineData` funciona, pero el
     * modelo lo trata como un documento adjunto y responde *sobre* él en vez de
     * *con* él. Pegado en el prompt, con su nombre delante, se lee como parte de
     * lo que se le está contando — que es lo que se quiere cuando alguien manda
     * unas notas y pide sacar tareas de ahí.
     */
    const adjuntos = await this.adjuntos.paraElTurno(payload.userId, payload.attachmentIds ?? []);
    const { archivos, textos } = this.repartirAdjuntos(adjuntos);
    for (const adjunto of adjuntos) {
      contar(paso('lectura', `Leyendo «${adjunto.name}»`));
    }

    /**
     * Con qué modelo se responde.
     *
     * gpt-oss solo lee texto: con una imagen o un PDF delante, el turno lo
     * responde Gemini. Y sin clave de OpenRouter en el servidor, también. Las
     * dos cosas se dicen en el pensamiento: elegir un modelo y que conteste otro
     * sin avisar es la clase de cosa que hace desconfiar del selector.
     */
    let modelo: AssistantModelo = 'gemini';
    if (payload.modelo === 'gpt-oss') {
      if (!this.openrouter.disponible) {
        contar(paso('ruta', 'GPT-OSS no está configurado aquí', 'respondo con Gemini'));
      } else if (archivos.length > 0) {
        contar(paso('ruta', 'GPT-OSS no lee imágenes ni PDF', 'este turno lo responde Gemini'));
      } else {
        modelo = 'gpt-oss';
      }
    }
    const llm: Pick<GeminiClient, 'chat'> = modelo === 'gpt-oss' ? this.openrouter : this.gemini;

    const mensajeConArchivos =
      textos.length > 0 ? `${payload.message}\n\n${textos}` : payload.message;

    /* Quién pregunta sale de la lista de miembros que ya llega resuelta: no hace
       falta ninguna consulta más. Sin foco el gateway manda ahí a esa persona
       sola, que es lo único que se puede saber sin proyecto. Si no estuviera
       —no debería pasar— el prompt omite el bloque en vez de mentir con un id. */
    const quienPregunta = payload.miembros.find((miembro) => miembro.userId === payload.userId);

    /* Qué contexto viaja en este turno (D10). El briefing del prompt puede ir
       sin inventario; el completo se queda para validar las propuestas. */
    const decision = await this.router.decidir({
      mensaje: payload.message,
      conProyecto: Boolean(briefing),
    });
    contar(
      pasoDeRuta(
        decision.intencion ?? intencionPorPalabras(payload.message),
        decision.incluirInventario,
      ),
    );
    const briefingParaPrompt =
      briefing && !decision.incluirInventario
        ? {
            ...briefing,
            tareas: [],
            tareasOmitidas: undefined,
            inventarioOmitido: true,
          }
        : briefing;

    /* Sin foco, los proyectos de «Recursos» van con sus espacios y tableros
       por nombre: así «el tablero Desarrollo» se encuentra sin preguntar. */
    const proyectosConIndice: {
      id: string;
      nombre: string;
      espacios?: { nombre: string; tableros: string[] }[];
    }[] =
      !briefing && (payload.proyectos?.length ?? 0) > 0
        ? await this.consultas.indiceDeProyectos(payload.proyectos ?? [])
        : (payload.proyectos ?? []);
    if (!briefing && proyectosConIndice.some((p) => p.espacios)) {
      const tableros = proyectosConIndice
        .flatMap((p) => p.espacios ?? [])
        .reduce((n, e) => n + e.tableros.length, 0);
      contar(paso('contexto', 'Mirando tus proyectos', `${tableros} tableros`));
    }
    const instruccionBase = briefingParaPrompt
      ? systemInstruction(
          briefingParaPrompt,
          payload.miembros,
          herramientas.map((herramienta) => herramienta.name),
          payload.chat ?? [],
          quienPregunta,
          catalogoDeCapacidades(payload.permisos),
        )
      : instruccionSinProyecto(
          proyectosConIndice,
          herramientas.map((herramienta) => herramienta.name),
          quienPregunta,
          (payload.proyectos?.length ?? 0) > 0,
        );

    /* D9: el hilo se corta a los últimos mensajes y el modelo tiene que saberlo.
       Sin esto, a «¿qué te dije al principio?» contestaba como si lo hubiera
       leído todo. */
    const mensajesDelHilo = await this.conversaciones.contar(conversationId);
    const instruccion =
      mensajesDelHilo > history.length
        ? `${instruccionBase}\n\nNOTA SOBRE EL HILO: esta conversacion tiene ${mensajesDelHilo} ` +
          `mensajes y solo ves los ultimos ${history.length}. Si te preguntan por algo anterior, ` +
          'di que no lo tienes delante en vez de suponerlo.'
        : instruccionBase;

    /* Sobre qué se puede consultar (D3). Con foco, ese proyecto; sin foco, los de
       «Recursos», que ya llegan filtrados por el gateway. Sin ninguno, no se
       declaran las consultas: una herramienta que siempre responde «no tienes
       acceso» solo invita al modelo a intentarlo. */
    const ambito: AmbitoDeConsulta = {
      foco: payload.projectId,
      proyectos: payload.projectId
        ? [
            {
              id: payload.projectId,
              nombre:
                (briefing as { proyecto?: { nombre?: string } } | null)?.proyecto?.nombre ??
                'este proyecto',
            },
          ]
        : (payload.proyectos ?? []),
      nombres: Object.fromEntries(payload.miembros.map((m) => [m.userId, m.nombre])),
      vistas: new Map(),
      sprintsVistos: new Map(),
      documentosVistos: new Map(),
      permisos: payload.permisos,
    };
    const conConsultas = ambito.proyectos.length > 0;
    const todasLasHerramientas = conConsultas
      ? [...HERRAMIENTAS_DE_CONSULTA, ...herramientas]
      : herramientas;

    const uso: UsoDelTurno = {
      entrada: 0,
      salida: 0,
      razonamiento: 0,
      cache: 0,
      vueltas: 0,
      contexto: 0,
      tokensPrax: 0,
    };
    const sumarUso = (parcial?: UsoDeGemini) => {
      uso.vueltas += 1;
      if (!parcial) return;
      if (uso.vueltas === 1) uso.contexto = parcial.entrada;
      uso.entrada += parcial.entrada;
      uso.salida += parcial.salida;
      uso.razonamiento += parcial.razonamiento;
      uso.cache += parcial.cache;
    };

    /* El texto de varias vueltas se lee como uno: entre vuelta y vuelta, un
       párrafo nuevo, y solo si las dos escribieron algo. */
    let escrito = '';
    let redactando = false;
    const alTexto = (delta: string) => {
      if (!delta) return;
      if (!redactando) {
        redactando = true;
        contar(paso('redaccion', 'Redactando la respuesta'));
      }
      if (escrito && !escrito.endsWith('\n') && pendienteDeSeparar) {
        escrito += '\n\n';
        emitir({ tipo: 'texto', delta: '\n\n' });
      }
      pendienteDeSeparar = false;
      escrito += delta;
      emitir({ tipo: 'texto', delta });
    };
    let pendienteDeSeparar = false;

    const llamadas: { name: string; args: Record<string, unknown> }[] = [];
    let cuota;
    try {
      /**
       * El bucle de consultas (D1 y D2).
       *
       * Cada vuelta, el modelo puede pedir consultas `consultar_*`: se ejecutan
       * aquí, su resultado vuelve en la siguiente, y así hasta que conteste sin
       * pedir más. Las `proponer_*` **no se ejecutan nunca**: se recogen y se
       * validan al final, como siempre.
       *
       * Topes duros: `MAX_VUELTAS_DE_CONSULTA` y `PRESUPUESTO_DE_ENTRADA`. Al
       * tocar uno, la última vuelta va **sin consultas** y con una nota que se
       * lo dice al modelo, para que conteste con lo que tiene y diga qué no
       * miró. Un tope que no se dice es un recorte mudo.
       */
      const extra: GeminiContent[] = [];
      for (let vuelta = 0; ; vuelta += 1) {
        const agotado = vuelta >= MAX_VUELTAS_DE_CONSULTA || uso.entrada >= PRESUPUESTO_DE_ENTRADA;
        let respuesta: Awaited<ReturnType<GeminiClient['chat']>>;
        try {
          respuesta = await llm.chat(
            {
              system: instruccion,
              history,
              archivos,
              message: mensajeConArchivos,
              tools: agotado ? herramientas : todasLasHerramientas,
              extra,
              /* 🔴 Siempre el techo alto. Con 2048 en modo proyecto, el
                 razonamiento de Gemini sale del mismo presupuesto: con un
                 contexto grande pensaba mucho y la respuesta se cortaba a
                 media frase («De las 35 tareas del documento,»). El techo no
                 cuesta: se paga lo que se escribe, no lo que se permite. */
              maxOutputTokens: MAX_TOKENS_PLANTILLA,
            },
            alTexto,
            (segundos) =>
              contar(paso('espera', 'El proveedor va saturado', `reintento en ${segundos} s`)),
          );
        } catch (error) {
          /**
           * 🔴 **Una vuelta que falla a mitad no tira lo que ya se escribió.**
           *
           * Antes el turno entero se perdía: PRAX había escrito «¿te refieres a
           * X?», pedía una consulta, la siguiente vuelta daba 429 y en pantalla
           * el texto desaparecía, sustituido por un error — «me hizo una
           * pregunta y se fue». Si ya hay texto, se cierra el turno con él y se
           * dice que no se pudo seguir mirando.
           */
          if (vuelta === 0 || !escrito.trim() || !(error instanceof GeminiError)) throw error;
          this.log.warn(
            `prax_vuelta_fallida vuelta=${vuelta} ${error.message}: se cierra con lo escrito`,
          );
          alTexto(
            '\n\n_(No he podido terminar de consultar: el proveedor de IA está saturado. ' +
              'Vuelve a preguntarme en un momento si necesitas el resto.)_',
          );
          break;
        }
        sumarUso(respuesta.uso);
        pendienteDeSeparar = true;
        /* Cortada por longitud: se dice, en vez de dejar la frase a medias
           como si hubiera terminado (I3: ningún recorte mudo). */
        if (respuesta.cortada) {
          this.log.warn(`prax_respuesta_cortada vuelta=${vuelta} salida=${respuesta.uso?.salida}`);
          alTexto('\n\n_(Me he quedado sin espacio para terminar. Dime «sigue» y continúo.)_');
        }

        const consultas = respuesta.calls.filter((call) => esConsulta(call.name));
        llamadas.push(...respuesta.calls.filter((call) => !esConsulta(call.name)));
        if (consultas.length === 0 || agotado) break;

        extra.push({ role: 'model', parts: respuesta.partes });
        const devueltas: GeminiContent['parts'] = [];
        for (const consulta of consultas) {
          const resultado = await this.consultas.ejecutar(consulta.name, consulta.args, ambito);
          contar(
            paso(
              'consulta',
              this.consultas.descripcion(consulta.name, consulta.args, ambito),
              resumenDeConsulta(consulta.name, resultado),
            ),
          );
          devueltas.push({ functionResponse: { name: consulta.name, response: resultado } });
          /* La siguiente vuelta vuelve a redactar: su primer trozo es un paso nuevo. */
          redactando = false;
        }
        extra.push({ role: 'user', parts: devueltas });

        const siguienteAgota =
          vuelta + 1 >= MAX_VUELTAS_DE_CONSULTA || uso.entrada >= PRESUPUESTO_DE_ENTRADA;
        if (siguienteAgota) {
          extra.push({
            role: 'user',
            parts: [
              {
                text:
                  '[SISTEMA]: Ya no puedes consultar mas en este turno. Responde con lo que ' +
                  'tienes y di con claridad que parte no llegaste a mirar.',
              },
            ],
          });
        }
      }

      if (uso.vueltas > 1) {
        this.log.log(
          `prax_bucle vueltas=${uso.vueltas} entrada=${uso.entrada} salida=${uso.salida} ` +
            `razonamiento=${uso.razonamiento}`,
        );
      }

      /* Se cobra lo que se gastó de verdad, en tokens PRAX (D8). Antes del turno
         de recuperación, que no se cobra: es culpa nuestra, no de quien pregunta. */
      uso.tokensPrax = tokensPrax(uso, modelo);
      cuota = await this.quota.consumir(
        payload.userId,
        payload.limiteMensual,
        payload.organizationId,
        uso.tokensPrax,
      );
    } catch (error) {
      if (error instanceof RpcException) {
        const details = (error.getError() as any).details || {};
        throw new RpcException({
          ...((error.getError() as any) || {}),
          details: { ...details, conversationId },
        });
      }

      /**
       * 🔴 **Aquí se perdía el motivo real de todos los fallos del asistente.**
       *
       * Esto capturaba cualquier cosa que no fuera `RpcException` y la
       * sustituía por un `500 'Error del asistente.'`. Un `GeminiError` no es
       * una `RpcException`, así que **caía aquí siempre** — y con él caía el
       * trabajo entero de `mensajeDelFallo()`, que distingue un límite por
       * minuto de un tope de gasto agotado y una clave mal configurada de una
       * sobrecarga pasajera.
       *
       * El remate estaba en el cliente: `describe()` devuelve el mensaje del
       * servidor salvo en los 5xx que no son 502, así que ese 500 se convertía
       * en «El asistente no ha podido responder. Inténtalo otra vez.» — el
       * mismo texto para «Google va saturado», «la clave del despliegue no
       * vale» y «se acabó el presupuesto del mes».
       *
       * Ahora `comoRpc()` clasifica —`GeminiError` sale como **502 con su
       * mensaje**— y lo que llega a la burbuja dice qué ha pasado de verdad.
       */
      throw AssistantService.comoRpc(error, { conversationId });
    }

    const respuesta = { calls: llamadas, text: escrito.trim() };
    const briefingParaValidar = briefing ? this.conLoVisto(briefing, ambito) : null;
    let validadas = respuesta.calls
      .map((call) =>
        briefingParaValidar
          ? this.validarPropuesta(call, briefingParaValidar, payload)
          : this.validarSinProyecto(call, payload),
      )
      .filter((propuesta): propuesta is AssistantProposal => propuesta !== null);

    let reply = respuesta.text;

    // Si falló alguna propuesta, o si no escribió texto habiendo propuesto algo,
    // intentamos un segundo turno automático para que el modelo se corrija o explique.
    const invalidasCount = respuesta.calls.length - validadas.length;
    /**
     * La propuesta fantasma: el texto dice «he preparado una propuesta» y no
     * hubo ninguna llamada. Pasó en la primera prueba contra Gemini de verdad
     * (con `gemini-flash-lite-latest`): la persona lee que tiene una tarjeta
     * esperando y debajo no hay nada. Se trata como una propuesta inválida:
     * turno de recuperación, que la llame o que corrija lo que dijo.
     */
    const propuestaFantasma =
      respuesta.calls.length === 0 && herramientas.length > 1 && PROPUESTA_PROMETIDA.test(reply);
    /* 🔴 Ya no se corrige «propuso sin escribir nada»: la tarjeta se explica
       sola (`textoPorDefecto` la nombra) y el turno de corrección, sin ver las
       consultas del turno, volvía a proponer — un lote de 35 al lado de la
       tarea suelta, en otra columna (2026-09-30, gpt-oss). Solo se corrige lo
       que está mal: propuestas descartadas o prometidas y no hechas. */
    /**
     * Un lote que salió de una en una: piden un backlog, una lista, «todas»…
     * y llega UNA `proponer_tarea`. gpt-oss lo hacía con el backlog adjunto:
     * TEC-01 y nada más. Se le pide rehacerlo como `proponer_tareas`; al
     * juntarlas (`fundirLotes`) la suelta entra en el lote o se descarta.
     */
    /* También lo pedido antes: tras «abrir proyecto», el turno que propone es
       «Sigue con lo que te pedí», y el backlog venía dos mensajes atrás. */
    const pedidoReciente = [
      payload.message,
      ...history
        .filter((turno) => turno.role !== 'model')
        .slice(-3)
        .map((turno) => turno.text),
    ].join('\n');
    const pidenVarias =
      adjuntos.length > 0 || /\b(backlog|todas|tareas|historias|lista)\b/i.test(pedidoReciente);
    const loteDeUna =
      pidenVarias &&
      validadas.length === 1 &&
      validadas[0].tool === 'proponer_tarea' &&
      herramientas.some((h) => h.name === 'proponer_tareas');
    if (invalidasCount > 0 || propuestaFantasma || loteDeUna) {
      /* ⚠️ **Este turno cuesta una llamada entera más**, y hasta ahora no se
         veía en ninguna parte: una conversación donde el modelo falla al
         validar en cada mensaje paga el doble sin que nadie pueda notarlo hasta
         la factura. Se registra para poder medirlo. */
      contar(
        paso(
          'correccion',
          invalidasCount > 0
            ? 'Una propuesta no pasó la validación'
            : 'Revisando que la respuesta cuadre',
          'lo corrijo',
        ),
      );
      this.log.log(
        `assistant_turno_recuperacion invalidas=${invalidasCount} ` +
          `llamadas=${respuesta.calls.length} sinTexto=${!reply}`,
      );
      try {
        const feedback: string[] = [];
        if (invalidasCount > 0) {
          feedback.push(
            'Has intentado usar herramientas, pero fallaron la validación (quizá referenciaste un id que no existe o usaste mal los parámetros) y fueron descartadas.',
          );
        }
        if (loteDeUna) {
          feedback.push(
            'Has propuesto UNA sola tarea, pero te piden todas las del origen. Llama AHORA a proponer_tareas con TODAS ellas (incluida la que ya propusiste) en una sola llamada, en la misma columna, conservando su nomenclatura en el titulo y sus puntos en estimatePoints.',
          );
        }
        if (propuestaFantasma) {
          feedback.push(
            'Has escrito que preparabas una propuesta, pero NO has llamado a ninguna herramienta: la persona no ve ninguna tarjeta. Llama ahora a la herramienta proponer_* que corresponda, o si no puedes, di que no la has preparado.',
          );
        }
        if (!reply) {
          feedback.push(
            'Has emitido una llamada a herramienta pero NO has escrito ningún mensaje de texto para el usuario. Recuerda la regla imperativa: ESCRIBE SIEMPRE ALGO, explicando qué haces o por qué no puedes.',
          );
        }
        feedback.push(
          'Por favor, genera ahora una respuesta en texto para el usuario explicando la situación o dándole alternativas.',
        );

        const historyRecuperacion = [
          ...(history || []),
          { role: 'user', text: mensajeConArchivos },
          {
            role: 'model',
            text: reply ? `${reply}\n[Llamada a herramientas...]` : '[Llamada a herramientas...]',
          },
        ];

        const segundaRespuesta = await llm.chat(
          {
            system: briefing
              ? systemInstruction(
                  briefing,
                  payload.miembros,
                  herramientas.map((herramienta) => herramienta.name),
                  payload.chat ?? [],
                  quienPregunta,
                  catalogoDeCapacidades(payload.permisos),
                )
              : instruccionSinProyecto(
                  proyectosConIndice,
                  herramientas.map((herramienta) => herramienta.name),
                  quienPregunta,
                  (payload.proyectos?.length ?? 0) > 0,
                ),
            history: historyRecuperacion,
            message: `[SISTEMA INTERNO]: ${feedback.join(' ')}`,
            tools: herramientas,
            ...(briefing ? {} : { maxOutputTokens: MAX_TOKENS_PLANTILLA }),
          },
          /* Sin streaming: su texto decide abajo si entra o no. */
          undefined,
        );
        sumarUso(segundaRespuesta.uso);

        const nuevasValidadas = segundaRespuesta.calls
          .map((call) =>
            briefingParaValidar
              ? this.validarPropuesta(call, briefingParaValidar, payload)
              : this.validarSinProyecto(call, payload),
          )
          .filter((propuesta): propuesta is AssistantProposal => propuesta !== null);

        /* Sin repetidas: el turno de recuperación ve la llamada anterior y a
           menudo vuelve a emitir también las que ya habían pasado, y salían dos
           tarjetas iguales —aceptar las dos crea la tarea dos veces—. */
        /* La huella va **sin `porQue`**: el segundo turno repite la misma
           propuesta con otra explicación, y comparando el texto salían dos
           «Abrir Aura» (2026-09-30, gpt-oss). */
        const huella = (p: AssistantProposal) => {
          const { porQue: _porQue, ...resto } = p.args as Record<string, unknown>;
          return `${p.tool}:${JSON.stringify(resto)}`;
        };
        const yaEstan = new Set(validadas.map(huella));
        validadas = [...validadas, ...nuevasValidadas.filter((p) => !yaEstan.has(huella(p)))];
        /* 🔴 Si ya había texto y la corrección solo venía a poner la tarjeta
           que faltaba, su texto sobra: repetía la explicación y la respuesta
           salía con el mismo párrafo dos veces (2026-09-30, Gemini). El texto
           nuevo solo se añade si no había ninguno o si hay que explicar por qué
           algo se descartó. */
        const soloFaltabaLaTarjeta =
          Boolean(reply) && invalidasCount === 0 && nuevasValidadas.length > 0;
        if (!soloFaltabaLaTarjeta) {
          reply = reply + (reply && segundaRespuesta.text ? '\n\n' : '') + segundaRespuesta.text;
        }
      } catch (err) {
        this.log.warn(`Fallo en el turno de recuperación: ${err}`);
      }
    }

    /**
     * 🔴 **Si pregunta, solo pregunta.** Una pregunta dice que todavía no sabe
     * qué hacer, así que no puede venir con acciones al lado: salían «¿en qué
     * tablero?» y las 35 tareas en la misma tarjeta, y al contestar se
     * proponía otra cosa encima. Y dos preguntas iguales eran dos tarjetas con
     * lo mismo. Queda la primera pregunta; la respuesta dispara el turno que
     * propone (2026-09-30, gpt-oss).
     */
    const preguntas = validadas.filter((p) => p.tool === 'proponer_pregunta');
    if (preguntas.length > 0 && validadas.length > 1) {
      this.log.warn(
        `prax_pregunta_con_mas_propuestas total=${validadas.length} preguntas=${preguntas.length}: queda una`,
      );
      validadas = [preguntas[0]];
    }

    validadas = this.fundirLotes(validadas);

    reply = reply || this.textoPorDefecto(validadas);
    for (const propuesta of validadas) contar(pasoDePropuesta(propuesta.tool, propuesta.args));
    const pensamiento = { pasos, ms: Date.now() - inicio, modelo };

    /* Las propuestas vuelven **con su id**: es lo que necesita el cliente para
       marcarlas como aceptadas o descartadas después. */
    const proposals = await this.conversaciones.guardarTurno({
      conversationId,
      projectId: payload.projectId,
      /**
       * ⚠️ **Se guarda lo que la persona escribió, no el mensaje con los
       * archivos pegados.** El hilo tiene que leerse como una conversación, y un
       * turno con cuarenta mil caracteres de un `.md` dentro no se lee: además,
       * al releerlo se reenviaría entero al modelo en cada turno posterior.
       *
       * ⚠️ **Y ya no es el precio que era.** Cuando esto se escribió, el archivo
       * no sobrevivía al turno: lo que quedaba era lo que PRAX hubiera dicho de
       * él. Desde `Attachment.extract`, el texto se guarda con el adjunto y
       * `historial()` lo vuelve a poner, así que un documento sigue delante
       * mientras el presupuesto lo permita. Lo que sigue sin sobrevivir es una
       * **imagen** —sus bytes viajan con este turno y no se reenvían— y por eso
       * la regla 17 le pide a PRAX contar qué ve en ella.
       */
      pregunta: payload.message,
      respuesta: reply,
      proposals: validadas,
      uso,
      pensamiento,
      userId: payload.userId,
      /* Los que de verdad llegaron a leerse: uno cuyo blob se hubiera perdido no
         sale de `paraElTurno`, y atarlo al mensaje pondría en la burbuja un
         archivo que no se puede abrir. */
      attachmentIds: adjuntos.map((adjunto) => adjunto.id),
    });

    return {
      conversationId,
      reply,
      proposals: proposals as unknown as AssistantProposal[],
      cuota,
      uso,
      pensamiento,
    };
  }

  /**
   * El borrador de plantilla para un proyecto que **todavía no existe**.
   *
   * Es el mismo contrato de siempre —la IA propone, no ejecuta— con dos
   * diferencias que salen de que no haya proyecto:
   *
   * - **No hay briefing ni permisos que consultar.** Nada que validar contra un
   *   contexto, porque no hay contexto: el modelo solo pone nombres y los ids
   *   los devuelve el servidor a medida que el frontend va creando cada cosa.
   * - **No se guarda como propuesta.** Las filas de `assistant_proposals`
   *   cuelgan de una conversación, y una conversación cuelga de un proyecto. Se
   *   devuelve y vive en la pantalla hasta que se acepta o se cierra.
   *
   * Lo que **sí** es idéntico es el orden de los pasos, y por los mismos
   * motivos que en `chat`: la cuota se comprueba antes de llamar a Gemini —para
   * no gastar dinero en una respuesta que se va a tirar— y se consume después y
   * solo si respondió bien.
   */
  async borradorDePlantilla(payload: {
    userId: string;
    brief: string;
    /** Qué cambiar del plan anterior. Con `previa`, ajusta en vez de rehacer. */
    ajuste?: string;
    /** El plan anterior en JSON, tal cual se le devolvió al cliente. */
    previa?: string;
    /** El tope mensual de su plan. Ver `ChatPayload.limiteMensual`. */
    limiteMensual?: number | null;
    /** Dónde se gasta. Ver `ChatPayload.organizationId`. */
    organizationId?: string | null;
    /** Qué plan lo puso. Ver `ChatPayload.planTier`. */
    planTier?: string | null;
  }) {
    const cuotaPrevia = await this.quota.estado(
      payload.userId,
      payload.limiteMensual,
      payload.organizationId,
    );

    if (cuotaPrevia.usados >= cuotaPrevia.limite) {
      throw cuotaAgotada(cuotaPrevia, payload.planTier);
    }

    /**
     * Ajustar es un segundo turno, no una segunda llamada suelta.
     *
     * Se le devuelve el plan anterior **como su propio turno** y el ajuste como
     * el siguiente mensaje. Sin eso, pedir «quítale el espacio de marketing»
     * llegaría sin nada que quitar y el modelo rehacía el plan entero desde el
     * brief, perdiendo por el camino todo lo demás que ya estaba bien.
     *
     * El plan viaja en JSON y no redactado: es lo que el modelo acaba de
     * producir con esa misma forma, así que reconoce la estructura y la
     * devuelve igual en vez de reinterpretarla.
     */
    const ajustando = Boolean(payload.ajuste?.trim() && payload.previa?.trim());

    const respuesta = await this.gemini.chat({
      system: instruccionDePlantilla(),
      history: ajustando
        ? [
            { role: 'user', text: payload.brief },
            { role: 'model', text: `Propuse esta plantilla:\n${payload.previa}` },
          ]
        : [],
      message: ajustando ? (payload.ajuste as string) : payload.brief,
      tools: [PROPONER_PLANTILLA],
      maxOutputTokens: MAX_TOKENS_PLANTILLA,
    });

    /* Si Gemini falló, `chat` ya lanzó: la cuota no se toca. Ver `GeminiError`. */
    const cuota = await this.quota.consumir(
      payload.userId,
      payload.limiteMensual,
      payload.organizationId,
      respuesta.uso ? tokensPrax(respuesta.uso) : 0,
    );

    /**
     * La primera llamada válida, y solo esa.
     *
     * El prompt pide una, pero un modelo que se pone creativo devuelve dos
     * variantes y quedarse con la última sería quedarse con la que le pareció
     * peor. Si no llamó a nada, es un 502 y no una respuesta vacía: una pantalla
     * de creación sin plantilla no tiene nada que enseñar.
     */
    const plantilla = respuesta.calls.map((call) => validarPlantilla(call)).find(Boolean);

    if (!plantilla) {
      this.log.warn('El modelo no devolvio ninguna plantilla utilizable');
      throw new RpcException({
        statusCode: 502,
        message:
          'El asistente no ha sabido proponer una plantilla. ' +
          'Prueba a contarle un poco mas sobre el proyecto.',
        details: { cuota },
      });
    }

    return { plantilla, cuota };
  }

  /**
   * Las conversaciones, delegadas. El gateway habla con este servicio.
   *
   * ⚠️ **Ninguna lleva ya `projectId`.** Son de la persona, no del proyecto: el
   * proyecto es el foco de cada turno y puede cambiar a mitad. La clave de acceso
   * sigue siendo el `userId`, que es lo que impide leer un hilo ajeno.
   */
  esConversacionDe(userId: string, conversationId: string) {
    return this.conversaciones.esDe(userId, conversationId);
  }

  listarConversaciones(userId: string, ambito?: AmbitoDeOrganizacion) {
    return this.conversaciones.listar(userId, ambito);
  }

  detalleConversacion(userId: string, conversationId: string, ambito?: AmbitoDeOrganizacion) {
    return this.conversaciones.detalle(userId, conversationId, ambito);
  }

  renombrarConversacion(userId: string, conversationId: string, title: string) {
    return this.conversaciones.renombrar(userId, conversationId, title);
  }

  borrarConversacion(userId: string, conversationId: string) {
    return this.conversaciones.borrar(userId, conversationId);
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
    /**
     * ⚠️ **Preguntar no es proponer**, y la frase tiene que distinguirlo.
     *
     * Con una tarjeta de preguntas, «Te propongo esto. Revísalo antes de
     * aceptar» es sencillamente falso: no hay nada que aceptar ni que revisar,
     * hay algo que contestar. Y como el modelo suele devolver la llamada sin una
     * palabra, esta frase es la que se lee de verdad la mayoría de las veces.
     */
    const soloPreguntas = propuestas.every((propuesta) => propuesta.tool === 'proponer_pregunta');
    if (soloPreguntas && propuestas.length > 0) {
      return 'Antes de seguir necesito que me aclares una cosa.';
    }

    /**
     * ⚠️ **Esto es un último recurso, no la respuesta normal.**
     *
     * La regla 2 bis le pide al modelo escribir siempre una frase antes de
     * llamar a una herramienta, precisamente porque este texto es lo que se lee
     * cuando no lo hace — y es idéntico para un tablero, un borrado y un
     * gráfico: correcto y completamente vacío.
     *
     * Se mejora lo que se puede mejorar desde aquí, que es **nombrar qué se
     * propone** en vez de decir «esto». No sustituye a que el modelo explique de
     * dónde sale; solo hace que el peor caso sea menos malo.
     */
    if (propuestas.length === 1) {
      const que = NOMBRE_DE_PROPUESTA[propuestas[0].tool];
      return que
        ? `Te propongo ${que}. Revísalo antes de aceptar.`
        : 'Te propongo esto. Revísalo antes de aceptar.';
    }
    if (propuestas.length > 1) {
      return `Te propongo ${propuestas.length} cambios. Revisa cada uno antes de aceptarlo.`;
    }

    /**
     * ⚠️ **Sin texto y sin propuestas.** Decía «No he sabido responder a eso», y
     * era la peor frase de todo el sistema: culpa a la persona por su pregunta
     * cuando lo que ha pasado es que el modelo devolvió una llamada a función que
     * la validación descartó —una columna que no existe, una tarea de otro
     * proyecto— o simplemente se quedó callado.
     *
     * Ahora dice lo que de verdad pasó y **deja la puerta abierta**, que es lo
     * único que se puede hacer desde aquí: no hay forma de saber cuál de los dos
     * casos fue sin mirar los logs, pero los dos se arreglan igual, repitiéndolo
     * con más contexto.
     */
    return (
      'Me he quedado sin respuesta para eso. Puede que lo que iba a proponerte no ' +
      'encajara con el proyecto. Cuéntamelo de otra forma y lo intento otra vez.'
    );
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
  /**
   * Lo que se acepta de una conversación **sin proyecto**.
   *
   * Aparte de `validarPropuesta` porque aquella valida **contra el briefing**
   * —columnas, tareas, etiquetas, miembros— y aquí no hay ninguno: no es una
   * versión recortada de lo mismo, es que no hay nada contra qué comprobar salvo
   * la lista de proyectos.
   *
   * Las tres que caben, y qué se comprueba de cada una:
   *
   * | Herramienta | Qué la valida |
   * |---|---|
   * | `proponer_pregunta` | Lo mismo que en el otro modo — el método es el mismo |
   * | `proponer_abrir_proyecto` | Que el id esté en **la lista del gateway** |
   * | `proponer_plantilla` | `validarPlantilla`, que ya existía para el diálogo |
   */
  private validarSinProyecto(
    call: { name: string; args: Record<string, unknown> },
    payload: ChatPayload,
  ): AssistantProposal | null {
    if (call.name === 'proponer_pregunta') return this.validarPregunta(call);

    if (call.name === 'proponer_abrir_proyecto') {
      const pedido = String(call.args.projectId ?? '');
      const proyecto = (payload.proyectos ?? []).find((candidato) => candidato.id === pedido);

      /**
       * ⚠️ **Aquí es donde se cae un id inventado**, y es la única capa que hace
       * falta razonar: la lista la resolvió el gateway con la sesión de quien
       * pregunta, así que lo que no esté en ella o no existe o no es suyo. En
       * los dos casos la propuesta se descarta sin decirle al modelo cuál de los
       * dos era.
       */
      if (!proyecto) {
        this.log.warn(
          `El modelo propuso abrir ${pedido}, que no esta en los proyectos de la persona`,
        );
        return null;
      }

      return {
        tool: call.name,
        /* El nombre viaja con la propuesta para que la tarjeta no dependa de que
           el cliente tenga la lista cargada: al releer el hilo dentro de una
           semana, la tarjeta sigue diciendo de qué proyecto hablaba. */
        args: {
          projectId: proyecto.id,
          nombre: proyecto.nombre,
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    if (call.name === PROPONER_PLANTILLA.name) {
      const plantilla = validarPlantilla(call);
      if (!plantilla) {
        this.log.warn('El modelo propuso una plantilla que no paso la validacion: se descarta');
        return null;
      }
      return { tool: call.name, args: plantilla as unknown as Record<string, unknown> };
    }

    this.log.warn(`El modelo llamo a ${call.name}, que no se le habia declarado sin proyecto`);
    return null;
  }

  /**
   * Las preguntas con opciones, que valen en los dos modos.
   *
   * Estaba dentro de `validarPropuesta` y se saca aquí porque el modo sin
   * proyecto la necesita igual. Es la única herramienta que no depende de nada
   * del contexto: solo pide un dato.
   */
  private validarPregunta(call: {
    name: string;
    args: Record<string, unknown>;
  }): AssistantProposal | null {
    const crudas = Array.isArray(call.args.preguntas) ? call.args.preguntas : [];

    const preguntas = crudas
      .slice(0, MAX_PREGUNTAS)
      .map((cruda: unknown, indice: number) => {
        const pregunta = (cruda ?? {}) as Record<string, unknown>;
        const texto = String(pregunta.texto ?? '').trim();

        const opciones = (Array.isArray(pregunta.opciones) ? pregunta.opciones : [])
          .map((opcion: unknown) => String(opcion ?? '').trim())
          .filter((opcion: string) => opcion.length > 0)
          .slice(0, MAX_OPCIONES);

        if (!texto || opciones.length < 2) return null;

        return {
          /* El id lo pone el servidor y no el modelo: es lo que la tarjeta usa
             como clave de formulario, y un id repetido —o vacío— rompería el
             marcado sin que se note hasta que dos casillas se marcan a la vez. */
          id: `p${indice}`,
          texto: texto.slice(0, 200),
          tipo: pregunta.tipo === 'varias' ? 'varias' : 'una',
          opciones: opciones.map((opcion: string, i: number) => ({
            id: `o${i}`,
            texto: opcion.slice(0, 120),
          })),
        };
      })
      .filter(Boolean);

    if (preguntas.length === 0) {
      this.log.warn('El modelo propuso preguntas sin opciones suficientes: se descarta');
      return null;
    }

    return {
      tool: call.name,
      args: {
        preguntas,
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

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
          ...(this.puntosValidos(call.args.estimatePoints) !== null
            ? { estimatePoints: this.puntosValidos(call.args.estimatePoints) }
            : {}),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /* El lote: misma columna para todas, validada igual que la de una tarea. */
    if (call.name === 'proponer_tareas') {
      const columnas = [...briefing.columnas].sort((a, b) => a.orden - b.orden);
      const elegida = columnas.find((c) => c.id === String(call.args.columnId ?? ''));
      const tableros = new Set(columnas.map((c) => c.tableroId ?? 'unico'));
      const columna = elegida ?? (tableros.size === 1 ? columnas[0] : undefined);
      if (!columna) {
        this.log.warn('El modelo propuso un lote de tareas sin columna valida: se descarta');
        return null;
      }
      const tareas = (Array.isArray(call.args.tareas) ? call.args.tareas : [])
        .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
        .map((t) => {
          const puntos = this.puntosValidos(t.estimatePoints);
          return {
            title: String(t.title ?? '')
              .trim()
              .slice(0, 120),
            ...(t.description ? { description: String(t.description).slice(0, 5000) } : {}),
            priority: this.prioridadValida(t.priority),
            ...(puntos !== null ? { estimatePoints: puntos } : {}),
          };
        })
        .filter((t) => t.title.length > 0)
        .slice(0, MAX_TAREAS_POR_LOTE);
      if (tareas.length === 0) return null;
      return {
        tool: call.name,
        args: {
          columnId: columna.id,
          columnName: columna.nombre,
          ...(columna.tablero ? { boardName: columna.tablero } : {}),
          ...(call.args.alBacklog === true ? { alBacklog: true } : {}),
          tareas,
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
     * Un tablero nuevo con sus columnas.
     *
     * ⚠️ **Va antes del filtro de «sobre una tarea»**: no apunta a ninguna, así
     * que pasando por él se descartaría siempre por no traer `taskId`.
     *
     * Lo que se comprueba es la forma y **el verde**. Un tablero con dos columnas
     * de cierre rompe los informes en silencio: `excludeDone` y el cálculo de
     * `completed` miran el color, así que dos verdes hacen que una tarea cuente
     * como terminada en dos sitios del flujo. Se deja el verde **solo en la
     * última**, que es además donde el modelo lo pone casi siempre.
     */
    if (call.name === 'proponer_tablero') {
      const espacio = String(call.args.espacio ?? '').trim();
      const nombre = String(call.args.nombre ?? '').trim();
      if (!espacio || !nombre) return null;

      const crudas = Array.isArray(call.args.columnas) ? call.args.columnas : [];
      const columnas = crudas
        .slice(0, MAX_COLUMNAS)
        .map((cruda: unknown) => {
          const columna = (cruda ?? {}) as Record<string, unknown>;
          const nombreColumna = String(columna.nombre ?? '').trim();
          if (!nombreColumna) return null;

          const color = String(columna.color ?? '');
          return {
            nombre: nombreColumna.slice(0, 60),
            ...(COLORES_DE_COLUMNA.includes(color) ? { color } : {}),
          };
        })
        .filter(Boolean) as { nombre: string; color?: string }[];

      /* Un tablero de una sola columna no es un flujo: es una lista, y para eso
         no hace falta un tablero nuevo. */
      if (columnas.length < 2) {
        this.log.warn('El modelo propuso un tablero con menos de dos columnas: se descarta');
        return null;
      }

      /* El verde, solo en la última. Ver la nota de arriba. */
      const ultima = columnas.length - 1;
      for (const [indice, columna] of columnas.entries()) {
        if (columna.color === COLOR_DE_CIERRE && indice !== ultima) delete columna.color;
      }

      return {
        tool: call.name,
        args: {
          espacio: espacio.slice(0, 80),
          nombre: nombre.slice(0, 80),
          columnas,
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }

    /**
     * Preguntar de vuelta con opciones.
     *
     * ⚠️ **Va antes del filtro de «sobre una tarea»**, como el mensaje del
     * equipo: no apunta a ninguna tarea, así que pasando por él se descartaría
     * siempre por no traer `taskId` y el modelo parecería estar ignorando la
     * herramienta.
     *
     * Lo que se comprueba aquí es la **forma**, porque una tarjeta de preguntas
     * mal formada es peor que ninguna: una pregunta sin opciones es un texto que
     * no se puede responder, y una con una sola opción es un botón que no
     * decide nada. Las que no cumplen se caen; si no queda ninguna, se descarta
     * la propuesta entera y el texto del modelo se queda solo — que es
     * exactamente lo que habría pasado si no hubiera llamado a la herramienta.
     */
    if (call.name === 'proponer_pregunta') return this.validarPregunta(call);

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

    if (call.name === 'proponer_mensaje_privado') {
      const destinatario = payload.miembros.find(
        (m) => m.userId === String(call.args.destinatarioId ?? ''),
      );
      const body = String(call.args.body ?? '').trim();
      /* A alguien del proyecto que no sea quien habla: escribirse a uno mismo
         es un 400 del gateway, y a alguien de fuera PRAX no lo conoce. */
      if (!destinatario || destinatario.userId === payload.userId || !body) return null;
      return {
        tool: call.name,
        args: {
          destinatarioId: destinatario.userId,
          destinatario: destinatario.nombre,
          body: body.slice(0, 2000),
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }
    if (call.name === 'proponer_automatizacion') {
      return this.validarAutomatizacion(call, briefing, payload);
    }
    if (call.name === 'proponer_estado_automatizacion') {
      const regla = briefing.automatizaciones?.reglas.get(String(call.args.reglaId ?? ''));
      const activar = call.args.activar === true;
      /* Solo reglas vistas, y solo si cambia algo: activar una encendida es una
         tarjeta que no hace nada. Una INVALID o pausada por el sistema no se
         enciende desde aquí: hay que arreglarla antes, en su pantalla. */
      if (!regla || (activar ? regla.estado !== 'DISABLED' : regla.estado !== 'ENABLED')) {
        return null;
      }
      return {
        tool: call.name,
        args: {
          reglaId: regla.id,
          nombre: regla.nombre,
          activar,
          ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
        },
      };
    }
    if (call.name === 'proponer_documento') return this.validarDocumento(call);
    if (call.name === 'proponer_revision_documento') return this.validarRevision(call, briefing);
    if (call.name === 'proponer_sprint') return this.validarSprint(call, briefing);
    if (call.name === 'proponer_iniciar_sprint') return this.validarInicioDeSprint(call, briefing);
    if (call.name === 'proponer_planificacion') return this.validarPlanificacion(call, briefing);

    /* El borrado en lote: cada id tiene que estar en lo que PRAX ha visto
       (inventario o consultas del turno), igual que el borrado suelto. Los que
       no, se quitan de la lista; sin ninguno, no hay propuesta. */
    if (call.name === 'proponer_borrados') {
      const ids = [
        ...new Set((Array.isArray(call.args.taskIds) ? call.args.taskIds : []).map(String)),
      ];
      const tareas = ids
        .map((id) => briefing.tareas?.find((t) => t.id === id))
        .filter((t): t is TareaDelBriefing => Boolean(t))
        .slice(0, MAX_BORRADOS_POR_LOTE)
        .map((t) => ({
          taskId: t.id,
          taskTitle: t.titulo,
          columna: t.columna,
          ...(t.tablero ? { tablero: t.tablero } : {}),
          cerrada: t.cerrada,
        }));
      if (tareas.length < ids.length) {
        this.log.warn(`prax_borrados_desconocidos pedidos=${ids.length} validos=${tareas.length}`);
      }
      if (tareas.length === 0) return null;
      return {
        tool: call.name,
        args: {
          tareas,
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

    /**
     * Borrar una tarea.
     *
     * ⚠️ **Es la única propuesta que exige que la tarea esté en el inventario**,
     * sin el «si no hay inventario, pasa» que aplican las demás por
     * compatibilidad con un briefing viejo. Aquí no se puede ser laxo: una
     * propuesta de borrado sobre un id que nadie ha comprobado es una tarjeta
     * roja apuntando a algo que no se sabe qué es.
     *
     * Lo que viaja además del id es **contexto para decidir**: dónde está y
     * cuántos pasos de checklist se lleva. No se manda un recuento de
     * comentarios ni de adjuntos porque el briefing no los trae, y la tarjeta lo
     * dice en genérico —que es cierto— en vez de inventar un número.
     */
    if (call.name === 'proponer_borrado') {
      if (!tarea) {
        this.log.warn(`El modelo propuso borrar ${taskId}, que no esta en el inventario`);
        return null;
      }

      return {
        tool: call.name,
        args: {
          ...base,
          taskTitle: tarea.titulo,
          columna: tarea.columna,
          ...(tarea.tablero ? { tablero: tarea.tablero } : {}),
          pasos: (tarea.pasos ?? []).length,
          /* Que ya esté cerrada cambia lo que significa borrarla: no es lo mismo
             tirar trabajo pendiente que retirar algo terminado del historial. */
          cerrada: tarea.cerrada,
        },
      };
    }

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
      /* Los puntos: entero de 0 a 999, el rango del DTO. Fuera de él se ignora
         el campo, no la propuesta. */
      const puntos = Number(call.args.puntos);
      if (
        call.args.puntos !== undefined &&
        Number.isInteger(puntos) &&
        puntos >= 0 &&
        puntos <= 999
      ) {
        cambios.estimatePoints = puntos;
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
   * Una regla nueva, contra el catálogo que PRAX consultó en el turno.
   *
   * ⚠️ **Todo o nada.** Si una condición o una acción no encaja, se descarta la
   * propuesta entera en vez de quitar la pieza: una regla sin una de sus
   * condiciones hace **más** de lo que se pidió —«avisa de todas» en vez de
   * «avisa de las urgentes»—, y eso es peor que no proponer nada. El motor la
   * vuelve a validar al crearla; esto es para que no salga una tarjeta que va a
   * dar 400, y para escribir la frase que la tarjeta enseña.
   */
  private validarAutomatizacion(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
    payload: ChatPayload,
  ): AssistantProposal | null {
    const catalogo = briefing.automatizaciones?.catalogo;
    const nombre = String(call.args.nombre ?? '').trim();
    if (!catalogo || !nombre) {
      this.log.warn('El modelo propuso una regla sin haber consultado el catalogo');
      return null;
    }
    const json = (valor: unknown): Record<string, unknown> => {
      if (valor && typeof valor === 'object') return valor as Record<string, unknown>;
      try {
        const leido = JSON.parse(String(valor ?? '{}'));
        return leido && typeof leido === 'object' ? leido : {};
      } catch {
        return {};
      }
    };
    /* De qué lista sale un id, y cómo se llama para la frase. */
    const listas: Record<string, Map<string, string>> = {
      columns: new Map(briefing.columnas.map((c) => [c.id, c.nombre])),
      labels: new Map(briefing.etiquetas.map((l) => [l.id, l.nombre])),
      members: new Map(payload.miembros.map((m) => [m.userId, m.nombre])),
    };
    const legible = (
      spec: { options?: { value: string; label: string }[]; source?: string },
      valor: unknown,
    ): string | null => {
      const uno = (v: unknown) => {
        const texto = String(v);
        if (spec.source) return listas[spec.source]?.get(texto) ?? null;
        if (spec.options) return spec.options.find((o) => o.value === texto)?.label ?? null;
        return texto;
      };
      if (Array.isArray(valor)) {
        const partes = valor.map(uno);
        return partes.every((p) => p !== null) ? partes.join(', ') : null;
      }
      return uno(valor);
    };

    const disparadorPedido = json(call.args.disparador);
    const disparador = catalogo.triggers.find((t) => t.type === disparadorPedido.type);
    if (!disparador) return null;
    const configPedida = json(disparadorPedido.config);
    const configDelDisparador = Object.fromEntries(
      disparador.config.map((c) => {
        const valor = Number(configPedida[c.key]);
        return [c.key, Number.isInteger(valor) && valor >= c.min ? valor : c.defaultValue];
      }),
    );

    const OPERADOR: Record<string, string> = {
      EQUALS: 'es',
      NOT_EQUALS: 'no es',
      IN: 'es una de',
      GT: 'es mayor que',
      GTE: 'es al menos',
      LT: 'es menor que',
      LTE: 'es como mucho',
      CONTAINS: 'contiene',
    };
    const condiciones: { field: string; operator: string; value: unknown }[] = [];
    const frasesDeCondicion: string[] = [];
    for (const cruda of (Array.isArray(call.args.condiciones) ? call.args.condiciones : []).slice(
      0,
      10,
    )) {
      const c = json(cruda);
      const campo = disparador.fields.find((f) => f.field === c.field);
      const operador = String(c.operator ?? '');
      if (!campo || !campo.operators.includes(operador)) return null;
      let valor: unknown = c.value;
      if (operador === 'IN' && typeof valor === 'string')
        valor = valor.split(',').map((v) => v.trim());
      if (campo.kind === 'integer') valor = Number(valor);
      if (campo.kind === 'boolean') valor = valor === true || valor === 'true';
      const etiqueta = legible(campo, valor);
      if (etiqueta === null || (campo.kind === 'integer' && !Number.isFinite(valor as number))) {
        return null;
      }
      condiciones.push({ field: campo.field, operator: operador, value: valor });
      frasesDeCondicion.push(
        `${campo.label.toLowerCase()} ${OPERADOR[operador] ?? operador} ${etiqueta}`,
      );
    }

    const acciones: { type: string; config: Record<string, unknown> }[] = [];
    const frasesDeAccion: string[] = [];
    const pedidas = Array.isArray(call.args.acciones) ? call.args.acciones : [];
    if (pedidas.length === 0 || pedidas.length > 5) return null;
    for (const cruda of pedidas) {
      const a = json(cruda);
      const spec = catalogo.actions.find((s) => s.type === a.type);
      if (!spec) return null;
      const config = json(a.config);
      const limpia: Record<string, unknown> = {};
      const partes: string[] = [];
      for (const campo of spec.config) {
        const valor = config[campo.key];
        if (valor === undefined || valor === null || valor === '') {
          if (campo.required) return null;
          continue;
        }
        if (campo.kind === 'text' && String(valor).length > (campo.maxLength ?? 500)) return null;
        const etiqueta = legible(campo, valor);
        if (etiqueta === null) return null;
        limpia[campo.key] = valor;
        partes.push(campo.kind === 'text' ? `«${etiqueta}»` : etiqueta.toLowerCase());
      }
      acciones.push({ type: spec.type, config: limpia });
      frasesDeAccion.push(
        partes.length > 0 ? `${spec.sentence} ${partes.join(', ')}` : spec.label.toLowerCase(),
      );
    }

    return {
      tool: call.name,
      args: {
        nombre: nombre.slice(0, 120),
        frase:
          `Cuando ${disparador.sentence}` +
          (frasesDeCondicion.length > 0 ? `, si ${frasesDeCondicion.join(' y ')}` : '') +
          `, entonces ${frasesDeAccion.join(' y ')}.`,
        trigger: { type: disparador.type, config: configDelDisparador },
        conditions: condiciones,
        actions: acciones,
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * Un documento nuevo. El espacio va **por nombre**, como en el tablero: se
   * resuelve o se crea al aceptar, así que no hace falta haberlo consultado.
   */
  private validarDocumento(call: {
    name: string;
    args: Record<string, unknown>;
  }): AssistantProposal | null {
    const titulo = String(call.args.titulo ?? '').trim();
    const contenido = String(call.args.contenido ?? '').trim();
    if (!titulo || !contenido) return null;
    const espacio = String(call.args.espacio ?? '').trim() || 'Documentos';
    return {
      tool: call.name,
      args: {
        espacio: espacio.slice(0, 80),
        titulo: titulo.slice(0, 200),
        contenido: contenido.slice(0, 20_000),
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * Una revisión: **sobre un documento leído entero en este turno**.
   *
   * La revisión sustituye el contenido, así que una escrita sin haberlo leído
   * —o sobre la parte que enseñó la lista— borraría lo que el modelo no vio. Y
   * con tope: por encima de `REVISION_MAX_CARACTERES` la respuesta ni cabe en la
   * salida ni compensa en tokens.
   */
  private validarRevision(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
  ): AssistantProposal | null {
    const documento = briefing.documentosVistos?.get(String(call.args.documentoId ?? ''));
    if (!documento?.leido || documento.largo > REVISION_MAX_CARACTERES) {
      this.log.warn('El modelo propuso revisar un documento que no leyo entero o que es largo');
      return null;
    }
    const contenido = String(call.args.contenido ?? '').trim();
    if (!contenido || contenido.length > REVISION_MAX_CARACTERES * 1.5) return null;
    return {
      tool: call.name,
      args: {
        documentoId: documento.id,
        workspaceId: documento.workspaceId,
        titulo: documento.titulo,
        contenido,
        cambios: String(call.args.cambios ?? '').slice(0, 500),
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * Un sprint nuevo: en un tablero **con Scrum** del proyecto.
   *
   * El tablero sale del briefing, que solo trae `scrum` en los que lo tienen:
   * un sprint en un tablero sin Scrum existiría y nadie lo vería.
   */
  private validarSprint(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
  ): AssistantProposal | null {
    const tablero = briefing.tableros?.find((t) => t.id === String(call.args.tableroId ?? ''));
    if (!tablero?.scrum) {
      this.log.warn('El modelo propuso un sprint en un tablero sin Scrum o que no existe');
      return null;
    }
    const nombre = String(call.args.nombre ?? '').trim();
    if (nombre.length < 2) return null;
    const meta = String(call.args.meta ?? '').trim();
    return {
      tool: call.name,
      args: {
        tableroId: tablero.id,
        tablero: tablero.nombre,
        nombre: nombre.slice(0, 100),
        ...(meta ? { meta: meta.slice(0, 500) } : {}),
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * Empezar un sprint: planeado, visto en este turno y sin otro en curso.
   *
   * ⚠️ «Sin otro en curso» se mira **en las dos fuentes**: lo que enseñó la
   * consulta y el `sprintEnCurso` del briefing. El gateway lo rechazaría igual,
   * pero una tarjeta que va a fallar al aceptarla es peor que ninguna.
   */
  private validarInicioDeSprint(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
  ): AssistantProposal | null {
    const sprint = briefing.sprintsVistos?.get(String(call.args.sprintId ?? ''));
    if (!sprint || sprint.estado !== 'PLANNED') {
      this.log.warn('El modelo propuso empezar un sprint que no vio o que no esta planeado');
      return null;
    }
    const otroEnCurso =
      [...(briefing.sprintsVistos?.values() ?? [])].some(
        (s) => s.boardId === sprint.boardId && s.estado === 'ACTIVE',
      ) || Boolean(briefing.tableros?.find((t) => t.id === sprint.boardId)?.scrum?.sprintEnCurso);
    if (otroEnCurso) {
      this.log.warn('El modelo propuso empezar un sprint con otro en curso en el mismo tablero');
      return null;
    }
    const desde = String(call.args.desde ?? '');
    const hasta = String(call.args.hasta ?? '');
    if (!this.fechaValida(desde) || !this.fechaValida(hasta) || hasta <= desde) return null;
    return {
      tool: call.name,
      args: {
        sprintId: sprint.id,
        sprint: sprint.nombre,
        tableroId: sprint.boardId,
        tablero: sprint.tablero,
        desde,
        hasta,
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * Meter tareas del backlog en un sprint, o devolverlas al backlog.
   *
   * Las tareas tienen que ser conocidas —del inventario o de una consulta— y,
   * cuando van a un sprint, **del mismo tablero** que el sprint: el gateway las
   * reasigna dentro de un tablero y las de otro no se moverían, sin error.
   * Las que no cumplen se quitan; si no queda ninguna, no hay propuesta.
   */
  private validarPlanificacion(
    call: { name: string; args: Record<string, unknown> },
    briefing: Briefing,
  ): AssistantProposal | null {
    const sprintId = String(call.args.sprintId ?? '').trim();
    const sprint = sprintId ? briefing.sprintsVistos?.get(sprintId) : undefined;
    if (sprintId && (!sprint || sprint.estado === 'CLOSED')) {
      this.log.warn('El modelo propuso planificar en un sprint que no vio o ya cerrado');
      return null;
    }
    const pedidas = Array.isArray(call.args.taskIds) ? call.args.taskIds.map(String) : [];
    const tareas = [...new Set(pedidas)]
      .map((id) => briefing.tareas?.find((t) => t.id === id))
      .filter((t): t is TareaDelBriefing => Boolean(t))
      .filter((t) => !t.cerrada)
      .filter((t) => !sprint || !t.boardId || t.boardId === sprint.boardId)
      .slice(0, 30);
    if (tareas.length === 0) {
      this.log.warn('El modelo propuso planificar sin ninguna tarea valida');
      return null;
    }
    /* Devolver al backlog: todas del mismo tablero, para que la tarjeta pueda
       decir de cuál. Con varios, se queda el del primero. */
    const tableroId = sprint?.boardId ?? tareas[0].boardId ?? '';
    const deOtroTablero = tareas.filter((t) => t.boardId && t.boardId !== tableroId);
    const validas = tareas.filter((t) => !deOtroTablero.includes(t));
    return {
      tool: call.name,
      args: {
        sprintId: sprint?.id ?? null,
        ...(sprint ? { sprint: sprint.nombre } : {}),
        tableroId,
        tareas: validas.map((t) => ({ id: t.id, titulo: t.titulo })),
        taskIds: validas.map((t) => t.id),
        ...(call.args.porQue ? { porQue: String(call.args.porQue) } : {}),
      },
    };
  }

  /**
   * El briefing con las tareas que PRAX vio consultando en este turno.
   *
   * Solo para validar: el modelo ya las tiene delante por la consulta. Se
   * añaden las que no estaban en el inventario, con la columna y el tablero
   * resueltos contra las columnas del briefing, que son las de todo el proyecto.
   */
  private conLoVisto(briefing: Briefing, ambito: AmbitoDeConsulta): Briefing {
    const conVistos = {
      ...briefing,
      ...(ambito.sprintsVistos?.size ? { sprintsVistos: ambito.sprintsVistos } : {}),
      ...(ambito.documentosVistos?.size ? { documentosVistos: ambito.documentosVistos } : {}),
      ...(ambito.automatizaciones ? { automatizaciones: ambito.automatizaciones } : {}),
    };
    return this.conTareasVistas(conVistos, ambito.vistas ?? new Map());
  }

  private conTareasVistas(briefing: Briefing, vistas: Map<string, TareaVista>): Briefing {
    if (!briefing.tareas || vistas.size === 0) return briefing;
    const conocidas = new Set(briefing.tareas.map((t) => t.id));
    const nuevas: TareaDelBriefing[] = [];
    for (const vista of vistas.values()) {
      if (conocidas.has(vista.id)) continue;
      const columna = briefing.columnas.find((c) => c.id === vista.columnId);
      nuevas.push({
        id: vista.id,
        titulo: vista.titulo,
        cerrada: vista.cerrada,
        columnId: vista.columnId,
        ...(vista.boardId ? { boardId: vista.boardId } : {}),
        columna: columna?.nombre ?? '',
        ...(columna?.tablero ? { tablero: columna.tablero } : {}),
        ...(vista.pasos ? { pasos: vista.pasos } : {}),
      });
    }
    return nuevas.length > 0 ? { ...briefing, tareas: [...briefing.tareas, ...nuevas] } : briefing;
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
    /** La del inventario, entera. Ver `TareaDelBriefing`. */
    tarea?: TareaDelBriefing;
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

  /**
   * Reparte los adjuntos entre lo que va como datos y lo que va como texto.
   *
   * ⚠️ **El tamaño se comprueba aquí, sobre los bytes decodificados.** El DTO ya
   * validó el tipo, el número y que sea base64 legítimo, pero no puede validar el
   * peso: base64 abulta un tercio, así que un tope sobre la cadena rechazaría
   * archivos de 3,8 MB diciendo que pasan de 5. Lo que no cabe **se descarta en
   * silencio** en vez de tumbar el turno: perder un adjunto es mucho mejor que
   * perder la pregunta.
   *
   * Y los de texto se recortan avisando **dentro del propio prompt**. Un recorte
   * mudo haría que el modelo hablara con confianza de un documento del que solo
   * ha visto el principio, que es la peor forma de equivocarse aquí.
   */
  private repartirAdjuntos(
    adjuntos: {
      id: string;
      name: string;
      mime: string;
      data: string;
      pages?: number | null;
      extract?: string | null;
    }[],
  ) {
    const archivos: { mimeType: string; data: string }[] = [];
    const trozos: string[] = [];

    for (const adjunto of adjuntos.slice(0, ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE)) {
      let bytes: Buffer;
      try {
        bytes = Buffer.from(adjunto.data, 'base64');
      } catch {
        this.log.warn(`Adjunto "${adjunto.name}" no era base64 valido: se descarta`);
        continue;
      }

      if (bytes.byteLength > ASSISTANT_ATTACHMENT_MAX_BYTES) {
        this.log.warn(`Adjunto "${adjunto.name}" pasa del tope: se descarta`);
        continue;
      }

      if (ASSISTANT_TEXT_MIME.includes(adjunto.mime)) {
        const texto = bytes.toString('utf8');
        /* El mismo formato que el historial (`bloqueDeArchivo`), y a propósito:
           con dos, el turno en el que se adjunta un archivo se leería distinto
           del turno siguiente. */
        trozos.push(
          bloqueDeArchivo(
            adjunto.name,
            texto.slice(0, ASSISTANT_TEXT_MAX_CHARS),
            texto.length > ASSISTANT_TEXT_MAX_CHARS,
          ),
        );
        continue;
      }

      /**
       * 🔴 **Un PDF largo NO viaja nativo, y este era el peor caso del sistema.**
       *
       * Va como `inlineData` para que el modelo lo lea con su maquetación, y eso
       * está bien para un documento de trabajo. Pero Gemini tokeniza un PDF **por
       * páginas** —del orden de 250 cada una— y el único tope que había eran 5 MB,
       * que un informe de 500 páginas cumple de sobra: **130 000 tokens en un solo
       * turno**, tres por mensaje, y contando como *un* mensaje de la cuota.
       *
       * Ningún plan por peticiones sobrevive a eso, y lo peor es que no hace falta
       * mala fe: basta con adjuntar un manual.
       *
       * A partir del tope va su **texto**, que se extrajo al subirlo y sí está
       * acotado. Se pierde la maquetación —se dice, para que el modelo no hable de
       * tablas que no ha visto— y se gana que el coste de un turno sea una cifra
       * que se puede escribir en un contrato.
       */
      if (
        adjunto.mime === 'application/pdf' &&
        (adjunto.pages ?? 0) > ASSISTANT_PDF_MAX_INLINE_PAGES
      ) {
        if (adjunto.extract) {
          trozos.push(
            bloqueDeArchivo(
              `${adjunto.name} (${adjunto.pages} paginas; solo el texto, sin maquetacion ni figuras)`,
              adjunto.extract,
              /* Solo si de verdad se cortó. Decir «el archivo continúa» sobre un
                 texto completo es mentirle al modelo en la única frase que está
                 ahí para que no se fíe de más. */
              adjunto.extract.length >= ASSISTANT_TEXT_MAX_CHARS,
            ),
          );
        } else {
          /* Un escaneado largo no tiene texto que mandar y no cabe nativo: se
             nombra y se dice por qué, en vez de callarlo. */
          trozos.push(
            `--- ARCHIVO ADJUNTO: ${adjunto.name} (${adjunto.pages} paginas, escaneado: no se ha podido leer su texto y es demasiado largo para verlo entero) ---`,
          );
        }
        continue;
      }

      archivos.push({ mimeType: adjunto.mime, data: adjunto.data });
    }

    return { archivos, textos: trozos.join('\n\n') };
  }

  /** Se queda con los ids que existen de verdad y descarta el resto. */
  private soloConocidos(valor: unknown, conocidos: Set<string>): string[] {
    if (!Array.isArray(valor)) return [];
    return valor.map(String).filter((id) => conocidos.has(id));
  }

  /**
   * Un lote y tareas sueltas para la misma columna son **una** propuesta.
   *
   * 🔴 gpt-oss devolvía en el mismo turno «TEC-01» suelta y el lote de 35 (con
   * TEC-01 dentro): dos tarjetas con flechas, y aceptar las dos creaba TEC-01
   * dos veces (2026-09-30). Aquí, por columna: los lotes se juntan en uno y las
   * sueltas entran en él, sin repetir las que ya están por título (o por su
   * nomenclatura, «TEC-01», si la tienen). Lo que va a otra columna no se toca.
   */
  private fundirLotes(propuestas: AssistantProposal[]): AssistantProposal[] {
    const lotes = new Map<string, AssistantProposal>();
    for (const p of propuestas) {
      if (p.tool !== 'proponer_tareas') continue;
      const columna = String(p.args.columnId);
      const previo = lotes.get(columna);
      if (!previo) {
        lotes.set(columna, {
          ...p,
          args: { ...p.args, tareas: [...(p.args.tareas as unknown[])] },
        });
      } else {
        (previo.args.tareas as unknown[]).push(...(p.args.tareas as unknown[]));
      }
    }
    if (lotes.size === 0) return propuestas;

    const clave = (titulo: unknown) => {
      const t = String(titulo ?? '')
        .trim()
        .toLowerCase();
      const codigo = /^([a-z]{1,6}-\d{1,4})\b/.exec(t)?.[1];
      return codigo ?? t;
    };
    const salida: AssistantProposal[] = [];
    const puestos = new Set<string>();
    for (const p of propuestas) {
      if (p.tool === 'proponer_tareas') {
        const columna = String(p.args.columnId);
        if (puestos.has(columna)) continue;
        puestos.add(columna);
        salida.push(lotes.get(columna) as AssistantProposal);
        continue;
      }
      /* Una suelta que ya está en algún lote del turno sobra, vaya a la columna
         que vaya: es la misma tarea dos veces. */
      if (
        p.tool === 'proponer_tarea' &&
        [...lotes.values()].some((l) =>
          (l.args.tareas as { title: string }[]).some(
            (t) => clave(t.title) === clave(p.args.title),
          ),
        )
      ) {
        this.log.warn('prax_tarea_suelta_repetida_en_lote');
        continue;
      }
      const lote = p.tool === 'proponer_tarea' ? lotes.get(String(p.args.columnId)) : undefined;
      if (!lote) {
        salida.push(p);
        continue;
      }
      const { columnId: _c, columnName: _n, boardName: _b, porQue: _p, ...tarea } = p.args;
      const tareas = lote.args.tareas as { title: string }[];
      if (!tareas.some((t) => clave(t.title) === clave(tarea.title))) {
        tareas.push(tarea as { title: string });
      }
      this.log.warn('prax_tarea_suelta_fundida_en_lote');
    }
    /* Sin repetidas dentro del lote, y con el tope de siempre. */
    for (const lote of lotes.values()) {
      const vistas = new Set<string>();
      lote.args.tareas = (lote.args.tareas as { title: string }[])
        .filter((t) => {
          const k = clave(t.title);
          if (vistas.has(k)) return false;
          vistas.add(k);
          return true;
        })
        .slice(0, MAX_TAREAS_POR_LOTE);
    }
    return salida;
  }

  /** Puntos de estimación: entero de 0 a 999, o `null` si no hay o no vale. */
  private puntosValidos(valor: unknown): number | null {
    const n = typeof valor === 'string' ? Number(valor) : valor;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
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

  /**
   * Traduce el fallo de Gemini a algo que el gateway pueda devolver.
   *
   * ⚠️ **El 502 no es decorativo.** `describe()` en el cliente deja pasar el
   * mensaje del servidor tal cual en los 4xx y en el **502**, y lo sustituye por
   * uno genérico en el resto de los 5xx. Devolver un `GeminiError` como 500
   * —que es lo que hacía `chat()`— era garantizar que nadie leyera nunca el
   * motivo. El código de estado es, literalmente, lo que decide si el mensaje
   * llega.
   */
  static comoRpc(error: unknown, details: Record<string, unknown> = {}): RpcException {
    if (error instanceof GeminiError) {
      return new RpcException({ statusCode: 502, message: error.message, details });
    }
    if (error instanceof RpcException) return error;
    return new RpcException({
      statusCode: 500,
      message: 'El asistente no ha podido responder.',
      details,
    });
  }
}

/**
 * El error de «no te quedan mensajes este mes».
 *
 * ## 🔴 Era un 429, y eso lo hacía indistinguible del límite de peticiones
 *
 * El gateway limita a 300 peticiones por minuto y por cuenta, y responde **429**.
 * Este error era también un 429, así que la pantalla no podía separar dos cosas
 * que no se parecen en nada: una se arregla esperando quince segundos y la otra
 * no se arregla en doce días salvo pagando. El frontend acabó decidiéndolo por
 * `status === 429` a secas —o sea, adivinando—, y un throttle en mitad de una
 * conversación se leía como «se te acabó el mes».
 *
 * Ahora es un **402 con `QUOTA_EXCEEDED`**, que es lo que ya hablaban las otras
 * dos cuotas del plan —proyectos y miembros— desde `QuotaService` en el gateway.
 * Las tres dicen lo mismo de la misma forma y la pantalla ofrece la misma salida
 * sin caso especial. Es la decisión D4 del plan Enterprise, que esta ruta se
 * había saltado por ser anterior.
 *
 * ⚠️ **`details` conserva `cuota` además del detalle nuevo.** El contador del
 * chat lo lee para pintarse al agotarse, y quitarlo dejaría la barra en el
 * último valor que vio — o sea, sin llegar nunca al tope que acaba de alcanzar.
 */
function cuotaAgotada(cuota: AssistantQuota, planTier?: string | null): RpcException {
  const detalle: QuotaExceededDetails = {
    kind: QuotaKind.IA_MENSUAL,
    /* El plan lo resuelve el gateway contra billing-service: aquí solo se
       transporta. Sin él —una llamada TCP directa, sin gateway— se dice el que
       vale por defecto en vez de inventarse uno. */
    tier: (planTier as QuotaExceededDetails['tier']) ?? PLAN_POR_DEFECTO,
    tope: cuota.limite,
    actual: cuota.usados,
    reiniciaEn: cuota.reinicia,
  };

  return new RpcException({
    statusCode: 402,
    code: QUOTA_EXCEEDED_CODE,
    message:
      `Has gastado los ${cuota.limite.toLocaleString('es')} tokens de este mes. ` +
      'Vuelven el día 1 del mes que viene.',
    details: { ...detalle, cuota },
  });
}
