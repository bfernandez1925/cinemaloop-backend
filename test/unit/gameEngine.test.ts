import { describe, expect, it } from "vitest";
import {
  extractBirthYear,
  findAmbiguousCandidates,
  isAlreadyUsed,
  isInCast,
  pickMostPopular,
  summarizeTurns,
  toActorNode,
} from "../../src/lib/gameEngine";

describe("pickMostPopular (resolución de ambigüedad)", () => {
  it("elige el candidato de mayor popularity entre varios", () => {
    const candidatos = [
      { id: 1, popularity: 10 },
      { id: 2, popularity: 90 },
      { id: 3, popularity: 50 },
    ];
    expect(pickMostPopular(candidatos)).toEqual({ id: 2, popularity: 90 });
  });

  it("devuelve null si no hay candidatos", () => {
    expect(pickMostPopular([])).toBeNull();
  });

  it("devuelve el único candidato si solo hay uno", () => {
    const candidato = { id: 1, popularity: 10 };
    expect(pickMostPopular([candidato])).toBe(candidato);
  });
});

describe("findAmbiguousCandidates (CIN-23)", () => {
  it("sin ambigüedad con 0 o 1 candidato", () => {
    expect(findAmbiguousCandidates([], 0.85, 3)).toEqual([]);
    expect(findAmbiguousCandidates([{ id: 1, popularity: 10 }], 0.85, 3)).toEqual([]);
  });

  it("sin ambigüedad si un candidato domina claramente en popularidad", () => {
    const candidatos = [
      { id: 1, popularity: 90 },
      { id: 2, popularity: 10 },
    ];
    expect(findAmbiguousCandidates(candidatos, 0.85, 3)).toEqual([]);
  });

  it("ambigüedad real: dos candidatos con popularidad dentro del ratio", () => {
    const candidatos = [
      { id: 1, popularity: 88 },
      { id: 2, popularity: 90 },
    ];
    expect(findAmbiguousCandidates(candidatos, 0.85, 3)).toEqual([
      { id: 2, popularity: 90 },
      { id: 1, popularity: 88 },
    ]);
  });

  it("limita a maxCandidates, siempre los más populares primero", () => {
    const candidatos = [
      { id: 1, popularity: 95 },
      { id: 2, popularity: 96 },
      { id: 3, popularity: 97 },
      { id: 4, popularity: 98 },
    ];
    expect(findAmbiguousCandidates(candidatos, 0.85, 3)).toEqual([
      { id: 4, popularity: 98 },
      { id: 3, popularity: 97 },
      { id: 2, popularity: 96 },
    ]);
  });

  it("un tercer candidato muy por debajo del ratio no cuenta como ambiguo", () => {
    const candidatos = [
      { id: 1, popularity: 90 },
      { id: 2, popularity: 88 },
      { id: 3, popularity: 5 },
    ];
    expect(findAmbiguousCandidates(candidatos, 0.85, 3)).toEqual([
      { id: 1, popularity: 90 },
      { id: 2, popularity: 88 },
    ]);
  });
});

describe("isAlreadyUsed (entidad repetida)", () => {
  it("detecta un id ya usado", () => {
    expect(isAlreadyUsed([1, 2, 3], 2)).toBe(true);
  });

  it("no marca como usado un id que no está en la lista", () => {
    expect(isAlreadyUsed([1, 2, 3], 4)).toBe(false);
  });
});

describe("isInCast (turno válido/inválido)", () => {
  it("turno válido: el candidato está en el reparto/filmografía", () => {
    expect(isInCast([{ id: 1 }, { id: 2 }], 2)).toBe(true);
  });

  it("turno inválido: el candidato no tiene relación real con el nodo actual", () => {
    expect(isInCast([{ id: 1 }, { id: 2 }], 999)).toBe(false);
  });

  it("turno inválido con reparto vacío", () => {
    expect(isInCast([], 1)).toBe(false);
  });
});

describe("summarizeTurns", () => {
  it("calcula nodos_alcanzados, tiempo_total y tiempo_medio_respuesta", () => {
    expect(
      summarizeTurns([{ tiempo_respuesta_segundos: 10 }, { tiempo_respuesta_segundos: 20 }]),
    ).toEqual({ nodos_alcanzados: 2, tiempo_total: 30, tiempo_medio_respuesta: 15 });
  });

  it("no divide por cero con una lista de turnos vacía (retirada inmediata)", () => {
    expect(summarizeTurns([])).toEqual({
      nodos_alcanzados: 0,
      tiempo_total: 0,
      tiempo_medio_respuesta: 0,
    });
  });
});

describe("extractBirthYear", () => {
  it("extrae el año de un birthday de TMDb", () => {
    expect(extractBirthYear("1980-05-12")).toBe(1980);
  });

  it("devuelve null si no hay birthday", () => {
    expect(extractBirthYear(null)).toBeNull();
    expect(extractBirthYear(undefined)).toBeNull();
  });
});

describe("toActorNode", () => {
  it("enriquece un PoolEntity con país de origen y año de nacimiento", () => {
    const entity = { tipo: "actor" as const, entidad_tmdb_id: 1, nombre: "Actor", imagen: null };
    expect(
      toActorNode(entity, { place_of_birth: "Madrid, España", birthday: "1980-05-12" }),
    ).toEqual({
      tipo: "actor",
      entidad_tmdb_id: 1,
      nombre: "Actor",
      imagen: null,
      pais_origen: "Madrid, España",
      anio_nacimiento: 1980,
    });
  });
});
