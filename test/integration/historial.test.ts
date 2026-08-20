import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { getUserGames } from "../../src/functions/historial";
import { discardGame } from "../../src/functions/scoring";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function createGame(userId: string, overrides: Record<string, unknown> = {}) {
  await db
    .collection("games")
    .doc()
    .set({
      userId,
      modo: "clasico",
      estado: "finalizada",
      fecha: new Date().toISOString(),
      puntuacion_total: 100,
      nodos_alcanzados: 1,
      enviada_a_ranking: false,
      ...overrides,
    });
}

describe("getUserGames", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(getUserGames.run(callableRequest({}, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("un usuario solo ve sus propias partidas, no las de otro usuario", async () => {
    const uid = randomUUID();
    await createGame(uid, { fecha: "2026-01-01T00:00:00.000Z" });
    await createGame(randomUUID(), { fecha: "2026-01-02T00:00:00.000Z" }); // de otro usuario

    const result = (await getUserGames.run(callableRequest({}, uid))) as {
      partidas: unknown[];
    };
    expect(result.partidas).toHaveLength(1);
  });

  it("las partidas descartadas nunca aparecen (CIN-31)", async () => {
    const uid = randomUUID();
    const keptRef = db.collection("games").doc();
    await keptRef.set({
      userId: uid,
      modo: "clasico",
      estado: "finalizada",
      fecha: "2026-01-01T00:00:00.000Z",
      puntuacion_total: 100,
      nodos_alcanzados: 1,
      enviada_a_ranking: false,
    });
    const discardedRef = db.collection("games").doc();
    await discardedRef.set({
      userId: uid,
      modo: "clasico",
      estado: "finalizada",
      fecha: "2026-01-02T00:00:00.000Z",
      puntuacion_total: 999,
      nodos_alcanzados: 9,
      enviada_a_ranking: false,
    });

    await discardGame.run({
      data: { gameId: discardedRef.id },
      auth: { uid } as CallableRequest["auth"],
    } as CallableRequest);

    const result = (await getUserGames.run(callableRequest({}, uid))) as {
      partidas: Array<{ gameId: string }>;
    };
    expect(result.partidas.map((p) => p.gameId)).toEqual([keptRef.id]);
  });

  it("excluye partidas todavía en curso (no finalizadas)", async () => {
    const uid = randomUUID();
    await createGame(uid, { estado: "en_curso" });

    const result = (await getUserGames.run(callableRequest({}, uid))) as {
      partidas: unknown[];
    };
    expect(result.partidas).toHaveLength(0);
  });

  it("ordena por fecha descendente y deriva el estado (Ranking/Guardada)", async () => {
    const uid = randomUUID();
    await createGame(uid, { fecha: "2026-01-01T00:00:00.000Z", enviada_a_ranking: true });
    await createGame(uid, { fecha: "2026-02-01T00:00:00.000Z", enviada_a_ranking: false });

    const result = (await getUserGames.run(callableRequest({}, uid))) as {
      partidas: Array<{ fecha: string; estado: string }>;
    };

    expect(result.partidas.map((p) => p.estado)).toEqual(["Guardada", "Ranking"]);
    expect(result.partidas[0]?.fecha > (result.partidas[1]?.fecha ?? "")).toBe(true);
  });

  it("está paginado (no devuelve todo el historial de una vez)", async () => {
    const uid = randomUUID();
    for (let i = 0; i < 25; i++) {
      await createGame(uid, { fecha: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` });
    }

    const pagina0 = (await getUserGames.run(callableRequest({ pagina: 0 }, uid))) as {
      partidas: unknown[];
    };
    expect(pagina0.partidas).toHaveLength(20);

    const pagina1 = (await getUserGames.run(callableRequest({ pagina: 1 }, uid))) as {
      partidas: unknown[];
    };
    expect(pagina1.partidas).toHaveLength(5);
  });
});
