import { describe, expect, it } from "vitest";

// Plantilla de test unitario: lógica pura, sin Firebase Emulator Suite ni
// red. Los tests reales de cada regla de negocio llegan con su propia
// issue (motor de juego: CIN-20; puntuación: CIN-28).
describe("toolchain unit", () => {
  it("corre bajo Vitest sin depender de servicios externos", () => {
    expect(1 + 1).toBe(2);
  });
});
