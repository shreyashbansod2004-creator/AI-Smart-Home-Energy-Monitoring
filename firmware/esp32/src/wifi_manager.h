#pragma once

#include <Arduino.h>

/**
 * WiFiManager — handles Wi-Fi connection and automatic reconnection.
 *
 * Credentials are supplied at runtime (from NVS via ConfigManager) rather
 * than baked into compile-time macros.  Call begin() once in setup() to
 * store the credentials, then connect() to make the initial connection, and
 * update() every loop iteration for non-blocking reconnection.
 *
 * Consecutive reconnection failures are counted.  When the count reaches
 * MAX_FAIL_COUNT, shouldRestartPortal() returns true so main.cpp can trigger
 * the configuration portal and let the user enter new credentials.
 */
class WiFiManager {
public:
  /**
   * Store credentials for use by connect() and update().
   * Call once in setup(), before connect().
   */
  void begin(const String& ssid, const String& password);

  /**
   * Block until connected or timeoutMs expires.
   * @return true if connected, false on timeout.
   */
  bool connect(unsigned long timeoutMs = 30000);

  /**
   * Non-blocking reconnection check.  Must be called every loop iteration.
   * Increments the internal failure counter each time a reconnect attempt
   * times out.  Check shouldRestartPortal() afterwards.
   */
  void update();

  /** @return true if currently connected to Wi-Fi. */
  bool isConnected() const;

  /** @return Current local IP address as a String. */
  String getLocalIP() const;

  /** @return Wi-Fi signal strength (RSSI) in dBm. */
  int getRSSI() const;

  /**
   * @return true when consecutive reconnect failures have exceeded the
   *         threshold — main.cpp should launch the config portal so the
   *         user can enter working credentials.
   */
  bool shouldRestartPortal() const;

  /** Reset the failure counter (call after a successful connection). */
  void resetFailCount();

private:
  String _ssid;
  String _password;

  // Reconnect timing
  unsigned long _lastReconnectAttempt = 0;
  unsigned long _reconnectStartMs     = 0;
  bool          _reconnecting         = false;

  // Portal-trigger threshold
  uint8_t _failCount = 0;
  static constexpr uint8_t  MAX_FAIL_COUNT        = 5;
  static constexpr unsigned long RECONNECT_INTERVAL_MS = 10000; // retry every 10 s
  static constexpr unsigned long RECONNECT_TIMEOUT_MS  = 15000; // give up after 15 s
};
