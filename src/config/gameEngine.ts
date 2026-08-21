/**
 * Constantes del motor de juego. Ver spec-game-engine.md — se mantienen
 * aquí, no repartidas como números mágicos, para poder ajustarlas con
 * datos de playtesting sin tocar la lógica.
 */

/** Límite de tiempo por turno en modo Clásico (segundos), fuente de verdad server-side. */
export const TURN_TIME_LIMIT_SECONDS = 25;

/** Límite de tiempo total (no por turno) en modo Contrarreloj (segundos). */
export const CONTRARRELOJ_TOTAL_TIME_LIMIT_SECONDS = 90;

/**
 * Umbral de inactividad en modo Maratón (segundos) antes de finalizar la
 * partida automáticamente. No especificado en la spec ("a definir el
 * umbral de inactividad al implementar", ver CIN-22); se fija en 5
 * minutos como valor razonable para una partida sin límite de turno.
 */
export const MARATHON_INACTIVITY_TIMEOUT_SECONDS = 300;

/** Tamaño objetivo del pool de inicio de partida (rango exigido: 500-1000). */
export const TMDB_POOL_TARGET_SIZE = 750;

/** Proporción de películas frente a actores en el pool (el resto son actores). */
export const TMDB_POOL_MOVIE_SHARE = 0.6;

/** Filtro de popularidad exigido para películas del pool. */
export const TMDB_POPULAR_MOVIE_MIN_VOTE_COUNT = 1000;

/** Tope de páginas a pedir a cada endpoint /popular al construir el pool. */
export const TMDB_POPULAR_MAX_PAGES = 50;

/**
 * Umbral de ambigüedad entre candidatos válidos (CIN-23): dos candidatos
 * se consideran "igual de probables" si el segundo tiene al menos este
 * porcentaje de la popularidad del primero. No especificado en la spec
 * ("diferencia de popularidad insignificante" sin un número — ver
 * spec-game-engine.md); se fija en 0.85 como valor razonable de
 * ingeniería: separa casos claros (un candidato domina claramente) de
 * casos genuinamente dudosos, sin disparar el diálogo de confirmación
 * en cada turno.
 */
export const AMBIGUITY_POPULARITY_RATIO = 0.85;

/** Tope de candidatos ambiguos mostrados al jugador (spec-game-engine.md: "2-3 candidatos"). */
export const MAX_AMBIGUOUS_CANDIDATES = 3;
