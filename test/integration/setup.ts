import { afterEach, beforeEach, vi } from "vitest";
import { db } from "../../src/admin";

// Claves de pega para los tests: SecretParam.value() de
// firebase-functions/params lee directamente de process.env en runtime.
process.env.TMDB_API_KEY ??= "test-tmdb-api-key";
process.env.ANTHROPIC_API_KEY ??= "test-anthropic-api-key";

// TMDb y Claude se llaman siempre vía `fetch`. En los tests de
// integración no debe producirse ninguna llamada de red real: cualquier
// llamada no mockeada explícitamente con `mockFetchOnce` (ver
// `test/integration/mocks/externalServices.ts`) falla en vez de golpear
// la red, tanto en local como en CI.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      throw new Error(
        `Llamada de red real bloqueada en tests de integración: ${String(input)}. ` +
          "Usa mockFetchOnce() de test/integration/mocks/externalServices.ts.",
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// La caché de TMDb (CIN-53, ver src/clients/tmdbCache.ts) persiste en
// Firestore entre tests dentro de la misma ejecución del emulador —
// varios tests existentes reutilizan deliberadamente el mismo
// entidad_tmdb_id (p. ej. 7) como fixture con un mock de `fetch`
// distinto cada vez. Sin limpiar la caché entre tests, el primero que
// toque un id la deja escrita y los siguientes leerían ese valor
// obsoleto en vez de llamar a su propio mock.
const TMDB_CACHE_COLLECTIONS = [
  "tmdbCacheMovies",
  "tmdbCacheMovieCredits",
  "tmdbCachePeople",
  "tmdbCachePersonCredits",
];

afterEach(async () => {
  await Promise.all(
    TMDB_CACHE_COLLECTIONS.map((collection) => db.recursiveDelete(db.collection(collection))),
  );
});
