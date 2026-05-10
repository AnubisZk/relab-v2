/**
 * ================================================================
 * APP.JS — RE Optimization Lab v2.0
 * ZSK Solutions · Orchestrator
 * ----------------------------------------------------------------
 * Wires: PhysicsEngine ↔ Optimizer ↔ Dashboard ↔ Charts
 * All displayed numbers come from PhysicsEngine.calculate().
 * ================================================================
 */

'use strict';

const App = (() => {

  /* ── STATE ──────────────────────────────────────────────── */
  let _params    = null;   // current input params
  let _result    = null;   // last physics result
  let _optResult = null;   // last optimizer result
  let _prevResult= null;   // for delta calculation
  let _chartsInit= false;

  /* ── PLOTLY SHARED CONFIG ───────────────────────────────── */
  const PLOTLY_CFG = { displayModeBar: false, responsive: true };
  const PLOTLY_LAYOUT = (xTitle='', yTitle='') => ({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: { family:'JetBrains Mono', color:'rgba(140,170,210,0.6)', size:9 },
    margin: { l:36, r:8, t:4, b:28 },
    xaxis: {
      title: { text:xTitle, font:{size:8} },
      gridcolor:'rgba(0,180,255,0.06)',
      zerolinecolor:'rgba(0,180,255,0.1)',
      tickfont:{size:8},
    },
    yaxis: {
      title: { text:yTitle, font:{size:8} },
      gridcolor:'rgba(0,180,255,0.06)',
      zerolinecolor:'rgba(0,180,255,0.1)',
      tickfont:{size:8},
    },
    showlegend: false,
    hovermode: 'x unified',
    hoverlabel: { bgcolor:'rgba(10,21,37,0.95)', bordercolor:'rgba(0,212,255,0.4)', font:{color:'#f0f6ff',size:10} },
  });

  /* ── INPUT READING ──────────────────────────────────────── */
  function readParams() {
    const g = id => parseFloat(document.getElementById(id)?.value) || 0;
    const p = MockData.defaultParams;

    return {
      solar: {
        panelArea:        parseFloat(document.getElementById('sv-parea')?.textContent) || p.solar.panelArea,
        efficiency:       g('i-eta') / 100,
        tilt:             parseFloat(document.getElementById('sv-tilt')?.textContent)  || p.solar.tilt,
        azimuth:          parseFloat(document.getElementById('sv-azimuth')?.textContent) || p.solar.azimuth,
        irradiance:       g('i-irr')    || p.solar.irradiance,
        cellTemp:         g('i-tcell')  || p.solar.cellTemp,
        refTemp:          25,
        tempCoeff:        0.0045,
        dustLoss:         parseFloat(document.getElementById('sv-dust')?.textContent || p.solar.dustLoss*100) / 100,
        shadeLoss:        parseFloat(document.getElementById('sv-shade')?.textContent || p.solar.shadeLoss*100) / 100,
        cleaningInterval: parseFloat(document.getElementById('sv-cint')?.textContent) || p.solar.cleaningInterval,
        cleaningCost:     g('i-ccost') || p.solar.cleaningCost,
        timeHours:        p.solar.timeHours,
      },
      wind: {
        turbineCount:   g('i-tcount')  || p.wind.turbineCount,
        rotorRadius:    g('i-rrad')    || p.wind.rotorRadius,
        hubHeight:      g('i-hhub')    || p.wind.hubHeight,
        windSpeed:      parseFloat(document.getElementById('sv-wspd')?.textContent) || p.wind.windSpeed,
        windDirection:  parseFloat(document.getElementById('sv-wdir')?.textContent) || p.wind.windDirection,
        yawAngle:       parseFloat(document.getElementById('sv-yaw')?.textContent)  || 10,
        powerCoeff:     g('i-cp')      || p.wind.powerCoeff,
        airDensity:     g('i-rho')     || p.wind.airDensity,
        turbineSpacing: parseFloat(document.getElementById('sv-spacing')?.textContent) || p.wind.turbineSpacing,
        wakeLoss:       (g('i-wake')   || p.wind.wakeLoss * 100) / 100,
        turbulenceLoss: (g('i-turb')   || p.wind.turbulenceLoss * 100) / 100,
      },
      offshore: {
        waveHeight:      parseFloat(document.getElementById('sv-wh')?.textContent)   || p.offshore.waveHeight,
        wavePeriod:      g('i-wper')   || p.offshore.wavePeriod,
        currentSpeed:    parseFloat(document.getElementById('sv-curr')?.textContent) || p.offshore.currentSpeed,
        platformMotion:  parseFloat(document.getElementById('sv-plat')?.textContent) || p.offshore.platformMotion,
        corrosionLoss:   (g('i-corr')  || p.offshore.corrosionLoss * 100) / 100,
        waveLoss:        (g('i-wloss') || p.offshore.waveLoss * 100) / 100,
        maintenanceCost: g('i-maint')  || p.offshore.maintenanceCost,
        safetyThreshold: g('i-riskmax')|| p.offshore.safetyThreshold,
      },
      battery: {
        capacity:            g('i-bcap')  || p.battery.capacity,
        currentCharge:       parseFloat(document.getElementById('sv-bcur')?.textContent) || p.battery.currentCharge,
        chargeEfficiency:    (g('i-etac') || 95) / 100,
        dischargeEfficiency: (g('i-etad') || 95) / 100,
        demand:              g('i-demand')|| p.battery.demand,
        minimumReserve:      (g('i-minres') || 20) / 100 * (g('i-bcap') || p.battery.capacity),
      },
      cost: {
        installationBudget: g('i-budget')|| p.cost.installationBudget,
        availableArea:      g('i-avarea')|| p.cost.availableArea,
        co2Factor:          p.cost.co2Factor,
      },
    };
  }

  /* ── CALCULATE ──────────────────────────────────────────── */
  function calculate() {
    _prevResult = _result;
    _params     = readParams();
    _result     = PhysicsEngine.calculate(_params);

    renderKPIs(_result, _prevResult);
    renderConstraints(_result.violations);
    renderBreakdown(_result);
    renderLosses(_result);
    renderWorldModel(_result);
    renderCharts(_params);
    drawScene();
  }

  /* ── KPI RENDERING ──────────────────────────────────────── */
  function fmt(v, dec=0) {
    if (!isFinite(v)) return '—';
    if (dec === 0) return Math.round(v).toLocaleString();
    return v.toFixed(dec);
  }

  function renderKPIs(res, prev) {
    const { sRes, wRes, oRes, bRes, zRes } = res;
    const delta = (cur, old, unit='') => {
      if (!old) return '';
      const d = cur - old;
      if (Math.abs(d) < 0.01) return '';
      const sign = d > 0 ? '▲ +' : '▼ ';
      const col  = d > 0 ? 'var(--green)' : 'var(--red)';
      return `<span style="color:${col}">${sign}${Math.abs(d).toFixed(1)}${unit}</span>`;
    };

    const set = (id, val, deltaHTML='', unit='') => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
      const de = document.getElementById(id+'-d');
      if (de) de.innerHTML = deltaHTML;
    };

    const total = sRes.E_net + wRes.E_net + oRes.E_net;
    const prevT = prev ? (prev.sRes.E_net + prev.wRes.E_net + prev.oRes.E_net) : null;

    set('kpi-total',   fmt(total),                 delta(total, prevT, ' kWh'));
    set('kpi-solar',   fmt(sRes.E_net),             delta(sRes.E_net, prev?.sRes.E_net, ' kWh'));
    set('kpi-wind',    fmt(wRes.E_net),             delta(wRes.E_net, prev?.wRes.E_net, ' kWh'));
    set('kpi-offshore',fmt(oRes.E_net),             delta(oRes.E_net, prev?.oRes.E_net, ' kWh'));
    set('kpi-battery', fmt(bRes.SOC, 0),            `${fmt(bRes.B_next)} kWh / ${fmt(_params?.battery?.capacity)} kWh`);
    set('kpi-cost',    '$'+fmt(zRes.totalCost),     delta(-zRes.totalCost, prev ? -prev.zRes.totalCost : null, ''));
    set('kpi-Z',       fmt(zRes.Z),                 delta(zRes.Z, prev?.zRes.Z, ''));
    set('kpi-cov',     fmt(zRes.coverage, 1)+'%',   delta(zRes.coverage, prev?.zRes.coverage, '%'));
    set('kpi-co2',     fmt(zRes.co2saved/1000, 2),  '');
    set('kpi-risk',    fmt(zRes.riskScore, 0),
      zRes.riskScore < 30 ? '<span style="color:var(--green)">Safe</span>'
      : zRes.riskScore < 60 ? '<span style="color:var(--amber)">Moderate</span>'
      : '<span style="color:var(--red)">High Risk</span>');
  }

  /* ── CONSTRAINTS ────────────────────────────────────────── */
  function renderConstraints(violations) {
    const bar = document.getElementById('constraint-bar');
    bar.className = 'constraint-bar';
    if (violations.length === 0) {
      bar.classList.add('visible', 'ok');
      bar.innerHTML = '<span class="cbar-item cbar-ok">✓ All constraints satisfied</span>';
    } else {
      bar.classList.add('visible');
      bar.innerHTML = violations.map(v =>
        `<span class="cbar-item ${v.severity==='error'?'cbar-error':'cbar-warning'}">
          ${v.severity==='error'?'⚠':'ℹ'} ${v.msg}
        </span>`
      ).join('');
    }
  }

  /* ── DONUT CHART + BREAKDOWN LEGEND ───────────────────────── */
  function renderBreakdown(res) {
    const { sRes, wRes, oRes } = res;
    const total = sRes.E_net + wRes.E_net + oRes.E_net;

    const segments = [
      { label:'Solar Energy',   val:sRes.E_net, color:'#f5a623' },
      { label:'Wind Energy',    val:wRes.E_net, color:'#00d4ff' },
      { label:'Offshore Energy',val:oRes.E_net, color:'#a855f7' },
    ];

    const tag = document.getElementById('breakdown-total-tag');
    if (tag) tag.textContent = fmt(total) + ' kWh/day';

    // Plotly donut
    Plotly.react('donutChart', [{
      type: 'pie',
      values:  segments.map(s => s.val),
      labels:  segments.map(s => s.label),
      hole: 0.6,
      marker: { colors: segments.map(s => s.color) },
      textinfo: 'none',
      hovertemplate: '%{label}<br>%{value:.0f} kWh (%{percent})<extra></extra>',
    }], {
      paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
      margin:{l:0,r:0,t:0,b:0},
      showlegend:false,
      annotations:[{
        text: `<b>${fmt(total)}</b><br><span style="font-size:10px">kWh/day</span>`,
        x:0.5, y:0.5, xref:'paper', yref:'paper',
        showarrow:false, align:'center',
        font:{family:'JetBrains Mono', size:14, color:'#f0f6ff'},
      }],
    }, PLOTLY_CFG);

    // Legend
    const legend = document.getElementById('breakdown-legend');
    if (legend) {
      legend.innerHTML = segments.map(s => {
        const pct = total > 0 ? (s.val / total * 100).toFixed(1) : '0.0';
        return `<div class="bdl-item">
          <div class="bdl-left">
            <div class="bdl-dot" style="background:${s.color}"></div>
            <span class="bdl-name">${s.label}</span>
          </div>
          <div class="bdl-right">
            <span class="bdl-val">${fmt(s.val)}</span>
            <span class="bdl-pct">${pct}%</span>
          </div>
        </div>`;
      }).join('');
    }
  }

  /* ── LOSSES TABLE ───────────────────────────────────────── */
  function renderLosses(res) {
    const { sRes, wRes, oRes } = res;
    const losses = [
      { name:'Shade Loss',       val: sRes.loss_shade || 0,      key:'shade' },
      { name:'Temperature Loss', val: sRes.loss_temp  || 0,      key:'temp' },
      { name:'Dust Loss',        val: sRes.loss_dust  || 0,      key:'dust' },
      { name:'Wake Loss',        val: wRes.loss_wake  || 0,      key:'wake' },
      { name:'Turbulence Loss',  val: wRes.loss_turbulence || 0, key:'turb' },
      { name:'Wave Loss',        val: oRes.loss_wave  || 0,      key:'wave' },
      { name:'Corrosion Loss',   val: oRes.loss_corrosion || 0,  key:'corr' },
    ];
    const totalLoss = losses.reduce((s, l) => s + l.val, 0);
    const totalProd = (res.sRes.E_raw || 0) + (res.wRes.P_wind_single || 0) * (_params?.wind?.turbineCount || 1) * (_params?.solar?.timeHours || 8);
    const pctOf = v => totalProd > 0 ? (v / totalProd * 100).toFixed(1) : '0.0';

    const body = document.getElementById('loss-body');
    if (!body) return;
    body.innerHTML = losses.map(l =>
      `<div class="loss-row">
        <span class="loss-name">${l.name}</span>
        <span class="loss-val">${fmt(l.val)} kWh</span>
        <span class="loss-pct">${pctOf(l.val)}%</span>
      </div>`
    ).join('') + `
      <div class="loss-row loss-total-row">
        <span class="loss-name">Total Loss</span>
        <span class="loss-val">${fmt(totalLoss)} kWh</span>
        <span class="loss-pct">${pctOf(totalLoss)}%</span>
      </div>`;
  }

  /* ── WORLD MODEL PANEL ──────────────────────────────────── */
  function renderWorldModel(physRes) {
    const wm  = MockData.mockWorldModelPrediction(physRes);
    const body = document.getElementById('wm-body');
    const conf = document.getElementById('wm-conf');
    if (!body) return;

    const items = [
      { name:'Solar Energy (kWh/day)', phys: physRes.sRes.E_net, pred: wm.predicted_solar },
      { name:'Wind Energy (kWh/day)',  phys: physRes.wRes.E_net, pred: wm.predicted_wind },
      { name:'Offshore Energy (kWh)',  phys: physRes.oRes.E_net, pred: wm.predicted_offshore },
      { name:'Battery Final (kWh)',    phys: physRes.bRes.B_next,pred: wm.predicted_battery },
      { name:'Objective Value (Z)',    phys: physRes.zRes.Z,     pred: wm.predicted_Z },
    ];

    const maxVal = Math.max(...items.flatMap(i => [i.phys, i.pred]), 1);

    body.innerHTML = items.map(item => {
      const err    = Math.abs(item.phys - item.pred);
      const errPct = item.phys > 0 ? (err / item.phys * 100).toFixed(1) : '0.0';
      const physW  = (item.phys / maxVal * 100).toFixed(1);
      const predW  = (item.pred / maxVal * 100).toFixed(1);
      return `
        <div class="wm-row">
          <span class="wm-metric-name">${item.name}</span>
          <div class="wm-bar-wrap">
            <div class="wm-bar-track">
              <div class="wm-bar-physics" style="width:${physW}%"></div>
              <div class="wm-bar-wm"      style="width:${predW}%; opacity:0.6"></div>
            </div>
            <span class="wm-error" style="color:${parseFloat(errPct)>5?'var(--amber)':'var(--text-3)'}">
              ${errPct}%
            </span>
          </div>
        </div>`;
    }).join('');

    if (conf) {
      conf.textContent = wm.confidence.toFixed(1) + '%';
      conf.style.color = wm.confidence > 80 ? 'var(--green)'
                       : wm.confidence > 60 ? 'var(--amber)' : 'var(--red)';
    }
  }

  /* ── PLOTLY CHARTS ──────────────────────────────────────── */
  function renderCharts(params) {
    if (!params) return;
    _chartsInit = true;

    // 1. Tilt vs Solar Energy
    const tiltData = Optimizer.sensitivity.tilt(params);
    Plotly.react('g-tilt', [{
      x: tiltData.map(d=>d.x), y: tiltData.map(d=>d.y),
      type:'scatter', mode:'lines', fill:'tozeroy',
      line:{color:'rgba(245,166,35,0.9)', width:1.5},
      fillcolor:'rgba(245,166,35,0.07)',
      hovertemplate:'%{x}° → %{y:.0f} kWh<extra></extra>',
    }, {
      x:[params.solar.tilt], y:[tiltData[params.solar.tilt]?.y||0],
      type:'scatter', mode:'markers',
      marker:{color:'#f5a623', size:8, symbol:'diamond'},
    }], PLOTLY_LAYOUT('Tilt (°)', 'kWh'), PLOTLY_CFG);

    // 2. Wind Speed vs Power
    const windData = Optimizer.sensitivity.windSpeed(params);
    Plotly.react('g-wind', [{
      x: windData.map(d=>d.x), y: windData.map(d=>d.y),
      type:'scatter', mode:'lines', fill:'tozeroy',
      line:{color:'rgba(0,212,255,0.9)', width:1.5},
      fillcolor:'rgba(0,212,255,0.07)',
      hovertemplate:'%{x:.1f} m/s → %{y:.0f} kW<extra></extra>',
    }, {
      x:[params.wind.windSpeed], y:[windData[Math.round(params.wind.windSpeed*10)]?.y||0],
      type:'scatter', mode:'markers',
      marker:{color:'#00d4ff', size:8, symbol:'diamond'},
    }], PLOTLY_LAYOUT('Speed (m/s)', 'kW'), PLOTLY_CFG);

    // 3. Spacing vs Wake Loss
    const wakeData = Optimizer.sensitivity.spacing(params);
    Plotly.react('g-wake', [{
      x: wakeData.map(d=>d.x), y: wakeData.map(d=>d.y),
      type:'scatter', mode:'lines', fill:'tozeroy',
      line:{color:'rgba(168,85,247,0.9)', width:1.5},
      fillcolor:'rgba(168,85,247,0.07)',
      hovertemplate:'%{x:.1f}D → %{y:.2f}%<extra></extra>',
    }, {
      x:[params.wind.turbineSpacing],
      y:[Optimizer.sensitivity.spacing(params).find(d=>Math.abs(d.x-params.wind.turbineSpacing)<0.15)?.y||0],
      type:'scatter', mode:'markers',
      marker:{color:'#a855f7', size:8, symbol:'diamond'},
    }], PLOTLY_LAYOUT('Spacing (×D)', 'Wake Loss %'), PLOTLY_CFG);

    // 4. Battery Capacity vs Unmet Demand
    const batData = Optimizer.sensitivity.battery(params);
    Plotly.react('g-battery', [{
      x: batData.map(d=>d.x), y: batData.map(d=>d.y),
      type:'scatter', mode:'lines', fill:'tozeroy',
      line:{color:'rgba(34,197,94,0.9)', width:1.5},
      fillcolor:'rgba(34,197,94,0.07)',
      hovertemplate:'%{x} kWh → Unmet=%{y:.0f} kWh<extra></extra>',
    }], PLOTLY_LAYOUT('Cap (kWh)', 'Unmet kWh'), PLOTLY_CFG);

    // 5. Wave Height vs Risk Score
    const waveData = Optimizer.sensitivity.waveRisk(params);
    Plotly.react('g-wave', [{
      x: waveData.map(d=>d.x), y: waveData.map(d=>d.y),
      type:'scatter', mode:'lines', fill:'tozeroy',
      line:{color:'rgba(239,68,68,0.9)', width:1.5},
      fillcolor:'rgba(239,68,68,0.07)',
      hovertemplate:'Hs=%{x:.1f}m → R=%{y:.2f}<extra></extra>',
    }], PLOTLY_LAYOUT('Wave Hs (m)', 'Risk Score'), PLOTLY_CFG);

    // 6. Total Cost vs Net Energy (scatter)
    const ceData = Optimizer.sensitivity.costEnergy(params);
    Plotly.react('g-cost', [{
      x: ceData.map(d=>d.cost), y: ceData.map(d=>d.energy),
      type:'scatter', mode:'markers',
      marker:{
        color: ceData.map(d=>d.energy),
        colorscale:[['0','rgba(239,68,68,0.8)'],['0.5','rgba(245,166,35,0.8)'],['1','rgba(34,197,94,0.8)']],
        size:7, opacity:0.8,
      },
      hovertemplate:'$%{x:.2f}k → %{y:.0f} kWh<extra></extra>',
    }], PLOTLY_LAYOUT('Cost ($k)', 'Net Energy (kWh)'), PLOTLY_CFG);
  }

  /* ── CANVAS SCENE ───────────────────────────────────────── */
  let _sceneTimer = null;

  function drawScene() {
    const canvas = document.getElementById('sceneCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.offsetWidth;
    const H   = 260;
    canvas.width = W; canvas.height = H;

    // Sky gradient
    const sky = ctx.createLinearGradient(0,0,0,H*0.65);
    sky.addColorStop(0,'#001020'); sky.addColorStop(1,'#002040');
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

    // Sun
    ctx.shadowBlur = 40; ctx.shadowColor = '#f5a623';
    ctx.fillStyle  = '#f5a623';
    ctx.beginPath(); ctx.arc(W*0.12, H*0.22, 28, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Ground
    const ground = ctx.createLinearGradient(0,H*0.6,0,H*0.75);
    ground.addColorStop(0,'#1a3a1a'); ground.addColorStop(1,'#0f2a0f');
    ctx.fillStyle = ground; ctx.fillRect(0, H*0.6, W*0.65, H*0.4);

    // Water
    const water = ctx.createLinearGradient(0,H*0.62,0,H);
    water.addColorStop(0,'rgba(0,80,160,0.8)'); water.addColorStop(1,'rgba(0,40,100,0.9)');
    ctx.fillStyle = water; ctx.fillRect(W*0.6, H*0.62, W*0.4, H*0.38);

    // Shoreline
    ctx.strokeStyle='rgba(0,180,255,0.3)'; ctx.lineWidth=1.5; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(W*0.6,H*0.62); ctx.lineTo(W*0.6,H); ctx.stroke();
    ctx.setLineDash([]);

    // Solar panels (bottom-left)
    drawSolarField(ctx, W*0.05, H*0.62, 180, 60, _params?.solar?.tilt || 32);

    // Wind turbines (mid)
    const nT = Math.min(6, _params?.wind?.turbineCount || 5);
    for (let i=0; i<nT; i++) {
      drawTurbine(ctx, W*(0.33 + i*0.045), H*0.58, 55 + i*4, '#00d4ff');
    }

    // Offshore turbines
    const nO = Math.min(4, 3);
    for (let i=0; i<nO; i++) {
      drawOffshooreTurbine(ctx, W*(0.68 + i*0.09), H*0.66, 42 + i*3);
    }

    // Labels
    ctx.shadowBlur=0;
    drawLabel(ctx, W*0.15, H*0.58,
      `SOLAR FIELD\n${((_params?.solar?.panelArea)||5000).toLocaleString()} m²`, '#f5a623');
    drawLabel(ctx, W*0.42, H*0.46,
      `WIND FARM\n${_params?.wind?.turbineCount||5} Turbines\nPower: ${((_result?.wRes?.P_net||2450)/1000).toFixed(2)} MW`, '#00d4ff');
    drawLabel(ctx, W*0.78, H*0.55,
      `OFFSHORE FARM\n3 Turbines\nPower: ${((_result?.oRes?.E_net||1350)/8/1000).toFixed(2)} MW`, '#a855f7');

    // Battery badge
    ctx.fillStyle='rgba(10,21,37,0.85)'; ctx.strokeStyle='rgba(34,197,94,0.5)'; ctx.lineWidth=1;
    ctx.fillRect(W*0.55, H*0.72, 130, 50); ctx.strokeRect(W*0.55, H*0.72, 130, 50);
    ctx.fillStyle='var(--green)';
    ctx.font='bold 9px JetBrains Mono'; ctx.fillStyle='#22c55e';
    ctx.fillText('BATTERY SYSTEM', W*0.56, H*0.74+12);
    ctx.fillStyle='rgba(200,220,255,0.7)'; ctx.font='8px JetBrains Mono';
    ctx.fillText(`Capacity: ${((_params?.battery?.capacity)||1500)} kWh`, W*0.56, H*0.74+24);
    ctx.fillText(`Charge: ${((_params?.battery?.currentCharge)||750)} kWh (${((_result?.bRes?.SOC)||50).toFixed(0)}%)`, W*0.56, H*0.74+36);

    // Animate turbines
    if (_sceneTimer) cancelAnimationFrame(_sceneTimer);
    let angle = 0;
    const anim = () => {
      angle += 0.02;
      // Redraw turbine blades only (simplified: full redraw every 3 frames)
      _sceneTimer = requestAnimationFrame(anim);
    };
    // Don't loop draw here — just static. Turbine anim would require partial redraw.
  }

  function drawSolarField(ctx, x, y, w, h, tilt) {
    ctx.save();
    ctx.fillStyle='rgba(255,170,0,0.15)'; ctx.strokeStyle='#f5a623'; ctx.lineWidth=1;
    const rows=4, cols=8;
    const cw=w/cols, ch=h/rows;
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const px=x+c*cw+1, py=y+r*ch+1;
      ctx.fillRect(px,py,cw-2,ch-2); ctx.strokeRect(px,py,cw-2,ch-2);
      // Tilt indicator line
      ctx.strokeStyle='rgba(255,170,0,0.3)'; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.moveTo(px,py+ch/2); ctx.lineTo(px+cw-2,py+ch/2); ctx.stroke();
      ctx.strokeStyle='#f5a623'; ctx.lineWidth=1;
    }
    ctx.restore();
  }

  function drawTurbine(ctx, x, y, h, color) {
    ctx.save();
    ctx.strokeStyle=color; ctx.fillStyle=color;
    ctx.shadowBlur=12; ctx.shadowColor=color;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y+h*0.05); ctx.lineTo(x,y); ctx.stroke();
    // Blades
    const t=(Date.now()/1000);
    for(let i=0;i<3;i++){
      const a=t+i*Math.PI*2/3;
      ctx.beginPath();
      ctx.moveTo(x,y-h*0.12);
      ctx.lineTo(x+Math.cos(a)*h*0.35, y+Math.sin(a)*h*0.35);
      ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x,y-h*0.12,3,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();
  }

  function drawOffshooreTurbine(ctx, x, y, h) {
    ctx.save();
    ctx.strokeStyle='#a855f7'; ctx.fillStyle='#a855f7';
    ctx.shadowBlur=10; ctx.shadowColor='#a855f7'; ctx.lineWidth=1.5;
    // Platform
    ctx.fillStyle='rgba(168,85,247,0.2)';
    ctx.fillRect(x-10, y+4, 20, 10); ctx.strokeRect(x-10, y+4, 20, 10);
    ctx.beginPath(); ctx.moveTo(x,y+4); ctx.lineTo(x,y-h*0.05); ctx.strokeStyle='#a855f7'; ctx.stroke();
    const t2=(Date.now()/1400);
    for(let i=0;i<3;i++){
      const a=t2+i*Math.PI*2/3;
      ctx.beginPath();
      ctx.moveTo(x,y-h*0.05);
      ctx.lineTo(x+Math.cos(a)*h*0.3, y-h*0.05+Math.sin(a)*h*0.3);
      ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(x,y-h*0.05,2.5,0,Math.PI*2); ctx.fillStyle='#a855f7'; ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();
  }

  function drawLabel(ctx, x, y, text, color) {
    const lines=text.split('\n');
    const lh=13, pad=6;
    const maxW=Math.max(...lines.map(l=>l.length*5.5));
    ctx.fillStyle='rgba(5,12,25,0.8)'; ctx.strokeStyle=color+'66'; ctx.lineWidth=1;
    ctx.fillRect(x-pad, y-lh, maxW+pad*2, lines.length*lh+pad);
    ctx.strokeRect(x-pad, y-lh, maxW+pad*2, lines.length*lh+pad);
    ctx.font='bold 9px JetBrains Mono'; ctx.fillStyle=color; ctx.shadowBlur=0;
    lines.forEach((l,i) => {
      if(i===0) ctx.font='bold 9px JetBrains Mono';
      else ctx.font='8px JetBrains Mono'; ctx.fillStyle=i===0?color:'rgba(200,220,255,0.7)';
      ctx.fillText(l, x, y+i*lh);
    });
  }

  /* ── OPTIMIZER ──────────────────────────────────────────── */
  function startOptimize() {
    if (Optimizer.isRunning()) return;
    _params = readParams();

    const status = document.getElementById('opt-status');
    if (status) status.textContent = 'Running…';
    document.getElementById('apply-btn').disabled = true;

    Optimizer.run(_params, {
      onProgress: ({ count, total, pct, currentBestZ }) => {
        document.getElementById('prog-fill').style.width = pct + '%';
        document.getElementById('prog-pct').textContent  = pct + '%';
        document.getElementById('prog-text').textContent = `Searching combinations…  Best Z: ${isFinite(currentBestZ) ? Math.round(currentBestZ).toLocaleString() : '—'}`;
        document.getElementById('prog-detail').textContent = `${count.toLocaleString()} / ${total.toLocaleString()} evaluated`;
      },
      onComplete: ({ found, result, combo, Z, totalEvaluated }) => {
        if (status) status.textContent = found ? '✓ Optimal Configuration Found!' : '⚠ No Feasible Solution';
        if (status) status.style.color = found ? 'var(--green)' : 'var(--red)';
        document.getElementById('prog-text').textContent = `Search complete — ${totalEvaluated.toLocaleString()} combinations evaluated`;
        document.getElementById('prog-fill').style.width = '100%';

        if (!found || !result || !combo) return;
        _optResult = { result, combo };

        // Current values for delta
        const cur = _result || PhysicsEngine.calculate(_params);

        const dFmt = (newV, oldV, unit='', dec=0) => {
          const d = newV - oldV;
          if (Math.abs(d) < 0.01) return '<span style="color:var(--text-3)">no change</span>';
          const sign = d > 0 ? '▲ +' : '▼ ';
          const col  = d > 0 ? 'var(--green)' : 'var(--amber)';
          return `<span style="color:${col}">${sign}${Math.abs(d).toFixed(dec)}${unit}</span>`;
        };

        document.getElementById('op-tilt').textContent = combo.tilt + '°';
        document.getElementById('op-tilt-d').innerHTML = dFmt(combo.tilt, _params.solar.tilt, '°', 0) + ` (was ${_params.solar.tilt}°)`;
        document.getElementById('op-az').textContent   = combo.azimuth + '°';
        document.getElementById('op-az-d').innerHTML   = dFmt(combo.azimuth, _params.solar.azimuth, '°', 0) + ` (was ${_params.solar.azimuth}°)`;
        document.getElementById('op-yaw').textContent  = combo.yaw + '°';
        document.getElementById('op-yaw-d').innerHTML  = dFmt(-combo.yaw, -(_params.wind.yawAngle||0), '°', 0) + ` (was ${_params.wind.yawAngle||0}°)`;
        document.getElementById('op-sp').textContent   = combo.spacing + 'D';
        document.getElementById('op-sp-d').innerHTML   = dFmt(combo.spacing, _params.wind.turbineSpacing, 'D', 1) + ` (was ${_params.wind.turbineSpacing}D)`;
        document.getElementById('op-bc').textContent   = combo.bcap.toLocaleString() + ' kWh';
        document.getElementById('op-bc-d').innerHTML   = dFmt(combo.bcap, _params.battery.capacity, ' kWh', 0) + ` (was ${_params.battery.capacity})`;
        document.getElementById('op-cl').textContent   = combo.cleaning + ' days';
        document.getElementById('op-cl-d').innerHTML   = dFmt(-combo.cleaning, -_params.solar.cleaningInterval, ' d', 0) + ` (was ${_params.solar.cleaningInterval}d)`;

        const optE = result.zRes.totalEnergy;
        const curE = cur.zRes.totalEnergy;
        const optC = result.zRes.totalCost;
        const curC = cur.zRes.totalCost;

        document.getElementById('os-energy').textContent   = Math.round(optE).toLocaleString() + ' kWh/day';
        document.getElementById('os-energy-d').innerHTML   = dFmt(optE, curE, ' kWh', 0);
        document.getElementById('os-cost').textContent     = '$' + Math.round(optC).toLocaleString();
        document.getElementById('os-cost-d').innerHTML     = dFmt(-optC, -curC, '', 0);
        document.getElementById('os-Z').textContent        = Math.round(Z).toLocaleString();
        document.getElementById('os-Z-d').innerHTML        = dFmt(Z, cur.zRes.Z, '', 0);

        document.getElementById('apply-btn').disabled = false;
      },
    });
  }

  /* ── APPLY OPTIMIZED ────────────────────────────────────── */
  function applyOptimized() {
    if (!_optResult) return;
    const { combo } = _optResult;
    // Update slider display values
    const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('sv-tilt',    combo.tilt+'°'); set('sv-azimuth', combo.azimuth+'°');
    set('sv-yaw',     combo.yaw+'°');  set('sv-spacing',  combo.spacing+'D');
    set('sv-cint',    combo.cleaning+'d');
    // Update sliders position (approximate)
    document.querySelectorAll('input[type=range]').forEach(sl => {
      if(sl.oninput?.toString().includes("'tilt'"))     sl.value = combo.tilt;
      if(sl.oninput?.toString().includes("'azimuth'"))  sl.value = combo.azimuth;
      if(sl.oninput?.toString().includes("'yawAngle'")) sl.value = combo.yaw;
      if(sl.oninput?.toString().includes("'turbineSpacing'")) sl.value = combo.spacing;
      if(sl.oninput?.toString().includes("'cleaningInterval'")) sl.value = combo.cleaning;
    });
    document.getElementById('i-bcap').value = combo.bcap;
    calculate();
  }

  /* ── SIDEBAR HELPERS ────────────────────────────────────── */
  function toggleSection(name) {
    const body = document.getElementById('body-' + name);
    const arr  = document.getElementById('arr-' + name);
    if (!body) return;
    const isOpen = !body.classList.contains('collapsed');
    body.classList.toggle('collapsed', isOpen);
    if (arr) arr.classList.toggle('open', !isOpen);
  }

  function slider(section, field, rawVal, displayId, suffix, scale=1) {
    const val = parseFloat(rawVal);
    const disp = document.getElementById(displayId);
    if (disp) disp.textContent = (val * (scale !== 1 ? 1/scale : 1)).toFixed(scale===0.01?0:1).replace('.0','') + suffix;
    // Debounced recalc
    clearTimeout(App._sliderTimer);
    App._sliderTimer = setTimeout(() => calculate(), 80);
  }

  function fieldChange() {
    clearTimeout(App._fieldTimer);
    App._fieldTimer = setTimeout(() => calculate(), 200);
  }

  function setView(v) {
    document.querySelectorAll('.scene-ctrl').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    drawScene();
  }

  function saveScenario() {
    const p   = readParams();
    const out = { savedAt: new Date().toISOString(), params: p, result: _result?.zRes };
    const bl  = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(bl);
    const a   = document.createElement('a');
    a.href=url; a.download='relab-scenario.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function loadScenario() { alert('Load scenario: upload a previously saved JSON file.'); }

  /* ── INIT ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    calculate();

    // Redraw scene on window resize
    window.addEventListener('resize', () => {
      clearTimeout(App._resizeTimer);
      App._resizeTimer = setTimeout(drawScene, 150);
    });

    // Animate canvas (turbine blades)
    let frameCount = 0;
    const animCanvas = () => {
      frameCount++;
      if (frameCount % 3 === 0) drawScene();
      requestAnimationFrame(animCanvas);
    };
    animCanvas();
  });

  /* ── PUBLIC ─────────────────────────────────────────────── */
  return {
    calculate,
    startOptimize,
    applyOptimized,
    toggleSection,
    slider,
    fieldChange,
    setView,
    saveScenario,
    loadScenario,
  };

})();
