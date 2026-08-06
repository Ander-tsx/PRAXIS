/**
 * BlockedTasksIntentHandler — Tareas bloqueadas o estancadas del proyecto.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { buildErrorResponse } = require('../utils/errors');

const BlockedTasksIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'BlockedTasksAnalysisIntent';
  },

  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();

    if (!isAuthenticated) {
      return handlerInput.responseBuilder
        .speak(messages.NOT_AUTHENTICATED)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const projectId = sessionAttributes.projectId;

    if (!projectId) {
      return handlerInput.responseBuilder
        .speak(messages.NO_ACTIVE_PROJECT)
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    }

    let responseData;
    try {
      responseData = await praxisApi.getBlockedTasks(apiClient, projectId);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    const items = Array.isArray(responseData) ? responseData : (responseData?.items || []);

    if (!items || items.length === 0) {
      return handlerInput.responseBuilder
        .speak(messages.BLOCKED_TASKS_NONE)
        .reprompt(messages.HELP)
        .getResponse();
    }

    // Máximo 3 tareas principales
    const topTasks = items.slice(0, 3);
    let speakOutput = topTasks
      .map(task => messages.BLOCKED_TASKS_ITEM(task.title, task.daysStalled))
      .join(' ');

    if (items.length > 3) {
      speakOutput += messages.BLOCKED_TASKS_SUFFIX(items.length - 3);
    }

    speakOutput += messages.BLOCKED_TASKS_FOOTER;

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(messages.HELP)
      .getResponse();
  },
};

module.exports = BlockedTasksIntentHandler;
