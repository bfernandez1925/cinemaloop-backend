import { describe, expect, it } from "vitest";

// Placeholder para confirmar que el toolchain de tests está operativo.
// Los tests reales de cada Cloud Function llegan con su propia issue
// (ver CIN-8 para el harness contra el Firebase Emulator Suite, y
// CIN-20/28/31/36 para los tests de cada dominio).
describe("toolchain", () => {
  it("corre bajo Vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
