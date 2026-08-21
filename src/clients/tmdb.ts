import { defineSecret } from "firebase-functions/params";

/** API key de TMDb (v3 auth). Nunca se expone al cliente. */
export const TMDB_API_KEY = defineSecret("TMDB_API_KEY");

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface TmdbMovieSummary {
  id: number;
  title: string;
  popularity: number;
  vote_count: number;
  poster_path: string | null;
}

export interface TmdbPersonSummary {
  id: number;
  name: string;
  popularity: number;
  profile_path: string | null;
}

export interface TmdbPersonDetails extends TmdbPersonSummary {
  place_of_birth: string | null;
  birthday: string | null;
}

interface TmdbPage<T> {
  results: T[];
  total_pages: number;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY.value());
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDb ${path} respondió ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchPopularMovies(page: number): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch("/movie/popular", { page: String(page) });
}

/** Películas filtradas por género (CIN-54: pool infantil vía Familia/
 * Animación) — mismo shape de resultado que `/movie/popular`. */
export function discoverMoviesByGenre(
  genreIds: number[],
  page: number,
): Promise<TmdbPage<TmdbMovieSummary>> {
  return tmdbFetch("/discover/movie", { with_genres: genreIds.join(","), page: String(page) });
}

export function fetchPopularPeople(page: number): Promise<TmdbPage<TmdbPersonSummary>> {
  return tmdbFetch("/person/popular", { page: String(page) });
}

export function fetchPersonDetails(id: number): Promise<TmdbPersonDetails> {
  return tmdbFetch(`/person/${id}`);
}

/** Detalles de una película por id — usado al confirmar un candidato
 * ambiguo (CIN-23), donde ya se conoce el id exacto y no hace falta
 * buscar por texto. */
export function fetchMovieDetails(id: number): Promise<TmdbMovieSummary> {
  return tmdbFetch(`/movie/${id}`);
}

export function searchMovies(query: string): Promise<{ results: TmdbMovieSummary[] }> {
  return tmdbFetch("/search/movie", { query });
}

export function searchPeople(query: string): Promise<{ results: TmdbPersonSummary[] }> {
  return tmdbFetch("/search/person", { query });
}

/** Filmografía de un actor (películas en las que aparece como reparto). */
export function fetchPersonMovieCredits(id: number): Promise<{ cast: Array<{ id: number }> }> {
  return tmdbFetch(`/person/${id}/movie_credits`);
}

/** Un miembro del reparto tal cual lo devuelve /movie/{id}/credits — TMDb
 * ya incluye name/popularity/profile_path en cada entrada, sin necesitar
 * una llamada aparte a /person/{id} (usado para derivar el pool de
 * actores infantiles a partir del reparto de películas infantiles, CIN-54). */
export interface TmdbCastMember {
  id: number;
  name: string;
  popularity: number;
  profile_path: string | null;
}

/** Reparto de una película. */
export function fetchMovieCredits(id: number): Promise<{ cast: TmdbCastMember[] }> {
  return tmdbFetch(`/movie/${id}/credits`);
}
