/**
 * Cliente API para el backend de Praxis.
 * Wrapper de axios — un método por endpoint del contrato REST /api/alexa.
 * Todos los cálculos (porcentajes, deltas, forecast) los realiza el backend.
 * Desenuelve automáticamente el envelope global { success: true, data: { ... } }.
 */

const axios = require('axios');

const BASE_URL = process.env.PRAXIS_API_BASE_URL || 'http://localhost:3000/api/alexa';

/**
 * Desenuelve la respuesta JSON si viene envuelta en el envelope global de Praxis.
 * @param {import('axios').AxiosResponse} res
 * @returns {any}
 */
function unwrap(res) {
  if (res && res.data) {
    if (res.data.success !== undefined && res.data.data !== undefined) {
      return res.data.data;
    }
    return res.data;
  }
  return res;
}

/**
 * Crea una instancia de axios configurada con el voiceToken del usuario.
 * @param {string} voiceToken - JWT de voz para la API de Alexa
 * @returns {import('axios').AxiosInstance}
 */
function createClient(voiceToken) {
  return axios.create({
    baseURL: BASE_URL,
    timeout: 4500, // margen dentro del límite de Alexa
    headers: {
      Authorization: `Bearer ${voiceToken}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Canjea una frase semilla dictada por voz para obtener un voiceToken.
 * @param {string} phrase - Frase semilla
 * @param {string} alexaUserId - ID único del usuario en Alexa
 * @param {string} [deviceId] - ID del dispositivo Alexa
 * @returns {Promise<{userId: string, voiceToken: string, displayName?: string}>}
 */
async function redeemSeedPhrase(phrase, alexaUserId, deviceId) {
  const res = await axios.post(`${BASE_URL}/link/redeem`, {
    phrase,
    alexaUserId,
    deviceId,
  });
  return unwrap(res);
}

/**
 * Obtiene la información del usuario autenticado actual (validación de token).
 * @param {import('axios').AxiosInstance} client
 * @returns {Promise<{userId: string, displayName?: string, email?: string}>}
 */
async function getMe(client) {
  const res = await client.get('/me');
  return unwrap(res);
}

/**
 * Revoca el voiceToken actual en el backend (cierre de sesión).
 * @param {import('axios').AxiosInstance} client
 * @returns {Promise<any>}
 */
async function logout(client) {
  const res = await client.post('/logout', {});
  return unwrap(res);
}

/**
 * Obtiene todos los proyectos donde el usuario es dueño o miembro.
 * @param {import('axios').AxiosInstance} client
 * @returns {Promise<Array<{id: string, name: string}>|{items: Array<{id: string, name: string}>}>}
 */
async function getProjects(client) {
  const res = await client.get('/projects');
  return unwrap(res);
}

/**
 * Selecciona el proyecto activo entre sesiones.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<any>}
 */
async function selectProject(client, projectId) {
  const res = await client.post(`/projects/${projectId}/select`, {});
  return unwrap(res);
}

/**
 * Obtiene las métricas de avance de un proyecto.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{projectName: string, percentage: number, completedTasks: number, totalTasks: number, pendingTasks: number, hasData: boolean}>}
 */
async function getProjectProgress(client, projectId) {
  const res = await client.get(`/projects/${projectId}/progress`);
  return unwrap(res);
}

/**
 * Obtiene la comparativa de productividad semanal.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{completedThisWeek: number, completedLastWeek: number, deltaPercent: number, trend: string}>}
 */
async function getWeeklyProductivity(client, projectId) {
  const res = await client.get(`/projects/${projectId}/productivity/weekly`);
  return unwrap(res);
}

/**
 * Obtiene la estimación de fecha de finalización.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{estimatedDays: number|null, estimatedDate: string|null, reason?: string}>}
 */
async function getForecast(client, projectId) {
  const res = await client.get(`/projects/${projectId}/forecast`);
  return unwrap(res);
}

/**
 * Obtiene las tareas bloqueadas o estancadas.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{total: number, items: Array<{title: string, daysStalled: number}>}|Array<{title: string, daysStalled: number}>}
 */
async function getBlockedTasks(client, projectId) {
  const res = await client.get(`/projects/${projectId}/blocked-tasks`);
  return unwrap(res);
}

/**
 * Obtiene la distribución de carga de trabajo del equipo.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{total: number, items: Array<{memberName: string, assignedCount: number}>}|Array<{memberName: string, assignedCount: number}>}
 */
async function getWorkload(client, projectId) {
  const res = await client.get(`/projects/${projectId}/workload`);
  return unwrap(res);
}

/**
 * Obtiene los integrantes del proyecto (para resolver nombres).
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @returns {Promise<{total: number, items: Array<{id: string, name: string}>}|Array<{id: string, name: string}>}
 */
async function getMembers(client, projectId) {
  const res = await client.get(`/projects/${projectId}/members`);
  return unwrap(res);
}

/**
 * Obtiene métricas de desempeño individual de un integrante.
 * @param {import('axios').AxiosInstance} client
 * @param {string} projectId
 * @param {string} memberId
 * @returns {Promise<{memberName: string, assignedCount: number, completedCount: number, inProgressCount: number, blockedCount?: number}>}
 */
async function getMemberPerformance(client, projectId, memberId) {
  const res = await client.get(`/projects/${projectId}/members/${memberId}/performance`);
  return unwrap(res);
}

module.exports = {
  createClient,
  redeemSeedPhrase,
  getMe,
  logout,
  getProjects,
  selectProject,
  getProjectProgress,
  getWeeklyProductivity,
  getForecast,
  getBlockedTasks,
  getWorkload,
  getMembers,
  getMemberPerformance,
};
