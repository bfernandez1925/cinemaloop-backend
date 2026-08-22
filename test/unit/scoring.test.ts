import { describe, expect, it } from "vitest";
import { calculateSpeedBonus } from "../../src/lib/scoring";

describe("calculateSpeedBonus", () => {
  it("0s restantes → bonus 0 (caso límite)", () => {
    expect(calculateSpeedBonus(0)).toBe(0);
  });

  it("12.5s restantes (punto medio) → bonus 25", () => {
    expect(calculateSpeedBonus(12.5)).toBe(25);
  });

  it("25s restantes (turno completo, caso límite) → bonus 50", () => {
    expect(calculateSpeedBonus(25)).toBe(50);
  });

  it("nunca es negativo con tiempo_restante negativo (reloj de cliente desincronizado)", () => {
    expect(calculateSpeedBonus(-5)).toBe(0);
  });

  it("nunca supera los 50 pts con tiempo_restante por encima del límite de turno", () => {
    expect(calculateSpeedBonus(100)).toBe(50);
  });
});
