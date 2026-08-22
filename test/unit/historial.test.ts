import { describe, expect, it } from "vitest";
import { applyGameToAggregates } from "../../src/lib/historial";

describe("applyGameToAggregates", () => {
  it("incrementa partidas_jugadas en exactamente 1", () => {
    const result = applyGameToAggregates(
      { mejor_puntuacion: 0, cadena_mas_larga: 0, partidas_jugadas: 3 },
      { puntuacion_total: 10, nodos_alcanzados: 1 },
    );
    expect(result.partidas_jugadas).toBe(4);
  });

  it("actualiza mejor_puntuacion y cadena_mas_larga si la nueva partida supera el máximo histórico", () => {
    const result = applyGameToAggregates(
      { mejor_puntuacion: 100, cadena_mas_larga: 2, partidas_jugadas: 1 },
      { puntuacion_total: 500, nodos_alcanzados: 5 },
    );
    expect(result.mejor_puntuacion).toBe(500);
    expect(result.cadena_mas_larga).toBe(5);
  });

  it("no baja mejor_puntuacion ni cadena_mas_larga si la nueva partida es peor que el histórico", () => {
    const result = applyGameToAggregates(
      { mejor_puntuacion: 500, cadena_mas_larga: 5, partidas_jugadas: 1 },
      { puntuacion_total: 100, nodos_alcanzados: 2 },
    );
    expect(result.mejor_puntuacion).toBe(500);
    expect(result.cadena_mas_larga).toBe(5);
  });
});
