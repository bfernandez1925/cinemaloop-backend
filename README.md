# Cinemaloop — Backend

Cloud Functions de Cinemaloop: motor de juego, puntuación, ranking, historial y autenticación. Este repositorio es la única vía de lectura y escritura sobre Firestore; el cliente (`cinemaloop-frontend`) nunca se conecta directamente a la base de datos. Las reglas de seguridad de Firestore están en modo deny-all (`firestore.rules`).

Las especificaciones funcionales completas están en la carpeta `specs` del proyecto, fuera de este repositorio.

## Stack

- Firebase Cloud Functions (2ª generación) sobre Node.js 20, TypeScript en modo estricto.
- Firestore como base de datos.
- Firebase Authentication (email/contraseña en el MVP).
- ESLint + Prettier.
- Vitest, con tests de integración planificados contra el Firebase Emulator Suite.

## Estructura

```
src/
  admin.ts            inicialización del Admin SDK (Firestore)
  index.ts            punto de entrada, reexporta todas las Cloud Functions
  functions/
    auth.ts           onUserCreated, updateUsername
    gameEngine.ts      refreshTmdbPool, startGame, submitAnswer, finishGame
    scoring.ts         submitToLeaderboard, discardGame, getLeaderboard
    historial.ts        getUserGames
test/                 tests (Vitest)
firestore.rules        reglas de seguridad (deny-all)
firestore.indexes.json índices compuestos de Firestore
firebase.json           configuración de despliegue y emuladores
```

Cada función exportada en `src/index.ts` corresponde a una Cloud Function real desplegada. En este scaffold inicial, las funciones están implementadas como stubs que lanzan `unimplemented`; cada una referencia la issue de Linear que la implementará.

## Requisitos

- Node.js 20 o superior.
- npm.
- CLI de Firebase (`firebase-tools`, incluida como dependencia de desarrollo; se invoca con `npx firebase` o los scripts de `package.json`).

## Instalación

```bash
npm install
```

## Desarrollo local con el Firebase Emulator Suite

```bash
npm run emulators
```

Levanta los emuladores de Functions, Firestore y Auth (puertos 5001, 8080 y 9099; panel en `http://localhost:4000`). No requiere un proyecto de Firebase real ni credenciales: todo corre en local. `npm run serve` hace lo mismo pero compilando antes con `npm run build`.

## Comprobaciones de calidad

```bash
npm run lint         # ESLint
npm run format:check # Prettier, solo verifica
npm run format       # Prettier, aplica el formato
npm run typecheck    # tsc --noEmit
npm test             # Vitest
```

## Build

```bash
npm run build
```

Compila TypeScript a `lib/`, que es lo que Firebase despliega.

## Variables de entorno

Copiar `.env.example` a `.env` y completar con las claves reales de TMDb y Anthropic para desarrollo local. Ninguna clave se expone nunca al cliente ni se commitea al repositorio. Este proyecto no gestiona todavía entornos reales (desarrollo/staging/producción) — esa configuración, y el proyecto de Firebase asociado en `.firebaserc`, se abordarán más adelante.

## Despliegue

```bash
firebase deploy --only functions,firestore:rules
```

Requiere haber sustituido `REPLACE_WITH_FIREBASE_PROJECT_ID` en `.firebaserc` por el ID de un proyecto de Firebase real y estar autenticado con `firebase login`. No se ha configurado ningún proyecto real todavía.

## Relación con el resto del proyecto

- `cinemaloop-frontend`: consume exclusivamente las Cloud Functions expuestas aquí.
- `specs`: especificaciones funcionales y técnicas, y registro de decisiones de arquitectura (ADRs).
- Backlog y seguimiento de tareas: proyecto Cinemaloop en Linear.
