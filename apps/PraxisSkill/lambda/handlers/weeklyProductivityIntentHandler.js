/**
 * WeeklyProductivityIntentHandler — Productividad semanal del equipo.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { buildErrorResponse } = require('../utils/errors');

const WeeklyProductivityIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WeeklyProductivityIntent';
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
      const data = await praxisApi.getWeeklyProductivity(apiClient, projectId);

      const { completedThisWeek, completedLastWeek, deltaPercent, trend } = data;

      let speakOutput;
      if (trend === 'stable' || deltaPercent === 0) {
        speakOutput = messages.WEEKLY_PRODUCTIVITY_STABLE(completedThisWeek, completedLastWeek);
      } else {
        const trendWord = trend === 'up' ? 'subió' : 'bajó';
        const absDelta = Math.abs(deltaPercent);
        speakOutput = messages.WEEKLY_PRODUCTIVITY(completedThisWeek, completedLastWeek, trendWord, absDelta);
      }

      return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(messages.HELP)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

module.exports = WeeklyProductivityIntentHandler;
