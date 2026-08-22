import { randomUUID } from "node:crypto";
import type { CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { updateUsername } from "../../src/functions/auth";

function callableRequest(data: unknown, uid: string | null): CallableRequest {
  return {
    data,
    auth: uid === null ? undefined : ({ uid } as CallableRequest["auth"]),
  } as CallableRequest;
}

describe("updateUsername", () => {
  it("rechaza peticiones no autenticadas", async () => {
    await expect(
      updateUsername.run(callableRequest({ nombre_usuario: "Nuevo nombre" }, null)),
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rechaza un nombre_usuario vacío o ausente", async () => {
    await expect(updateUsername.run(callableRequest({}, randomUUID()))).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  it("actualiza únicamente el documento del usuario autenticado", async () => {
    const uid = randomUUID();
    await db.collection("users").doc(uid).set({ nombre_usuario: "Nombre original" });

    await updateUsername.run(callableRequest({ nombre_usuario: "Nombre actualizado" }, uid));

    const snapshot = await db.collection("users").doc(uid).get();
    expect(snapshot.data()?.nombre_usuario).toBe("Nombre actualizado");
  });

  it("funciona aunque users/{uid} no exista todavía (carrera con onUserCreated, CIN-64)", async () => {
    const uid = randomUUID();

    await updateUsername.run(callableRequest({ nombre_usuario: "Recién creado" }, uid));

    const snapshot = await db.collection("users").doc(uid).get();
    expect(snapshot.exists).toBe(true);
    expect(snapshot.data()?.nombre_usuario).toBe("Recién creado");
  });
});
