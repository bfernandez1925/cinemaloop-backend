import Anthropic from "@anthropic-ai/sdk";
import { defineSecret } from "firebase-functions/params";
import { db } from "../admin";
import { CLAUDE_MAX_RETRIES, CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "../config/ai";
import { normalizeCorrectionCacheKey } from "../lib/aiCache";
import { buildNormalizeAnswerPrompt } from "../prompts/normalizeAnswer";

export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

let client: Anthropic | undefined;
function getClient(): Anthropic {
  // El SDK captura `fetch` en el momento de construir el cliente; como
  // el cliente se reutiliza entre invocaciones (singleton), se pasa un
  // indirector que consulta `globalThis.fetch` en cada llamada en vez
  // de capturarlo una sola vez — si no, los tests que mockean fetch
  // por caso (vi.stubGlobal) no afectarían a un cliente ya construido.
  client ??= new Anthropic({
    apiKey: ANTHROPIC_API_KEY.value(),
    maxRetries: CLAUDE_MAX_RETRIES,
    fetch: (...args) => globalThis.fetch(...args),
  });
  return client;
}

export interface NormalizeAnswerResult {
  candidatos: string[];
  confianza: "alta" | "media" | "baja";
}

function parseNormalizeAnswerResult(text: string): NormalizeAnswerResult | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { candidatos?: unknown }).candidatos) &&
      (parsed as { candidatos: unknown[] }).candidatos.every((c) => typeof c === "string") &&
      typeof (parsed as { confianza?: unknown }).confianza === "string"
    ) {
      return parsed as NormalizeAnswerResult;
    }
    return null;
  } catch {
    return null;
  }
}

async function callClaude(textoUsuario: string): Promise<NormalizeAnswerResult | null> {
  const response = await getClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    messages: [{ role: "user", content: buildNormalizeAnswerPrompt(textoUsuario) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? parseNormalizeAnswerResult(textBlock.text) : null;
}

/**
 * Normaliza la entrada libre del usuario a un nombre canónico de
 * actor/película, con caché en Firestore (`correcciones_cache`, sin
 * TTL) para no repetir llamadas ante errores de escritura comunes. La
 * IA nunca decide si la respuesta es correcta para el juego, solo
 * normaliza el texto (spec-ai-interpretation.md). Cualquier fallo (de
 * red, de parseo, lo que sea) devuelve null en vez de propagar el
 * error: el turno nunca se bloquea por un fallo de la IA (CIN-34) —
 * quien llama debe usar el texto original como fallback.
 */
export async function normalizeAnswer(textoUsuario: string): Promise<NormalizeAnswerResult | null> {
  const cacheKey = normalizeCorrectionCacheKey(textoUsuario);
  const cacheRef = db.collection("correcciones_cache").doc(cacheKey);

  try {
    const cached = await cacheRef.get();
    if (cached.exists) {
      return cached.data() as NormalizeAnswerResult;
    }

    const result = await callClaude(textoUsuario);
    if (result) {
      await cacheRef.set(result);
    }
    return result;
  } catch {
    return null;
  }
}
