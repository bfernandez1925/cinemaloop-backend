import { readFileSync } from "node:fs";
import {
  type RulesTestEnvironment,
  assertFails,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";

// Tests de las reglas de seguridad de Firestore (deny-all), independientes
// del guard de fetch de setup.ts: usan su propio cliente de Firestore
// contra el emulador, no la red.
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? "demo-cinemaloop",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("firestore.rules (deny-all)", () => {
  it("un cliente no autenticado no puede leer users/{uid}", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(unauthed.firestore().collection("users").doc("otro-usuario").get());
  });

  it("un cliente no autenticado no puede escribir users/{uid}", async () => {
    const unauthed = testEnv.unauthenticatedContext();
    await assertFails(
      unauthed.firestore().collection("users").doc("otro-usuario").set({ nombre_usuario: "x" }),
    );
  });

  it("un usuario autenticado no puede leer el documento de otro usuario", async () => {
    const userA = testEnv.authenticatedContext("user-a");
    await assertFails(userA.firestore().collection("users").doc("user-b").get());
  });

  it("un usuario autenticado no puede escribir el documento de otro usuario", async () => {
    const userA = testEnv.authenticatedContext("user-a");
    await assertFails(
      userA.firestore().collection("users").doc("user-b").set({ nombre_usuario: "x" }),
    );
  });

  it("un usuario autenticado no puede leer ni escribir directamente ni siquiera su propio documento (deny-all total, solo Cloud Functions vía Admin SDK)", async () => {
    const userA = testEnv.authenticatedContext("user-a");
    await assertFails(userA.firestore().collection("users").doc("user-a").get());
    await assertFails(
      userA.firestore().collection("users").doc("user-a").set({ nombre_usuario: "x" }),
    );
  });
});
