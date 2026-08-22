import { SPEED_BONUS_MAX_POINTS } from "../config/scoring";
import { TURN_TIME_LIMIT_SECONDS } from "../config/gameEngine";

/**
 * Bonus lineal por rapidez: `round(50 * tiempo_restante / 25)`, sobre el
 * límite de turno de modo Clásico. Se recorta a [0, 50] por si
 * `tiempoRestanteSegundos` llega fuera de rango (p. ej. negativo por un
 * cliente con reloj desincronizado). Ver spec-scoring-leaderboard.md.
 */
export function calculateSpeedBonus(tiempoRestanteSegundos: number): number {
  const tiempoRestante = Math.max(0, Math.min(TURN_TIME_LIMIT_SECONDS, tiempoRestanteSegundos));
  const bonus = Math.round((SPEED_BONUS_MAX_POINTS * tiempoRestante) / TURN_TIME_LIMIT_SECONDS);
  return Math.max(0, Math.min(SPEED_BONUS_MAX_POINTS, bonus));
}
