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

export const HERRAMIENTAS_DE_CONSULTA = [CONSULTAR_TAREAS, CONSULTAR_TAREA, CONSULTAR_ANALISIS];
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
}

/** Lo justo de una tarea vista para validar una propuesta sobre ella. */
export interface TareaVista {
  id: string;
  titulo: string;
  columnId: string;
  cerrada: boolean;
  /** Solo si se leyó entera (`consultar_tarea`). */
  pasos?: { id: string; texto: string; hecho: boolean }[];
}

interface TareaEnLista {
  id: string;
  title: string;
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

  constructor(config: ConfigService) {
    this.tasks = ClientProxyFactory.create(opcionesDeCliente('TASKS', config));
    this.reports = ClientProxyFactory.create(opcionesDeCliente('REPORTS', config));
    this.credentials = ClientProxyFactory.create(opcionesDeCliente('CREDENTIALS', config));
  }

  /** Lo que se le enseña a la persona mientras PRAX consulta. */
  descripcion(nombre: string, args: Record<string, unknown>, ambito: AmbitoDeConsulta): string {
    const proyecto = this.nombreDeProyecto(args.proyectoId, ambito);
    if (nombre === 'consultar_tarea') return 'Leyendo una tarea';
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
