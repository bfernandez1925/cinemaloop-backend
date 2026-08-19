import { onCall, HttpsError } from "firebase-functions/v2/https";

/**
 * Devuelve el historial paginado de partidas del usuario autenticado
 * (enviadas o guardadas; nunca las descartadas).
 * Ver spec-historial.md, CIN-29.
 */
export const getUserGames = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "getUserGames: pendiente de implementar (CIN-29).");
});
