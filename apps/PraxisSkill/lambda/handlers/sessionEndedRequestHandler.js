/**
 * SessionEndedRequestHandler — limpieza de sesión.
 * Solo logging, sin speak (Alexa no acepta respuesta hablada aquí).
 */

const Alexa = require('ask-sdk-core');

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },

  handle(handlerInput) {
    const reason = handlerInput.requestEnvelope.request.reason;
    console.log(`[Praxis] Session ended. Reason: ${reason}`);

    if (handlerInput.requestEnvelope.request.error) {
      console.log(
        `[Praxis] Session error: ${JSON.stringify(handlerInput.requestEnvelope.request.error)}`,
      );
    }

    return handlerInput.responseBuilder.getResponse();
  },
};

module.exports = SessionEndedRequestHandler;
