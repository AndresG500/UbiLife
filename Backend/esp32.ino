/*
 * UbiLife — Test de publicación MQTT con coordenada FIJA (v2)
 * Hardware: ESP32-CAM + FTDI232 (sin GPS por ahora)
 *
 * CAMBIO IMPORTANTE respecto a v1:
 *   El tópico ahora incluye el identificador del dispositivo:
 *     ubilife/dispositivo/{CLIENT_ID}/gps
 *   Esto permite que el backend identifique cuál ESP32 envía cada mensaje.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ─── WiFi ─────────────────────────────────────────────────────
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

// ─── HiveMQ Cloud ─────────────────────────────────────────────
const char* MQTT_HOST = "";
const int   MQTT_PORT = "";
const char* MQTT_USER = "";
const char* MQTT_PASS = "";
const char* CLIENT_ID = "";  // ← este es el identificador del dispositivo

// ─── Tópicos (dinámicos, basados en CLIENT_ID) ────────────────
char topicPub[64];   // ubilife/dispositivo/{CLIENT_ID}/gps
char topicSub[64];   // ubilife/dispositivo/{CLIENT_ID}/cmd


// ─── Certificado R13 (Let's Encrypt) ──────────────────────────
static const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFBTCCAu2gAwIBAgIQWgDyEtjUtIDzkkFX6imDBTANBgkqhkiG9w0BAQsFADBP
MQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJuZXQgU2VjdXJpdHkgUmVzZWFy
Y2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBYMTAeFw0yNDAzMTMwMDAwMDBa
Fw0yNzAzMTIyMzU5NTlaMDMxCzAJBgNVBAYTAlVTMRYwFAYDVQQKEw1MZXQncyBF
bmNyeXB0MQwwCgYDVQQDEwNSMTMwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQClZ3CN0FaBZBUXYc25BtStGZCMJlA3mBZjklTb2cyEBZPs0+wIG6BgUUNI
fSvHSJaetC3ancgnO1ehn6vw1g7UDjDKb5ux0daknTI+WE41b0VYaHEX/D7YXYKg
L7JRbLAaXbhZzjVlyIuhrxA3/+OcXcJJFzT/jCuLjfC8cSyTDB0FxLrHzarJXnzR
yQH3nAP2/Apd9Np75tt2QnDr9E0i2gB3b9bJXxf92nUupVcM9upctuBzpWjPoXTi
dYJ+EJ/B9aLrAek4sQpEzNPCifVJNYIKNLMc6YjCR06CDgo28EdPivEpBHXazeGa
XP9enZiVuppD0EqiFwUBBDDTMrOPAgMBAAGjgfgwgfUwDgYDVR0PAQH/BAQDAgGG
MB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATASBgNVHRMBAf8ECDAGAQH/
AgEAMB0GA1UdDgQWBBTnq58PLDOgU9NeT3jIsoQOO9aSMzAfBgNVHSMEGDAWgBR5
tFnme7bl5AFzgAiIyBpY9umbbjAyBggrBgEFBQcBAQQmMCQwIgYIKwYBBQUHMAKG
Fmh0dHA6Ly94MS5pLmxlbmNyLm9yZy8wEwYDVR0gBAwwCjAIBgZngQwBAgEwJwYD
VR0fBCAwHjAcoBqgGIYWaHR0cDovL3gxLmMubGVuY3Iub3JnLzANBgkqhkiG9w0B
AQsFAAOCAgEAUTdYUqEimzW7TbrOypLqCfL7VOwYf/Q79OH5cHLCZeggfQhDconl
k7Kgh8b0vi+/XuWu7CN8n/UPeg1vo3G+taXirrytthQinAHGwc/UdbOygJa9zuBc
VyqoH3CXTXDInT+8a+c3aEVMJ2St+pSn4ed+WkDp8ijsijvEyFwE47hulW0Ltzjg
9fOV5Pmrg/zxWbRuL+k0DBDHEJennCsAen7c35Pmx7jpmJ/HtgRhcnz0yjSBvyIw
6L1QIupkCv2SBODT/xDD3gfQQyKv6roV4G2EhfEyAsWpmojxjCUCGiyg97FvDtm/
NK2LSc9lybKxB73I2+P2G3CaWpvvpAiHCVu30jW8GCxKdfhsXtnIy2imskQqVZ2m
0Pmxobb28Tucr7xBK7CtwvPrb79os7u2XP3O5f9b/H66GNyRrglRXlrYjI1oGYL/
f4I1n/Sgusda6WvA6C190kxjU15Y12mHU4+BxyR9cx2hhGS9fAjMZKJss28qxvz6
Axu4CaDmRNZpK/pQrXF17yXCXkmEWgvSOEZy6Z9pcbLIVEGckV/iVeq0AOo2pkg9
p4QRIy0tK2diRENLSF2KysFwbY6B26BFeFs3v1sYVRhFW9nLkOrQVporCS0KyZmf
wVD89qSTlnctLcZnIavjKsKUu1nA1iU0yYMdYepKR7lWbnwhdx3ewok=
-----END CERTIFICATE-----
)EOF";

WiFiClientSecure espClient;
PubSubClient     mqtt(espClient);

void onMessage(char* topic, byte* payload, unsigned int len) {
  Serial.print("[SUB] ");
  Serial.print(topic);
  Serial.print(" → ");
  for (unsigned int i = 0; i < len; i++) Serial.print((char)payload[i]);
  Serial.println();
}

void mqttConnect() {
  while (!mqtt.connected()) {
    Serial.print("Conectando a HiveMQ...");
    if (mqtt.connect(CLIENT_ID, MQTT_USER, MQTT_PASS)) {
      Serial.println(" OK");
      mqtt.subscribe(topicSub);
      Serial.print("Suscrito a: ");
      Serial.println(topicSub);
    } else {
      Serial.print(" Error rc=");
      Serial.print(mqtt.state());
      Serial.println(" — reintentando en 5s");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n========================================");
  Serial.println("  UbiLife - Test MQTT (coordenada fija)");
  Serial.println("========================================");

  // Construye los tópicos dinámicamente
  snprintf(topicPub, sizeof(topicPub), "ubilife/dispositivo/%s/gps", CLIENT_ID);
  snprintf(topicSub, sizeof(topicSub), "ubilife/dispositivo/%s/cmd", CLIENT_ID);
  Serial.print("Topic PUB: "); Serial.println(topicPub);
  Serial.print("Topic SUB: "); Serial.println(topicSub);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" OK → " + WiFi.localIP().toString());

  espClient.setCACert(ROOT_CA);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
  mqtt.setKeepAlive(60);
  mqtt.setBufferSize(512);
}

void loop() {
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  static unsigned long lastPub = 0;
  if (millis() - lastPub >= 10000) {
    lastPub = millis();

    char payload[160];
    snprintf(payload, sizeof(payload),
             "{\"lat\":%.4f,\"lon\":%.4f,\"acc\":%.1f,\"ts\":%lu}",
             LAT_FIJA, LON_FIJA, ACC_FIJA, millis());

    bool ok = mqtt.publish(topicPub, payload);
    Serial.print("[PUB] ");
    Serial.print(topicPub);
    Serial.print(" → ");
    Serial.println(ok ? payload : "FALLO");
  }
}