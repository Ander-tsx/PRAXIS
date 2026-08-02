/**
 * NavigateHomeIntentHandler — Navegación de regreso a la bienvenida/inicio.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { buildErrorResponse } = require('../utils/errors');
const { joinNaturally } = require('../utils/speech');

const NavigateHomeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NavigateHomeIntent';
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
        return handlerInput.responseBuilder
          .speak(messages.WELCOME_NO_PROJECTS)
          .getResponse();
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

      const namesToList = projects.slice(0, 4).map(p => p.name);
      const namesList = joinNaturally(namesToList);

      return handlerInput.responseBuilder
        .speak(messages.WELCOME_MULTIPLE_PROJECTS(namesList))
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }
  },
};

module.exports = NavigateHomeIntentHandler;
