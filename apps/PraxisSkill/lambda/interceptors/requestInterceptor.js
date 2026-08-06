/**
 * Request Interceptor — Validación Automática de Sesión con GET /me.
 *
 * Flujo por petición:
 * 1. Registra timestamp de inicio (startTime).
 * 2. Lee persistent attributes (DynamoDB) -> voiceToken.
 * 3. Si existe voiceToken -> ejecuta GET /me con apiClient.
 * 4. HTTP 200 -> isAuthenticated = true, pasa datos del usuario.
 * 5. HTTP 401 / Revocado -> Borra voiceToken, displayName, lastProjectId, lastProjectName de DynamoDB,
 *    guarda persistent attributes, y deja isAuthenticated = false.
 */

const praxisApi = require('../services/praxisApi');

const RequestInterceptor = {
  async process(handlerInput) {
    const startTime = Date.now();
    let persistentAttributes = {};

    try {
      persistentAttributes = (await handlerInput.attributesManager.getPersistentAttributes()) || {};
    } catch (e) {
      console.log('[RequestInterceptor] Error leyendo atributos de DynamoDB:', e.message);
    }

    const voiceToken = persistentAttributes.voiceToken;

    if (!voiceToken) {
      handlerInput.attributesManager.setRequestAttributes({
        apiClient: null,
        isAuthenticated: false,
        user: null,
        voiceToken: null,
        startTime,
      });
      return;
    }

    // Probar validez del token con GET /me
    const apiClient = praxisApi.createClient(voiceToken);

    try {
      const user = await praxisApi.getMe(apiClient);

      // Token válido (200 OK)
      handlerInput.attributesManager.setRequestAttributes({
        apiClient,
        isAuthenticated: true,
        user,
        voiceToken,
        startTime,
      });
    } catch (error) {
      const status = error.response?.status;
      console.log(`[RequestInterceptor] GET /me falló con status ${status}: ${error.message}`);

      // Si el token es inválido o fue revocado desde el backend (401), limpiar DynamoDB
      if (status === 401 || status === 403) {
        delete persistentAttributes.voiceToken;
        delete persistentAttributes.displayName;
        delete persistentAttributes.lastProjectId;
        delete persistentAttributes.lastProjectName;

        try {
          handlerInput.attributesManager.setPersistentAttributes(persistentAttributes);
          await handlerInput.attributesManager.savePersistentAttributes();
          console.log('[RequestInterceptor] Atributos revocados eliminados de DynamoDB');
        } catch (saveError) {
          console.log(
            '[RequestInterceptor] Error al guardar atributos en DynamoDB:',
            saveError.message,
          );
        }
      }

      handlerInput.attributesManager.setRequestAttributes({
        apiClient: null,
        isAuthenticated: false,
        user: null,
        voiceToken: null,
        startTime,
      });
    }
  },
};

module.exports = RequestInterceptor;
