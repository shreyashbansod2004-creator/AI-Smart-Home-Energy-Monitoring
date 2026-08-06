#include "relay_manager.h"
#include "config.h"

// GPIO pin assignments for relay 1–8 (matches config.h)
const uint8_t RelayManager::PIN_MAP[8] = {
  RELAY_PIN_1, RELAY_PIN_2, RELAY_PIN_3, RELAY_PIN_4,
  RELAY_PIN_5, RELAY_PIN_6, RELAY_PIN_7, RELAY_PIN_8
};

void RelayManager::begin() {
  for (uint8_t i = 0; i < 8; i++) {
    pinMode(PIN_MAP[i], OUTPUT);
    digitalWrite(PIN_MAP[i], HIGH); // Active-LOW: HIGH = relay OFF
  }
  Serial.println("[Relay] All relays initialized (OFF).");
}

void RelayManager::set(uint8_t relayNum, bool on) {
  if (relayNum < 1 || relayNum > 8) {
    Serial.printf("[Relay] Invalid relay number: %d\n", relayNum);
    return;
  }
  uint8_t idx = relayNum - 1;
  _states[idx] = on;
  // Active-LOW relay: LOW = ON, HIGH = OFF
  digitalWrite(PIN_MAP[idx], on ? LOW : HIGH);
  // Print appliance name immediately on every state change
  if (idx < RELAY_COUNT) {
    Serial.printf("%s (GPIO%d): %s\n",
                  APPLIANCE_NAMES[idx], PIN_MAP[idx], on ? "ON" : "OFF");
  }
}

bool RelayManager::getState(uint8_t relayNum) const {
  if (relayNum < 1 || relayNum > 8) return false;
  return _states[relayNum - 1];
}

void RelayManager::allOff() {
  for (uint8_t i = 1; i <= 8; i++) set(i, false);
  Serial.println("[Relay] All relays turned OFF.");
}

uint8_t RelayManager::pinForRelay(uint8_t relayNum) const {
  if (relayNum < 1 || relayNum > 8) return 0;
  return PIN_MAP[relayNum - 1];
}

void RelayManager::printStates() const {
  for (uint8_t i = 0; i < RELAY_COUNT; i++) {
    Serial.printf("  %-22s (GPIO%d): %s\n",
                  APPLIANCE_NAMES[i], PIN_MAP[i], _states[i] ? "ON" : "OFF");
  }
}
