#include "wifi_manager.h"
#include "config.h"
#include <WiFi.h>

bool WiFiManager::connect(unsigned long timeoutMs) {
  Serial.printf("[WiFi] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startMs > timeoutMs) {
      Serial.println("[WiFi] Connection timed out.");
      return false;
    }
    delay(500);
    Serial.print(".");
  }

  Serial.printf("\n[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

void WiFiManager::update() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - _lastReconnectAttempt < RECONNECT_INTERVAL_MS) return;

  _lastReconnectAttempt = now;
  Serial.println("[WiFi] Disconnected. Attempting reconnect...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
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
