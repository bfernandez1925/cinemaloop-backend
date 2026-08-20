/**
 * Prompt de normalización de respuestas (spec-ai-interpretation.md).
 * Versionado aparte del código que lo usa (src/clients/claude.ts) para
 * poder ajustar precisión con el tiempo sin tocar la lógica de
 * llamada. Cambiar `NORMALIZE_ANSWER_PROMPT_VERSION` al modificar el
 * texto, para poder correlacionar resultados con la versión del prompt.
 */
export const NORMALIZE_ANSWER_PROMPT_VERSION = "v1";

export function buildNormalizeAnswerPrompt(textoUsuario: string): string {
  return `Tarea: normaliza el siguiente texto (puede venir con errores de escritura o de transcripción de voz) al nombre propio real más probable de un actor/actriz o al título real más probable de una película.

Instrucciones:
- Responde ÚNICAMENTE con un JSON válido, sin explicaciones ni texto adicional, con esta forma exacta:
  {"candidatos": ["..."], "confianza": "alta"}
- "candidatos": hasta 3 nombres/títulos reales más probables, en orden de probabilidad. Si no hay ninguna interpretación razonable, devuelve un array vacío.
- "confianza" es "alta", "media" o "baja": "alta" si estás seguro de la interpretación, "media" si hay ambigüedad real entre varias personas o películas, "baja" si el texto es muy poco claro.
- No decidas si la respuesta es correcta para ningún juego ni para ningún contexto: solo normaliza el texto a un nombre propio real.

Texto del usuario: "${textoUsuario}"`;
}
