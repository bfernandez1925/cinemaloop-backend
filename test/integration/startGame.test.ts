import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { startGame } from "../../src/functions/gameEngine";
import { mockFetchOnce } from "./mocks/externalServices";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

async function seedPool(entidades: unknown[]) {
  await db.collection("tmdbPool").doc("current").set({
    entidades,
    actualizado_en: new Date().toISOString(),
  });
}

describe("startGame", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(startGame.run(callableRequest({ modo: "clasico" }, null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rechaza un modo inválido", async () => {
    await seedPool([{ tipo: "pelicula", entidad_tmdb_id: 1, nombre: "x", imagen: null }]);
    await expect(
      startGame.run(callableRequest({ modo: "no-existe" }, randomUUID())),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("crea la partida y devuelve el nodo inicial (película, sin enriquecimiento)", async () => {
    await seedPool([
      { tipo: "pelicula", entidad_tmdb_id: 42, nombre: "Una película", imagen: "/x.jpg" },
    ]);

    const result = (await startGame.run(callableRequest({ modo: "clasico" }, "user-1"))) as {
      gameId: string;
      nodoActual: { tipo: string; entidad_tmdb_id: number };
    };

    expect(result.nodoActual).toEqual({
      tipo: "pelicula",
      entidad_tmdb_id: 42,
      nombre: "Una película",
      imagen: "/x.jpg",
    });

    const gameSnapshot = await db.collection("games").doc(result.gameId).get();
    const game = gameSnapshot.data();
    expect(game).toMatchObject({
      userId: "user-1",
      modo: "clasico",
      estado: "en_curso",
      puntuacion_total: 0,
      usados: [42],
    });
  });

  it("enriquece el nodo inicial con país y año si es actor", async () => {
    await seedPool([{ tipo: "actor", entidad_tmdb_id: 7, nombre: "Un actor", imagen: null }]);
    mockFetchOnce({
      id: 7,
      name: "Un actor",
      place_of_birth: "Madrid, España",
      birthday: "1980-05-12",
    });

    const result = (await startGame.run(callableRequest({ modo: "clasico" }, "user-1"))) as {
      nodoActual: { pais_origen: string | null; anio_nacimiento: number | null };
    };

    expect(result.nodoActual.pais_origen).toBe("Madrid, España");
    expect(result.nodoActual.anio_nacimiento).toBe(1980);
  });

  it("rechaza si el pool todavía no se ha generado", async () => {
    await db.collection("tmdbPool").doc("current").delete();
    await expect(
      startGame.run(callableRequest({ modo: "clasico" }, "user-1")),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("modo infantil lee de tmdbPool/infantil, no del pool general (CIN-54)", async () => {
    await seedPool([
      { tipo: "pelicula", entidad_tmdb_id: 1, nombre: "Del pool general", imagen: null },
    ]);
    await db
      .collection("tmdbPool")
      .doc("infantil")
      .set({
        entidades: [
          { tipo: "pelicula", entidad_tmdb_id: 2, nombre: "Del pool infantil", imagen: null },
        ],
        actualizado_en: new Date().toISOString(),
      });

    const result = (await startGame.run(callableRequest({ modo: "infantil" }, "user-1"))) as {
      nodoActual: { nombre: string };
    };

    expect(result.nodoActual.nombre).toBe("Del pool infantil");
  });

  it("modo infantil rechaza si su propio pool todavía no se ha generado, aunque el general exista", async () => {
    await seedPool([
      { tipo: "pelicula", entidad_tmdb_id: 1, nombre: "Del pool general", imagen: null },
    ]);
    await db.collection("tmdbPool").doc("infantil").delete();

    await expect(
      startGame.run(callableRequest({ modo: "infantil" }, "user-1")),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
