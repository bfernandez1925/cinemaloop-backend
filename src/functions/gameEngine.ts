import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

/**
 * Construye y cachea el pool de entidades "populares" de TMDb usado por
 * startGame. Ver spec-game-engine.md, CIN-16.
 */
export const refreshTmdbPool = onSchedule("every monday 03:00", async () => {
  throw new HttpsError("unimplemented", "refreshTmdbPool: pendiente de implementar (CIN-16).");
});

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
