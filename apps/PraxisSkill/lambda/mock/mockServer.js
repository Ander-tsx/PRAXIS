/**
 * Mock Server — implementa el contrato API REST /api/alexa completo para desarrollo.
 * Envuelve todas las respuestas en { success: true, data: { ... } }.
 *
 * Uso: npm run mock (o node mock/mockServer.js)
 * Apuntar PRAXIS_API_BASE_URL=http://localhost:3000/api/alexa
 */

const express = require('express');
const data = require('./mockData');

const app = express();
const PORT = process.env.MOCK_PORT || 4000;

app.use(express.json());

// Helper para responder con el envelope global de Praxis
function sendSuccess(res, payload) {
  return res.json({
    success: true,
    data: payload,
    meta: {},
  });
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({
    statusCode,
    message,
    error: statusCode === 401 ? 'Unauthorized' : 'Bad Request',
  });
}

// ── Rutas Públicas de Autenticación ───────────────────────────────────

// POST /api/alexa/link/redeem o /link/redeem
app.post(['/api/alexa/link/redeem', '/link/redeem'], (req, res) => {
  const { phrase, alexaUserId } = req.body;
  console.log(`[Mock Server] Canjear frase semilla: "${phrase}" para alexaUserId: ${alexaUserId}`);

  if (!phrase || phrase.trim().length === 0) {
    return sendError(res, 400, 'Frase semilla requerida');
  }

  if (phrase.trim().toLowerCase() === 'expirada') {
    return sendError(res, 410, 'La frase semilla ha expirado');
  }

  return sendSuccess(res, {
    userId: 'mock-user-001',
    linkId: 'mock-link-001',
    voiceToken: 'mock-voice-token-xyz789',
    scope: 'voice:read',
    displayName: 'Erick Torres',
    expiresAt: new Date(Date.now() + 7776000000).toISOString(),
  });
});

// Middleware de Autenticación Simulada
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return sendError(res, 401, 'Invalid or missing voice token');
  }
  next();
});

// ── Rutas Protegidas de Usuario y Sesión ──────────────────────────────

// GET /api/alexa/me o /me
app.get(['/api/alexa/me', '/me'], (req, res) => {
  console.log('[Mock Server] GET /me — Token de voz válido');
  return sendSuccess(res, {
    userId: 'mock-user-001',
    displayName: 'Erick Torres',
    email: 'erick@praxis.dev',
  });
});

// POST /api/alexa/logout o /logout
app.post(['/api/alexa/logout', '/logout'], (req, res) => {
  console.log('[Mock Server] POST /logout — Token de voz revocado');
  return sendSuccess(res, {
    message: 'Sesión desvinculada exitosamente',
  });
});

// ── Rutas Protegidas de Consultas ─────────────────────────────────────

// GET /api/alexa/projects o /projects
app.get(['/api/alexa/projects', '/projects'], (req, res) => {
  return sendSuccess(res, {
    items: data.projects,
    total: data.projects.length,
    lastProjectId: data.projects[0].id,
  });
});

// POST /api/alexa/projects/:id/select o /projects/:id/select
app.post(['/api/alexa/projects/:id/select', '/projects/:id/select'], (req, res) => {
  return sendSuccess(res, {
    success: true,
    lastProjectId: req.params.id,
  });
});

// GET /api/alexa/projects/:id/progress o /projects/:id/progress
app.get(['/api/alexa/projects/:id/progress', '/projects/:id/progress'], (req, res) => {
  const progress = data.projectProgress[req.params.id];
  if (!progress) return sendError(res, 404, 'Proyecto no encontrado');
  return sendSuccess(res, {
    projectId: req.params.id,
    hasData: true,
    pendingTasks: progress.totalTasks - progress.completedTasks,
    ...progress,
  });
});

// GET /api/alexa/projects/:id/productivity/weekly o /projects/:id/productivity/weekly
app.get(
  ['/api/alexa/projects/:id/productivity/weekly', '/projects/:id/productivity/weekly'],
  (req, res) => {
    const productivity = data.weeklyProductivity[req.params.id];
    if (!productivity) return sendError(res, 404, 'Proyecto no encontrado');
    return sendSuccess(res, {
      projectId: req.params.id,
      trend:
        productivity.deltaPercent > 0 ? 'up' : productivity.deltaPercent < 0 ? 'down' : 'stable',
      ...productivity,
    });
  },
);

// GET /api/alexa/projects/:id/forecast o /projects/:id/forecast
app.get(['/api/alexa/projects/:id/forecast', '/projects/:id/forecast'], (req, res) => {
  const forecast = data.forecasts[req.params.id];
  if (!forecast) return sendError(res, 404, 'Proyecto no encontrado');
  return sendSuccess(res, {
    projectId: req.params.id,
    reason: forecast.estimatedDays ? 'OK' : 'INSUFFICIENT_DATA',
    ...forecast,
  });
});

// GET /api/alexa/projects/:id/blocked-tasks o /projects/:id/blocked-tasks
app.get(['/api/alexa/projects/:id/blocked-tasks', '/projects/:id/blocked-tasks'], (req, res) => {
  const blocked = data.blockedTasks[req.params.id];
  if (!blocked) return sendError(res, 404, 'Proyecto no encontrado');
  return sendSuccess(res, {
    projectId: req.params.id,
    total: blocked.length,
    items: blocked,
  });
});

// GET /api/alexa/projects/:id/workload o /projects/:id/workload
app.get(['/api/alexa/projects/:id/workload', '/projects/:id/workload'], (req, res) => {
  const workload = data.workload[req.params.id];
  if (!workload) return sendError(res, 404, 'Proyecto no encontrado');
  return sendSuccess(res, {
    projectId: req.params.id,
    total: workload.length,
    items: workload,
  });
});

// GET /api/alexa/projects/:id/members o /projects/:id/members
app.get(['/api/alexa/projects/:id/members', '/projects/:id/members'], (req, res) => {
  const projectMembers = data.members[req.params.id];
  if (!projectMembers) return sendError(res, 404, 'Proyecto no encontrado');
  return sendSuccess(res, {
    projectId: req.params.id,
    total: projectMembers.length,
    items: projectMembers,
  });
});

// GET /api/alexa/projects/:id/members/:memberId/performance o /projects/:id/members/:memberId/performance
app.get(
  [
    '/api/alexa/projects/:id/members/:memberId/performance',
    '/projects/:id/members/:memberId/performance',
  ],
  (req, res) => {
    const performance = data.memberPerformance[req.params.memberId];
    if (!performance) return sendError(res, 404, 'Integrante no encontrado');
    return sendSuccess(res, {
      projectId: req.params.id,
      memberId: req.params.memberId,
      ...performance,
    });
  },
);

// ── Servidor Listening ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Praxis Mock API running at http://localhost:${PORT}`);
  console.log('Todas las respuestas usan el envelope: { success: true, data: { ... } }');
  console.log('Endpoints disponibles:');
  console.log('  POST /api/alexa/link/redeem');
  console.log('  GET  /api/alexa/me');
  console.log('  POST /api/alexa/logout');
  console.log('  GET  /api/alexa/projects');
  console.log('  GET  /api/alexa/projects/:id/progress');
  console.log('  GET  /api/alexa/projects/:id/productivity/weekly');
  console.log('  GET  /api/alexa/projects/:id/forecast');
  console.log('  GET  /api/alexa/projects/:id/blocked-tasks');
  console.log('  GET  /api/alexa/projects/:id/workload');
  console.log('  GET  /api/alexa/projects/:id/members');
  console.log('  GET  /api/alexa/projects/:id/members/:memberId/performance');
});
