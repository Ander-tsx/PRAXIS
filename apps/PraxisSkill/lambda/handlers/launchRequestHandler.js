/**
 * LaunchRequestHandler — Punto de entrada cuando el usuario abre la skill ("Alexa, abre Praxis").
 *
 * Flujo:
 * 1. RequestInterceptor valida previamente la sesión ejecutando GET /me.
 * 2. Si !isAuthenticated (no hay token o GET /me retornó 401):
 *    - Solicita al usuario iniciar sesión mediante frase semilla.
 * 3. Si isAuthenticated:
 *    - Obtiene la lista de proyectos (GET /projects).
 *    - Auto-selecciona si hay 1, enumera si hay varios, informa si hay 0.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');
const { buildErrorResponse } = require('../utils/errors');
const { joinNaturally } = require('../utils/speech');

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },

  async handle(handlerInput) {
    const { apiClient, isAuthenticated } = handlerInput.attributesManager.getRequestAttributes();

    // Sin sesión válida → pedir iniciar sesión por frase semilla
    if (!isAuthenticated) {
      return handlerInput.responseBuilder
        .speak(messages.NOT_AUTHENTICATED)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }

    let responseProjects;
    try {
      responseProjects = await praxisApi.getProjects(apiClient);
    } catch (error) {
      return await buildErrorResponse(handlerInput, error);
    }

    // Extraer array si viene dentro de { items: [...] } o directo
    const projects = Array.isArray(responseProjects)
      ? responseProjects
      : responseProjects?.items || [];

    if (!projects || projects.length === 0) {
      return handlerInput.responseBuilder.speak(messages.WELCOME_NO_PROJECTS).getResponse();
    }

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    if (projects.length === 1) {
      // Auto-seleccionar el único proyecto
      sessionAttributes.projectId = projects[0].id;
      sessionAttributes.projectName = projects[0].name;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      return handlerInput.responseBuilder
        .speak(messages.WELCOME_SINGLE_PROJECT(projects[0].name))
        .reprompt(messages.HELP)
        .getResponse();
    }

    // Varios proyectos → listar
    const namesToList = projects.slice(0, 4).map((p) => p.name);
    let namesList = joinNaturally(namesToList);
    if (projects.length > 4) {
      namesList += ` y ${projects.length - 4} más`;
    }

    return handlerInput.responseBuilder
      .speak(messages.WELCOME_MULTIPLE_PROJECTS(namesList))
      .reprompt(messages.NO_ACTIVE_PROJECT)
      .getResponse();
  },
};

module.exports = LaunchRequestHandler;
