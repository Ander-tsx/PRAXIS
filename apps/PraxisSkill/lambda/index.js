/**
 * Alexa Skill "Praxis" — Entry Point (Lambda)
 *
 * Orquesta la gestión de proyectos por voz: avance, productividad,
 * forecast, tareas bloqueadas, carga de trabajo y desempeño de miembros.
 * Autenticación mediante frase semilla y persistencia en DynamoDB.
 */

const Alexa = require('ask-sdk-core');
const { DynamoDbPersistenceAdapter } = require('ask-sdk-dynamodb-persistence-adapter');

class LocalMemoryPersistenceAdapter {
  constructor(primary) {
    this.primary = primary;
    this.memoryData = new Map();
  }

  // Helper para saber si estamos ejecutando en AWS Lambda real
  isLambdaEnvironment() {
    return !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);
  }

  async getAttributes(requestEnvelope) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      return this.memoryData.get(userId) || {};
    }
    // En AWS Lambda usamos DynamoDB directamente; si falla, lanzará el error para detectarlo
    return await this.primary.getAttributes(requestEnvelope);
  }

  async saveAttributes(requestEnvelope, attributes) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      this.memoryData.set(userId, attributes);
      return;
    }
    // En AWS Lambda guarda en DynamoDB
    await this.primary.saveAttributes(requestEnvelope, attributes);
  }

  async deleteAttributes(requestEnvelope) {
    if (!this.isLambdaEnvironment()) {
      const userId = Alexa.getUserId(requestEnvelope);
      this.memoryData.delete(userId);
      return;
    }
    // En AWS Lambda elimina de DynamoDB
    await this.primary.deleteAttributes(requestEnvelope);
  }
}

// ── Adaptador de Persistencia DynamoDB con Fallback Local ─────────────
const rawPersistenceAdapter = new DynamoDbPersistenceAdapter({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'PraxisAlexaSkillTable',
  createTable: false,
  awsClientOptions: {
    region: process.env.AWS_REGION || 'us-east-1',
  },
});

const persistenceAdapter = new LocalMemoryPersistenceAdapter(rawPersistenceAdapter);

// ── Handlers ─────────────────────────────────────────────────────────
const LaunchRequestHandler = require('./handlers/launchRequestHandler');
const ConnectSkillIntentHandler = require('./handlers/connectSkillIntentHandler');
const LogoutIntentHandler = require('./handlers/logoutIntentHandler');
const SelectBoardIntentHandler = require('./handlers/selectBoardIntentHandler');
const ProjectProgressIntentHandler = require('./handlers/projectProgressIntentHandler');
const WeeklyProductivityIntentHandler = require('./handlers/weeklyProductivityIntentHandler');
const ProjectForecastIntentHandler = require('./handlers/projectForecastIntentHandler');
const BlockedTasksIntentHandler = require('./handlers/blockedTasksIntentHandler');
const TeamWorkloadIntentHandler = require('./handlers/teamWorkloadIntentHandler');
const MemberPerformanceIntentHandler = require('./handlers/memberPerformanceIntentHandler');
const HelpIntentHandler = require('./handlers/helpIntentHandler');
const CancelAndStopIntentHandler = require('./handlers/cancelAndStopIntentHandler');
const NavigateHomeIntentHandler = require('./handlers/navigateHomeIntentHandler');
const FallbackIntentHandler = require('./handlers/fallbackIntentHandler');
const SessionEndedRequestHandler = require('./handlers/sessionEndedRequestHandler');
const ErrorHandler = require('./handlers/errorHandler');

// ── Interceptors ─────────────────────────────────────────────────────
const RequestInterceptor = require('./interceptors/requestInterceptor');
const ResponseInterceptor = require('./interceptors/responseInterceptor');

// ── Asignación del Builder ───────────────────────────────────────────
const skillBuilder = Alexa.SkillBuilders.custom()
  .withPersistenceAdapter(persistenceAdapter)
  .addRequestHandlers(
    LaunchRequestHandler,
    ConnectSkillIntentHandler,
    LogoutIntentHandler,
    SelectBoardIntentHandler,
    ProjectProgressIntentHandler,
    WeeklyProductivityIntentHandler,
    ProjectForecastIntentHandler,
    BlockedTasksIntentHandler,
    TeamWorkloadIntentHandler,
    MemberPerformanceIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    NavigateHomeIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .addRequestInterceptors(RequestInterceptor)
  .addResponseInterceptors(ResponseInterceptor)
  .withCustomUserAgent('praxis-skill/v1.0');

// Para AWS Lambda (Servidor en la nube)
exports.handler = skillBuilder.lambda();

// Para Express local (Tu server.js)
exports.skill = skillBuilder.create();
