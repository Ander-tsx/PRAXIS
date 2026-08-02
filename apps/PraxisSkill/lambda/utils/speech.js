/**
 * Utilidades de formateo para respuestas de voz.
 */

/**
 * Pluraliza un sustantivo según el conteo.
 * @param {number} count
 * @param {string} singular - ej. "tarea"
 * @param {string} plural   - ej. "tareas"
 * @returns {string} - ej. "1 tarea" o "5 tareas"
 */
function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Formatea un porcentaje con redondeo consistente.
 * @param {number} value
 * @returns {string} - ej. "68%"
 */
function formatPercentage(value) {
  if (value == null || isNaN(value)) return '0%';
  return `${Math.round(value)}%`;
}

/**
 * Une una lista de strings de forma natural en español.
 * @param {string[]} list
 * @returns {string} - ej. "Juan, Andrés y Sebastián"
 */
function joinNaturally(list) {
  if (!list || list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} y ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

module.exports = { pluralize, formatPercentage, joinNaturally };
