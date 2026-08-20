import * as functionsV1 from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "../admin";
import { FUNCTIONS_REGION } from "../config/firebase";

/**
 * Trigger de Firebase Authentication: crea el documento de perfil del
 * usuario al registrarse. El cliente nunca escribe directamente en
 * `users/{uid}` (ver spec-auth.md, reglas deny-all en firestore.rules).
 * `setGlobalOptions` (v2) no aplica a triggers v1 — región explícita.
 */
export const onUserCreated = functionsV1
  .region(FUNCTIONS_REGION)
  .auth.user()
  .onCreate(async (user) => {
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
 * Devuelve los agregados de perfil del usuario autenticado
 * (`mejor_puntuacion`/`cadena_mas_larga`/`partidas_jugadas`, ver
 * spec-historial.md y CIN-30) más su nombre de usuario. Solo opera sobre
 * `request.auth.uid`, igual que `updateUsername` — no hay ningún
 * parámetro de uid que el cliente pueda manipular. Si el documento no
 * existe (no debería pasar tras `onUserCreated`, pero por robustez), se
 * devuelven los agregados a 0 en vez de lanzar un error.
 */
export const getUserProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const snapshot = await db.collection("users").doc(request.auth.uid).get();
  const data = snapshot.data();

  return {
    nombre_usuario: (data?.nombre_usuario as string | null | undefined) ?? null,
    mejor_puntuacion: (data?.mejor_puntuacion as number | undefined) ?? 0,
    cadena_mas_larga: (data?.cadena_mas_larga as number | undefined) ?? 0,
    partidas_jugadas: (data?.partidas_jugadas as number | undefined) ?? 0,
  };
});

/**
 * Actualiza el nombre de usuario del perfil autenticado. Solo opera
 * sobre `request.auth.uid`: no existe ningún parámetro de uid que el
 * cliente pueda manipular, así que no hay ninguna forma de modificar el
 * documento de otro usuario. Ver spec-auth.md.
 */
export const updateUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const nombreUsuario = request.data?.nombre_usuario;
  if (typeof nombreUsuario !== "string" || nombreUsuario.trim().length === 0) {
    throw new HttpsError("invalid-argument", "nombre_usuario es obligatorio.");
  }

  await db
    .collection("users")
    .doc(request.auth.uid)
    .update({ nombre_usuario: nombreUsuario.trim() });
});
