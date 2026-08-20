import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { getLeaderboard } from "../../src/functions/scoring";

// Los tests de este archivo comparten el mismo Firestore emulado; sin
// limpiar entre tests, las entradas de uno contaminarían el ranking
// del siguiente (queries de posición/paginación son sensibles a todo
// lo que haya en la colección).
beforeEach(async () => {
  const existing = await db.collection("leaderboard").get();
  await Promise.all(existing.docs.map((doc) => doc.ref.delete()));
});

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function seedEntry(overrides: Record<string, unknown> = {}) {
  await db
    .collection("leaderboard")
    .doc(randomUUID())
    .set({
      userId: randomUUID(),
      nombre_usuario: "Jugador",
      puntuacion: 100,
      nodos_alcanzados: 1,
      tiempo_medio_respuesta: 10,
      tiempo_total: 10,
      fecha: new Date().toISOString(),
      ...overrides,
    });
}

describe("getLeaderboard", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(getLeaderboard.run(callableRequest({}, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("ordena por puntuación descendente, con desempate por tiempo_total ascendente", async () => {
    await seedEntry({ puntuacion: 100, tiempo_total: 50 });
    await seedEntry({ puntuacion: 300, tiempo_total: 20 });
    await seedEntry({ puntuacion: 300, tiempo_total: 10 }); // misma puntuación, más rápido → antes

    const result = (await getLeaderboard.run(callableRequest({}, randomUUID()))) as {
      entradas: Array<{ puntuacion: number; tiempo_total: number; posicion: number }>;
    };

    expect(
      result.entradas.slice(0, 3).map((e) => ({ p: e.puntuacion, t: e.tiempo_total })),
    ).toEqual([
      { p: 300, t: 10 },
      { p: 300, t: 20 },
      { p: 100, t: 50 },
    ]);
    expect(result.entradas[0]?.posicion).toBe(1);
  });

  it("está paginado: la página 0 no devuelve más de LEADERBOARD_PAGE_SIZE entradas", async () => {
    for (let i = 0; i < 55; i++) {
      await seedEntry({ puntuacion: i });
    }

    const pagina0 = (await getLeaderboard.run(callableRequest({ pagina: 0 }, randomUUID()))) as {
      entradas: unknown[];
    };
    expect(pagina0.entradas).toHaveLength(50);

    const pagina1 = (await getLeaderboard.run(callableRequest({ pagina: 1 }, randomUUID()))) as {
      entradas: Array<{ posicion: number }>;
    };
    expect(pagina1.entradas.length).toBeGreaterThan(0);
    expect(pagina1.entradas[0]?.posicion).toBe(51);
  });

  it("incluye la posición y puntuación del usuario autenticado aunque no esté en la página solicitada", async () => {
    const uid = randomUUID();
    // 60 entradas por delante del usuario, más la suya al final.
    for (let i = 0; i < 60; i++) {
      await seedEntry({ puntuacion: 1000 - i });
    }
    await seedEntry({ userId: uid, puntuacion: 1, tiempo_total: 5 });

    const result = (await getLeaderboard.run(callableRequest({ pagina: 0 }, uid))) as {
      entradas: unknown[];
      propia: { posicion: number; puntuacion: number } | null;
    };

    expect(result.entradas).toHaveLength(50); // el usuario no está en la página 0
    expect(result.propia).toMatchObject({ posicion: 61, puntuacion: 1 });
  });

  it("devuelve propia: null si el usuario autenticado no tiene ninguna entrada en el ranking", async () => {
    const result = (await getLeaderboard.run(callableRequest({}, randomUUID()))) as {
      propia: unknown;
    };
    expect(result.propia).toBeNull();
  });
});
