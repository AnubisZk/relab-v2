/**
 * ================================================================
 * MOCK DATA — RE Optimization Lab v2.0
 * ZSK Solutions · mockData.js
 * ----------------------------------------------------------------
 * Default scenario values matching the reference dashboard screenshot.
 * All values are physically plausible.
 * ================================================================
 */

'use strict';

const MockData = {

  /* ── DEFAULT SCENARIO ────────────────────────────────────── */
  defaultParams: {
    solar: {
      panelArea:       5000,   // m²
      efficiency:      0.225,  // 22.5%
      tilt:            32,     // degrees
      azimuth:         180,    // south-facing
      irradiance:      850,    // W/m²
      cellTemp:        35,     // °C
      refTemp:         25,     // °C
      tempCoeff:       0.0045, // 0.45%/°C (typical monocrystalline)
      dustLoss:        0.15,   // 15%
      shadeLoss:       0.05,   // 5%
      cleaningInterval:14,     // days
      cleaningCost:    120,    // $/cleaning
      timeHours:       8,      // peak sun hours
    },
    wind: {
      turbineCount:    5,
      rotorRadius:     60,     // m (120m diameter — 4 MW class)
      hubHeight:       100,    // m
      windSpeed:       8.5,    // m/s
      windDirection:   230,    // degrees
      yawAngle:        230,    // yaw misalignment (same = 0 error effectively)
      powerCoeff:      0.45,   // Betz-limited practical Cp
      airDensity:      1.225,  // kg/m³ (sea level)
      turbineSpacing:  7,      // × rotor diameter
      wakeLoss:        0.12,   // 12% (overridden by Jensen model)
      turbulenceLoss:  0.05,   // 5%
    },
    offshore: {
      turbineCount:    3,
      waveHeight:      1.8,    // m significant wave height Hs
      wavePeriod:      6.5,    // s peak period Tp
      currentSpeed:    0.9,    // m/s
      platformMotion:  0.6,    // degrees roll/pitch
      corrosionLoss:   0.08,   // 8%/yr → fraction
      waveLoss:        0.10,   // 10%
      maintenanceCost: 35000,  // $/yr
      safetyThreshold: 10.0,   // R_sea max
    },
    battery: {
      capacity:        1500,   // kWh
      currentCharge:   750,    // kWh (50% SOC)
      chargeEfficiency:0.95,
      dischargeEfficiency: 0.95,
      demand:          4000,   // kWh/day
      minimumReserve:  0.20,   // 20% of capacity → 300 kWh
    },
    cost: {
      installationBudget: 2500000, // $
      availableArea:      20000,   // m²
      maxOffshoreRisk:    100,
      co2Factor:          0.45,    // kg CO₂/kWh displaced
    },
  },

  /* ── SCENARIO LIBRARY ────────────────────────────────────── */
  scenarios: [
    {
      id: 'coastal_medium',
      name: 'Coastal Medium Farm',
      description: 'Balanced coastal site with moderate wind and good solar',
    },
    {
      id: 'high_wind_offshore',
      name: 'High Wind Offshore',
      description: 'Offshore-dominant setup, rough seas, strong wind',
    },
    {
      id: 'solar_dominant',
      name: 'Solar Dominant Desert',
      description: 'High irradiance, low wind, large panel field',
    },
  ],

  /* ── WORLD MODEL MOCK PREDICTIONS ───────────────────────── */
  // Used for initial display before real model trains
  mockWorldModelPrediction(physicsResult) {
    // Simulate a surrogate model with small random error (1–4%)
    const err = () => 1 + (Math.random() - 0.5) * 0.06;
    return {
      predicted_solar:    physicsResult.sRes.E_net   * err(),
      predicted_wind:     physicsResult.wRes.E_net   * err(),
      predicted_offshore: physicsResult.oRes.E_net   * err(),
      predicted_battery:  physicsResult.bRes.B_next  * err(),
      predicted_Z:        physicsResult.zRes.Z        * err(),
      confidence:         87.6, // initial mock confidence
      surprise_score:     0.018,
    };
  },
};
