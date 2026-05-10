/**
 * ================================================================
 * OPTIMIZER — RE Optimization Lab v2.0
 * ZSK Solutions · optimizer.js
 * ----------------------------------------------------------------
 * Grid Search over ~324,000 parameter combinations.
 * Uses chunked requestAnimationFrame to avoid UI freeze.
 * Every result comes from PhysicsEngine.calculate().
 * No fake scores — Z value drives selection.
 * ================================================================
 */

'use strict';

const Optimizer = (() => {

  /* ── SEARCH SPACE ────────────────────────────────────────── */
  // Total combos: 13 × 10 × 10 × 8 × 5 × 6 = 312,000
  const SEARCH_SPACE = {
    tilts:            [0, 5, 10, 15, 20, 25, 28, 30, 32, 35, 40, 45, 60],           // 13
    azimuths:         [90, 120, 135, 150, 165, 180, 195, 210, 225, 270],             // 10
    yaws:             [0, 5, 10, 15, 20, 25, 30, 40, 60, 90],                        // 10
    spacings:         [3, 4, 5, 6, 7, 7.5, 8, 10],                                  // 8
    batteryCaps:      [50, 100, 150, 200, 300],                                       // 5
    cleaningIntervals:[7, 14, 21, 30, 45, 60],                                       // 6
  };

  const CHUNK_SIZE = 800; // combinations per animation frame

  let _running   = false;
  let _best      = null;
  let _callbacks = {};

  /* ── BUILD COMBO LIST ────────────────────────────────────── */
  function buildCombos() {
    const combos = [];
    for (const tilt     of SEARCH_SPACE.tilts)
    for (const azimuth  of SEARCH_SPACE.azimuths)
    for (const yaw      of SEARCH_SPACE.yaws)
    for (const spacing  of SEARCH_SPACE.spacings)
    for (const bcap     of SEARCH_SPACE.batteryCaps)
    for (const cleaning of SEARCH_SPACE.cleaningIntervals)
      combos.push({ tilt, azimuth, yaw, spacing, bcap, cleaning });
    return combos;
  }

  /* ── APPLY OVERRIDES TO PARAMS ───────────────────────────── */
  function applyOverrides(baseParams, combo) {
    // Deep-ish copy of relevant fields
    return {
      ...baseParams,
      solar: {
        ...baseParams.solar,
        tilt:            combo.tilt,
        azimuth:         combo.azimuth,
        cleaningInterval:combo.cleaning,
      },
      wind: {
        ...baseParams.wind,
        yawAngle:        combo.yaw,
        turbineSpacing:  combo.spacing,
      },
      battery: {
        ...baseParams.battery,
        capacity:        combo.bcap,
      },
    };
  }

  /* ── MAIN GRID SEARCH ────────────────────────────────────── */
  function run(baseParams, callbacks = {}) {
    if (_running) return;
    _running   = true;
    _best      = null;
    _callbacks = callbacks;

    const combos = buildCombos();
    const total  = combos.length;
    let count    = 0;
    let bestZ    = -Infinity;
    let bestResult = null;
    let bestCombo  = null;

    // Track top-5 for comparison
    const leaderboard = [];

    function processChunk(startIdx) {
      const endIdx = Math.min(startIdx + CHUNK_SIZE, total);

      for (let i = startIdx; i < endIdx; i++) {
        const combo  = combos[i];
        const params = applyOverrides(baseParams, combo);
        const result = PhysicsEngine.calculate(params);
        count++;

        // Only consider constraint-violation-free solutions
        const errors = result.violations.filter(v => v.severity === 'error');
        if (errors.length === 0 && result.zRes.Z > bestZ) {
          bestZ      = result.zRes.Z;
          bestResult = result;
          bestCombo  = combo;

          // Update leaderboard
          leaderboard.push({ Z: bestZ, combo: { ...combo }, zRes: { ...result.zRes } });
          leaderboard.sort((a, b) => b.Z - a.Z);
          if (leaderboard.length > 5) leaderboard.length = 5;
        }
      }

      // Progress callback
      const pct = Math.round((count / total) * 100);
      if (_callbacks.onProgress) {
        _callbacks.onProgress({
          count, total, pct,
          currentBestZ: bestZ,
          bestCombo,
        });
      }

      if (endIdx < total) {
        requestAnimationFrame(() => processChunk(endIdx));
      } else {
        // Done
        _running = false;
        _best    = { result: bestResult, combo: bestCombo, leaderboard };

        if (_callbacks.onComplete) {
          _callbacks.onComplete({
            found:      bestResult !== null,
            result:     bestResult,
            combo:      bestCombo,
            Z:          bestZ,
            leaderboard,
            totalEvaluated: count,
          });
        }
      }
    }

    // Kick off
    requestAnimationFrame(() => processChunk(0));
  }

  /* ── SENSITIVITY ANALYSIS ────────────────────────────────── */
  // Vary one parameter at a time, return curve data for charts
  function sensitivityTilt(baseParams) {
    return Array.from({ length: 91 }, (_, tilt) => {
      const p = applyOverrides(baseParams, { tilt, azimuth: baseParams.solar.azimuth, yaw: baseParams.wind.yawAngle, spacing: baseParams.wind.turbineSpacing, bcap: baseParams.battery.capacity, cleaning: baseParams.solar.cleaningInterval });
      const r = PhysicsEngine.calculate(p);
      return { x: tilt, y: r.sRes.E_net };
    });
  }

  function sensitivityAzimuth(baseParams) {
    const steps = Array.from({ length: 37 }, (_, i) => 90 + i * 5);
    return steps.map(az => {
      const p = applyOverrides(baseParams, { tilt: baseParams.solar.tilt, azimuth: az, yaw: baseParams.wind.yawAngle, spacing: baseParams.wind.turbineSpacing, bcap: baseParams.battery.capacity, cleaning: baseParams.solar.cleaningInterval });
      const r = PhysicsEngine.calculate(p);
      return { x: az, y: r.sRes.E_net };
    });
  }

  function sensitivityWindSpeed(baseParams) {
    return Array.from({ length: 261 }, (_, i) => {
      const v = i * 0.1;
      const p = { ...baseParams, wind: { ...baseParams.wind, windSpeed: v } };
      const r = PhysicsEngine.calculate(p);
      return { x: v, y: r.wRes.P_net || 0 };
    });
  }

  function sensitivityYaw(baseParams) {
    return Array.from({ length: 181 }, (_, yaw) => {
      const p = applyOverrides(baseParams, { tilt: baseParams.solar.tilt, azimuth: baseParams.solar.azimuth, yaw, spacing: baseParams.wind.turbineSpacing, bcap: baseParams.battery.capacity, cleaning: baseParams.solar.cleaningInterval });
      const r = PhysicsEngine.calculate(p);
      // Yaw power loss fraction: 1 - cos^3(gamma)
      const gamma = yaw * PhysicsEngine.DEG2RAD;
      const loss  = (1 - Math.pow(Math.cos(gamma), 3)) * 100;
      return { x: yaw, y: loss };
    });
  }

  function sensitivitySpacing(baseParams) {
    const steps = Array.from({ length: 71 }, (_, i) => 3 + i * 0.1);
    const Cp    = baseParams.wind.powerCoeff;
    const D     = baseParams.wind.rotorRadius * 2;
    return steps.map(s => {
      const wakeFrac = PhysicsEngine.calcWakeLoss(Cp, D, s) * 100;
      return { x: s, y: wakeFrac };
    });
  }

  function sensitivityWaveRisk(baseParams) {
    return Array.from({ length: 51 }, (_, i) => {
      const wh = i * 0.1;
      const R  = 0.40 * wh + 0.15 * baseParams.offshore.wavePeriod
               + 0.25 * baseParams.offshore.currentSpeed
               + 0.20 * baseParams.offshore.platformMotion;
      return { x: wh, y: R };
    });
  }

  function sensitivityBattery(baseParams) {
    const caps = Array.from({ length: 50 }, (_, i) => 50 + i * 50);
    return caps.map(bcap => {
      const p    = { ...baseParams, battery: { ...baseParams.battery, capacity: bcap } };
      const r    = PhysicsEngine.calculate(p);
      return { x: bcap, y: r.bRes.unmet };
    });
  }

  function sensitivityCostEnergy(baseParams) {
    const tilts  = [15, 25, 30, 35, 45];
    const speeds = [5, 7, 8.5, 10, 12, 14, 16];
    const pts    = [];
    for (const tilt of tilts)
    for (const spd  of speeds) {
      const p = { ...baseParams, solar: { ...baseParams.solar, tilt }, wind: { ...baseParams.wind, windSpeed: spd } };
      const r = PhysicsEngine.calculate(p);
      pts.push({ cost: r.zRes.totalCost / 1000, energy: r.zRes.totalEnergy, tilt, spd });
    }
    return pts;
  }

  /* ── PUBLIC API ──────────────────────────────────────────── */
  return {
    run,
    isRunning: () => _running,
    getBest:   () => _best,
    SEARCH_SPACE,
    sensitivity: {
      tilt:      sensitivityTilt,
      azimuth:   sensitivityAzimuth,
      windSpeed: sensitivityWindSpeed,
      yaw:       sensitivityYaw,
      spacing:   sensitivitySpacing,
      waveRisk:  sensitivityWaveRisk,
      battery:   sensitivityBattery,
      costEnergy:sensitivityCostEnergy,
    },
  };

})();
