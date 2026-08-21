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

/**
 * Caché de datos de TMDb en Firestore (CIN-53), para reducir llamadas
 * repetidas a la API según el algoritmo documentado en
 * src/lib/tmdbCache.ts. No especificado en la spec ("a definir el TTL
 * al implementar" — issue del propio propietario); se fija en 7 días,
 * el mismo ritmo que ya usa `refreshTmdbPool` para el pool general, así
 * la filmografía de una persona nunca queda desactualizada por más
 * tiempo que el resto del sistema.
 */
export const PERSON_CREDITS_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Pool infantil (CIN-54): géneros de TMDb usados para `/discover/movie`
 * en vez de `/movie/popular` — Familia (10751) y Animación (16), los
 * dos géneros de TMDb más directamente asociados a contenido apto para
 * niños. No hay un "género infantil" único en TMDb, así que se combinan
 * estos dos en vez de depender de la certificación por edad (cobertura
 * pobre para España).
 */
export const KIDS_MOVIE_GENRE_IDS = [10751, 16];

/**
 * Tamaño objetivo del pool infantil — deliberadamente menor que el pool
 * general (TMDB_POOL_TARGET_SIZE=750): es un modo más nicho, y cada
 * película descubierta cuesta una llamada adicional a /credits para
 * derivar actores (ver refreshTmdbPool), así que un pool más pequeño
 * evita disparar el volumen de llamadas semanales sin necesidad real.
 */
export const KIDS_POOL_TARGET_SIZE = 200;

/** Misma proporción película/persona que el pool general. */
export const KIDS_POOL_MOVIE_SHARE = TMDB_POOL_MOVIE_SHARE;

/** Cuántos miembros del reparto (por orden de aparición, ya viene
 * ordenado así desde TMDb) se toman de cada película infantil al
 * derivar actores — limita el pool a los protagonistas reales, no a
 * todo el reparto secundario. */
export const KIDS_POOL_CAST_PER_MOVIE = 10;
