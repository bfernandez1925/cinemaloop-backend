import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { discardGame, saveGame } from "../../src/functions/scoring";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function createFinishedGame(userId: string, overrides: Record<string, unknown> = {}) {
  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId,
    modo: "clasico",
    estado: "finalizada",
    puntuacion_total: 300,
    nodos_alcanzados: 3,
    enviada_a_ranking: false,
    ...overrides,
  });
  return gameRef;
}

describe("saveGame", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(saveGame.run(callableRequest({ gameId: "x" }, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rechaza partidas que no pertenecen al usuario autenticado", async () => {
    const gameRef = await createFinishedGame("user-1");
    await expect(
      saveGame.run(callableRequest({ gameId: gameRef.id }, "otro-usuario")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rechaza una partida que todavía no ha finalizado", async () => {
    const gameRef = await createFinishedGame("user-1", { estado: "en_curso" });
    await expect(
      saveGame.run(callableRequest({ gameId: gameRef.id }, "user-1")),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("actualiza los agregados: partidas_jugadas +1, mejor_puntuacion/cadena_mas_larga si superan el histórico", async () => {
    const uid = randomUUID();
    await db
      .collection("users")
      .doc(uid)
      .set({ mejor_puntuacion: 100, cadena_mas_larga: 1, partidas_jugadas: 5 });
    const gameRef = await createFinishedGame(uid, { puntuacion_total: 500, nodos_alcanzados: 4 });

    const result = (await saveGame.run(callableRequest({ gameId: gameRef.id }, uid))) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);

    const userSnapshot = await db.collection("users").doc(uid).get();
    expect(userSnapshot.data()).toMatchObject({
      mejor_puntuacion: 500,
      cadena_mas_larga: 4,
      partidas_jugadas: 6,
    });
  });

  it("no baja mejor_puntuacion ni cadena_mas_larga si la nueva partida es peor que el histórico", async () => {
    const uid = randomUUID();
    await db
      .collection("users")
      .doc(uid)
      .set({ mejor_puntuacion: 900, cadena_mas_larga: 9, partidas_jugadas: 2 });
    const gameRef = await createFinishedGame(uid, { puntuacion_total: 50, nodos_alcanzados: 1 });

    await saveGame.run(callableRequest({ gameId: gameRef.id }, uid));

    const userSnapshot = await db.collection("users").doc(uid).get();
    expect(userSnapshot.data()).toMatchObject({
      mejor_puntuacion: 900,
      cadena_mas_larga: 9,
      partidas_jugadas: 3,
    });
  });

  it("es idempotente: llamarlo dos veces sobre la misma partida no incrementa partidas_jugadas dos veces", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(uid).set({ partidas_jugadas: 0 });
    const gameRef = await createFinishedGame(uid);

    await saveGame.run(callableRequest({ gameId: gameRef.id }, uid));
    await saveGame.run(callableRequest({ gameId: gameRef.id }, uid));

    const userSnapshot = await db.collection("users").doc(uid).get();
    expect(userSnapshot.data()?.partidas_jugadas).toBe(1);
  });

  it("los agregados nunca se actualizan al descartar una partida", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(uid).set({ partidas_jugadas: 0 });
    const gameRef = await createFinishedGame(uid, { puntuacion_total: 999 });

    await discardGame.run(callableRequest({ gameId: gameRef.id }, uid));

    const userSnapshot = await db.collection("users").doc(uid).get();
    expect(userSnapshot.data()?.partidas_jugadas).toBe(0);
  });
});
