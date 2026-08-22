/**
 * Caché de datos de TMDb en Firestore (CIN-53) — algoritmo pensado para
 * reducir progresivamente las llamadas reales a la API a medida que se
 * juegan partidas, sin introducir datos obsoletos perceptibles.
 *
 * Razonamiento (del propietario del producto, ver la issue):
 * - Título/póster/reparto de una película ya estrenada son invariantes
 *   una vez la vemos — se cachean para siempre, sin TTL.
 * - Nombre/lugar/año de nacimiento de una persona son hechos biográficos
 *   fijos — también para siempre, sin TTL. Lo que SÍ cambia con el
 *   tiempo es su FILMOGRAFÍA (sigue haciendo películas), así que
 *   `personMovieCredits` es la única pieza con TTL (7 días, ver
 *   PERSON_CREDITS_CACHE_TTL_SECONDS en config/gameEngine.ts) — el
 *   resto de campos de personas viaja invariante en el mismo documento
 *   por simplicidad, sin que eso los reintroduzca como caché.
 *
 * Deliberadamente NO cacheadas: searchMovies/searchPeople (búsqueda por
 * texto libre). El texto de entrada varía demasiado (typos, formas
 * distintas de escribir el mismo nombre) para que una clave de caché
 * por texto tenga una tasa de aciertos razonable, y cachear resultados
 * de una búsqueda con errores de tipeo no aportaría nada. El pool
 * semanal (refreshTmdbPool, CIN-16) y esta caché por id cubren el resto:
 * cualquier turno que reutilice una entidad ya vista (del pool o
 * buscada antes) evita la llamada real a TMDb.
 *
 * Colecciones Firestore usadas (documento = snapshot crudo de TMDb,
 * sin transformar — igual forma que devuelve la API):
 * - tmdbCacheMovies/{id}          → TmdbMovieSummary, sin TTL.
 * - tmdbCacheMovieCredits/{id}    → { cast: [...] }, sin TTL.
 * - tmdbCachePeople/{id}          → TmdbPersonDetails, sin TTL.
 * - tmdbCachePersonCredits/{id}   → { cast: [...], actualizado_en }, TTL.
 */
import { db } from "../admin";
import { hasExceededInactivityTimeout } from "../lib/gameEngine";
import {
  fetchMovieCredits,
  fetchMovieDetails,
  fetchPersonDetails,
  fetchPersonMovieCredits,
  type TmdbMovieSummary,
  type TmdbPersonDetails,
} from "./tmdb";

type CastList = { cast: Array<{ id: number }> };

async function cachedById<T>(
  collection: string,
  id: number,
  fetchFresh: () => Promise<T>,
): Promise<T> {
  const ref = db.collection(collection).doc(String(id));
  const snapshot = await ref.get();
  if (snapshot.exists) {
    return snapshot.data() as T;
  }
  const fresh = await fetchFresh();
  await ref.set(fresh as object);
  return fresh;
}

async function cachedWithTtl<T extends object>(
  collection: string,
  id: number,
  ttlSegundos: number,
  ahoraIso: string,
  fetchFresh: () => Promise<T>,
): Promise<T> {
  const ref = db.collection(collection).doc(String(id));
  const snapshot = await ref.get();
  const cached = snapshot.data() as (T & { actualizado_en: string }) | undefined;
  if (cached && !hasExceededInactivityTimeout(cached.actualizado_en, ahoraIso, ttlSegundos)) {
    return cached;
  }
  const fresh = await fetchFresh();
  const withTimestamp = { ...fresh, actualizado_en: ahoraIso };
  await ref.set(withTimestamp);
  return withTimestamp;
}

export function getMovieDetailsCached(id: number): Promise<TmdbMovieSummary> {
  return cachedById("tmdbCacheMovies", id, () => fetchMovieDetails(id));
}

export function getMovieCreditsCached(id: number): Promise<CastList> {
  return cachedById("tmdbCacheMovieCredits", id, () => fetchMovieCredits(id));
}

export function getPersonDetailsCached(id: number): Promise<TmdbPersonDetails> {
  return cachedById("tmdbCachePeople", id, () => fetchPersonDetails(id));
}

export function getPersonMovieCreditsCached(
  id: number,
  ttlSegundos: number,
  ahoraIso: string,
): Promise<CastList> {
  return cachedWithTtl("tmdbCachePersonCredits", id, ttlSegundos, ahoraIso, () =>
    fetchPersonMovieCredits(id),
  );
}
