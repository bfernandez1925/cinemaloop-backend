/**
 * Lógica pura de la clave de caché de correcciones de IA
 * (spec-ai-interpretation.md, CIN-35): estable frente a mayúsculas,
 * acentos y espacios repetidos del mismo texto de entrada.
 */
export function normalizeCorrectionCacheKey(textoUsuario: string): string {
  return textoUsuario
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
