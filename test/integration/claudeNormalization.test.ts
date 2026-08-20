import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { submitAnswer } from "../../src/functions/gameEngine";
import { mockFetchImplementation } from "./mocks/externalServices";

function callableRequest(data: unknown, uid: string): CallableRequest {
  return { data, auth: { uid } as CallableRequest["auth"] } as CallableRequest;
}

async function createGame() {
  const gameRef = db.collection("games").doc();
  await gameRef.set({
    userId: "user-1",
    modo: "clasico",
    estado: "en_curso",
    nodo_actual: { tipo: "actor", entidad_tmdb_id: 7, nombre: "Un actor", imagen: null },
    usados: [7],
    puntuacion_total: 0,
  });
  return gameRef;
}

function anthropicTextResponse(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

describe("normalización con Claude en submitAnswer (CIN-33)", () => {
  it("usa el candidato normalizado por Claude para encontrar la película correcta en TMDb", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("api.anthropic.com")) {
        return {
          body: anthropicTextResponse(
            '{"candidatos": ["Película Normalizada"], "confianza": "alta"}',
          ),
        };
      }
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 100,
                title: "Película Normalizada",
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
        {
          gameId: gameRef.id,
          respuesta: "peliqula normalisada (typo)",
          tiempo_respuesta_segundos: 5,
        },
        "user-1",
      ),
    )) as { correcto: boolean; nodoActual: { nombre: string } };

    expect(result.correcto).toBe(true);
    expect(result.nodoActual.nombre).toBe("Película Normalizada");
  });

  it("una segunda partida con la misma respuesta reutiliza la caché de IA, sin volver a llamar a Claude (CIN-36)", async () => {
    const respuesta = "peliqula cacheada (typo)";

    const gameRef1 = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("api.anthropic.com")) {
        return {
          body: anthropicTextResponse('{"candidatos": ["Película Cacheada"], "confianza": "alta"}'),
        };
      }
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 101,
                title: "Película Cacheada",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 101 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });
    await submitAnswer.run(
      callableRequest({ gameId: gameRef1.id, respuesta, tiempo_respuesta_segundos: 5 }, "user-1"),
    );

    // Segunda partida, mismo texto de respuesta: solo se mockea TMDb.
    // Si submitAnswer llamara a Claude otra vez (sin usar la caché),
    // chocaría con el guard de red real y caería al texto original,
    // que no encuentra la película en TMDb — el turno fallaría.
    const gameRef2 = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 101,
                title: "Película Cacheada",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 101 }] } };
      }
      throw new Error(`URL no esperada (Claude no debería llamarse): ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest({ gameId: gameRef2.id, respuesta, tiempo_respuesta_segundos: 5 }, "user-1"),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });
});
