import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "../../src/admin";
import { normalizeAnswer } from "../../src/clients/claude";
import { normalizeCorrectionCacheKey } from "../../src/lib/aiCache";
import { mockFetchOnce } from "./mocks/externalServices";

function anthropicTextResponse(text: string) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-haiku-4-5-20251001",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

describe("caché de correcciones de IA (CIN-35)", () => {
  it("una corrección ya cacheada no genera una nueva llamada a Claude para el mismo texto", async () => {
    // Texto único por test para no chocar con la caché de otros tests
    // en el mismo Firestore emulado compartido.
    const texto = `brapit-${randomUUID()}`;

    mockFetchOnce(anthropicTextResponse('{"candidatos": ["Brad Pitt"], "confianza": "alta"}'));
    const primera = await normalizeAnswer(texto);
    expect(primera).toEqual({ candidatos: ["Brad Pitt"], confianza: "alta" });

    // No se mockea ninguna llamada más: si normalizeAnswer llamara a
    // Claude otra vez, chocaría con el guard de red real y devolvería
    // null en vez del valor cacheado.
    const segunda = await normalizeAnswer(texto);
    expect(segunda).toEqual({ candidatos: ["Brad Pitt"], confianza: "alta" });
  });

  it("la clave de caché es estable frente a mayúsculas/acentos: una variación trivial también usa la caché", async () => {
    const texto = `Meril Estrip ${randomUUID()}`;

    mockFetchOnce(anthropicTextResponse('{"candidatos": ["Meryl Streep"], "confianza": "media"}'));
    await normalizeAnswer(texto);

    // Mismo texto con mayúsculas/espacios distintos: debe seguir dando
    // con la misma entrada de caché, sin llamar a Claude de nuevo.
    const variante = `  ${texto.toUpperCase()}  `;
    const resultado = await normalizeAnswer(variante);
    expect(resultado).toEqual({ candidatos: ["Meryl Streep"], confianza: "media" });
  });

  it("cachea con la clave normalizada, no con el texto original", async () => {
    const texto = `Alpasino ${randomUUID()}`;

    mockFetchOnce(anthropicTextResponse('{"candidatos": ["Al Pacino"], "confianza": "alta"}'));
    await normalizeAnswer(texto);

    const cacheSnapshot = await db
      .collection("correcciones_cache")
      .doc(normalizeCorrectionCacheKey(texto))
      .get();
    expect(cacheSnapshot.exists).toBe(true);
    expect(cacheSnapshot.data()).toEqual({ candidatos: ["Al Pacino"], confianza: "alta" });
  });
});
