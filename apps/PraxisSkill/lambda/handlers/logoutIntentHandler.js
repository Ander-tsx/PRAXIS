/**
 * LogoutIntentHandler — Cierre de sesión y revocación del voiceToken.
 *
 * Flujo:
 * 1. Invoca POST /api/alexa/logout en el backend para revocar el token de voz.
 * 2. Elimina voiceToken, displayName, lastProjectId y lastProjectName de DynamoDB.
 * 3. Limpia los atributos de sesión.
 * 4. Responde confirmando la desvinculación al usuario.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');

const LogoutIntentHandler = {
  canHandle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (requestType !== 'IntentRequest') return false;

    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intentName === 'LogoutIntent' || intentName === 'UnlinkAccountIntent';
  },

  async handle(handlerInput) {
    const { apiClient } = handlerInput.attributesManager.getRequestAttributes();

    // Invocar POST /logout en el backend si tenemos cliente API activo
    if (apiClient) {
      try {
        await praxisApi.logout(apiClient);
        console.log('[LogoutIntentHandler] Sesión revocada exitosamente en el backend');
      } catch (error) {
        console.log('[LogoutIntentHandler] Error al invocar POST /logout:', error.message);
      }
    }

    // Borrar campos persistentes de DynamoDB
    try {
      const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
      delete persistent.voiceToken;
      delete persistent.displayName;
      delete persistent.lastProjectId;
      delete persistent.lastProjectName;

      handlerInput.attributesManager.setPersistentAttributes(persistent);
      await handlerInput.attributesManager.savePersistentAttributes();
    } catch (e) {
      console.log('[LogoutIntentHandler] Error al limpiar DynamoDB:', e.message);
    }

    // Limpiar sesión actual
    handlerInput.attributesManager.setSessionAttributes({});

    return handlerInput.responseBuilder
      .speak(messages.LOGOUT_SUCCESS)
      .getResponse();
  },
};

module.exports = LogoutIntentHandler;
