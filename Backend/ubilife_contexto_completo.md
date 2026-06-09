# UbiLife — Contexto Completo del Proyecto (Backend)

---

## 1. ¿Qué es UbiLife?

UbiLife es una aplicación móvil de rastreo GPS en tiempo real diseñada para el monitoreo de pacientes con Alzheimer. Permite que cuidadores conozcan en todo momento la ubicación de un paciente, reciban alertas cuando este salga de zonas seguras definidas, y actúen rápidamente ante situaciones de riesgo.

Es el trabajo de grado de dos estudiantes de la Universidad Cooperativa de Colombia (sede Santa Marta), último semestre.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Hardware / GPS | ESP32-C6-Zero + módulo BZ-251 (u-blox M10) |
| Protocolo IoT | MQTT — broker HiveMQ Cloud (tier gratuito permanente) |
| Backend | FastAPI (Python) + MongoDB con Motor (driver async) |
| Autenticación | JWT via `python-jose` + bcrypt para contraseñas |
| Notificaciones push | Firebase Cloud Messaging (FCM) via `firebase_admin` |
| Frontend móvil | React Native con Expo |
| Mapas | `react-native-maps` + Google Maps API |
| Repositorio | GitHub monorepo — subdirectorios `Backend/` y `Front/` |

---

## 3. Arquitectura general

```
[ESP32-C6-Zero + BZ-251]
        │
        │ MQTT publish (coordenadas GPS)
        ▼
[HiveMQ Cloud — Broker MQTT]
        │
        │ MQTT subscribe
        ▼
[Backend FastAPI]
   ├── Guarda en colección Historial (MongoDB)
   ├── Actualiza ultima_ubicacion en colección Pacientes
   ├── Evalúa geocercas activas (ZonasSeguras)
   └── Si el paciente sale → crea Alerta + envía FCM a cuidadores
        │
        ▼
[MongoDB — Base de datos principal]

[React Native App]
   ├── Login/registro conectado a FastAPI via axios + AsyncStorage
   ├── Mapa en tiempo real (react-native-maps + Google Maps)
   ├── Gestión de pacientes, grupos y zonas seguras
   └── Recibe notificaciones push (FCM + Notifee)
```

---

## 4. Estructura de carpetas del backend

```
Backend/
├── main.py
├── database/
│   └── database.py
├── models/
│   ├── model_cuidador.py
│   ├── model_paciente.py
│   ├── model_dispositivo.py
│   ├── model_historial.py
│   ├── model_zonasegura.py
│   ├── model_grupo.py
│   └── model_alertas.py
├── services/
│   ├── service_cuidador.py
│   ├── service_paciente.py
│   ├── service_dispositivo.py
│   ├── service_historial.py
│   ├── service_zonasegura.py
│   ├── service_grupo.py
│   └── service_alerta.py
├── routes/
│   ├── ruta_cliente.py
│   ├── ruta_paciente.py
│   ├── ruta_dispositivo.py
│   ├── ruta_historial.py
│   ├── ruta_zonasegura.py
│   ├── ruta_grupo.py
│   └── ruta_alerta.py
├── security/
│   ├── jwt_handler.py
│   └── dependencies.py
└── utils/
    └── Logger.py
```

### Convenciones generales
- Todo el código está escrito **en español** (variables, funciones, colecciones, campos).
- Los modelos Pydantic siguen el patrón: `Base → Crear → Respuesta → Actualizar`.
- El driver de MongoDB es **Motor** (async), compatible con FastAPI.
- Las colecciones se obtienen mediante `get_database()` definido en `database/database.py`.
- Todas las funciones de servicio retornan diccionarios con clave `"mensaje"` para respuestas informativas, `"error"` para fallos, y datos directos para consultas exitosas.
- El logging se hace a través de la clase `Logger` con niveles: `info`, `warn`, `error`.
- La autenticación JWT se gestiona mediante `get_cuidador_actual` en `security/dependencies.py`, que se usa como dependencia de FastAPI (`Depends`).

---

## 5. Colecciones en MongoDB

| Colección | Descripción |
|---|---|
| `Cuidadores` | Usuarios de la app (personas que cuidan al paciente) |
| `Pacientes` | Pacientes con Alzheimer registrados |
| `Dispositivos` | Dispositivos ESP32 registrados y vinculados |
| `DispositivosDisponibles` | Dispositivos detectados vía `/anunciar` pero aún no vinculados |
| `Historial` | Registro histórico de ubicaciones GPS por paciente |
| `ZonasSeguras` | Geocercas definidas por los cuidadores |
| `Grupos` | Relaciones entre cuidadores y pacientes |
| `UbicacionesCuidadores` | Ubicación en tiempo real de los cuidadores (upsert) |
| `Alertas` | Alertas generadas cuando un paciente sale de una zona segura |

---

## 6. Módulos del backend

---

### 6.1 Módulo `cuidador`

**Archivos:** `model_cuidador.py`, `service_cuidador.py`, `ruta_cliente.py`

Gestiona a los usuarios principales de la app: las personas responsables del paciente. Incluye registro, autenticación JWT, actualización de datos y eliminación de cuenta.

#### Modelos (`model_cuidador.py`)

**`sanitize_input(value: str) -> str`**
Función auxiliar de sanitización. Elimina espacios extremos y etiquetas HTML del string recibido. Se usa como validador `before` en los campos `name` de los modelos Pydantic para prevenir inyección de contenido.

**`CuidadorBase`**
Modelo base con los campos comunes: `name` (2–100 chars), `email` (validado como EmailStr), `phone` (opcional, patrón E.164). Incluye el validador `sanitize_name` que llama a `sanitize_input` sobre el campo `name`.

**`CrearCuidador(CuidadorBase)`**
Extiende `CuidadorBase` añadiendo `password` (mínimo 8 caracteres). Se usa en el endpoint de registro.

**`RespuestaCuidador(CuidadorBase)`**
Modelo de respuesta pública. Añade `id`, `grupo_ids` (lista de IDs de grupos a los que pertenece), `fecha_creacion` y `activo`. Nunca expone la contraseña.

**`ActualizarCuidador`**
Modelo para actualizaciones parciales (todos los campos opcionales): `name`, `phone`, `password`.

**`VerificarCuidador`**
Modelo para el login: solo `email` y `password`.

#### Servicios (`service_cuidador.py`)

**`registrar_cuidador(datos: CrearCuidador) -> dict`**
Verifica que el email y el teléfono no estén ya registrados. Hashea la contraseña con bcrypt (12 rounds). Inserta el documento en la colección `Cuidadores` con `patient_ids: []`, `is_active: True` y `created_at`. Retorna mensaje de éxito o de conflicto.

**`borrar_cuidador(email: str, email_solicitante: str) -> dict`**
Verifica que el email a eliminar sea el mismo que el del token JWT (`email_solicitante`). Busca el cuidador por email y lo elimina. Protege contra eliminación de cuentas ajenas.

**`actualizar_cuidador(email: str, datos: ActualizarCuidador, email_solicitante: str) -> dict`**
Verifica autorización comparando emails. Construye dinámicamente el dict de campos a actualizar (`name`, `phone`, `password` — esta última se re-hashea si se envía). Aplica el `$set` en MongoDB.

**`verificar_cuidador(email: str, password: str) -> dict`**
Implementa timing-safe login: siempre ejecuta `bcrypt.checkpw` (incluso si el usuario no existe, usando un hash dummy) para evitar ataques de timing. Aplica un `asyncio.sleep(0.2)` de delay fijo adicional. Si las credenciales son válidas, genera y retorna un JWT via `crear_token`. En cualquier fallo retorna `"Credenciales inválidas"` sin especificar cuál campo falló.

#### Router (`ruta_cliente.py`) — prefijo: `/cuidadores`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/registrar` | ❌ Público | Registra un nuevo cuidador |
| DELETE | `/eliminar?email=` | ✅ JWT | Elimina la cuenta propia |
| PUT | `/actualizar?email=` | ✅ JWT | Actualiza datos de la cuenta propia |
| GET | `/perfil` | ✅ JWT | Devuelve el documento completo del cuidador autenticado |
| POST | `/verificar` | ❌ Público | Login — devuelve JWT si las credenciales son válidas |
| POST | `/logout` | ✅ JWT | Cierra sesión (respuesta simbólica, el token se invalida en el cliente) |

---

### 6.2 Módulo `paciente`

**Archivos:** `model_paciente.py`, `service_paciente.py`, `ruta_paciente.py`

Gestiona los pacientes con Alzheimer. Cada paciente está vinculado a un cuidador (quien lo registró) y almacena su última ubicación conocida.

#### Modelos (`model_paciente.py`)

**`sanitize_input(value: str) -> str`**
Misma función auxiliar de sanitización que en cuidador.

**`GeoPoint`**
Submodelo para representar una ubicación geográfica: `latitud` (-90 a 90), `longitud` (-180 a 180), `recorded_at` (timestamp, default `utcnow`). Se usa para el campo `ultima_ubicacion` del paciente.

**`EstadoDispositivo` (Enum)**
Enum string con tres estados: `ONLINE`, `OFFLINE`, `UNKNOWN`. Representa el estado de conexión del dispositivo asociado.

**`PacienteBase`**
Modelo base con `nombre_paciente` (2–100 chars), `edad_paciente` (opcional, >= 0) y `enfermedad` (opcional, max 500 chars). Incluye validador `sanitize_fields` que sanitiza `nombre_paciente` y `enfermedad`.

**`CrearPaciente(PacienteBase)`**
Extiende la base añadiendo `id_dispositivo` (opcional). Se usa en el endpoint de registro.

**`RespuestaPaciente(PacienteBase)`**
Modelo de respuesta completo. Añade `id_paciente`, `id_cuidador`, `id_dispositivo`, `grupo_ids`, `ultima_ubicacion` (GeoPoint opcional), `estado_dispositivo`, `created_at` y `activo`.

**`ActualizarPaciente`**
Campos opcionales para actualización parcial: `nombre_paciente`, `edad_paciente`, `enfermedad`, `id_dispositivo`.

**`ActualizarUbicacion`**
Modelo auxiliar para actualizar ubicación manualmente: `patient_id`, `latitude`, `longitude`, `device_id` (opcional), `recorded_at`.

#### Servicios (`service_paciente.py`)

**`registrar_paciente(datos: CrearPaciente, cuidador_email: str) -> dict`**
Busca el cuidador por email (extraído del JWT). Inserta el paciente con `id_cuidador` igual al `_id` del cuidador, `ultima_ubicacion: None`, `activo: True`. Agrega el `_id` del nuevo paciente al array `patient_ids` del cuidador mediante `$push`.

**`obtener_paciente(patient_id: str, cuidador_email: str) -> dict`**
Busca el cuidador por email y el paciente por `_id`. Verifica que `paciente.id_cuidador == cuidador._id` antes de retornar. Devuelve error 403 si no hay coincidencia.

**`borrar_paciente(patient_id: str, cuidador_email: str) -> dict`**
Verifica ownership. Elimina el documento del paciente de `Pacientes` y remueve su ID del array `patient_ids` del cuidador con `$pull`.

**`actualizar_paciente(patient_id: str, datos: ActualizarPaciente, cuidador_email: str) -> dict`**
Verifica ownership. Construye dinámicamente solo los campos enviados y aplica `$set`. Retorna mensaje si no se envió ningún campo.

**`listar_pacientes(cuidador_email: str) -> list`**
Busca el cuidador por email y consulta todos los pacientes donde `id_cuidador == cuidador._id`. Retorna la lista completa con `_id` convertido a string.

#### Router (`ruta_paciente.py`) — prefijo: `/pacientes`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/registrar` | ✅ JWT | Registra un nuevo paciente vinculado al cuidador autenticado |
| GET | `/{patient_id}` | ✅ JWT | Obtiene datos de un paciente (solo si pertenece al cuidador) |
| DELETE | `/{patient_id}` | ✅ JWT | Elimina un paciente (solo si pertenece al cuidador) |
| PUT | `/{patient_id}` | ✅ JWT | Actualiza datos del paciente |
| GET | `/` | ✅ JWT | Lista todos los pacientes del cuidador autenticado |

---

### 6.3 Módulo `dispositivo`

**Archivos:** `model_dispositivo.py`, `service_dispositivo.py`, `ruta_dispositivo.py`

Gestiona los dispositivos ESP32 físicos. Incluye un flujo de vinculación automática: el ESP32 se anuncia al encenderse, queda disponible por 5 minutos, y un cuidador puede vincularlo a un paciente desde la app.

#### Modelos (`model_dispositivo.py`)

**`DispositivoBase`**
Base con `id_dispositivo` (string identificador único del hardware), `paciente_id` y `estado` (bool, False por defecto).

**`LocalizacionDispositivo`**
Submodelo para ubicación GPS del dispositivo: `latitud` (-90 a 90), `longitud` (-180 a 180), `altitud` (opcional), `satellites` (opcional, calidad del fix GPS del BZ-251), `timestamp` (default `utcnow`).

**`CrearDispositivo(DispositivoBase)`**
Sin campos adicionales. Hereda directamente de `DispositivoBase`.

**`ActualizarDispositivo`**
Campos opcionales: `estado`, `ultima_localizacion` (LocalizacionDispositivo), `ultima_conexion`, `nivel_bateria` (0–100).

**`DispositivoDisponible`**
Modelo liviano para representar un dispositivo que se anunció: `id_dispositivo` y `dispositivo_detectado` (timestamp).

**`RegistroDispositivoBase`**
Modelo completo de un documento en MongoDB. Incluye alias `_id` → `id`, todos los campos de estado y `created_at`. Configurado con `populate_by_name = True` para que el alias funcione correctamente.

#### Servicios (`service_dispositivo.py`)

**`registrar_dispositivo(datos: CrearDispositivo) -> dict`**
Verifica que el `id_dispositivo` no esté ya registrado. Inserta el documento en `Dispositivos` con todos los campos en `None` salvo los provistos.

**`obtener_dispositivo(id_dispositivo: str) -> dict`**
Busca por `id_dispositivo` en la colección. Convierte `_id` a string. Retorna el documento o mensaje de no encontrado.

**`obtener_dispositivo_por_paciente(paciente_id: str) -> dict`**
Busca el dispositivo cuyo `paciente_id` coincida. Útil para que la app sepa qué dispositivo está asignado a un paciente.

**`actualizar_dispositivo(id_dispositivo: str, datos: ActualizarDispositivo, cuidador_email: str) -> dict`**
Verifica ownership: busca el cuidador por email, luego el paciente del dispositivo, y confirma que `paciente.id_cuidador == cuidador._id`. Construye dinámicamente los campos a actualizar.

**`desvincular_dispositivo(id_dispositivo: str, cuidador_email: str) -> dict`**
Verifica ownership. Setea `paciente_id: None`, `estado: False` y actualiza `ultima_conexion`. El dispositivo queda libre para ser vinculado a otro paciente.

**`anunciar_dispositivo(id_dispositivo: str) -> dict`**
Endpoint público para el ESP32. Hace un upsert en la colección `DispositivosDisponibles` con el timestamp actual. Sin autenticación, pensado para ser llamado por el hardware al encenderse.

**`obtener_dispositivos_disponibles() -> list`**
Obtiene los `id_dispositivo` ya vinculados a algún paciente (`paciente_id != None`). Luego consulta `DispositivosDisponibles` filtrando los que se anunciaron en los últimos 5 minutos (`MINUTOS_DISPONIBLE = 5`) y que no estén en la lista de ya vinculados. Retorna la lista de disponibles.

**`vincular_dispositivo(id_dispositivo: str, paciente_id: str, cuidador_email: str) -> dict`**
Verifica que el cuidador sea dueño del paciente. Verifica que el dispositivo esté en `DispositivosDisponibles`. Verifica que no esté ya vinculado a otro paciente. Si el dispositivo existe en `Dispositivos` (previamente desvinculado), lo reactiva con `$set`; si no existe, lo crea con `insert_one`. Elimina el dispositivo de `DispositivosDisponibles` al finalizar.

#### Router (`ruta_dispositivo.py`) — prefijo: `/dispositivos`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/obtener/{id_dispositivo}` | ✅ JWT | Obtiene datos de un dispositivo por su ID |
| GET | `/paciente/{paciente_id}` | ✅ JWT | Obtiene el dispositivo vinculado a un paciente |
| PATCH | `/actualizar/{id_dispositivo}` | ✅ JWT | Actualiza estado, localización o batería del dispositivo |
| PATCH | `/desvincular/{id_dispositivo}` | ✅ JWT | Desvincula el dispositivo de su paciente actual |
| GET | `/disponibles` | ✅ JWT | Lista dispositivos detectados recientemente y sin vincular |
| POST | `/vincular?id_dispositivo=&paciente_id=` | ✅ JWT | Vincula un dispositivo disponible a un paciente |
| POST | `/anunciar?id_dispositivo=` | ❌ Público | Llamado por el ESP32 al encenderse para registrarse como disponible |

---

### 6.4 Módulo `historial`

**Archivos:** `model_historial.py`, `service_historial.py`, `ruta_historial.py`

Registra el historial completo de ubicaciones GPS de cada paciente. Implementa filtro de distancia mínima para evitar registros redundantes. También actualiza `ultima_ubicacion` en el documento del paciente con cada nuevo registro.

**Constantes:**
- `DISTANCIA_MINIMA_METROS = 10` — distancia mínima de movimiento para registrar un nuevo punto.
- `DIAS_HISTORIAL = 7` — ventana de tiempo máxima al consultar el historial.

#### Modelos (`model_historial.py`)

**`CoordenadasPaciente`**
Submodelo con `latitud` (-90 a 90) y `longitud` (-180 a 180). Representa un punto GPS.

**`HistorialUbicacionBase`**
Modelo principal para registrar una ubicación: `paciente_id`, `dispositivo_id`, `coordenadas` (CoordenadasPaciente), `timestamp` (default `utcnow`). Es el modelo que recibe el endpoint de registro (llamado por el ESP32 vía MQTT → FastAPI).

**`RespuestaHistorialUbicacion(HistorialUbicacionBase)`**
Añade el campo `id` (string). Modelo de respuesta para consultas.

**`UltimaUbicacion`**
Modelo liviano con `paciente_id`, `coordenadas` y `timestamp`. Usado para exponer solo la última posición conocida.

#### Servicios (`service_historial.py`)

**`calcular_distancia(lat1, lng1, lat2, lng2) -> float`**
Función auxiliar. Implementa la fórmula de Haversine para calcular la distancia en metros entre dos coordenadas geográficas. Se usa para filtrar movimientos insignificantes.

**`verificar_paciente_pertenece_a_cuidador(paciente_id: str, cuidador_email: str) -> bool`**
Helper de autorización. Busca el cuidador por email, luego el paciente por `_id`, y verifica que `paciente.id_cuidador == cuidador._id`. Retorna `True` o `False`. Usado como guard en las funciones protegidas.

**`registrar_ubicacion(datos: HistorialUbicacionBase) -> dict`**
Endpoint público (llamado por el dispositivo IoT, no requiere JWT). Busca la última ubicación registrada para ese paciente. Si existe y la distancia con la nueva es menor a `DISTANCIA_MINIMA_METROS`, descarta el punto. Si pasa el filtro, inserta el nuevo documento en `Historial` y actualiza `ultima_ubicacion` en el documento del paciente en `Pacientes` con `$set`.

**`obtener_ultima_ubicacion(paciente_id: str, cuidador_email: str) -> dict`**
Verifica pertenencia con `verificar_paciente_pertenece_a_cuidador`. Consulta el historial ordenado por `timestamp` descendente y retorna el primer documento (la más reciente).

**`obtener_historial_ubicaciones(paciente_id: str, cuidador_email: str) -> list`**
Verifica pertenencia. Consulta todos los registros del paciente de los últimos 7 días (`timestamp >= utcnow - 7 días`), ordenados por `timestamp` ascendente. Retorna la lista de puntos para trazar una ruta en el mapa.

**`eliminar_historial_paciente(paciente_id: str, cuidador_email: str) -> dict`**
Verifica pertenencia. Ejecuta `delete_many` sobre todos los documentos del paciente en `Historial`. Retorna cuántos registros fueron eliminados.

#### Router (`ruta_historial.py`) — prefijo: `/historial-ubicaciones`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/registrar` | ❌ Público | Registra una nueva ubicación (llamado por el ESP32/MQTT bridge) |
| GET | `/ultima/{paciente_id}` | ✅ JWT | Obtiene la última ubicación registrada del paciente |
| GET | `/ruta/{paciente_id}` | ✅ JWT | Obtiene el historial de los últimos 7 días para trazar la ruta |
| DELETE | `/eliminar/{paciente_id}` | ✅ JWT | Elimina todo el historial del paciente |

---

### 6.5 Módulo `zonasegura`

**Archivos:** `model_zonasegura.py`, `service_zonasegura.py`, `ruta_zonasegura.py`

Permite a los cuidadores definir geocercas circulares para un paciente. Incluye lógica de verificación geométrica para determinar si un paciente está dentro o fuera de una zona.

#### Modelos (`model_zonasegura.py`)

**`CentroZona`**
Submodelo con `latitud` y `longitud`. Representa el centro geográfico de la geocerca.

**`ZonaSeguraBase`**
Modelo base con: `paciente_id`, `cuidador_id`, `nombre` (2–100 chars), `centro` (CentroZona), `radio_metros` (50–500 metros), `activa` (bool, True por defecto).

**`CrearZonaSegura(ZonaSeguraBase)`**
Sin campos adicionales. Se usa directamente en el endpoint de creación.

**`ActualizarZonaSegura`**
Todos los campos opcionales: `nombre`, `centro`, `radio_metros` (50–5000 en update, rango extendido), `activa`.

**`RespuestaZonaSegura(ZonaSeguraBase)`**
Añade `id` y `created_at`.

#### Servicios (`service_zonasegura.py`)

**`verificar_si_dentro(latitud_paciente, longitud_paciente, latitud_centro, longitud_centro, radio_metros) -> bool`**
Función auxiliar pura. Calcula la distancia Haversine entre la posición del paciente y el centro de la zona. Retorna `True` si la distancia es menor o igual al radio.

**`verificar_paciente_pertenece_a_cuidador(paciente_id: str, cuidador_email: str) -> bool`**
Mismo helper de autorización que en historial. Busca cuidador por email y verifica que el paciente le pertenezca.

**`crear_zona_segura(datos: CrearZonaSegura) -> dict`**
Verifica que no exista ya una zona con el mismo nombre para ese paciente (unicidad compuesta `paciente_id + nombre`). Inserta el documento con el `centro` serializado via `.model_dump()`.

**`obtener_zonas_por_paciente(paciente_id: str, cuidador_email: str) -> list`**
Verifica pertenencia. Retorna todas las zonas de ese paciente, con `_id` convertido a string como `id`.

**`obtener_zona_por_id(zona_id: str) -> dict`**
Busca una zona específica por su `_id`. No verifica pertenencia (usado internamente y en consultas directas).

**`actualizar_zona_segura(zona_id: str, datos: ActualizarZonaSegura, cuidador_email: str) -> dict`**
Verifica que el `cuidador_id` almacenado en la zona coincida con el cuidador autenticado. Construye dinámicamente los campos a actualizar, serializando `centro` con `.model_dump()` si fue enviado.

**`eliminar_zona_segura(zona_id: str, cuidador_email: str) -> dict`**
Verifica ownership comparando `zona.cuidador_id` con el `_id` del cuidador autenticado. Elimina el documento.

**`verificar_paciente_en_zonas(paciente_id: str, latitud: float, longitud: float) -> dict`**
Consulta todas las zonas activas del paciente. Para cada zona, llama a `verificar_si_dentro`. Si el paciente está dentro de alguna, retorna `{"dentro": True, "zona": nombre}`. Si no está en ninguna, retorna `{"dentro": False, "zona": None}`. Esta función es la que se llama después de cada actualización de ubicación para decidir si se genera una alerta.

#### Router (`ruta_zonasegura.py`) — prefijo: `/zonas-seguras`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/crear` | ✅ JWT | Crea una nueva zona segura (el `cuidador_id` se toma del JWT) |
| GET | `/paciente/{paciente_id}` | ✅ JWT | Lista todas las zonas de un paciente |
| GET | `/obtener/{zona_id}` | ✅ JWT | Obtiene una zona por su ID |
| PATCH | `/actualizar/{zona_id}` | ✅ JWT | Actualiza una zona (solo el cuidador creador) |
| DELETE | `/eliminar/{zona_id}` | ✅ JWT | Elimina una zona (solo el cuidador creador) |
| GET | `/verificar/{paciente_id}?latitud=&longitud=` | ✅ JWT | Verifica si las coordenadas dadas están dentro de alguna zona activa del paciente |

---

### 6.6 Módulo `grupo`

**Archivos:** `model_grupo.py`, `service_grupo.py`, `ruta_grupo.py`

Gestiona la relación many-to-many entre cuidadores y pacientes. Un grupo tiene un cuidador principal (quien lo crea) y puede tener múltiples cuidadores y múltiples pacientes. También maneja ubicaciones en tiempo real de los cuidadores para mostrarlas en el mapa compartido.

#### Modelos (`model_grupo.py`)

**`GrupoBase`**
Base con `nombre` (2–100 chars).

**`CrearGrupo(GrupoBase)`**
Añade `cuidador_principal_id` (string, quien crea el grupo) y `paciente_ids` (lista, vacía por defecto).

**`RespuestaGrupo(GrupoBase)`**
Modelo completo: `id`, `cuidador_principal_id`, `cuidador_ids` (todos los cuidadores del grupo), `paciente_ids`, `created_at`.

**`ActualizarGrupo`**
Solo `nombre` (opcional).

**`AgregarCuidador`**
Solo `cuidador_id`. Modelo para el body del endpoint de añadir cuidador.

**`AgregarPaciente`**
Solo `paciente_id`. Modelo para el body del endpoint de añadir paciente.

**`UbicacionCuidador`**
Modelo para actualizar la posición en tiempo real de un cuidador: `cuidador_id`, `latitud`, `longitud`, `timestamp` (default `utcnow`).

#### Servicios (`service_grupo.py`)

**`calcular_distancia(lat1, lng1, lat2, lng2) -> float`**
Función auxiliar Haversine. Igual a la de otros módulos. Retorna distancia en metros.

**`crear_grupo(datos: CrearGrupo) -> dict`**
Verifica que el cuidador principal exista. Verifica que todos los `paciente_ids` existan. Inserta el grupo con `cuidador_ids` inicializado con el principal. Agrega el `grupo_id` al array `grupo_ids` del cuidador y de cada paciente con `$push`.

**`eliminar_grupo(grupo_id: str, cuidador_id: str) -> dict`**
Verifica que quien solicita la eliminación sea el `cuidador_principal_id` del grupo. Remueve el `grupo_id` del array `grupo_ids` de todos los cuidadores y pacientes del grupo con `$pull`. Elimina el documento del grupo.

**`agregar_cuidador(grupo_id: str, cuidador_id: str) -> dict`**
Verifica que el grupo y el cuidador existan. Verifica que el cuidador no esté ya en el grupo. Agrega el `cuidador_id` al array `cuidador_ids` del grupo y el `grupo_id` al array `grupo_ids` del cuidador.

**`eliminar_cuidador(grupo_id: str, cuidador_id: str) -> dict`**
Protege contra la eliminación del `cuidador_principal_id`. Verifica que el cuidador esté en el grupo. Remueve con `$pull` en ambas colecciones.

**`agregar_paciente(grupo_id: str, paciente_id: str) -> dict`**
Verifica existencia de grupo y paciente. Verifica que el paciente no esté ya en el grupo. Agrega con `$push` en ambas colecciones.

**`guardar_ubicacion_cuidador(datos: UbicacionCuidador) -> dict`**
Hace un upsert en la colección `UbicacionesCuidadores` usando `cuidador_id` como clave única. Actualiza `latitud`, `longitud` y `timestamp`. Mantiene solo la ubicación más reciente por cuidador.

**`obtener_ubicaciones_grupo(grupo_id: str) -> dict`**
Retorna un objeto con dos listas: `cuidadores` (ubicaciones actuales de todos los cuidadores del grupo desde `UbicacionesCuidadores`) y `pacientes` (última ubicación de cada paciente del grupo desde el campo `ultima_ubicacion` en `Pacientes`). Útil para el mapa compartido del grupo.

**`obtener_cuidador_mas_cercano(grupo_id: str, latitud_paciente: float, longitud_paciente: float) -> dict`**
Itera sobre las ubicaciones actuales de todos los cuidadores del grupo. Calcula la distancia Haversine de cada uno a las coordenadas del paciente. Retorna el `cuidador_id`, `nombre` y `distancia_m` del más cercano. Usado para priorizar a quién notificar primero en una alerta.

**`obtener_grupo(grupo_id: str) -> dict`**
Busca el grupo por `_id` y lo retorna con `_id` convertido a `id` string.

**`actualizar_grupo(grupo_id: str, cuidador_id: str, datos: ActualizarGrupo) -> dict`**
Verifica que quien actualiza sea el cuidador principal. Actualiza el campo `nombre` si fue enviado.

#### Router (`ruta_grupo.py`) — prefijo: `/grupos`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/crear` | ✅ JWT | Crea un grupo (el `cuidador_principal_id` se toma del JWT) |
| DELETE | `/{grupo_id}` | ✅ JWT | Elimina el grupo (solo el cuidador principal) |
| PUT | `/{grupo_id}` | ✅ JWT | Actualiza el nombre del grupo (solo el cuidador principal) |
| GET | `/{grupo_id}` | ✅ JWT | Obtiene datos del grupo |
| POST | `/{grupo_id}/cuidadores` | ✅ JWT | Agrega un cuidador al grupo |
| DELETE | `/{grupo_id}/cuidadores/{cuidador_id}` | ✅ JWT | Elimina un cuidador del grupo |
| POST | `/{grupo_id}/pacientes` | ✅ JWT | Agrega un paciente al grupo |
| POST | `/{grupo_id}/ubicacion` | ❌ Público | Actualiza la ubicación del cuidador en tiempo real |
| GET | `/{grupo_id}/ubicaciones` | ❌ Público | Obtiene ubicaciones actuales de cuidadores y pacientes del grupo |
| GET | `/{grupo_id}/cuidador-cercano?latitud=&longitud=` | ❌ Público | Retorna el cuidador más cercano a las coordenadas dadas |

---

### 6.7 Módulo `alerta`

**Archivos:** `model_alertas.py`, `service_alerta.py`, `ruta_alerta.py`

Gestiona el ciclo de vida completo de una alerta: creación cuando el paciente sale de una zona segura, notificación push a los cuidadores del grupo, marcado como atendida por un cuidador, y resolución automática cuando el paciente regresa a la zona.

**Constantes:**
- `INTERVALO_NOTIF_MINUTOS = 5` — cada cuánto se reenvía la notificación si la alerta sigue activa.

#### Modelos (`model_alertas.py`)

**`EstadoAlerta` (Enum)**
Enum string con tres estados:
- `ACTIVA` — alerta recién creada, nadie la ha atendido.
- `ATENDIDA` — un cuidador marcó "voy en camino".
- `RESUELTA` — el paciente volvió a la zona segura.

**`CrearAlerta`**
Modelo de entrada para crear una alerta: `paciente_id`, `grupo_id`, `coordenadas` (dict con lat/lng del momento de salida), `zona_nombre` (nombre de la zona que abandonó).

**`RespuestaAlerta`**
Modelo completo de respuesta: todos los campos de `CrearAlerta` más `id`, `estado` (EstadoAlerta), `atendida_por` (ID del cuidador que atendió, opcional), `created_at`, `ultima_notif` (timestamp del último envío FCM).

**`AtenderAlerta`**
Solo `cuidador_id`. Modelo para el body del endpoint de atención.

#### Servicios (`service_alerta.py`)

**`enviar_notificacion_fcm(tokens: list[str], titulo: str, cuerpo: str)`**
Función placeholder pendiente de implementación con `firebase_admin.messaging`. Actualmente solo loguea la acción. Recibe la lista de FCM tokens de los cuidadores y el contenido de la notificación.

**`obtener_tokens_grupo(grupo_id: str) -> list[str]`**
Consulta el grupo por `_id`, obtiene los `cuidador_ids`, y proyecta solo el campo `fcm_token` de cada cuidador. Retorna la lista de tokens no nulos. Pendiente de que el campo `fcm_token` sea agregado a la colección `Cuidadores`.

**`crear_alerta(datos: CrearAlerta) -> dict`**
Verifica que no exista ya una alerta con `estado == ACTIVA` para ese paciente (evita duplicados). Verifica que el paciente exista. Inserta la alerta con estado `ACTIVA` y `ultima_notif = created_at = utcnow`. Llama a `obtener_tokens_grupo` y luego a `enviar_notificacion_fcm` con el nombre del paciente y sus coordenadas. Retorna el `alerta_id` generado.

**`atender_alerta(alerta_id: str, cuidador_id: str) -> dict`**
Busca la alerta por `_id`. Verifica que siga en estado `ACTIVA`. Actualiza el estado a `ATENDIDA` y registra el `cuidador_id` en el campo `atendida_por`.

**`resolver_alerta(paciente_id: str) -> dict`**
Busca una alerta activa o atendida para el paciente. Se llama automáticamente cuando el sistema detecta que el paciente regresó a la zona segura (después de verificar con `verificar_paciente_en_zonas`). Actualiza el estado a `RESUELTA`.

**`reenviar_alertas_activas()`**
Background task (aún no conectada al scheduler). Busca todas las alertas con `estado == ACTIVA` cuyo `ultima_notif` sea anterior al corte (`utcnow - 5 minutos`). Para cada una, obtiene el paciente, los tokens del grupo, y reenvía la notificación FCM. Actualiza `ultima_notif` a `utcnow` en cada alerta procesada.

#### Router (`ruta_alerta.py`) — prefijo: `/alertas`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/crear` | ✅ JWT | Crea una nueva alerta y notifica a los cuidadores del grupo |
| PATCH | `/atender/{alerta_id}` | ✅ JWT | Marca la alerta como atendida por el cuidador que la atiende |
| PATCH | `/resolver/{paciente_id}` | ✅ JWT | Resuelve la alerta activa del paciente (cuando regresa a la zona) |

---

## 7. Seguridad

- **JWT:** generado en `security/jwt_handler.py` via `crear_token`. El payload contiene `{"sub": email}`. La dependencia `get_cuidador_actual` en `security/dependencies.py` decodifica el token y retorna el documento completo del cuidador desde MongoDB.
- **Contraseñas:** hasheadas con bcrypt, 12 rounds. El login usa timing-safe comparison con delay fijo para prevenir ataques de timing y enumeración de usuarios.
- **Autorización por ownership:** cada operación sensible verifica que el recurso pertenezca al cuidador autenticado antes de proceder. Se retorna 403 si no hay match.
- **Sanitización:** los campos de texto libre en los modelos de cuidador y paciente pasan por `sanitize_input` (strip + remoción de etiquetas HTML) para prevenir inyección de contenido.

---

## 8. Pendientes de implementación

| Funcionalidad | Archivo(s) afectado(s) | Estado |
|---|---|---|
| FCM real con `firebase_admin` | `service_alerta.py` → `enviar_notificacion_fcm` | 🔧 Placeholder listo, falta inicializar SDK |
| Campo `fcm_token` en Cuidadores | `model_cuidador.py`, `service_cuidador.py` | ⏳ Pendiente |
| Background task `reenviar_alertas_activas` | `service_alerta.py`, `main.py` | ⏳ Pendiente conectar a scheduler |
| Integración MQTT subscriber | Nuevo archivo `mqtt/mqtt_client.py` | ⏳ Pendiente |
| Índices en MongoDB | `database/database.py` o script de init | ⏳ Pendiente |
| Manejo global de errores (middleware) | `main.py` | ⏳ Pendiente |
