/**
 * Datos mock para desarrollo — replica las respuestas esperadas
 * del contrato API (sección 1 del plan de implementación).
 */

const projects = [
  { id: 'proj-001', name: 'Praxis' },
  { id: 'proj-002', name: 'Rediseño Web' },
  { id: 'proj-003', name: 'App Móvil' },
];

const projectProgress = {
  'proj-001': {
    projectName: 'Praxis',
    percentage: 68,
    completedTasks: 34,
    totalTasks: 50,
  },
  'proj-002': {
    projectName: 'Rediseño Web',
    percentage: 45,
    completedTasks: 18,
    totalTasks: 40,
  },
  'proj-003': {
    projectName: 'App Móvil',
    percentage: 20,
    completedTasks: 6,
    totalTasks: 30,
  },
};

const weeklyProductivity = {
  'proj-001': {
    completedThisWeek: 5,
    completedLastWeek: 4,
    deltaPercent: 25,
  },
  'proj-002': {
    completedThisWeek: 3,
    completedLastWeek: 3,
    deltaPercent: 0,
  },
  'proj-003': {
    completedThisWeek: 2,
    completedLastWeek: 4,
    deltaPercent: -50,
  },
};

const forecasts = {
  'proj-001': { estimatedDays: 18 },
  'proj-002': { estimatedDays: 35 },
  'proj-003': { estimatedDays: null }, // sin datos suficientes
};

const blockedTasks = {
  'proj-001': [
    { title: 'Integración de pagos', daysStalled: 8 },
    { title: 'Diseño del dashboard', daysStalled: 5 },
    { title: 'Configuración de notificaciones', daysStalled: 3 },
    { title: 'Módulo de reportes', daysStalled: 2 },
  ],
  'proj-002': [{ title: 'Maquetación responsive', daysStalled: 4 }],
  'proj-003': [],
};

const workload = {
  'proj-001': [
    { memberName: 'Juan', assignedCount: 12 },
    { memberName: 'Andrés', assignedCount: 8 },
    { memberName: 'Sebastián', assignedCount: 6 },
  ],
  'proj-002': [
    { memberName: 'María', assignedCount: 10 },
    { memberName: 'Carlos', assignedCount: 7 },
  ],
  'proj-003': [
    { memberName: 'Luis', assignedCount: 15 },
    { memberName: 'Ana', assignedCount: 9 },
    { memberName: 'Pedro', assignedCount: 6 },
  ],
};

const members = {
  'proj-001': [
    { id: 'mem-001', name: 'Juan' },
    { id: 'mem-002', name: 'Andrés' },
    { id: 'mem-003', name: 'Sebastián' },
    { id: 'mem-004', name: 'César' },
  ],
  'proj-002': [
    { id: 'mem-005', name: 'María' },
    { id: 'mem-006', name: 'Carlos' },
  ],
  'proj-003': [
    { id: 'mem-007', name: 'Luis' },
    { id: 'mem-008', name: 'Ana' },
    { id: 'mem-009', name: 'Pedro' },
  ],
};

const memberPerformance = {
  'mem-001': { memberName: 'Juan', assignedCount: 12, completedCount: 9, inProgressCount: 3 },
  'mem-002': { memberName: 'Andrés', assignedCount: 8, completedCount: 6, inProgressCount: 2 },
  'mem-003': { memberName: 'Sebastián', assignedCount: 6, completedCount: 4, inProgressCount: 2 },
  'mem-004': { memberName: 'César', assignedCount: 10, completedCount: 8, inProgressCount: 2 },
  'mem-005': { memberName: 'María', assignedCount: 10, completedCount: 7, inProgressCount: 3 },
  'mem-006': { memberName: 'Carlos', assignedCount: 7, completedCount: 5, inProgressCount: 2 },
  'mem-007': { memberName: 'Luis', assignedCount: 15, completedCount: 10, inProgressCount: 5 },
  'mem-008': { memberName: 'Ana', assignedCount: 9, completedCount: 7, inProgressCount: 2 },
  'mem-009': { memberName: 'Pedro', assignedCount: 6, completedCount: 4, inProgressCount: 2 },
};

module.exports = {
  projects,
  projectProgress,
  weeklyProductivity,
  forecasts,
  blockedTasks,
  workload,
  members,
  memberPerformance,
};
