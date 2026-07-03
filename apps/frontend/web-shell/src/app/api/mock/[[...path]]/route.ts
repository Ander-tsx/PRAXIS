import { type NextRequest, NextResponse } from 'next/server';

// Estructura de la base de datos mock
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  privileges: string[];
}

interface ProjectMember {
  userId: string;
  userName: string;
  userEmail: string;
  permissions: string[]; // e.g. ['tarea:ver', 'tarea:mover', 'tarea:crear']
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'closed';
  progress: number;
  pm: string;
  pmUserId: string;
  deadline: string;
  members: ProjectMember[];
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'alta' | 'media' | 'baja';
  limitDate: string;
  status: 'todo' | 'doing' | 'done';
}

interface Log {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  date: string;
}

interface MockDb {
  users: User[];
  projects: Project[];
  tasks: Task[];
  logs: Log[];
}

// Inicializar base de datos mock global para resistir recargas en desarrollo
declare global {
  var mockDb: MockDb | undefined;
}

const defaultUsers: User[] = [
  {
    id: 'usr-1',
    name: 'Alejandro Admin',
    email: 'admin@praxis.com',
    role: 'admin',
    status: 'active',
    privileges: [
      'admin:acceder',
      'proyecto:crear',
      'proyecto:ver',
      'tarea:crear',
      'tarea:ver',
      'tarea:mover',
      'reporte:ver',
      'reporte:exportar',
    ],
  },
  {
    id: 'usr-2',
    name: 'Patricia Manager',
    email: 'pm@praxis.com',
    role: 'user',
    status: 'active',
    privileges: [
      'proyecto:crear',
      'proyecto:ver',
      'tarea:crear',
      'tarea:ver',
      'tarea:mover',
      'reporte:ver',
      'reporte:exportar',
    ],
  },
  {
    id: 'usr-3',
    name: 'Carlos Colaborador',
    email: 'colab@praxis.com',
    role: 'user',
    status: 'active',
    privileges: ['proyecto:ver', 'tarea:ver', 'tarea:mover'],
  },
  {
    id: 'usr-5',
    name: 'Sofía Desarrolladora',
    email: 'sofia@praxis.com',
    role: 'user',
    status: 'active',
    privileges: ['proyecto:ver', 'tarea:ver'],
  },
];

const defaultProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Portal de Clientes Alfa',
    description:
      'Desarrollo del nuevo portal autogestionable para clientes corporativos de Praxis, con integraciones de facturación y visualización de reportes en tiempo real.',
    status: 'active',
    progress: 40,
    pm: 'Patricia Manager',
    pmUserId: 'usr-2',
    deadline: '2026-08-15',
    members: [
      {
        userId: 'usr-3',
        userName: 'Carlos Colaborador',
        userEmail: 'colab@praxis.com',
        permissions: ['tarea:ver', 'tarea:mover', 'tarea:crear'],
      },
      {
        userId: 'usr-5',
        userName: 'Sofía Desarrolladora',
        userEmail: 'sofia@praxis.com',
        permissions: ['tarea:ver'],
      },
    ],
  },
  {
    id: 'proj-2',
    name: 'Migración Core Postgres',
    description:
      'Migración de los esquemas históricos desde bases de datos legadas hacia PostgreSQL con optimización de índices para mejorar el rendimiento de la API.',
    status: 'paused',
    progress: 33,
    pm: 'Patricia Manager',
    pmUserId: 'usr-2',
    deadline: '2026-10-01',
    members: [
      {
        userId: 'usr-3',
        userName: 'Carlos Colaborador',
        userEmail: 'colab@praxis.com',
        permissions: ['tarea:ver', 'tarea:mover', 'tarea:crear'],
      },
    ],
  },
  {
    id: 'proj-3',
    name: 'Identidad Visual Praxis',
    description:
      'Rediseño completo de la interfaz, paleta de colores y componentes del design system para alinear el producto web con el branding de Praxis.',
    status: 'closed',
    progress: 100,
    pm: 'Carlos Colaborador',
    pmUserId: 'usr-3',
    deadline: '2026-06-01',
    members: [
      {
        userId: 'usr-2',
        userName: 'Patricia Manager',
        userEmail: 'pm@praxis.com',
        permissions: ['tarea:ver'],
      },
    ],
  },
];

const defaultTasks: Task[] = [
  // Portal de Clientes Alfa
  {
    id: 'task-1-1',
    projectId: 'proj-1',
    title: 'Diseñar maquetas Figma',
    description: 'Crear wireframes de baja fidelidad y UI final de portal.',
    assignee: 'Carlos Colaborador',
    priority: 'alta',
    limitDate: '2026-05-10',
    status: 'done',
  },
  {
    id: 'task-1-2',
    projectId: 'proj-1',
    title: 'Crear componentes en commons',
    description: 'Implementar los átomos y moléculas acordados para UI.',
    assignee: 'Carlos Colaborador',
    priority: 'alta',
    limitDate: '2026-06-05',
    status: 'done',
  },
  {
    id: 'task-1-3',
    projectId: 'proj-1',
    title: 'Implementar flujo OAuth2',
    description: 'Desarrollar la integración segura contra el BFF de Auth.',
    assignee: 'Sofía Desarrolladora',
    priority: 'alta',
    limitDate: '2026-07-20',
    status: 'doing',
  },
  {
    id: 'task-1-4',
    projectId: 'proj-1',
    title: 'Escribir pruebas unitarias',
    description: 'Desarrollar test cases con Jest en los componentes core.',
    assignee: 'Sofía Desarrolladora',
    priority: 'media',
    limitDate: '2026-07-15',
    status: 'todo',
  },
  {
    id: 'task-1-5',
    projectId: 'proj-1',
    title: 'Carga masiva de datos (Vencida)',
    description: 'Script para importar usuarios corporativos del legado.',
    assignee: 'Carlos Colaborador',
    priority: 'alta',
    limitDate: '2026-06-25', // Vencida
    status: 'todo',
  },
  // Migración Core Postgres
  {
    id: 'task-2-1',
    projectId: 'proj-2',
    title: 'Modelar base de datos relacional',
    description: 'Crear esquemas de tablas en db diagram.',
    assignee: 'Sofía Desarrolladora',
    priority: 'alta',
    limitDate: '2026-05-20',
    status: 'done',
  },
  {
    id: 'task-2-2',
    projectId: 'proj-2',
    title: 'Optimizar índices y vistas',
    description: 'Asegurar que los queries pesados bajen de 50ms.',
    assignee: 'Sofía Desarrolladora',
    priority: 'baja',
    limitDate: '2026-09-10',
    status: 'todo',
  },
  {
    id: 'task-2-3',
    projectId: 'proj-2',
    title: 'Migrar tablas históricas',
    description: 'Proceso ETL usando scripts de node.',
    assignee: 'Carlos Colaborador',
    priority: 'alta',
    limitDate: '2026-09-01',
    status: 'doing',
  },
  // Identidad Visual Praxis
  {
    id: 'task-3-1',
    projectId: 'proj-3',
    title: 'Definir paleta HSL',
    description: 'Establecer colores y variables en globals.css.',
    assignee: 'Carlos Colaborador',
    priority: 'alta',
    limitDate: '2026-05-01',
    status: 'done',
  },
  {
    id: 'task-3-2',
    projectId: 'proj-3',
    title: 'Ajustar tipografía serif/sans',
    description: 'Agregar fuentes Redaction y configurar Inter.',
    assignee: 'Carlos Colaborador',
    priority: 'media',
    limitDate: '2026-05-15',
    status: 'done',
  },
];

const defaultLogs: Log[] = [
  {
    id: 'log-1',
    userId: 'usr-3',
    userName: 'Carlos Colaborador',
    userRole: 'user',
    action: 'Completó tarea "Diseñar maquetas Figma"',
    module: 'Proyectos',
    date: '2026-07-02T16:00:00Z',
  },
  {
    id: 'log-2',
    userId: 'usr-2',
    userName: 'Patricia Manager',
    userRole: 'user',
    action: 'Actualizó fecha límite del proyecto "Portal de Clientes Alfa"',
    module: 'Proyectos',
    date: '2026-07-01T11:30:00Z',
  },
  {
    id: 'log-3',
    userId: 'usr-1',
    userName: 'Alejandro Admin',
    userRole: 'admin',
    action: 'Creó al usuario "Sofía Desarrolladora"',
    module: 'Administración',
    date: '2026-06-30T09:15:00Z',
  },
  {
    id: 'log-4',
    userId: 'usr-1',
    userName: 'Alejandro Admin',
    userRole: 'admin',
    action: 'Actualizó configuración global de plataforma',
    module: 'Administración',
    date: '2026-06-29T14:45:00Z',
  },
  {
    id: 'log-5',
    userId: 'usr-5',
    userName: 'Sofía Desarrolladora',
    userRole: 'user',
    action: 'Inició el desarrollo de la tarea "Implementar flujo OAuth2"',
    module: 'Proyectos',
    date: '2026-07-03T10:00:00Z',
  },
];

function getDb(): MockDb {
  if (!globalThis.mockDb) {
    globalThis.mockDb = {
      users: [...defaultUsers],
      projects: [...defaultProjects],
      tasks: [...defaultTasks],
      logs: [...defaultLogs],
    };
  }
  return globalThis.mockDb;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const db = getDb();
  const resolvedParams = await params;
  const path = resolvedParams.path ?? [];
  const resource = path[0];
  const id = path[1];

  if (!resource) {
    return NextResponse.json(db);
  }

  if (resource === 'users') {
    if (id) {
      const user = db.users.find((u) => u.id === id);
      return user
        ? NextResponse.json(user)
        : NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    return NextResponse.json(db.users);
  }

  if (resource === 'projects') {
    if (id) {
      const project = db.projects.find((p) => p.id === id);
      return project
        ? NextResponse.json(project)
        : NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(db.projects);
  }

  if (resource === 'tasks') {
    if (id) {
      const task = db.tasks.find((t) => t.id === id);
      return task
        ? NextResponse.json(task)
        : NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (projectId) {
      return NextResponse.json(db.tasks.filter((t) => t.projectId === projectId));
    }
    return NextResponse.json(db.tasks);
  }

  if (resource === 'logs') {
    return NextResponse.json(db.logs);
  }

  return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const db = getDb();
  const resolvedParams = await params;
  const path = resolvedParams.path ?? [];
  const resource = path[0];

  if (!resource) {
    return NextResponse.json({ message: 'Resource required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  if (resource === 'users') {
    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: body.name || 'Nuevo Usuario',
      email: body.email || 'nuevo@praxis.com',
      role: body.role || 'user',
      status: body.status || 'active',
      privileges: body.privileges || ['proyecto:ver', 'tarea:ver'],
    };
    db.users.push(newUser);

    // Registrar log
    db.logs.unshift({
      id: `log-${Date.now()}`,
      userId: 'system',
      userName: 'Demo Engine',
      userRole: 'system',
      action: `Creó al usuario "${newUser.name}" con rol "${newUser.role}"`,
      module: 'Administración',
      date: new Date().toISOString(),
    });

    return NextResponse.json(newUser, { status: 201 });
  }

  if (resource === 'projects') {
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: body.name || 'Nuevo Proyecto',
      description: body.description || '',
      status: body.status || 'active',
      progress: body.progress || 0,
      pm: body.pm || 'Patricia Manager',
      pmUserId: body.pmUserId || 'usr-2',
      deadline: body.deadline || new Date().toISOString().split('T')[0],
      members: body.members || [],
    };
    db.projects.push(newProject);

    // Registrar log
    db.logs.unshift({
      id: `log-${Date.now()}`,
      userId: body.pmUserId || 'system',
      userName: body.pm || 'Demo Engine',
      userRole: 'user',
      action: `Creó el proyecto "${newProject.name}"`,
      module: 'Proyectos',
      date: new Date().toISOString(),
    });

    return NextResponse.json(newProject, { status: 201 });
  }

  if (resource === 'tasks') {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      projectId: body.projectId,
      title: body.title || 'Nueva Tarea',
      description: body.description || '',
      assignee: body.assignee || 'Sin Asignar',
      priority: body.priority || 'media',
      limitDate: body.limitDate || new Date().toISOString().split('T')[0],
      status: body.status || 'todo',
    };
    db.tasks.push(newTask);

    // Registrar log
    db.logs.unshift({
      id: `log-${Date.now()}`,
      userId: 'system',
      userName: 'Demo Engine',
      userRole: 'system',
      action: `Creó la tarea "${newTask.title}" en el proyecto`,
      module: 'Proyectos',
      date: new Date().toISOString(),
    });

    // Calcular nuevo avance del proyecto
    updateProjectProgress(body.projectId, db);

    return NextResponse.json(newTask, { status: 201 });
  }

  if (resource === 'logs') {
    const newLog: Log = {
      id: `log-${Date.now()}`,
      userId: body.userId || 'system',
      userName: body.userName || 'Demo Engine',
      userRole: body.userRole || 'system',
      action: body.action || '',
      module: body.module || 'General',
      date: new Date().toISOString(),
    };
    db.logs.unshift(newLog);
    return NextResponse.json(newLog, { status: 201 });
  }

  return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const db = getDb();
  const resolvedParams = await params;
  const path = resolvedParams.path ?? [];
  const resource = path[0];
  const id = path[1];

  if (!resource || !id) {
    return NextResponse.json({ message: 'Resource and ID required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  if (resource === 'users') {
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    db.users[idx] = { ...db.users[idx], ...body };

    // Registrar log
    db.logs.unshift({
      id: `log-${Date.now()}`,
      userId: 'system',
      userName: 'Demo Engine',
      userRole: 'system',
      action: `Actualizó al usuario "${db.users[idx].name}"`,
      module: 'Administración',
      date: new Date().toISOString(),
    });

    return NextResponse.json(db.users[idx]);
  }

  if (resource === 'projects') {
    const idx = db.projects.findIndex((p) => p.id === id);
    if (idx === -1) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 });
    }
    db.projects[idx] = { ...db.projects[idx], ...body };
    return NextResponse.json(db.projects[idx]);
  }

  if (resource === 'tasks') {
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      return NextResponse.json({ message: 'Task not found' }, { status: 404 });
    }
    const oldStatus = db.tasks[idx].status;
    db.tasks[idx] = { ...db.tasks[idx], ...body };

    if (body.status && body.status !== oldStatus) {
      // Registrar log de movimiento de tarea
      db.logs.unshift({
        id: `log-${Date.now()}`,
        userId: 'system',
        userName: 'Demo Engine',
        userRole: 'system',
        action: `Movió tarea "${db.tasks[idx].title}" de "${oldStatus}" a "${body.status}"`,
        module: 'Proyectos',
        date: new Date().toISOString(),
      });
    }

    updateProjectProgress(db.tasks[idx].projectId, db);
    return NextResponse.json(db.tasks[idx]);
  }

  return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const db = getDb();
  const resolvedParams = await params;
  const path = resolvedParams.path ?? [];
  const resource = path[0];
  const id = path[1];

  if (!resource || !id) {
    return NextResponse.json({ message: 'Resource and ID required' }, { status: 400 });
  }

  if (resource === 'users') {
    db.users = db.users.filter((u) => u.id !== id);
    return NextResponse.json({ success: true });
  }

  if (resource === 'projects') {
    db.projects = db.projects.filter((p) => p.id !== id);
    db.tasks = db.tasks.filter((t) => t.projectId !== id);
    return NextResponse.json({ success: true });
  }

  if (resource === 'tasks') {
    const task = db.tasks.find((t) => t.id === id);
    if (task) {
      db.tasks = db.tasks.filter((t) => t.id !== id);
      updateProjectProgress(task.projectId, db);
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: 'Resource not found' }, { status: 404 });
}

// Recalcular progreso
function updateProjectProgress(projectId: string, db: MockDb) {
  const projTasks = db.tasks.filter((t) => t.projectId === projectId);
  if (projTasks.length === 0) return;

  const doneTasks = projTasks.filter((t) => t.status === 'done').length;
  const progress = Math.round((doneTasks / projTasks.length) * 100);

  const projIdx = db.projects.findIndex((p) => p.id === projectId);
  if (projIdx !== -1) {
    db.projects[projIdx].progress = progress;
  }
}
