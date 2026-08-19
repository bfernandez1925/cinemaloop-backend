import { vi } from "vitest";

/**
 * Mockea la siguiente llamada a `fetch` con una respuesta JSON, para usar
 * en tests de integración que simulan una llamada a TMDb o a Claude sin
 * golpear la red real. Ver `test/integration/setup.ts`, que bloquea por
 * defecto cualquier llamada a `fetch` no mockeada explícitamente.
 */
export function mockFetchOnce(body: unknown, init: { status?: number } = {}): void {
  vi.mocked(fetch).mockImplementationOnce(
    async () => new Response(JSON.stringify(body), { status: init.status ?? 200 }),
  );
}
