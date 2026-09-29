import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ClientProxy, ClientProxyFactory } from '@nestjs/microservices';
import { opcionesDeCliente } from '@praxis/local-transport';
import { firstValueFrom } from 'rxjs';
import type { FunctionDeclaration } from './tools';

/**
 * Las herramientas de **consulta** de PRAX (D1 y D3 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Qué las distingue de todas las demás
 *
 * Las `proponer_*` no hacen nada: devuelven parámetros que una persona acepta o
 * no. Estas **sí se ejecutan**, aquí, en el servidor, y su resultado vuelve al
 * modelo en la misma vuelta del bucle. Por eso son **solo de lectura**, sin una
 * sola excepción: la regla «el asistente propone; nunca ejecuta» sigue intacta
 * porque leer no cambia nada.
 *
 * ## Qué puede leer
 *
 * Solo proyectos del **ámbito del turno**: con foco, ese proyecto; sin foco, los
 * de «Recursos», que el gateway ya filtró por organización activa y
 * `canViewReports`. Un id fuera de esa lista responde como si no existiera. El
 * modelo puede alucinar ids, y aquí eso no puede convertirse en leer un proyecto
 * ajeno.
 *
 * ## Qué devuelve
 *
 * Filas compactas y con tope, nunca el objeto entero. Y cuando corta, lo dice
 * (`omitidas`): un recorte mudo es peor que no recortar.
 */

/** Cuántas tareas devuelve una búsqueda como mucho. Lo que sobra se cuenta en `omitidas`. */
export const CONSULTA_MAX_TAREAS = 40;
/** Comentarios de una tarea que se leen, los más recientes. */
const CONSULTA_MAX_COMENTARIOS = 10;

const INFORMES = {
  resumen: 'report_snapshot',
  pronostico: 'report_forecast',
  personas: 'report_people',
  bloqueadas: 'report_blocked',
  ciclo: 'report_cycle_time',
  flujo: 'report_flow',
  semanal: 'report_weekly',
} as const;
type Informe = keyof typeof INFORMES;

export const CONSULTAR_TAREAS: FunctionDeclaration = {
  name: 'consultar_tareas',
  description:
    'LEE tareas de un proyecto para poder responder. No cambia nada. Usala cuando la ' +
    'respuesta dependa de tareas que no tienes delante (otro proyecto, una busqueda por ' +
    'texto, las de una persona o columna concretas) en vez de adivinar. Devuelve como mucho ' +
    `${CONSULTA_MAX_TAREAS} y dice cuantas quedaron fuera.`,
  parameters: {
    type: 'OBJECT',
    properties: {
      proyectoId: {
        type: 'STRING',
        description: 'id del proyecto. Sin el, el proyecto de la conversacion.',
      },
      texto: { type: 'STRING', description: 'Opcional. Busca en titulo y descripcion.' },
      columnaId: { type: 'STRING', description: 'Opcional. Solo las de esa columna.' },
      encargadoId: { type: 'STRING', description: 'Opcional. Solo las asignadas a esa persona.' },
      soloAbiertas: {
        type: 'BOOLEAN',
        description: 'Opcional. Sin las ya completadas. Por defecto, true.',
      },
      soloVencidas: {
        type: 'BOOLEAN',
        description: 'Opcional. Solo las abiertas cuyo vencimiento ya paso.',
      },
    },
  },
};

export const CONSULTAR_TAREA: FunctionDeclaration = {
  name: 'consultar_tarea',
  description:
    'LEE una tarea entera: descripcion completa, checklist, etiquetas y los ultimos ' +
    'comentarios. No cambia nada. Usala antes de proponer cambios sobre una tarea cuyo ' +
    'detalle no conoces, o cuando pregunten por su contenido.',
  parameters: {
    type: 'OBJECT',
    properties: { tareaId: { type: 'STRING', description: 'id de la tarea.' } },
    required: ['tareaId'],
  },
};

export const CONSULTAR_ANALISIS: FunctionDeclaration = {
  name: 'consultar_analisis',
  description:
    'LEE un informe de un proyecto calculado con sus datos reales. No cambia nada. ' +
    'resumen: estado general; pronostico: cuando se terminara; personas: carga y ritmo ' +
    'por persona; bloqueadas: tareas paradas; ciclo: cuanto tardan; flujo: entradas y ' +
    'salidas; semanal: evolucion por semanas.',
  parameters: {
    type: 'OBJECT',
    properties: {
      proyectoId: {
        type: 'STRING',
        description: 'id del proyecto. Sin el, el proyecto de la conversacion.',
      },
      informe: { type: 'STRING', enum: Object.keys(INFORMES) },
    },
    required: ['informe'],
  },
};

/** Tareas del backlog de un tablero que se devuelven como mucho. */
const CONSULTA_MAX_BACKLOG = 30;

export const CONSULTAR_SPRINTS: FunctionDeclaration = {
  name: 'consultar_sprints',
  description:
    'LEE los sprints y el backlog de los tableros con Scrum de un proyecto: cada sprint con ' +
    'su id, estado (PLANNED, ACTIVE, CLOSED), meta y fechas, y las tareas del backlog con ' +
    'sus puntos. No cambia nada. Usala antes de proponer crear o iniciar un sprint o ' +
    `repartir tareas entre backlog y sprint. Del backlog devuelve como mucho ${CONSULTA_MAX_BACKLOG}.`,
  parameters: {
    type: 'OBJECT',
    properties: {
      proyectoId: {
        type: 'STRING',
        description: 'id del proyecto. Sin el, el proyecto de la conversacion.',
      },
      tableroId: { type: 'STRING', description: 'Opcional. Solo ese tablero.' },
    },
  },
};

/**
 * Cuánto de un documento se le enseña al modelo. Lo que sobra se dice
 * (`recortado`), como todo recorte (I3).
 */
export const CONSULTA_MAX_DOCUMENTO = 20_000;
/**
 * Hasta qué tamaño PRAX puede proponer una revisión **entera** de un documento.
 * La revisión es el Markdown completo, y sale como tokens de salida —los que
 * pesan ×8—; por encima de esto, ni cabe en `MAX_TOKENS_REVISION` ni compensa.
 */
export const REVISION_MAX_CARACTERES = 12_000;

export const CONSULTAR_DOCUMENTOS: FunctionDeclaration = {
  name: 'consultar_documentos',
  description:
    'LEE la lista de documentos de un proyecto: titulo, espacio, cuando se toco y el ' +
    'principio del texto. No cambia nada. Usala para encontrar un documento antes de leerlo.',
  parameters: {
    type: 'OBJECT',
    properties: {
      proyectoId: {
        type: 'STRING',
        description: 'id del proyecto. Sin el, el proyecto de la conversacion.',
      },
      texto: { type: 'STRING', description: 'Opcional. Busca en titulo y contenido.' },
    },
  },
};

export const CONSULTAR_DOCUMENTO: FunctionDeclaration = {
  name: 'consultar_documento',
  description:
    'LEE un documento entero, en Markdown. No cambia nada. Hace falta haberlo leido en ' +
    `este turno para proponer una revision. Enseña como mucho ${CONSULTA_MAX_DOCUMENTO} ` +
    'caracteres y dice si recorto.',
  parameters: {
    type: 'OBJECT',
    properties: {
      documentoId: { type: 'STRING', description: 'id de consultar_documentos.' },
    },
    required: ['documentoId'],
  },
};

export const CONSULTAR_AUTOMATIZACIONES: FunctionDeclaration = {
  name: 'consultar_automatizaciones',
  description:
    'LEE las automatizaciones (reglas) del proyecto y el CATALOGO de lo que se puede ' +
    'automatizar: disparadores, condiciones y acciones, con las claves de su ' +
    'configuracion. No cambia nada. Hace falta en este turno para proponer una regla o ' +
    'activarla. Solo funciona con el permiso «Gestionar automatizaciones».',
  /* Con un parámetro de verdad: Gemini rechaza un OBJECT con `properties`
     vacío, y con él el turno entero. */
  parameters: {
    type: 'OBJECT',
    properties: {
      soloActivas: { type: 'BOOLEAN', description: 'Opcional. Solo las reglas encendidas.' },
    },
  },
};

export const HERRAMIENTAS_DE_CONSULTA = [
  CONSULTAR_TAREAS,
  CONSULTAR_TAREA,
  CONSULTAR_ANALISIS,
  CONSULTAR_SPRINTS,
  CONSULTAR_DOCUMENTOS,
  CONSULTAR_DOCUMENTO,
  CONSULTAR_AUTOMATIZACIONES,
];
const NOMBRES = new Set(HERRAMIENTAS_DE_CONSULTA.map((h) => h.name));

export function esConsulta(nombre: string): boolean {
  return NOMBRES.has(nombre);
}

/** Sobre qué se puede consultar en este turno. */
export interface AmbitoDeConsulta {
  /** El proyecto de la conversación, si lo hay. */
  foco: string | null;
  /** Todos los que se pueden leer: el foco y, sin foco, los de «Recursos». */
  proyectos: { id: string; nombre: string }[];
  /** userId → nombre, para no devolverle al modelo ids de personas. */
  nombres: Record<string, string>;
  /**
   * Las tareas **del foco** que las consultas le han enseñado al modelo en este
   * turno, por id.
   *
   * ⚠️ Sin esto, una tarea que no cabía en el inventario del briefing
   * (`INVENTARIO_MAX_CHARS`) o que el router dejó fuera se podía **leer** pero
   * no **proponer**: PRAX la encontraba consultando, proponía moverla y la
   * validación la descartaba por «no estar en el proyecto». Solo las del foco,
   * porque las propuestas se ejecutan con los permisos de ese proyecto.
   */
  vistas?: Map<string, TareaVista>;
  /** Los sprints **del foco** que ha visto el modelo, por id. Mismo motivo. */
  sprintsVistos?: Map<string, SprintVisto>;
  /**
   * Los documentos **del foco** que ha visto, por id. `leido` solo cuando pasó
   * por `consultar_documento`: una revisión se escribe sobre lo leído, no sobre
   * el principio que enseña la lista.
   */
  documentosVistos?: Map<string, DocumentoVisto>;
  /**
   * Los permisos de quien pregunta **en el foco**. Hace falta para no enseñar
   * lo que su pantalla no le enseñaría (I6): las automatizaciones solo las ve
   * quien las gestiona.
   */
  permisos?: Record<string, boolean>;
  /** Lo que enseñó `consultar_automatizaciones`: el catálogo y las reglas. */
  automatizaciones?: AutomatizacionesVistas;
}

/** El catálogo del motor, tal cual lo sirve automation-service. */
export interface CatalogoDeAutomatizacion {
  triggers: {
    type: string;
    label: string;
    sentence: string;
    config: { key: string; min: number; defaultValue: number }[];
    fields: {
      field: string;
      label: string;
      kind: string;
      operators: string[];
      options?: { value: string; label: string }[];
      source?: string;
    }[];
  }[];
  actions: {
    type: string;
    label: string;
    sentence: string;
    config: {
      key: string;
      kind: string;
      required: boolean;
      options?: { value: string; label: string }[];
      source?: string;
      maxLength?: number;
    }[];
  }[];
}

export interface AutomatizacionesVistas {
  catalogo: CatalogoDeAutomatizacion;
  reglas: Map<string, { id: string; nombre: string; estado: string }>;
}

export interface DocumentoVisto {
  id: string;
  titulo: string;
  workspaceId: string;
  espacio: string;
  largo: number;
  leido: boolean;
}

/** Lo justo de un sprint visto para validar una propuesta sobre él. */
export interface SprintVisto {
  id: string;
  nombre: string;
  estado: 'PLANNED' | 'ACTIVE' | 'CLOSED';
  boardId: string;
  tablero: string;
}

/** Lo justo de una tarea vista para validar una propuesta sobre ella. */
export interface TareaVista {
  id: string;
  titulo: string;
  columnId: string;
  boardId?: string;
  cerrada: boolean;
  /** Solo si se leyó entera (`consultar_tarea`). */
  pasos?: { id: string; texto: string; hecho: boolean }[];
}

interface TareaEnLista {
  id: string;
  title: string;
  boardId?: string;
  description?: string | null;
  columnId: string;
  priority?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  assignees?: { userId: string }[];
}

@Injectable()
export class ConsultasService {
  private readonly log = new Logger(ConsultasService.name);
  private readonly tasks: ClientProxy;
  private readonly reports: ClientProxy;
  private readonly credentials: ClientProxy;
  private readonly projects: ClientProxy;
  private readonly automation: ClientProxy;

  constructor(config: ConfigService) {
    this.automation = ClientProxyFactory.create(opcionesDeCliente('AUTOMATION', config));
    this.projects = ClientProxyFactory.create(opcionesDeCliente('PROJECTS', config));
    this.tasks = ClientProxyFactory.create(opcionesDeCliente('TASKS', config));
    this.reports = ClientProxyFactory.create(opcionesDeCliente('REPORTS', config));
    this.credentials = ClientProxyFactory.create(opcionesDeCliente('CREDENTIALS', config));
  }

  /** Lo que se le enseña a la persona mientras PRAX consulta. */
  descripcion(nombre: string, args: Record<string, unknown>, ambito: AmbitoDeConsulta): string {
    const proyecto = this.nombreDeProyecto(args.proyectoId, ambito);
    if (nombre === 'consultar_tarea') return 'Leyendo una tarea';
    if (nombre === 'consultar_sprints')
      return `Mirando los sprints${proyecto ? ` de ${proyecto}` : ''}`;
    if (nombre === 'consultar_automatizaciones') return 'Mirando las automatizaciones';
    if (nombre === 'consultar_documentos') {
      return `Buscando documentos${proyecto ? ` en ${proyecto}` : ''}`;
    }
    if (nombre === 'consultar_documento') {
      const titulo = ambito.documentosVistos?.get(String(args.documentoId ?? ''))?.titulo;
      return titulo ? `Leyendo «${titulo}»` : 'Leyendo un documento';
    }
    if (nombre === 'consultar_analisis') {
      return `Consultando el informe «${String(args.informe ?? '')}»${proyecto ? ` de ${proyecto}` : ''}`;
    }
    return `Buscando tareas${proyecto ? ` en ${proyecto}` : ''}`;
  }

  /**
   * Ejecuta una consulta. **Nunca lanza**: un fallo vuelve al modelo como
   * `{ error }` para que lo diga, en vez de tumbar el turno entero por una
   * lectura que no era imprescindible.
   */
  async ejecutar(
    nombre: string,
    args: Record<string, unknown>,
    ambito: AmbitoDeConsulta,
  ): Promise<Record<string, unknown>> {
    try {
      if (nombre === 'consultar_tareas') return await this.tareas(args, ambito);
      if (nombre === 'consultar_tarea') return await this.tarea(args, ambito);
      if (nombre === 'consultar_analisis') return await this.analisis(args, ambito);
      if (nombre === 'consultar_sprints') return await this.sprints(args, ambito);
      if (nombre === 'consultar_documentos') return await this.documentos(args, ambito);
      if (nombre === 'consultar_automatizaciones') {
        return await this.automatizaciones(ambito, args.soloActivas === true);
      }
      if (nombre === 'consultar_documento') return await this.documento(args, ambito);
      return { error: `No existe la consulta ${nombre}.` };
    } catch (error) {
      this.log.warn(`prax_consulta_fallida ${nombre}: ${(error as Error)?.message ?? error}`);
      return { error: 'No se pudo leer eso ahora mismo.' };
    }
  }

  private proyectoPermitido(proyectoId: unknown, ambito: AmbitoDeConsulta): string | null {
    const id = typeof proyectoId === 'string' && proyectoId ? proyectoId : ambito.foco;
    if (!id) return null;
    return ambito.proyectos.some((p) => p.id === id) ? id : null;
  }

  private nombreDeProyecto(proyectoId: unknown, ambito: AmbitoDeConsulta): string | null {
    const id = typeof proyectoId === 'string' && proyectoId ? proyectoId : ambito.foco;
    const nombre = ambito.proyectos.find((p) => p.id === id)?.nombre;
    return nombre ? `«${nombre}»` : null;
  }

  private sinAcceso() {
    return {
      error:
        'Ese proyecto no esta entre los que puedes consultar en esta conversacion. ' +
        'Dilo asi: puede que no sea de esta organizacion o que no este marcado en «Recursos».',
    };
  }

  private async nombresDe(
    ids: string[],
    ambito: AmbitoDeConsulta,
  ): Promise<Record<string, string>> {
    const faltan = [...new Set(ids)].filter((id) => !ambito.nombres[id]);
    if (faltan.length > 0) {
      const perfiles = await firstValueFrom(
        this.credentials.send<{ id: string; firstName?: string; lastName?: string }[]>(
          { cmd: 'user_find_by_ids' },
          { ids: faltan },
        ),
      ).catch(() => []);
      for (const perfil of perfiles ?? []) {
        const nombre = [perfil.firstName, perfil.lastName].filter(Boolean).join(' ').trim();
        if (nombre) ambito.nombres[perfil.id] = nombre;
      }
    }
    return ambito.nombres;
  }

  private async tareas(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    const projectId = this.proyectoPermitido(args.proyectoId, ambito);
    if (!projectId) return this.sinAcceso();

    const todas = await firstValueFrom(
      this.tasks.send<TareaEnLista[]>({ cmd: 'task_find_by_project' }, { projectId }),
    );
    const texto = typeof args.texto === 'string' ? args.texto.trim().toLowerCase() : '';
    const soloAbiertas = args.soloAbiertas !== false;
    const ahora = Date.now();

    const elegidas = (todas ?? []).filter((t) => {
      if (soloAbiertas && t.completedAt) return false;
      if (args.columnaId && t.columnId !== args.columnaId) return false;
      if (args.encargadoId && !(t.assignees ?? []).some((a) => a.userId === args.encargadoId)) {
        return false;
      }
      if (args.soloVencidas && (!t.dueDate || t.completedAt || Date.parse(t.dueDate) >= ahora)) {
        return false;
      }
      if (texto && !`${t.title} ${t.description ?? ''}`.toLowerCase().includes(texto)) {
        return false;
      }
      return true;
    });

    const visibles = elegidas.slice(0, CONSULTA_MAX_TAREAS);
    if (projectId === ambito.foco) {
      for (const t of visibles) {
        ambito.vistas?.set(t.id, {
          ...ambito.vistas.get(t.id),
          id: t.id,
          titulo: t.title,
          columnId: t.columnId,
          ...(t.boardId ? { boardId: t.boardId } : {}),
          cerrada: Boolean(t.completedAt),
        });
      }
    }
    const nombres = await this.nombresDe(
      visibles.flatMap((t) => (t.assignees ?? []).map((a) => a.userId)),
      ambito,
    );

    return {
      proyecto: this.nombreDeProyecto(projectId, ambito),
      total: elegidas.length,
      omitidas: Math.max(0, elegidas.length - visibles.length),
      tareas: visibles.map((t) => ({
        id: t.id,
        titulo: t.title,
        columnaId: t.columnId,
        prioridad: t.priority ?? null,
        vence: t.dueDate ?? null,
        completada: Boolean(t.completedAt),
        encargados: (t.assignees ?? []).map((a) => nombres[a.userId] ?? 'alguien sin nombre'),
      })),
    };
  }

  private async tarea(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    if (typeof args.tareaId !== 'string') return { error: 'Falta el id de la tarea.' };
    const tarea = await firstValueFrom(
      this.tasks.send<Record<string, any>>({ cmd: 'task_find_one' }, { id: args.tareaId }),
    ).catch(() => null);
    /* Una tarea de un proyecto fuera del ámbito responde igual que una que no
       existe: decir «existe pero no puedes» ya es contar algo. */
    if (!tarea || !this.proyectoPermitido(tarea.projectId, ambito)) {
      return { error: 'No encuentro esa tarea entre los proyectos que puedes consultar.' };
    }

    const pasos = (tarea.checklists ?? []).map(
      (c: { id: string; text: string; completed: boolean }) => ({
        id: c.id,
        texto: c.text,
        hecho: c.completed,
      }),
    );
    if (tarea.projectId === ambito.foco) {
      ambito.vistas?.set(tarea.id, {
        id: tarea.id,
        titulo: tarea.title,
        columnId: tarea.columnId,
        boardId: tarea.boardId,
        cerrada: Boolean(tarea.completedAt),
        pasos,
      });
    }

    const comentarios = (tarea.comments ?? []).slice(-CONSULTA_MAX_COMENTARIOS);
    const nombres = await this.nombresDe(
      [
        ...(tarea.assignees ?? []).map((a: { userId: string }) => a.userId),
        ...comentarios.map((c: { authorId: string }) => c.authorId),
      ],
      ambito,
    );

    return {
      id: tarea.id,
      titulo: tarea.title,
      descripcion: tarea.description ?? '',
      columnaId: tarea.columnId,
      prioridad: tarea.priority ?? null,
      vence: tarea.dueDate ?? null,
      completada: Boolean(tarea.completedAt),
      encargados: (tarea.assignees ?? []).map(
        (a: { userId: string }) => nombres[a.userId] ?? 'alguien sin nombre',
      ),
      etiquetas: (tarea.labels ?? []).map((l: { label?: { name?: string } }) => l.label?.name),
      /* Con id: es lo que necesita `proponer_marcar_pasos`. */
      checklist: pasos.map((p: { id: string; texto: string; hecho: boolean }) => ({
        id: p.id,
        paso: p.texto,
        hecho: p.hecho,
      })),
      comentarios: comentarios.map((c: { authorId: string; body: string; createdAt: string }) => ({
        autor: nombres[c.authorId] ?? 'alguien sin nombre',
        texto: c.body,
        cuando: c.createdAt,
      })),
      comentariosOmitidos: Math.max(0, (tarea.comments ?? []).length - comentarios.length),
    };
  }

  /**
   * Los sprints y el backlog de los tableros con Scrum.
   *
   * Los tableros salen de `project_find_one`, que es lo que ve la persona en el
   * proyecto; los sprints, de `sprint_find_by_board` —la misma ruta que la
   * franja del tablero—, y el backlog de `task_find_all` con `onlyBacklog`.
   */
  private async sprints(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    const projectId = this.proyectoPermitido(args.proyectoId, ambito);
    if (!projectId) return this.sinAcceso();

    const proyecto = await firstValueFrom(
      this.projects.send<{
        workspaces?: { boards?: { id: string; name: string; scrumEnabled?: boolean }[] }[];
      }>({ cmd: 'project_find_one' }, { id: projectId }),
    );
    const tableros = (proyecto?.workspaces ?? [])
      .flatMap((w) => w.boards ?? [])
      .filter((b) => b.scrumEnabled)
      .filter((b) => !args.tableroId || b.id === args.tableroId);
    if (tableros.length === 0) {
      return {
        proyecto: this.nombreDeProyecto(projectId, ambito),
        tableros: [],
        nota: 'Ningun tablero de este proyecto tiene Scrum activado.',
      };
    }

    const delFoco = projectId === ambito.foco;
    const resultado: Record<string, unknown>[] = [];
    for (const tablero of tableros) {
      const [sprints, backlog] = await Promise.all([
        firstValueFrom(
          this.projects.send<
            {
              id: string;
              name: string;
              status: 'PLANNED' | 'ACTIVE' | 'CLOSED';
              goal?: string | null;
              startDate?: string | null;
              endDate?: string | null;
            }[]
          >({ cmd: 'sprint_find_by_board' }, { boardId: tablero.id }),
        ),
        firstValueFrom(
          this.tasks.send<{
            items: (TareaEnLista & { estimatePoints?: number | null })[];
            total?: number;
          }>(
            { cmd: 'task_find_all' },
            { boardId: tablero.id, onlyBacklog: true, query: { limit: CONSULTA_MAX_BACKLOG } },
          ),
        ),
      ]);
      const abiertas = (backlog?.items ?? []).filter((t) => !t.completedAt);
      if (delFoco) {
        for (const sprint of sprints ?? []) {
          ambito.sprintsVistos?.set(sprint.id, {
            id: sprint.id,
            nombre: sprint.name,
            estado: sprint.status,
            boardId: tablero.id,
            tablero: tablero.name,
          });
        }
        for (const t of abiertas) {
          ambito.vistas?.set(t.id, {
            ...ambito.vistas.get(t.id),
            id: t.id,
            titulo: t.title,
            columnId: t.columnId,
            boardId: tablero.id,
            cerrada: false,
          });
        }
      }
      resultado.push({
        id: tablero.id,
        nombre: tablero.name,
        /* Los cerrados, solo los tres últimos: sirven para la velocidad, y el
           briefing ya la trae calculada. */
        sprints: (sprints ?? [])
          .filter((s) => s.status !== 'CLOSED')
          .concat((sprints ?? []).filter((s) => s.status === 'CLOSED').slice(-3))
          .map((s) => ({
            id: s.id,
            nombre: s.name,
            estado: s.status,
            meta: s.goal ?? null,
            desde: s.startDate?.slice(0, 10) ?? null,
            hasta: s.endDate?.slice(0, 10) ?? null,
          })),
        backlog: {
          total: backlog?.total ?? abiertas.length,
          omitidas: Math.max(0, (backlog?.total ?? abiertas.length) - abiertas.length),
          tareas: abiertas.map((t) => ({
            id: t.id,
            titulo: t.title,
            prioridad: t.priority ?? null,
            puntos: t.estimatePoints ?? null,
          })),
        },
      });
    }
    return { proyecto: this.nombreDeProyecto(projectId, ambito), tableros: resultado };
  }

  /**
   * Las reglas del proyecto y el catálogo, compactos.
   *
   * Solo con foco y con «Gestionar automatizaciones»: es el permiso que pide
   * la pantalla de reglas, y una consulta de PRAX no enseña nada que esa
   * persona no vería en su pantalla (I6).
   */
  private async automatizaciones(ambito: AmbitoDeConsulta, soloActivas = false) {
    if (!ambito.foco) {
      return { error: 'Las automatizaciones se consultan con un proyecto abierto.' };
    }
    if (ambito.permisos?.canManageAutomations !== true) {
      return {
        error:
          'Para ver las automatizaciones hace falta el permiso «Gestionar automatizaciones». ' +
          'Dilo asi.',
      };
    }
    const [catalogo, reglas] = await Promise.all([
      firstValueFrom(
        this.automation.send<CatalogoDeAutomatizacion>({ cmd: 'automation_catalog' }, {}),
      ),
      firstValueFrom(
        this.automation.send<
          {
            id: string;
            name: string;
            status: string;
            trigger?: { type: string } | null;
            actions?: { type: string }[];
          }[]
        >({ cmd: 'automation_rule_list' }, { projectId: ambito.foco }),
      ),
    ]);
    const disparador = (type?: string) => catalogo.triggers.find((t) => t.type === type);
    const accion = (type: string) => catalogo.actions.find((a) => a.type === type);
    ambito.automatizaciones = {
      catalogo,
      reglas: new Map(
        (reglas ?? []).map((r) => [r.id, { id: r.id, nombre: r.name, estado: r.status }]),
      ),
    };
    return {
      reglas: (reglas ?? [])
        .filter((r) => !soloActivas || r.status === 'ENABLED')
        .map((r) => ({
          id: r.id,
          nombre: r.name,
          estado: r.status,
          frase:
            `Cuando ${disparador(r.trigger?.type)?.sentence ?? r.trigger?.type}, ` +
            (r.actions ?? []).map((a) => accion(a.type)?.sentence ?? a.type).join(' y '),
        })),
      catalogo: {
        disparadores: catalogo.triggers.map((t) => ({
          type: t.type,
          frase: t.sentence,
          config: t.config.map((c) => ({ key: c.key, min: c.min, porDefecto: c.defaultValue })),
          condiciones: t.fields.map((f) => ({
            field: f.field,
            tipo: f.kind,
            operadores: f.operators,
            ...(f.options ? { valores: f.options.map((o) => o.value) } : {}),
            ...(f.source ? { deLaLista: f.source } : {}),
          })),
        })),
        acciones: catalogo.actions.map((a) => ({
          type: a.type,
          frase: a.sentence,
          config: a.config.map((c) => ({
            key: c.key,
            tipo: c.kind,
            obligatorio: c.required,
            ...(c.options ? { valores: c.options.map((o) => o.value) } : {}),
            ...(c.source ? { deLaLista: c.source } : {}),
          })),
        })),
        nota:
          '"deLaLista" dice de donde sale el id: columns (columnas de "tableros"), labels ' +
          '("etiquetas") o members (PERSONAS DEL PROYECTO).',
      },
    };
  }

  /** Los espacios de documentos de un proyecto, con su nombre. */
  private async espaciosDeDocumentos(projectId: string) {
    const proyecto = await firstValueFrom(
      this.projects.send<{ workspaces?: { id: string; name: string; kind?: string }[] }>(
        { cmd: 'project_find_one' },
        { id: projectId },
      ),
    );
    return (proyecto?.workspaces ?? []).filter((w) => w.kind === 'DOCUMENTS');
  }

  /**
   * La lista de documentos, sin el contenido entero: el principio basta para
   * reconocerlo, y un proyecto con veinte documentos largos no cabe en un turno.
   */
  private async documentos(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    const projectId = this.proyectoPermitido(args.proyectoId, ambito);
    if (!projectId) return this.sinAcceso();

    const texto = typeof args.texto === 'string' ? args.texto.trim().toLowerCase() : '';
    const delFoco = projectId === ambito.foco;
    const lista: Record<string, unknown>[] = [];
    for (const espacio of await this.espaciosDeDocumentos(projectId)) {
      const documentos = await firstValueFrom(
        this.projects.send<
          { id: string; title: string; content?: string | null; updatedAt: string }[]
        >({ cmd: 'document_find_by_workspace' }, { workspaceId: espacio.id }),
      );
      for (const d of documentos ?? []) {
        const contenido = d.content ?? '';
        if (texto && !`${d.title} ${contenido}`.toLowerCase().includes(texto)) continue;
        if (delFoco) {
          ambito.documentosVistos?.set(d.id, {
            id: d.id,
            titulo: d.title,
            workspaceId: espacio.id,
            espacio: espacio.name,
            largo: contenido.length,
            leido: ambito.documentosVistos.get(d.id)?.leido ?? false,
          });
        }
        lista.push({
          id: d.id,
          titulo: d.title,
          espacio: espacio.name,
          tocado: d.updatedAt?.slice(0, 10) ?? null,
          caracteres: contenido.length,
          principio: contenido.slice(0, 200),
        });
      }
    }
    return {
      proyecto: this.nombreDeProyecto(projectId, ambito),
      total: lista.length,
      documentos: lista.slice(0, 30),
      omitidos: Math.max(0, lista.length - 30),
    };
  }

  /**
   * Un documento entero, en su copia Markdown (E2 de PLAN-DOCUMENTOS): la que
   * regenera el tiempo real en cada guardado.
   */
  private async documento(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    const id = String(args.documentoId ?? '');
    if (!id) return { error: 'Falta el id del documento.' };

    /* El espacio hace falta para leerlo; sale de la lista si se consultó, y si
       no, de buscarlo en los proyectos del ámbito. Un id de fuera no aparece. */
    let conocido = ambito.documentosVistos?.get(id);
    let proyectoDelDocumento = conocido ? ambito.foco : null;
    if (!conocido) {
      for (const proyecto of ambito.proyectos) {
        for (const espacio of await this.espaciosDeDocumentos(proyecto.id)) {
          const lista = await firstValueFrom(
            this.projects.send<{ id: string; title: string }[]>(
              { cmd: 'document_find_by_workspace' },
              { workspaceId: espacio.id },
            ),
          );
          const hallado = (lista ?? []).find((d) => d.id === id);
          if (hallado) {
            conocido = {
              id,
              titulo: hallado.title,
              workspaceId: espacio.id,
              espacio: espacio.name,
              largo: 0,
              leido: false,
            };
            proyectoDelDocumento = proyecto.id;
            break;
          }
        }
        if (conocido) break;
      }
    }
    if (!conocido) {
      return { error: 'No encuentro ese documento entre los proyectos que puedes consultar.' };
    }

    const documento = await firstValueFrom(
      this.projects.send<{ id: string; title: string; content?: string | null; updatedAt: string }>(
        { cmd: 'document_find_one' },
        { id, workspaceId: conocido.workspaceId },
      ),
    );
    const contenido = documento?.content ?? '';
    if (proyectoDelDocumento === ambito.foco) {
      ambito.documentosVistos?.set(id, { ...conocido, largo: contenido.length, leido: true });
    }
    return {
      id,
      titulo: documento?.title ?? conocido.titulo,
      espacio: conocido.espacio,
      tocado: documento?.updatedAt?.slice(0, 10) ?? null,
      contenido: contenido.slice(0, CONSULTA_MAX_DOCUMENTO),
      recortado: Math.max(0, contenido.length - CONSULTA_MAX_DOCUMENTO),
      /* Dicho aquí para que PRAX no lo intente y se lo descarten: */
      admiteRevision: contenido.length <= REVISION_MAX_CARACTERES,
    };
  }

  private async analisis(args: Record<string, unknown>, ambito: AmbitoDeConsulta) {
    const projectId = this.proyectoPermitido(args.proyectoId, ambito);
    if (!projectId) return this.sinAcceso();
    const informe = args.informe as Informe;
    if (!(informe in INFORMES)) {
      return { error: `Informe desconocido. Los que hay: ${Object.keys(INFORMES).join(', ')}.` };
    }
    const datos = await firstValueFrom(
      this.reports.send<unknown>({ cmd: INFORMES[informe] }, { projectId }),
    );
    return { proyecto: this.nombreDeProyecto(projectId, ambito), informe, datos };
  }
}
