/**
 * Response Interceptor — Logging de Métricas de Ejecución.
 *
 * Registra en consola:
 * - Intent procesado (o requestType)
 * - Usuario (displayName / userId / anonymized)
 * - ProjectId activo
 * - Duración total del procesamiento de la petición en milisegundos (durationMs)
 */

const Alexa = require('ask-sdk-core');

const ResponseInterceptor = {
  process(handlerInput, response) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const intentName =
      requestType === 'IntentRequest'
        ? Alexa.getIntentName(handlerInput.requestEnvelope)
        : requestType;

    const user = requestAttributes.user;
    const userIdentifier =
      user?.displayName || user?.userId || Alexa.getUserId(handlerInput.requestEnvelope);
    const activeProjectId = sessionAttributes.projectId || null;

    const startTime = requestAttributes.startTime || Date.now();
    const durationMs = Date.now() - startTime;

    console.log(
      `[ResponseInterceptor] Intent: "${intentName}" | Usuario: "${userIdentifier}" | ActiveProjectId: "${activeProjectId}" | Duración: ${durationMs}ms`,
    );

    return response;
  },
};

module.exports = ResponseInterceptor;
