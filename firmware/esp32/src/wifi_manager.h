#pragma once

#include <Arduino.h>

/**
 * WiFiManager — handles WiFi connection and automatic reconnection.
 * Uses non-blocking millis() timers; call update() in every loop iteration.
 */
class WiFiManager {
public:
  /**
   * Connect to WiFi using credentials from config.h.
   * Blocks until connected or timeout expires.
   * @param timeoutMs Maximum wait time in milliseconds.
   * @return true if connected, false on timeout.
   */
  bool connect(unsigned long timeoutMs = 30000);

  /**
   * Check connectivity and reconnect if necessary.
   * Must be called every loop iteration (non-blocking).
   */
  void update();

  /** @return true if currently connected to WiFi. */
  bool isConnected() const;

  /** @return Current local IP address as a String. */
  String getLocalIP() const;

  /** @return WiFi signal strength (RSSI) in dBm. */
  int getRSSI() const;

private:
  unsigned long _lastReconnectAttempt = 0;
  static constexpr unsigned long RECONNECT_INTERVAL_MS = 10000; // Retry every 10s
};
