import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import type { GameDoc } from "../lib/gameEngine";

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

  throw new HttpsError("unimplemented", "getLeaderboard: pendiente de implementar (CIN-27).");
});
