import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { finishGame, startGame, submitAnswer } from "../../src/functions/gameEngine";
import { mockFetchImplementation } from "./mocks/externalServices";

function callableRequest(data: unknown, uid: string): CallableRequest {
  return { data, auth: { uid } as CallableRequest["auth"] } as CallableRequest;
}

describe("ciclo completo: startGame → submitAnswer (×2) → finishGame", () => {
  it("encadena actor → película → actor y finaliza conservando la puntuación acumulada", async () => {
    // Pool con una sola entidad de partida: un actor.
    await db
      .collection("tmdbPool")
      .doc("current")
      .set({
        entidades: [{ tipo: "actor", entidad_tmdb_id: 1, nombre: "Actor inicial", imagen: null }],
        actualizado_en: new Date().toISOString(),
      });

    mockFetchImplementation((url) => {
      // startGame enriquece el nodo inicial (actor 1).
      if (url.includes("/person/1") && !url.includes("movie_credits")) {
        return {
          body: {
            id: 1,
            name: "Actor inicial",
            place_of_birth: "Madrid, España",
            birthday: "1970-01-01",
          },
        };
      }
      // Turno 1 (actor → película): busca la película "Película A".
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              { id: 2, title: "Película A", popularity: 50, vote_count: 2000, poster_path: null },
            ],
          },
        };
      }
      if (url.includes("/person/1/movie_credits")) {
        return { body: { cast: [{ id: 2 }] } };
      }
      // Turno 2 (película → actor): busca "Actor final".
      if (url.includes("/search/person")) {
        return {
          body: { results: [{ id: 3, name: "Actor final", popularity: 50, profile_path: null }] },
        };
      }
      if (url.includes("/movie/2/credits")) {
        return { body: { cast: [{ id: 3 }] } };
      }
      if (url.includes("/person/3")) {
        return { body: { id: 3, name: "Actor final", place_of_birth: null, birthday: null } };
      }
      throw new Error(`URL no esperada en el ciclo completo: ${url}`);
    });

    const uid = "user-full-cycle";

    const { gameId, nodoActual: nodoInicial } = (await startGame.run(
      callableRequest({ modo: "clasico" }, uid),
    )) as { gameId: string; nodoActual: { entidad_tmdb_id: number; pais_origen: string | null } };
    expect(nodoInicial).toMatchObject({ entidad_tmdb_id: 1, pais_origen: "Madrid, España" });

    const turno1 = (await submitAnswer.run(
      callableRequest({ gameId, respuesta: "Película A", tiempo_respuesta_segundos: 8 }, uid),
    )) as { correcto: boolean; puntuacion_total: number };
    expect(turno1).toMatchObject({ correcto: true, puntuacion_total: 100 });

    const turno2 = (await submitAnswer.run(
      callableRequest({ gameId, respuesta: "Actor final", tiempo_respuesta_segundos: 12 }, uid),
    )) as { correcto: boolean; puntuacion_total: number };
    expect(turno2).toMatchObject({ correcto: true, puntuacion_total: 200 });

    const resumen = (await finishGame.run(callableRequest({ gameId }, uid))) as {
      puntuacion_total: number;
      nodos_alcanzados: number;
      tiempo_total: number;
      tiempo_medio_respuesta: number;
    };

    expect(resumen).toEqual({
      puntuacion_total: 200,
      nodos_alcanzados: 2,
      tiempo_total: 20,
      tiempo_medio_respuesta: 10,
    });

    const finalGame = await db.collection("games").doc(gameId).get();
    expect(finalGame.data()).toMatchObject({
      estado: "finalizada",
      enviada_a_ranking: false,
      usados: [1, 2, 3],
    });
  });
});
