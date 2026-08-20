import { setGlobalOptions } from "firebase-functions/v2";
import { FUNCTIONS_REGION } from "./config/firebase";

// Debe ejecutarse antes de importar los módulos de funciones (2ª gen):
// fija la región por defecto para todas las Cloud Functions v2.
setGlobalOptions({ region: FUNCTIONS_REGION });

export { onUserCreated, updateUsername, getUserProfile } from "./functions/auth";
export { refreshTmdbPool, startGame, submitAnswer, finishGame } from "./functions/gameEngine";
export { submitToLeaderboard, saveGame, discardGame, getLeaderboard } from "./functions/scoring";
export { getUserGames } from "./functions/historial";
