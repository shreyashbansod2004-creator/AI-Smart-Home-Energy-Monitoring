#pragma once

#include <Arduino.h>
#include "config.h"

/**
 * RelayManager — controls the five active relay channels.
 * Relays are active-LOW: writing LOW turns the relay ON.
 * All relay states are tracked in memory for reporting.
 */
class RelayManager {
public:
  /**
   * Initialize all relay GPIO pins as outputs and set them all OFF.
   * Call once in setup().
   */
  void begin();

  /**
   * Set a relay by relay number (1-indexed, matching relay mapping).
   * @param relayNum  Relay number 1–5
   * @param on        true = relay ON (circuit closed), false = OFF
   */
  void set(uint8_t relayNum, bool on);

  /** @return Current state of relay (true = ON). */
  bool getState(uint8_t relayNum) const;

  /** Turn ALL relays off (safety shutdown). */
  void allOff();

  /**
   * Print relay states to Serial.
   * Format: "Relay 1(GPIO13): ON  Relay 2(GPIO12): OFF ..."
   */
  void printStates() const;

private:
  static const uint8_t PIN_MAP[RELAY_COUNT];  // GPIO pins for relays 1–5
  bool _states[RELAY_COUNT] = { false };       // Current relay states

  uint8_t pinForRelay(uint8_t relayNum) const;
};
