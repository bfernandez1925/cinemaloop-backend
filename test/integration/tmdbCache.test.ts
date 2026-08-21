import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import {
  getMovieCreditsCached,
  getMovieDetailsCached,
  getPersonDetailsCached,
  getPersonMovieCreditsCached,
} from "../../src/clients/tmdbCache";
import { mockFetchOnce } from "./mocks/externalServices";

describe("caché de datos de TMDb (CIN-53)", () => {
  it("getMovieDetailsCached: la segunda llamada con el mismo id no vuelve a pedir a TMDb", async () => {
    mockFetchOnce({ id: 1, title: "Blade", popularity: 50, vote_count: 2000, poster_path: null });
    const primera = await getMovieDetailsCached(1);
    expect(primera).toMatchObject({ id: 1, title: "Blade" });

    // Sin mock adicional: si volviera a llamar a fetch, chocaría con el
    // guard de red real de test/integration/setup.ts.
    const segunda = await getMovieDetailsCached(1);
    expect(segunda).toEqual(primera);
  });

  it("getMovieCreditsCached: la segunda llamada usa el reparto cacheado", async () => {
    mockFetchOnce({ cast: [{ id: 900 }, { id: 901 }] });
    const primera = await getMovieCreditsCached(2);
    expect(primera).toEqual({ cast: [{ id: 900 }, { id: 901 }] });

    const segunda = await getMovieCreditsCached(2);
    expect(segunda).toEqual(primera);
  });

  it("getPersonDetailsCached: la segunda llamada no vuelve a pedir a TMDb", async () => {
    mockFetchOnce({
      id: 3,
      name: "Wesley Snipes",
      popularity: 40,
      profile_path: null,
      place_of_birth: "Orlando, Florida, USA",
      birthday: "1962-07-31",
    });
    const primera = await getPersonDetailsCached(3);
    expect(primera).toMatchObject({ id: 3, name: "Wesley Snipes" });

    const segunda = await getPersonDetailsCached(3);
    expect(segunda).toEqual(primera);
  });

  it("getPersonMovieCreditsCached: dentro del TTL, no vuelve a pedir a TMDb", async () => {
    mockFetchOnce({ cast: [{ id: 100 }] });
    const inicio = "2026-01-01T00:00:00.000Z";
    const primera = await getPersonMovieCreditsCached(4, 3600, inicio);
    expect(primera).toMatchObject({ cast: [{ id: 100 }] });

    // 1 hora después, dentro del TTL de 3600s: sigue usando la caché.
    const dentroDelTtl = "2026-01-01T00:59:00.000Z";
    const segunda = await getPersonMovieCreditsCached(4, 3600, dentroDelTtl);
    expect(segunda).toEqual(primera);
  });

  it("getPersonMovieCreditsCached: tras expirar el TTL, vuelve a pedir a TMDb", async () => {
    mockFetchOnce({ cast: [{ id: 100 }] });
    const inicio = "2026-01-01T00:00:00.000Z";
    await getPersonMovieCreditsCached(5, 3600, inicio);

    // La filmografía cambió (estrenó una película nueva) — la caché
    // vencida debe reflejarlo, no seguir devolviendo el valor viejo.
    mockFetchOnce({ cast: [{ id: 100 }, { id: 200 }] });
    const trasExpirar = "2026-01-01T02:00:00.000Z";
    const resultado = await getPersonMovieCreditsCached(5, 3600, trasExpirar);
    expect(resultado).toMatchObject({ cast: [{ id: 100 }, { id: 200 }] });
  });

  it("cachea en la colección esperada, con el snapshot crudo de TMDb", async () => {
    mockFetchOnce({ id: 6, title: "Top Gun", popularity: 60, vote_count: 3000, poster_path: null });
    await getMovieDetailsCached(6);

    const snapshot = await db.collection("tmdbCacheMovies").doc("6").get();
    expect(snapshot.exists).toBe(true);
    expect(snapshot.data()).toMatchObject({ id: 6, title: "Top Gun" });
  });

  it("getPersonMovieCreditsCached guarda actualizado_en junto al reparto", async () => {
    mockFetchOnce({ cast: [{ id: 100 }] });
    const ahora = "2026-01-01T00:00:00.000Z";
    await getPersonMovieCreditsCached(7, 3600, ahora);

    const snapshot = await db.collection("tmdbCachePersonCredits").doc("7").get();
    expect(snapshot.data()).toEqual({ cast: [{ id: 100 }], actualizado_en: ahora });
  });
});
