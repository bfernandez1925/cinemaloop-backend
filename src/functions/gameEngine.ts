import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../admin";
import {
  TMDB_API_KEY,
  fetchPopularMovies,
  fetchPopularPeople,
  type TmdbMovieSummary,
  type TmdbPersonSummary,
} from "../clients/tmdb";
import {
  TMDB_POOL_MOVIE_SHARE,
  TMDB_POOL_TARGET_SIZE,
  TMDB_POPULAR_MAX_PAGES,
  TMDB_POPULAR_MOVIE_MIN_VOTE_COUNT,
} from "../config/gameEngine";
import type { PoolEntity } from "../lib/gameEngine";

function movieToPoolEntity(movie: TmdbMovieSummary): PoolEntity {
  return {
    tipo: "pelicula",
    entidad_tmdb_id: movie.id,
    nombre: movie.title,
    imagen: movie.poster_path,
  };
}

function personToPoolEntity(person: TmdbPersonSummary): PoolEntity {
  return {
    tipo: "actor",
    entidad_tmdb_id: person.id,
    nombre: person.name,
    imagen: person.profile_path,
  };
}

async function collectPopularMovies(targetCount: number): Promise<PoolEntity[]> {
  const collected: PoolEntity[] = [];
  for (let page = 1; page <= TMDB_POPULAR_MAX_PAGES && collected.length < targetCount; page++) {
    const { results, total_pages } = await fetchPopularMovies(page);
    for (const movie of results) {
      if (movie.vote_count > TMDB_POPULAR_MOVIE_MIN_VOTE_COUNT) {
        collected.push(movieToPoolEntity(movie));
      }
    }
    if (page >= total_pages) {
      break;
    }
  }
  return collected.slice(0, targetCount);
}

async function collectPopularPeople(targetCount: number): Promise<PoolEntity[]> {
  const collected: PoolEntity[] = [];
  for (let page = 1; page <= TMDB_POPULAR_MAX_PAGES && collected.length < targetCount; page++) {
    const { results, total_pages } = await fetchPopularPeople(page);
    for (const person of results) {
      collected.push(personToPoolEntity(person));
    }
    if (page >= total_pages) {
      break;
    }
  }
  return collected.slice(0, targetCount);
}

/**
 * Construye y cachea el pool de entidades "populares" de TMDb usado por
 * startGame (500-1000 entidades, ver spec-game-engine.md). Se refresca
 * semanalmente sin intervención manual; startGame solo lee de
 * `tmdbPool/current`, sin llamar a TMDb en cada partida.
 */
export const refreshTmdbPool = onSchedule(
  { schedule: "every monday 03:00", secrets: [TMDB_API_KEY] },
  async () => {
    // Los actores rellenan lo que falte hasta el tamaño objetivo si el
    // filtro de popularidad deja las películas por debajo de su cuota
    // (garantiza el tamaño total del pool, no solo el reparto exacto).
    const movieTarget = Math.round(TMDB_POOL_TARGET_SIZE * TMDB_POOL_MOVIE_SHARE);
    const movies = await collectPopularMovies(movieTarget);
    const people = await collectPopularPeople(TMDB_POOL_TARGET_SIZE - movies.length);

    await db
      .collection("tmdbPool")
      .doc("current")
      .set({
        entidades: [...movies, ...people],
        actualizado_en: new Date().toISOString(),
      });
  },
);

/**
 * Inicia una partida: elige el nodo inicial del pool cacheado y crea el
 * documento de partida. Ver spec-game-engine.md, CIN-17.
 */
export const startGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "startGame: pendiente de implementar (CIN-17).");
});

/**
 * Valida la respuesta del jugador contra TMDb y las reglas del juego.
 * Ver spec-game-engine.md, CIN-18.
 */
export const submitAnswer = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "submitAnswer: pendiente de implementar (CIN-18).");
});

/**
 * Finaliza una partida (por fallo o retirada voluntaria) y calcula sus
 * estadísticas finales. Ver spec-game-engine.md, CIN-19.
 */
export const finishGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "finishGame: pendiente de implementar (CIN-19).");
});
