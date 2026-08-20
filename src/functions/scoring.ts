import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { LEADERBOARD_PAGE_SIZE } from "../config/scoring";
import type { GameDoc } from "../lib/gameEngine";

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
 * Envía la puntuación de una partida al ranking global: crea
 * `leaderboard/{gameId}` y marca `enviada_a_ranking: true`. La partida
 * permanece también en el historial del usuario.
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
