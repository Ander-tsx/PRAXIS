/**
 * El proyecto PRAXIS, con su historial, para una instalación recién arrancada.
 *
 * ## Qué construye
 *
 * El proyecto con el que el equipo de PRAXIS gestionó PRAXIS: un espacio con
 * dos tableros —Development y Quality Assurance—, ciento cincuenta tareas con
 * nombres del trabajo real —la cookie httpOnly, el motor de automatización, el
 * despliegue en GCP— y seis meses de movimientos, que es lo que necesita la
 * sección de Análisis para tener relieve.
 *
 * ## Dos tableros, y no diez
 *
 * Esto pasó por tres formas antes de quedarse quieto, y cada cambio salió de
 * mirar una pantalla:
 *
 * 1. Ciclos de Shape Up con un *hill chart*. Los nombres de tablero eran frases
 *    largas —«Entrar, y que la sesión aguante»— que se pisaban unas a otras en
 *    las etiquetas del gráfico de flujo.
 * 2. Ocho sprints en cuatro espacios. Fiel a cómo se trabaja, imposible de
 *    presentar: dos selectores que entender antes de ver nada completo.
 * 3. **Un espacio, dos tableros.** Development y Quality Assurance. Se abre, se
 *    ve entero, y los nombres caben en una leyenda.
 *
 * ## ⚠️ Que no esté todo en «Hecho»
 *
 * La primera versión sorteaba el destino tarea por tarea con un 90 % de
 * probabilidad de cerrar, y en un tablero de veintiocho eso salió **veintiocho
 * cerradas**: cuatro columnas vacías y ninguna señal de trabajo en curso. Un
 * tablero así no se lee como un equipo trabajando, se lee como un archivo.
 *
 * Ahora el reparto es **por cupos, no por sorteo**: cada tablero declara cuántas
 * quedan en cada columna y el resto cierra. Un sprint pasado deja siempre un par
 * de cosas por el camino, y el sprint en curso reparte por las cinco columnas.
 *
 * ## Por qué no vale hacerlo por la interfaz
 *
 * Porque el tiempo no se puede fingir desde fuera. Una tarea creada hoy tiene
 * `createdAt` de hoy, y los siete informes miden exactamente eso: flujo semanal,
 * tiempo de ciclo, predicción de Monte Carlo. Llenar el tablero a mano deja
 * todas las gráficas con una barra en la semana en curso y nada detrás — que es
 * justo lo que la demostración quiere enseñar y lo único que la aplicación no
 * permite escribir.
 *
 * ## ⚠️ Se ejecuta DESPUÉS de que el equipo se registre
 *
 * Las cuentas no se crean aquí: se buscan por correo. Sembrar usuarios desde un
 * script significaría contraseñas que nadie conoce, y una demostración en la que
 * los dueños de las cuentas no pueden entrar. Cada quien se registra —con
 * contraseña o con Google, da igual— y esto reparte el trabajo entre las cuentas
 * que ya existen.
 *
 * ## ⚠️ Los eventos llevan actores reales, y es deliberado
 *
 * `seed-events.ts` marca su historial con `ACTOR_SINTETICO` (el UUID de ceros) y
 * la pantalla de Análisis usa eso para avisar de que ese proyecto no mide
 * trabajo real. Aquí no se usa: los eventos llevan el id de cada persona, así
 * que **ese aviso no aparecerá**. Es una decisión tomada a sabiendas para una
 * presentación, no un descuido — y por eso está escrita aquí arriba.
 *
 * ## Cómo se ejecuta
 *
 * Contra la base de producción, por el túnel de IAP (ver `docs/despliegue.md`):
 *
 *   PRAXIS_DUENO=andres.one.dev@gmail.com \
 *   PRAXIS_EQUIPO=sebastianjimenezmat@gmail.com,erickhumbertotc@gmail.com,20233tn076@utez.edu.mx \
 *   DATABASE_URL='postgresql://…@localhost:5433/praxis?schema=tasks' \
 *   pnpm --filter @praxis/tasks-service exec ts-node -r tsconfig-paths/register prisma/seed-praxis.ts
 *
 * Es **idempotente**: si el proyecto ya existe, borra sus tareas y su historial
 * y los vuelve a fabricar. Las cuentas y los permisos no se tocan.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma-client';

const DIA = 86_400_000;

const NOMBRE_PROYECTO = 'PRAXIS';
const SLUG_PROYECTO = 'praxis';

/**
 * Veinticuatro semanas de historial.
 *
 * `weekly` acepta hasta 52 y dibuja una serie; con veinticuatro la tendencia se
 * ve de verdad y la predicción de Monte Carlo remuestrea sobre casi seis meses
 * de ritmo observado en vez de sobre un puñado de días.
 */
const SEMANAS = 24;

/** El único espacio del proyecto: los dos tableros cuelgan de él. */
const ESPACIO = 'Equipo PRAXIS';

/**
 * Las columnas de un tablero de Scrum.
 *
 * ⚠️ **La última es la de cierre y tiene que ser verde.** Es lo que hace que
 * `completedAt` se rellene y que la tarea cuente como terminada en los
 * informes; con otro color el tablero se ve igual y los números salen mal.
 */
const COLUMNAS = [
  { name: 'Backlog', color: 'primary', order: 0 },
  { name: 'Por hacer', color: 'info', order: 1 },
  { name: 'En curso', color: 'warning', order: 2 },
  { name: 'En revisión', color: 'accent', order: 3 },
  { name: 'Hecho', color: 'success', order: 4 },
] as const;

/** Las áreas del producto, que aquí son las etiquetas del proyecto. */
const ETIQUETAS = [
  { name: 'auth', color: 'accent' },
  { name: 'tablero', color: 'primary' },
  { name: 'chat', color: 'info' },
  { name: 'análisis', color: 'warning' },
  { name: 'asistente', color: 'error' },
  { name: 'automatización', color: 'warning' },
  { name: 'infra', color: 'primary' },
] as const;

/**
 * Un tablero del proyecto.
 *
 * `restoPorColumna` es el cupo de tareas que **no** llegan a «Hecho», por índice
 * de columna. Es un cupo y no una probabilidad a propósito: sorteando tarea por
 * tarea, un tablero de veintiocho puede salir entero cerrado —y salió—, que deja
 * cuatro columnas vacías y ninguna señal de trabajo en curso.
 */
interface TableroDef {
  espacio: string;
  nombre: string;
  /** Cuántas semanas atrás empieza. */
  desde: number;
  /** Cuántas dura. */
  dura: number;
  /** Cuántas quedan en cada columna, de la 0 a la 3. El resto cierran. */
  restoPorColumna: [number, number, number, number];
  /** Si su trabajo abierto es de ahora: es donde hay vencidas y sin encargado. */
  actual?: boolean;
  tareas: { titulo: string; etiqueta: string }[];
}

const T = (titulo: string, etiqueta: string) => ({ titulo, etiqueta });

/**
 * Un espacio y dos tableros, y esto se decidió mirando una demostración.
 *
 * La versión anterior repartía el trabajo en cuatro espacios y diez tableros —uno
 * por sprint, más backlog y errores—. Es fiel a cómo se trabaja de verdad y es
 * **imposible de presentar**: quien mira tiene que entender el selector de
 * espacio, después el de tablero, y no ve nada completo en ninguna pantalla.
 *
 * Dos tableros, y cada uno responde a una pregunta:
 *
 * - **Development** — lo que se construye. Es el tablero grande y el que se
 *   enseña.
 * - **Quality Assurance** — lo que se comprueba antes de que salga. Existe
 *   aparte porque es otro trabajo y otra persona quien lo lleva, y porque el
 *   reparto por etiqueta se lee mucho mejor con los dos separados.
 *
 * ⚠️ **Las dos ventanas son de veinticuatro semanas, aunque se enseñe un tablero
 * de hoy.** El historial no está para navegarlo: está para que el flujo
 * acumulado, el tiempo de ciclo y la predicción de Monte Carlo tengan de dónde
 * salir. Sin él, Análisis se queda con un mes de datos.
 */
const TABLEROS: TableroDef[] = [
  {
    espacio: ESPACIO,
    nombre: 'Development',
    desde: SEMANAS,
    dura: SEMANAS,
    /**
     * El cupo de lo que **no** llega a «Hecho», por columna.
     *
     * Es un cupo y no una probabilidad a propósito: sorteando tarea por tarea,
     * un tablero puede salir entero cerrado —y salió, con cuatro columnas
     * vacías y ninguna señal de trabajo en curso—.
     */
    restoPorColumna: [7, 5, 4, 3],
    actual: true,
    tareas: [
      /* ── sesión, identidad y permisos ─────────────────────────────────── */
      T('Montar el monorepo con pnpm y turbo', 'infra'),
      T('Levantar Postgres y Redis con docker compose', 'infra'),
      T('Esqueleto del gateway con prefijo /api y Swagger', 'infra'),
      T('Sobre {success, data, meta} en todas las respuestas', 'infra'),
      T('credentials-service: registro con bcrypt', 'auth'),
      T('Login y emisión del par de tokens', 'auth'),
      T('Guardar el JWT en cookie httpOnly, nunca en localStorage', 'auth'),
      T('Renovación transparente del access token', 'auth'),
      T('Proxy autenticado por zona con createGatewayProxy', 'auth'),
      T('Guard de zona y el lookahead que no casa la raíz', 'auth'),
      T('Entrada con Google validando el aud del id token', 'auth'),
      T('Verificación de correo antes del primer login', 'auth'),
      T('Límite de 10 intentos de login por minuto y por IP', 'auth'),
      T('Recuperar contraseña con token de un solo uso', 'auth'),
      T('Modelo de permisos de dos capas', 'auth'),
      T('permissions-service y el catálogo de roles globales', 'auth'),
      T('Roles por proyecto con diccionario de booleanos', 'auth'),
      T('permissions/me para apagar botones antes del 403', 'auth'),
      T('Autenticación en dos pasos', 'auth'),

      /* ── el tablero ───────────────────────────────────────────────────── */
      T('Un proyecto nuevo nace con su rol y con el dueño dentro', 'tablero'),
      T('Slug único global con sufijo aleatorio, no contador', 'tablero'),
      T('Nombre de proyecto único por dueño, no global', 'tablero'),
      T('Invitaciones por correo con caducidad', 'tablero'),
      T('Espacios, tableros y columnas por proyecto', 'tablero'),
      T('Arrastrar tarjetas entre columnas sin librería', 'tablero'),
      T('Reordenar columnas y persistir la posición', 'tablero'),
      T('El status de la tarea iguala el nombre de su columna', 'tablero'),
      T('Panel de detalle de tarea que se guarda solo', 'tablero'),
      T('Checklists con progreso en la tarjeta', 'tablero'),
      T('Etiquetas del proyecto con su gestor', 'tablero'),
      T('Adjuntos de tarea con validación de tamaño', 'tablero'),
      T('Comentarios con edición y borrado', 'tablero'),
      T('Encargados múltiples por tarea', 'tablero'),
      T('Fecha de vencimiento al final del día local', 'tablero'),
      T('Selector de fecha propio, sin el nativo del navegador', 'tablero'),
      T('Columna a pantalla completa para tableros largos', 'tablero'),
      T('Menú móvil para mover una tarea sin arrastrar', 'tablero'),
      T('Tema oscuro y claro sin parpadeo, desde la cookie', 'tablero'),
      T('Vista de calendario del tablero', 'tablero'),
      T('Dependencias entre tareas', 'tablero'),
      T('Plantillas de tablero reutilizables', 'tablero'),

      /* ── comunicación ─────────────────────────────────────────────────── */
      T('Avisos en vivo por SSE desde el gateway', 'chat'),
      T('Bandeja de avisos con marca de leído', 'chat'),
      T('Latidos de 25 s para que el balanceador no corte', 'chat'),
      T('El sobre estándar no puede envolver un flujo SSE', 'chat'),
      T('Presencia: disponible, ausente, ocupado', 'chat'),
      T('Chat de proyecto con hilos y adjuntos', 'chat'),
      T('Silenciar una conversación', 'chat'),
      T('Vista previa de enlaces en los mensajes', 'chat'),
      T('Reacciones y mensajes fijados', 'chat'),
      T('Menciones en los comentarios', 'chat'),

      /* ── análisis ─────────────────────────────────────────────────────── */
      T('TaskEvent: registrar cada movimiento del tablero', 'análisis'),
      T('completedAt al entrar en la columna verde', 'análisis'),
      T('reports-service: agregador sin base propia', 'análisis'),
      T('Flujo acumulado por semana', 'análisis'),
      T('Tiempo de ciclo con percentiles 50 y 85', 'análisis'),
      T('Predicción de entrega por Monte Carlo', 'análisis'),
      T('Reparto por persona y por etiqueta', 'análisis'),
      T('Instantánea con vencidas y sin asignar', 'análisis'),
      T('Serie semanal con variación contra la anterior', 'análisis'),
      T('Filtros de fecha, tablero, persona y prioridad', 'análisis'),
      T('Caché de informes en Redis con invalidación', 'análisis'),
      T('Gráficas en SVG sin librería de terceros', 'análisis'),
      T('Exportar los informes a PDF', 'análisis'),

      /* ── asistente ────────────────────────────────────────────────────── */
      T('assistant-service sobre Gemini', 'asistente'),
      T('Cuota mensual por plan, en tabla y no en Redis', 'asistente'),
      T('Briefing del proyecto que viaja en cada turno', 'asistente'),
      T('Trece herramientas que proponen y nunca ejecutan', 'asistente'),
      T('Tarjeta de propuesta con botón de aceptar', 'asistente'),
      T('Validar cada propuesta contra el proyecto real', 'asistente'),
      T('Conversaciones persistidas y renombrables', 'asistente'),
      T('Adjuntos al asistente: texto extraído al subir', 'asistente'),
      T('Hablar con PRAX sin proyecto en foco', 'asistente'),
      T('Skill de Alexa con token de voz de solo lectura', 'asistente'),
      T('Que PRAX proponga automatizaciones', 'asistente'),

      /* ── automatización ───────────────────────────────────────────────── */
      T('Outbox de hechos en tasks y projects', 'automatización'),
      T('Publicador del outbox al stream de Redis', 'automatización'),
      T('automation-service y su consumidor de hechos', 'automatización'),
      T('Diez disparadores: de barrido y reactivos', 'automatización'),
      T('Siete acciones que escriben por los endpoints de siempre', 'automatización'),
      T('Catálogo servido por API, fuente única de verdad', 'automatización'),
      T('Idempotencia por causa: no duplicar avisos', 'automatización'),
      T('Fusible de 20 automatizaciones por tarea y hora', 'automatización'),
      T('Constructor de reglas que se lee como una frase', 'automatización'),
      T('Ejecuciones desplegables con su detalle', 'automatización'),
      T('Avisos de automatización en ámbar y con rayo', 'automatización'),
      T('Reglas que se disparen por horario', 'automatización'),
      T('Integración con GitHub para cerrar tareas', 'automatización'),

      /* ── plataforma y cobro ───────────────────────────────────────────── */
      T('Panel de administración: cuentas y auditoría', 'auth'),
      T('Suspender un proyecto recorta permissions/me', 'auth'),
      T('Terraform: VPC, Cloud SQL, MIGs y balanceador', 'infra'),
      T('Cloud Build con rolling replace sin caída', 'infra'),
      T('Secretos en Secret Manager, nunca en metadatos', 'infra'),
      T('Dominio propio con certificado gestionado', 'infra'),
      T('Cloud NAT para que el asistente alcance a Gemini', 'infra'),
      T('Checkout de Stripe para el plan PRO', 'infra'),
      T('Webhook de Stripe con firma verificada', 'infra'),
      T('Página de planes con la comparación de los dos', 'infra'),
      T('Portal de facturación para bajas y recibos', 'infra'),
      T('Rol y plan en la cabecera de todas las pantallas', 'tablero'),
      T('Planes por organización y cuotas de uso', 'infra'),
    ],
  },
  {
    espacio: ESPACIO,
    nombre: 'Quality Assurance',
    desde: SEMANAS,
    dura: SEMANAS,
    restoPorColumna: [4, 3, 3, 2],
    actual: true,
    tareas: [
      T('Suite end-to-end del contrato del gateway', 'infra'),
      T('Pruebas de autorización: matriz de permisos por endpoint', 'auth'),
      T('Pruebas del recorrido de registro y verificación', 'auth'),
      T('Comprobar el límite de 10 logins por minuto', 'auth'),
      T('Pruebas de la renovación de sesión entre zonas', 'auth'),
      T('Recorrido de invitación y aceptación en navegador', 'tablero'),
      T('Pruebas de integridad relacional del tablero', 'tablero'),
      T('Regresión del panel de tarea tras el fallo de encargados', 'tablero'),
      T('Cubrir el arrastre de tarjetas con Playwright', 'tablero'),
      T('Pruebas del guardado automático del panel', 'tablero'),
      T('Verificar los estados vacíos de cada pantalla', 'tablero'),
      T('Auditoría de accesibilidad de los formularios', 'tablero'),
      T('Recorrido completo con teclado, sin ratón', 'tablero'),
      T('Contraste de color en tema claro y oscuro', 'tablero'),
      T('Pruebas de la zona de mensajes de punta a punta', 'chat'),
      T('Comprobar que el flujo SSE entrega los avisos', 'chat'),
      T('Pruebas de presencia entre dos sesiones', 'chat'),
      T('Validar los siete agregados de Análisis con datos fijos', 'análisis'),
      T('Comprobar que los filtros entran en la clave de caché', 'análisis'),
      T('Rechazo de tramos de más de 365 días', 'análisis'),
      T('Pruebas de los caminos de fallo del asistente', 'asistente'),
      T('Verificar que una propuesta inválida se descarta', 'asistente'),
      T('Medir el prompt antes y después de cada cambio', 'asistente'),
      T('Pruebas del catálogo de automatización contra el motor', 'automatización'),
      T('Comprobar la idempotencia de «Revisar ahora»', 'automatización'),
      T('Prueba de concurrencia del race de causeKey', 'automatización'),
      T('Verificar el pago de PRO con tarjeta de prueba', 'infra'),
      T('Comprobar que el webhook rechaza una firma inválida', 'infra'),
      T('Probar la caducidad del plan al cancelar', 'infra'),
      T('Separar las pruebas de integración de las unitarias', 'infra'),
      T('Regresión completa antes de cerrar cada etapa', 'infra'),
      T('Revisión de seguridad: inyecciones y timing attacks', 'auth'),
      T('Barrido de acceso: ningún endpoint sin guard', 'auth'),
      T('Pruebas de carga del tablero con 500 tareas', 'infra'),
      T('Medir el tiempo de respuesta en producción', 'infra'),
      T('Comprobar el despliegue en una máquina limpia', 'infra'),
      T('Revisar los textos de error de todos los formularios', 'tablero'),
      T('Verificar el borrado real de cuentas y proyectos', 'auth'),
    ],
  },
];

const PRIORIDADES = ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH', 'URGENT'] as const;

const entre = (min: number, max: number) => min + Math.random() * (max - min);
const azar = <T>(lista: readonly T[]): T => lista[Math.floor(Math.random() * lista.length)];

/**
 * Fines de semana flojos y semanas desiguales.
 *
 * Con un ritmo constante la predicción de Monte Carlo sale con un intervalo
 * absurdamente estrecho y el gráfico parece de mentira — que es exactamente lo
 * que sería.
 */
function pesoDelDia(fecha: Date): number {
  const dia = fecha.getDay();
  return dia === 0 || dia === 6 ? 0.15 : entre(0.6, 1.4);
}

const PERMISOS_ADMIN = {
  canViewProject: true,
  canCreateTask: true,
  canEditTask: true,
  canDeleteTask: true,
  canMoveTask: true,
  canComment: true,
  canCreateBoard: true,
  canEditBoard: true,
  canDeleteBoard: true,
  canCreateColumn: true,
  canEditColumn: true,
  canDeleteColumn: true,
  canManageMembers: true,
  canManageRoles: true,
  canManageLabels: true,
  canEditProject: true,
  canViewReports: true,
  canDeleteProject: true,
  canManageAutomations: true,
};

/** Lo mismo, sin las llaves del proyecto: es el rol del resto del equipo. */
const PERMISOS_EQUIPO = {
  ...PERMISOS_ADMIN,
  canDeleteProject: false,
  canManageRoles: false,
  canEditProject: false,
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');

  const correoDueno = process.env.PRAXIS_DUENO;
  if (!correoDueno) throw new Error('Falta PRAXIS_DUENO con el correo de quien lleva el proyecto');

  const correosEquipo = (process.env.PRAXIS_EQUIPO ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  /**
   * Las cuentas, buscadas por correo.
   *
   * ⚠️ Si alguna falta, se para **antes de tocar nada**. Sembrar el proyecto a
   * medias y repartir su trabajo entre los que sí estén es peor que no sembrar:
   * deja un tablero que parece completo y a alguien sin aparecer por ninguna
   * parte, y eso no se ve hasta que esa persona entra a buscarse.
   */
  const buscar = async (correo: string) => {
    const filas = await prisma.$queryRaw<{ id: string; nombre: string }[]>`
      SELECT u.id, u."firstName" AS nombre
        FROM credentials.users u
        JOIN credentials.credentials c ON c.id = u."credentialId"
       WHERE lower(c.email) = lower(${correo})
    `;
    if (filas.length === 0) throw new Error(`No hay ninguna cuenta con el correo ${correo}`);
    return filas[0];
  };

  const dueno = await buscar(correoDueno);
  /* Con el tipo escrito: `[]` a secas se infiere `never[]` y el `push` no
     compila — y con `ts-node` eso se descubre al ejecutar, no al escribir. */
  const equipo: { id: string; nombre: string }[] = [];
  for (const correo of correosEquipo) equipo.push(await buscar(correo));

  /**
   * ⚠️ **Quien firma el proyecto y quien hace el trabajo son cosas distintas.**
   *
   * El dueño puede ser una cuenta de plataforma —la de administración— que no
   * mueve tarjetas: si el reparto se sesgara hacia ella, el informe por persona
   * coronaría a una cuenta de servicio y el equipo real saldría por detrás.
   *
   * Así que las tareas se reparten **solo entre `PRAXIS_EQUIPO`**, y el primero
   * de esa lista es quien más cierra y más rápido. El dueño entra como miembro
   * con el rol de administración, y solo recibe trabajo si además está en el
   * equipo.
   */
  const trabajadores = equipo.length > 0 ? equipo : [dueno];
  const miembros = [dueno, ...equipo.filter((p) => p.id !== dueno.id)];

  console.log(`Dueño: ${dueno.nombre}`);
  console.log(`Equipo: ${trabajadores.map((p) => p.nombre).join(', ')}`);

  /**
   * El reparto, sesgado hacia el primero del equipo.
   *
   * No es vanidad: en un equipo pequeño quien arranca el producto cierra más
   * cosas y las cierra antes, y el informe por persona tiene que poder enseñar
   * una diferencia. Con el trabajo a partes iguales, la pantalla de reparto no
   * dice nada de nadie.
   */
  const pesoPersona = trabajadores.map((_, indice) => (indice === 0 ? 5 : 2));

  const arranque = new Date(Date.now() - SEMANAS * 7 * DIA);

  /* ── fuera el proyecto de demostración que siembra el arranque limpio ──── */

  /**
   * `--arranque-limpio` siembra «Sprint histórico (datos de demostración)», y
   * ese nombre en pantalla delata lo que es. Se borra con
   * `PRAXIS_BORRAR_DEMO=1`.
   *
   * ⚠️ Las tareas y sus eventos hay que borrarlos **a mano**: viven en el
   * esquema `tasks` y no hay clave foránea que cruce servicios, así que borrar
   * la fila del proyecto se lleva sus espacios y sus miembros pero deja el
   * tablero huérfano dentro de `tasks`.
   */
  if (process.env.PRAXIS_BORRAR_DEMO === '1') {
    const demo = await prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM projects.projects WHERE name ILIKE '%demostración%' OR name ILIKE '%demostracion%'
    `;
    for (const proyecto of demo) {
      await prisma.taskEvent.deleteMany({ where: { projectId: proyecto.id } });
      await prisma.task.deleteMany({ where: { projectId: proyecto.id } });
      await prisma.label.deleteMany({ where: { projectId: proyecto.id } });
      await prisma.$executeRaw`DELETE FROM projects.projects WHERE id = ${proyecto.id}::text`;
      console.log(`Borrado el proyecto de demostración: ${proyecto.name}`);
    }
  }

  /* ── el proyecto ────────────────────────────────────────────────────────── */

  const existente = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM projects.projects WHERE slug = ${SLUG_PROYECTO}
  `;

  let projectId: string;

  if (existente.length > 0) {
    projectId = existente[0].id;
    console.log(`Reutilizando el proyecto ${projectId} y limpiando su historial…`);
    await prisma.taskEvent.deleteMany({ where: { projectId } });
    await prisma.task.deleteMany({ where: { projectId } });
    await prisma.$executeRaw`
      DELETE FROM projects.workspaces WHERE "projectId" = ${projectId}::text
    `;
  } else {
    const creado = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.projects (id, name, slug, description, "ownerId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${NOMBRE_PROYECTO}, ${SLUG_PROYECTO},
              ${'Plataforma de gestión de proyectos: tableros, análisis, asistente y automatizaciones.'},
              ${dueno.id}, ${arranque}, now())
      RETURNING id
    `;
    projectId = creado[0].id;
    console.log(`Proyecto creado: ${projectId}`);
  }

  /* ── roles y miembros ───────────────────────────────────────────────────── */

  const rolDe = async (nombre: string, permisos: object) => {
    const existentes = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM projects.project_roles
       WHERE "projectId" = ${projectId}::text AND name = ${nombre}
    `;
    if (existentes.length > 0) return existentes[0].id;
    const fila = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.project_roles (id, name, "projectId", permissions)
      VALUES (gen_random_uuid(), ${nombre}, ${projectId}::text, ${JSON.stringify(permisos)}::jsonb)
      RETURNING id
    `;
    return fila[0].id;
  };

  const rolAdmin = await rolDe('Administrador', PERMISOS_ADMIN);
  const rolEquipo = await rolDe('Equipo', PERMISOS_EQUIPO);

  for (const [indice, persona] of miembros.entries()) {
    await prisma.$executeRaw`
      INSERT INTO projects.project_members (id, "projectId", "userId", "projectRoleId", "joinedAt")
      VALUES (gen_random_uuid(), ${projectId}::text, ${persona.id}::text,
              ${indice === 0 ? rolAdmin : rolEquipo}::text, ${arranque})
      ON CONFLICT DO NOTHING
    `;
  }

  /* ── etiquetas ──────────────────────────────────────────────────────────── */

  const etiquetaId = new Map<string, string>();
  for (const etiqueta of ETIQUETAS) {
    const fila = await prisma.label.upsert({
      where: { projectId_name: { projectId, name: etiqueta.name } },
      update: { color: etiqueta.color },
      create: { projectId, name: etiqueta.name, color: etiqueta.color, createdAt: arranque },
    });
    etiquetaId.set(etiqueta.name, fila.id);
  }

  /* ── los espacios, sus tableros y sus tareas ────────────────────────────── */

  let creadas = 0;
  let cerradas = 0;
  let orden = 0;

  /** Un espacio se crea la primera vez que lo pide un tablero. */
  const espacioId = new Map<string, string>();
  const espacioDe = async (nombre: string, cuando: Date) => {
    const guardado = espacioId.get(nombre);
    if (guardado) return guardado;
    const fila = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.workspaces (id, name, "projectId", "createdAt")
      VALUES (gen_random_uuid(), ${nombre}, ${projectId}::text, ${cuando})
      RETURNING id
    `;
    espacioId.set(nombre, fila[0].id);
    return fila[0].id;
  };

  for (const tablero of TABLEROS) {
    const inicio = new Date(Date.now() - tablero.desde * 7 * DIA);
    const wsId = await espacioDe(tablero.espacio, inicio);

    const board = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.boards (id, name, "workspaceId", "createdAt")
      VALUES (gen_random_uuid(), ${tablero.nombre}, ${wsId}::text, ${inicio})
      RETURNING id
    `;
    const boardId = board[0].id;

    for (const col of COLUMNAS) {
      await prisma.$executeRaw`
        INSERT INTO projects.board_columns (id, name, "order", color, "boardId")
        VALUES (gen_random_uuid(), ${col.name}, ${col.order}, ${col.color}, ${boardId}::text)
      `;
    }
    const columnas = await prisma.$queryRaw<{ id: string; name: string; order: number }[]>`
      SELECT id, name, "order" FROM projects.board_columns
       WHERE "boardId" = ${boardId}::text ORDER BY "order"
    `;
    const cierre = columnas[columnas.length - 1];

    /**
     * El destino de cada tarea, **repartido por cupo y barajado**.
     *
     * Se construye la lista entera de destinos —tantos en la columna 0 como
     * diga el cupo, tantos en la 1, y el resto en «Hecho»— y se baraja. Así el
     * tablero tiene exactamente la forma declarada, y no la que salga de tirar
     * un dado por tarea: eso fue lo que dejó un tablero con las veintiocho
     * cerradas y cuatro columnas vacías.
     */
    const destinos: number[] = [];
    tablero.restoPorColumna.forEach((cuantas, columna) => {
      for (let i = 0; i < cuantas; i++) destinos.push(columna);
    });
    while (destinos.length < tablero.tareas.length) destinos.push(columnas.length - 1);
    destinos.sort(() => Math.random() - 0.5);

    for (const [indiceTarea, tarea] of tablero.tareas.entries()) {
      const destino = Math.min(destinos[indiceTarea] ?? columnas.length - 1, columnas.length - 1);

      const cerrara = destino === columnas.length - 1;

      /**
       * Lo cerrado nace en cualquier punto de la ventana; **lo que sigue
       * abierto nace en las últimas seis semanas**.
       *
       * ⚠️ Sin esta distinción salían tareas creadas hace medio año, todavía en
       * «En curso» y con la fecha de entrega en la semana que viene. Nadie mira
       * eso y se lo cree: el trabajo vivo de un equipo es reciente, y el que se
       * quedó atrás hace meses ya no está en curso — está olvidado.
       */
      const ventana = cerrara ? Math.max(1, tablero.dura * 7 - 2) : 42;
      const desdeDias = cerrara ? 0 : Math.max(0, tablero.dura * 7 - 42);
      const nacida = new Date(inicio.getTime() + (desdeDias + entre(0, ventana)) * DIA);
      if (nacida.getTime() > Date.now()) continue;

      const eventos: {
        type: string;
        fromColumnId?: string;
        toColumnId?: string;
        occurredAt: Date;
      }[] = [{ type: 'CREATED', toColumnId: columnas[0].id, occurredAt: nacida }];

      /* Quién la lleva. El primero del equipo pesa más y además va más rápido. */
      const indicePersona = azarConPesos(pesoPersona);
      const persona = trabajadores[indicePersona];
      const ritmo = indicePersona === 0 ? 0.5 : 1;

      let momento = nacida;
      let actual = columnas[0];

      for (const parada of columnas.slice(1, destino + 1)) {
        const espera = Math.exp(entre(0, 2.1)) * pesoDelDia(momento) * ritmo;
        momento = new Date(momento.getTime() + espera * DIA);
        if (momento.getTime() > Date.now()) break;
        eventos.push({
          type: 'MOVED',
          fromColumnId: actual.id,
          toColumnId: parada.id,
          occurredAt: momento,
        });
        actual = parada;
      }

      const estaCerrada = actual.id === cierre.id;

      /**
       * Vencidas y sin encargado, **solo entre lo que sigue abierto**.
       *
       * Son las candidatas que necesitan las automatizaciones para tener algo
       * que enseñar al pulsar «Revisar ahora». Lo ya cerrado no lleva nada de
       * esto: una tarea entregada no puede estar vencida.
       */
      const sinEncargado = tablero.actual === true && !estaCerrada && indiceTarea % 5 === 3;
      const vencida = tablero.actual === true && !estaCerrada && indiceTarea % 4 === 1;

      const dueDate = estaCerrada
        ? new Date(nacida.getTime() + entre(6, 20) * DIA)
        : tablero.actual
          ? vencida
            ? new Date(Date.now() - entre(1, 8) * DIA)
            : new Date(Date.now() + entre(2, 16) * DIA)
          : null;

      const etiquetas = new Set<string>([tarea.etiqueta]);
      if (Math.random() < 0.22) etiquetas.add(azar(ETIQUETAS).name);

      const creada = await prisma.task.create({
        data: {
          title: tarea.titulo,
          status: actual.name,
          boardId,
          columnId: actual.id,
          reporterId: dueno.id,
          projectId,
          priority: azar(PRIORIDADES),
          order: orden++,
          createdAt: nacida,
          completedAt: estaCerrada ? momento : null,
          dueDate,
          assignees: sinEncargado
            ? undefined
            : { create: [{ userId: persona.id, assignedBy: dueno.id, assignedAt: nacida }] },
          labels: {
            create: [...etiquetas]
              .filter((nombre) => etiquetaId.has(nombre))
              .map((nombre) => ({ labelId: etiquetaId.get(nombre)! })),
          },
        },
      });

      if (estaCerrada) {
        eventos.push({ type: 'COMPLETED', toColumnId: cierre.id, occurredAt: momento });
        cerradas++;
      }

      await prisma.taskEvent.createMany({
        data: eventos.map((evento) => ({
          taskId: creada.id,
          projectId,
          boardId,
          type: evento.type as never,
          fromColumnId: evento.fromColumnId ?? null,
          toColumnId: evento.toColumnId ?? null,
          actorId: sinEncargado ? dueno.id : persona.id,
          taskTitle: tarea.titulo,
          occurredAt: evento.occurredAt,
        })),
      });

      creadas++;
    }

    console.log(`  ${tablero.espacio} / ${tablero.nombre}: ${tablero.tareas.length} tareas`);
  }

  console.log(
    `\n  ${creadas} tareas, ${cerradas} cerradas (${Math.round((cerradas / creadas) * 100)} %).`,
  );
  console.log(`  ${SEMANAS} semanas de historial · ${TABLEROS.length} tableros en «${ESPACIO}».`);
  console.log(`  Proyecto: ${NOMBRE_PROYECTO} (${projectId})`);
  console.log(`  Dueño: ${dueno.nombre} <${correoDueno}>`);

  await prisma.$disconnect();
}

/** Saca un índice respetando pesos. */
function azarConPesos(pesos: number[]): number {
  const total = pesos.reduce((a, b) => a + b, 0);
  let tirada = Math.random() * total;
  for (let i = 0; i < pesos.length; i++) {
    tirada -= pesos[i];
    if (tirada <= 0) return i;
  }
  return 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
