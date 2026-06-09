# Expo SDK 56 — UbiLife Frontend

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Commands

- `npm start` — dev server
- `npm run web` — browser via `expo start --web`
- `npm run android` / `npm run ios` — native dev builds (requires `expo-dev-client`)
- `npm run lint` — run after `npx expo lint` sets up ESLint (no config yet)
- `npx tsc --noEmit` — type-check (no test framework configured)

## Architecture

- **Entrypoint**: `expo-router/entry` (package.json `main`)
- **Routing**: file-based in `src/app/` — public screens at root, authenticated screens under `(app)/` (Drawer navigator)
- **Auth**: token in `expo-secure-store`, user in `AsyncStorage`; auto-logout on 401 via Axios interceptor
- **Two user roles**: `cuidador` / `familiar` — separate API endpoints
- **API base**: `EXPO_PUBLIC_API_URL` env var, defaults to `http://10.0.2.2:8000`
- **Real-time**: `react-native-sse` for location streaming; `expo-notifications` for push (skips in Expo Go)
- **Map**: Leaflet inside `react-native-webview`
- **Styles**: `StyleSheet.create` only — no Tailwind, no styled-components

## SDK 56 quirks

- **No `@react-navigation/*`**: expo-router no longer depends on react-navigation. Import `useNavigation`, `useFocusEffect` from `expo-router` instead.
- **Drawer methods**: `openDrawer()` / `closeDrawer()` exist at runtime but are missing from types — cast `(navigation as any).openDrawer()`.
- **`typedRoutes: true`** is enabled in `app.json`. Route strings are type-checked; do NOT use `as any` casts with `router.push`/`replace`.
- **`reactCompiler: true`** is enabled (Babel plugin bundled via `babel-preset-expo`).
- **`@expo/vector-icons`** is NOT included by default — install explicitly.
- **`StyleSheet.absoluteFillObject`** removed from RN 0.85 types — use inline `{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }`.

## Path aliases

- `@/*` → `./src/*`
- `@/assets/*` → `./assets/*`

## Other

- `expo-env.d.ts` is auto-generated — do not edit
- `.expo/types/router.d.ts` is auto-generated typed routes
- Notifications conditionally loaded to avoid Expo Go crash; Android channel `ubilife_alertas`
- SSE hook: max 10 retries, exponential backoff (5s–60s), 60s GPS timeout
- `google-services.json` targets `com.UbiLife.app` (app.json has `com.anonymous.Fronted` — verify)
- Metro: delete `node_modules/.cache/metro` if changes aren't picked up
- VSCode: `expo.vscode-expo-tools` recommended; `source.fixAll` + organize imports on save
