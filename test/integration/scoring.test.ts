import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { discardGame, submitToLeaderboard } from "../../src/functions/scoring";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function createFinishedGame(overrides: Record<string, unknown> = {}) {
  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId: "user-1",
    modo: "clasico",
    estado: "finalizada",
    puntuacion_total: 300,
    nodos_alcanzados: 3,
    tiempo_total: 30,
    tiempo_medio_respuesta: 10,
    enviada_a_ranking: false,
    ...overrides,
  });
  return gameRef;
}

describe("submitToLeaderboard", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(
      submitToLeaderboard.run(callableRequest({ gameId: "x" }, null)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rechaza partidas que no pertenecen al usuario autenticado", async () => {
    const gameRef = await createFinishedGame();
    await expect(
      submitToLeaderboard.run(callableRequest({ gameId: gameRef.id }, "otro-usuario")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rechaza una partida que todavía no ha finalizado", async () => {
    const gameRef = await createFinishedGame({ estado: "en_curso" });
    await expect(
      submitToLeaderboard.run(callableRequest({ gameId: gameRef.id }, "user-1")),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("crea leaderboard/{gameId}, marca enviada_a_ranking: true, y actualiza los agregados de usuario", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(uid).set({ nombre_usuario: "Jugador X", partidas_jugadas: 0 });
    const gameRef = await createFinishedGame({ userId: uid });

    const result = (await submitToLeaderboard.run(
      callableRequest({ gameId: gameRef.id }, uid),
    )) as { ok: boolean };
    expect(result.ok).toBe(true);

    const leaderboardSnapshot = await db.collection("leaderboard").doc(gameRef.id).get();
    expect(leaderboardSnapshot.data()).toMatchObject({
      userId: uid,
      nombre_usuario: "Jugador X",
      puntuacion: 300,
      nodos_alcanzados: 3,
      tiempo_medio_respuesta: 10,
      tiempo_total: 30,
    });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()?.enviada_a_ranking).toBe(true);

    // "Enviar al ranking" también cuenta como partida guardada/jugada (CIN-30).
    const userSnapshot = await db.collection("users").doc(uid).get();
    expect(userSnapshot.data()).toMatchObject({ mejor_puntuacion: 300, partidas_jugadas: 1 });
  });
});

describe("discardGame", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(discardGame.run(callableRequest({ gameId: "x" }, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rechaza partidas que no pertenecen al usuario autenticado", async () => {
    const gameRef = await createFinishedGame();
    await expect(
      discardGame.run(callableRequest({ gameId: gameRef.id }, "otro-usuario")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("borra la partida y su subcolección turns por completo, sin dejar rastro", async () => {
    const gameRef = await createFinishedGame();
    await gameRef.collection("turns").add({ tipo: "pelicula", entidad_tmdb_id: 1 });
    await gameRef.collection("turns").add({ tipo: "actor", entidad_tmdb_id: 2 });

    const result = (await discardGame.run(callableRequest({ gameId: gameRef.id }, "user-1"))) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.exists).toBe(false);

    const turnsSnapshot = await gameRef.collection("turns").get();
    expect(turnsSnapshot.empty).toBe(true);
  });
});
