/**
 * Mapeo de errores HTTP → mensajes de voz sin Account Linking.
 * Limpieza de sesión en DynamoDB cuando el backend responde 401.
 */

const messages = require('../constants/messages');

/**
 * Limpia los atributos persistentes de DynamoDB cuando el token es inválido/revocado (HTTP 401).
 * @param {Object} handlerInput
 */
async function clearSessionPersistence(handlerInput) {
  try {
    const persistent = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
    delete persistent.voiceToken;
    delete persistent.displayName;
    delete persistent.lastProjectId;
    delete persistent.lastProjectName;
    handlerInput.attributesManager.setPersistentAttributes(persistent);
    await handlerInput.attributesManager.savePersistentAttributes();
  } catch (e) {
    console.log('[ErrorUtils] Error al limpiar atributos en DynamoDB:', e.message);
  }
}

/**
 * Determina el mensaje de voz apropiado para un error HTTP según la tabla especificada.
 * @param {Error} error - Error de axios u otro
 * @returns {string}
 */
function handleApiError(error) {
  if (error && error.response) {
    const status = error.response.status;

    switch (status) {
      case 400:
        return messages.ERROR_BAD_REQUEST;
      case 401:
        return messages.ERROR_UNAUTHORIZED;
      case 403:
        return messages.ERROR_FORBIDDEN;
      case 404:
        return messages.ERROR_NOT_FOUND;
      case 410:
        return messages.ERROR_GONE;
      case 429:
        return messages.ERROR_TOO_MANY_REQUESTS;
      default:
        return messages.ERROR_SERVER;
    }
  }

  // Timeout o error de red (sin response)
  if (error && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
    return messages.ERROR_SERVER;
  }

  // Error genérico
  return messages.ERROR_GENERIC;
}

/**
 * Construye la respuesta de Alexa a partir de un error API.
 * Si es 401, limpia automáticamente la sesión guardada en DynamoDB.
 * @param {Object} handlerInput - El handlerInput del SDK de Alexa
 * @param {Error} error - Error capturado
 * @returns {Promise<Object>} - Respuesta de Alexa
 */
async function buildErrorResponse(handlerInput, error) {
  console.log(`[API Error] ${error.message} (status: ${error.response?.status})`);

  if (error.response?.status === 401) {
    await clearSessionPersistence(handlerInput);
  }

  const speech = handleApiError(error);

  return handlerInput.responseBuilder
    .speak(speech)
    .reprompt(messages.PROMPT_SEED_PHRASE)
    .getResponse();
}

module.exports = {
  handleApiError,
  buildErrorResponse,
  clearSessionPersistence,
};
