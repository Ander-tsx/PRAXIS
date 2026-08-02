/**
 * FallbackIntentHandler — AMAZON.FallbackIntent.
 * Mensaje en español para intents no reconocidos.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },

  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak(messages.FALLBACK)
      .reprompt(messages.HELP)
      .getResponse();
  },
};

module.exports = FallbackIntentHandler;
