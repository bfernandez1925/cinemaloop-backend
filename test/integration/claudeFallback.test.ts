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

describe("fallback y confianza baja (CIN-34)", () => {
  it("si Claude no devuelve JSON válido, el turno no se bloquea: se usa el texto original", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("api.anthropic.com")) {
        return { body: anthropicTextResponse("esto no es JSON en absoluto") };
      }
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 200,
                title: "Texto original",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 200 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Texto original", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });

  it("si Claude devuelve candidatos vacíos, el turno no se bloquea: se usa el texto original", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("api.anthropic.com")) {
        return { body: anthropicTextResponse('{"candidatos": [], "confianza": "baja"}') };
      }
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              { id: 201, title: "Otro texto", popularity: 50, vote_count: 2000, poster_path: null },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 201 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Otro texto", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });

  it("confianza baja se envía igual a TMDb, sin ninguna pausa ni confirmación", async () => {
    const gameRef = await createGame();
    mockFetchImplementation((url) => {
      if (url.includes("api.anthropic.com")) {
        return {
          body: anthropicTextResponse('{"candidatos": ["Candidato dudoso"], "confianza": "baja"}'),
        };
      }
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              {
                id: 300,
                title: "Candidato dudoso",
                popularity: 50,
                vote_count: 2000,
                poster_path: null,
              },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 300 }] } };
      }
      throw new Error(`URL no esperada: ${url}`);
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "algo poco claro", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean };

    // Se resuelve directamente contra TMDb, sin ningún campo de
    // "pendiente de confirmación" ni estado intermedio.
    expect(result.correcto).toBe(true);
  });

  it("si Claude falla por completo (red bloqueada, sin mock), el turno tampoco se bloquea", async () => {
    const gameRef = await createGame();
    // Solo se mockea TMDb; la llamada a Claude no tiene mock específico
    // para api.anthropic.com, así que choca con el guard de red real de
    // setup.ts y normalizeAnswer la captura y devuelve null.
    mockFetchImplementation((url) => {
      if (url.includes("/search/movie")) {
        return {
          body: {
            results: [
              { id: 400, title: "Sin IA", popularity: 50, vote_count: 2000, poster_path: null },
            ],
          },
        };
      }
      if (url.includes("/person/7/movie_credits")) {
        return { body: { cast: [{ id: 400 }] } };
      }
      throw new Error("Claude no mockeado en este test (comportamiento esperado)");
    });

    const result = (await submitAnswer.run(
      callableRequest(
        { gameId: gameRef.id, respuesta: "Sin IA", tiempo_respuesta_segundos: 5 },
        "user-1",
      ),
    )) as { correcto: boolean };

    expect(result.correcto).toBe(true);
  });
});
