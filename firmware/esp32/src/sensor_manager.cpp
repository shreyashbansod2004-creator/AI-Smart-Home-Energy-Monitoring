#include "sensor_manager.h"
#include "config.h"
#include <Arduino.h>
#include <math.h>

void SensorManager::begin() {
  // ADC pins are input-only by default; no explicit pinMode needed for ADC
  // Set ADC attenuation for full 3.3V range
  analogSetAttenuation(ADC_11db);
  _lastEnergyMs = millis();
  Serial.println("[Sensor] SensorManager initialized.");
}

void SensorManager::update() {
  unsigned long now = millis();
  if (now - _lastReadMs < SENSOR_READ_INTERVAL) return;
  _lastReadMs = now;

  _data = sampleNow();

  // Accumulate energy: E(kWh) += P(W) * dt(h)
  if (_data.valid && _lastEnergyMs > 0) {
    float dtHours = (now - _lastEnergyMs) / 3600000.0f;
    _totalEnergyKwh += (_data.powerW * dtHours) / 1000.0f;
    _data.energyKwh = _totalEnergyKwh;
  }
  _lastEnergyMs = now;
}

SensorData SensorManager::sampleNow() {
  SensorData d;

  // ── Voltage ────────────────────────────────────────────────────────────────
  // ZMPT101B outputs a scaled AC sine wave centred around VCC/2
  float vRms = sampleRMS(VOLTAGE_PIN, ADC_REF_VOLTAGE / 2.0f, 500);
  d.voltageV = vRms / VOLTAGE_CALIBRATION;
  if (d.voltageV < 50.0f || d.voltageV > 300.0f) d.voltageV = 0.0f; // sanity check

  // ── Current ────────────────────────────────────────────────────────────────
  // ACS712: output is VCC/2 at 0A; sensitivity = CURRENT_CALIBRATION V/A
  float iRms = sampleRMS(CURRENT_PIN, CURRENT_ZERO_OFFSET, 500);
  d.currentA = iRms / CURRENT_CALIBRATION;
  if (d.currentA < 0.01f) d.currentA = 0.0f; // dead-band noise floor

  // ── Power ─────────────────────────────────────────────────────────────────
  // If no valid mains voltage is present, current noise is meaningless.
  if (d.voltageV == 0.0f) d.currentA = 0.0f;
  // Apparent power; multiply by PF (~0.95) for resistive/light loads
  d.powerW = d.voltageV * d.currentA * 0.95f;

  d.energyKwh = _totalEnergyKwh;
  d.valid = true;
  return d;
}

SensorData SensorManager::getData() const {
  return _data;
}

/**
 * Sample an ADC pin N times and return the RMS value in volts.
 * @param pin        GPIO ADC pin
 * @param zeroOffset Voltage that represents "zero" on the waveform
 * @param samples    Number of ADC readings (higher = more accurate, slower)
 */
float SensorManager::sampleRMS(uint8_t pin, float zeroOffset, int samples) {
  double sumSq = 0.0;
  for (int i = 0; i < samples; i++) {
    float raw = analogRead(pin);
    float voltage = (raw / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
    float delta = voltage - zeroOffset;
    sumSq += delta * delta;
    delayMicroseconds(100); // ~10kHz sampling rate
  }
  return (float)sqrt(sumSq / samples);
}
