import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/** Una tarea a la que se puede apuntar con `/`. */
export interface ChatRefOption {
  kind: 'task';
  id: string;
  label: string;
  /** De dónde cuelga: «Sprint 1 · Rediseño». Distingue dos con el mismo nombre. */
  contexto: string;
  /** En qué columna está. Es lo que convierte el nombre en información útil. */
  estado?: string;
}

export interface Mencionables {
  /**
   * Ids de personas. **Vacío en las conversaciones privadas**: sois dos, y
   * mencionar a quien tienes delante no aporta nada.
   */
  people: string[];
  refs: ChatRefOption[];
}

/** Un tablero del que hay que sacar tareas, con dónde vive. */
interface Tablero {
  id: string;
  nombre: string;
  proyecto: string;
  slug: string;
}

/**
 * El catálogo de lo que se puede nombrar en una conversación.
 *
 * ## Solo tareas, y a propósito
 *
 * ⚠️ La primera versión ofrecía también proyectos, espacios y tableros. Era
 * ruido: en un desplegable de siete huecos, tres los ocupaban cosas que nadie
 * nombra en una frase, y empujaban fuera a las tareas — que es de lo único que
 * se habla de verdad en un chat de trabajo.
 *
 * ## Por qué se compone aquí
 *
 * Los tableros y la membresía son de projects-service; **las tareas son de
 * tasks-service**. El gateway es el único que habla con los dos, así que es el
 * único sitio donde se pueden juntar sin inventar una dependencia entre
 * microservicios que hoy no existe.
 *
 * ⚠️ **El alcance lo decide projects-service, no esto.** Aquí solo se piden las
 * tareas de los tableros que aquel ya autorizó. Filtrar por permisos en este
 * punto sería una segunda verdad que puede desviarse de la primera.
 */
@Injectable()
export class MentionablesService {
  private readonly log = new Logger(MentionablesService.name);

  constructor(
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  async para(dto: {
    requesterId: string;
    projectId?: string;
    peerId?: string;
  }): Promise<Mencionables> {
    const base = await firstValueFrom(
      this.projectsClient.send<{ people: string[]; tableros: Tablero[] }>(
        { cmd: 'chat_mentionables' },
        dto,
      ),
    );

    return {
      people: base.people ?? [],
      refs: await this.tareasDe(base.tableros ?? []),
    };
  }

  /**
   * Las tareas de unos tableros, con su estado.
   *
   * Una petición por tablero y **en paralelo**: no hay un comando que acepte
   * varios, y encadenarlas haría que un proyecto con seis tableros tardara seis
   * veces más en abrir un desplegable.
   *
   * ⚠️ Un tablero que falle **cae a lista vacía en vez de tumbar el catálogo**:
   * quedarse sin poder nombrar nada porque un tablero no respondió es mucho peor
   * que ofrecer una tarea menos.
   *
   * ⚠️ `limit=100` y no `limit=1`: la clave de caché de tasks-service
   * (`tasks:board:<id>`) **no incluye la paginación**, así que pedir menos deja
   * cacheado un tablero recortado durante 60 s y el tablero real se pinta casi
   * vacío. Es la trampa del §24.3, y se paga igual desde aquí.
   */
  private async tareasDe(tableros: Tablero[]): Promise<ChatRefOption[]> {
    if (tableros.length === 0) return [];

    const porTablero = await Promise.all(
      tableros.map((tablero) =>
        firstValueFrom(
          this.tasksClient.send<{ items?: { id: string; title: string; status?: string }[] }>(
            { cmd: 'task_find_all' },
            { boardId: tablero.id, query: { limit: 100 } },
          ),
        ).catch((error: Error) => {
          this.log.warn(`No se pudieron leer las tareas de ${tablero.id}: ${error.message}`);
          return { items: [] };
        }),
      ),
    );

    return porTablero.flatMap((pagina, indice) => {
      const tablero = tableros[indice] as Tablero;
      return (pagina?.items ?? []).map((tarea) => ({
        kind: 'task' as const,
        id: tarea.id,
        label: tarea.title,
        /* El tablero y el proyecto: en una conversación privada las tareas
           pueden venir de varios proyectos y solo el nombre no las distingue. */
        contexto: `${tablero.nombre} · ${tablero.proyecto}`,
        estado: tarea.status,
      }));
    });
  }
}
