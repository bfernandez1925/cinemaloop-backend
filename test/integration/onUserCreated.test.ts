import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { onUserCreated } from "../../src/functions/auth";

describe("onUserCreated", () => {
  it("crea users/{uid} con los campos por defecto correctos", async () => {
    const uid = randomUUID();

    // `.run()` invoca el handler directamente contra el Firestore
    // emulado, sin necesitar el emulador de Functions ni un registro
    // real en el emulador de Auth.
    await onUserCreated.run(
      { uid, displayName: "Jugador de ejemplo" } as unknown as Parameters<
        typeof onUserCreated.run
      >[0],
      {},
    );

    const snapshot = await db.collection("users").doc(uid).get();
    const data = snapshot.data();

    expect(data).toMatchObject({
      nombre_usuario: "Jugador de ejemplo",
      mejor_puntuacion: 0,
      cadena_mas_larga: 0,
      partidas_jugadas: 0,
    });
    expect(typeof data?.fecha_registro).toBe("string");
  });

  it("usa null como nombre_usuario si el usuario no tiene displayName", async () => {
    const uid = randomUUID();

    await onUserCreated.run({ uid } as unknown as Parameters<typeof onUserCreated.run>[0], {});

    const snapshot = await db.collection("users").doc(uid).get();
    expect(snapshot.data()?.nombre_usuario).toBeNull();
  });

  it("no sobrescribe un nombre_usuario que updateUsername ya haya escrito antes de que el trigger corra (CIN-64)", async () => {
    const uid = randomUUID();
    // Simula la carrera real: el cliente llama a updateUsername justo
    // después de crear la cuenta, y este trigger todavía no ha corrido
    // (displayName tampoco está disponible en el evento, como en real).
    await db.collection("users").doc(uid).set({ nombre_usuario: "Elegido por el cliente" });

    await onUserCreated.run({ uid } as unknown as Parameters<typeof onUserCreated.run>[0], {});

    const snapshot = await db.collection("users").doc(uid).get();
    expect(snapshot.data()).toMatchObject({
      nombre_usuario: "Elegido por el cliente",
      mejor_puntuacion: 0,
      cadena_mas_larga: 0,
      partidas_jugadas: 0,
    });
  });
});
