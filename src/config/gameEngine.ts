/**
 * Constantes del motor de juego. Ver spec-game-engine.md — se mantienen
 * aquí, no repartidas como números mágicos, para poder ajustarlas con
 * datos de playtesting sin tocar la lógica.
 */

/** Límite de tiempo por turno en modo Clásico (segundos), fuente de verdad server-side. */
export const TURN_TIME_LIMIT_SECONDS = 25;

/** Tamaño objetivo del pool de inicio de partida (rango exigido: 500-1000). */
export const TMDB_POOL_TARGET_SIZE = 750;

/** Proporción de películas frente a actores en el pool (el resto son actores). */
export const TMDB_POOL_MOVIE_SHARE = 0.6;

/** Filtro de popularidad exigido para películas del pool. */
export const TMDB_POPULAR_MOVIE_MIN_VOTE_COUNT = 1000;

/** Tope de páginas a pedir a cada endpoint /popular al construir el pool. */
export const TMDB_POPULAR_MAX_PAGES = 50;
