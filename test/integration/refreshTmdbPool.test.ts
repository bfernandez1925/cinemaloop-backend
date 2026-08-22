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

function kidsMoviesPage(count: number, pageOffset: number) {
  return {
    results: Array.from({ length: count }, (_, index) => ({
      id: 5000 + pageOffset * count + index,
      title: `Película infantil ${pageOffset}-${index}`,
      popularity: 100 - index,
      vote_count: 2000,
      poster_path: null,
    })),
    total_pages: 50,
  };
}

// Cada película infantil comparte a "Actor repetido" en su reparto —
// verifica que el pool de personas infantil deduplica por id.
function movieCast(movieId: number) {
  return {
    cast: [
      { id: 9999, name: "Actor repetido", popularity: 90, profile_path: null },
      {
        id: 8000 + movieId,
        name: `Actor propio de ${movieId}`,
        popularity: 50,
        profile_path: null,
      },
    ],
  };
}

describe("refreshTmdbPool", () => {
  it("cachea un pool de 500-1000 entidades, filtrando películas por vote_count > 1000, junto al pool infantil", async () => {
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
      if (url.includes("/discover/movie")) {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return { body: kidsMoviesPage(20, page) };
      }
      if (url.includes("/credits")) {
        const movieId = Number(url.match(/\/movie\/(\d+)\/credits/)?.[1]);
        return { body: movieCast(movieId) };
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

  it("cachea también el pool infantil (CIN-54), con actores derivados del reparto y deduplicados", async () => {
    mockFetchImplementation((url) => {
      if (url.includes("/movie/popular")) {
        return { body: popularMoviesPage([2000]) };
      }
      if (url.includes("/person/popular")) {
        return { body: popularPeoplePage(1, 0) };
      }
      if (url.includes("/discover/movie")) {
        const page = Number(new URL(url).searchParams.get("page") ?? "1");
        return { body: kidsMoviesPage(5, page) };
      }
      if (url.includes("/credits")) {
        const movieId = Number(url.match(/\/movie\/(\d+)\/credits/)?.[1]);
        return { body: movieCast(movieId) };
      }
      throw new Error(`URL no esperada en el test: ${url}`);
    });

    await refreshTmdbPool.run({} as never);

    const snapshot = await db.collection("tmdbPool").doc("infantil").get();
    const data = snapshot.data();

    expect(data).toBeDefined();
    expect(typeof data?.actualizado_en).toBe("string");

    const entidades = data?.entidades as Array<{
      tipo: string;
      entidad_tmdb_id: number;
      nombre: string;
    }>;
    const peliculas = entidades.filter((e) => e.tipo === "pelicula");
    expect(peliculas.length).toBeGreaterThan(0);
    expect(peliculas.every((p) => p.nombre.startsWith("Película infantil"))).toBe(true);

    const actores = entidades.filter((e) => e.tipo === "actor");
    // "Actor repetido" (id 9999) aparece en el reparto de TODAS las
    // películas infantiles del mock — debe estar una sola vez.
    expect(actores.filter((a) => a.entidad_tmdb_id === 9999)).toHaveLength(1);
  });
});
