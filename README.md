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
test/
  unit/               tests unitarios (lógica pura, sin emulador ni red)
  integration/        tests de integración contra el Firebase Emulator Suite
    mocks/            helpers para mockear TMDb/Claude (fetch) en tests de integración
firestore.rules        reglas de seguridad (deny-all)
firestore.indexes.json índices compuestos de Firestore
firebase.json           configuración de despliegue y emuladores
```

Cada función exportada en `src/index.ts` corresponde a una Cloud Function real desplegada. `onUserCreated` y `updateUsername` (auth) ya están implementadas; el resto siguen siendo stubs que lanzan `unimplemented`, cada uno referenciando la issue de Linear que lo implementará.

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
npm run lint             # ESLint
npm run format:check     # Prettier, solo verifica
npm run format           # Prettier, aplica el formato
npm run typecheck        # tsc --noEmit
npm test                 # unit + integration
npm run test:unit        # solo tests unitarios (rápidos, sin emulador)
npm run test:integration # solo tests de integración (levanta y para el Firebase Emulator Suite automáticamente)
```

Los tests de integración (`test/integration/`) corren contra el Firebase Emulator Suite (Firestore + Auth), que `npm run test:integration` levanta y para automáticamente vía `firebase emulators:exec` — no requiere pasos manuales ni un proyecto de Firebase real (usa el project id especial `demo-cinemaloop`, reconocido por el emulador sin necesidad de credenciales). Cualquier llamada a TMDb o a Claude debe mockearse con `mockFetchOnce` (`test/integration/mocks/externalServices.ts`); una llamada de red real no mockeada falla el test en vez de golpear la red, tanto en local como en CI.

## CI

GitHub Actions (`.github/workflows/ci.yml`) corre lint, typecheck y `npm test` (unit + integración con el Firebase Emulator Suite) en cada push a `main`/`develop` y en cada pull request. Un job en rojo bloquea el merge en `develop` (branch protection). Tiempo de referencia del pipeline: ~35 s (medido en la primera ejecución real, CIN-10).

## Build

```bash
npm run build
```

Compila TypeScript a `lib/`, que es lo que Firebase despliega.

## Variables de entorno

Copiar `.env.example` a **`.env.local`** (no `.env`: ese archivo se despliega tal cual como variables de entorno en texto plano, lo que choca con el secreto de Secret Manager del mismo nombre y rompe el deploy) y completar con las claves reales de TMDb y Anthropic para desarrollo local. Ninguna clave se expone nunca al cliente ni se commitea al repositorio.

## Autenticación

Firebase Authentication, solo email/contraseña en el MVP (ver `spec-auth.md`). El proveedor "Email/contraseña" se activa desde la consola de Firebase al configurar un proyecto real — no hay nada que activar en el emulador, que lo soporta siempre. Las reglas de seguridad de Firestore (`firestore.rules`) son deny-all para todas las colecciones, incluida `users/{uid}`: ni un cliente no autenticado ni el propio dueño del documento pueden leer o escribir directamente, solo las Cloud Functions (vía Admin SDK) — ver los tests de `test/integration/firestoreRules.test.ts`.

## Despliegue

Proyecto de Firebase real: `cinemaloop-platform` (plan Blaze, cuenta `bfernandez@intermarkit.es`), ya configurado como `default` en `.firebaserc`.

```bash
firebase login                                       # si no has iniciado sesión con bfernandez@intermarkit.es
firebase functions:secrets:set TMDB_API_KEY           # una vez; pide el valor de forma oculta
firebase deploy --only functions,firestore:rules
```

`TMDB_API_KEY` se consume vía `firebase-functions/params` (`defineSecret`): en local usa `.env.local` (ver arriba), en producción usa este secreto de Secret Manager — nunca hace falta poner el valor real en ningún archivo del repositorio.

## Relación con el resto del proyecto

- `cinemaloop-frontend`: consume exclusivamente las Cloud Functions expuestas aquí.
- `specs`: especificaciones funcionales y técnicas, y registro de decisiones de arquitectura (ADRs).
- Backlog y seguimiento de tareas: proyecto Cinemaloop en Linear.
