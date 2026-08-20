/**
 * Constantes de la integración con Claude (spec-ai-interpretation.md).
 */

/** Modelo usado para normalizar respuestas: tarea acotada, se prioriza latencia/coste. */
export const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

export const CLAUDE_MAX_TOKENS = 256;

/**
 * El SDK reintenta 2 veces por defecto con backoff exponencial; como
 * ya hay un fallback (texto original a TMDb) si Claude falla, esperar
 * varios reintentos solo retrasa el turno del jugador sin beneficio —
 * se falla rápido con como máximo un reintento.
 */
export const CLAUDE_MAX_RETRIES = 1;
