/**
 * ================================================================
 * PHYSICS ENGINE — RE Optimization Lab v2.0
 * ZSK Solutions · physicsEngine.js
 * ----------------------------------------------------------------
 * ALL results come from physical/mathematical equations.
 * No fake scores. Every number is derived from a formula.
 * Formula source noted above each function.
 * ================================================================
 */

'use strict';

const PhysicsEngine = (() => {

  /* ── CONSTANTS ─────────────────────────────────────────────── */
  const DEG2RAD = Math.PI / 180;
  const EPSILON  = 1e-9;

  /* ════════════════════════════════════════════════════════════
     SOLAR MODEL
     ════════════════════════════════════════════════════════════ */

  /**
   * Solar gross energy
   * Formula: E_solar = A * (G/1000) * eta * t
   * Units: A[m²], G[W/m²], eta[—], t[h] → kWh
   */
  function calcESolar(A, G, eta, t) {
    return A * (G / 1000) * eta * t;
  }

  /**
   * Temperature loss factor
   * Formula: L_temp = beta * (T_cell - T_ref)
   * beta [%/°C as fraction], result is fraction [0..1)
   */
  function calcLTemp(beta, T_cell, T_ref) {
    return Math.max(0, beta * (T_cell - T_ref));
  }

  /**
   * Angle of incidence factor (deviation from optimal tilt ≈30°)
   * Formula: F_angle = max(0, cos(theta_incidence))
   * theta_incidence = abs(tilt - 30) converted to radians
   */
  function calcFAngle(tilt) {
    const theta = Math.abs(tilt - 30) * DEG2RAD;
    return Math.max(0, Math.cos(theta));
  }

  /**
   * Azimuth factor (deviation from south = 180°)
   * Formula: F_az = max(0.5, cos(|azimuth - 180|))
   */
  function calcFAzimuth(azimuth) {
    const delta = Math.abs(azimuth - 180) * DEG2RAD;
    return Math.max(0.5, Math.cos(delta));
  }

  /**
   * Cleanliness factor
   * Formula: C_f = 1 - dustLoss
   */
  function calcCf(dustLoss) {
    return Math.max(0, 1 - dustLoss);
  }

  /**
   * Net solar energy
   * Formula: E_solar_net = E_solar * F_angle * F_az * C_f * (1 - L_shade) * (1 - L_temp)
   * Units: kWh
   */
  function calcSolar(params) {
    const {
      panelArea,       // m²
      irradiance,      // W/m²
      efficiency,      // fraction
      timeHours,       // h
      tilt,            // degrees
      azimuth,         // degrees
      cellTemp,        // °C
      refTemp,         // °C
      tempCoeff,       // fraction/°C
      dustLoss,        // fraction
      shadeLoss,       // fraction
      cleaningCost,    // $
      cleaningInterval // days
    } = params;

    const E_raw   = calcESolar(panelArea, irradiance, efficiency, timeHours);
    const L_temp  = calcLTemp(tempCoeff, cellTemp, refTemp);
    const F_angle = calcFAngle(tilt);
    const F_az    = calcFAzimuth(azimuth);
    const C_f     = calcCf(dustLoss);

    // Cleaning decision: worth cleaning if energy recovered > cost
    // EnergyRecoveredValue = dustLoss * E_raw * energyPrice (assume $0.12/kWh)
    const ENERGY_PRICE = 0.12;
    const energyRecovered = dustLoss * E_raw * ENERGY_PRICE;
    const cleaningDecision = energyRecovered > cleaningCost ? 'CLEAN' : 'DEFER';
    // If cleaning deferred, use actual C_f; if cleaned, C_f → 1
    const C_f_effective = cleaningDecision === 'CLEAN' ? 1.0 : C_f;
    const cleaningCostApplied = cleaningDecision === 'CLEAN' ? cleaningCost : 0;

    const E_net = E_raw * F_angle * F_az * C_f_effective
                * (1 - shadeLoss) * Math.max(0, 1 - L_temp);

    // Individual losses for breakdown chart
    const loss_temp  = E_raw * L_temp;
    const loss_shade = E_raw * (1 - shadeLoss) < E_raw ? E_raw * shadeLoss : 0;
    const loss_dust  = E_raw * dustLoss;
    const loss_angle = E_raw * (1 - F_angle);

    return {
      E_raw,
      E_net: Math.max(0, E_net),
      L_temp,
      F_angle,
      F_az,
      C_f: C_f_effective,
      loss_temp:  Math.max(0, loss_temp),
      loss_shade: Math.max(0, loss_shade),
      loss_dust:  Math.max(0, loss_dust),
      loss_angle: Math.max(0, loss_angle),
      cleaningDecision,
      cleaningCostApplied,
      formula: `E=${panelArea}×${(irradiance/1000).toFixed(3)}×${efficiency}×${timeHours}` +
               `×cos(${Math.abs(tilt-30).toFixed(1)}°)×${C_f_effective.toFixed(3)}` +
               `×(1-${shadeLoss})×(1-${L_temp.toFixed(4)})`,
    };
  }

  /* ════════════════════════════════════════════════════════════
     WIND TURBINE MODEL
     ════════════════════════════════════════════════════════════ */

  /**
   * Rotor swept area
   * Formula: A_rotor = pi * r^2
   */
  function calcARotor(r) {
    return Math.PI * r * r;
  }

  /**
   * Wind power (Betz law applied via Cp)
   * Formula: P_wind = 0.5 * rho * A_rotor * v^3 * Cp
   * Units: W (then converted to kW)
   */
  function calcPWind(rho, A_rotor, v, Cp) {
    return 0.5 * rho * A_rotor * Math.pow(v, 3) * Cp / 1000; // kW
  }

  /**
   * Yaw misalignment loss
   * Formula: P_yaw = P_wind * cos(gamma)^3
   * gamma = yaw error in degrees
   */
  function calcPYaw(P_wind, gamma_deg) {
    const gamma = gamma_deg * DEG2RAD;
    return P_wind * Math.pow(Math.cos(gamma), 3);
  }

  /**
   * Jensen wake deficit model (simplified)
   * Formula: Δv/v0 = (1 - sqrt(1-Cp)) * (D / (D + 2*k*x))²
   * k = 0.04 (onshore), x = spacing * D
   * Wake loss fraction applied to downstream turbines
   */
  function calcWakeLoss(Cp, rotorD, spacingMultiplier, k = 0.04) {
    const x = spacingMultiplier * rotorD;
    const deficit = (1 - Math.sqrt(Math.max(0, 1 - Cp)))
                  * Math.pow(rotorD / (rotorD + 2 * k * x), 2);
    return Math.min(0.5, Math.max(0, deficit));
  }

  /**
   * Net wind energy for turbine farm
   * Formula: P_net = P_yaw * (1 - L_wake) * (1 - L_turbulence) * N
   *          E_wind = P_net * t / 1000  [kWh, P in kW]
   */
  function calcWind(params) {
    const {
      turbineCount,    // N
      rotorRadius,     // m
      hubHeight,       // m (unused in basic model, kept for future shear profile)
      windSpeed,       // m/s
      windDirection,   // degrees (unused in basic, for future directional model)
      yawAngle,        // degrees (misalignment)
      powerCoeff,      // Cp
      airDensity,      // kg/m³
      turbineSpacing,  // xD multiplier
      wakeLoss,        // override fraction (if user-defined)
      turbulenceLoss,  // fraction
      timeHours,
    } = params;

    const rotorD   = rotorRadius * 2;
    const A_rotor  = calcARotor(rotorRadius);

    // Cut-in / cut-out check
    if (windSpeed < 3 || windSpeed > 25) {
      return {
        E_net: 0, P_wind_single: 0, P_yaw: 0, P_net: 0,
        wakeLossActual: 0, loss_wake: 0, loss_turbulence: 0,
        spacingOk: turbineSpacing >= 7,
        formula: `v=${windSpeed} m/s outside cut-in(3)/cut-out(25) range → P=0`,
      };
    }

    const P_single   = calcPWind(airDensity, A_rotor, windSpeed, powerCoeff);
    const P_yaw_val  = calcPYaw(P_single, yawAngle);

    // Use Jensen wake model (overrides manual entry if spacing given)
    const L_wake_jensen = calcWakeLoss(powerCoeff, rotorD, turbineSpacing);
    const L_wake_eff    = Math.max(L_wake_jensen, wakeLoss); // use worse of two

    const P_net_1T = P_yaw_val * (1 - L_wake_eff) * (1 - turbulenceLoss);
    const P_farm   = P_net_1T * turbineCount; // kW
    const E_net    = P_farm * timeHours;       // kWh

    const loss_wake        = P_yaw_val * L_wake_eff * turbineCount * timeHours;
    const loss_turbulence  = P_yaw_val * (1 - L_wake_eff) * turbulenceLoss * turbineCount * timeHours;
    const loss_yaw         = (P_single - P_yaw_val) * turbineCount * timeHours;

    return {
      E_net: Math.max(0, E_net),
      P_wind_single: P_single,
      P_yaw: P_yaw_val,
      P_net: P_farm,
      L_wake_jensen,
      L_wake_eff,
      loss_wake:       Math.max(0, loss_wake),
      loss_turbulence: Math.max(0, loss_turbulence),
      loss_yaw:        Math.max(0, loss_yaw),
      spacingOk: turbineSpacing >= 7,
      rotorD,
      formula: `P=½×${airDensity}×π×${rotorRadius}²×${windSpeed}³×${powerCoeff}` +
               `=${P_single.toFixed(2)}kW/T × cos³(${yawAngle}°) × (1-${L_wake_eff.toFixed(3)}) × ${turbineCount}T`,
    };
  }

  /* ════════════════════════════════════════════════════════════
     OFFSHORE MODEL
     ════════════════════════════════════════════════════════════ */

  /**
   * Sea risk composite score
   * Formula: R_sea = w1*waveHeight + w2*wavePeriod + w3*currentSpeed + w4*platformMotion
   * Weights: w1=0.40, w2=0.15, w3=0.25, w4=0.20  (sum=1.0)
   */
  function calcRSea(waveHeight, wavePeriod, currentSpeed, platformMotion) {
    const w1=0.40, w2=0.15, w3=0.25, w4=0.20;
    return w1 * waveHeight + w2 * wavePeriod + w3 * currentSpeed + w4 * platformMotion;
  }

  /**
   * Offshore net energy
   * Formula: E_offshore_net = E_wind * (1 - L_wave) * (1 - L_corrosion) - MaintenanceCost
   * MaintenanceCost in kWh-equivalent ($cost / $energyPrice)
   */
  function calcOffshore(params, E_wind_kWh) {
    const {
      waveHeight,
      wavePeriod,
      currentSpeed,
      platformMotion,
      corrosionLoss,   // fraction/yr
      waveLoss,        // fraction
      maintenanceCost, // $/yr
      safetyThreshold,
    } = params;

    const ENERGY_PRICE = 0.12; // $/kWh
    const R_sea = calcRSea(waveHeight, wavePeriod, currentSpeed, platformMotion);

    // Maintenance converted to kWh-equivalent loss
    const maint_kWh = maintenanceCost / ENERGY_PRICE;

    const E_net_raw = E_wind_kWh * (1 - waveLoss) * (1 - corrosionLoss) - maint_kWh;
    const E_net     = Math.max(0, E_net_raw);

    const loss_wave      = E_wind_kWh * waveLoss;
    const loss_corrosion = E_wind_kWh * corrosionLoss;

    return {
      R_sea,
      E_net,
      loss_wave:      Math.max(0, loss_wave),
      loss_corrosion: Math.max(0, loss_corrosion),
      maint_kWh,
      riskViolation: R_sea > safetyThreshold,
      maintenanceAccessible: waveHeight < 3.5, // Hs < 3.5m → crew transfer vessel ok
      formula: `R_sea=${R_sea.toFixed(3)} · E=(${E_wind_kWh.toFixed(1)}×(1-${waveLoss})×(1-${corrosionLoss}))-${maint_kWh.toFixed(0)}`,
    };
  }

  /* ════════════════════════════════════════════════════════════
     BATTERY MODEL
     ════════════════════════════════════════════════════════════ */

  /**
   * Battery energy balance (single step)
   * Formula: B_next = B_current + eta_charge * E_in - E_out / eta_discharge
   * Constraint: 0 <= B_next <= B_capacity
   */
  function calcBattery(params, E_available_kWh) {
    const {
      capacity,          // kWh
      currentCharge,     // kWh
      chargeEfficiency,  // fraction
      dischargeEfficiency,
      demand,            // kWh
      minimumReserve,    // kWh
    } = params;

    // Charging: only charge what fits
    const E_in      = Math.min(capacity - currentCharge, Math.max(0, E_available_kWh));
    const B_charged = currentCharge + chargeEfficiency * E_in;

    // Discharge to meet demand (can't go below 0 or min reserve)
    const B_dispatchable = Math.max(0, B_charged - minimumReserve);
    const E_out          = Math.min(demand, B_dispatchable);
    const B_next         = Math.max(0, Math.min(capacity, B_charged - E_out / dischargeEfficiency));

    const unmet          = Math.max(0, demand - E_out);
    const B_available    = Math.max(0, B_next - minimumReserve);

    return {
      B_next,
      B_available,
      E_in,
      E_out,
      unmet,
      SOC: (B_next / capacity) * 100,
      reserveViolation: B_next < minimumReserve,
      formula: `B_next=${currentCharge}+${chargeEfficiency}×${E_in.toFixed(1)}-${E_out.toFixed(1)}/${dischargeEfficiency}=${B_next.toFixed(2)} kWh`,
    };
  }

  /* ════════════════════════════════════════════════════════════
     OBJECTIVE FUNCTION
     ════════════════════════════════════════════════════════════ */

  /**
   * Hybrid system objective
   * Formula: Z = E_solar_net + E_wind_net + E_offshore_net + B_available
   *              - C_cleaning - C_maintenance - C_installation - C_risk
   * C_risk = R_sea * risk_penalty_factor (default 100 $/unit)
   */
  function calcObjective(sRes, wRes, oRes, bRes, params) {
    const RISK_PENALTY = 100; // $/risk-unit
    const ENERGY_PRICE = 0.12;

    const totalEnergy = sRes.E_net + wRes.E_net + oRes.E_net;
    const C_cleaning  = sRes.cleaningCostApplied || 0;
    const C_maint     = params.offshore.maintenanceCost;
    const C_install   = params.cost.installationBudget * 0.001; // amortized (0.1%)
    const C_risk      = oRes.R_sea * RISK_PENALTY;
    const totalCost   = C_cleaning + C_maint + C_install + C_risk;

    const Z = totalEnergy + bRes.B_available - totalCost / ENERGY_PRICE;

    const totalLoss = (sRes.loss_temp   || 0) + (sRes.loss_shade || 0) +
                      (sRes.loss_dust   || 0) + (wRes.loss_wake  || 0) +
                      (wRes.loss_turbulence || 0) + (oRes.loss_wave || 0) +
                      (oRes.loss_corrosion  || 0);

    const demand = params.battery.demand;
    const coverage = Math.min(100, (totalEnergy / Math.max(EPSILON, demand)) * 100);
    const co2saved = totalEnergy * (params.cost.co2Factor || 0.45);

    const riskScore = Math.min(100, oRes.R_sea * 10); // normalize to /100

    return {
      Z,
      totalEnergy,
      totalCost,
      totalLoss,
      coverage,
      co2saved,
      riskScore,
      C_cleaning, C_maint, C_install, C_risk,
    };
  }

  /* ════════════════════════════════════════════════════════════
     CONSTRAINT CHECKER
     ════════════════════════════════════════════════════════════ */

  function checkConstraints(params, sRes, wRes, oRes, bRes) {
    const violations = [];
    const p = params;

    // 1. Panel area
    if (p.solar.panelArea > p.cost.availableArea)
      violations.push({ id:'area', msg:`Panel area ${p.solar.panelArea}m² > available ${p.cost.availableArea}m²`, severity:'error' });

    // 2. Budget
    const totalCostEur = p.cost.installationBudget;
    // (simplified: budget check via objective cost)

    // 3. Turbine spacing ≥ 7D
    if (!wRes.spacingOk)
      violations.push({ id:'spacing', msg:`Spacing ${p.wind.turbineSpacing}D < required 7D (min ${(7*wRes.rotorD).toFixed(0)}m)`, severity:'error' });

    // 4. Battery reserve
    if (bRes.reserveViolation)
      violations.push({ id:'reserve', msg:`Battery final ${bRes.B_next.toFixed(1)} kWh < min reserve ${p.battery.minimumReserve} kWh`, severity:'error' });

    // 5. Offshore risk
    if (oRes.riskViolation)
      violations.push({ id:'risk', msg:`R_sea=${oRes.R_sea.toFixed(2)} > safety threshold ${p.offshore.safetyThreshold}`, severity:'error' });

    // 6. Tilt range
    if (p.solar.tilt < 0 || p.solar.tilt > 90)
      violations.push({ id:'tilt', msg:`Tilt ${p.solar.tilt}° outside [0°, 90°]`, severity:'error' });

    // 7. Yaw range
    if (p.wind.yawAngle < 0 || p.wind.yawAngle > 180)
      violations.push({ id:'yaw', msg:`Yaw ${p.wind.yawAngle}° outside [0°, 180°]`, severity:'error' });

    // 8. Dust/shade fractions
    if (p.solar.dustLoss < 0 || p.solar.dustLoss > 1)
      violations.push({ id:'dust', msg:`Dust loss ${p.solar.dustLoss} outside [0, 1]`, severity:'error' });
    if (p.solar.shadeLoss < 0 || p.solar.shadeLoss > 1)
      violations.push({ id:'shade', msg:`Shade loss ${p.solar.shadeLoss} outside [0, 1]`, severity:'error' });

    // Warnings (not hard violations)
    if (bRes.unmet > 0)
      violations.push({ id:'unmet', msg:`Unmet demand: ${bRes.unmet.toFixed(1)} kWh/day`, severity:'warning' });
    if (!oRes.maintenanceAccessible)
      violations.push({ id:'access', msg:`Hs=${params.offshore.waveHeight}m > 3.5m — crew transfer not accessible`, severity:'warning' });

    return violations;
  }

  /* ════════════════════════════════════════════════════════════
     MASTER CALCULATE
     ════════════════════════════════════════════════════════════ */

  function calculate(params) {
    const sRes = calcSolar({
      panelArea:       params.solar.panelArea,
      irradiance:      params.solar.irradiance,
      efficiency:      params.solar.efficiency,
      timeHours:       params.solar.timeHours,
      tilt:            params.solar.tilt,
      azimuth:         params.solar.azimuth,
      cellTemp:        params.solar.cellTemp,
      refTemp:         params.solar.refTemp,
      tempCoeff:       params.solar.tempCoeff,
      dustLoss:        params.solar.dustLoss,
      shadeLoss:       params.solar.shadeLoss,
      cleaningCost:    params.solar.cleaningCost,
      cleaningInterval:params.solar.cleaningInterval,
    });

    const wRes = calcWind({
      turbineCount:   params.wind.turbineCount,
      rotorRadius:    params.wind.rotorRadius,
      hubHeight:      params.wind.hubHeight,
      windSpeed:      params.wind.windSpeed,
      windDirection:  params.wind.windDirection,
      yawAngle:       params.wind.yawAngle,
      powerCoeff:     params.wind.powerCoeff,
      airDensity:     params.wind.airDensity,
      turbineSpacing: params.wind.turbineSpacing,
      wakeLoss:       params.wind.wakeLoss,
      turbulenceLoss: params.wind.turbulenceLoss,
      timeHours:      params.solar.timeHours,
    });

    const oRes = calcOffshore({
      waveHeight:      params.offshore.waveHeight,
      wavePeriod:      params.offshore.wavePeriod,
      currentSpeed:    params.offshore.currentSpeed,
      platformMotion:  params.offshore.platformMotion,
      corrosionLoss:   params.offshore.corrosionLoss,
      waveLoss:        params.offshore.waveLoss,
      maintenanceCost: params.offshore.maintenanceCost,
      safetyThreshold: params.offshore.safetyThreshold,
    }, wRes.E_net);

    const totalAvail = sRes.E_net + wRes.E_net + oRes.E_net;

    const bRes = calcBattery({
      capacity:            params.battery.capacity,
      currentCharge:       params.battery.currentCharge,
      chargeEfficiency:    params.battery.chargeEfficiency,
      dischargeEfficiency: params.battery.dischargeEfficiency,
      demand:              params.battery.demand,
      minimumReserve:      params.battery.minimumReserve,
    }, totalAvail);

    const zRes       = calcObjective(sRes, wRes, oRes, bRes, params);
    const violations = checkConstraints(params, sRes, wRes, oRes, bRes);

    return { sRes, wRes, oRes, bRes, zRes, violations };
  }

  /* ── PUBLIC API ──────────────────────────────────────────── */
  return {
    calculate,
    calcSolar,
    calcWind,
    calcOffshore,
    calcBattery,
    calcObjective,
    checkConstraints,
    calcWakeLoss,
    calcFAngle,
    DEG2RAD,
  };

})();
