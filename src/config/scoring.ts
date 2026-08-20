/**
 * Constantes de puntuación. Ver spec-scoring-leaderboard.md — configurables
 * aquí para poder ajustarlas con datos de playtesting sin redeploy de
 * lógica, en vez de vivir como números mágicos repartidos por el código.
 */

/** Puntos base por cada respuesta correcta. */
export const BASE_POINTS_PER_CORRECT_ANSWER = 100;

/** Bonus máximo por rapidez (a tiempo_restante = límite de turno completo). */
export const SPEED_BONUS_MAX_POINTS = 50;
