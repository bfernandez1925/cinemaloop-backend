import { onCall, HttpsError } from "firebase-functions/v2/https";

/**
 * Envía la puntuación de una partida al ranking global.
 * Ver spec-scoring-leaderboard.md, CIN-25.
 */
export const submitToLeaderboard = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "submitToLeaderboard: pendiente de implementar (CIN-25).");
});

/**
 * Descarta una partida por completo (borra el documento y su subcolección
 * de turnos). Ver spec-scoring-leaderboard.md, CIN-25.
 */
export const discardGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "discardGame: pendiente de implementar (CIN-25).");
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
