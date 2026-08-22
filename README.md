# Cinemaloop — Backend

Cloud Functions de Cinemaloop, el juego de encadenar actores y películas contra reloj: motor de juego (cuatro modos — Clásico, Contrarreloj, Maratón e Infantil), puntuación, ranking global por modo, historial de partidas y autenticación. Este repositorio es la única vía de lectura y escritura sobre Firestore; el cliente ([cinemaloop-frontend](https://github.com/bfernandez1925/cinemaloop-frontend)) nunca se conecta directamente a la base de datos, solo llama a las Cloud Functions expuestas aquí. Las reglas de seguridad de Firestore están en modo deny-all (`firestore.rules`): ni siquiera el propio dueño de un documento puede leerlo o escribirlo sin pasar por una función.

Las especificaciones funcionales completas y las decisiones de arquitectura (ADRs) están en [cinemaloop-specs](https://github.com/bfernandez1925/cinemaloop-specs), el tercer repositorio del proyecto.

## Qué servicios de Firebase/Google Cloud usa este repositorio

- **Cloud Functions** (2ª generación): toda la lógica de negocio — doce funciones desplegadas, todas listadas en `src/index.ts`.
- **Firestore**: la única base de datos del proyecto, con reglas deny-all e índices compuestos propios para las consultas del ranking por modo (`firestore.indexes.json`).
- **Firebase Authentication**: email/contraseña en el MVP; el trigger `onUserCreated` crea el perfil del usuario en Firestore en cuanto se registra.
- **Cloud Scheduler**: dispara `refreshTmdbPool` una vez a la semana para refrescar el catálogo de partidas desde TMDb, sin que ninguna partida real tenga que esperar a esa llamada.
- **Secret Manager**: guarda las claves de TMDb y de la API de Claude (Anthropic) fuera del código y fuera del repositorio.

Además de estos, la API de **TMDb** provee todo el contenido del juego (actores, películas, reparto, filmografías) y la API de **Claude** (Anthropic) normaliza el texto libre que escribe o dicta el jugador antes de buscarlo en TMDb — ver "Interpretación de respuestas con IA" más abajo.

## Stack

- Firebase Cloud Functions (2ª generación) sobre Node.js 22, TypeScript en modo estricto.
- Firestore como base de datos.
- Firebase Authentication (email/contraseña en el MVP).
- Cliente de la API de TMDb (contenido del juego) y de la API de Claude, Anthropic (normalización de respuestas).
- ESLint + Prettier.
- Vitest, con tests unitarios y de integración contra el Firebase Emulator Suite.

## Estructura

```
src/
  admin.ts            inicialización del Admin SDK (Firestore)
  index.ts            punto de entrada, reexporta todas las Cloud Functions
  clients/            TMDb, Claude, y su caché en Firestore
  config/             constantes ajustables (puntuación, límites de tiempo, IA...)
  prompts/            construcción del prompt que se envía a Claude
  functions/
    auth.ts           onUserCreated, updateUsername, getUserProfile
    gameEngine.ts      refreshTmdbPool, startGame, submitAnswer, finishGame
    scoring.ts         submitToLeaderboard, saveGame, discardGame, getLeaderboard
    historial.ts       getUserGames
  lib/                 lógica pura (motor de juego, puntuación...), sin Firestore
                       ni red, para poder testearla como funciones normales
test/
  unit/               tests unitarios (lógica pura, sin emulador ni red)
  integration/        tests de integración contra el Firebase Emulator Suite
    mocks/            helpers para mockear TMDb/Claude (fetch) en tests de integración
firestore.rules        reglas de seguridad (deny-all)
firestore.indexes.json índices compuestos de Firestore
firebase.json           configuración de despliegue y emuladores
```

Todas las funciones exportadas en `src/index.ts` están implementadas y desplegadas en producción — los cuatro modos de juego, el ranking global separado por modo, el historial de partidas y la normalización de respuestas con IA.

## Requisitos

- Node.js 22.
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

Firebase Authentication, solo email/contraseña en el MVP (ver [specauth.md](https://github.com/bfernandez1925/cinemaloop-specs/blob/main/specauth.md) en `cinemaloop-specs`). El proveedor "Email/contraseña" se activa desde la consola de Firebase al configurar un proyecto real — no hay nada que activar en el emulador, que lo soporta siempre. Las reglas de seguridad de Firestore (`firestore.rules`) son deny-all para todas las colecciones, incluida `users/{uid}`: ni un cliente no autenticado ni el propio dueño del documento pueden leer o escribir directamente, solo las Cloud Functions (vía Admin SDK) — ver los tests de `test/integration/firestoreRules.test.ts`.

## Interpretación de respuestas con IA

Cuando el jugador responde con texto libre (escrito o dictado por voz), `submitAnswer` envía ese texto a la API de Claude (`src/clients/claude.ts`) antes de buscarlo en TMDb, con un prompt acotado a una sola tarea: normalizarlo al nombre real más probable de un actor o al título real más probable de una película, sin decidir nunca si esa respuesta es correcta para la partida — esa validación sigue siendo del motor de juego, no de la IA. El resultado se cachea en Firestore (`correcciones_cache`) para no repetir la misma llamada ante errores de escritura habituales.

El texto original del jugador se prueba siempre como última opción, incluso cuando Claude sí devuelve una sugerencia: la IA normaliza sin saber qué actor o película espera realmente ese turno, así que a veces "corrige" con confianza hacia una entidad real pero distinta de la esperada — sin ese texto original de respaldo, esa corrección equivocada haría perder el turno aunque la respuesta tal cual, buscada en TMDb, hubiera sido la correcta. Cualquier fallo de la IA (red, parseo, lo que sea) cae en el mismo sitio: el turno nunca se bloquea por un error de Claude.

## Despliegue

Proyecto de Firebase real: `cinemaloop-platform` (plan Blaze, cuenta `bfernandez@intermarkit.es`), ya configurado como `default` en `.firebaserc`.

```bash
firebase login                                       # si no has iniciado sesión con bfernandez@intermarkit.es
firebase functions:secrets:set TMDB_API_KEY           # una vez; pide el valor de forma oculta
firebase functions:secrets:set ANTHROPIC_API_KEY      # una vez; pide el valor de forma oculta
firebase deploy --only functions,firestore:rules,firestore:indexes
```

`TMDB_API_KEY` y `ANTHROPIC_API_KEY` se consumen vía `firebase-functions/params` (`defineSecret`): en local usan `.env.local` (ver arriba), en producción usan estos secretos de Secret Manager — nunca hace falta poner ningún valor real en ningún archivo del repositorio.

## Relación con el resto del proyecto

- [cinemaloop-frontend](https://github.com/bfernandez1925/cinemaloop-frontend): consume exclusivamente las Cloud Functions expuestas aquí.
- [cinemaloop-specs](https://github.com/bfernandez1925/cinemaloop-specs): especificaciones funcionales y técnicas, y registro de decisiones de arquitectura (ADRs).
- Backlog y seguimiento de tareas: proyecto Cinemaloop en Linear.
