/**
 * ProjectForecastIntentHandler — Pronóstico de finalización del proyecto.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { findBestMatch } = require('../utils/matching');
const { buildErrorResponse } = require('../utils/errors');

const ProjectForecastIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ProjectForecastIntent';
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
    const boardName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'boardName');

    let projectId = sessionAttributes.projectId;

    if (boardName) {
      let responseProjects;
      try {
        responseProjects = await praxisApi.getProjects(apiClient);
      } catch (error) {
        return await buildErrorResponse(handlerInput, error);
      }

      const projects = Array.isArray(responseProjects) ? responseProjects : (responseProjects?.items || []);
      const match = findBestMatch(boardName, projects, 'name');

      if (!match) {
        return handlerInput.responseBuilder
          .speak(messages.PROJECT_NOT_FOUND(boardName))
          .reprompt(messages.NO_ACTIVE_PROJECT)
          .getResponse();
      }

      projectId = match.id;
      sessionAttributes.projectId = projectId;
      sessionAttributes.projectName = match.name;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }

    if (!projectId) {
      return handlerInput.responseBuilder
        .speak(messages.NO_ACTIVE_PROJECT)
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    }

    let forecast;
    try {
      forecast = await praxisApi.getForecast(apiClient, projectId);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    if (!forecast || forecast.estimatedDays === null || forecast.estimatedDays === undefined || forecast.reason === 'INSUFFICIENT_DATA') {
      return handlerInput.responseBuilder
        .speak(messages.PROJECT_FORECAST_NO_DATA)
        .reprompt(messages.HELP)
        .getResponse();
    }

    const speakOutput = messages.PROJECT_FORECAST(forecast.estimatedDays);

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(messages.HELP)
      .getResponse();
  },
};

module.exports = ProjectForecastIntentHandler;
