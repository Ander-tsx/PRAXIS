import {
  PROPONER_ASIGNACION,
  PROPONER_BORRADO,
  PROPONER_CHECKLIST,
  PROPONER_COMENTARIO,
  PROPONER_EDICION,
  PROPONER_INICIAR_SPRINT,
  PROPONER_MARCAR_PASOS,
  PROPONER_MENSAJE,
  PROPONER_MOVIMIENTO,
  PROPONER_PLANIFICACION,
  PROPONER_PREGUNTA,
  PROPONER_SPRINT,
  PROPONER_TABLERO,
  PROPONER_TAREA,
  type FunctionDeclaration,
} from './tools';

/**
 * Todo lo que se puede hacer en Praxis, y quién puede (D4 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Por qué una sola lista
 *
 * De aquí salen **dos** cosas que antes vivían separadas:
 *
 * - las herramientas que se le **declaran** a Gemini (`herramientasPara`), y
 * - el **catálogo** que va en el prompt (`catalogoDeCapacidades`), que le dice a
 *   PRAX qué existe en la aplicación, qué puede proponer esta persona y qué no.
 *
 * Con dos listas, una capacidad nueva entraba en una y no en la otra: PRAX
 * sabía proponer algo que el catálogo no nombraba, o nombraba algo que no le
 * habían declarado. Ya pasó con las reglas del prompt por `ambito`.
 *
 * ## Qué cambia para quien no tiene el permiso
 *
 * La herramienta **no se le declara** —el modelo no puede ni expresarla, y
 * `validarPropuesta` la descarta si se la inventa—, pero el catálogo **sí la
 * nombra**, con el permiso que falta. Así, a «bórrame esta tarea» PRAX contesta
 * «para eso necesitas "Eliminar tareas"; pídeselo a quien administra el
 * proyecto» en vez de hacerse el tonto o decir que no sabe.
 *
 * ## Las que no tienen herramienta
 *
 * Invitar gente, repartir roles o pagar el plan no se proponen: se hacen en su
 * pantalla, y muchas piden confirmaciones que una tarjeta no puede dar. Están
 * igual, con `donde`, porque «¿cómo invito a alguien?» es una pregunta que PRAX
 * tiene que saber contestar.
 */
export interface Capacidad {
  /** Qué es, como lo diría una persona. Empieza por verbo. */
  que: string;
  /**
   * Los permisos de proyecto que exige, **todos**. Vacío = cualquiera que
   * llegue a PRAX. Las claves son las de `ProjectPermission`; el mapa que llega
   * del gateway ya viene expandido por jerarquía, así que se leen tal cual.
   */
  permisos: string[];
  /** Las propuestas que la hacen posible. Vacío = solo se explica. */
  herramientas: FunctionDeclaration[];
  /** Dónde se hace a mano en la aplicación. */
  donde: string;
}

/**
 * Cómo se llama cada permiso en la pantalla de roles.
 *
 * Espejo de `PERMISSION_LABELS` de `commons/api/domain.ts`: es lo que la persona
 * ve al pedir un permiso, así que PRAX tiene que usar **esas** palabras y no el
 * nombre de la clave. Si se renombra allí, se renombra aquí.
 */
export const NOMBRE_DE_PERMISO: Record<string, string> = {
  canViewProject: 'Ver el proyecto',
  canCreateBoard: 'Crear tableros',
  canEditBoard: 'Editar tableros',
  canDeleteBoard: 'Eliminar tableros',
  canCreateColumn: 'Crear columnas',
  canEditColumn: 'Editar columnas',
  canDeleteColumn: 'Eliminar columnas',
  canCreateTask: 'Crear tareas',
  canMoveTask: 'Mover tareas y marcar pasos del checklist',
  canEditTask: 'Editar tareas',
  canDeleteTask: 'Eliminar tareas',
  canManageMembers: 'Gestionar el equipo',
  canManageRoles: 'Gestionar los roles',
  canManageAutomations: 'Gestionar automatizaciones',
  canManageIntegrations: 'Gestionar integraciones',
  canComment: 'Comentar en las tareas',
  canManageLabels: 'Gestionar las etiquetas',
  canEditProject: 'Renombrar el proyecto y cambiar su descripción',
  canViewReports: 'Ver los reportes y usar el asistente',
  canDeleteProject: 'Eliminar el proyecto',
  canManageSprint: 'Planear, iniciar y cerrar sprints',
  canEditDocuments: 'Crear y editar documentos',
};

/**
 * El catálogo. El orden es el del prompt: primero el trabajo del día a día.
 *
 * ⚠️ Una herramienta que aparezca en dos capacidades se declara una sola vez
 * (`herramientasPara` deduplica por nombre), pero cada capacidad dice su propio
 * permiso: «marcar pasos» y «mover» comparten `canMoveTask`, y está bien que el
 * catálogo lo diga dos veces.
 */
export const CAPACIDADES: Capacidad[] = [
  {
    que: 'Crear tareas',
    permisos: ['canCreateTask'],
    herramientas: [PROPONER_TAREA],
    donde: 'el «+» de cualquier columna del tablero',
  },
  {
    que: 'Mover tareas de columna y marcar pasos del checklist como hechos',
    permisos: ['canMoveTask'],
    herramientas: [PROPONER_MOVIMIENTO, PROPONER_MARCAR_PASOS],
    donde: 'arrastrando la tarjeta en el tablero, o en el panel de la tarea',
  },
  {
    que: 'Editar tareas: datos, encargados, checklist y estimacion en puntos',
    permisos: ['canEditTask'],
    herramientas: [PROPONER_EDICION, PROPONER_ASIGNACION, PROPONER_CHECKLIST],
    donde: 'el panel de la tarea',
  },
  {
    que: 'Borrar tareas (no se deshace)',
    permisos: ['canDeleteTask'],
    herramientas: [PROPONER_BORRADO],
    donde: 'el menú «⋯» del panel de la tarea',
  },
  {
    que: 'Comentar en tareas y escribir en el chat del equipo',
    permisos: ['canComment'],
    herramientas: [PROPONER_COMENTARIO, PROPONER_MENSAJE],
    donde: 'el panel de la tarea, y la pestaña Chat del proyecto',
  },
  {
    que: 'Crear tableros con sus columnas',
    permisos: ['canCreateBoard', 'canCreateColumn'],
    herramientas: [PROPONER_TABLERO],
    donde: 'la pestaña Espacios del proyecto',
  },
  {
    que: 'Planear sprints: crearlos, empezarlos y repartir tareas entre backlog y sprint',
    permisos: ['canManageSprint'],
    herramientas: [PROPONER_SPRINT, PROPONER_INICIAR_SPRINT, PROPONER_PLANIFICACION],
    donde: 'la franja del sprint y el panel Backlog de un tablero con Scrum',
  },
  {
    que: 'Cerrar un sprint y decidir que pasa con lo que quedo sin terminar',
    permisos: ['canManageSprint'],
    herramientas: [],
    donde: 'la franja del sprint del tablero',
  },
  {
    que: 'Crear y editar documentos',
    permisos: ['canEditDocuments'],
    herramientas: [],
    donde: 'la pestaña Espacios, dentro de un espacio de documentos',
  },
  {
    que: 'Crear, activar y pausar automatizaciones (reglas)',
    permisos: ['canManageAutomations'],
    herramientas: [],
    donde: 'la pestaña Automatizaciones del proyecto',
  },
  {
    que: 'Crear y editar etiquetas',
    permisos: ['canManageLabels'],
    herramientas: [],
    donde: 'el selector de etiquetas del panel de una tarea',
  },
  {
    que: 'Editar, renombrar o borrar columnas y tableros',
    permisos: ['canEditColumn'],
    herramientas: [],
    donde: 'el menú de cada columna y los ajustes del tablero',
  },
  {
    que: 'Invitar o quitar gente del proyecto',
    permisos: ['canManageMembers'],
    herramientas: [],
    donde: 'la pestaña Equipo del proyecto',
  },
  {
    que: 'Crear roles y repartir permisos',
    permisos: ['canManageRoles'],
    herramientas: [],
    donde: 'la pestaña Roles del proyecto',
  },
  {
    que: 'Renombrar el proyecto o cambiar su descripción',
    permisos: ['canEditProject'],
    herramientas: [],
    donde: 'la cabecera del proyecto',
  },
  {
    que: 'Borrar el proyecto entero (no se deshace)',
    permisos: ['canDeleteProject'],
    herramientas: [],
    donde: 'la configuración del proyecto',
  },
];

/**
 * Lo que no depende de ningún permiso de proyecto, dicho aparte para que PRAX
 * no mande a nadie a pedir un permiso que no existe.
 */
const FUERA_DEL_PROYECTO =
  'Fuera del proyecto: el plan, los asientos y la facturacion son de la organizacion ' +
  '(menu de la organizacion, solo quien la administra); el perfil y las notificaciones, ' +
  'de cada persona; los chats privados, desde Mensajes. Nada de eso lo puedes proponer.';

/**
 * Las herramientas que le tocan a esta persona.
 *
 * Preguntar va **siempre** y va primero: no cambia nada, así que no depende de
 * ningún permiso, y negársela a un rol de solo lectura dejaría a PRAX sin forma
 * de desambiguar justo con quien más falta hace.
 *
 * Devolver solo la pregunta es válido y es lo que le pasa a un rol de solo
 * lectura: PRAX responde y consulta, pero no propone nada.
 */
export function herramientasPara(permisos: Record<string, boolean>): FunctionDeclaration[] {
  const vistas = new Set<string>([PROPONER_PREGUNTA.name]);
  const tools: FunctionDeclaration[] = [PROPONER_PREGUNTA];
  for (const capacidad of CAPACIDADES) {
    if (!tiene(permisos, capacidad)) continue;
    for (const herramienta of capacidad.herramientas) {
      if (vistas.has(herramienta.name)) continue;
      vistas.add(herramienta.name);
      tools.push(herramienta);
    }
  }
  return tools;
}

function tiene(permisos: Record<string, boolean>, capacidad: Capacidad): boolean {
  return capacidad.permisos.every((permiso) => permisos[permiso] === true);
}

/**
 * El catálogo para el prompt: una línea por capacidad.
 *
 * Tres formas de línea, y la diferencia importa:
 *
 * - `PUEDES PROPONERLO` — tiene el permiso y hay herramienta.
 * - `LO HACE A MANO` — tiene el permiso pero no hay herramienta: PRAX explica
 *   dónde, no finge que no existe.
 * - `LE FALTA «…»` — no tiene el permiso. PRAX dice cuál, con el nombre de la
 *   pantalla de roles, y a quién pedírselo.
 *
 * Compacto a propósito: viaja en **cada** turno (ver `medir-prompt`).
 */
export function catalogoDeCapacidades(permisos: Record<string, boolean>): string {
  const lineas = CAPACIDADES.map((capacidad) => {
    if (!tiene(permisos, capacidad)) {
      const faltan = capacidad.permisos
        .filter((permiso) => permisos[permiso] !== true)
        .map((permiso) => `«${NOMBRE_DE_PERMISO[permiso] ?? permiso}»`)
        .join(' y ');
      return `- ${capacidad.que}: LE FALTA ${faltan}.`;
    }
    if (capacidad.herramientas.length === 0) {
      return `- ${capacidad.que}: LO HACE A MANO en ${capacidad.donde}.`;
    }
    return `- ${capacidad.que}: PUEDES PROPONERLO (${capacidad.herramientas
      .map((h) => h.name)
      .join(', ')}).`;
  });
  return [
    'QUE SE PUEDE HACER EN PRAXIS Y QUE PUEDE HACER ESTA PERSONA AQUI:',
    ...lineas,
    FUERA_DEL_PROYECTO,
  ].join('\n');
}
