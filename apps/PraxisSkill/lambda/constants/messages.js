/**
 * Mensajes centralizados para la skill Praxis.
 * Todos los strings de respuesta de voz están aquí para facilitar
 * mantenimiento, localización y consistencia.
 */

module.exports = {
  // ── Autenticación por Frase Semilla ───────────────────────────────
  NOT_AUTHENTICATED:
    'Bienvenido a Praxis. Parece que aún no has iniciado sesión. ' +
    'Puedes decir: iniciar sesión, o vincular mi cuenta con la frase seguido de tu frase semilla.',

  PROMPT_SEED_PHRASE:
    'Por favor dime tu frase semilla de Praxis. Por ejemplo: mi semilla es cielo mesa puente pasto trueno.',

  LOGIN_SUCCESS: (displayName) =>
    displayName
      ? `¡Hola ${displayName}! Tu cuenta de Praxis ha sido vinculada correctamente. ¿Con qué proyecto deseas trabajar?`
      : '¡Listo! Tu cuenta de Praxis ha sido vinculada correctamente. ¿Con qué proyecto deseas trabajar?',

  LOGOUT_SUCCESS:
    'Tu cuenta de Praxis ha sido desvinculada exitosamente. Vuelve a iniciar sesión cuando lo necesites.',

  // ── Launch ──────────────────────────────────────────────────────────
  WELCOME_SINGLE_PROJECT: (name) =>
    `Bienvenido a Praxis. Vas a trabajar con el proyecto ${name}. ` +
    `Si tienes alguna duda, solo di ayuda o prueba diciendo Quiero trabajar con ${name}.`,

  WELCOME_MULTIPLE_PROJECTS: (names) =>
    `Bienvenido a Praxis. Tienes varios proyectos activos: ${names}. ` +
    `¿Con cuál deseas trabajar? Prueba diciendo Quiero trabajar con ${names.split(', ')[0]}.`,

  WELCOME_NO_PROJECTS:
    'Bienvenido a Praxis. No tienes proyectos activos en este momento. ' +
    'Crea un proyecto en la plataforma y vuelve cuando estés listo.',

  // ── Selección de proyecto ──────────────────────────────────────────
  PROJECT_SELECTED: (name) =>
    `Listo, ahora estás trabajando con el proyecto ${name}. ` +
    'Puedes preguntarme por su avance, productividad, tareas bloqueadas o el desempeño del equipo.',

  PROJECT_NOT_FOUND: (query) =>
    `No encontré un proyecto llamado ${query}. ¿Puedes repetir el nombre?`,

  NO_ACTIVE_PROJECT:
    'Primero necesito saber con qué proyecto quieres trabajar. ¿Cuál sería?',

  // ── Avance del proyecto ────────────────────────────────────────────
  PROJECT_PROGRESS: (projectName, percentage, completedTasks, totalTasks) =>
    `El proyecto ${projectName} tiene un avance del ${percentage}%. ` +
    `Se han completado ${completedTasks} de ${totalTasks} tareas registradas. ` +
    'Si deseas conocer la evolución reciente del equipo, puedes decir: ' +
    '¿Cómo estuvo la productividad esta semana?',

  // ── Productividad semanal ──────────────────────────────────────────
  WEEKLY_PRODUCTIVITY: (completedThisWeek, completedLastWeek, trend, absDelta) =>
    `Esta semana se completaron ${completedThisWeek} tareas. ` +
    `La semana pasada fueron ${completedLastWeek}, por lo que el ritmo ${trend} un ${absDelta}%. ` +
    'Si deseas saber cuándo terminará el proyecto con este ritmo, puedes decir: ' +
    '¿Cuándo terminará el proyecto?',

  WEEKLY_PRODUCTIVITY_STABLE: (completedThisWeek, completedLastWeek) =>
    `Esta semana se completaron ${completedThisWeek} tareas. ` +
    `La semana pasada fueron ${completedLastWeek}, por lo que el ritmo se mantuvo estable. ` +
    'Si deseas saber cuándo terminará el proyecto con este ritmo, puedes decir: ' +
    '¿Cuándo terminará el proyecto?',

  // ── Forecast ───────────────────────────────────────────────────────
  PROJECT_FORECAST: (estimatedDays) =>
    `Manteniendo la velocidad actual, el proyecto finalizará aproximadamente en ${estimatedDays} días. ` +
    'Si deseas revisarlas, puedes decir: ¿Qué tareas están bloqueadas?',

  PROJECT_FORECAST_NO_DATA:
    'Todavía no tengo suficientes datos para estimar la fecha de finalización. ' +
    'Necesito más historial de tareas completadas para hacer un pronóstico.',

  // ── Tareas bloqueadas ──────────────────────────────────────────────
  BLOCKED_TASKS_NONE:
    'No hay tareas bloqueadas o estancadas en este momento. ¡Buen trabajo! ' +
    'Si deseas revisar la carga de trabajo del equipo, puedes decir: ' +
    '¿Cómo está distribuida la carga de trabajo?',

  BLOCKED_TASKS_ITEM: (title, daysStalled) =>
    `La tarea ${title} lleva ${daysStalled} días sin cambios.`,

  BLOCKED_TASKS_SUFFIX: (remaining) =>
    ` Y ${remaining} tareas más con retraso.`,

  BLOCKED_TASKS_FOOTER:
    ' Si deseas revisar si la carga de trabajo está equilibrada entre los integrantes del equipo, ' +
    'puedes decir: ¿Cómo está distribuida la carga de trabajo?',

  // ── Carga de trabajo ───────────────────────────────────────────────
  TEAM_WORKLOAD: (membersList, firstMemberName) =>
    `${membersList}. Si deseas consultar el desempeño de un integrante específico, ` +
    `puedes decir: ¿Cómo va ${firstMemberName}?`,

  WORKLOAD_ITEM: (name, count) =>
    `${name} tiene ${count} tareas asignadas`,

  // ── Desempeño de miembro ───────────────────────────────────────────
  MEMBER_PERFORMANCE: (name, assigned, completed, inProgress) =>
    `${name} tiene ${assigned} tareas asignadas, ${completed} completadas y ${inProgress} en progreso. ` +
    'Si deseas conocer el impacto general en el proyecto, puedes decir: ' +
    '¿Cuál es el avance del proyecto?',

  MEMBER_NOT_FOUND: (name) =>
    `No encontré a nadie llamado ${name} en este proyecto. ¿Puedes repetir el nombre?`,

  // ── Ayuda ──────────────────────────────────────────────────────────
  HELP:
    'Puedes decir: dame el avance del proyecto, cómo estuvo la productividad esta semana, ' +
    'cuándo terminará el proyecto, qué tareas están bloqueadas, cómo está distribuida la carga de trabajo ' +
    'o cómo va un integrante como Carlos. ¿Qué deseas saber?',

  // ── Cancel / Stop ──────────────────────────────────────────────────
  CANCEL: 'Acción cancelada. ¿Hay algo más en lo que pueda ayudarte?',

  STOP: 'Hasta luego. Recuerda que puedes volver cuando necesites gestionar tus proyectos.',

  // ── Fallback ───────────────────────────────────────────────────────
  FALLBACK:
    'Lo siento, no entendí eso. Puedes decir ayuda para conocer las opciones disponibles.',

  // ── Tabla de Errores HTTP Especificados ─────────────────────────────
  ERROR_BAD_REQUEST:
    'La frase semilla es inválida. Revisa la secuencia de palabras en la app web de Praxis.',

  ERROR_UNAUTHORIZED:
    'Tu sesión expiró. Por favor inicia sesión nuevamente diciendo mi semilla es seguido de tu frase.',

  ERROR_FORBIDDEN:
    'No tienes permisos para consultar la información de este proyecto.',

  ERROR_NOT_FOUND:
    'No encontré ese proyecto o integrante.',

  ERROR_GONE:
    'La frase semilla ha expirado. Por favor genera una nueva frase en la app web.',

  ERROR_TOO_MANY_REQUESTS:
    'Has intentado demasiadas veces. Espera un momento antes de volver a intentar.',

  ERROR_SERVER:
    'No pude conectarme con Praxis en este momento. Inténtalo más tarde.',

  ERROR_GENERIC:
    'Ocurrió un error inesperado. Por favor intenta de nuevo.',
};
