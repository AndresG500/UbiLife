# UbiLife — monorepo

Two independent projects side by side:

- **`Backend/`** — FastAPI + MongoDB (Motor async)
- **`Fronted/`** — Expo SDK 56 (see `Fronted/AGENTS.md` for frontend-specific guidance)

---

## Backend (`Backend/`)

### Run

```bash
cd Backend
# requires .env (see .env.docker for template)
uvicorn app:app --reload          # dev
uvicorn app:app --host 0.0.0.0    # LAN (what the app expects)
```

### Key facts

- **FastAPI** with lifespan-managed background tasks: MQTT subscriber, GPS watchdog (30s), alert re-send (5min)
- **MongoDB** via `motor` (async). Collections: Cuidadores, Familiares, Pacientes, Dispositivos, DispositivosDisponibles, Historial, ZonasSeguras, Alertas, Grupos, UbicacionesCuidadores, TokensRevocados
- **JWT auth** (`PyJWT`, NOT python-jose). Tokens in `security/jwt_handler.py`. Two role dependencies: `get_cuidador_actual` and `get_cuidador_o_familiar_actual` in `security/dependencies.py`
- **Rate limiting**: 120 req/60s per IP (in-memory, app.py)
- **MQTT** (HiveMQ Cloud): subscribes `ubilife/dispositivo/+/gps`, processes location + alerts
- **Push notifications**: uses **Expo Push API** (`FCM/client.py` — name is misleading), NOT Firebase Admin SDK
- **SSE** for real-time location: in-memory `EventBus` (`utils/eventos.py`)
- **Sentry** optional via `SENTRY_DSN` env var
- **Code in Spanish**: all variables, functions, routes, collections, comments
- **No tests, no CI/CD, no Docker** (docker-compose template exists at `.env.docker`)

### Architecture pattern

Each module (`routes/`, `models/`, `services/`) has three layers:
```
routes/ruta_X.py    → FastAPI router (endpoints)
services/service_X.py → Business logic
models/model_X.py   → Pydantic schemas (Base → Create → Response → Update)
```

---

## Frontend (`Fronted/`)

See `Fronted/AGENTS.md` for detailed SDK 56 quirks, commands, path aliases, and architecture.

Key points not covered there:
- **Map**: Leaflet inside `react-native-webview` (Stadia Maps tiles; API key in `.env`)
- **Notifications**: Expo Push API (not FCM), skips in Expo Go
- **Auth**: token in `expo-secure-store`, user metadata in `AsyncStorage`, auto-logout on 401
- **Styles**: `StyleSheet.create` only
- **No ESLint config** yet — `npm run lint` runs `expo lint` (no-op until set up)
- **No test framework**

### Commands

| Action | Command |
|---|---|
| Dev server | `npm start` |
| Web | `npm run web` |
| Android | `npm run android` |
| iOS | `npm run ios` |
| Type-check | `npx tsc --noEmit` |
| Lint | `npm run lint` (no-op until configured) |

### Path aliases

- `@/*` → `./src/*`
- `@/assets/*` → `./assets/*`

---

## Cross-cutting

- `Backend/.env` and `Fronted/.env` are **not committed** (in `.gitignore`). Backend uses `.env.docker` as template.
- `google-services.json` in Fronted targets `com.UbiLife.app`; `app.json` has `com.anonymous.Fronted` — verify before build.
- No pre-commit hooks, no CI workflows.
