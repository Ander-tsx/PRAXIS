/**
 * MemberPerformanceIntentHandler — Desempeño individual de un integrante del equipo.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { findBestMatch } = require('../utils/matching');
const { buildErrorResponse } = require('../utils/errors');

const MemberPerformanceIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'MemberPerformanceIntent'
    );
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

    const memberNameSlot = Alexa.getSlotValue(handlerInput.requestEnvelope, 'memberName');

    if (!memberNameSlot) {
      return handlerInput.responseBuilder
        .speak('¿De qué integrante deseas consultar el desempeño?')
        .reprompt('Dime el nombre del integrante.')
        .getResponse();
    }

    let responseMembers;
    try {
      // 1. Obtener lista de miembros para resolver el nombre dictado
      responseMembers = await praxisApi.getMembers(apiClient, projectId);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    const members = Array.isArray(responseMembers) ? responseMembers : responseMembers?.items || [];
    const matchedMember = findBestMatch(memberNameSlot, members, 'name');

    if (!matchedMember) {
      return handlerInput.responseBuilder
        .speak(messages.MEMBER_NOT_FOUND(memberNameSlot))
        .reprompt(messages.HELP)
        .getResponse();
    }

    let perf;
    try {
      // 2. Consultar desempeño individual
      perf = await praxisApi.getMemberPerformance(apiClient, projectId, matchedMember.id);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    const speakOutput = messages.MEMBER_PERFORMANCE(
      perf.memberName || matchedMember.name,
      perf.assignedCount,
      perf.completedCount,
      perf.inProgressCount,
    );

    return handlerInput.responseBuilder.speak(speakOutput).reprompt(messages.HELP).getResponse();
  },
};

module.exports = MemberPerformanceIntentHandler;
