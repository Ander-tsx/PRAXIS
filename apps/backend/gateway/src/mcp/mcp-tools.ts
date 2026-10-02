import {
  COLUMN_COLORS,
  LABEL_COLORS,
  type PatScope,
  Priority,
  WORKSPACE_KINDS,
} from '@praxis/contracts';

/**
 * El catálogo de herramientas del MCP (M6 de docs/PLAN-MCP.md). **La única
 * lista**: de aquí salen lo que ve el agente (`tools/list`), el alcance que
 * exige cada una y la ruta del gateway a la que llama.
 *
 * ## Cada herramienta es una ruta que ya existe
 *
 * Ninguna escribe por su cuenta: llaman a la API de siempre con el JWT del
 * canje (M5), así que los guards, los permisos de proyecto, las cuotas y la
 * validación son exactamente los de la interfaz (I1). Si una herramienta nueva
 * necesita una ruta que no existe, la ruta se hace aparte y con sus guards.
 *
 * ## Tres reglas que no dan error si se rompen
 *
 * 1. 🔴 **Ningún esquema declara `organizationId`** (I2). La organización sale
 *    del token; las que la necesitan la reciben en `inject`. Lo vigila
 *    `mcp-tools.spec.ts`.
 * 2. 🔴 **El método casa con el alcance** (I5): `read` solo hace `GET`, y un
 *    `DELETE` exige `delete`. También en `mcp-tools.spec.ts`.
 * 3. ⚠️ **`body` y `query` listan solo los campos del DTO.** Uno de más da 400
 *    (`forbidNonWhitelisted`), y el agente no sabría por qué.
 *
 * ## Por qué tan cortas las descripciones
 *
 * Viajan en **cada** mensaje del agente del usuario, a su coste (trampa 3 del
 * plan). Se dice qué hace y lo que no se adivina; nada más.
 */

/** Un esquema JSON, el subconjunto que usamos. Sin `oneOf`/`anyOf` (trampa 2). */
export interface JsonSchema {
  type: 'object' | 'string' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: readonly string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  additionalProperties?: boolean;
}

/**
 * Qué identificador de la entrada dice **en qué proyecto** cae la herramienta.
 * Con él se comprueba que ese proyecto es de la organización del token (I2)
 * antes de llamar a nada.
 *
 * `organization` es para las que no tocan un proyecto concreto (listar,
 * crear): la organización la inyecta el MCP.
 */
export type ToolAnchor = 'organization' | 'projectId' | 'workspaceId' | 'boardId' | 'taskId';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Lo que hace una herramienta que es una sola llamada. */
export interface ToolCall {
  method: HttpMethod;
  /** Con `{param}` para lo que sale de la entrada. Se codifica siempre. */
  path: string;
  /** Campos de la entrada que van en el cuerpo. */
  body?: readonly string[];
  /** Campos de la entrada que van en la consulta. */
  query?: readonly string[];
  /** La organización del token, metida donde la ruta la espera. */
  inject?: { organizationId: 'body' | 'query' };
}

/** Las que no son una sola llamada: lotes y las que resuelven `status`. */
export type CustomTool =
  | 'create_task'
  | 'create_tasks'
  | 'move_task'
  | 'move_tasks'
  | 'delete_tasks'
  | 'list_my_tasks';

export interface McpTool {
  name: string;
  description: string;
  scope: PatScope;
  anchor: ToolAnchor;
  inputSchema: JsonSchema;
  call?: ToolCall;
  custom?: CustomTool;
  /**
   * El método que acaba usando una `custom`, para comprobar I5 igual que en
   * las demás.
   */
  customMethod?: HttpMethod;
}

/* ─── Piezas de esquema ─────────────────────────────────────────────────── */

const id = (description: string): JsonSchema => ({ type: 'string', format: 'uuid', description });
const text = (description: string, maxLength?: number, minLength?: number): JsonSchema => ({
  type: 'string',
  description,
  ...(maxLength ? { maxLength } : {}),
  ...(minLength ? { minLength } : {}),
});
const int = (description: string, minimum?: number, maximum?: number): JsonSchema => ({
  type: 'integer',
  description,
  ...(minimum !== undefined ? { minimum } : {}),
  ...(maximum !== undefined ? { maximum } : {}),
});
const bool = (description: string): JsonSchema => ({ type: 'boolean', description });
const oneOf = (description: string, values: readonly string[]): JsonSchema => ({
  type: 'string',
  description,
  enum: values,
});
const ids = (description: string, maxItems = 20): JsonSchema => ({
  type: 'array',
  description,
  items: { type: 'string', format: 'uuid' },
  maxItems,
});
const date = (description: string): JsonSchema => ({
  type: 'string',
  format: 'date-time',
  description,
});
const object = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const PRIORIDADES = Object.values(Priority);

/** Los campos de una tarea al crearla, compartidos por la suelta y el lote. */
const CAMPOS_DE_TAREA_NUEVA: Record<string, JsonSchema> = {
  columnId: id('Columna donde nace. Su estado se pone solo.'),
  title: text('Título', 255, 1),
  description: text('Descripción, en Markdown'),
  assigneeIds: ids('Encargados (ids de usuario, miembros del proyecto)'),
  dueDate: date('Fecha límite, ISO 8601'),
  priority: oneOf('Prioridad', PRIORIDADES),
  labelIds: ids('Etiquetas del proyecto'),
  parentTaskId: id('Tarea madre, si es subtarea'),
  sprintId: id('Sprint al que va (tableros con Scrum)'),
  estimatePoints: int('Puntos de estimación', 0, 999),
};

/** Lo que se reenvía tal cual al crear una tarea. `status` lo pone el MCP. */
export const CAMPOS_CREAR_TAREA = Object.keys(CAMPOS_DE_TAREA_NUEVA);

const IRREVERSIBLE = 'Irreversible: no se puede deshacer.';

/* ─── El catálogo ───────────────────────────────────────────────────────── */

export const MCP_TOOLS: readonly McpTool[] = [
  /* Lectura */
  {
    name: 'list_projects',
    description: 'Proyectos de la organización del token en los que estás.',
    scope: 'read',
    anchor: 'organization',
    inputSchema: object({ search: text('Filtra por nombre'), limit: int('Máximo', 1, 100) }),
    call: {
      method: 'GET',
      path: '/projects',
      query: ['search', 'limit'],
      inject: { organizationId: 'query' },
    },
  },
  {
    name: 'get_project',
    description: 'Un proyecto. Acepta el id o el slug.',
    scope: 'read',
    anchor: 'projectId',
    inputSchema: object({ projectId: text('Id o slug del proyecto') }, ['projectId']),
    call: { method: 'GET', path: '/projects/{projectId}' },
  },
  {
    name: 'get_my_permissions',
    description: 'Qué puedes hacer en un proyecto. Útil antes de escribir.',
    scope: 'read',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto') }, ['projectId']),
    call: { method: 'GET', path: '/projects/{projectId}/permissions/me' },
  },
  {
    name: 'list_workspaces',
    description: 'Espacios de un proyecto (de tableros o de documentos).',
    scope: 'read',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto') }, ['projectId']),
    call: { method: 'GET', path: '/projects/{projectId}/workspaces' },
  },
  {
    name: 'list_boards',
    description: 'Tableros de un espacio.',
    scope: 'read',
    anchor: 'workspaceId',
    inputSchema: object({ workspaceId: id('Espacio') }, ['workspaceId']),
    call: { method: 'GET', path: '/workspaces/{workspaceId}/boards' },
  },
  {
    name: 'get_board',
    description: 'Un tablero con sus columnas.',
    scope: 'read',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero') }, ['boardId']),
    call: { method: 'GET', path: '/boards/{boardId}' },
  },
  {
    name: 'list_tasks',
    description: 'Tareas de un tablero, paginadas. `sprintId` y `backlog` no se combinan.',
    scope: 'read',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        columnId: id('Solo esa columna'),
        sprintId: id('Solo ese sprint'),
        backlog: bool('Solo las que no tienen sprint'),
        page: int('Página', 1),
        limit: int('Por página', 1, 100),
      },
      ['boardId'],
    ),
    call: {
      method: 'GET',
      path: '/boards/{boardId}/tasks',
      query: ['columnId', 'sprintId', 'backlog', 'page', 'limit'],
    },
  },
  {
    name: 'get_task',
    description: 'Una tarea con su detalle.',
    scope: 'read',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea') }, ['taskId']),
    call: { method: 'GET', path: '/tasks/{taskId}' },
  },
  {
    name: 'list_my_tasks',
    description: 'Tus tareas asignadas en la organización del token.',
    scope: 'read',
    anchor: 'organization',
    inputSchema: object({
      projectId: id('Solo ese proyecto'),
      status: text('Solo ese estado (nombre de columna)'),
      priority: oneOf('Solo esa prioridad', PRIORIDADES),
      dueBefore: date('Que venzan antes de'),
      excludeDone: bool('Sin las terminadas'),
      limit: int('Máximo', 1, 100),
    }),
    custom: 'list_my_tasks',
    customMethod: 'GET',
  },
  {
    name: 'list_comments',
    description: 'Comentarios de una tarea.',
    scope: 'read',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea') }, ['taskId']),
    call: { method: 'GET', path: '/tasks/{taskId}/comments' },
  },
  {
    name: 'list_labels',
    description: 'Etiquetas de un proyecto.',
    scope: 'read',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto') }, ['projectId']),
    call: { method: 'GET', path: '/projects/{projectId}/labels' },
  },
  {
    name: 'list_members',
    description: 'Miembros de un proyecto, con sus ids para asignar tareas.',
    scope: 'read',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto') }, ['projectId']),
    call: { method: 'GET', path: '/projects/{projectId}/members' },
  },
  {
    name: 'list_sprints',
    description: 'Sprints de un tablero con Scrum.',
    scope: 'read',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero') }, ['boardId']),
    call: { method: 'GET', path: '/boards/{boardId}/sprints' },
  },
  {
    name: 'list_documents',
    description: 'Documentos de un espacio de documentos.',
    scope: 'read',
    anchor: 'workspaceId',
    inputSchema: object({ workspaceId: id('Espacio') }, ['workspaceId']),
    call: { method: 'GET', path: '/workspaces/{workspaceId}/documents' },
  },
  {
    name: 'get_document',
    description: 'Un documento.',
    scope: 'read',
    anchor: 'workspaceId',
    inputSchema: object({ workspaceId: id('Espacio'), documentId: id('Documento') }, [
      'workspaceId',
      'documentId',
    ]),
    call: { method: 'GET', path: '/workspaces/{workspaceId}/documents/{documentId}' },
  },

  /* Escritura */
  {
    name: 'create_project',
    description: 'Crea un proyecto en la organización del token.',
    scope: 'write',
    anchor: 'organization',
    inputSchema: object({ name: text('Nombre', 100, 2), description: text('Descripción', 500) }, [
      'name',
    ]),
    call: {
      method: 'POST',
      path: '/projects',
      body: ['name', 'description'],
      inject: { organizationId: 'body' },
    },
  },
  {
    name: 'update_project',
    description: 'Cambia nombre o descripción. Renombrar cambia el slug.',
    scope: 'write',
    anchor: 'projectId',
    inputSchema: object(
      {
        projectId: id('Proyecto'),
        name: text('Nombre', 100, 2),
        description: text('Descripción', 500),
      },
      ['projectId'],
    ),
    call: { method: 'PATCH', path: '/projects/{projectId}', body: ['name', 'description'] },
  },
  {
    name: 'create_workspace',
    description: 'Crea un espacio en un proyecto.',
    scope: 'write',
    anchor: 'projectId',
    inputSchema: object(
      {
        projectId: id('Proyecto'),
        name: text('Nombre', 100, 2),
        kind: oneOf('De tableros o de documentos', WORKSPACE_KINDS),
      },
      ['projectId', 'name'],
    ),
    call: { method: 'POST', path: '/projects/{projectId}/workspaces', body: ['name', 'kind'] },
  },
  {
    name: 'create_board',
    description: 'Crea un tablero en un espacio de tableros.',
    scope: 'write',
    anchor: 'workspaceId',
    inputSchema: object({ workspaceId: id('Espacio'), name: text('Nombre', 100, 2) }, [
      'workspaceId',
      'name',
    ]),
    call: { method: 'POST', path: '/workspaces/{workspaceId}/boards', body: ['name'] },
  },
  {
    name: 'update_board',
    description: 'Renombra un tablero o le activa Scrum (sprints, backlog, puntos).',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        name: text('Nombre', 100, 2),
        scrumEnabled: bool('Scrum activado'),
      },
      ['boardId'],
    ),
    call: { method: 'PATCH', path: '/boards/{boardId}', body: ['name', 'scrumEnabled'] },
  },
  {
    name: 'create_column',
    description: 'Crea una columna. `order` empieza en 0.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        name: text('Nombre', 100, 1),
        order: int('Posición', 0),
        color: oneOf('Color', COLUMN_COLORS),
      },
      ['boardId', 'name', 'order'],
    ),
    call: { method: 'POST', path: '/boards/{boardId}/columns', body: ['name', 'order', 'color'] },
  },
  {
    name: 'update_column',
    description: 'Cambia nombre, color o límite WIP de una columna.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        columnId: id('Columna'),
        name: text('Nombre', 100, 1),
        color: oneOf('Color', COLUMN_COLORS),
        wipLimit: int('Límite WIP', 1, 999),
      },
      ['boardId', 'columnId'],
    ),
    call: {
      method: 'PATCH',
      path: '/boards/{boardId}/columns/{columnId}',
      body: ['name', 'color', 'wipLimit'],
    },
  },
  {
    name: 'create_task',
    description: 'Crea una tarea en una columna.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero'), ...CAMPOS_DE_TAREA_NUEVA }, [
      'boardId',
      'columnId',
      'title',
    ]),
    custom: 'create_task',
    customMethod: 'POST',
  },
  {
    name: 'create_tasks',
    description:
      'Crea varias tareas en un tablero (máx. 50). No es atómico: devuelve qué salió y qué falló.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        tasks: {
          type: 'array',
          maxItems: 50,
          items: object(CAMPOS_DE_TAREA_NUEVA, ['columnId', 'title']),
        },
      },
      ['boardId', 'tasks'],
    ),
    custom: 'create_tasks',
    customMethod: 'POST',
  },
  {
    name: 'update_task',
    description: 'Cambia campos de una tarea. Para cambiarla de columna, move_task.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object(
      {
        taskId: id('Tarea'),
        title: text('Título', 255, 1),
        description: text('Descripción, en Markdown'),
        assigneeIds: ids('Encargados: sustituye la lista entera'),
        labelIds: ids('Etiquetas: sustituye la lista entera'),
        dueDate: date('Fecha límite'),
        priority: oneOf('Prioridad', PRIORIDADES),
        sprintId: id('Sprint'),
        estimatePoints: int('Puntos', 0, 999),
      },
      ['taskId'],
    ),
    call: {
      method: 'PATCH',
      path: '/tasks/{taskId}',
      body: [
        'title',
        'description',
        'assigneeIds',
        'labelIds',
        'dueDate',
        'priority',
        'sprintId',
        'estimatePoints',
      ],
    },
  },
  {
    name: 'move_task',
    description: 'Mueve una tarea a otra columna del mismo tablero.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object(
      { taskId: id('Tarea'), columnId: id('Columna destino'), order: int('Posición', 0) },
      ['taskId', 'columnId'],
    ),
    custom: 'move_task',
    customMethod: 'POST',
  },
  {
    name: 'move_tasks',
    description: 'Mueve varias tareas (máx. 50). No es atómico.',
    scope: 'write',
    anchor: 'organization',
    inputSchema: object(
      {
        moves: {
          type: 'array',
          maxItems: 50,
          items: object(
            { taskId: id('Tarea'), columnId: id('Columna destino'), order: int('Posición', 0) },
            ['taskId', 'columnId'],
          ),
        },
      },
      ['moves'],
    ),
    custom: 'move_tasks',
    customMethod: 'POST',
  },
  {
    name: 'assign_task',
    description: 'Fija los encargados de una tarea (sustituye la lista).',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), assigneeIds: ids('Encargados') }, [
      'taskId',
      'assigneeIds',
    ]),
    call: { method: 'POST', path: '/tasks/{taskId}/assign', body: ['assigneeIds'] },
  },
  {
    name: 'add_checklist_item',
    description: 'Añade un punto al checklist de una tarea.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object(
      { taskId: id('Tarea'), text: text('Texto', 500, 1), order: int('Posición', 0) },
      ['taskId', 'text'],
    ),
    call: { method: 'POST', path: '/tasks/{taskId}/checklists', body: ['text', 'order'] },
  },
  {
    name: 'toggle_checklist_item',
    description: 'Marca o desmarca un punto del checklist.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), itemId: id('Punto del checklist') }, [
      'taskId',
      'itemId',
    ]),
    call: { method: 'POST', path: '/tasks/{taskId}/checklists/{itemId}/toggle', body: [] },
  },
  {
    name: 'add_comment',
    description: 'Comenta en una tarea. Firma quien creó el token.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), body: text('Comentario', 4000, 1) }, [
      'taskId',
      'body',
    ]),
    call: { method: 'POST', path: '/tasks/{taskId}/comments', body: ['body'] },
  },
  {
    name: 'create_label',
    description: 'Crea una etiqueta en un proyecto.',
    scope: 'write',
    anchor: 'projectId',
    inputSchema: object(
      {
        projectId: id('Proyecto'),
        name: text('Nombre', 40, 1),
        color: oneOf('Color', LABEL_COLORS),
      },
      ['projectId', 'name', 'color'],
    ),
    call: { method: 'POST', path: '/projects/{projectId}/labels', body: ['name', 'color'] },
  },
  {
    name: 'create_sprint',
    description: 'Crea un sprint en un tablero con Scrum.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      { boardId: id('Tablero'), name: text('Nombre', 100, 2), goal: text('Objetivo', 500) },
      ['boardId', 'name'],
    ),
    call: { method: 'POST', path: '/boards/{boardId}/sprints', body: ['name', 'goal'] },
  },
  {
    name: 'update_sprint',
    description: 'Cambia nombre, objetivo o fechas de un sprint.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        sprintId: id('Sprint'),
        name: text('Nombre', 100, 2),
        goal: text('Objetivo', 500),
        startDate: date('Inicio'),
        endDate: date('Fin'),
      },
      ['boardId', 'sprintId'],
    ),
    call: {
      method: 'PATCH',
      path: '/boards/{boardId}/sprints/{sprintId}',
      body: ['name', 'goal', 'startDate', 'endDate'],
    },
  },
  {
    name: 'add_tasks_to_sprint',
    description: 'Mete tareas del backlog en un sprint.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      { boardId: id('Tablero'), sprintId: id('Sprint'), taskIds: ids('Tareas', 200) },
      ['boardId', 'sprintId', 'taskIds'],
    ),
    call: { method: 'POST', path: '/boards/{boardId}/sprints/{sprintId}/tasks', body: ['taskIds'] },
  },
  {
    name: 'start_sprint',
    description: 'Arranca un sprint con sus fechas.',
    scope: 'write',
    anchor: 'boardId',
    inputSchema: object(
      {
        boardId: id('Tablero'),
        sprintId: id('Sprint'),
        startDate: date('Inicio'),
        endDate: date('Fin'),
      },
      ['boardId', 'sprintId', 'startDate', 'endDate'],
    ),
    call: {
      method: 'POST',
      path: '/boards/{boardId}/sprints/{sprintId}/start',
      body: ['startDate', 'endDate'],
    },
  },
  {
    name: 'create_document',
    description: 'Crea un documento con contenido en Markdown. Después solo se edita en vivo.',
    scope: 'write',
    anchor: 'workspaceId',
    inputSchema: object(
      {
        workspaceId: id('Espacio de documentos'),
        title: text('Título', 200, 1),
        content: text('Markdown'),
      },
      ['workspaceId', 'title'],
    ),
    call: {
      method: 'POST',
      path: '/workspaces/{workspaceId}/documents',
      body: ['title', 'content'],
    },
  },
  {
    name: 'link_task_document',
    description: 'Vincula un documento a una tarea.',
    scope: 'write',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), documentId: id('Documento') }, [
      'taskId',
      'documentId',
    ]),
    call: { method: 'POST', path: '/tasks/{taskId}/documents', body: ['documentId'] },
  },

  /* Borrado. Todas irreversibles, y lo dicen: el agente lo lee y decide si
     confirmarlo con su usuario (trampa 4 del plan). */
  {
    name: 'delete_task',
    description: `Borra una tarea. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea') }, ['taskId']),
    call: { method: 'DELETE', path: '/tasks/{taskId}', body: [] },
  },
  {
    name: 'delete_tasks',
    description: `Borra varias tareas (máx. 50). No es atómico. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'organization',
    inputSchema: object({ taskIds: ids('Tareas', 50) }, ['taskIds']),
    custom: 'delete_tasks',
    customMethod: 'DELETE',
  },
  {
    name: 'delete_checklist_item',
    description: `Borra un punto del checklist. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), itemId: id('Punto') }, ['taskId', 'itemId']),
    call: { method: 'DELETE', path: '/tasks/{taskId}/checklists/{itemId}', body: [] },
  },
  {
    name: 'delete_comment',
    description: `Borra un comentario. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'taskId',
    inputSchema: object({ taskId: id('Tarea'), commentId: id('Comentario') }, [
      'taskId',
      'commentId',
    ]),
    call: { method: 'DELETE', path: '/tasks/{taskId}/comments/{commentId}' },
  },
  {
    name: 'delete_column',
    description: `Borra una columna. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero'), columnId: id('Columna') }, [
      'boardId',
      'columnId',
    ]),
    call: { method: 'DELETE', path: '/boards/{boardId}/columns/{columnId}' },
  },
  {
    name: 'delete_board',
    description: `Borra un tablero. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero') }, ['boardId']),
    call: { method: 'DELETE', path: '/boards/{boardId}' },
  },
  {
    name: 'delete_label',
    description: `Borra una etiqueta del proyecto. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto'), labelId: id('Etiqueta') }, [
      'projectId',
      'labelId',
    ]),
    call: { method: 'DELETE', path: '/projects/{projectId}/labels/{labelId}' },
  },
  {
    name: 'delete_sprint',
    description: `Borra un sprint. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'boardId',
    inputSchema: object({ boardId: id('Tablero'), sprintId: id('Sprint') }, [
      'boardId',
      'sprintId',
    ]),
    call: { method: 'DELETE', path: '/boards/{boardId}/sprints/{sprintId}' },
  },
  {
    name: 'delete_document',
    description: `Borra un documento. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'workspaceId',
    inputSchema: object({ workspaceId: id('Espacio'), documentId: id('Documento') }, [
      'workspaceId',
      'documentId',
    ]),
    call: { method: 'DELETE', path: '/workspaces/{workspaceId}/documents/{documentId}' },
  },
  {
    name: 'delete_project',
    description: `Borra un proyecto entero. Solo su dueño. ${IRREVERSIBLE}`,
    scope: 'delete',
    anchor: 'projectId',
    inputSchema: object({ projectId: id('Proyecto') }, ['projectId']),
    call: { method: 'DELETE', path: '/projects/{projectId}' },
  },
];

/** Por nombre, para `tools/call`. */
export const MCP_TOOLS_BY_NAME = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));

/** El método HTTP que acaba usando una herramienta. Para I5. */
export function methodOf(tool: McpTool): HttpMethod {
  return tool.call?.method ?? tool.customMethod ?? 'POST';
}
