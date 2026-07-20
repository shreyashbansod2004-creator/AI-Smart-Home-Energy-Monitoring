#include "api_client.h"
#include "config.h"
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFi.h>

void ApiClient::begin(const String& baseUrl, const String& deviceKey) {
  _baseUrl   = baseUrl;
  _deviceKey = deviceKey;
  Serial.printf("[API] Base URL: %s  DeviceKey: %s\n",
                _baseUrl.c_str(), _deviceKey.c_str());
}

// ── POST /api/readings ────────────────────────────────────────────────────────

bool ApiClient::postReading(const SensorData& data) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[API] postReading skipped — WiFi not connected.");
    return false;
  }

  HTTPClient http;
  String url = _baseUrl + "/readings";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  // Build JSON payload
  JsonDocument doc;
  doc["deviceId"] = _deviceKey;
  doc["voltage"]  = round(data.voltageV * 10) / 10.0;
  doc["current"]  = round(data.currentA * 100) / 100.0;
  doc["power"]    = round(data.powerW * 10) / 10.0;
  doc["energy"]   = round(data.energyKwh * 10000) / 10000.0;

  // ISO 8601 timestamp
  struct tm timeInfo;
  char tsBuffer[30];
  if (getLocalTime(&timeInfo)) {
    strftime(tsBuffer, sizeof(tsBuffer), "%Y-%m-%dT%H:%M:%SZ", &timeInfo);
  } else {
    snprintf(tsBuffer, sizeof(tsBuffer), "1970-01-01T00:00:00Z");
  }
  doc["timestamp"] = tsBuffer;

  String body;
  serializeJson(doc, body);

  int statusCode = http.POST(body);
  http.end();

  if (statusCode == 200 || statusCode == 201) {
    Serial.printf("[API] Reading posted OK (%.1fW, %.1fV, %.2fA)\n",
                  data.powerW, data.voltageV, data.currentA);
    return true;
  }
  Serial.printf("[API] postReading failed. HTTP %d\n", statusCode);
  return false;
}

// ── GET /api/commands/:deviceKey ─────────────────────────────────────────────

RelayCommand ApiClient::pollCommand() {
  RelayCommand cmd;
  if (WiFi.status() != WL_CONNECTED) return cmd;

  HTTPClient http;
  String url = _baseUrl + "/commands/" + _deviceKey;
  http.begin(url);
  http.addHeader("Accept", "application/json");

  int statusCode = http.GET();
  if (statusCode != 200) {
    http.end();
    return cmd; // No pending command or error
  }

  String payload = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[API] JSON parse error: %s\n", err.c_str());
    return cmd;
  }

  // Expect: { "id": 42, "relayNum": 1, "command": "ON", "applianceId": "..." }
  if (!doc.containsKey("id") || !doc.containsKey("relayNum")) return cmd;

  cmd.id          = doc["id"].as<int>();
  cmd.relayNum    = doc["relayNum"].as<int>();
  cmd.turnOn      = String(doc["command"].as<const char*>()) == "ON";
  cmd.applianceId = doc["applianceId"] | "";
  cmd.valid       = true;

  Serial.printf("[API] Command: relay %d -> %s (id=%d)\n",
                cmd.relayNum, cmd.turnOn ? "ON" : "OFF", cmd.id);
  return cmd;
}

// ── POST /api/commandAck ──────────────────────────────────────────────────────

bool ApiClient::acknowledgeCommand(int commandId, int relayNum, bool state) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = _baseUrl + "/commandAck";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["commandId"] = commandId;
  doc["relayNum"]  = relayNum;
  doc["state"]     = state ? "ON" : "OFF";

  String body;
  serializeJson(doc, body);

  int statusCode = http.POST(body);
  http.end();

  if (statusCode == 200 || statusCode == 201) {
    Serial.printf("[API] CommandAck OK (id=%d relay=%d %s)\n",
                  commandId, relayNum, state ? "ON" : "OFF");
    return true;
  }
  Serial.printf("[API] CommandAck failed. HTTP %d\n", statusCode);
  return false;
}

// ── update() ─────────────────────────────────────────────────────────────────

RelayCommand ApiClient::update(const SensorData& data) {
  unsigned long now = millis();

  // Post reading every API_POST_INTERVAL ms
  if (now - _lastPostMs >= API_POST_INTERVAL) {
    _lastPostMs = now;
    postReading(data);
  }

  // Poll for commands every COMMAND_POLL_INTERVAL ms
  RelayCommand cmd;
  if (now - _lastPollMs >= COMMAND_POLL_INTERVAL) {
    _lastPollMs = now;
    cmd = pollCommand();
  }

  return cmd;
}
