import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { mockFetchOnce } from "./mocks/externalServices";

// Plantilla de test de integración: corre contra el Firebase Emulator
// Suite (Firestore + Auth), levantado automáticamente por
// `npm run test:integration` (ver package.json), sin pasos manuales. Los
// tests reales de cada Cloud Function llegan con su propia issue
// (reglas deny-all y onUserCreated: CIN-14; motor de juego: CIN-20).
describe("Firebase Emulator Suite", () => {
  it("lee y escribe en Firestore a través del Admin SDK", async () => {
    const docRef = db.collection("_cin8_smoke_test").doc(randomUUID());

    await docRef.set({ ok: true });
    const snapshot = await docRef.get();

    expect(snapshot.data()).toEqual({ ok: true });

    await docRef.delete();
  });

  it("mockea una llamada a un servicio externo (TMDb/Claude) en vez de golpear la red real", async () => {
    mockFetchOnce({ results: [{ id: 1, name: "Actor de ejemplo" }] });

    const response = await fetch("https://api.themoviedb.org/3/search/person?query=ejemplo");
    const body = await response.json();

    expect(body.results[0].name).toBe("Actor de ejemplo");
  });

  it("bloquea una llamada de red real no mockeada", async () => {
    await expect(fetch("https://api.themoviedb.org/3/search/person")).rejects.toThrow(/bloqueada/);
  });
});
