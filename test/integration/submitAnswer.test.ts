import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { submitAnswer } from "../../src/functions/gameEngine";
import { mockFetchImplementation } from "./mocks/externalServices";

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

describe("submitAnswer", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(
      submitAnswer.run(
        callableRequest({ gameId: "x", respuesta: "x", tiempo_respuesta_segundos: 1 }, null),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rechaza si la partida no pertenece al usuario autenticado", async () => {
    const gameRef = await createGame();
    await expect(
      submitAnswer.run(
        callableRequest(
          { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
          "otro-usuario",
        ),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rechaza si la partida ya está finalizada", async () => {
    const gameRef = await createGame({ estado: "finalizada" });
    await expect(
      submitAnswer.run(
        callableRequest(
          { gameId: gameRef.id, respuesta: "x", tiempo_respuesta_segundos: 1 },
          "user-1",
        ),
      ),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("turno válido: añade turno, actualiza nodo_actual/usados, suma puntos (base + bonus de rapidez)", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 100,
                title: "Película correcta",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 100 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Película correcta", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean; puntos: number; puntuacion_total: number };

    // tiempo_restante = 25 - 5 = 20 → bonus = round(50*20/25) = 40 → puntos = 100 + 40 = 140.
    expect(result).toMatchObject({ correcto: true, puntos: 140, puntuacion_total: 140 });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()).toMatchObject({
      usados: [7, 100],
      puntuacion_total: 140,
      nodo_actual: { tipo: "pelicula", entidad_tmdb_id: 100, nombre: "Película correcta" },
    });

    const turnsSnapshot = await gameRef.collection("turns").get();
    expect(turnsSnapshot.docs).toHaveLength(1);
    expect(turnsSnapshot.docs[0]?.data()).toMatchObject({ correcta: true, puntos_obtenidos: 140 });
  });

  it("turno válido (película→actor): busca en /search/person y valida contra /movie/{id}/credits", async () => {
    const gameRef = await createGame({
      nodo_actual: { tipo: "pelicula", entidad_tmdb_id: 55, nombre: "Una película", imagen: null },
      usados: [55],
    });
    mockFetchImplementation((url) => {
      if (url.includes("/search/person")) {
        return {
          body: {
            results: [{ id: 900, name: "Actor correcto", popularity: 50, profile_path: null }],
          },
        };
      }
      if (url.includes("/movie/55/credits")) {
        return { body: { cast: [{ id: 900 }] } };
      }
      if (url.includes("/person/900")) {
        return { body: { id: 900, name: "Actor correcto", place_of_birth: null, birthday: null } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Actor correcto", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean; nodoActual: { tipo: string; entidad_tmdb_id: number } };

    expect(result.correcto).toBe(true);
    expect(result.nodoActual).toMatchObject({ tipo: "actor", entidad_tmdb_id: 900 });
  });

  it("turno inválido (sin relación real con el nodo actual): finaliza la partida conservando la puntuación", async () => {
    const gameRef = await createGame({ puntuacion_total: 300 });
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 200,
                title: "Película sin relación",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 999 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Película sin relación", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean; puntuacion_total: number };

    expect(result).toEqual({ correcto: false, puntuacion_total: 300 });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()?.estado).toBe("finalizada");
    expect(gameSnapshot.data()?.puntuacion_total).toBe(300);
  });

  it("entidad repetida: rechaza aunque sea una respuesta real y finaliza la partida", async () => {
    const gameRef = await createGame({ usados: [7, 100] });
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              { id: 100, title: "Ya usada", popularity: 50, vote_count: 2000, poster_path: null },
            ],
          },
        };
      }
      // Claude falla (sin mock específico) → cae al texto original, que
      // es justo lo que se está probando aquí de todos modos.
      throw new Error("Claude no mockeado en este test (comportamiento esperado)");
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Ya usada", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(false);
  });

  it("ambigüedad: elige el candidato de mayor popularity sin bloquear el turno", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 300,
                title: "Menos popular",
                popularity: 10,
                vote_count: 2000,
                poster_path: null,
              },
              {
                id: 301,
                title: "Más popular",
                popularity: 90,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 301 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Popular", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean; nodoActual: { entidad_tmdb_id: number; nombre: string } };

    expect(result.correcto).toBe(true);
    expect(result.nodoActual).toMatchObject({ entidad_tmdb_id: 301, nombre: "Más popular" });
  });

  it("ambigüedad real (CIN-23): con ≥2 candidatos válidos de popularidad similar, no resuelve el turno", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 400,
                title: "Candidato A",
                popularity: 88,
                vote_count: 2000,
                poster_path: null,
              },
              {
                id: 401,
                title: "Candidato B",
                popularity: 90,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        // Ambos candidatos están realmente en la filmografía — la
        // ambigüedad es real, no un filtrado por reparto.
        return { body: { cast: [{ id: 400 }, { id: 401 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Ambigua", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { ambiguo?: boolean; candidatos?: Array<{ entidad_tmdb_id: number; nombre: string }> };

    expect(result.ambiguo).toBe(true);
    expect(result.candidatos).toEqual([
      { tipo: "pelicula", entidad_tmdb_id: 401, nombre: "Candidato B", imagen: null },
      { tipo: "pelicula", entidad_tmdb_id: 400, nombre: "Candidato A", imagen: null },
    ]);

    // El turno no se resuelve: la partida sigue en_curso, sin nuevo turno ni cambio de puntuación.
    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()).toMatchObject({
      estado: "en_curso",
      puntuacion_total: 0,
      usados: [7],
    });
    const turnsSnapshot = await gameRef.collection("turns").get();
    expect(turnsSnapshot.docs).toHaveLength(0);
  });

  it("confirmación de candidato ambiguo: candidato_id resuelve el turno sin volver a buscar por texto", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 401 }] } };
      }
      if (url.includes("/movie/401")) {
        return {
          body: {
            id: 401,
            title: "Candidato B",
            popularity: 90,
            vote_count: 2000,
            poster_path: null,
          },
        };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        {
          gameId: gameRef.id,
          respuesta: "Ambigua",
          tiempo_respuesta_segundos: 5,
          candidato_id: 401,
        },
        "user-1",
      ),
    )) as { correcto: boolean; nodoActual: { entidad_tmdb_id: number; nombre: string } };

    expect(result.correcto).toBe(true);
    expect(result.nodoActual).toMatchObject({ entidad_tmdb_id: 401, nombre: "Candidato B" });

    const gameSnapshot = await gameRef.get();
    expect(gameSnapshot.data()).toMatchObject({ usados: [7, 401] });
  });

  it("confirmación con candidato_id que no está en el reparto: rechaza y finaliza la partida", async () => {
    const gameRef = await createGame({ puntuacion_total: 50 });
    mockFetchImplementation((url) => {
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 999 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        {
          gameId: gameRef.id,
          respuesta: "Ambigua",
          tiempo_respuesta_segundos: 5,
          candidato_id: 401,
        },
        "user-1",
      ),
    )) as { correcto: boolean; puntuacion_total: number };

    expect(result).toEqual({ correcto: false, puntuacion_total: 50 });
  });
});
