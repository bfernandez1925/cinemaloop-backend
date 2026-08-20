import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { LEADERBOARD_PAGE_SIZE } from "../config/scoring";
import type { GameDoc } from "../lib/gameEngine";
import { applyGameToAggregates, type UserAggregates } from "../lib/historial";

interface LeaderboardEntry {
  userId: string;
  nombre_usuario: string | null;
  puntuacion: number;
  nodos_alcanzados: number;
  tiempo_medio_respuesta: number;
  tiempo_total: number;
  fecha: string;
}

function leaderboardQuery() {
  return db.collection("leaderboard").orderBy("puntuacion", "desc").orderBy("tiempo_total", "asc");
}

async function getOwnRanking(uid: string) {
  const bestSnapshot = await leaderboardQuery().where("userId", "==", uid).limit(1).get();
  const bestDoc = bestSnapshot.docs[0];
  if (!bestDoc) {
    return null;
  }
  const best = bestDoc.data() as LeaderboardEntry;

  const [aboveScore, tiedButFaster] = await Promise.all([
    db.collection("leaderboard").where("puntuacion", ">", best.puntuacion).count().get(),
    db
      .collection("leaderboard")
      .where("puntuacion", "==", best.puntuacion)
      .where("tiempo_total", "<", best.tiempo_total)
      .count()
      .get(),
  ]);

  const posicion = aboveScore.data().count + tiedButFaster.data().count + 1;

  return { posicion, ...best };
}

async function getOwnedFinishedGame(gameId: unknown, uid: string) {
  if (typeof gameId !== "string" || gameId.trim().length === 0) {
    throw new HttpsError("invalid-argument", "gameId es obligatorio.");
  }

  const gameRef = db.collection("games").doc(gameId);
  const gameSnapshot = await gameRef.get();
  const game = gameSnapshot.data() as GameDoc | undefined;
  if (!game) {
    throw new HttpsError("not-found", "La partida no existe.");
  }
  if (game.userId !== uid) {
    throw new HttpsError("permission-denied", "Esta partida no pertenece al usuario autenticado.");
  }
  if (game.estado !== "finalizada") {
    throw new HttpsError("failed-precondition", "La partida todavía no ha finalizado.");
  }

  return { gameRef, game };
}

/**
 * Actualiza los agregados de `users/{uid}` (`mejor_puntuacion`,
 * `cadena_mas_larga`, `partidas_jugadas`) a partir de una partida
 * guardada o enviada, una sola vez por partida (idempotente vía el
 * flag `agregados_actualizados`, dentro de una transacción para
 * evitar una carrera si dos llamadas llegan a la vez). Nunca se llama
 * desde `finishGame`, para no contar partidas que luego se descartan.
 * Ver spec-historial.md.
 */
async function applyUserAggregatesOnce(
  gameRef: FirebaseFirestore.DocumentReference,
  uid: string,
  game: GameDoc,
): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const gameSnapshot = await transaction.get(gameRef);
    if ((gameSnapshot.data() as GameDoc | undefined)?.agregados_actualizados) {
      return;
    }

    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await transaction.get(userRef);
    const current = userSnapshot.data() as Partial<UserAggregates> | undefined;

    const actualizados = applyGameToAggregates(
      {
        mejor_puntuacion: current?.mejor_puntuacion ?? 0,
        cadena_mas_larga: current?.cadena_mas_larga ?? 0,
        partidas_jugadas: current?.partidas_jugadas ?? 0,
      },
      { puntuacion_total: game.puntuacion_total, nodos_alcanzados: game.nodos_alcanzados ?? 0 },
    );

    transaction.update(userRef, actualizados);
    transaction.update(gameRef, { agregados_actualizados: true });
  });
}

/**
 * Envía la puntuación de una partida al ranking global: crea
 * `leaderboard/{gameId}` y marca `enviada_a_ranking: true`. La partida
 * permanece también en el historial del usuario. Actualiza además los
 * agregados de usuario (enviar cuenta también como partida jugada).
 * Ver spec-scoring-leaderboard.md.
 */
export const submitToLeaderboard = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const { gameRef, game } = await getOwnedFinishedGame(request.data?.gameId, request.auth.uid);
  const gameId = gameRef.id;

  const userSnapshot = await db.collection("users").doc(request.auth.uid).get();
  const nombreUsuario = (userSnapshot.data()?.nombre_usuario as string | null | undefined) ?? null;

  await db
    .collection("leaderboard")
    .doc(gameId)
    .set({
      userId: request.auth.uid,
      nombre_usuario: nombreUsuario,
      puntuacion: game.puntuacion_total,
      nodos_alcanzados: game.nodos_alcanzados ?? 0,
      tiempo_medio_respuesta: game.tiempo_medio_respuesta ?? 0,
      tiempo_total: game.tiempo_total ?? 0,
      fecha: new Date().toISOString(),
    });

  await gameRef.update({ enviada_a_ranking: true });
  await applyUserAggregatesOnce(gameRef, request.auth.uid, game);

  return { ok: true };
});

/**
 * Confirma "Guardar partida": no hace falta persistir nada de la
 * partida (ya está completa desde `finishGame`), pero es el único
 * momento en que el backend sabe que el usuario decidió guardarla en
 * vez de descartarla — así que es donde se disparan los agregados de
 * usuario. No existe en la lista canónica de Cloud Functions de
 * cinemaloop_spec.md porque esa spec no anticipó este hueco; ver
 * comentario de cierre de CIN-30 para el porqué.
 */
export const saveGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const { gameRef, game } = await getOwnedFinishedGame(request.data?.gameId, request.auth.uid);
  await applyUserAggregatesOnce(gameRef, request.auth.uid, game);

  return { ok: true };
});

/**
 * Descarta una partida por completo: borra `games/{gameId}` y su
 * subcolección `turns`. No deja rastro en historial ni en ranking.
 * Ver spec-scoring-leaderboard.md.
 */
export const discardGame = onCall(async (request) => {
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

  await db.recursiveDelete(gameRef);

  return { ok: true };
});

/**
 * Devuelve el ranking global paginado, con la posición del usuario
 * autenticado aunque no esté en la página solicitada.
 * Ver spec-scoring-leaderboard.md, CIN-27.
 */
export const getLeaderboard = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const paginaRaw = request.data?.pagina;
  const pagina =
    typeof paginaRaw === "number" && Number.isInteger(paginaRaw) && paginaRaw >= 0 ? paginaRaw : 0;

  const pageSnapshot = await leaderboardQuery()
    .offset(pagina * LEADERBOARD_PAGE_SIZE)
    .limit(LEADERBOARD_PAGE_SIZE)
    .get();

  const entradas = pageSnapshot.docs.map((doc, index) => ({
    posicion: pagina * LEADERBOARD_PAGE_SIZE + index + 1,
    ...(doc.data() as LeaderboardEntry),
  }));

  const propia = await getOwnRanking(request.auth.uid);

  return { pagina, entradas, propia };
});
