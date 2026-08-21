/**
 * El proyecto PRAXIS, con su historial, para una instalación recién arrancada.
 *
 * ## Qué construye
 *
 * El proyecto con el que el equipo de PRAXIS gestionó PRAXIS: cuatro ciclos de
 * Shape Up de ocho semanas (seis de trabajo y dos de enfriamiento), unas ciento
 * treinta tareas con nombres del trabajo real —la cookie httpOnly, el motor de
 * automatización, el despliegue en GCP— y el historial de movimientos que
 * necesita la sección de Análisis para tener relieve.
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
 * Cuatro ciclos de ocho semanas: 32 hacia atrás.
 *
 * `weekly` acepta hasta 52 semanas y dibuja una serie; con 32 la tendencia se
 * ve de verdad y la predicción de Monte Carlo remuestrea sobre siete meses de
 * ritmo observado en vez de sobre un puñado de días.
 */
const SEMANAS_POR_CICLO = 8;
const CICLOS = 4;

/**
 * El tablero, como un *hill chart* de Shape Up.
 *
 * ⚠️ **La última columna es la de cierre y tiene que ser verde.** Es lo que hace
 * que `completedAt` se rellene y que la tarea cuente como terminada en los
 * informes; con otro color, el tablero se ve igual y los números salen mal.
 */
const COLUMNAS = [
  { name: 'Por definir', color: 'primary', order: 0 },
  { name: 'Explorando', color: 'info', order: 1 },
  { name: 'Cuesta arriba', color: 'warning', order: 2 },
  { name: 'Cuesta abajo', color: 'accent', order: 3 },
  { name: 'Hecho', color: 'success', order: 4 },
] as const;

/** Los *scopes* de Shape Up, que aquí son las etiquetas del proyecto. */
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
 * Los cuatro ciclos, con sus apuestas y su trabajo.
 *
 * Los títulos son del trabajo real de este repositorio a propósito: un tablero
 * de demostración con «Tarea 34» delata lo que es a un metro de distancia, y el
 * asistente —que lee estos títulos para recomendar— tampoco puede decir nada
 * útil sobre ellos.
 */
const CICLOS_DEF: {
  nombre: string;
  apuesta: string;
  tareas: { titulo: string; etiqueta: string }[];
}[] = [
  {
    nombre: 'Ciclo 1 · Cimientos',
    apuesta: 'Entrar, y que la sesión aguante',
    tareas: [
      { titulo: 'Montar el monorepo con pnpm y turbo', etiqueta: 'infra' },
      { titulo: 'Levantar Postgres y Redis con docker compose', etiqueta: 'infra' },
      { titulo: 'Esqueleto del gateway con prefijo /api y Swagger', etiqueta: 'infra' },
      { titulo: 'Sobre {success, data, meta} en todas las respuestas', etiqueta: 'infra' },
      { titulo: 'credentials-service: registro con bcrypt', etiqueta: 'auth' },
      { titulo: 'Login y emisión del par de tokens', etiqueta: 'auth' },
      { titulo: 'Guardar el JWT en cookie httpOnly, nunca en localStorage', etiqueta: 'auth' },
      { titulo: 'Renovación transparente del access token a los 15 minutos', etiqueta: 'auth' },
      { titulo: 'Proxy autenticado por zona con createGatewayProxy', etiqueta: 'auth' },
      { titulo: 'Guard de zona en proxy.ts y el lookahead que no casa la raíz', etiqueta: 'auth' },
      { titulo: 'Entrada con Google validando el aud del id token', etiqueta: 'auth' },
      { titulo: 'Verificación de correo antes del primer login', etiqueta: 'auth' },
      { titulo: 'Límite de 10 intentos de login por minuto y por IP', etiqueta: 'auth' },
      { titulo: 'Recuperar contraseña con token de un solo uso', etiqueta: 'auth' },
      { titulo: 'web-shell: landing y rewrites de las siete zonas', etiqueta: 'infra' },
      { titulo: 'Tokens de color en theme.css, una sola vez', etiqueta: 'tablero' },
      { titulo: 'Tema oscuro y claro sin parpadeo, desde la cookie', etiqueta: 'tablero' },
      { titulo: 'Átomos y moléculas compartidos en commons', etiqueta: 'tablero' },
      { titulo: 'Modelo de permisos de dos capas', etiqueta: 'auth' },
      { titulo: 'permissions-service y el catálogo de roles globales', etiqueta: 'auth' },
      { titulo: 'Roles por proyecto con diccionario de booleanos', etiqueta: 'auth' },
      { titulo: 'Un proyecto nuevo nace con su rol y con el dueño dentro', etiqueta: 'tablero' },
      { titulo: 'Slug único global con sufijo aleatorio, no contador', etiqueta: 'tablero' },
      { titulo: 'Nombre de proyecto único por dueño, no global', etiqueta: 'tablero' },
      { titulo: 'Invitaciones por correo con caducidad', etiqueta: 'tablero' },
      { titulo: 'Pruebas end-to-end del contrato del gateway', etiqueta: 'infra' },
      { titulo: 'Biome en la raíz y commitlint en español', etiqueta: 'infra' },
      { titulo: 'CLI de desarrollo que espera a cada puerto', etiqueta: 'infra' },
    ],
  },
  {
    nombre: 'Ciclo 2 · El tablero',
    apuesta: 'Que el trabajo se pueda mover con la mano',
    tareas: [
      { titulo: 'Espacios, tableros y columnas por proyecto', etiqueta: 'tablero' },
      { titulo: 'Arrastrar tarjetas entre columnas sin librería', etiqueta: 'tablero' },
      { titulo: 'Reordenar columnas y persistir la posición', etiqueta: 'tablero' },
      { titulo: 'El status de la tarea iguala el nombre de su columna', etiqueta: 'tablero' },
      { titulo: 'Panel de detalle de tarea que se guarda solo', etiqueta: 'tablero' },
      { titulo: 'Checklists con progreso en la tarjeta', etiqueta: 'tablero' },
      { titulo: 'Etiquetas del proyecto con su gestor', etiqueta: 'tablero' },
      { titulo: 'Adjuntos de tarea con validación de tamaño', etiqueta: 'tablero' },
      { titulo: 'Comentarios con edición y borrado', etiqueta: 'tablero' },
      { titulo: 'Encargados múltiples por tarea', etiqueta: 'tablero' },
      { titulo: 'Fecha de vencimiento al final del día local', etiqueta: 'tablero' },
      { titulo: 'Selector de fecha propio, sin el nativo del navegador', etiqueta: 'tablero' },
      { titulo: 'Columna a pantalla completa para tableros largos', etiqueta: 'tablero' },
      { titulo: 'Menú móvil para mover una tarea sin arrastrar', etiqueta: 'tablero' },
      { titulo: 'TaskEvent: registrar cada movimiento del tablero', etiqueta: 'análisis' },
      { titulo: 'completedAt denormalizado al entrar en la columna verde', etiqueta: 'análisis' },
      { titulo: 'Equipo del proyecto con roles y permisos por persona', etiqueta: 'tablero' },
      { titulo: 'permissions/me para apagar botones antes del 403', etiqueta: 'auth' },
      { titulo: 'Avisos en vivo por SSE desde el gateway', etiqueta: 'chat' },
      { titulo: 'Bandeja de avisos con marca de leído', etiqueta: 'chat' },
      { titulo: 'Latidos de 25 s para que el balanceador no corte el SSE', etiqueta: 'chat' },
      { titulo: 'El sobre estándar no puede envolver un flujo SSE', etiqueta: 'chat' },
      { titulo: 'Presencia: disponible, ausente, ocupado', etiqueta: 'chat' },
      { titulo: 'Chat de proyecto con hilos y adjuntos', etiqueta: 'chat' },
      { titulo: 'Silenciar una conversación', etiqueta: 'chat' },
      { titulo: 'Vista previa de enlaces en los mensajes', etiqueta: 'chat' },
      { titulo: 'Reacciones y mensajes fijados', etiqueta: 'chat' },
      { titulo: 'Contador de no leídos por conversación', etiqueta: 'chat' },
      { titulo: 'Zona de mensajes separada del panel', etiqueta: 'chat' },
      { titulo: 'Pruebas de integridad relacional del tablero', etiqueta: 'infra' },
    ],
  },
  {
    nombre: 'Ciclo 3 · Ver y preguntar',
    apuesta: 'Que los datos respondan preguntas',
    tareas: [
      { titulo: 'reports-service: agregador sin base propia', etiqueta: 'análisis' },
      { titulo: 'Flujo acumulado por semana', etiqueta: 'análisis' },
      { titulo: 'Tiempo de ciclo con percentiles 50 y 85', etiqueta: 'análisis' },
      { titulo: 'Predicción de entrega por Monte Carlo', etiqueta: 'análisis' },
      { titulo: 'Reparto por persona y por etiqueta', etiqueta: 'análisis' },
      { titulo: 'Instantánea del proyecto con vencidas y sin asignar', etiqueta: 'análisis' },
      { titulo: 'Serie semanal con variación contra la semana anterior', etiqueta: 'análisis' },
      { titulo: 'Filtros de fecha, tablero, persona, etiqueta y prioridad', etiqueta: 'análisis' },
      { titulo: 'Los filtros entran en la clave de Redis, el from derivado no', etiqueta: 'análisis' },
      { titulo: 'Rechazar tramos de más de 365 días con 400', etiqueta: 'análisis' },
      { titulo: 'Caché de informes en Redis con invalidación', etiqueta: 'análisis' },
      { titulo: 'Gráficas en SVG sin librería de terceros', etiqueta: 'análisis' },
      { titulo: 'assistant-service sobre Gemini', etiqueta: 'asistente' },
      { titulo: 'Cuota mensual por plan, en tabla y no en Redis', etiqueta: 'asistente' },
      { titulo: 'Briefing del proyecto que viaja en cada turno', etiqueta: 'asistente' },
      { titulo: 'Trece herramientas que proponen y nunca ejecutan', etiqueta: 'asistente' },
      { titulo: 'Tarjeta de propuesta con botón de aceptar', etiqueta: 'asistente' },
      { titulo: 'Validar cada propuesta contra el proyecto real', etiqueta: 'asistente' },
      { titulo: 'Conversaciones persistidas y renombrables', etiqueta: 'asistente' },
      { titulo: 'Adjuntos al asistente: texto extraído al subir', etiqueta: 'asistente' },
      { titulo: 'PDF nativo hasta el tope de páginas', etiqueta: 'asistente' },
      { titulo: 'Hablar con PRAX sin proyecto en foco', etiqueta: 'asistente' },
      { titulo: 'Plantilla de arranque de proyecto propuesta por PRAX', etiqueta: 'asistente' },
      { titulo: 'Medir el prompt real contra un proyecto de verdad', etiqueta: 'asistente' },
      { titulo: 'Tope del inventario que se le pasa al modelo', etiqueta: 'asistente' },
      { titulo: 'Skill de Alexa con token de voz de solo lectura', etiqueta: 'asistente' },
      { titulo: 'Vincular la cuenta con el altavoz desde el panel', etiqueta: 'asistente' },
      { titulo: 'Panel de administración: cuentas, suspensión y auditoría', etiqueta: 'auth' },
      { titulo: 'Suspender un proyecto recorta permissions/me', etiqueta: 'auth' },
      { titulo: 'Distinguir PROJECT_SUSPENDED de un 403 normal', etiqueta: 'auth' },
      { titulo: 'Terraform: VPC, Cloud SQL, MIGs y balanceador', etiqueta: 'infra' },
      { titulo: 'Cloud Build con rolling replace sin caída', etiqueta: 'infra' },
      { titulo: 'Secretos en Secret Manager, nunca en metadatos', etiqueta: 'infra' },
      { titulo: 'Dominio propio con certificado gestionado', etiqueta: 'infra' },
      { titulo: 'Cloud NAT para que el asistente alcance a Gemini', etiqueta: 'infra' },
    ],
  },
  {
    nombre: 'Ciclo 4 · Que trabaje solo',
    apuesta: 'Reglas que actúan y una puerta para pagar',
    tareas: [
      { titulo: 'Outbox de hechos en tasks y projects', etiqueta: 'automatización' },
      { titulo: 'Publicador del outbox al stream de Redis', etiqueta: 'automatización' },
      { titulo: 'automation-service y su consumidor de hechos', etiqueta: 'automatización' },
      { titulo: 'Diez disparadores: cuatro de barrido y seis reactivos', etiqueta: 'automatización' },
      { titulo: 'Siete acciones que escriben por los endpoints de siempre', etiqueta: 'automatización' },
      { titulo: 'Catálogo servido por API, fuente única de verdad', etiqueta: 'automatización' },
      { titulo: 'Ocho operadores de condición, con GT y CONTAINS', etiqueta: 'automatización' },
      { titulo: 'Idempotencia por causa: no duplicar avisos', etiqueta: 'automatización' },
      { titulo: 'Fusible de 20 automatizaciones por tarea y hora', etiqueta: 'automatización' },
      { titulo: 'Auto-pausa cuando quien la creó pierde el permiso', etiqueta: 'automatización' },
      { titulo: 'Retención: purgar outbox e inbound a los 7 días', etiqueta: 'automatización' },
      { titulo: 'Constructor de reglas que se lee como una frase', etiqueta: 'automatización' },
      { titulo: 'Ejecuciones desplegables con el detalle de cada una', etiqueta: 'automatización' },
      { titulo: 'Revisar ahora: lanzar las reglas de estado a mano', etiqueta: 'automatización' },
      { titulo: 'Avisos de automatización en ámbar y con rayo', etiqueta: 'automatización' },
      { titulo: 'Checkout de Stripe para el plan PRO', etiqueta: 'infra' },
      { titulo: 'Webhook de Stripe con firma verificada', etiqueta: 'infra' },
      { titulo: 'Página de planes con la comparación de los dos', etiqueta: 'infra' },
      { titulo: 'Portal de facturación para bajas y recibos', etiqueta: 'infra' },
      { titulo: 'El plan lo concede el webhook, nunca la vuelta del navegador', etiqueta: 'infra' },
      { titulo: 'Rol y plan visibles en la cabecera de todas las pantallas', etiqueta: 'tablero' },
      { titulo: 'Que PRAX proponga automatizaciones', etiqueta: 'asistente' },
      { titulo: 'Validar la regla propuesta contra el catálogo', etiqueta: 'asistente' },
      { titulo: 'Paginar el histórico de ejecuciones', etiqueta: 'automatización' },
      { titulo: 'Techo con aviso en la lista de reglas', etiqueta: 'automatización' },
      { titulo: 'Burbuja de no leídos del chat en tiempo real', etiqueta: 'chat' },
      { titulo: 'Emitir prioridad cambiada y comentario añadido', etiqueta: 'automatización' },
      { titulo: 'Planes por organización y cuotas de uso', etiqueta: 'infra' },
      { titulo: 'Separar las pruebas de integración de las unitarias', etiqueta: 'infra' },
      { titulo: 'Regresión completa antes de cerrar la etapa', etiqueta: 'infra' },
      { titulo: 'Revisar los textos de los estados vacíos', etiqueta: 'tablero' },
      { titulo: 'Auditoría de accesibilidad de los formularios', etiqueta: 'tablero' },
      { titulo: 'Reducir el peso del paquete de la landing', etiqueta: 'infra' },
      { titulo: 'Documentar el contrato de la API al día', etiqueta: 'infra' },
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

  const personas = [dueno, ...equipo];
  console.log(`Equipo: ${personas.map((p) => p.nombre).join(', ')}`);

  /**
   * El reparto del trabajo, sesgado hacia quien lleva el proyecto.
   *
   * No es vanidad: en un equipo pequeño quien arranca el producto cierra más
   * cosas y las cierra antes, y el informe por persona tiene que poder
   * enseñar una diferencia. Con el trabajo repartido a partes iguales, la
   * pantalla de reparto no dice nada de nadie.
   */
  const pesoPersona = personas.map((_, indice) => (indice === 0 ? 5 : 2));

  const arranque = new Date(Date.now() - CICLOS * SEMANAS_POR_CICLO * 7 * DIA);

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

  for (const [indice, persona] of personas.entries()) {
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

  /* ── un espacio por ciclo, con su tablero y sus columnas ────────────────── */

  let creadas = 0;
  let cerradas = 0;
  let orden = 0;

  for (const [indiceCiclo, ciclo] of CICLOS_DEF.entries()) {
    const inicioCiclo = new Date(
      arranque.getTime() + indiceCiclo * SEMANAS_POR_CICLO * 7 * DIA,
    );
    const esElActual = indiceCiclo === CICLOS_DEF.length - 1;

    const ws = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.workspaces (id, name, "projectId", "createdAt")
      VALUES (gen_random_uuid(), ${ciclo.nombre}, ${projectId}::text, ${inicioCiclo})
      RETURNING id
    `;
    const board = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO projects.boards (id, name, "workspaceId", "createdAt")
      VALUES (gen_random_uuid(), ${ciclo.apuesta}, ${ws[0].id}::text, ${inicioCiclo})
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
     * Cuánto de este ciclo está terminado.
     *
     * Los tres cerrados van casi enteros —queda siempre algo colgando, que es
     * lo que pasa de verdad— y el que está en curso va por la mitad larga. El
     * conjunto ronda el 75 %, que deja tablero por delante: tareas abiertas,
     * alguna vencida y alguna sin encargado.
     */
    const proporcionCerrada = esElActual ? 0.45 : entre(0.88, 0.96);

    for (const [indiceTarea, tarea] of ciclo.tareas.entries()) {
      /* Nacimiento repartido por las seis semanas de trabajo del ciclo; las dos
         de enfriamiento no traen altas, que es justo lo que dice Shape Up. */
      const nacida = new Date(inicioCiclo.getTime() + entre(0, SEMANAS_POR_CICLO * 7 - 14) * DIA);
      if (nacida.getTime() > Date.now()) continue;

      const llegaAlFinal = Math.random() < proporcionCerrada;
      const hasta = llegaAlFinal
        ? columnas.length
        : 1 + Math.floor(entre(1, columnas.length - 1));

      const eventos: {
        type: string;
        fromColumnId?: string;
        toColumnId?: string;
        occurredAt: Date;
      }[] = [{ type: 'CREATED', toColumnId: columnas[0].id, occurredAt: nacida }];

      /* Quién la lleva. El dueño pesa el doble, y además va más rápido: su
         tiempo en cada columna se acorta un 35 %. */
      const indicePersona = azarConPesos(pesoPersona);
      const persona = personas[indicePersona];
      const ritmo = indicePersona === 0 ? 0.5 : 1;

      let momento = nacida;
      let actual = columnas[0];

      for (const parada of columnas.slice(1, hasta)) {
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
       * Un puñado del ciclo en curso se queda **sin encargado**, y otro puñado
       * **vencido**. No es descuido: es lo que las automatizaciones vigilan, y
       * sin candidatas no hay nada que enseñar cuando se pulse «Revisar ahora».
       */
      const sinEncargado = esElActual && !estaCerrada && indiceTarea % 5 === 3;
      const vencida = esElActual && !estaCerrada && indiceTarea % 4 === 1;

      /**
       * ⚠️ **Lo que quedó abierto de un ciclo pasado NO lleva fecha.**
       *
       * Con la fecha puesta, cada tarea que no se cerró hace medio año cuenta
       * como vencida para siempre: la instantánea salía con treinta y una en
       * rojo sobre treinta y tres abiertas, que no se lee como un equipo con
       * trabajo pendiente sino como uno que perdió el control.
       *
       * Y es lo que dice Shape Up: lo que no cabe en el ciclo **se corta**, no
       * se arrastra con su plazo detrás. Las vencidas de verdad son las del
       * ciclo en curso, que son las que hay que mirar hoy.
       */
      const dueDate = estaCerrada
        ? new Date(nacida.getTime() + entre(6, 26) * DIA)
        : esElActual
          ? vencida
            ? new Date(Date.now() - entre(1, 9) * DIA)
            : new Date(Date.now() + entre(2, 18) * DIA)
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
          /* ⚠️ El actor es una persona real, no el UUID sintético: ver la nota
             de la cabecera. Con el sintético, Análisis avisaría de que el
             historial está fabricado. */
          actorId: sinEncargado ? dueno.id : persona.id,
          taskTitle: tarea.titulo,
          occurredAt: evento.occurredAt,
        })),
      });

      creadas++;
    }

    console.log(`  ${ciclo.nombre}: ${ciclo.tareas.length} tareas`);
  }

  console.log(`\n  ${creadas} tareas, ${cerradas} cerradas (${Math.round((cerradas / creadas) * 100)} %).`);
  console.log(`  ${CICLOS} ciclos · ${CICLOS * SEMANAS_POR_CICLO} semanas de historial.`);
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
