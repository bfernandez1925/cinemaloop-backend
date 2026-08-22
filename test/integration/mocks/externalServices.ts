import { vi } from "vitest";

/**
 * Mockea la siguiente llamada a `fetch` con una respuesta JSON, para usar
 * en tests de integración que simulan una llamada a TMDb o a Claude sin
 * golpear la red real. Ver `test/integration/setup.ts`, que bloquea por
 * defecto cualquier llamada a `fetch` no mockeada explícitamente.
 */
export function mockFetchOnce(body: unknown, init: { status?: number } = {}): void {
  vi.mocked(fetch).mockImplementationOnce(
    async () =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

/**
 * Mockea todas las llamadas a `fetch` durante el resto del test, con una
 * respuesta que depende de la URL pedida. Útil cuando el código bajo
 * test hace varias llamadas distintas (p. ej. paginación) en vez de una
 * sola, a diferencia de `mockFetchOnce`.
 */
export function mockFetchImplementation(
  handler: (url: string) => { body: unknown; status?: number },
): void {
  vi.mocked(fetch).mockImplementation(async (input) => {
    const { body, status } = handler(String(input));
    return new Response(JSON.stringify(body), {
      status: status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
}
