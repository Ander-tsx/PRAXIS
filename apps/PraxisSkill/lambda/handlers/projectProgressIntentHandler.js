/**
 * ProjectProgressIntentHandler — Avance del proyecto.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { findBestMatch } = require('../utils/matching');
const { buildErrorResponse } = require('../utils/errors');

const ProjectProgressIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ProjectProgressIntent';
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
    let projectName = sessionAttributes.projectName;

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
      projectName = match.name;

      sessionAttributes.projectId = projectId;
      sessionAttributes.projectName = projectName;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }

    if (!projectId) {
      return handlerInput.responseBuilder
        .speak(messages.NO_ACTIVE_PROJECT)
        .reprompt(messages.NO_ACTIVE_PROJECT)
        .getResponse();
    }

    let progress;
    try {
      progress = await praxisApi.getProjectProgress(apiClient, projectId);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    const speakOutput = messages.PROJECT_PROGRESS(
      progress.projectName || projectName,
      progress.percentage,
      progress.completedTasks,
      progress.totalTasks
    );

    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt(messages.HELP)
      .getResponse();
  },
};

module.exports = ProjectProgressIntentHandler;
