/**
 * Las herramientas que se le declaran a Gemini, y el filtro que decide cuáles.
 *
 * ## La decisión que gobierna este archivo
 *
 * **La IA propone; ejecuta el código que ya existe.** Cuando el modelo devuelve
 * una llamada a función, este servicio **no la ejecuta**: la devuelve como
 * propuesta, el frontend pinta una tarjeta de confirmación y solo al pulsar
 * «Aceptar» se llama a la Server Action que ya usa el formulario del tablero.
 *
 * Consecuencia: no se abre ninguna vía de escritura nueva. Sin `canCreateTask`,
 * aceptar falla igual que le fallaría a esa persona pulsando el botón a mano.
 *
 * ## Y aun así se filtran por permisos
 *
 * Podría parecer redundante —el gateway va a rechazar igual— pero no lo es:
 * proponerle a alguien algo que no puede hacer es enseñarle un botón que
 * revienta al pulsarlo, que es exactamente lo que existe para evitar
 * `permissions/me`. Que la herramienta no entre en la lista significa que el
 * modelo **no puede ni sugerirlo**.
 *
 * ⚠️ **El filtro ya no vive aquí**: está en `capabilities.ts` (D4 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md), que es la única lista de qué herramienta pide
 * qué permiso y de la que sale también el catálogo del prompt. Aquí quedan las
 * declaraciones.
 */

import { PROPONER_PLANTILLA } from './template';

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Las prioridades del dominio, tal cual las declara el DTO de tarea. */
const PRIORIDADES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const PROPONER_TAREA: FunctionDeclaration = {
  name: 'proponer_tarea',
  description:
    'Prepara una propuesta de tarea nueva para que la persona la revise y la acepte. ' +
    'NO crea nada: nada existe hasta que la acepte. Usala cuando te pidan crear, ' +
    'anadir o abrir una tarea, o cuando propongas tu una a partir de los reportes.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description: 'Titulo corto y concreto, en infinitivo. Maximo 120 caracteres.',
      },
      description: {
        type: 'STRING',
        description: 'Opcional. Que hay que hacer y por que, en dos o tres frases.',
      },
      columnId: {
        type: 'STRING',
        description:
          'id de una columna de "tableros" del contexto. ⚠️ El proyecto puede tener ' +
          'VARIOS tableros y cada uno tiene sus propias columnas: elige primero el ' +
          'tablero y despues la columna DENTRO de ese tablero. Si no dicen cual, usa ' +
          'el tablero del que se venga hablando; si no hay ninguno claro y hay mas de ' +
          'uno, PREGUNTA en vez de elegir. Dentro del tablero, y salvo que digan otra ' +
          'cosa, la columna de menor "orden": una tarea nueva empieza por el principio.',
      },
      priority: {
        type: 'STRING',
        enum: PRIORIDADES,
        description: 'Deducela de como lo cuentan. Si no hay ninguna senal, MEDIUM.',
      },
      dueDate: {
        type: 'STRING',
        description:
          'Opcional, formato YYYY-MM-DD. Solo si la persona da una fecha o un plazo ' +
          'explicito. NUNCA te la inventes a partir de la prediccion.',
      },
      assigneeIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Opcional. userId de "personas" o de la lista de miembros. Si recomiendas ' +
          'a alguien, explica en el texto por que: experiencia y carga actual.',
      },
      labelIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Opcional. id de "etiquetas" del contexto. Nunca inventes uno.',
      },
      /**
       * ⚠️ **Obligatorio, y aquí y no en el texto libre a propósito.**
       *
       * Con function calling el modelo devuelve la llamada y, casi siempre, ni
       * una palabra: la tarjeta aparecía sin decir por qué esa etiqueta ni por
       * qué esa persona. Justo lo que la recomendación tenía que aportar —el
       * hecho que la sostiene— era lo que se perdía. Pedirlo por prompt no
       * bastó; como parámetro obligatorio el modelo no puede omitirlo.
       *
       * La tarjeta enseña QUÉ se va a crear; esto dice POR QUÉ.
       */
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una o dos frases: de que trata y por que esa etiqueta, y si ' +
          'recomiendas a alguien, con el hecho que lo sostiene ("ha cerrado 3 de ' +
          'frontend y ahora tiene 3 abiertas"). Nunca digas que alguien es mas rapido.',
      },
    },
    required: ['title', 'columnId', 'priority', 'porQue'],
  },
};

export const PROPONER_ASIGNACION: FunctionDeclaration = {
  name: 'proponer_asignacion',
  description:
    'Prepara una propuesta para cambiar quien lleva una tarea que YA existe. NO la ' +
    'cambia: la persona tiene que aceptarla. Busca la tarea en "tareas" del ' +
    'contexto por su titulo. Puedes llamarla VARIAS VECES en la misma respuesta si ' +
    'hay que repartir varias tareas: una llamada por tarea.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description:
          'id de una tarea de "tareas" del contexto. Nunca lo inventes ni lo ' +
          'construyas: si no encuentras la tarea en esa lista, dilo y no llames.',
      },
      assigneeIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'La lista COMPLETA de quien debe quedar asignado, no solo lo que se anade: ' +
          'lo que mandes es lo que queda.',
      },
      /** Obligatorio por lo mismo que `porQue` en la otra. */
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una frase con el hecho que lo sostiene: experiencia y carga ' +
          'actual. Nunca digas que alguien es mas rapido o mejor que otro.',
      },
    },
    required: ['taskId', 'assigneeIds', 'porQue'],
  },
};

export const PROPONER_EDICION: FunctionDeclaration = {
  name: 'proponer_edicion',
  description:
    'Prepara una propuesta para cambiar los datos de una tarea que YA existe: ' +
    'titulo, descripcion, prioridad, fecha limite, etiquetas o puntos. NO la cambia: la ' +
    'persona tiene que aceptarla. Manda SOLO los campos que cambian; lo que no ' +
    'mandes se queda como esta. Para cambiar de columna usa proponer_movimiento, ' +
    'y para cambiar encargados usa proponer_asignacion.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      title: { type: 'STRING', description: 'Opcional. Maximo 120 caracteres.' },
      description: { type: 'STRING', description: 'Opcional.' },
      priority: { type: 'STRING', enum: PRIORIDADES, description: 'Opcional.' },
      dueDate: {
        type: 'STRING',
        description:
          'Opcional, formato YYYY-MM-DD. Solo si la persona da una fecha o un ' +
          'plazo explicito. NUNCA la deduzcas de la prediccion.',
      },
      labelIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Opcional. La lista COMPLETA de etiquetas que quedan, no solo las que ' +
          'anades: lo que mandes sustituye a las que tuviera. id de "etiquetas".',
      },
      puntos: {
        type: 'INTEGER',
        description:
          'Opcional. Estimacion en puntos, de 0 a 999, para tableros con Scrum. Solo si ' +
          'te la piden o la razonas con tareas parecidas ya estimadas; nunca al azar.',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una o dos frases con el motivo del cambio, apoyado en ' +
          'algo del contexto. La tarjeta lo enseña junto a la propuesta.',
      },
    },
    required: ['taskId', 'porQue'],
  },
};

export const PROPONER_MOVIMIENTO: FunctionDeclaration = {
  name: 'proponer_movimiento',
  description:
    'Prepara una propuesta para mover una tarea a otra columna del tablero. NO la ' +
    'mueve: la persona tiene que aceptarla. Usala cuando te pidan avanzar, ' +
    'devolver o dar por terminada una tarea.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      columnId: {
        type: 'STRING',
        description:
          'id de una columna de "tableros" del contexto, distinta de la que ya tiene ' +
          'la tarea. Nunca inventes uno. ⚠️ Puede estar en OTRO tablero: mover una ' +
          'tarea entre tableros es valido y es lo que se pide cuando dicen "pasalo al ' +
          'tablero de X". Cada tarea trae su tablero actual en "tablero".',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Una frase con el motivo, apoyado en algo del contexto ' +
          '("lleva 12 dias parada en revision").',
      },
    },
    required: ['taskId', 'columnId', 'porQue'],
  },
};

export const PROPONER_CHECKLIST: FunctionDeclaration = {
  name: 'proponer_checklist',
  description:
    'Prepara una propuesta para anadir pasos al checklist de una tarea que YA ' +
    'existe. NO los anade: la persona tiene que aceptarla. Los pasos se SUMAN a ' +
    'los que ya tenga; no se borra ni se reemplaza ninguno.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      items: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'Los pasos, en orden, en infinitivo y concretos. Entre 1 y 10. Cada uno ' +
          'una accion que se pueda dar por hecha o no hecha, no una idea vaga.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que ese desglose y no otro.',
      },
    },
    required: ['taskId', 'items', 'porQue'],
  },
};

export const PROPONER_COMENTARIO: FunctionDeclaration = {
  name: 'proponer_comentario',
  description:
    'Prepara una propuesta de comentario en una tarea que YA existe. NO lo ' +
    'publica: la persona tiene que aceptarla, y se publicara a SU nombre, no al ' +
    'tuyo. Usalo para dejar constancia de algo que se ha hablado aqui.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      body: {
        type: 'STRING',
        description:
          'El comentario, redactado en primera persona como lo escribiria la ' +
          'persona que lo publica. Corto y concreto. Maximo 2000 caracteres.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que dejar constancia de esto.',
      },
    },
    required: ['taskId', 'body', 'porQue'],
  },
};

/**
 * Escribir en el chat del equipo.
 *
 * ⚠️ **Solo el chat del proyecto que se está mirando.** Los privados tienen su
 * propia herramienta, `proponer_mensaje_privado`, desde F7 de
 * docs/PLAN-PRAX-SEMIAGENTICO.md: esta nota decía que no los habría nunca —se
 * mandarían a nombre de una persona en una conversación que el proyecto no
 * contiene—, y el dueño del producto lo pidió (D16). Lo que lo hace aceptable
 * es lo mismo que en todo lo demás: lo manda **quien acepta**, lee el texto
 * entero antes, y sale firmado «enviado con PRAX».
 *
 * Cuelga de `canComment` por lo mismo que el chat: es el permiso de participar
 * en una conversación sin poder editar el trabajo de nadie.
 */
export const PROPONER_MENSAJE: FunctionDeclaration = {
  name: 'proponer_mensaje',
  description:
    'Prepara un mensaje para el chat del equipo de ESTE proyecto. NO lo envia: ' +
    'la persona tiene que aceptarlo, y se enviara a SU nombre, no al tuyo. ' +
    'Usalo cuando haya algo que el equipo deba saber —un bloqueo, un ' +
    'vencimiento que se echa encima, una decision que se acaba de tomar— y la ' +
    'persona no lo haya pedido explicitamente: ofrecelo como pregunta.',
  parameters: {
    type: 'OBJECT',
    properties: {
      body: {
        type: 'STRING',
        description:
          'El mensaje, redactado en primera persona como lo escribiria quien lo ' +
          'envia. Corto y concreto. Para dirigirte a alguien del equipo usa ' +
          'EXACTAMENTE el formato @[Nombre](user:userId) con el userId de ' +
          '"PERSONAS DEL PROYECTO": la interfaz lo pinta como mencion. Para ' +
          'referirte a una tarea usa /[Titulo](task:taskId) con un id de ' +
          '"tareas". Nunca inventes un id. Maximo 2000 caracteres.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que el equipo deberia saber esto.',
      },
    },
    required: ['body', 'porQue'],
  },
};

/**
 * Escribirle por privado a alguien del proyecto (D16).
 *
 * Sin permiso de proyecto: al chat privado se entra por la organización
 * (trampa 22 de CLAUDE.md), y el gateway lo vuelve a comprobar al enviar. El
 * destinatario tiene que ser del proyecto: es la gente que PRAX conoce.
 */
export const PROPONER_MENSAJE_PRIVADO: FunctionDeclaration = {
  name: 'proponer_mensaje_privado',
  description:
    'Prepara un mensaje PRIVADO para una persona del proyecto. NO lo envia: quien te ' +
    'habla lo lee y lo acepta, y sale a SU nombre con la marca "enviado con PRAX". Usalo ' +
    'solo si te lo piden o si es algo que no debe ver todo el equipo; si no, ' +
    'proponer_mensaje.',
  parameters: {
    type: 'OBJECT',
    properties: {
      destinatarioId: {
        type: 'STRING',
        description: 'userId de "PERSONAS DEL PROYECTO". Nunca el de quien te escribe.',
      },
      body: {
        type: 'STRING',
        description: 'El mensaje en primera persona, como lo escribiria quien lo envia.',
      },
      porQue: { type: 'STRING', description: 'Obligatorio. Una frase.' },
    },
    required: ['destinatarioId', 'body', 'porQue'],
  },
};

/**
 * Marcar pasos de un checklist como hechos.
 *
 * ⚠️ Cuelga de **`canMoveTask`, no de `canEditTask`**, igual que su endpoint y
 * por el mismo motivo que mover una tarjeta: quien ejecuta el trabajo tiene que
 * poder decir que terminó un paso sin poder redefinir en qué consistía. Añadir o
 * quitar pasos sigue siendo `canEditTask` — eso sí es decidir el trabajo.
 *
 * Es la contrapartida natural de tener los pasos en el contexto: sin esto, el
 * asistente puede decir «te faltan dos pasos» y no puede hacer nada al respecto.
 */
export const PROPONER_MARCAR_PASOS: FunctionDeclaration = {
  name: 'proponer_marcar_pasos',
  description:
    'Prepara una propuesta para marcar como HECHOS uno o varios pasos del ' +
    'checklist de una tarea. NO los marca: la persona tiene que aceptarla. ' +
    'Usalo cuando cuenten que han terminado algo que corresponde a un paso ' +
    'concreto. Solo marca; no puede desmarcar ni borrar.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description: 'id de una tarea de "tareas" del contexto. Nunca lo inventes.',
      },
      itemIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description:
          'ids de los pasos, sacados del campo "pasos" de esa tarea. Incluye ' +
          'SOLO los que estan con "hecho": false — marcar uno ya hecho no hace ' +
          'nada y confunde a quien lo revise.',
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Una frase sobre por que se dan por hechos.',
      },
    },
    required: ['taskId', 'itemIds', 'porQue'],
  },
};

/**
 * Borrar una tarea.
 *
 * ## ⚠️ Esta herramienta no existía, y su ausencia estaba documentada tres veces
 *
 * El argumento era que el asistente no debía poder destruir nada, y que la
 * garantía tenía que ser **estructural**: una capacidad que no se declara no se
 * puede invocar, mientras que una regla del prompt que diga «nunca borres» se
 * rodea con la pregunta adecuada.
 *
 * Se añade el 2026-08-18 por decisión explícita, y el argumento que la vetaba no
 * se sostiene con el patrón de propuestas: **esto no borra nada**. Devuelve una
 * propuesta, la persona la revisa y, si acepta, quien llama a `DELETE /tasks/:id`
 * es el frontend con **su** sesión y **sus** permisos. Es técnicamente idéntico a
 * que lo borre desde el tablero. Sin `canDeleteTask`, aceptar falla igual que le
 * fallaría pulsando el botón a mano — y de hecho la herramienta ni se le declara.
 *
 * ## Lo que sí la hace distinta de las otras nueve
 *
 * **No se deshace.** Una tarea propuesta de más se borra; una borrada de más no
 * vuelve, y se lleva por delante sus subtareas, su checklist, sus comentarios y
 * sus adjuntos, que viven en otro microservicio. Por eso:
 *
 * - la descripción le prohíbe proponerlo por iniciativa propia;
 * - `porQue` no vale con una frase de relleno: la tarjeta lo enseña como el
 *   motivo por el que alguien va a perder trabajo;
 * - y la tarjeta es destructiva a la vista, con su propia confirmación. Ver
 *   `DeleteProposalCard`.
 */
export const PROPONER_BORRADO: FunctionDeclaration = {
  name: 'proponer_borrado',
  description:
    'Prepara una propuesta para BORRAR una tarea. NO la borra: la persona tiene que ' +
    'aceptarla. ⚠️ Borrar NO SE DESHACE y se lleva las subtareas, el checklist, los ' +
    'comentarios y los adjuntos. Usala SOLO cuando te pidan explicitamente borrar, ' +
    'eliminar o quitar una tarea concreta. NUNCA la propongas por tu cuenta como ' +
    'limpieza, ni para duplicados, ni para tareas viejas o paradas: para eso propon ' +
    'moverlas o cerrarlas. Si tienes cualquier duda de CUAL es la tarea, PREGUNTA en ' +
    'vez de proponer.',
  parameters: {
    type: 'OBJECT',
    properties: {
      taskId: {
        type: 'STRING',
        description:
          'id de una tarea del inventario del contexto. Si lo que te han dicho encaja ' +
          'con varias, no elijas: pregunta cual.',
      },
      porQue: {
        type: 'STRING',
        description:
          'Obligatorio. Por que se borra ESTA tarea, con lo que te hayan dicho. La ' +
          'tarjeta lo enseña junto al aviso de que no se puede deshacer, asi que una ' +
          'frase generica ahi no ayuda a nadie a decidir.',
      },
    },
    required: ['taskId', 'porQue'],
  },
};

/**
 * Los sprints (D16 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * Tres propuestas y ninguna para **cerrar**: cerrar un sprint obliga a decidir
 * qué pasa con cada tarea sin terminar (D6 de PLAN-SCRUM-KANBAN), y esa
 * decisión, tarea a tarea, es justo lo que una tarjeta no puede recoger bien.
 * PRAX puede ayudar a pensarla; se cierra desde la franja del sprint.
 *
 * Todas cuelgan de `canManageSprint`, que es lo que piden sus endpoints. Los ids
 * de sprint no están en el briefing: salen de `consultar_sprints`, y la
 * validación solo acepta los que esa consulta enseñó en el mismo turno.
 */
export const PROPONER_SPRINT: FunctionDeclaration = {
  name: 'proponer_sprint',
  description:
    'Prepara un sprint NUEVO, planeado y sin empezar, en un tablero con Scrum. NO lo ' +
    'crea: la persona lo acepta. Para empezarlo despues usa proponer_iniciar_sprint.',
  parameters: {
    type: 'OBJECT',
    properties: {
      tableroId: {
        type: 'STRING',
        description: 'id de un tablero de "tableros" que traiga "scrum".',
      },
      nombre: { type: 'STRING', description: 'De 2 a 100 caracteres ("Sprint 4").' },
      meta: { type: 'STRING', description: 'Opcional. Que se quiere conseguir, en una frase.' },
      porQue: { type: 'STRING', description: 'Obligatorio. Por que este sprint ahora.' },
    },
    required: ['tableroId', 'nombre', 'porQue'],
  },
};

export const PROPONER_INICIAR_SPRINT: FunctionDeclaration = {
  name: 'proponer_iniciar_sprint',
  description:
    'Prepara la propuesta de EMPEZAR un sprint planeado, con sus fechas. NO lo empieza: ' +
    'la persona lo acepta. Solo sprints en estado PLANNED vistos con consultar_sprints, ' +
    'y solo si el tablero no tiene ya uno ACTIVE.',
  parameters: {
    type: 'OBJECT',
    properties: {
      sprintId: { type: 'STRING', description: 'id de un sprint PLANNED de consultar_sprints.' },
      desde: { type: 'STRING', description: 'Fecha de inicio, YYYY-MM-DD. Normalmente hoy.' },
      hasta: {
        type: 'STRING',
        description: 'Fecha de fin, YYYY-MM-DD, posterior a "desde". Si no la dan, pregunta.',
      },
      porQue: { type: 'STRING', description: 'Obligatorio. Una frase.' },
    },
    required: ['sprintId', 'desde', 'hasta', 'porQue'],
  },
};

export const PROPONER_PLANIFICACION: FunctionDeclaration = {
  name: 'proponer_planificacion',
  description:
    'Prepara la propuesta de METER tareas del backlog en un sprint, o de DEVOLVER tareas ' +
    'de un sprint al backlog. NO las mueve: la persona lo acepta. Ids de tarea y de ' +
    'sprint sacados de consultar_sprints. Al planear, compara lo que metes con ' +
    '"velocidadMedia" y dilo en el texto.',
  parameters: {
    type: 'OBJECT',
    properties: {
      sprintId: {
        type: 'STRING',
        description: 'id del sprint destino (PLANNED o ACTIVE). Vacio si las devuelves al backlog.',
      },
      taskIds: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'De 1 a 30 ids de tarea, todas del mismo tablero que el sprint.',
      },
      porQue: { type: 'STRING', description: 'Obligatorio. Por que estas y no otras.' },
    },
    required: ['taskIds', 'porQue'],
  },
};

/**
 * Los documentos (D16 de docs/PLAN-PRAX-SEMIAGENTICO.md).
 *
 * ## Crear sí va por REST; mejorar, no
 *
 * `POST /workspaces/:id/documents` acepta contenido inicial, así que crear es
 * una propuesta como cualquier otra. **Cambiar el contenido de uno que existe
 * no tiene ruta REST** (E4 de PLAN-DOCUMENTOS: un `PATCH` con `content` da 400,
 * porque se lo comería el siguiente guardado de Yjs de quien lo tenga abierto).
 * La revisión la aplica **el editor**, en el navegador de quien acepta, como
 * entra una versión restaurada: un cambio más que los demás ven llegar y que se
 * deshace desde el historial.
 */
export const PROPONER_DOCUMENTO: FunctionDeclaration = {
  name: 'proponer_documento',
  description:
    'Prepara un documento NUEVO con su contenido en Markdown (titulos con #, listas, ' +
    'tablas, "- [ ]" para tareas). NO lo crea: la persona lo acepta. Usala para actas, ' +
    'especificaciones, resumenes o planes que te pidan escribir.',
  parameters: {
    type: 'OBJECT',
    properties: {
      espacio: {
        type: 'STRING',
        description:
          'Nombre del espacio de DOCUMENTOS donde va. Usa uno que exista si lo sabes ' +
          '(consultar_documentos); si no hay ninguno, propon "Documentos".',
      },
      titulo: { type: 'STRING', description: 'De 1 a 200 caracteres.' },
      contenido: {
        type: 'STRING',
        description: 'El documento entero en Markdown. Como mucho unos 20000 caracteres.',
      },
      porQue: { type: 'STRING', description: 'Obligatorio. Una frase.' },
    },
    required: ['espacio', 'titulo', 'contenido', 'porQue'],
  },
};

export const PROPONER_REVISION_DOCUMENTO: FunctionDeclaration = {
  name: 'proponer_revision_documento',
  description:
    'Prepara una REVISION de un documento que ya existe: su Markdown entero, mejorado. ' +
    'NO lo cambia: la persona la revisa y la aplica desde el editor, y queda en el ' +
    'historial de versiones. Solo documentos que hayas leido con consultar_documento EN ' +
    'ESTE TURNO y que digan "admiteRevision": true. Conserva lo que no te pidan cambiar.',
  parameters: {
    type: 'OBJECT',
    properties: {
      documentoId: { type: 'STRING', description: 'id del documento leido.' },
      contenido: {
        type: 'STRING',
        description: 'El Markdown COMPLETO tal como debe quedar, no solo lo que cambia.',
      },
      cambios: {
        type: 'STRING',
        description: 'Obligatorio. Que has cambiado, en una o dos frases.',
      },
      porQue: { type: 'STRING', description: 'Obligatorio. Por que.' },
    },
    required: ['documentoId', 'contenido', 'cambios', 'porQue'],
  },
};

/** Los colores de columna del design system. Espejo de `COLUMN_COLORS`. */
const COLORES_DE_COLUMNA = ['primary', 'accent', 'info', 'warning', 'error', 'success'];

/**
 * Montar un tablero con sus columnas.
 *
 * ## Por qué existe, si «el asistente no configura proyectos»
 *
 * Porque ya lo hacía, solo que en otro sitio. La plantilla de proyecto nuevo
 * (`proponer_plantilla`) genera el árbol entero —espacios, tableros, columnas,
 * etiquetas y roles— y nadie la consideró nunca una vía de escritura nueva, por
 * el mismo motivo que ninguna de las demás lo es: **propone, y ejecuta quien
 * acepta, con sus permisos**.
 *
 * Que esa capacidad estuviera solo en el modal de creación era un accidente de
 * dónde se implementó, no una decisión. Y se notaba: en un proyecto vacío, a
 * «créame una tarea» el asistente solo podía contestar que primero hacía falta un
 * tablero — sabiendo perfectamente cuál proponer.
 *
 * ## Un solo tablero por propuesta, y con sus columnas dentro
 *
 * No es un generador de proyectos: eso ya existe y vive en su sitio. Aquí se
 * propone **un** tablero, porque lo que resuelve es el hueco concreto de una
 * conversación —«no hay dónde poner esto»— y no rehacer la estructura entera.
 *
 * Las columnas van dentro y no en una propuesta aparte porque un tablero sin
 * columnas no sirve para nada: aceptar dos tarjetas para tener algo utilizable
 * es partir una decisión que es una sola.
 */
export const PROPONER_TABLERO: FunctionDeclaration = {
  name: 'proponer_tablero',
  description:
    'Prepara la propuesta de un tablero nuevo con sus columnas. NO lo crea: la ' +
    'persona lo acepta. Usalo cuando haga falta un sitio donde poner el trabajo y ' +
    'no lo haya —un proyecto recien creado, o un area nueva que no encaja en los ' +
    'tableros que ya existen—. Si ya hay un tablero donde cabe lo que se esta ' +
    'hablando, NO propongas otro: usa el que hay.',
  parameters: {
    type: 'OBJECT',
    properties: {
      espacio: {
        type: 'STRING',
        description:
          'Nombre del espacio de trabajo donde va el tablero. Si en "tableros" ya ' +
          'hay alguno, usa el nombre de espacio de uno de ellos. Si el proyecto ' +
          'esta vacio, propon un nombre corto y descriptivo (por ejemplo "General").',
      },
      nombre: {
        type: 'STRING',
        description: 'Nombre del tablero. Corto y concreto. Maximo 80 caracteres.',
      },
      columnas: {
        type: 'ARRAY',
        description:
          'De 2 a 8 columnas, EN ORDEN, de lo que esta por empezar a lo terminado. ' +
          'Un flujo normal son tres o cuatro; mas de seis se convierte en un ' +
          'tablero que nadie mantiene.',
        items: {
          type: 'OBJECT',
          properties: {
            nombre: { type: 'STRING', description: 'Nombre de la columna.' },
            color: {
              type: 'STRING',
              enum: COLORES_DE_COLUMNA,
              description:
                'Opcional. ⚠️ "success" es el VERDE DE CIERRE y tiene significado: ' +
                'una tarea en una columna verde cuenta como terminada en los ' +
                'informes y deja de avisar aunque este vencida. Ponlo SOLO en la ' +
                'ultima columna, la de trabajo acabado, y nunca en dos.',
            },
          },
          required: ['nombre'],
        },
      },
      porQue: {
        type: 'STRING',
        description: 'Obligatorio. Por que este tablero y por que estas columnas, en una frase.',
      },
    },
    required: ['espacio', 'nombre', 'columnas', 'porQue'],
  },
};

/**
 * Preguntar de vuelta, con opciones que se pulsan.
 *
 * ## ⚠️ Es la única herramienta que no propone ningún cambio
 *
 * Las otras diez preparan algo que la persona acepta o descarta. Esta no toca
 * nada: **es una pregunta**. Y sin embargo es una herramienta y no texto libre,
 * por un motivo concreto — cuando el modelo pregunta escribiendo («¿te refieres
 * a la del tablero de Diseño o a la de Backend?»), la respuesta hay que
 * teclearla, y teclear una desambiguación que el modelo ya tiene enumerada es
 * trabajo que sobra. Con esto, responder es un clic.
 *
 * Lo que gana no es comodidad: es **precisión**. Una respuesta elegida de una
 * lista no se puede escribir mal, así que el turno siguiente no vuelve a
 * empezar por «no te he entendido».
 *
 * ## Cuándo se le pide que la use
 *
 * Cuando le falta un dato para poder seguir y **las respuestas posibles son
 * pocas y conocidas**: cuál de tres tareas, qué prioridad, en qué tablero. No
 * para preguntas abiertas —«¿qué quieres hacer?»— que se responden mejor
 * escribiendo, ni para pedir confirmación de algo que ya va a salir como
 * propuesta con su propio botón.
 */
export const PROPONER_PREGUNTA: FunctionDeclaration = {
  name: 'proponer_pregunta',
  description:
    'Hazle una o varias preguntas a la persona con opciones que pueda PULSAR en vez ' +
    'de escribir. Usalo cuando te falte un dato para seguir y las respuestas ' +
    'posibles sean pocas y concretas: cual de varias tareas, que prioridad, en que ' +
    'tablero, si quiere una cosa u otra. NO lo uses para preguntas abiertas ("que ' +
    'quieres hacer?") ni para confirmar algo que ya vas a proponer con su tarjeta. ' +
    'Acompanalo SIEMPRE de una frase tuya en el texto: la tarjeta son las opciones, ' +
    'el contexto lo pones tu.',
  parameters: {
    type: 'OBJECT',
    properties: {
      preguntas: {
        type: 'ARRAY',
        description:
          'De 1 a 3. Mas de tres de golpe es un formulario, y a un formulario se ' +
          'responde peor que a una conversacion.',
        items: {
          type: 'OBJECT',
          properties: {
            texto: {
              type: 'STRING',
              description: 'La pregunta, corta y en el idioma de la conversacion.',
            },
            tipo: {
              type: 'STRING',
              enum: ['una', 'varias'],
              description:
                '"una" si solo cabe una respuesta (que prioridad); "varias" si se ' +
                'pueden marcar varias (cuales de estas tareas).',
            },
            opciones: {
              type: 'ARRAY',
              description: 'De 2 a 8 respuestas posibles, cortas.',
              items: { type: 'STRING' },
            },
          },
          required: ['texto', 'tipo', 'opciones'],
        },
      },
      porQue: {
        type: 'STRING',
        description: 'Opcional. Para que necesitas saberlo, en una frase.',
      },
    },
    required: ['preguntas'],
  },
};

/**
 * Abrir uno de los proyectos de quien habla, desde una conversación sin foco.
 *
 * ## Por qué es una herramienta y no una frase
 *
 * Sin proyecto, a «hablemos del rediseño» lo único que PRAX podía hacer era
 * describir dónde está el selector. Con esto propone **el proyecto concreto**, y
 * aceptar lo carga con su briefing sin salir de la conversación ni volver a
 * contar de qué se estaba hablando.
 *
 * ## Lo que la sostiene, que no es el modelo
 *
 * El `projectId` sale de la lista que el gateway resolvió con la sesión de quien
 * pregunta —los proyectos donde ya tiene `canViewReports`— y **se valida contra
 * esa misma lista** antes de salir. Un id inventado, o el de un proyecto ajeno,
 * se descarta antes de llegar a la pantalla.
 *
 * ⚠️ Y aceptar no da acceso a nada: carga el proyecto por el camino de siempre,
 * con los guards de siempre. Es el mismo gesto que elegirlo en el selector.
 *
 * ## Una conversación no cambia de proyecto, y esto no lo contradice
 *
 * Lo que está vetado es **cambiar** de foco a mitad —dos briefings en la misma
 * ventana, con sus tareas y su gente mezcladas—. Aquí no hay nada que mezclar:
 * la conversación no tenía ninguno. Pasar de «sin proyecto» a «este proyecto»
 * ocurre una vez y es definitivo, exactamente como cuando se elige en la
 * pantalla de arranque.
 */
export const PROPONER_ABRIR_PROYECTO: FunctionDeclaration = {
  name: 'proponer_abrir_proyecto',
  description:
    'Ofrece cargar uno de los proyectos de la persona para poder hablar de el con ' +
    'sus datos delante. Usalo cuando te nombren uno de la lista, o cuando quede ' +
    'claro que quieren trabajar sobre algo que ya existe. NO lo abre: la persona ' +
    'acepta o no. Solo ids de la lista que tienes; si lo que describen no esta en ' +
    'ella, no es un proyecto suyo y no lo propongas.',
  parameters: {
    type: 'OBJECT',
    properties: {
      projectId: {
        type: 'STRING',
        description: 'El id EXACTO de la lista de proyectos. No lo inventes ni lo compongas.',
      },
      porQue: {
        type: 'STRING',
        description:
          'OBLIGATORIO. Por que ese y no otro, en una frase, atado a lo que acaban de ' +
          'decirte ("has dicho que el rediseno va con retraso").',
      },
    },
    required: ['projectId', 'porQue'],
  },
};

/**
 * Las herramientas de una conversación **sin proyecto**.
 *
 * Tres, y ninguna sale de un permiso: no hay proyecto contra el que resolver
 * permisos, y ninguna de las tres toca datos de ninguno.
 *
 * - **Preguntar**, que ya no dependía de permisos en el otro modo tampoco.
 * - **Abrir un proyecto**, que es la salida hacia el modo con datos.
 * - **La plantilla**, que es la salida hacia un proyecto que todavía no existe.
 *
 * ⚠️ **La plantilla vive aquí y NO en `herramientasPara`**, y el motivo de
 * `template.ts` no ha cambiado: declarársela en una conversación sobre un
 * proyecto existente dejaría que a mitad de una charla sobre tareas propusiera
 * rehacerlo entero. Sin foco ese riesgo no existe, porque no hay nada que
 * rehacer — es justo la conversación para la que se escribió.
 */
export function herramientasSinProyecto(): FunctionDeclaration[] {
  return [PROPONER_PREGUNTA, PROPONER_ABRIR_PROYECTO, PROPONER_PLANTILLA];
}

/**
 * ⚠️ **Aquí hay exactamente UNA herramienta destructiva, y solo una.**
 *
 * Este bloque decía que no había ninguna ni la iba a haber. Cambió el
 * 2026-08-18, y conviene que quede escrito **por qué el argumento de entonces no
 * se sostenía**, para que no se reabra cada seis meses:
 *
 * La regla de la casa nunca fue «el asistente no borra». Es **«el asistente
 * propone; ejecuta el código que ya existe»**. Y con el patrón de propuestas,
 * borrar cumple esa regla igual que crear: la herramienta devuelve una
 * propuesta, la persona la revisa, y quien llama a `DELETE /tasks/:id` es el
 * frontend con su sesión y sus permisos. Es indistinguible de que lo borre desde
 * el tablero.
 *
 * Las tres capas siguen intactas y ninguna depende de que el modelo obedezca:
 *
 * 1. las herramientas se declaran **filtradas por permiso**, así que lo que no
 *    te toca no se puede ni expresar;
 * 2. `validarPropuesta` descarta cualquier `call` fuera de la lista, y comprueba
 *    el `taskId` contra el inventario real del proyecto;
 * 3. las server actions solo saben llamar a los endpoints que tienen escritos, y
 *    el gateway vuelve a comprobar permisos en cada uno.
 *
 * Lo que **sí** es distinto del resto: un borrado **no se deshace**. Toda la
 * diferencia está en la interfaz —la tarjeta es destructiva, lleva confirmación
 * propia y dice qué se lleva por delante— y en la descripción de la herramienta,
 * que le prohíbe proponerlo por iniciativa propia.
 */
