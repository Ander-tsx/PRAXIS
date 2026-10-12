import type { Articulo, Categoria } from './tipos';

/** El orden de aquí es el del índice. */
export const CATEGORIAS: Categoria[] = [
  { nombre: 'Primeros pasos', descripcion: 'Qué es Praxis y cómo se organiza todo.' },
  {
    nombre: 'Trabajo en proyectos',
    descripcion: 'Tableros, tareas, sprints, documentos y equipo.',
  },
  { nombre: 'Comunicación', descripcion: 'Chats y avisos.' },
  { nombre: 'PRAX, el asistente', descripcion: 'Cómo te ayuda y qué no hace por su cuenta.' },
  { nombre: 'Automatización', descripcion: 'Reglas que trabajan por ti.' },
  { nombre: 'Organizaciones y planes', descripcion: 'Equipos, asientos y límites.' },
  { nombre: 'Tu cuenta', descripcion: 'Perfil, estado y sesión.' },
];

export const ARTICULOS: Articulo[] = [
  /* ── Primeros pasos ─────────────────────────────────────────────── */
  {
    slug: 'que-es-praxis',
    categoria: 'Primeros pasos',
    titulo: 'Qué es Praxis',
    resumen: 'La idea general y cómo se anida todo: organización, proyectos, espacios y tareas.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Praxis es una herramienta para que un equipo organice su trabajo: **tableros de tareas**, **documentos**, **chat** y un asistente, **PRAX**, que ayuda a planificar. Todo vive dentro de una estructura de cuatro niveles.',
      },
      { tipo: 'h2', texto: 'Cómo se anida todo' },
      {
        tipo: 'tabla',
        cabecera: ['Nivel', 'Qué es', 'Ejemplo'],
        filas: [
          [
            'Organización',
            'El equipo que paga el plan y reparte los asientos.',
            'Estudio Nordeste',
          ],
          ['Proyecto', 'Un trabajo con su propio equipo, roles y permisos.', 'Rediseño del panel'],
          ['Espacio', 'Una carpeta dentro del proyecto, de tableros o de documentos.', 'Producto'],
          ['Tablero / documento', 'Donde se trabaja de verdad.', 'Sprint 12, Guía de marca'],
        ],
      },
      {
        tipo: 'p',
        texto:
          'Las tareas viven en los tableros, divididas en columnas (por ejemplo «Por hacer», «En curso», «Hecho»). Los documentos son páginas de texto que se editan entre varias personas a la vez.',
      },
      { tipo: 'h2', texto: 'Siempre hay una organización activa' },
      {
        tipo: 'p',
        texto:
          'Arriba de la barra lateral ves la organización en la que estás trabajando. **Todo lo que ves —proyectos, chats, plan— es de esa organización**. Para cambiar, usa el selector. Todo el mundo tiene al menos una, la personal.',
      },
      {
        tipo: 'consejo',
        texto:
          'Si no encuentras un proyecto que sabes que existe, lo más probable es que estés en otra organización. Cámbiala desde el selector de arriba de la barra.',
      },
    ],
  },
  {
    slug: 'recorrido-por-la-barra',
    categoria: 'Primeros pasos',
    titulo: 'Recorrido por la barra lateral',
    resumen: 'Qué hay en cada pestaña, la campana de avisos y tu perfil.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'La barra lateral es tu punto de partida. De arriba abajo: el selector de organización, tres pestañas, su contenido y, al pie, tu tarjeta de usuario con la campana de avisos.',
      },
      { tipo: 'h2', texto: 'Las tres pestañas' },
      {
        tipo: 'tabla',
        cabecera: ['Pestaña', 'Qué encuentras'],
        filas: [
          [
            'Inicio',
            'El árbol de tus proyectos (con sus espacios, tableros y documentos) y el Asistente. El «+» junto a «Proyectos» crea uno nuevo.',
          ],
          ['Chat', 'Tus conversaciones directas y los chats de cada proyecto.'],
          [
            'Configuraciones',
            'Equipo, Facturación, Integraciones, Administración (solo si administras la plataforma), Ayuda y Soporte.',
          ],
        ],
      },
      { tipo: 'h2', texto: 'El pie de la barra' },
      {
        tipo: 'lista',
        items: [
          '**Tu nombre y correo**: abren tu perfil dentro de la propia barra. Ahí editas tus datos, cambias tu estado y cierras sesión.',
          '**La campana**: abre tus avisos. Un punto morado indica que tienes algo sin leer.',
        ],
      },
      {
        tipo: 'consejo',
        texto:
          'El botón de arriba a la derecha de la barra la pliega para dejar solo los iconos y ganar espacio. En el móvil, la barra es el menú de la hamburguesa.',
      },
    ],
  },
  {
    slug: 'tu-primer-proyecto',
    categoria: 'Primeros pasos',
    titulo: 'Crear tu primer proyecto',
    resumen: 'Cómo crear un proyecto, ponerle imagen e icono y empezar a llenarlo.',
    irA: { etiqueta: 'Ir a Proyectos', href: '/projects' },
    bloques: [
      { tipo: 'h2', texto: 'Crearlo' },
      {
        tipo: 'pasos',
        items: [
          'En la pestaña **Inicio**, pulsa el **+** junto a «Proyectos» (o el botón «Nuevo proyecto» de la pantalla de Proyectos).',
          'Escribe el **nombre** y, si quieres, una descripción.',
          'Opcional: sube una **imagen** o elige un **icono y un color**. Si pones imagen, esa es la que se ve.',
          'Pulsa **Crear proyecto**. Aparece en el árbol de la barra lateral.',
        ],
      },
      {
        tipo: 'consejo',
        texto:
          '¿Prefieres que te ayude? En el panel de nuevo proyecto, «Crear con PRAX» te lleva al asistente para describir el proyecto con tus palabras.',
      },
      { tipo: 'h2', texto: 'Qué trae un proyecto nuevo' },
      {
        tipo: 'lista',
        items: [
          'Tú como dueño, con todos los permisos.',
          'Un rol de **Administrador** ya creado, listo para asignar.',
          'Un nombre único entre tus proyectos y una dirección corta (`/projects/mi-proyecto`).',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'El número de proyectos lo limita el plan de la organización. Si llegas al tope verás un aviso con la salida: ampliar el plan, si eres quien lo paga.',
      },
    ],
  },

  /* ── Trabajo en proyectos ───────────────────────────────────────── */
  {
    slug: 'tableros-y-tareas',
    categoria: 'Trabajo en proyectos',
    titulo: 'Tableros y tareas',
    resumen: 'Columnas, tarjetas, prioridades, asignados, etiquetas y fechas.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Un **tablero** es un conjunto de columnas y cada **tarea** es una tarjeta que se mueve de una columna a otra a medida que avanza.',
      },
      { tipo: 'h2', texto: 'Qué lleva una tarea' },
      {
        tipo: 'lista',
        items: [
          '**Título y descripción.**',
          '**Prioridad**: baja, media, alta o urgente.',
          '**Asignados**: una o varias personas del proyecto.',
          '**Fecha de entrega.**',
          '**Etiquetas**, para agrupar por tema.',
          '**Subtareas** y **listas de comprobación** para el detalle.',
          '**Comentarios** y **archivos adjuntos**.',
        ],
      },
      { tipo: 'h2', texto: 'Gestos del tablero' },
      {
        tipo: 'lista',
        items: [
          '**Arrastra** una tarjeta a otra columna para cambiar su estado.',
          '**Abre** una tarjeta para ver y editar todo su detalle en un panel.',
          'Puedes **añadir y borrar columnas** para que reflejen tu forma de trabajar.',
        ],
      },
      { tipo: 'h2', texto: 'Qué puedes hacer depende de tu rol' },
      {
        tipo: 'p',
        texto:
          'Si un botón no está o aparece apagado, normalmente es que tu rol en el proyecto no incluye ese permiso. Lee [Equipo, roles y permisos](/ayuda/equipo-roles-y-permisos) para ver cómo se reparten.',
      },
    ],
  },
  {
    slug: 'scrum-sprints-y-backlog',
    categoria: 'Trabajo en proyectos',
    titulo: 'Scrum: sprints y backlog',
    resumen: 'Cómo activar Scrum en un tablero y planificar por sprints.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Todo tablero es un Kanban. **Scrum es una capa que se enciende** encima, tablero por tablero, y añade sprints, backlog, estimaciones y burndown.',
      },
      { tipo: 'h2', texto: 'Qué añade' },
      {
        tipo: 'lista',
        items: [
          '**Sprints**: bloques de tiempo con una meta y una fecha de cierre. Como mucho hay uno activo por tablero.',
          '**Backlog**: lo que todavía no está en ningún sprint. Es un panel lateral desde el que arrastras tareas al sprint.',
          '**Estimación** de cada tarea, con la escala que prefiera tu equipo.',
          '**Burndown** y velocidad, para ver si el sprint va en camino.',
          '**Límite de trabajo en curso (WIP)**: si lo superas, se avisa pero no se bloquea.',
        ],
      },
      { tipo: 'h2', texto: 'Cerrar un sprint' },
      {
        tipo: 'p',
        texto:
          'Si al cerrar quedan tareas sin terminar, Praxis **siempre te pregunta** qué hacer con ellas (por ejemplo, devolverlas al backlog). Nada se mueve en silencio.',
      },
      {
        tipo: 'consejo',
        texto:
          'PRAX puede sugerir cuánta capacidad tiene el equipo, pero nunca fija un cupo ni bloquea nada: la decisión es tuya.',
      },
    ],
  },
  {
    slug: 'documentos',
    categoria: 'Trabajo en proyectos',
    titulo: 'Documentos',
    resumen: 'Escribir en equipo en tiempo real, compartir y volver a versiones anteriores.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Dentro de un espacio de tipo documentos puedes crear páginas de texto con un editor por bloques (títulos, listas, imágenes…). Lo que escribe una persona lo ven las demás **al instante**.',
      },
      { tipo: 'h2', texto: 'Qué puedes hacer' },
      {
        tipo: 'lista',
        items: [
          '**Editar entre varias personas a la vez**, sin pisarse.',
          '**Insertar imágenes** en el texto.',
          '**Compartir** el documento con un enlace, como en Google Docs: quien lo recibe lo abre en `/d/…`.',
          '**Versiones**: el historial de cambios, y la opción de restaurar una anterior.',
          '**Vincular tareas**: relaciona un documento con las tareas del tablero a las que se refiere.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'El contenido de un documento se escribe en el editor, no por otra vía. Las revisiones que sugiere PRAX se aplican en el propio editor, como una versión restaurada que puedes deshacer.',
      },
    ],
  },
  {
    slug: 'equipo-roles-y-permisos',
    categoria: 'Trabajo en proyectos',
    titulo: 'Equipo, roles y permisos',
    resumen: 'Cómo se invita gente y qué puede hacer cada persona en un proyecto.',
    irA: { etiqueta: 'Ir a Equipo', href: '/main/team' },
    bloques: [
      {
        tipo: 'p',
        texto:
          'Cada proyecto define **sus propios roles** (por ejemplo Scrum Master, QA o Dev). Un rol es una lista de permisos que se pueden activar o no.',
      },
      { tipo: 'h2', texto: 'Permisos del proyecto' },
      {
        tipo: 'tabla',
        cabecera: ['Área', 'Qué permite'],
        filas: [
          ['Tareas', 'Crear, editar y borrar tareas.'],
          ['Tableros', 'Crear, editar y borrar tableros.'],
          ['Columnas', 'Crear y borrar columnas.'],
          ['Miembros', 'Invitar y gestionar a las personas del proyecto.'],
          ['Roles', 'Crear roles y cambiar sus permisos.'],
        ],
      },
      { tipo: 'h2', texto: 'Dos capas, independientes' },
      {
        tipo: 'lista',
        items: [
          '**Rol global**: administra la plataforma entera. Solo lo tienen las cuentas de administración y **no da permisos dentro de un proyecto**.',
          '**Rol de proyecto**: lo que puedes hacer dentro de ese proyecto.',
          '**El dueño del proyecto** lo puede todo, sin mirar roles.',
        ],
      },
      { tipo: 'h2', texto: 'Proyectos suspendidos' },
      {
        tipo: 'p',
        texto:
          'La plataforma puede **suspender** un proyecto. Mientras lo está, se ve entero pero no admite ninguna escritura, ni siquiera del dueño. Verás un aviso con el motivo. No se arregla pidiendo permisos: hay que esperar a que lo reactiven.',
      },
    ],
  },

  /* ── Comunicación ───────────────────────────────────────────────── */
  {
    slug: 'chat',
    categoria: 'Comunicación',
    titulo: 'Chat',
    resumen: 'Conversaciones directas y chats de proyecto, con menciones.',
    irA: { etiqueta: 'Ir al chat', href: '/chat' },
    bloques: [
      { tipo: 'h2', texto: 'Dos tipos de conversación' },
      {
        tipo: 'lista',
        items: [
          '**Directo**: entre dos personas de la misma organización.',
          '**De proyecto**: una conversación para todo el equipo de ese proyecto.',
        ],
      },
      {
        tipo: 'p',
        texto:
          'Para hablar en privado con alguien basta con que compartan organización, no hace falta que estén en el mismo proyecto.',
      },
      { tipo: 'h2', texto: 'Menciones' },
      {
        tipo: 'p',
        texto:
          'En el chat de un proyecto puedes **mencionar personas, tareas o tableros** para enlazarlos. En una conversación privada no se referencian tareas ni tableros.',
      },
      {
        tipo: 'consejo',
        texto:
          'Escribe **@PRAX** en el chat de un proyecto para pedirle algo al asistente delante del equipo. La respuesta sale firmada con tu nombre y se muestra como de PRAX; las propuestas que haga se quedan en tu conversación privada con el asistente.',
      },
      { tipo: 'h2', texto: 'Silenciar' },
      {
        tipo: 'p',
        texto:
          'En una conversación directa puedes **silenciar los avisos** desde el menú de los tres puntos de la cabecera. También puedes buscar dentro de la conversación con la lupa.',
      },
    ],
  },
  {
    slug: 'avisos',
    categoria: 'Comunicación',
    titulo: 'Avisos (la campana)',
    resumen: 'Qué te avisa Praxis, cómo leerlo y cómo llega en vivo.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'La **campana** junto a tu nombre, al pie de la barra lateral, abre tu bandeja de avisos. Un punto morado significa que hay algo sin leer.',
      },
      { tipo: 'h2', texto: 'Cómo funcionan' },
      {
        tipo: 'lista',
        items: [
          'Los avisos llegan **en vivo**: aparece una tarjeta y suena un aviso sin que recargues la página.',
          'La bandeja tiene dos vistas: **Sin leer** y **Todos**.',
          'Al pulsar un aviso se marca como leído y te lleva a lo que lo provocó.',
          'Los avisos pueden venir de personas (te asignaron una tarea, te mencionaron) o de **reglas de automatización**.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Los mensajes de chat **no** son avisos: no llenan la campana. Tienen su propio contador en la pestaña Chat.',
      },
    ],
  },

  /* ── PRAX ───────────────────────────────────────────────────────── */
  {
    slug: 'prax-el-asistente',
    categoria: 'PRAX, el asistente',
    titulo: 'PRAX, el asistente',
    resumen: 'Qué hace, qué no hace por su cuenta y cómo sacarle partido.',
    irA: { etiqueta: 'Abrir el Asistente', href: '/assistant' },
    bloques: [
      {
        tipo: 'p',
        texto:
          'PRAX es el asistente de Praxis. Puede **consultar** tus tareas y proyectos, **responderte** y **proponerte** cambios: crear tareas, moverlas, editar un documento…',
      },
      { tipo: 'h2', texto: 'La regla de oro: propone, nunca ejecuta' },
      {
        tipo: 'p',
        texto:
          'PRAX **nunca cambia nada por su cuenta**. Cada cambio llega como una **tarjeta de propuesta** que tú aceptas o rechazas; al aceptar, se hace con tu sesión y tus permisos, igual que si lo hubieras hecho a mano. Varias tareas juntas llegan como **una sola propuesta**.',
      },
      { tipo: 'h2', texto: 'Dos modos' },
      {
        tipo: 'lista',
        items: [
          '**Con un proyecto en foco**: conoce sus tareas, miembros y chat, y tiene todas sus herramientas.',
          '**Sin proyecto**: una conversación general, con menos herramientas. Puede elegir un proyecto después, pero no cambiarlo ni volver a quedarse sin él.',
        ],
      },
      { tipo: 'h2', texto: 'Adjuntos y modelos' },
      {
        tipo: 'lista',
        items: [
          'Puedes adjuntar **texto (.md, .txt), PDF e imágenes**. De los archivos de texto y PDF se recuerda el contenido; de una imagen solo lo que PRAX cuente de ella.',
          'En el compositor eliges **el modelo** con el que conversar. Con imágenes o PDF responde siempre Gemini.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Cada persona tiene una **cuota mensual de uso de PRAX** que depende del plan de la organización. Gastar la tuya no le quita nada a nadie más.',
      },
    ],
  },

  /* ── Automatización ─────────────────────────────────────────────── */
  {
    slug: 'reglas-de-automatizacion',
    categoria: 'Automatización',
    titulo: 'Reglas de automatización',
    resumen: 'Disparadores y acciones: que Praxis haga el trabajo repetitivo.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Una **regla** es una frase del tipo «cuando pase **esto**, haz **aquello**». Se configuran por proyecto y se pueden activar y pausar.',
      },
      { tipo: 'h2', texto: 'Cuándo se dispara (disparadores)' },
      {
        tipo: 'tabla',
        cabecera: ['Tipo', 'Disparadores'],
        filas: [
          [
            'Reactivos (al instante)',
            'Tarea creada · movida · completada · reabierta · asignada · con la fecha cambiada.',
          ],
          [
            'De barrido (periódicos)',
            'Tarea a punto de vencer · vencida · parada sin movimiento · sin asignar.',
          ],
          ['Externos', 'Pull request abierto en GitHub.'],
        ],
      },
      { tipo: 'h2', texto: 'Qué puede hacer (acciones)' },
      {
        tipo: 'lista',
        items: [
          'Mover la tarea a otra columna.',
          'Asignarla a alguien o cambiar su prioridad.',
          'Añadirle una etiqueta o un comentario.',
          'Mandar un correo, crear un aviso o escribir un mensaje en el chat del proyecto.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Las reglas **cuentan al activarse**: el plan limita cuántas puedes tener en marcha por proyecto, no cuántas puedes crear pausadas. Una regla puede quedar pausada por el sistema si algo la deja inválida.',
      },
    ],
  },

  /* ── Organizaciones y planes ────────────────────────────────────── */
  {
    slug: 'organizaciones',
    categoria: 'Organizaciones y planes',
    titulo: 'Organizaciones y asientos',
    resumen: 'Espacios personales, equipos, invitaciones y papeles.',
    irA: { etiqueta: 'Ir a Equipo', href: '/main/team' },
    bloques: [
      {
        tipo: 'p',
        texto:
          'Una **organización** contiene los proyectos y es lo que paga el plan. Tienes siempre una **personal** y puedes crear equipos con «Nuevo espacio de trabajo» en el selector de arriba de la barra lateral (con nombre e imagen).',
      },
      {
        tipo: 'lista',
        items: ['Puedes ser dueño de **hasta tres** organizaciones, la personal incluida.'],
      },
      { tipo: 'h2', texto: 'Asientos' },
      {
        tipo: 'p',
        texto:
          'Para trabajar dentro de una organización hace falta un **asiento**. Invitas a alguien con «Invitar a miembros»: la persona recibe una invitación y, al aceptarla, ocupa un asiento. El número de asientos lo da el plan.',
      },
      { tipo: 'h2', texto: 'Papeles' },
      {
        tipo: 'p',
        texto:
          'Cada miembro tiene un **papel** en la organización: una lista de permisos (administrar la organización, crear proyectos…). **No puedes conceder un permiso que tú no tienes**, ni al crear un papel, ni al asignarlo, ni al invitar. El dueño no necesita papel: lo puede todo.',
      },
      { tipo: 'h2', texto: 'Si bajas de plan' },
      {
        tipo: 'p',
        texto:
          'Bajar de plan **no expulsa a nadie ni borra nada**. Si sobran miembros, los más recientes quedan **congelados en solo lectura**: siguen dentro y pueden ver, pero no editar. Si vuelves a pagar, se descongelan solos. Lo que ya existe se puede abrir, editar y borrar; lo único que no se puede es añadir más allá del nuevo tope.',
      },
    ],
  },
  {
    slug: 'planes-y-limites',
    categoria: 'Organizaciones y planes',
    titulo: 'Planes y límites',
    resumen: 'Qué incluye cada plan y qué pasa al llegar a un tope.',
    irA: { etiqueta: 'Comparar los planes', href: '/main/billing' },
    bloques: [
      {
        tipo: 'p',
        texto:
          'El plan es **de la organización** y solo vale dentro de ella: tener un plan de pago en una no mejora las demás.',
      },
      { tipo: 'h2', texto: 'Qué incluye cada plan' },
      {
        tipo: 'tabla',
        cabecera: ['', 'Gratis', 'Pro', 'Equipo', 'Negocio', 'Empresa'],
        filas: [
          ['Asientos', '3', '5', '15', '100', 'Sin tope'],
          ['Proyectos', '3', '5', '25', '150', 'Sin tope'],
          ['Reglas activas por proyecto', '3', '10', '25', 'Sin tope', 'Sin tope'],
          ['Almacenamiento', '200 MB', '2 GB', '10 GB', '100 GB', 'Sin tope'],
          ['Historial de análisis', '90 días', '180 días', '365 días', 'Sin tope', 'Sin tope'],
        ],
      },
      {
        tipo: 'p',
        texto:
          'Además, cada plan trae su **cuota mensual de uso de PRAX por persona**. Los valores concretos y su precio están siempre al día en la pantalla de Facturación.',
      },
      { tipo: 'h2', texto: 'Al llegar a un tope' },
      {
        tipo: 'lista',
        items: [
          'Verás un aviso diciendo cuál es el límite. Si quien lo ve **no es quien paga**, el aviso lo indica para que sepas a quién pedírselo.',
          'Estar justo en el tope (3 de 3) no es pasarse: está lleno, no rebasado.',
          'El historial de análisis **recorta la ventana** que ves, no la rechaza, y te dice cuál es.',
        ],
      },
      {
        tipo: 'aviso',
        texto:
          'Contratar o cambiar el plan es cosa **del dueño** de la organización. Quien no lo es no verá el botón de mejorar el plan.',
      },
    ],
  },

  /* ── Tu cuenta ──────────────────────────────────────────────────── */
  {
    slug: 'perfil-y-estado',
    categoria: 'Tu cuenta',
    titulo: 'Perfil y estado',
    resumen: 'Editar tus datos, tu foto y tu estado de disponibilidad.',
    bloques: [
      {
        tipo: 'p',
        texto:
          'Pulsa **tu nombre y correo** al pie de la barra lateral para abrir tu perfil. Se muestra en el hueco de debajo de las pestañas.',
      },
      { tipo: 'h2', texto: 'Editar tu perfil' },
      {
        tipo: 'lista',
        items: [
          'Cambia tu **nombre, apellido, biografía y ubicación**.',
          'Sube tu **foto** y una **portada**, o quítalas. Los cambios se aplican al guardar.',
          'Si entraste con Google, el botón **«Usar mi foto de Google»** te devuelve la foto de tu cuenta de Google en cualquier momento.',
        ],
      },
      { tipo: 'h2', texto: 'Tu estado' },
      {
        tipo: 'p',
        texto:
          'Es el puntito de color de tu avatar. Lo ven las demás personas y les dice si pueden contar contigo: **Disponible, Ocupado, En una reunión, Comiendo o No molestar**. Cámbialo desde el perfil, o desde el propio punto del avatar.',
      },
    ],
  },
  {
    slug: 'sesion-y-seguridad',
    categoria: 'Tu cuenta',
    titulo: 'Sesión y seguridad',
    resumen: 'Registro, verificación del correo, cerrar sesión y borrar la cuenta.',
    bloques: [
      { tipo: 'h2', texto: 'Registro y entrada' },
      {
        tipo: 'lista',
        items: [
          'Al registrarte con correo y contraseña **no entras directamente**: te enviamos un correo para confirmar que el buzón es tuyo, y hasta entonces el acceso responde que falta verificar.',
          'También puedes entrar **con Google**; en ese caso el correo ya viene confirmado.',
          'Si ya existe una cuenta con ese correo y contraseña, entra con tu contraseña antes de vincular Google.',
        ],
      },
      { tipo: 'h2', texto: 'Cerrar sesión' },
      {
        tipo: 'p',
        texto:
          'Está en tu perfil: «Cerrar sesión». Se cierra en este navegador y puedes volver a entrar cuando quieras. La sesión se renueva sola mientras la usas.',
      },
      { tipo: 'h2', texto: 'Eliminar la cuenta' },
      {
        tipo: 'aviso',
        texto:
          'Es lo **único que no se deshace**. Pierdes el acceso a tus proyectos; lo que hayas escrito sigue ahí, sin tu nombre. Para confirmarlo tienes que escribir tu correo exacto.',
      },
    ],
  },
];

export function articuloPorSlug(slug: string): Articulo | undefined {
  return ARTICULOS.find((a) => a.slug === slug);
}

/** Los artículos de una categoría, en el orden en que se declaran. */
export function articulosDe(categoria: string): Articulo[] {
  return ARTICULOS.filter((a) => a.categoria === categoria);
}
