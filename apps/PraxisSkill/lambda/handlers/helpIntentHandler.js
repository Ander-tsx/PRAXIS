/**
 * HelpIntentHandler — AMAZON.HelpIntent.
 * Mensaje estático desde messages.js, sin llamadas a la API.
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },

  handle(handlerInput) {
    return handlerInput.responseBuilder.speak(messages.HELP).reprompt(messages.HELP).getResponse();
  },
};

module.exports = HelpIntentHandler;
