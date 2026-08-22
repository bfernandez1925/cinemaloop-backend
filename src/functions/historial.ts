import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { HISTORIAL_PAGE_SIZE } from "../config/historial";

interface GameHistoryDoc {
  fecha: string;
  modo: string;
  puntuacion_total: number;
  nodos_alcanzados?: number;
  enviada_a_ranking?: boolean;
}

/**
 * Devuelve el historial paginado de partidas del usuario autenticado
 * (enviadas o guardadas; nunca las descartadas, que ni siquiera existen
 * ya en Firestore tras `discardGame`). Solo lee `request.auth.uid`: no
 * hay ningún parámetro de uid que el cliente pueda manipular, así que
 * no hay ninguna forma de leer el historial de otro usuario.
 * Ver spec-historial.md.
 *
 * Filtra por `agregados_actualizados` (no solo `estado === "finalizada"`,
 * bug encontrado y corregido: una partida finalizada por `finishGame`
 * -por agotar turnos, retirada voluntaria o inactividad en Maratón- no
 * ha sido "guardada" hasta que el jugador confirma con éxito
 * `saveGame`/`submitToLeaderboard`, momento en el que
 * `applyUserAggregatesOnce` marca `agregados_actualizados` y actualiza
 * `partidas_jugadas`. Sin este filtro, el historial mostraba partidas
 * como "Guardada" que nunca incrementaron ese contador — dos fuentes de
 * verdad desincronizadas para lo mismo).
 */
export const getUserGames = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const paginaRaw = request.data?.pagina;
  const pagina =
    typeof paginaRaw === "number" && Number.isInteger(paginaRaw) && paginaRaw >= 0 ? paginaRaw : 0;

  const snapshot = await db
    .collection("games")
    .where("userId", "==", request.auth.uid)
    .where("estado", "==", "finalizada")
    .where("agregados_actualizados", "==", true)
    .orderBy("fecha", "desc")
    .offset(pagina * HISTORIAL_PAGE_SIZE)
    .limit(HISTORIAL_PAGE_SIZE)
    .get();

  const partidas = snapshot.docs.map((doc) => {
    const data = doc.data() as GameHistoryDoc;
    return {
      gameId: doc.id,
      fecha: data.fecha,
      modo: data.modo,
      puntuacion_total: data.puntuacion_total,
      nodos_alcanzados: data.nodos_alcanzados ?? 0,
      estado: data.enviada_a_ranking ? "Ranking" : "Guardada",
    };
  });

  return { pagina, partidas };
});
