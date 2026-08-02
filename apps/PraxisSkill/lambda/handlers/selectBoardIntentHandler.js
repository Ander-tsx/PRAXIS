/**
 * SelectBoardIntentHandler — Permite al usuario seleccionar un proyecto activo.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { findBestMatch } = require('../utils/matching');
const { buildErrorResponse } = require('../utils/errors');

const SelectBoardIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SelectBoardIntent';
  },

  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();

    if (!isAuthenticated) {
      return handlerInput.responseBuilder
        .speak(messages.NOT_AUTHENTICATED)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }

    const dialogState = Alexa.getDialogState(handlerInput.requestEnvelope);
    if (dialogState !== 'COMPLETED') {
      return handlerInput.responseBuilder
        .addDelegateDirective()
        .getResponse();
    }

    const boardName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'boardName');

    if (!boardName) {
      return handlerInput.responseBuilder
        .speak(messages.NO_ACTIVE_PROJECT)
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    }

    try {
      const responseProjects = await praxisApi.getProjects(apiClient);
      const projects = Array.isArray(responseProjects) ? responseProjects : (responseProjects?.items || []);
      const match = findBestMatch(boardName, projects, 'name');

      if (!match) {
        return handlerInput.responseBuilder
          .speak(messages.PROJECT_NOT_FOUND(boardName))
          .reprompt(messages.NO_ACTIVE_PROJECT)
          .getResponse();
      }

      // Notificar al backend la selección
      try {
        await praxisApi.selectProject(apiClient, match.id);
      } catch (e) {
        console.log('[SelectBoard] Error notificando selección al backend:', e.message);
      }

      // Guardar proyecto seleccionado en la sesión actual y en DynamoDB para futuras sesiones
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      sessionAttributes.projectId = match.id;
      sessionAttributes.projectName = match.name;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      try {
        const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
        persistent.lastProjectId = match.id;
        persistent.lastProjectName = match.name;
        handlerInput.attributesManager.setPersistentAttributes(persistent);
        await handlerInput.attributesManager.savePersistentAttributes();
      } catch (e) {
        console.log('[SelectBoard] Error guardando lastProjectId en DynamoDB:', e.message);
      }

      return handlerInput.responseBuilder
        .speak(messages.PROJECT_SELECTED(match.name))
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

module.exports = SelectBoardIntentHandler;
