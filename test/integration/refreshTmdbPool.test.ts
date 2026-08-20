import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { refreshTmdbPool } from "../../src/functions/gameEngine";
import { mockFetchImplementation } from "./mocks/externalServices";

function popularMoviesPage(voteCounts: number[]) {
  return {
    results: voteCounts.map((vote_count, index) => ({
      id: 1000 + index,
      title: `Película ${index}`,
      popularity: 100 - index,
      vote_count,
      poster_path: null,
    })),
    total_pages: 1,
  };
}

function popularPeoplePage(count: number, pageOffset: number) {
  return {
    results: Array.from({ length: count }, (_, index) => ({
      id: 2000 + pageOffset * count + index,
      name: `Actor ${pageOffset}-${index}`,
      popularity: 100 - index,
      profile_path: null,
    })),
    total_pages: 50,
  };
}

describe("refreshTmdbPool", () => {
  it("cachea un pool de 500-1000 entidades, filtrando películas por vote_count > 1000", async () => {
    mockFetchImplementation((url) => {
      if (url.includes("/movie/popular")) {
        // Una sola página: mitad de las películas no pasan el filtro de popularidad.
        return {
          body: popularMoviesPage([500, 1500, 800, 2000, 1200, 900, 3000, 1001, 999, 5000]),
        };
      }
      if (url.includes("/person/popular")) {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return { body: popularPeoplePage(20, page) };
      }
      throw new Error(`URL no esperada en el test: ${url}`);
    });

    await refreshTmdbPool.run({} as never);

    const snapshot = await db.collection("tmdbPool").doc("current").get();
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(typeof data?.actualizado_en).toBe("string");

    const entidades = data?.entidades as Array<{ tipo: string; entidad_tmdb_id: number }>;
    expect(entidades.length).toBeGreaterThanOrEqual(500);
    expect(entidades.length).toBeLessThanOrEqual(1000);

    const peliculas = entidades.filter((e) => e.tipo === "pelicula");
    // Solo 6 de las 10 películas de la página mockeada superan vote_count > 1000.
    expect(peliculas).toHaveLength(6);

    const actores = entidades.filter((e) => e.tipo === "actor");
    expect(actores.length).toBeGreaterThan(0);
  });
});
