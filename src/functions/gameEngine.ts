import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db } from "../admin";
import { ANTHROPIC_API_KEY, normalizeAnswer } from "../clients/claude";
import {
  TMDB_API_KEY,
  discoverMoviesByGenre,
  fetchMovieCredits,
  fetchPopularMovies,
  fetchPopularPeople,
  searchMovies,
  searchPeople,
  type TmdbCastMember,
  type TmdbMovieSummary,
  type TmdbPersonSummary,
} from "../clients/tmdb";
import {
  getMovieCreditsCached,
  getMovieDetailsCached,
  getPersonDetailsCached,
  getPersonMovieCreditsCached,
} from "../clients/tmdbCache";
import {
  AMBIGUITY_POPULARITY_RATIO,
  CONTRARRELOJ_TOTAL_TIME_LIMIT_SECONDS,
  KIDS_MOVIE_GENRE_IDS,
  KIDS_POOL_CAST_PER_MOVIE,
  KIDS_POOL_MOVIE_SHARE,
  KIDS_POOL_TARGET_SIZE,
  MARATHON_INACTIVITY_TIMEOUT_SECONDS,
  MAX_AMBIGUOUS_CANDIDATES,
  PERSON_CREDITS_CACHE_TTL_SECONDS,
  TMDB_POOL_MOVIE_SHARE,
  TMDB_POOL_TARGET_SIZE,
  TMDB_POPULAR_MAX_PAGES,
  TMDB_POPULAR_MOVIE_MIN_VOTE_COUNT,
  TURN_TIME_LIMIT_SECONDS,
} from "../config/gameEngine";
import { BASE_POINTS_PER_CORRECT_ANSWER } from "../config/scoring";
import { calculateSpeedBonus } from "../lib/scoring";
import {
  GAME_MODES,
  findAmbiguousCandidates,
  hasExceededInactivityTimeout,
  isAlreadyUsed,
  isInCast,
  pickMostPopular,
  summarizeTurns,
  toActorNode,
  type GameDoc,
  type GameMode,
  type GameNode,
  type PoolEntity,
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

function castMemberToPoolEntity(member: TmdbCastMember): PoolEntity {
  return {
    tipo: "actor",
    entidad_tmdb_id: member.id,
    nombre: member.name,
    imagen: member.profile_path,
  };
}

/**
 * Pool infantil (CIN-54): películas de género Familia/Animación en vez
 * de "populares" genéricas, con los actores derivados del reparto de
 * esas mismas películas — TMDb no tiene un filtro de género para
 * personas, así que no hay un equivalente a collectPopularPeople aquí.
 * Sin heurística adicional: cualquier actor del pool tiene garantizado
 * al menos una película familiar/animada conocida, precisamente la que
 * lo trajo al pool.
 */
async function collectKidsPool(
  movieTarget: number,
  peopleTarget: number,
): Promise<{ movies: PoolEntity[]; people: PoolEntity[] }> {
  const movies: PoolEntity[] = [];
  const peopleById = new Map<number, PoolEntity>();

  for (
    let page = 1;
    page <= TMDB_POPULAR_MAX_PAGES && movies.length < movieTarget && peopleById.size < peopleTarget;
    page++
  ) {
    const { results, total_pages } = await discoverMoviesByGenre(KIDS_MOVIE_GENRE_IDS, page);
    for (const movie of results) {
      if (movies.length >= movieTarget) break;
      movies.push(movieToPoolEntity(movie));

      if (peopleById.size < peopleTarget) {
        const { cast } = await fetchMovieCredits(movie.id);
        for (const member of cast.slice(0, KIDS_POOL_CAST_PER_MOVIE)) {
          if (!peopleById.has(member.id)) {
            peopleById.set(member.id, castMemberToPoolEntity(member));
          }
        }
      }
    }
    if (page >= total_pages) {
      break;
    }
  }

  return { movies, people: [...peopleById.values()].slice(0, peopleTarget) };
}

/**
 * Construye y cachea el pool de entidades "populares" de TMDb usado por
 * startGame (500-1000 entidades, ver spec-game-engine.md), junto al
 * pool infantil (CIN-54, `tmdbPool/infantil`). Se refresca semanalmente
 * sin intervención manual; startGame solo lee del pool correspondiente
 * al modo, sin llamar a TMDb en cada partida.
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

    const kidsMovieTarget = Math.round(KIDS_POOL_TARGET_SIZE * KIDS_POOL_MOVIE_SHARE);
    const kidsPool = await collectKidsPool(
      kidsMovieTarget,
      KIDS_POOL_TARGET_SIZE - kidsMovieTarget,
    );

    const actualizadoEn = new Date().toISOString();
    await db
      .collection("tmdbPool")
      .doc("current")
      .set({
        entidades: [...movies, ...people],
        actualizado_en: actualizadoEn,
      });
    await db
      .collection("tmdbPool")
      .doc("infantil")
      .set({
        entidades: [...kidsPool.movies, ...kidsPool.people],
        actualizado_en: actualizadoEn,
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

  // Infantil lee de su propio pool curado por género (CIN-54); el resto
  // de modos comparte el pool general.
  const poolDoc = modo === "infantil" ? "infantil" : "current";
  const poolSnapshot = await db.collection("tmdbPool").doc(poolDoc).get();
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
    const detalles = await getPersonDetailsCached(elegido.entidad_tmdb_id);
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
    tiempo_acumulado: 0,
    ultima_actividad: new Date().toISOString(),
  });

  return { gameId: gameRef.id, nodoActual };
});

function buildNodeFromCandidate(
  tipo: GameNode["tipo"],
  candidate: TmdbMovieSummary | TmdbPersonSummary,
): PoolEntity {
  if (tipo === "pelicula") {
    const movie = candidate as TmdbMovieSummary;
    return {
      tipo: "pelicula",
      entidad_tmdb_id: movie.id,
      nombre: movie.title,
      imagen: movie.poster_path,
    };
  }
  const person = candidate as TmdbPersonSummary;
  return {
    tipo: "actor",
    entidad_tmdb_id: person.id,
    nombre: person.name,
    imagen: person.profile_path,
  };
}

/**
 * Valida la respuesta del jugador contra TMDb y las reglas del juego:
 * busca el candidato de mayor `popularity`, comprueba que tenga
 * relación real con el nodo actual (filmografía/reparto) y que no esté
 * repetido. Ver spec-game-engine.md.
 *
 * Ambigüedad (CIN-23): si hay ≥2 candidatos válidos (en el reparto/
 * filmografía correcto, sin repetir) con popularidad similar, el turno
 * NO se resuelve ni se cuenta como fallo — se devuelven los candidatos
 * para que el jugador elija, y una segunda llamada con `candidato_id`
 * confirma cuál es. `candidato_id` se revalida igual que un candidato
 * normal (reparto/repetición), nunca se confía en él a ciegas.
 */
export const submitAnswer = onCall(
  { secrets: [TMDB_API_KEY, ANTHROPIC_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { gameId, respuesta, tiempo_respuesta_segundos, candidato_id } = request.data ?? {};
    if (typeof gameId !== "string" || gameId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "gameId es obligatorio.");
    }
    if (typeof respuesta !== "string" || respuesta.trim().length === 0) {
      throw new HttpsError("invalid-argument", "respuesta es obligatoria.");
    }
    if (typeof tiempo_respuesta_segundos !== "number" || tiempo_respuesta_segundos < 0) {
      throw new HttpsError(
        "invalid-argument",
        "tiempo_respuesta_segundos debe ser un número >= 0.",
      );
    }
    if (candidato_id !== undefined && typeof candidato_id !== "number") {
      throw new HttpsError("invalid-argument", "candidato_id debe ser un número.");
    }

    const gameRef = db.collection("games").doc(gameId);
    const gameSnapshot = await gameRef.get();
    const game = gameSnapshot.data() as GameDoc | undefined;
    if (!game) {
      throw new HttpsError("not-found", "La partida no existe.");
    }
    if (game.userId !== request.auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Esta partida no pertenece al usuario autenticado.",
      );
    }
    if (game.estado !== "en_curso") {
      throw new HttpsError("failed-precondition", "La partida ya ha finalizado.");
    }

    const ahoraIso = new Date().toISOString();

    // Modo Maratón: sin límite de turno ni total, salvo inactividad
    // prolongada (spec-game-engine.md, CIN-22).
    if (
      game.modo === "maraton" &&
      game.ultima_actividad &&
      hasExceededInactivityTimeout(
        game.ultima_actividad,
        ahoraIso,
        MARATHON_INACTIVITY_TIMEOUT_SECONDS,
      )
    ) {
      await gameRef.update({ estado: "finalizada" });
      throw new HttpsError("failed-precondition", "La partida se cerró por inactividad.");
    }

    // Si el nodo actual es un actor, la respuesta esperada es una película
    // de su filmografía, y viceversa.
    const tipoEsperado: GameNode["tipo"] = game.nodo_actual.tipo === "actor" ? "pelicula" : "actor";

    let candidato: TmdbMovieSummary | TmdbPersonSummary | null = null;
    let correcto = false;

    if (typeof candidato_id === "number") {
      // El jugador ya eligió entre los candidatos ambiguos de una
      // llamada anterior — se revalida igual que un candidato normal,
      // nunca se confía en el id a ciegas.
      const cast =
        tipoEsperado === "pelicula"
          ? (
              await getPersonMovieCreditsCached(
                game.nodo_actual.entidad_tmdb_id,
                PERSON_CREDITS_CACHE_TTL_SECONDS,
                ahoraIso,
              )
            ).cast
          : (await getMovieCreditsCached(game.nodo_actual.entidad_tmdb_id)).cast;
      if (isInCast(cast, candidato_id) && !isAlreadyUsed(game.usados, candidato_id)) {
        candidato =
          tipoEsperado === "pelicula"
            ? await getMovieDetailsCached(candidato_id)
            : await getPersonDetailsCached(candidato_id);
        correcto = true;
      }
    } else {
      // La IA normaliza el texto libre a nombres canónicos
      // (spec-ai-interpretation.md); si falla o no devuelve nada
      // razonable, se usa el texto original tal cual como único
      // "candidato" (CIN-34) — el turno nunca se bloquea por un fallo de
      // la IA. Con varios candidatos, se prueban en orden contra TMDb y
      // se usa el primero que encaje con las reglas del turno.
      const normalizado = await normalizeAnswer(respuesta);
      const textosCandidatos =
        normalizado && normalizado.candidatos.length > 0 ? normalizado.candidatos : [respuesta];

      for (const texto of textosCandidatos) {
        const resultados: Array<TmdbMovieSummary | TmdbPersonSummary> =
          tipoEsperado === "pelicula"
            ? (await searchMovies(texto)).results
            : (await searchPeople(texto)).results;
        // Filtrar por no-repetido antes de pedir el reparto/filmografía
        // (llamada de red) evita esa llamada cuando de entrada ningún
        // resultado podría ser válido.
        const noUsados = resultados.filter(
          (resultado) => !isAlreadyUsed(game.usados, resultado.id),
        );
        if (noUsados.length === 0) {
          continue;
        }
        const cast =
          tipoEsperado === "pelicula"
            ? (
                await getPersonMovieCreditsCached(
                  game.nodo_actual.entidad_tmdb_id,
                  PERSON_CREDITS_CACHE_TTL_SECONDS,
                  ahoraIso,
                )
              ).cast
            : (await getMovieCreditsCached(game.nodo_actual.entidad_tmdb_id)).cast;
        const candidatosValidos = noUsados.filter((resultado) => isInCast(cast, resultado.id));
        if (candidatosValidos.length === 0) {
          continue;
        }

        // Ambigüedad real (CIN-23): ≥2 candidatos ya validados con
        // popularidad similar — se pregunta al jugador en vez de elegir
        // el más popular en silencio.
        const ambiguos = findAmbiguousCandidates(
          candidatosValidos,
          AMBIGUITY_POPULARITY_RATIO,
          MAX_AMBIGUOUS_CANDIDATES,
        );
        if (ambiguos.length >= 2) {
          return {
            ambiguo: true as const,
            candidatos: ambiguos.map((c) => buildNodeFromCandidate(tipoEsperado, c)),
          };
        }

        candidato = pickMostPopular(candidatosValidos);
        correcto = candidato !== null;
        break;
      }
    }

    if (!correcto || !candidato) {
      await gameRef.update({ estado: "finalizada", ultima_actividad: ahoraIso });
      return { correcto: false, puntuacion_total: game.puntuacion_total };
    }

    let nuevoNodo: GameNode = buildNodeFromCandidate(tipoEsperado, candidato);
    if (nuevoNodo.tipo === "actor") {
      const detalles = await getPersonDetailsCached(nuevoNodo.entidad_tmdb_id);
      nuevoNodo = toActorNode(nuevoNodo, detalles);
    }

    // El bonus de rapidez está atado al límite de turno de 25s (Clásico
    // e Infantil, que comparte su mecánica — CIN-54); Contrarreloj y
    // Maratón no tienen límite por turno, así que no tiene sentido
    // aplicarlo — solo puntos base en esos modos.
    const bonus =
      game.modo === "clasico" || game.modo === "infantil"
        ? calculateSpeedBonus(TURN_TIME_LIMIT_SECONDS - tiempo_respuesta_segundos)
        : 0;
    const puntos = BASE_POINTS_PER_CORRECT_ANSWER + bonus;
    const puntuacionTotal = game.puntuacion_total + puntos;
    const tiempoAcumulado = (game.tiempo_acumulado ?? 0) + tiempo_respuesta_segundos;

    // Modo Contrarreloj: un único temporizador de 90s para toda la
    // partida (spec-game-engine.md, CIN-21) — se comprueba tras sumar el
    // turno actual, así que ese turno sigue contando en la puntuación.
    const agotaContrarreloj =
      game.modo === "contrarreloj" && tiempoAcumulado >= CONTRARRELOJ_TOTAL_TIME_LIMIT_SECONDS;

    const batch = db.batch();
    const turnoRef = gameRef.collection("turns").doc();
    batch.set(turnoRef, {
      orden: game.usados.length,
      tipo: nuevoNodo.tipo,
      entidad_tmdb_id: nuevoNodo.entidad_tmdb_id,
      nombre: nuevoNodo.nombre,
      tiempo_respuesta_segundos,
      correcta: true,
      puntos_obtenidos: puntos,
    });
    batch.update(gameRef, {
      nodo_actual: nuevoNodo,
      usados: [...game.usados, nuevoNodo.entidad_tmdb_id],
      puntuacion_total: puntuacionTotal,
      tiempo_acumulado: tiempoAcumulado,
      ultima_actividad: ahoraIso,
      ...(agotaContrarreloj ? { estado: "finalizada" } : {}),
    });
    await batch.commit();

    return {
      correcto: true,
      nodoActual: nuevoNodo,
      puntos,
      puntuacion_total: puntuacionTotal,
      ...(agotaContrarreloj ? { partida_finalizada: true } : {}),
    };
  },
);

/**
 * Finaliza una partida (por fallo, ya reflejado en `estado` por
 * `submitAnswer`, o por retirada voluntaria) y calcula sus estadísticas
 * finales a partir de los turnos superados. No envía nada al ranking ni
 * actualiza agregados de usuario (spec-historial.md, issue aparte). Ver
 * spec-game-engine.md.
 */
export const finishGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const { gameId } = request.data ?? {};
  if (typeof gameId !== "string" || gameId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "gameId es obligatorio.");
  }

  const gameRef = db.collection("games").doc(gameId);
  const gameSnapshot = await gameRef.get();
  const game = gameSnapshot.data() as GameDoc | undefined;
  if (!game) {
    throw new HttpsError("not-found", "La partida no existe.");
  }
  if (game.userId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "Esta partida no pertenece al usuario autenticado.");
  }

  const turnsSnapshot = await gameRef.collection("turns").get();
  const turns = turnsSnapshot.docs.map(
    (doc) => doc.data() as { tiempo_respuesta_segundos: number },
  );
  const resumen = summarizeTurns(turns);

  await gameRef.update({
    estado: "finalizada",
    enviada_a_ranking: false,
    ...resumen,
  });

  return { puntuacion_total: game.puntuacion_total, ...resumen };
});
