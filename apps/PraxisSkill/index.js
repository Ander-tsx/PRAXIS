/**
 * Alexa Skill "Praxis" — Código Consolidado Autocontenido
 * 
 * Este archivo agrupa toda la funcionalidad del bot de voz Praxis
 * (handlers, servicios, interceptores, constantes y utilidades)
 * para facilitar su despliegue directo en la Alexa Developer Console online editor.
 */

const Alexa = require('ask-sdk-core');
const axios = require('axios');
const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');

const BASE_URL = process.env.PRAXIS_API_BASE_URL || 'http://localhost:3000/api/alexa';

// ── 1. MENSAJES Y LOCALIZACIÓN ───────────────────────────────────────

const messages = {
  NOT_AUTHENTICATED:
    'Bienvenido a Praxis. Parece que aún no has iniciado sesión. ' +
    'Puedes decir: iniciar sesión, o vincular mi cuenta con la frase seguido de tu frase semilla.',

  PROMPT_SEED_PHRASE:
    'Por favor dime tu frase semilla de Praxis. Por ejemplo: mi semilla es cielo mesa puente pasto trueno.',

  LOGIN_SUCCESS: (displayName) =>
    displayName
      ? `¡Hola ${displayName}! Tu cuenta de Praxis ha sido vinculada correctamente. ¿Con qué proyecto deseas trabajar?`
      : '¡Listo! Tu cuenta de Praxis ha sido vinculada correctamente. ¿Con qué proyecto deseas trabajar?',

  LOGOUT_SUCCESS:
    'Tu cuenta de Praxis ha sido desvinculada exitosamente. Vuelve a iniciar sesión cuando lo necesites.',

  WELCOME_SINGLE_PROJECT: (name) =>
    `Bienvenido a Praxis. Vas a trabajar con el proyecto ${name}. ` +
    `Si tienes alguna duda, solo di ayuda o prueba diciendo Quiero trabajar con ${name}.`,

  WELCOME_MULTIPLE_PROJECTS: (names) =>
    `Bienvenido a Praxis. Tienes varios proyectos activos: ${names}. ` +
    `¿Con cuál deseas trabajar? Prueba diciendo Quiero trabajar con ${names.split(', ')[0]}.`,

  WELCOME_NO_PROJECTS:
    'Bienvenido a Praxis. No tienes proyectos activos en este momento. ' +
    'Crea un proyecto en la plataforma y vuelve cuando estés listo.',

  PROJECT_SELECTED: (name) =>
    `Listo, ahora estás trabajando con el proyecto ${name}. ` +
    'Puedes preguntarme por su avance, productividad, tareas bloqueadas o el desempeño del equipo.',

  PROJECT_NOT_FOUND: (query) =>
    `No encontré un proyecto llamado ${query}. ¿Puedes repetir el nombre?`,

  NO_ACTIVE_PROJECT:
    'Primero necesito saber con qué proyecto quieres trabajar. ¿Cuál sería?',

  PROJECT_PROGRESS: (projectName, percentage, completedTasks, totalTasks) =>
    `El proyecto ${projectName} tiene un avance del ${percentage}%. ` +
    `Se han completado ${completedTasks} de ${totalTasks} tareas registradas. ` +
    'Si deseas conocer la evolución reciente del equipo, puedes decir: ' +
    '¿Cómo estuvo la productividad esta semana?',

  WEEKLY_PRODUCTIVITY: (completedThisWeek, completedLastWeek, trend, absDelta) =>
    `Esta semana se completaron ${completedThisWeek} tareas. ` +
    `La semana pasada fueron ${completedLastWeek}, por lo que el ritmo ${trend} un ${absDelta}%. ` +
    'Si deseas saber cuándo terminará el proyecto con este ritmo, puedes decir: ' +
    '¿Cuándo terminará el proyecto?',

  WEEKLY_PRODUCTIVITY_STABLE: (completedThisWeek, completedLastWeek) =>
    `Esta semana se completaron ${completedThisWeek} tareas. ` +
    `La semana pasada fueron ${completedLastWeek}, por lo que el ritmo se mantuvo estable. ` +
    'Si deseas saber cuándo terminará el proyecto con este ritmo, puedes decir: ' +
    '¿Cuándo terminará el proyecto?',

  PROJECT_FORECAST: (estimatedDays) =>
    `Manteniendo la velocidad actual, el proyecto finalizará aproximadamente en ${estimatedDays} días. ` +
    'Si deseas revisarlas, puedes decir: ¿Qué tareas están bloqueadas?',

  PROJECT_FORECAST_NO_DATA:
    'Todavía no tengo suficientes datos para estimar la fecha de finalización. ' +
    'Necesito más historial de tareas completadas para hacer un pronóstico.',

  BLOCKED_TASKS_NONE:
    'No hay tareas bloqueadas o estancadas en este momento. ¡Buen trabajo! ' +
    'Si deseas revisar la carga de trabajo del equipo, puedes decir: ' +
    '¿Cómo está distribuida la carga de trabajo?',

  BLOCKED_TASKS_ITEM: (title, daysStalled) =>
    `La tarea ${title} lleva ${daysStalled} días sin cambios.`,

  BLOCKED_TASKS_SUFFIX: (remaining) =>
    ` Y ${remaining} tareas más con retraso.`,

  BLOCKED_TASKS_FOOTER:
    ' Si deseas revisar si la carga de trabajo está equilibrada entre los integrantes del equipo, ' +
    'puedes decir: ¿Cómo está distribuida la carga de trabajo?',

  TEAM_WORKLOAD: (membersList, firstMemberName) =>
    `${membersList}. Si deseas consultar el desempeño de un integrante específico, ` +
    `puedes decir: ¿Cómo va ${firstMemberName}?`,

  WORKLOAD_ITEM: (name, count) =>
    `${name} tiene ${count} tareas asignadas`,

  MEMBER_PERFORMANCE: (name, assigned, completed, inProgress) =>
    `${name} tiene ${assigned} tareas asignadas, ${completed} completadas y ${inProgress} en progreso. ` +
    'Si deseas conocer el impacto general en el proyecto, puedes decir: ' +
    '¿Cuál es el avance del proyecto?',

  MEMBER_NOT_FOUND: (name) =>
    `No encontré a nadie llamado ${name} en este proyecto. ¿Puedes repetir el nombre?`,

  HELP:
    'Puedes decir: dame el avance del proyecto, cómo estuvo la productividad esta semana, ' +
    'qué tareas están bloqueadas, cómo está distribuida la carga de trabajo ' +
    'o cómo va un integrante del equipo. ¿Qué deseas saber?',

  CANCEL: 'Acción cancelada. ¿Hay algo más en lo que pueda ayudarte?',

  STOP: 'Hasta luego. Recuerda que puedes volver cuando necesites gestionar tus proyectos.',

  FALLBACK:
    'Lo siento, no entendí eso. Puedes decir ayuda para conocer las opciones disponibles.',

  ERROR_BAD_REQUEST:
    'La frase semilla es inválida. Revisa la secuencia de palabras en la app web de Praxis.',

  ERROR_UNAUTHORIZED:
    'Tu sesión expiró. Por favor inicia sesión nuevamente diciendo mi semilla es seguido de tu frase.',

  ERROR_FORBIDDEN:
    'No tienes permisos para consultar la información de este proyecto.',

  ERROR_NOT_FOUND:
    'No encontré ese proyecto o integrante.',

  ERROR_GONE:
    'La frase semilla ha expirado. Por favor genera una nueva frase en la app web.',

  ERROR_TOO_MANY_REQUESTS:
    'Has intentado demasiadas veces. Espera un momento antes de volver a intentar.',

  ERROR_SERVER:
    'No pude conectarme con Praxis en este momento. Inténtalo más tarde.',

  ERROR_GENERIC:
    'Ocurrió un error inesperado. Por favor intenta de nuevo.',
};

// ── 2. UTILIDADES DE BUSQUEDA Y VOZ ──────────────────────────────────

function unwrap(res) {
  if (res && res.data) {
    if (res.data.success !== undefined && res.data.data !== undefined) {
      return res.data.data;
    }
    return res.data;
  }
  return res;
}

function joinNaturally(array) {
  if (!array || array.length === 0) return '';
  if (array.length === 1) return array[0];
  if (array.length === 2) return `${array[0]} y ${array[1]}`;
  return `${array.slice(0, -1).join(', ')} y ${array[array.length - 1]}`;
}

function findBestMatch(query, list, keyName = 'name') {
  if (!query || !list || list.length === 0) return null;
  const q = query.toLowerCase().trim();
  const exact = list.find(item => item[keyName].toLowerCase() === q);
  if (exact) return exact;
  const includes = list.find(item => item[keyName].toLowerCase().includes(q) || q.includes(item[keyName].toLowerCase()));
  if (includes) return includes;
  return list[0];
}

// ── 3. SERVICIO CLIENTE API ──────────────────────────────────────────

const praxisApi = {
  createClient(voiceToken) {
    return axios.create({
      baseURL: BASE_URL,
      timeout: 4500,
      headers: {
        Authorization: `Bearer ${voiceToken}`,
        'Content-Type': 'application/json',
      },
    });
  },

  async redeemSeedPhrase(phrase, alexaUserId, deviceId) {
    const res = await axios.post(`${BASE_URL}/link/redeem`, { phrase, alexaUserId, deviceId });
    return unwrap(res);
  },

  async getMe(client) {
    const res = await client.get('/me');
    return unwrap(res);
  },

  async logout(client) {
    const res = await client.post('/logout', {});
    return unwrap(res);
  },

  async getProjects(client) {
    const res = await client.get('/projects');
    return unwrap(res);
  },

  async selectProject(client, projectId) {
    const res = await client.post(`/projects/${projectId}/select`, {});
    return unwrap(res);
  },

  async getProjectProgress(client, projectId) {
    const res = await client.get(`/projects/${projectId}/progress`);
    return unwrap(res);
  },

  async getWeeklyProductivity(client, projectId) {
    const res = await client.get(`/projects/${projectId}/productivity/weekly`);
    return unwrap(res);
  },

  async getForecast(client, projectId) {
    const res = await client.get(`/projects/${projectId}/forecast`);
    return unwrap(res);
  },

  async getBlockedTasks(client, projectId) {
    const res = await client.get(`/projects/${projectId}/blocked-tasks`);
    return unwrap(res);
  },

  async getWorkload(client, projectId) {
    const res = await client.get(`/projects/${projectId}/workload`);
    return unwrap(res);
  },

  async getMembers(client, projectId) {
    const res = await client.get(`/projects/${projectId}/members`);
    return unwrap(res);
  },

  async getMemberPerformance(client, projectId, memberId) {
    const res = await client.get(`/projects/${projectId}/members/${memberId}/performance`);
    return unwrap(res);
  },
};

// ── 4. MANEJO DE ERRORES HTTP ────────────────────────────────────────

async function clearSessionPersistence(handlerInput) {
  try {
    const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
    delete persistent.voiceToken;
    delete persistent.displayName;
    delete persistent.lastProjectId;
    delete persistent.lastProjectName;
    handlerInput.attributesManager.setPersistentAttributes(persistent);
    await handlerInput.attributesManager.savePersistentAttributes();
  } catch (e) {
    console.log('[ErrorUtils] Error limpiando atributos:', e.message);
  }
}

async function buildErrorResponse(handlerInput, error) {
  console.log(`[API Error] ${error.message} (status: ${error.response?.status})`);

  if (error.response?.status === 401) {
    await clearSessionPersistence(handlerInput);
  }

  let speech = messages.ERROR_GENERIC;
  if (error && error.response) {
    switch (error.response.status) {
      case 400: speech = messages.ERROR_BAD_REQUEST; break;
      case 401: speech = messages.ERROR_UNAUTHORIZED; break;
      case 403: speech = messages.ERROR_FORBIDDEN; break;
      case 404: speech = messages.ERROR_NOT_FOUND; break;
      case 410: speech = messages.ERROR_GONE; break;
      case 429: speech = messages.ERROR_TOO_MANY_REQUESTS; break;
      default: speech = messages.ERROR_SERVER; break;
    }
  }

  return handlerInput.responseBuilder
    .speak(speech)
    .reprompt(messages.PROMPT_SEED_PHRASE)
    .getResponse();
}

// ── 5. INTERCEPTORES ──────────────────────────────────────────────────

const RequestInterceptor = {
  async process(handlerInput) {
    const startTime = Date.now();
    let persistentAttributes = {};

    try {
      persistentAttributes = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
    } catch (e) {
      console.log('[RequestInterceptor] Error leyendo DynamoDB:', e.message);
    }

    const voiceToken = persistentAttributes.voiceToken;

    if (!voiceToken) {
      handlerInput.attributesManager.setRequestAttributes({
        apiClient: null, isAuthenticated: false, user: null, voiceToken: null, startTime
      });
      return;
    }

    const apiClient = praxisApi.createClient(voiceToken);

    try {
      const user = await praxisApi.getMe(apiClient);
      handlerInput.attributesManager.setRequestAttributes({
        apiClient, isAuthenticated: true, user, voiceToken, startTime
      });
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        delete persistentAttributes.voiceToken;
        delete persistentAttributes.displayName;
        delete persistentAttributes.lastProjectId;
        delete persistentAttributes.lastProjectName;
        try {
          handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
          await handlerInput.attributesManager.savePersistentAttributes();
        } catch (e) { }
      }
      handlerInput.attributesManager.setRequestAttributes({
        apiClient: null, isAuthenticated: false, user: null, voiceToken: null, startTime
      });
    }
  },
};

const ResponseInterceptor = {
  process(handlerInput, response) {
    const reqAttrs = handlerInput.attributesManager.getRequestAttributes();
    const sessAttrs = handlerInput.attributesManager.getSessionAttributes();
    const reqType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const intentName = reqType === 'IntentRequest' ? Alexa.getIntentName(handlerInput.requestEnvelope) : reqType;
    const userIdentifier = reqAttrs.user?.displayName || reqAttrs.user?.userId || Alexa.getUserId(handlerInput.requestEnvelope);
    const durationMs = Date.now() - (reqAttrs.startTime || Date.now());

    console.log(`[ResponseInterceptor] Intent: "${intentName}" | User: "${userIdentifier}" | Project: "${sessAttrs.projectId}" | Duration: ${durationMs}ms`);
    return response;
  },
};

// ── 6. HANDLERS ───────────────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) {
      return handlerInput.responseBuilder
        .speak(messages.NOT_AUTHENTICATED)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }
    try {
      const responseProjects = await praxisApi.getProjects(apiClient);
      const projects = Array.isArray(responseProjects) ? responseProjects : (responseProjects?.items || []);
      if (!projects || projects.length === 0) {
        return handlerInput.responseBuilder.speak(messages.WELCOME_NO_PROJECTS).getResponse();
      }
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      if (projects.length === 1) {
        sessionAttributes.projectId = projects[0].id;
        sessionAttributes.projectName = projects[0].name;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return handlerInput.responseBuilder
          .speak(messages.WELCOME_SINGLE_PROJECT(projects[0].name))
          .reprompt(messages.HELP)
          .getResponse();
      }
      const namesList = joinNaturally(projects.slice(0, 4).map(p => p.name));
      return handlerInput.responseBuilder
        .speak(messages.WELCOME_MULTIPLE_PROJECTS(namesList))
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const ConnectSkillIntentHandler = {
  canHandle(handlerInput) {
    const reqType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (reqType !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'ConnectSkillIntent' || name === 'LoginIntent';
  },
  async handle(handlerInput) {
    let seed = Alexa.getSlotValue(handlerInput.requestEnvelope, 'seed')
      || Alexa.getSlotValue(handlerInput.requestEnvelope, 'SeedPhrase');
    if (!seed || !seed.trim()) {
      return handlerInput.responseBuilder
        .speak(messages.PROMPT_SEED_PHRASE)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }
    const alexaUserId = Alexa.getUserId(handlerInput.requestEnvelope);
    const deviceId = handlerInput.requestEnvelope.context?.System?.device?.deviceId || null;
    try {
      const result = await praxisApi.redeemSeedPhrase(seed.trim().toLowerCase(), alexaUserId, deviceId);
      const voiceToken = result?.voiceToken;
      const displayName = result?.displayName || null;
      if (!voiceToken) throw new Error('No voiceToken');

      const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
      persistent.voiceToken = voiceToken;
      persistent.displayName = displayName;
      handlerInput.attributesManager.setPersistentAttributes(persistent);
      await handlerInput.attributesManager.savePersistentAttributes();

      return handlerInput.responseBuilder
        .speak(messages.LOGIN_SUCCESS(displayName))
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return handlerInput.responseBuilder
        .speak(error.response?.status === 410 ? messages.ERROR_GONE : messages.ERROR_BAD_REQUEST)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }
  },
};

const LogoutIntentHandler = {
  canHandle(handlerInput) {
    const reqType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (reqType !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'LogoutIntent' || name === 'UnlinkAccountIntent';
  },
  async handle(handlerInput) {
    const { apiClient } = handlerInput.attributesManager.getRequestAttributes();
    if (apiClient) {
      try { await praxisApi.logout(apiClient); } catch (e) { }
    }
    try {
      const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
      delete persistent.voiceToken;
      delete persistent.displayName;
      delete persistent.lastProjectId;
      delete persistent.lastProjectName;
      handlerInput.attributesManager.setPersistentAttributes(persistent);
      await handlerInput.attributesManager.savePersistentAttributes();
    } catch (e) { }
    handlerInput.attributesManager.setSessionAttributes({});
    return handlerInput.responseBuilder.speak(messages.LOGOUT_SUCCESS).getResponse();
  },
};

const SelectBoardIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SelectBoardIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) {
      return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    }
    const boardName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'boardName');
    try {
      const responseProjects = await praxisApi.getProjects(apiClient);
      const projects = Array.isArray(responseProjects) ? responseProjects : (responseProjects?.items || []);
      const match = findBestMatch(boardName, projects, 'name');
      if (!match) {
        return handlerInput.responseBuilder.speak(messages.PROJECT_NOT_FOUND(boardName)).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
      }
      try { await praxisApi.selectProject(apiClient, match.id); } catch (e) { }
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.projectId = match.id;
      sessionAttributes.projectName = match.name;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return handlerInput.responseBuilder.speak(messages.PROJECT_SELECTED(match.name)).reprompt(messages.HELP).getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const ProjectProgressIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ProjectProgressIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) {
      return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    }
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const boardName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'boardName');
    let projectId = sessionAttributes.projectId;
    let projectName = sessionAttributes.projectName;
    try {
      if (boardName) {
        const responseProjects = await praxisApi.getProjects(apiClient);
        const projects = Array.isArray(responseProjects) ? responseProjects : (responseProjects?.items || []);
        const match = findBestMatch(boardName, projects, 'name');
        if (!match) return handlerInput.responseBuilder.speak(messages.PROJECT_NOT_FOUND(boardName)).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
        projectId = match.id;
        projectName = match.name;
        sessionAttributes.projectId = projectId;
        sessionAttributes.projectName = projectName;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      }
      if (!projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
      const progress = await praxisApi.getProjectProgress(apiClient, projectId);
      return handlerInput.responseBuilder
        .speak(messages.PROJECT_PROGRESS(progress.projectName || projectName, progress.percentage, progress.completedTasks, progress.totalTasks))
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const WeeklyProductivityIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WeeklyProductivityIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
    try {
      const data = await praxisApi.getWeeklyProductivity(apiClient, sessionAttributes.projectId);
      const { completedThisWeek, completedLastWeek, deltaPercent, trend } = data;
      const speech = (trend === 'stable' || deltaPercent === 0)
        ? messages.WEEKLY_PRODUCTIVITY_STABLE(completedThisWeek, completedLastWeek)
        : messages.WEEKLY_PRODUCTIVITY(completedThisWeek, completedLastWeek, trend === 'up' ? 'subió' : 'bajó', Math.abs(deltaPercent));
      return handlerInput.responseBuilder.speak(speech).reprompt(messages.HELP).getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const ProjectForecastIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ProjectForecastIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
    try {
      const forecast = await praxisApi.getForecast(apiClient, sessionAttributes.projectId);
      if (!forecast || forecast.estimatedDays === null || forecast.reason === 'INSUFFICIENT_DATA') {
        return handlerInput.responseBuilder.speak(messages.PROJECT_FORECAST_NO_DATA).reprompt(messages.HELP).getResponse();
      }
      return handlerInput.responseBuilder.speak(messages.PROJECT_FORECAST(forecast.estimatedDays)).reprompt(messages.HELP).getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const BlockedTasksIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'BlockedTasksAnalysisIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
    try {
      const res = await praxisApi.getBlockedTasks(apiClient, sessionAttributes.projectId);
      const items = Array.isArray(res) ? res : (res?.items || []);
      if (!items || items.length === 0) return handlerInput.responseBuilder.speak(messages.BLOCKED_TASKS_NONE).reprompt(messages.HELP).getResponse();
      let speakOutput = items.slice(0, 3).map(t => messages.BLOCKED_TASKS_ITEM(t.title, t.daysStalled)).join(' ');
      if (items.length > 3) speakOutput += messages.BLOCKED_TASKS_SUFFIX(items.length - 3);
      speakOutput += messages.BLOCKED_TASKS_FOOTER;
      return handlerInput.responseBuilder.speak(speakOutput).reprompt(messages.HELP).getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const TeamWorkloadIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TeamWorkloadIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
    try {
      const res = await praxisApi.getWorkload(apiClient, sessionAttributes.projectId);
      const items = Array.isArray(res) ? res : (res?.items || []);
      if (!items || items.length === 0) return handlerInput.responseBuilder.speak('No hay datos de carga de trabajo.').reprompt(messages.HELP).getResponse();
      const list = joinNaturally(items.map(m => messages.WORKLOAD_ITEM(m.memberName, m.assignedCount)));
      return handlerInput.responseBuilder.speak(messages.TEAM_WORKLOAD(list, items[0].memberName)).reprompt(messages.HELP).getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const MemberPerformanceIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'MemberPerformanceIntent';
  },
  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();
    if (!isAuthenticated) return handlerInput.responseBuilder.speak(messages.NOT_AUTHENTICATED).reprompt(messages.PROMPT_SEED_PHRASE).getResponse();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.projectId) return handlerInput.responseBuilder.speak(messages.NO_ACTIVE_PROJECT).reprompt(messages.NO_ACTIVE_PROJECT).getResponse();
    const memberNameSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'memberName');
    if (!memberNameSlot) return handlerInput.responseBuilder.speak('¿De qué integrante deseas conocer el desempeño?').reprompt('Dime el nombre.').getResponse();
    try {
      const res = await praxisApi.getMembers(apiClient, sessionAttributes.projectId);
      const members = Array.isArray(res) ? res : (res?.items || []);
      const matched = findBestMatch(memberNameSlot, members, 'name');
      if (!matched) return handlerInput.responseBuilder.speak(messages.MEMBER_NOT_FOUND(memberNameSlot)).reprompt(messages.HELP).getResponse();
      const perf = await praxisApi.getMemberPerformance(apiClient, sessionAttributes.projectId, matched.id);
      return handlerInput.responseBuilder
        .speak(messages.MEMBER_PERFORMANCE(perf.memberName || matched.name, perf.assignedCount, perf.completedCount, perf.inProgressCount))
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak(messages.HELP).reprompt(messages.HELP).getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const isStop = Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent';
    return handlerInput.responseBuilder.speak(isStop ? messages.STOP : messages.CANCEL).getResponse();
  },
};

const NavigateHomeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NavigateHomeIntent';
  },
  async handle(handlerInput) {
    return LaunchRequestHandler.handle(handlerInput);
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak(messages.FALLBACK).reprompt(messages.HELP).getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() { return true; },
  async handle(handlerInput, error) {
    return await buildErrorResponse(handlerInput, error);
  },
};

class LocalMemoryPersistenceAdapter {
  constructor(primary) {
    this.primary = primary;
    this.memoryData = new Map();
  }

  // Helper para saber si estamos ejecutando en AWS Lambda real
  isLambdaEnvironment() {
    return !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
  }

  async getAttributes(requestEnvelope) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      return this.memoryData.get(userId) || {};
    }
    // En AWS Lambda usamos DynamoDB directamente; si falla, lanzará el error para detectarlo
    return await this.primary.getAttributes(requestEnvelope);
  }

  async saveAttributes(requestEnvelope, attributes) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      this.memoryData.set(userId, attributes);
      return;
    }
    // En AWS Lambda guarda en DynamoDB
    await this.primary.saveAttributes(requestEnvelope, attributes);
  }

  async deleteAttributes(requestEnvelope) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      this.memoryData.delete(userId);
      return;
    }
    // En AWS Lambda elimina de DynamoDB
    await this.primary.deleteAttributes(requestEnvelope);
  }
}

const rawPersistenceAdapter = new DynamoDbPersistenceAdapter({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'PraxisAlexaSkillTable',
  createTable: true,
});

const persistenceAdapter = new LocalMemoryPersistenceAdapter(rawPersistenceAdapter);

exports.handler = Alexa.SkillBuilders.custom()
  .withPersistenceAdapter(persistenceAdapter)
  .addRequestHandlers(
    LaunchRequestHandler,
    ConnectSkillIntentHandler,
    LogoutIntentHandler,
    SelectBoardIntentHandler,
    ProjectProgressIntentHandler,
    WeeklyProductivityIntentHandler,
    ProjectForecastIntentHandler,
    BlockedTasksIntentHandler,
    TeamWorkloadIntentHandler,
    MemberPerformanceIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    NavigateHomeIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .addRequestInterceptors(RequestInterceptor)
  .addResponseInterceptors(ResponseInterceptor)
  .withCustomUserAgent('praxis-skill/v1.0')
  .lambda();
