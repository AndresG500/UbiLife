# UbiLife — Contexto General del Proyecto

## ¿Qué es UbiLife?

UbiLife es una aplicación móvil de rastreo GPS en tiempo real diseñada específicamente para el monitoreo de pacientes con Alzheimer. El objetivo principal es permitir que cuidadores (familiares o personas responsables) puedan conocer en todo momento la ubicación de un paciente, recibir alertas cuando este salga de zonas seguras definidas, y actuar rápidamente ante situaciones de riesgo.

El proyecto es el trabajo de grado de dos estudiantes de la Universidad Cooperativa de Colombia (sede Santa Marta), cursando su último semestre de carrera.

---

## Problema que resuelve

Los pacientes con Alzheimer tienen tendencia a desorientarse y alejarse de sus entornos seguros sin previo aviso. Los cuidadores no siempre pueden tener vigilancia constante, lo que representa un riesgo real para la integridad del paciente. UbiLife busca ser una herramienta tecnológica accesible que cubra esa brecha mediante rastreo continuo, geocercas configurables y notificaciones push instantáneas.

---

## Stack tecnológico confirmado

| Capa | Tecnología |
|---|---|
| Hardware / GPS | ESP32-C6-Zero + módulo BZ-251 (u-blox M10) |
| Protocolo de comunicación | MQTT (broker: HiveMQ Cloud — tier gratuito permanente) |
| Backend | FastAPI (Python) + MongoDB (Motor — driver async) |
| Autenticación | JWT (JSON Web Tokens) |
| Notificaciones push | Firebase Cloud Messaging (FCM) via `firebase_admin` |
| Frontend móvil | React Native con Expo |
| Mapas | `react-native-maps` + Google Maps API |
| Repositorio | GitHub — monorepo con subdirectorios `Backend/` y `Front/` |

---

## Arquitectura general del sistema

```
[ESP32-C6-Zero + BZ-251]
        |
        | MQTT publish (coordenadas GPS)
        v
[HiveMQ Cloud — Broker MQTT]
        |
        | MQTT subscribe (FastAPI)
        v
[Backend FastAPI]
   ├── Guarda historial en MongoDB
   ├── Actualiza última ubicación del paciente
   ├── Evalúa geocercas (zonas seguras)
   └── Dispara alertas via FCM si hay violación de geocerca
        |
        v
[MongoDB — Base de datos principal]

[React Native App]
   ├── Consulta ubicación en tiempo real vía HTTP (FastAPI)
   ├── Muestra mapa con react-native-maps + Google Maps
   ├── Gestiona cuidadores, pacientes, grupos y zonas seguras
   └── Recibe notificaciones push (FCM + Notifee)
```

---

## Estructura del backend

El backend está organizado en **7 módulos**, cada uno con tres capas internas:

```
Backend/
├── main.py
├── database.py
└── app/
    ├── cuidador/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    ├── paciente/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    ├── dispositivo/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    ├── historial/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    ├── zonasegura/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    ├── grupo/
    │   ├── models.py
    │   ├── services.py
    │   └── router.py
    └── alerta/
        ├── models.py
        ├── services.py
        └── router.py
```

### Convenciones de código

- Todo el código (nombres de variables, funciones, colecciones, campos) está escrito **en español**.
- Los modelos Pydantic siguen el patrón: `Base → Create → Response → Update`.
- El driver de MongoDB utilizado es **Motor** (async), compatible con el paradigma async/await de FastAPI.
- Las colecciones de MongoDB se obtienen desde un scope global (base de datos inicializada en `database.py`).

---

## Descripción de cada módulo

### 1. `cuidador`
Gestiona a los usuarios principales de la app: las personas responsables del cuidado del paciente. Contiene operaciones CRUD completas. Almacena el `fcm_token` necesario para el envío de notificaciones push vía FCM.

**Campos principales:** nombre, correo, contraseña (hasheada), teléfono, `fcm_token`.

---

### 2. `paciente`
Gestiona los datos de los pacientes con Alzheimer. Cada paciente está asociado a uno o más cuidadores (a través del módulo `grupo`). Almacena la **última ubicación conocida** del paciente (`ultima_ubicacion`), que se actualiza cada vez que llega una nueva coordenada desde el hardware.

**Campos principales:** nombre, fecha de nacimiento, descripción médica, `ultima_ubicacion` (lat/lng + timestamp), referencia al dispositivo asignado.

---

### 3. `dispositivo`
Representa el hardware físico (ESP32-C6-Zero) asignado a un paciente. Permite identificar qué dispositivo pertenece a qué paciente y gestionar su estado.

**Campos principales:** identificador único del dispositivo, estado (activo/inactivo), referencia al paciente asignado.

---

### 4. `historial`
Registra el historial completo de ubicaciones GPS de cada paciente. Cada entrada es un punto geográfico con timestamp. Además de guardar el registro, este módulo **actualiza `ultima_ubicacion` directamente en la colección de Pacientes** cada vez que se inserta una nueva ubicación.

**Campos principales:** `paciente_id`, latitud, longitud, timestamp.

---

### 5. `zonasegura`
Permite a los cuidadores definir zonas geográficas seguras (geocercas) para un paciente. Cuando el paciente sale de una de estas zonas, el sistema debe generar una alerta. La zona se define típicamente como un círculo con centro (lat/lng) y radio en metros.

**Campos principales:** nombre de la zona, `paciente_id`, latitud del centro, longitud del centro, radio (metros), estado (activa/inactiva).

---

### 6. `grupo`
Establece la relación entre cuidadores y pacientes. Un cuidador puede tener múltiples pacientes y un paciente puede tener múltiples cuidadores. Este módulo gestiona esa relación many-to-many.

**Campos principales:** `cuidador_id`, `paciente_id`, rol del cuidador en el grupo (principal, secundario, etc.).

> ⚠️ El router de este módulo está pendiente de completar.

---

### 7. `alerta`
Módulo encargado de registrar y despachar alertas cuando un paciente sale de una zona segura. Se integra con FCM para enviar notificaciones push a los cuidadores correspondientes. Las alertas tienen estados (pendiente, enviada, resuelta).

**Campos principales:** `paciente_id`, `zonasegura_id`, tipo de alerta, timestamp, estado, mensaje.

> ⚠️ Este módulo está siendo desarrollado paso a paso y es el siguiente en prioridad.

---

## Funcionalidades pendientes de implementar

| Funcionalidad | Estado |
|---|---|
| Módulo `alerta` completo | 🔧 En desarrollo |
| FCM via `firebase_admin` | ⏳ Pendiente |
| JWT para autenticación | ⏳ Pendiente |
| Integración MQTT (subscriber en FastAPI) | ⏳ Pendiente |
| Índices en MongoDB | ⏳ Pendiente |
| Manejo global de errores (middleware) | ⏳ Pendiente |
| Router de `grupo` | ⏳ Pendiente |

---

## Hardware

- **Microcontrolador:** ESP32-C6-Zero
- **Módulo GPS:** BZ-251 (chip u-blox M10, baudrate 38400)
- **Conexión UART:** GPIO16 (RX) y GPIO17 (TX) — UART2 del ESP32
- **Librería GPS:** TinyGPSPlus
- **Rol en el sistema:** Publicador MQTT exclusivamente (no actúa como servidor HTTP)
- **Broker MQTT:** HiveMQ Cloud (tier Serverless gratuito y permanente)
- **Programador usado:** FTDI232 en Fedora Linux (con permisos `dialout` configurados)

---

## Frontend

- **Framework:** React Native con Expo
- **Estructura:** Monorepo (subdirectorio `Front/`)
- **Autenticación:** Login y registro conectados al backend FastAPI via `axios` + `AsyncStorage`
- **Mapas:** `react-native-maps` + Google Maps API (se descartó Mapbox)
- **Notificaciones:** FCM + Notifee (para manejo local de alertas en el dispositivo)

> ⏳ Pendiente: implementar la vista del mapa con la ubicación en tiempo real del paciente.

---

## Entorno de desarrollo

- **Sistema operativo:** Fedora Linux (usuario: `andresg`)
- **Control de versiones:** Git + GitHub con autenticación SSH
- **Estructura del repositorio:**
  ```
  ubilife/
  ├── Backend/
  └── Front/
  ```

---

## Contexto académico

- **Universidad:** Universidad Cooperativa de Colombia — Sede Santa Marta
- **Semestre:** Octavo semestre (semestre final)
- **Tipo de proyecto:** Trabajo de grado
- **Equipo:** 2 integrantes (backend + hardware a cargo de Andres)
