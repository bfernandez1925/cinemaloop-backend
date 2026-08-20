/**
 * Lógica pura del motor de juego: sin Firestore ni TMDb, para poder
 * cubrirla con tests unitarios rápidos (ver spec-testing-quality.md).
 */

export type NodeType = "actor" | "pelicula";

export interface PoolEntity {
  tipo: NodeType;
  entidad_tmdb_id: number;
  nombre: string;
  imagen: string | null;
}

export interface ActorNode extends PoolEntity {
  tipo: "actor";
  pais_origen: string | null;
  anio_nacimiento: number | null;
}

export type GameNode = PoolEntity | ActorNode;

export type GameMode = "clasico" | "contrarreloj" | "maraton";

export const GAME_MODES: GameMode[] = ["clasico", "contrarreloj", "maraton"];

/** Extrae el año de un `birthday` de TMDb ("YYYY-MM-DD"), o null si no hay. */
export function extractBirthYear(birthday: string | null | undefined): number | null {
  if (!birthday) {
    return null;
  }
  const year = Number.parseInt(birthday.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/** Enriquece un nodo de actor con país de origen y año de nacimiento. */
export function toActorNode(
  entity: PoolEntity,
  details: { place_of_birth: string | null; birthday: string | null },
): ActorNode {
  return {
    ...entity,
    tipo: "actor",
    pais_origen: details.place_of_birth,
    anio_nacimiento: extractBirthYear(details.birthday),
  };
}

/**
 * Resuelve ambigüedad entre varios candidatos eligiendo el de mayor
 * `popularity` de TMDb, sin bloquear el turno (spec-game-engine.md).
 */
export function pickMostPopular<T extends { popularity: number }>(candidates: T[]): T | null {
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, candidate) => (candidate.popularity > best.popularity ? candidate : best));
}

/** Una entidad no puede aparecer dos veces en la misma partida. */
export function isAlreadyUsed(usados: number[], tmdbId: number): boolean {
  return usados.includes(tmdbId);
}

/** Valida que un id de TMDb esté en un listado de reparto/filmografía. */
export function isInCast(cast: Array<{ id: number }>, tmdbId: number): boolean {
  return cast.some((entry) => entry.id === tmdbId);
}

export interface GameDoc {
  userId: string;
  modo: GameMode;
  estado: "en_curso" | "finalizada";
  nodo_actual: GameNode;
  usados: number[];
  puntuacion_total: number;
  nodos_alcanzados?: number;
  tiempo_total?: number;
  tiempo_medio_respuesta?: number;
  enviada_a_ranking?: boolean;
  agregados_actualizados?: boolean;
  /** Suma de tiempo_respuesta_segundos de los turnos superados (modo Contrarreloj). */
  tiempo_acumulado?: number;
  /** ISO de la última llamada a submitAnswer sobre esta partida (modo Maratón). */
  ultima_actividad?: string;
}

/**
 * Detecta si ha pasado más tiempo del permitido desde la última
 * actividad registrada en la partida (modo Maratón). Ver
 * spec-game-engine.md — el umbral en sí vive en config/gameEngine.ts.
 */
export function hasExceededInactivityTimeout(
  ultimaActividadIso: string,
  ahoraIso: string,
  timeoutSegundos: number,
): boolean {
  const transcurridoMs = new Date(ahoraIso).getTime() - new Date(ultimaActividadIso).getTime();
  return transcurridoMs > timeoutSegundos * 1000;
}

export interface TurnRecord {
  tiempo_respuesta_segundos: number;
}

export interface GameSummary {
  nodos_alcanzados: number;
  tiempo_total: number;
  tiempo_medio_respuesta: number;
}

/** Resumen de fin de partida a partir de los turnos superados. */
export function summarizeTurns(turns: TurnRecord[]): GameSummary {
  const tiempoTotal = turns.reduce((sum, turn) => sum + turn.tiempo_respuesta_segundos, 0);
  return {
    nodos_alcanzados: turns.length,
    tiempo_total: tiempoTotal,
    tiempo_medio_respuesta: turns.length > 0 ? tiempoTotal / turns.length : 0,
  };
}
