/**
 * TeamWorkloadIntentHandler — Carga de trabajo del equipo.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { buildErrorResponse } = require('../utils/errors');
const { joinNaturally } = require('../utils/speech');

const TeamWorkloadIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'TeamWorkloadIntent';
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

    try {
      const responseData = await praxisApi.getWorkload(apiClient, projectId);
      const items = Array.isArray(responseData) ? responseData : (responseData?.items || []);

      if (!items || items.length === 0) {
        return handlerInput.responseBuilder
          .speak('No hay datos de carga de trabajo registrados para este equipo.')
          .reprompt(messages.HELP)
          .getResponse();
      }

      const formattedMembers = items.map(m => messages.WORKLOAD_ITEM(m.memberName, m.assignedCount));
      const membersList = joinNaturally(formattedMembers);
      const firstMemberName = items[0].memberName;

      const speakOutput = messages.TEAM_WORKLOAD(membersList, firstMemberName);

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

module.exports = TeamWorkloadIntentHandler;
