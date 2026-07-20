#pragma once

#include <Arduino.h>

/** Snapshot of all sensor readings at a point in time. */
struct SensorData {
  float voltageV   = 0.0f;   // RMS voltage in Volts
  float currentA   = 0.0f;   // RMS current in Amperes
  float powerW     = 0.0f;   // Active power in Watts
  float energyKwh  = 0.0f;   // Cumulative energy in kWh (since boot)
  bool  valid      = false;   // false if sensors not ready
};

/**
 * SensorManager — reads ZMPT101B voltage and ACS712 current sensors.
 * Uses ADC sampling with RMS calculation over multiple cycles.
 * Call update() frequently; it respects SENSOR_READ_INTERVAL.
 */
class SensorManager {
public:
  /** Initialize ADC pins. Call once in setup(). */
  void begin();

  /**
   * Sample sensors and update internal readings.
   * Non-blocking: only samples when SENSOR_READ_INTERVAL has elapsed.
   */
  void update();

  /** @return Latest sensor readings. Check data.valid before using. */
  SensorData getData() const;

  /**
   * Force an immediate ADC sample (blocking, ~200ms).
   * Useful for calibration or first-read after boot.
   */
  SensorData sampleNow();

private:
  SensorData _data;
  unsigned long _lastReadMs = 0;
  float _totalEnergyKwh = 0.0f;
  unsigned long _lastEnergyMs = 0;

  /** Sample ADC SAMPLES times and return RMS. */
  float sampleRMS(uint8_t pin, float zeroOffset = 0.0f, int samples = 500);
};
