#pragma once

#include <Arduino.h>
#include "sensor_manager.h"

/**
 * Command received from the backend.
 */
struct RelayCommand {
  int    id         = -1;    // Command ID for acknowledgement
  int    relayNum   = -1;    // Relay number 1–8
  bool   turnOn     = false; // true = turn ON, false = turn OFF
  String applianceId;        // For acknowledgement payload
  bool   valid      = false; // true if this struct contains a real command
};

/**
 * ApiClient — communicates with the Express backend over HTTP.
 * All methods are blocking with built-in error handling.
 * Call update() every loop; it respects interval timers internally.
 */
class ApiClient {
public:
  /** @param baseUrl e.g. "https://myapp.replit.app/api" */
  void begin(const String& baseUrl, const String& deviceKey);

  /**
   * POST /api/readings with current sensor data.
   * Called automatically by update() every API_POST_INTERVAL ms.
   */
  bool postReading(const SensorData& data);

  /**
   * GET /api/commands/:deviceKey and return the first pending command.
   * Called automatically by update() every COMMAND_POLL_INTERVAL ms.
   */
  RelayCommand pollCommand();

  /**
   * POST /api/commandAck to confirm command execution.
   * @param commandId ID returned by pollCommand().
   * @param relayNum  Relay number that was acted upon.
   * @param state     Final relay state (true = ON).
   */
  bool acknowledgeCommand(int commandId, int relayNum, bool state);

  /**
   * Master update — call in every loop iteration.
   * Internally dispatches postReading() and pollCommand() at their
   * respective intervals without blocking.
   * @param data Current sensor reading to post.
   * @return A valid RelayCommand if one was received, otherwise valid=false.
   */
  RelayCommand update(const SensorData& data);

private:
  String _baseUrl;
  String _deviceKey;

  unsigned long _lastPostMs    = 0;
  unsigned long _lastPollMs    = 0;
};
