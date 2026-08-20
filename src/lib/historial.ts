/**
 * Lógica pura de los agregados de usuario (users/{uid}): sin Firestore,
 * para poder cubrirla con tests unitarios rápidos.
 */

export interface UserAggregates {
  mejor_puntuacion: number;
  cadena_mas_larga: number;
  partidas_jugadas: number;
}

export interface GameOutcome {
  puntuacion_total: number;
  nodos_alcanzados: number;
}

/**
 * Aplica una partida guardada/enviada a los agregados de usuario:
 * `partidas_jugadas` siempre +1; `mejor_puntuacion`/`cadena_mas_larga`
 * solo suben si la nueva partida supera el máximo histórico, nunca a
 * la baja. Ver spec-historial.md.
 */
export function applyGameToAggregates(
  current: UserAggregates,
  game: GameOutcome,
): UserAggregates {
  return {
    mejor_puntuacion: Math.max(current.mejor_puntuacion, game.puntuacion_total),
    cadena_mas_larga: Math.max(current.cadena_mas_larga, game.nodos_alcanzados),
    partidas_jugadas: current.partidas_jugadas + 1,
  };
}
