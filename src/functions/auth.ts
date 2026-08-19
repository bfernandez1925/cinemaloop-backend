import * as functionsV1 from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";

/**
 * Trigger de Firebase Authentication: crea el documento de perfil del
 * usuario al registrarse. El cliente nunca escribe directamente en
 * `users/{uid}` (ver spec-auth.md, reglas deny-all en firestore.rules).
 */
export const onUserCreated = functionsV1.auth.user().onCreate(async (user) => {
  await db
    .collection("users")
    .doc(user.uid)
    .set({
      nombre_usuario: user.displayName ?? null,
      fecha_registro: new Date().toISOString(),
      mejor_puntuacion: 0,
      cadena_mas_larga: 0,
      partidas_jugadas: 0,
    });
});

/**
 * Actualiza el nombre de usuario del perfil autenticado.
 * Ver spec-auth.md, CIN-13.
 */
export const updateUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  throw new HttpsError("unimplemented", "updateUsername: pendiente de implementar (CIN-13).");
});
