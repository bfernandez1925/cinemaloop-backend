import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { submitAnswer } from "../../src/functions/gameEngine";
import { mockFetchImplementation } from "./mocks/externalServices";

function callableRequest(data: unknown, uid: string): CallableRequest {
  return { data, auth: { uid } as CallableRequest["auth"] } as CallableRequest;
}

async function createGame(modo: string, overrides: Record<string, unknown> = {}) {
  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId: "user-1",
    modo,
    estado: "en_curso",
    nodo_actual: { tipo: "actor", entidad_tmdb_id: 7, nombre: "Un actor", imagen: null },
    usados: [7],
    puntuacion_total: 0,
    tiempo_acumulado: 0,
    ultima_actividad: new Date().toISOString(),
    ...overrides,
  });
  return gameRef;
}

function mockCorrectAnswer(movieId: number) {
  mockFetchImplementation((url) => {
    if (url.includes("/search/movie")) {
      return {
        body: {
          results: [
            { id: movieId, title: "Película", popularity: 50, vote_count: 2000, poster_path: null },
          ],
        },
      };
    }
    if (url.includes("/person/7/movie_credits")) {
      return { body: { cast: [{ id: movieId }] } };
    }
    throw new Error(`URL no esperada: ${url}`);
  });
}

describe("modo Contrarreloj (CIN-21)", () => {
  it("no aplica bonus de rapidez (sin límite por turno)", async () => {
    const gameRef = await createGame("contrarreloj");
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
        "user-1",
      ),
    )) as { puntos: number };

    expect(result.puntos).toBe(100); // solo base, sin bonus
  });

  it("sigue en curso mientras el tiempo acumulado no llega a 90s", async () => {
    const gameRef = await createGame("contrarreloj", { tiempo_acumulado: 50 });
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 20 },
        "user-1",
      ),
    )) as { partida_finalizada?: boolean };

    expect(result.partida_finalizada).toBeUndefined();
    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()?.estado).toBe("en_curso");
    expect(gameSnapshot.data()?.tiempo_acumulado).toBe(70);
  });

  it("finaliza automáticamente al agotar los 90s totales, conservando la puntuación", async () => {
    const gameRef = await createGame("contrarreloj", {
      tiempo_acumulado: 85,
      puntuacion_total: 300,
    });
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 10 },
        "user-1",
      ),
    )) as { partida_finalizada?: boolean; puntuacion_total: number };

    expect(result.partida_finalizada).toBe(true);
    expect(result.puntuacion_total).toBe(400); // 300 + 100 del turno que agota el tiempo

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()?.estado).toBe("finalizada");
  });
});

describe("modo Maratón (CIN-22)", () => {
  it("no aplica bonus de rapidez (sin límite por turno)", async () => {
    const gameRef = await createGame("maraton");
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
        "user-1",
      ),
    )) as { puntos: number };

    expect(result.puntos).toBe(100);
  });

  it("no impone ningún límite de tiempo por turno, aunque tarde mucho más que 25s", async () => {
    const gameRef = await createGame("maraton");
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 500 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });

  it("finaliza la partida por inactividad prolongada y rechaza la llamada", async () => {
    const gameRef = await createGame("maraton", {
      ultima_actividad: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutos atrás
    });

    await expect(
      submitAnswer.run(
        callableRequest(
          { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
          "user-1",
        ),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()?.estado).toBe("finalizada");
  });

  it("no finaliza por inactividad si la última actividad es reciente", async () => {
    const gameRef = await createGame("maraton", {
      ultima_actividad: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minuto atrás
    });
    mockCorrectAnswer(100);

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });
});
