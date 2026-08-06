/**
 * Resolución difusa de nombres — proyectos y miembros.
 * Los slots AMAZON.SearchQuery entregan texto libre sin normalizar.
 * Esta utilidad resuelve nombre → candidato más similar de la lista del backend.
 */

/**
 * Normaliza un string para comparación: minúsculas, sin acentos, sin espacios extra.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Calcula la similitud entre dos strings usando distancia de Levenshtein normalizada.
 * Retorna un valor entre 0 (completamente distintos) y 1 (idénticos).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Distancia de Levenshtein entre dos strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Busca el mejor candidato que coincida con la query, usando similitud difusa.
 * @param {string} query - El texto que el usuario dijo
 * @param {Array<Object>} candidates - Lista de candidatos del backend
 * @param {string} [key='name'] - Propiedad del candidato a comparar
 * @param {number} [threshold=0.6] - Umbral mínimo de similitud (0-1)
 * @returns {Object|null} - El candidato con mejor score, o null si ninguno supera el umbral
 */
function findBestMatch(query, candidates, key = 'name', threshold = 0.6) {
  if (!query || !candidates || candidates.length === 0) return null;

  const q = normalize(query);

  // Primero intentar coincidencia exacta (normalizada)
  const exactMatch = candidates.find((c) => normalize(c[key]) === q);
  if (exactMatch) return exactMatch;

  // Luego intentar que el query esté contenido en el nombre o viceversa
  const containsMatch = candidates.find((c) => {
    const n = normalize(c[key]);
    return n.includes(q) || q.includes(n);
  });
  if (containsMatch) return containsMatch;

  // Finalmente, similitud difusa
  const scored = candidates.map((c) => ({
    item: c,
    score: similarity(q, normalize(c[key])),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score >= threshold ? scored[0].item : null;
}

module.exports = { normalize, similarity, findBestMatch };
