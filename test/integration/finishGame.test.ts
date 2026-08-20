import type { DocumentReference } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { finishGame } from "../../src/functions/gameEngine";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function createGame(overrides: Record<string, unknown> = {}) {
  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId: "user-1",
    modo: "clasico",
    estado: "en_curso",
    nodo_actual: { tipo: "actor", entidad_tmdb_id: 7, nombre: "Un actor", imagen: null },
    usados: [7],
    puntuacion_total: 0,
    ...overrides,
  });
  return gameRef;
}

async function addTurn(gameRef: DocumentReference, tiempo: number) {
  await gameRef.collection("turns").add({
    tipo: "pelicula",
    entidad_tmdb_id: 1,
    nombre: "x",
    tiempo_respuesta_segundos: tiempo,
    correcta: true,
    puntos_obtenidos: 100,
  });
}

describe("finishGame", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(finishGame.run(callableRequest({ gameId: "x" }, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rechaza si la partida no pertenece al usuario autenticado", async () => {
    const gameRef = await createGame();
    await expect(
      finishGame.run(callableRequest({ gameId: gameRef.id }, "otro-usuario")),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("retirada voluntaria: conserva la puntuación acumulada y calcula el resumen a partir de los turnos", async () => {
    const gameRef = await createGame({ puntuacion_total: 300 });
    await addTurn(gameRef, 10);
    await addTurn(gameRef, 20);

    const result = (await finishGame.run(callableRequest({ gameId: gameRef.id }, "user-1"))) as {
      puntuacion_total: number;
      nodos_alcanzados: number;
      tiempo_total: number;
      tiempo_medio_respuesta: number;
    };

    expect(result).toEqual({
      puntuacion_total: 300,
      nodos_alcanzados: 2,
      tiempo_total: 30,
      tiempo_medio_respuesta: 15,
    });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()).toMatchObject({
      estado: "finalizada",
      enviada_a_ranking: false,
      puntuacion_total: 300,
      nodos_alcanzados: 2,
      tiempo_total: 30,
      tiempo_medio_respuesta: 15,
    });
  });

  it("partida sin turnos (retirada inmediata): resumen en cero, sin división por cero", async () => {
    const gameRef = await createGame();

    const result = (await finishGame.run(callableRequest({ gameId: gameRef.id }, "user-1"))) as {
      puntuacion_total: number;
      nodos_alcanzados: number;
      tiempo_total: number;
      tiempo_medio_respuesta: number;
    };

    expect(result).toEqual({
      puntuacion_total: 0,
      nodos_alcanzados: 0,
      tiempo_total: 0,
      tiempo_medio_respuesta: 0,
    });
  });

  it("una partida ya finalizada por submitAnswer también puede cerrarse (idempotente)", async () => {
    const gameRef = await createGame({ estado: "finalizada", puntuacion_total: 200 });
    await addTurn(gameRef, 8);

    const result = (await finishGame.run(callableRequest({ gameId: gameRef.id }, "user-1"))) as {
      puntuacion_total: number;
      nodos_alcanzados: number;
    };

    expect(result).toMatchObject({ puntuacion_total: 200, nodos_alcanzados: 1 });
  });
});
