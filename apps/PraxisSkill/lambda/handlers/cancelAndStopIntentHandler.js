/**
 * CancelAndStopIntentHandler — AMAZON.CancelIntent y AMAZON.StopIntent.
 * CancelIntent: shouldEndSession false (sigue la conversación).
 * StopIntent: shouldEndSession true (cierra la skill).
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
        || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
  },

  handle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);

    if (intentName === 'AMAZON.StopIntent') {
      return handlerInput.responseBuilder
        .speak(messages.STOP)
        .withShouldEndSession(true)
        .getResponse();
    }

    // AMAZON.CancelIntent — mantiene la sesión abierta
    return handlerInput.responseBuilder
      .speak(messages.CANCEL)
      .reprompt(messages.HELP)
      .withShouldEndSession(false)
      .getResponse();
  },
};

module.exports = CancelAndStopIntentHandler;
