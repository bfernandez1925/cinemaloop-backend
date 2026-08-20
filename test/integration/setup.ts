import { afterEach, beforeEach, vi } from "vitest";

// Clave de TMDb de pega para los tests: SecretParam.value() de
// firebase-functions/params lee directamente de process.env en runtime.
process.env.TMDB_API_KEY ??= "test-tmdb-api-key";

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
