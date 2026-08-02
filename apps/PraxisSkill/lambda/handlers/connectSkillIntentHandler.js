/**
 * ConnectSkillIntentHandler — Permite al usuario iniciar sesión mediante su frase semilla.
 *
 * Flujo:
 * 1. El usuario dice "iniciar sesión" o "mi semilla es cielo mesa puente pasto trueno".
 * 2. Si no especifica la frase semilla, la skill se la solicita.
 * 3. Ejecuta POST /api/alexa/link/redeem en el backend de Praxis.
 * 4. Al recibir respuesta exitosa, guarda voiceToken y displayName (con fallback en memoria para local).
 */

const Alexa = require('ask-sdk-core');
const messages = require('../constants/messages');
const praxisApi = require('../services/praxisApi');

const ConnectSkillIntentHandler = {
  canHandle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (requestType !== 'IntentRequest') return false;

    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    return intentName === 'ConnectSkillIntent' || intentName === 'LoginIntent';
  },

  async handle(handlerInput) {
    let seed =
      Alexa.getSlotValue(handlerInput.requestEnvelope, 'seed') ||
      Alexa.getSlotValue(handlerInput.requestEnvelope, 'SeedPhrase') ||
      Alexa.getSlotValue(handlerInput.requestEnvelope, 'phrase');

    // Si no se proporcionó la semilla, solicitarla al usuario
    if (!seed || !seed.trim()) {
      return handlerInput.responseBuilder
        .speak(messages.PROMPT_SEED_PHRASE)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }

    const sanitizedSeed = seed.trim().toLowerCase();
    const alexaUserId = Alexa.getUserId(handlerInput.requestEnvelope);
    const deviceId = handlerInput.requestEnvelope.context?.System?.device?.deviceId || null;

    console.log(`🌱 Intentando canjear semilla: "${sanitizedSeed}"`);

    try {
      // 1. Canjear frase semilla en el backend de Praxis
      const result = await praxisApi.redeemSeedPhrase(sanitizedSeed, alexaUserId, deviceId);

      const voiceToken = result?.voiceToken;
      const displayName = result?.displayName || null;

      if (!voiceToken) {
        throw new Error('No voiceToken received in redeem response');
      }

      console.log(`✅ Semilla canjeada exitosamente. Usuario: ${displayName}`);

      // 2. Guardar SIEMPRE en Atributos de Sesión (Garantiza funcionamiento en memoria local)
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes() || {};
      sessionAttributes.voiceToken = voiceToken;
      sessionAttributes.displayName = displayName;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

      // 3. Intentar persistir en DynamoDB (sin tumbar la app si no hay credenciales locales)
      try {
        const persistentAttributes = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
        persistentAttributes.voiceToken = voiceToken;
        persistentAttributes.displayName = displayName;

        handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
        await handlerInput.attributesManager.savePersistentAttributes();
      } catch (dbError) {
        console.warn('⚠️ [DynamoDB Warning] No se pudo guardar en DynamoDB (continuando con sesión en memoria):', dbError.message);
      }

      // 4. Actualizar requestAttributes para la petición actual
      const apiClient = praxisApi.createClient(voiceToken);
      handlerInput.attributesManager.setRequestAttributes({
        apiClient,
        isAuthenticated: true,
        user: { displayName, userId: result.userId },
        voiceToken,
      });

      return handlerInput.responseBuilder
        .speak(messages.LOGIN_SUCCESS(displayName))
        .reprompt(messages.HELP)
        .getResponse();

    } catch (error) {
      console.error('❌ Error en ConnectSkillIntentHandler:');
      console.error('- Mensaje:', error.message);
      console.error('- Status HTTP:', error.response?.status);
      console.error('- Respuesta Backend:', error.response?.data);
      console.error('- URL llamada:', error.config?.url);

      const status = error.response?.status;
      let speech = messages.ERROR_BAD_REQUEST;

      if (status === 410) {
        speech = messages.ERROR_GONE;
      } else if (status === 429) {
        speech = messages.ERROR_TOO_MANY_REQUESTS;
      }

      return handlerInput.responseBuilder
        .speak(speech)
        .reprompt(messages.PROMPT_SEED_PHRASE)
        .getResponse();
    }
  },
};

module.exports = ConnectSkillIntentHandler;