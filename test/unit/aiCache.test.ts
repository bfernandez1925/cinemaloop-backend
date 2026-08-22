import { describe, expect, it } from "vitest";
import { normalizeCorrectionCacheKey } from "../../src/lib/aiCache";

describe("normalizeCorrectionCacheKey", () => {
  it("es estable frente a mayúsculas", () => {
    expect(normalizeCorrectionCacheKey("Brad Pitt")).toBe(normalizeCorrectionCacheKey("BRAD PITT"));
  });

  it("es estable frente a acentos", () => {
    expect(normalizeCorrectionCacheKey("Peñélope Cruz")).toBe(
      normalizeCorrectionCacheKey("Penelope Cruz"),
    );
  });

  it("es estable frente a espacios repetidos y en los extremos", () => {
    expect(normalizeCorrectionCacheKey("  brad   pitt  ")).toBe(
      normalizeCorrectionCacheKey("brad pitt"),
    );
  });

  it("distingue textos genuinamente distintos", () => {
    expect(normalizeCorrectionCacheKey("Brad Pitt")).not.toBe(
      normalizeCorrectionCacheKey("Bradley Pitt"),
    );
  });
});
