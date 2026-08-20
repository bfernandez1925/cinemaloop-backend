import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { getUserProfile } from "../../src/functions/auth";

function callableRequest(uid: string | null): CallableRequest {
  return {
    data: {},
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

describe("getUserProfile", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(getUserProfile.run(callableRequest(null))).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("devuelve los agregados reales y el nombre de usuario del documento propio", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(uid).set({
      nombre_usuario: "Jugador Uno",
      fecha_registro: "2026-01-01T00:00:00.000Z",
      mejor_puntuacion: 4860,
      cadena_mas_larga: 14,
      partidas_jugadas: 27,
    });

    const result = await getUserProfile.run(callableRequest(uid));

    expect(result).toEqual({
      nombre_usuario: "Jugador Uno",
      mejor_puntuacion: 4860,
      cadena_mas_larga: 14,
      partidas_jugadas: 27,
    });
  });

  it("nunca devuelve el documento de otro usuario", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(randomUUID()).set({
      nombre_usuario: "Otro jugador",
      mejor_puntuacion: 9999,
      cadena_mas_larga: 99,
      partidas_jugadas: 99,
    });

    const result = await getUserProfile.run(callableRequest(uid));

    expect(result).toEqual({
      nombre_usuario: null,
      mejor_puntuacion: 0,
      cadena_mas_larga: 0,
      partidas_jugadas: 0,
    });
  });

  it("si el documento no existe, devuelve los agregados a 0 en vez de lanzar un error", async () => {
    const result = await getUserProfile.run(callableRequest(randomUUID()));

    expect(result).toEqual({
      nombre_usuario: null,
      mejor_puntuacion: 0,
      cadena_mas_larga: 0,
      partidas_jugadas: 0,
    });
  });
});
