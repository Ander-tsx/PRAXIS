/**
 * ErrorHandler — catch-all para excepciones no capturadas.
 * Usa errors.js para dar mensajes coherentes en lugar de un genérico.
 */

const messages = require('../constants/messages');

const ErrorHandler = {
  canHandle() {
    return true;
  },

  handle(handlerInput, error) {
    console.error(
      `[ErrorHandler Global] Error no capturado en la Skill: ${error.stack || error.message}`,
    );

    // Verificar si es un error de API con response
    if (error.response) {
      const status = error.response.status;

      if (status === 401) {
        return handlerInput.responseBuilder
          .speak(messages.ERROR_UNAUTHORIZED)
          .withLinkAccountCard()
          .getResponse();
      }

      if (status === 403) {
        return handlerInput.responseBuilder.speak(messages.ERROR_FORBIDDEN).getResponse();
      }
    }

    // Error genérico
    return handlerInput.responseBuilder
      .speak(messages.ERROR_GENERIC)
      .reprompt(messages.HELP)
      .getResponse();
  },
};

module.exports = ErrorHandler;
