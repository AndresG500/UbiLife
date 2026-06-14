# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

Monorepo with two independent projects:

- **`Backend/`** — FastAPI + MongoDB (Motor async), Python
- **`Fronted/`** — Expo SDK 56 React Native app

Neither project shares dependencies or build tooling with the other.

---

## Backend

### Commands

```bash
cd Backend
source .venv/bin/activate
uvicorn app:app --reload                   # dev (localhost only)
uvicorn app:app --host 0.0.0.0 --reload    # LAN (what the mobile app expects)
```

Use `.env.docker` as the template for `.env`. Key env vars:

| Var | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `HIVEMQ_*` | MQTT broker credentials |
| `ENVIRONMENT` | Set to `production` to disable `/docs` and `/redoc` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins; defaults to `*` |
| `TRUST_PROXY` | `1`/`true` to read IP from `X-Forwarded-For` |
| `SENTRY_DSN` | Optional; enables Sentry if present |

### Architecture

Three-layer pattern per module:

```
routes/ruta_X.py      → FastAPI router (HTTP endpoints)
services/service_X.py → Business logic
models/model_X.py     → Pydantic schemas (Base → Create → Response → Update)
```

**Modules:** `cuidador`, `paciente`, `dispositivo`, `historial`, `zonasegura`, `grupo`, `alerta`, `familiar`, `modo_viaje`

**MongoDB collections:** `Cuidadores`, `Familiares`, `Pacientes`, `Dispositivos`, `DispositivosDisponibles`, `Historial`, `ZonasSeguras`, `Alertas`, `Grupos`, `UbicacionesCuidadores`, `TokensRevocados`

TTL indexes (created in `app.py` lifespan):
- `TokensRevocados.exp` — auto-deletes when the JWT expires
- `UbicacionesCuidadores.timestamp` — auto-deletes after 15 min

**Background tasks** started in `app.py` lifespan:
- `mqtt_subscriber_task` — MQTT subscriber (HiveMQ Cloud), topic `ubilife/dispositivo/+/gps`
- `tarea_watchdog_gps` — checks for lost GPS signal every 30s
- `tarea_alertas` — re-sends unresolved alerts every 5 min

**Auth:** JWT via `PyJWT` (not python-jose). Two route dependencies in `security/dependencies.py`:
- `get_cuidador_actual` — cuidador-only routes
- `get_cuidador_o_familiar_actual` — shared routes

**Push notifications:** Expo Push API via `FCM/client.py` (despite the name, it does NOT use Firebase Admin SDK — `firebase_admin` is installed but unused).

**Real-time location:** SSE using in-memory `EventBus` in `utils/eventos.py`.

**Utilities:**
- `utils/Logger.py` — file logger (`utils/logs/`)
- `utils/geo.py` — geofence distance calculations
- `utils/sanitizer.py` — input sanitization
- `utilidades/geo.py` — separate geo helpers (not the same file as `utils/geo.py`)
- `utilidades/mongo_utils.py` — MongoDB ObjectId helpers

**Naming gotchas:**
- `routes/ruta_cliente.py` is the **cuidador** router (misleading filename)
- `FCM/client.py` sends via **Expo Push API**, not Firebase
- Two geo utility files exist: `utils/geo.py` and `utilidades/geo.py`

**All code (variables, functions, route names, collection names, comments) is written in Spanish.**

---

## Frontend

See `Fronted/AGENTS.md` (loaded automatically) for full SDK 56 quirks, commands, path aliases, and architecture details.

### Commands

```bash
cd Fronted
npm start              # dev server
npm run android        # native build (requires expo-dev-client)
npm run web            # browser
npx tsc --noEmit       # type-check
```

### Key facts

- **Routing:** file-based via expo-router in `src/app/`. Public screens at root; authenticated screens under `(app)/` (Drawer navigator). Authenticated screens: `index`, `pacientes`, `alertas`, `zonas-seguras`, `historial-ubicaciones`, `vincular-dispositivo`, `registro-paciente`, `grupo-familiar`, `perfil`.
- **Two user roles:** `cuidador` and `familiar` — separate API endpoints per role. The `cuidador` field in `AuthContext` holds user data for both roles; check `tipoUsuario` to distinguish.
- **Auth flow:** On startup, `AuthContext` validates the stored token by pinging `/cuidadores/perfil` or `/familiares/grupos` depending on `tipoUsuario`. Invalid tokens are cleared immediately.
- **API:** All service functions are in `src/services/api.ts`. `EXPO_PUBLIC_API_URL` env var, defaults to `http://10.0.2.2:8000` (Android emulator loopback).
- **Auth storage:** JWT in `expo-secure-store`, user metadata in `AsyncStorage`. Auto-logout on 401 via Axios interceptor in `src/services/api.ts`.
- **Map:** Leaflet inside `react-native-webview` (Stadia Maps tiles; API key in `.env`).
- **Real-time location:** `react-native-sse` hook in `src/hooks/useSSEUbicacion.ts` (max 10 retries, 60s GPS timeout).
- **Notifications:** Expo Push API (skips in Expo Go). Android channel: `ubilife_alertas`.
- **Styles:** `StyleSheet.create` only — no Tailwind, no styled-components.
- **Path aliases:** `@/*` → `./src/*`, `@/assets/*` → `./assets/*`

---

## Hardware

`Backend/esp32.ino` — firmware for the ESP32-C6-Zero + BZ-251 GPS module. Publishes NMEA-parsed coordinates over MQTT. Not part of the build pipeline; flash manually via FTDI232.

---

## Cross-cutting notes

- `google-services.json` in `Fronted/` targets `com.UbiLife.app`; `app.json` has `com.anonymous.Fronted` — these must match before a production build.
- No tests, no CI/CD, no pre-commit hooks.
- Docs UI (`/docs`, `/redoc`) is disabled when `ENVIRONMENT=production`.
- Rate limit: 120 req/60s per IP (in-memory, resets on restart).
