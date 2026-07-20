#include "wifi_manager.h"
#include <WiFi.h>

void WiFiManager::begin(const String& ssid, const String& password) {
  _ssid     = ssid;
  _password = password;
  Serial.printf("[WiFi] Credentials set — SSID: %s\n", _ssid.c_str());
}

bool WiFiManager::connect(unsigned long timeoutMs) {
  Serial.printf("[WiFi] Connecting to: %s\n", _ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(_ssid.c_str(), _password.c_str());

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startMs > timeoutMs) {
      Serial.println("\n[WiFi] Connection timed out.");
      _failCount++;
      Serial.printf("[WiFi] Fail count: %d / %d\n", _failCount, MAX_FAIL_COUNT);
      return false;
    }
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\n[WiFi] Connected. IP: %s  RSSI: %d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  resetFailCount(); // Successful connection — clear the failure counter
  return true;
}

void WiFiManager::update() {
  if (WiFi.status() == WL_CONNECTED) {
    _reconnecting = false;
    return;
  }

  unsigned long now = millis();

  // Start a new reconnect attempt if the interval has passed
  if (!_reconnecting) {
    if (now - _lastReconnectAttempt < RECONNECT_INTERVAL_MS) return;

    _lastReconnectAttempt = now;
    _reconnectStartMs     = now;
    _reconnecting         = true;

    Serial.println("[WiFi] Disconnected — attempting reconnect…");
    WiFi.disconnect();
    WiFi.begin(_ssid.c_str(), _password.c_str());
    return;
  }

  // Currently attempting — check if we've timed out
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Reconnected. IP: %s\n",
                  WiFi.localIP().toString().c_str());
    _reconnecting = false;
    resetFailCount();
    return;
  }

  if (now - _reconnectStartMs >= RECONNECT_TIMEOUT_MS) {
    // This attempt failed — count it
    _reconnecting = false;
    _failCount++;
    Serial.printf("[WiFi] Reconnect timed out. Fail count: %d / %d\n",
                  _failCount, MAX_FAIL_COUNT);
  }
}

bool WiFiManager::isConnected() const {
  return WiFi.status() == WL_CONNECTED;
}

String WiFiManager::getLocalIP() const {
  return WiFi.localIP().toString();
}

int WiFiManager::getRSSI() const {
  return WiFi.RSSI();
}

bool WiFiManager::shouldRestartPortal() const {
  return _failCount >= MAX_FAIL_COUNT;
}

void WiFiManager::resetFailCount() {
  _failCount = 0;
}
