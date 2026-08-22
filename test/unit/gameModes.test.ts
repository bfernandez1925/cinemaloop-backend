import { describe, expect, it } from "vitest";
import { hasExceededInactivityTimeout } from "../../src/lib/gameEngine";

describe("hasExceededInactivityTimeout (modo Maratón)", () => {
  it("no ha excedido el umbral si ha pasado menos tiempo", () => {
    expect(
      hasExceededInactivityTimeout(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:04:00.000Z", // 4 minutos
        300, // 5 minutos
      ),
    ).toBe(false);
  });

  it("ha excedido el umbral si ha pasado más tiempo", () => {
    expect(
      hasExceededInactivityTimeout(
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:06:00.000Z", // 6 minutos
        300, // 5 minutos
      ),
    ).toBe(true);
  });

  it("caso límite: exactamente el umbral no cuenta como excedido", () => {
    expect(
      hasExceededInactivityTimeout("2026-01-01T00:00:00.000Z", "2026-01-01T00:05:00.000Z", 300),
    ).toBe(false);
  });
});
