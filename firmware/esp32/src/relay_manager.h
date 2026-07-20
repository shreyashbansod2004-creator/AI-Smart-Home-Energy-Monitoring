#pragma once

#include <Arduino.h>

/**
 * RelayManager — controls up to 8 relay channels.
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
   * @param relayNum  Relay number 1–8
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
  static const uint8_t PIN_MAP[8];  // GPIO pins for relays 1–8
  bool _states[8] = { false };       // Current relay states

  uint8_t pinForRelay(uint8_t relayNum) const;
};
