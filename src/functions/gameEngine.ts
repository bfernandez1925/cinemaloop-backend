import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../admin";
import {
  TMDB_API_KEY,
  fetchPersonDetails,
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
import {
  GAME_MODES,
  type GameMode,
  type GameNode,
  type PoolEntity,
  toActorNode,
} from "../lib/gameEngine";

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

function isGameMode(value: unknown): value is GameMode {
  return typeof value === "string" && (GAME_MODES as string[]).includes(value);
}

/**
 * Inicia una partida: elige el nodo inicial del pool cacheado (y lo
 * enriquece con país/año si es actor) y crea el documento de partida.
 * Ver spec-game-engine.md.
 */
export const startGame = onCall({ secrets: [TMDB_API_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const modo = request.data?.modo;
  if (!isGameMode(modo)) {
    throw new HttpsError("invalid-argument", `modo debe ser uno de: ${GAME_MODES.join(", ")}.`);
  }

  const poolSnapshot = await db.collection("tmdbPool").doc("current").get();
  const entidades = (poolSnapshot.data()?.entidades ?? []) as PoolEntity[];
  if (entidades.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "El pool de inicio de partida todavía no se ha generado.",
    );
  }

  const elegido = entidades[Math.floor(Math.random() * entidades.length)];
  if (!elegido) {
    throw new HttpsError("internal", "No se pudo elegir un nodo inicial del pool.");
  }

  let nodoActual: GameNode = elegido;
  if (elegido.tipo === "actor") {
    const detalles = await fetchPersonDetails(elegido.entidad_tmdb_id);
    nodoActual = toActorNode(elegido, detalles);
  }

  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId: request.auth.uid,
    modo,
    estado: "en_curso",
    fecha: new Date().toISOString(),
    nodo_actual: nodoActual,
    usados: [nodoActual.entidad_tmdb_id],
    puntuacion_total: 0,
  });

  return { gameId: gameRef.id, nodoActual };
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
