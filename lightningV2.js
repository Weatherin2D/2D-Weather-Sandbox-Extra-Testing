/**
 * Lightning Revamp V2 — modular lightning system for 2D Weather Sandbox.
 * Settings, presets, strike logic, electrical burst cycles, and GUI builder.
 */
(function (global) {
  'use strict';

  const LT = {
    NONE: 0,
    INTRACLOUD: 1,
    CLOUD_TO_CLOUD: 2,
    SHEET: 3,
    STROBE: 4,
    CG: 5,
    CG_POSITIVE: 6,
    SPIDER: 7,
    ANVIL_CRAWLER: 8,
    UPWARD: 9,
    BOLT_FROM_BLUE: 10,
    DRY: 11,
  };

  const LT_NAMES = {
    [LT.INTRACLOUD]: 'Intracloud',
    [LT.CLOUD_TO_CLOUD]: 'Cloud-to-Cloud',
    [LT.SHEET]: 'Sheet',
    [LT.STROBE]: 'Strobe',
    [LT.CG]: 'Cloud-to-Ground',
    [LT.CG_POSITIVE]: 'Positive CG',
    [LT.SPIDER]: 'Spider',
    [LT.ANVIL_CRAWLER]: 'Anvil Crawler',
    [LT.UPWARD]: 'Upward',
    [LT.BOLT_FROM_BLUE]: 'Bolt From Blue',
    [LT.DRY]: 'Dry Lightning',
  };

  const SPAWNABLE_LT_TYPES = [
    LT.INTRACLOUD,
    LT.CLOUD_TO_CLOUD,
    LT.SHEET,
    LT.STROBE,
    LT.CG,
    LT.CG_POSITIVE,
    LT.SPIDER,
    LT.ANVIL_CRAWLER,
    LT.UPWARD,
    LT.BOLT_FROM_BLUE,
    LT.DRY,
  ];

  const REALISTIC_RATIOS = {
    intracloud: 58,
    cloudToCloud: 22,
    sheet: 14,
    cg: 5,
    cgPositive: 1.2,
    spider: 9,
    anvilCrawler: 7,
    upward: 0.25,
    boltFromBlue: 0.4,
    dry: 0.8,
    strobe: 4,
  };

  const DEFAULT_SETTINGS = {
    lightningV2Enabled: true,
    lightningPreset: 'Enhanced Realistic',
    useRealisticLightningRatios: true,

    globalLightningMultiplier: 1.0,
    intracloudFrequency: 18.0,
    cloudToCloudFrequency: 8.0,
    cloudToGroundFrequency: 1.2,
    positiveCgFrequency: 0.35,
    spiderLightningFrequency: 1.2,
    anvilCrawlerFrequency: 0.9,
    upwardLightningFrequency: 0.08,
    boltFromBlueFrequency: 0.12,
    dryLightningFrequency: 0.25,
    sheetLightningFrequency: 2.5,

    lightningBrightness: 0.58,
    lightningContrast: 0.95,
    channelThickness: 1.08,
    branchDensity: 1.35,
    branchLength: 1.2,
    flashDuration: 0.92,
    channelGlowDuration: 1.0,
    bloomStrength: 1.08,
    glowStrength: 0.62,
    atmosphericIlluminationStrength: 0.58,
    cloudIlluminationStrength: 0.52,
    rainShaftIlluminationStrength: 0.55,
    terrainIlluminationStrength: 0.48,
    nighttimeFlashStrength: 0.78,
    daytimeFlashStrength: 0.28,
    ltEnableBloom: true,
    ltEnableAtmosphericLighting: true,
    ltEnableCloudIllumination: true,
    ltEnableRainShaftIllumination: true,
    ltEnableTerrainIllumination: true,
    ltEnablePersistentChannelGlow: true,
    ltEnableVolumetricCloudFlashing: true,

    intracloudChannelVisibility: 0.95,
    cloudToCloudChannelVisibility: 1.0,
    spiderChannelVisibility: 1.05,
    anvilChannelVisibility: 1.0,
    cloudLightningBranchDensity: 0.9,
    cloudLightningBranchLength: 0.45,
    cloudLightningOpacity: 1.0,
    cloudObscurationStrength: 0.55,
    channelIllumRatio: 0.35,
    precipOnlyLightningChance: 0.38,

    leaderSpeed: 1.0,
    returnStrokeProbability: 0.35,
    maxReturnStrokes: 4,
    electricalBurstFrequency: 0.6,
    electricalBurstIntensity: 1.0,
    chargeDissipationRate: 1.0,
    chargeTransportStrength: 1.0,
    groundConductivityInfluence: 1.0,
    terrainInfluence: 1.0,
    stormOrganizationInfluence: 1.0,
    lightningClusteringStrength: 0.7,
    lightningSpawnStrictness: 1.0,
    enableChargeTransport: true,
    enableGroundConductivity: true,
    enableElectricalBurstCycles: true,
    enableLightningClustering: true,
    enableTerrainTargeting: true,
    enableDynamicStormElectricalEvolution: true,

    thunderVolume: 1.0,
    thunderDelayMultiplier: 1.0,
    thunderDuration: 1.0,
    thunderBassStrength: 1.0,
    thunderDistanceAttenuation: 1.0,
    enableThunder: true,
    enableDistanceBasedThunderDelay: true,
    enableRollingThunder: true,
    enableThunderEchoes: false,

    lightningPerformanceTier: 'High',
    maxActiveLightningEvents: 24,
    maxActiveBolts: 8,
    maxBranchCount: 48,
    maxIlluminationRadius: 1.0,
    lightningLODDistance: 1.0,
    gpuEffectQuality: 1.0,
    atmosphericLightingResolution: 1.0,
    dynamicLOD: true,
    adaptiveLightningQuality: true,
    performanceAutoScaling: true,

    debugShowChargeField: false,
    debugShowChargeGradient: false,
    debugShowLightningPotential: false,
    debugShowConductivityMap: false,
    debugShowStrikeOrigins: false,
    debugShowStrikeDestinations: false,
    debugShowLightningTypeLabels: false,
    debugShowElectricalBurstRegions: false,
    debugShowActiveLightningEvents: false,
    debugShowThunderRadius: false,
    debugShowPerformanceMetrics: false,
    debugShowSurfaceCharge: false,
    debugShowChargeOrganization: false,
    debugShowSpiderRoutes: false,
    debugShowAnvilRoutes: false,
    debugShowCloudPaths: false,
    debugShowLightningProbability: false,
    debugShowChannelVisibilityMask: false,
    debugShowCloudObscurationMask: false,
    debugShowGeneratedCloudPath: false,
    debugShowRenderedCloudPath: false,
    debugShowBoltGeometryStats: false,
    debugShowBoltDiagnostics: false,
  };

  const PRESETS = {
    'Realistic': {
      globalLightningMultiplier: 0.85,
      atmosphericIlluminationStrength: 0.7,
      cloudIlluminationStrength: 0.75,
      glowStrength: 0.65,
      useRealisticLightningRatios: true,
      positiveCgFrequency: 0.2,
      spiderLightningFrequency: 0.15,
      anvilCrawlerFrequency: 0.12,
      branchDensity: 0.85,
      nighttimeFlashStrength: 0.9,
      daytimeFlashStrength: 0.35,
      lightningPerformanceTier: 'High',
    },
    'Enhanced Realistic': {
      globalLightningMultiplier: 1.0,
      atmosphericIlluminationStrength: 0.55,
      cloudIlluminationStrength: 0.50,
      lightningBrightness: 0.62,
      glowStrength: 0.58,
      bloomStrength: 1.0,
      nighttimeFlashStrength: 0.78,
      branchDensity: 1.2,
      cloudLightningBranchDensity: 1.35,
      cloudLightningBranchLength: 1.3,
      intracloudChannelVisibility: 1.0,
      cloudToCloudChannelVisibility: 1.05,
      spiderChannelVisibility: 1.15,
      anvilChannelVisibility: 1.1,
      channelIllumRatio: 0.5,
      useRealisticLightningRatios: true,
      positiveCgFrequency: 0.35,
      spiderLightningFrequency: 0.35,
      lightningPerformanceTier: 'High',
    },
    'Cinematic': {
      globalLightningMultiplier: 1.4,
      atmosphericIlluminationStrength: 1.5,
      cloudIlluminationStrength: 1.4,
      rainShaftIlluminationStrength: 1.3,
      glowStrength: 1.4,
      bloomStrength: 1.3,
      branchDensity: 1.25,
      branchLength: 1.2,
      positiveCgFrequency: 0.6,
      spiderLightningFrequency: 0.5,
      nighttimeFlashStrength: 1.3,
      lightningPerformanceTier: 'High',
    },
    'Supercell Showcase': {
      globalLightningMultiplier: 1.6,
      positiveCgFrequency: 1.2,
      spiderLightningFrequency: 1.0,
      anvilCrawlerFrequency: 0.9,
      atmosphericIlluminationStrength: 1.6,
      cloudIlluminationStrength: 1.7,
      rainShaftIlluminationStrength: 1.6,
      glowStrength: 1.5,
      bloomStrength: 1.4,
      branchDensity: 1.35,
      cloudLightningBranchDensity: 1.55,
      cloudLightningBranchLength: 1.45,
      intracloudChannelVisibility: 1.1,
      cloudToCloudChannelVisibility: 1.15,
      spiderChannelVisibility: 1.35,
      anvilChannelVisibility: 1.25,
      cloudLightningOpacity: 1.1,
      cloudObscurationStrength: 0.45,
      channelIllumRatio: 0.5,
      nighttimeFlashStrength: 1.5,
      lightningPerformanceTier: 'Ultra',
    },
    'Extreme Lightning': {
      globalLightningMultiplier: 2.5,
      intracloudFrequency: 25,
      sheetLightningFrequency: 8,
      cloudToGroundFrequency: 5,
      atmosphericIlluminationStrength: 1.3,
      cloudIlluminationStrength: 1.4,
      electricalBurstIntensity: 1.8,
      lightningPerformanceTier: 'Medium',
    },
    'Performance': {
      globalLightningMultiplier: 0.7,
      branchDensity: 0.5,
      branchLength: 0.6,
      atmosphericIlluminationStrength: 0.45,
      cloudIlluminationStrength: 0.5,
      rainShaftIlluminationStrength: 0.4,
      glowStrength: 0.4,
      maxActiveBolts: 4,
      maxBranchCount: 20,
      gpuEffectQuality: 0.5,
      lightningPerformanceTier: 'Low',
      ltEnableVolumetricCloudFlashing: false,
    },
    'Custom': {},
  };

  const PERFORMANCE_TIERS = {
    Low: { maxActiveBolts: 4, maxBranchCount: 16, gpuEffectQuality: 0.45, maxIlluminationRadius: 0.6 },
    Medium: { maxActiveBolts: 6, maxBranchCount: 32, gpuEffectQuality: 0.7, maxIlluminationRadius: 0.8 },
    High: { maxActiveBolts: 8, maxBranchCount: 48, gpuEffectQuality: 1.0, maxIlluminationRadius: 1.0 },
    Ultra: { maxActiveBolts: 12, maxBranchCount: 64, gpuEffectQuality: 1.2, maxIlluminationRadius: 1.3 },
  };

  const MAX_SHADER_STRIKES = 8;

  function shaderRand(n) {
    return Math.sin(n) * 43758.5453123 - Math.floor(Math.sin(n) * 43758.5453123);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function applyPreset(controls, presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    Object.assign(controls, preset);
    controls.lightningPreset = presetName;
    const tier = PERFORMANCE_TIERS[controls.lightningPerformanceTier];
    if (tier && presetName !== 'Custom') {
      Object.assign(controls, tier);
    }
  }

  function applyPerformanceTier(controls) {
    const tier = PERFORMANCE_TIERS[controls.lightningPerformanceTier];
    if (tier && controls.lightningPreset !== 'Custom')
      Object.assign(controls, tier);
  }

  // Maps each slider's UI range to a common 0–100 strike-rate scale.
  const FREQ_UI_SCALE = {
    intracloud: 1,
    cloudToCloud: 1,
    sheet: 5,
    cg: 1,
    cgPositive: 20,
    spider: 20,
    anvilCrawler: 20,
    upward: 50,
    boltFromBlue: 50,
    dry: 20,
    strobe: 8,
  };

  function getEffectiveFrequency(controls, typeKey, stormFactor, profile) {
    const personality = getTypeFrequencyMult(profile, typeKey);
    if (controls.useRealisticLightningRatios) {
      const ratio = REALISTIC_RATIOS[typeKey] || 1;
      const total = Object.values(REALISTIC_RATIOS).reduce((a, b) => a + b, 0);
      const base = (ratio / total) * 22 * controls.globalLightningMultiplier;
      return base * (0.55 + stormFactor * 0.75) * personality;
    }
    const map = {
      intracloud: controls.intracloudFrequency,
      cloudToCloud: controls.cloudToCloudFrequency,
      sheet: controls.sheetLightningFrequency,
      cg: controls.cloudToGroundFrequency,
      cgPositive: controls.positiveCgFrequency,
      spider: controls.spiderLightningFrequency,
      anvilCrawler: controls.anvilCrawlerFrequency,
      upward: controls.upwardLightningFrequency,
      boltFromBlue: controls.boltFromBlueFrequency,
      dry: controls.dryLightningFrequency,
      strobe: controls.strobeLightningFrequency ?? 0.8,
    };
    const uiScale = FREQ_UI_SCALE[typeKey] || 1;
    const stormBoost = 0.75 + stormFactor * 0.5;
    return (map[typeKey] || 0) * uiScale * controls.globalLightningMultiplier * personality * stormBoost;
  }

  function createBurstState() {
    return {
      phase: 'quiet',
      quietUntil: 0,
      burstRemaining: 0,
      burstIntensity: 1.0,
      regionSeed: Math.random() * 10000,
    };
  }

  function updateBurstState(state, iterNum, controls, stormActivity) {
    if (!controls.enableElectricalBurstCycles) {
      state.phase = 'burst';
      state.burstIntensity = 1.0;
      return state;
    }
    if (state.phase === 'quiet') {
      if (iterNum >= state.quietUntil) {
        const burstLen = 2 + Math.floor(shaderRand(iterNum * 1.7 + state.regionSeed) * 5
          * controls.electricalBurstIntensity);
        state.phase = 'burst';
        state.burstRemaining = burstLen;
        state.burstIntensity = 0.52 + stormActivity * 0.48;
      }
    } else {
      if (state.burstRemaining <= 0) {
        const quietLen = 15 + Math.floor(shaderRand(iterNum * 2.3 + state.regionSeed) * 80
          / (0.3 + controls.electricalBurstFrequency));
        state.phase = 'quiet';
        state.quietUntil = iterNum + quietLen;
      } else {
        state.burstRemaining--;
      }
    }
    return state;
  }

  function readCacheField(cache, simX, simY, channel) {
    if (!cache || !cache.data) return 0;
    const px = clamp(Math.floor(simX / cache.scale), 0, cache.cacheW - 1);
    const py = clamp(Math.floor(simY / cache.scale), 0, cache.cacheH - 1);
    return cache.data[(py * cache.cacheW + px) * 4 + channel];
  }

  function readCharge(cache, x, y) { return readCacheField(cache, x, y, 0); }
  function readCloud(cache, x, y) { return readCacheField(cache, x, y, 1); }
  function readPotential(cache, x, y) { return readCacheField(cache, x, y, 2); }
  function readConductivity(cache, x, y) { return readCacheField(cache, x, y, 3); }

  function readSurfaceCharge(cache, x, y) {
    return readCacheField(cache, x, Math.max(0, y), 0);
  }

  function analyzeStormElectricalProfile(cache, simResX, simResY) {
    if (!cache || !cache.data) {
      return { type: 'multicell', stormActivity: 0.4, anvilFactor: 0.3, spread: 0.4,
        icMult: 1.2, ccMult: 1.2, spiderMult: 1.0, anvilMult: 0.8, cgMult: 0.75 };
    }
    let upperCloud = 0, lowerCloud = 0, potentialSum = 0, gradSum = 0, cells = 0;
    const step = Math.max(1, Math.floor(cache.cacheW / 10));
    for (let py = 0; py < cache.cacheH; py += step) {
      for (let px = 0; px < cache.cacheW; px += step) {
        const simY = py * cache.scale;
        const i = (py * cache.cacheW + px) * 4;
        const cloud = cache.data[i + 1];
        const pot = cache.data[i + 2];
        const grad = cache.data[i + 3];
        if (simY > simResY * 0.45) upperCloud += cloud;
        else lowerCloud += cloud;
        potentialSum += pot;
        gradSum += grad;
        cells++;
      }
    }
    cells = Math.max(cells, 1);
    const stormActivity = clamp(potentialSum / cells * 1.8, 0.05, 1.0);
    const anvilFactor = clamp(upperCloud / (lowerCloud + upperCloud + 0.01), 0, 1);
    const spread = clamp(gradSum / cells * 2.2, 0, 1);

    if (stormActivity < 0.22)
      return { type: 'weak', stormActivity, anvilFactor, spread, icMult: 1.3, ccMult: 0.9, spiderMult: 0.15, anvilMult: 0.12, cgMult: 0.35 };
    if (stormActivity > 0.58 && anvilFactor > 0.48)
      return { type: 'supercell', stormActivity, anvilFactor, spread, icMult: 2.0, ccMult: 1.6, spiderMult: 2.8, anvilMult: 2.4, cgMult: 0.65 };
    if (stormActivity > 0.42 && spread > 0.38 && anvilFactor > 0.35)
      return { type: 'mcs', stormActivity, anvilFactor, spread, icMult: 2.4, ccMult: 2.0, spiderMult: 2.2, anvilMult: 1.9, cgMult: 0.45 };
    return { type: 'multicell', stormActivity, anvilFactor, spread, icMult: 1.6, ccMult: 1.4, spiderMult: 0.9, anvilMult: 0.75, cgMult: 0.8 };
  }

  function getTypeFrequencyMult(profile, typeKey) {
    if (!profile) return 1;
    const map = {
      intracloud: profile.icMult, cloudToCloud: profile.ccMult,
      spider: profile.spiderMult, anvilCrawler: profile.anvilMult, cg: profile.cgMult,
    };
    return map[typeKey] || 1;
  }

  function cloudGate(cloud) {
    return clamp(1.0 - 1.0 / (1.0 + cloud * 13.0), 0, 1);
  }

  function getSpawnThresholds(controls, channelId) {
    let cloudTh = controls.cloudLightningThreshold ?? 0.3;
    if (channelId === 'cg')
      cloudTh = controls.cloudGroundLightningThreshold ?? 0.3;
    else if (channelId === 'strobe')
      cloudTh = controls.strobeLightningThreshold ?? 0.3;
    else if (channelId === 'sheet' || channelId === 'flash')
      cloudTh = controls.cloudFlashThreshold ?? 0.25;
    else if (channelId === 'dry')
      cloudTh = Math.max(controls.cloudLightningThreshold ?? 0.3, 0.35);
    const scale = controls.lightningSpawnStrictness ?? 1.0;
    return {
      minCloudGate: (0.30 + cloudTh * 0.50) * scale,
      minChargeMag: (0.26 + cloudTh * 0.44) * scale,
      minPotential: (0.38 + cloudTh * 0.58) * scale,
      minRawCloud: (controls.chargeMinCloudDensity ?? 0.32) * (0.85 + cloudTh * 0.45) * scale,
    };
  }

  function isSimInCloudLayer(simX, simY, simResX, simResY, allowGround) {
    if (!Number.isFinite(simX) || !Number.isFinite(simY))
      return false;
    if (simX < 0 || simX > simResX - 1 || simY < 0 || simY > simResY - 1)
      return false;
    if (allowGround)
      return simY >= simResY * 0.02 && simY <= simResY * 0.98;
    return simY >= simResY * 0.07 && simY <= simResY * 0.88;
  }

  function clampLightningSimPos(simX, simY, simResX, simResY, allowGround) {
    const yMin = allowGround ? simResY * 0.02 : simResY * 0.07;
    const yMax = allowGround ? simResY * 0.98 : simResY * 0.88;
    return {
      x: clamp(simX, 0, simResX - 1),
      y: clamp(simY, yMin, yMax),
    };
  }

  function isChargeValidForLtType(charge, ltType, controls, channelId) {
    const t = getSpawnThresholds(controls, channelId || 'intracloud');
    const min = t.minChargeMag;
    const c = Number.isFinite(charge) ? charge : 0;
    if (ltType === LT.CG)
      return c <= -min * 0.88;
    if (ltType === LT.CG_POSITIVE)
      return c >= min * 0.92;
    if (ltType === LT.UPWARD)
      return c >= min * 0.78;
    if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER)
      return c >= min * 0.62;
    if (ltType === LT.BOLT_FROM_BLUE)
      return c <= -min * 0.55;
    return Math.abs(c) >= min * 0.88;
  }

  function isOriginEligibleForStrike(cache, pick, controls, channelId, ltType, simResX, simResY) {
    if (!cache || !pick)
      return false;
    const t = getSpawnThresholds(controls, channelId);
    const ox = pick.originX ?? pick.x;
    const oy = pick.originY ?? pick.y;
    const charge = pick.chargeVal ?? pick.charge ?? readCharge(cache, ox, oy);
    const cloud = pick.cloud ?? readCloud(cache, ox, oy);
    const cg = pick.cloudGate ?? cloudGate(cloud);
    const chargeMag = Math.abs(charge);
    const sx = simResX ?? 1;
    const sy = simResY ?? 1;

    if (!isSimInCloudLayer(ox, oy, sx, sy, false))
      return false;
    if (cloud < t.minRawCloud || cg < t.minCloudGate)
      return false;
    if (chargeMag < t.minChargeMag)
      return false;
    if (chargeMag * cg < t.minChargeMag * t.minCloudGate * 0.88)
      return false;
    const potential = pick.potential ?? readPotential(cache, ox, oy);
    if (potential < t.minPotential * 0.82)
      return false;

    if (ltType != null)
      return isChargeValidForLtType(charge, ltType, controls, channelId);

    if (channelId === 'cg')
      return charge <= -t.minChargeMag * 0.75 || charge >= t.minChargeMag * 0.95;
    if (channelId === 'upward')
      return charge >= t.minChargeMag * 0.78;
    if (channelId === 'spider' || channelId === 'anvil')
      return charge >= t.minChargeMag * 0.62;
    return chargeMag >= t.minChargeMag;
  }

  function computeLightningPotentialAt(cache, simX, simY) {
    const charge = readCharge(cache, simX, simY);
    const cloud = readCloud(cache, simX, simY);
    const potential = readPotential(cache, simX, simY);
    const cg = cloudGate(cloud);
    return potential * 0.62 + Math.abs(charge) * cg * 0.42 + cloud * cg * 0.12;
  }

  function pickOriginFromPotential(cache, eventId, slot, numSlots, simResX, simResY, channelId, controls) {
    controls = controls || {};
    let bestScore = -1;
    let best = null;
    const anvilBias = channelId === 'spider' || channelId === 'anvil';
    const thresholds = getSpawnThresholds(controls, channelId);

    for (let c = 0; c < 14; c++) {
      const cs = c * 503 + slot * 131;
      const xSlot = (slot + shaderRand(eventId * 1.37 + cs) * 0.85) / Math.max(numSlots, 1);
      const ox = (xSlot * 0.75 + shaderRand(eventId * 2.11 + cs) * 0.18 + 0.04) * simResX;
      const probeY = anvilBias
        ? (shaderRand(eventId * 3.07 + cs) * 0.35 + 0.48) * simResY
        : (shaderRand(eventId * 3.07 + cs) * 0.75 + 0.12) * simResY;

      for (let v = 0; v < 5; v++) {
        const vy = clamp(probeY + (v - 2) * simResY * 0.05, simResY * 0.05, simResY * 0.92);
        const cloud = readCloud(cache, ox, vy);
        const charge = readCharge(cache, ox, vy);
        const potential = readPotential(cache, ox, vy);
        const cg = cloudGate(cloud);
        const candidate = {
          x: ox, y: vy, charge, cloud, potential,
          originX: ox, originY: vy, chargeVal: charge, cloudGate: cg,
        };
        if (!isOriginEligibleForStrike(cache, candidate, controls, channelId, null, simResX, simResY))
          continue;
        let score = computeLightningPotentialAt(cache, ox, vy);
        score += Math.abs(charge) * 0.22 + cg * 0.16 + potential * 0.28;
        if (anvilBias) score *= 0.55 + cloud * 1.1 + (vy > simResY * 0.42 ? 0.35 : 0.0);
        if (cloud < thresholds.minRawCloud) score *= 0.35;
        const noise = 0.55 + shaderRand(eventId * 5.03 + cs + v * 17) * 0.9;
        if (score * noise > bestScore) {
          bestScore = score * noise;
          best = candidate;
        }
      }
    }
    if (best)
      return best;
    return {
      x: -1, y: -1,
      charge: 0, cloud: 0, potential: 0,
      originX: -1, originY: -1,
      chargeVal: 0, cloudGate: 0, eligible: false,
    };
  }

  function pickGroundTarget(cache, origin, eventId, slot, simResX, simResY, controls) {
    let bestScore = -1;
    let best = { x: origin.x, y: simResY * 0.02 };
    const originCharge = origin.chargeVal ?? readCharge(cache, origin.x, origin.y);
    const searchRadius = simResX * 0.14;

    for (let i = 0; i < 14; i++) {
      const angle = shaderRand(eventId * 4.1 + slot * 31 + i * 7) * Math.PI * 2;
      const dist = shaderRand(eventId * 6.2 + i * 13) * searchRadius;
      const tx = clamp(origin.x + Math.cos(angle) * dist, 0, simResX - 1);
      const ty = clamp(simResY * 0.01 + shaderRand(eventId + i * 19) * simResY * 0.07, 0, simResY * 0.12);

      let cond = readConductivity(cache, tx, ty);
      if (!controls.enableGroundConductivity) cond = 0.5;
      cond *= controls.groundConductivityInfluence;

      const surfCharge = readSurfaceCharge(cache, tx, ty);
      const oppose = (originCharge > 0 && surfCharge < 0) || (originCharge < 0 && surfCharge > 0)
        ? Math.min(Math.abs(surfCharge), 0.8) * 0.35 : 0;

      const elevBonus = controls.enableTerrainTargeting
        ? readPotential(cache, tx, ty) * controls.terrainInfluence * 0.35 : 0;

      const score = cond + oppose + elevBonus + shaderRand(eventId * 8.1 + i) * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = { x: tx, y: ty };
      }
    }
    return best;
  }

  function scoreCloudCell(cache, x, y, opts) {
    if (!cache || !cache.data) return -1;
    const cloud = readCloud(cache, x, y);
    if (cloud < (opts.minCloud || 0.04)) return -1;
    const pot = readPotential(cache, x, y);
    const chg = readCharge(cache, x, y);
    const cond = readConductivity(cache, x, y);
    let score = cloud * 1.5 + pot * 0.95 + Math.abs(chg) * 0.4 + cond * 0.2;
    if (opts.anvilBias && y > (opts.simResY || 1) * 0.40) score *= 1.0 + cloud * 0.5;
    if (opts.preferOpposite && opts.originCharge !== undefined) {
      const oppose = (opts.originCharge > 0 && chg < 0) || (opts.originCharge < 0 && chg > 0);
      if (oppose) score += Math.min(Math.abs(chg), 0.7) * 0.55;
    }
    if (opts.towardX !== undefined && opts.towardY !== undefined) {
      const dist = Math.hypot(x - opts.towardX, y - opts.towardY);
      const maxD = (opts.simResX || 1) * (opts.towardWeight || 0.12);
      score += (1.0 - clamp(dist / maxD, 0, 1)) * (opts.towardWeight || 0.5);
    }
    if (opts.minDistFrom && opts.minDistFrac) {
      const d = Math.hypot(x - opts.minDistFrom.x, y - opts.minDistFrom.y);
      if (d < (opts.simResX || 1) * opts.minDistFrac) score *= 0.15;
      else score += Math.min(d / (opts.simResX || 1), 0.5) * 0.4;
    }
    return score;
  }

  function chargesOppose(c1, c2) {
    return (c1 > 0.04 && c2 < -0.04) || (c1 < -0.04 && c2 > 0.04);
  }

  function scaleBoltProfile(seed, ltType) {
    const r = shaderRand(seed + 211);
    const h = shaderRand(seed + 313);
    let lenScale = 0.48 + r * 1.05;
    let heightScale = 0.4 + h * 0.9;
    let branchScale = 0.7 + shaderRand(seed + 419) * 0.65;
    if (ltType === LT.SPIDER)
      lenScale *= 0.85 + shaderRand(seed + 521) * 0.4;
    if (ltType === LT.ANVIL_CRAWLER)
      lenScale *= 0.7 + shaderRand(seed + 523) * 0.55;
    if (ltType === LT.SHEET) {
      lenScale *= 0.55 + shaderRand(seed + 525) * 0.9;
      heightScale *= 1.1;
    }
    return { lenScale, heightScale, branchScale };
  }

  /** Roll per-strike illumination mode: precip-shaft-only vs broad area flash. */
  function rollPrecipOnlyStrike(seed, ltType, controls) {
    const base = controls.precipOnlyLightningChance ?? 0.38;
    let p = base;
    if (ltType === LT.INTRACLOUD || ltType === LT.CLOUD_TO_CLOUD || ltType === LT.SHEET)
      p = Math.min(0.65, base + 0.14);
    else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER)
      p = Math.min(0.58, base + 0.10);
    else if (ltType === LT.CG || ltType === LT.CG_POSITIVE)
      p = Math.min(0.52, base + 0.06);
    else if (ltType === LT.STROBE)
      p = Math.min(0.55, base + 0.08);
    return shaderRand(seed + 727) < p;
  }

  function encodeStrikeMetaY(strike) {
    if (strike.precipOnly) {
      if (strike.flashOnly)
        return 0.05;
      return 1.15;
    }
    if (strike.flashOnly)
      return strike.flashInFront ? 1.0 : 0.0;
    return (strike.branchCount || 3) / 8.0;
  }

  /** Pick origin/dest with opposing charge and enforced vertical separation. */
  function findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, opts) {
    opts = opts || {};
    const seed = eventId * 29 + slot * 401;
    let ox = pick.originX;
    let oy = pick.originY;
    let originCharge = pick.chargeVal ?? readCharge(cache, ox, oy);

    if (opts.refineOrigin !== false) {
      let bestOriginScore = scoreCloudCell(cache, ox, oy, { simResX, simResY, originCharge });
      for (let i = 0; i < 10; i++) {
        const tx = clamp(ox + (shaderRand(seed + i * 7) - 0.5) * simResX * 0.06, 0, simResX - 1);
        const ty = clamp(oy + (shaderRand(seed + i * 11) - 0.5) * simResY * 0.08, simResY * 0.06, simResY * 0.92);
        const chg = readCharge(cache, tx, ty);
        if (Math.sign(chg || 0) !== Math.sign(originCharge || 0) && Math.abs(originCharge) > 0.05)
          continue;
        const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, originCharge });
        if (score > bestOriginScore) {
          bestOriginScore = score;
          ox = tx;
          oy = ty;
          originCharge = chg;
        }
      }
    }

    const minYDelta = simResY * (opts.minYDeltaFrac ?? 0.035);
    const maxYDelta = simResY * (opts.maxYDeltaFrac ?? 0.28);
    const minDist = simResX * (opts.minDistFrac ?? 0.06);
    const maxDist = simResX * (opts.maxDistFrac ?? 0.55);
    const samples = opts.samples ?? 32;
    const horizontal = opts.horizontal ?? false;
    let bestDest = { x: ox, y: oy, score: -1, charge: 0 };

    for (let i = 0; i < samples; i++) {
      const rx = shaderRand(seed * 1.3 + i * 17);
      const ry = shaderRand(seed * 2.1 + i * 23);
      let tx;
      let ty;
      if (horizontal) {
        const dir = shaderRand(seed + i * 31) > 0.5 ? 1 : -1;
        tx = clamp(ox + dir * (minDist + rx * (maxDist - minDist)), 0, simResX - 1);
        const ySign = shaderRand(seed + i * 41) > 0.5 ? 1 : -1;
        ty = clamp(oy + ySign * (minYDelta + ry * (maxYDelta - minYDelta)), simResY * 0.06, simResY * 0.92);
      } else {
        const angle = rx * Math.PI * 2;
        const dist = minDist + ry * (maxDist - minDist);
        tx = clamp(ox + Math.cos(angle) * dist, 0, simResX - 1);
        ty = clamp(oy + Math.sin(angle) * dist * (0.25 + shaderRand(seed + i * 29) * 0.55),
          simResY * 0.06, simResY * 0.92);
      }
      const destCharge = readCharge(cache, tx, ty);
      if (opts.requireOpposite !== false && !chargesOppose(originCharge, destCharge))
        continue;
      const yDelta = Math.abs(ty - oy);
      if (yDelta < minYDelta)
        continue;
      let score = scoreCloudCell(cache, tx, ty, {
        simResX, simResY, originCharge, preferOpposite: true,
        minDistFrom: { x: ox, y: oy }, minDistFrac: (opts.minDistFrac ?? 0.06) * 0.5,
        anvilBias: opts.anvilBias,
      });
      score += Math.min(yDelta / simResY, 0.35) * 0.55;
      score += Math.min(Math.abs(destCharge), 0.8) * 0.4;
      const noise = 0.75 + shaderRand(seed + i * 37) * 0.5;
      if (score * noise > bestDest.score)
        bestDest = { x: tx, y: ty, score: score * noise, charge: destCharge };
    }

    if (bestDest.score < 0) {
      const span = ensureMinimumSpan(ox, oy, ox, oy, simResX, simResY,
        opts.minDistFrac ?? 0.08, horizontal, {
          vertFrac: 0.12 + shaderRand(seed + 99) * 0.28,
          slopeSign: shaderRand(seed + 107) > 0.5 ? 1 : -1,
          lenScale: opts.lenScale ?? 1,
        });
      let fx = span.destX;
      let fy = span.destY;
      let fchg = readCharge(cache, fx, fy);
      for (let j = 0; j < 8 && !chargesOppose(originCharge, fchg); j++) {
        const tx = clamp(fx + (shaderRand(seed + j * 43) - 0.5) * simResX * 0.08, 0, simResX - 1);
        const ty = clamp(fy + (shaderRand(seed + j * 47) - 0.5) * simResY * 0.12, simResY * 0.06, simResY * 0.92);
        const chg = readCharge(cache, tx, ty);
        if (chargesOppose(originCharge, chg)) { fx = tx; fy = ty; fchg = chg; break; }
      }
      bestDest = { x: fx, y: fy, score: 1, charge: fchg };
    }

    return {
      originX: ox,
      originY: oy,
      originCharge,
      destX: bestDest.x,
      destY: bestDest.y,
      destCharge: bestDest.charge,
    };
  }

  function findDistantChargedCell(cache, origin, eventId, slot, simResX, simResY, opts) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const originCharge = origin.chargeVal ?? readCharge(cache, ox, oy);
    let best = { x: ox, y: oy, score: -1 };
    const samples = opts.samples || 28;
    const yMin = opts.yMin ?? simResY * 0.38;
    const yMax = opts.yMax ?? simResY * 0.90;

    for (let i = 0; i < samples; i++) {
      const rx = shaderRand(eventId * 3.71 + slot * 47 + i * 13);
      const ry = shaderRand(eventId * 5.13 + slot * 61 + i * 17);
      const tx = clamp(ox + (rx - 0.5) * simResX * (opts.spreadX || 0.55), 0, simResX - 1);
      const ty = clamp(yMin + ry * (yMax - yMin), simResY * 0.08, simResY * 0.92);
      const score = scoreCloudCell(cache, tx, ty, {
        minCloud: opts.minCloud || 0.05,
        anvilBias: opts.anvilBias,
        simResX, simResY,
        minDistFrom: { x: ox, y: oy },
        minDistFrac: opts.minDistFrac || 0.14,
        originCharge,
      });
      const noise = 0.7 + shaderRand(eventId * 7.3 + i * 23) * 0.6;
      if (score * noise > best.score) best = { x: tx, y: ty, score: score * noise };
    }
    return best;
  }

  function findOpposingChargeCell(cache, origin, eventId, slot, simResX, simResY, minDistFrac) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const originCharge = origin.chargeVal ?? readCharge(cache, ox, oy);
    let best = { x: ox, y: oy, score: -1 };

    for (let i = 0; i < 24; i++) {
      const angle = shaderRand(eventId * 2.9 + slot * 37 + i * 11) * Math.PI * 2;
      const dist = (minDistFrac + shaderRand(eventId + i * 19) * 0.14) * simResX;
      const tx = clamp(ox + Math.cos(angle) * dist, 0, simResX - 1);
      const ty = clamp(oy + Math.sin(angle) * simResY * 0.14, simResY * 0.08, simResY * 0.9);
      const score = scoreCloudCell(cache, tx, ty, {
        simResX, simResY, originCharge, preferOpposite: true,
        minDistFrom: { x: ox, y: oy }, minDistFrac: minDistFrac * 0.6,
      });
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  function findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, opts) {
    const points = [{ x: ox, y: oy }];
    let cx = ox;
    let cy = oy;
    const steps = opts.steps || 20;
    const horizontal = opts.horizontal || false;
    const originCharge = opts.originCharge;

    for (let step = 0; step < steps; step++) {
      const t = (step + 1) / steps;
      const targetX = ox + (destX - ox) * t;
      const targetY = oy + (destY - oy) * t;
      let best = { x: cx, y: cy, score: -1 };
      const probes = horizontal ? 13 : 9;
      const slopeMag = Math.abs(destY - oy) / Math.max(Math.abs(destX - ox), simResX * 0.02);
      const stepX = (horizontal ? 0.020 : 0.016) * simResX;
      const stepY = (horizontal ? 0.008 + slopeMag * 0.038 : 0.012) * simResY;
      const baseAngle = Math.atan2(destY - oy, destX - ox);

      for (let a = 0; a < probes; a++) {
        const spread = horizontal ? 0.22 : 0.38;
        const theta = baseAngle + (a - (probes >> 1)) * spread;
        const nx = clamp(cx + Math.cos(theta) * stepX, 0, simResX - 1);
        const ny = clamp(cy + Math.sin(theta) * stepY, simResY * 0.08, simResY * 0.92);
        const score = scoreCloudCell(cache, nx, ny, {
          minCloud: 0.04, simResX, simResY, originCharge,
          towardX: targetX, towardY: targetY, towardWeight: 0.65,
          anvilBias: horizontal,
        });
        if (score > best.score) best = { x: nx, y: ny, score };
      }
      if (best.score < 0.03) break;
      cx = best.x;
      cy = best.y;
      points.push({ x: cx, y: cy });
    }
    const last = points[points.length - 1];
    return { points, destX: last.x, destY: last.y };
  }

  function usesBentPath(ltType, opts) {
    return ltType === LT.SHEET || ltType === LT.STROBE || !!(opts && opts.strobeBurst);
  }

  /** Point C between A and B, offset off the straight chord into charged cloud. */
  function findPathMidpoint(cache, ax, ay, bx, by, originCharge, eventId, slot, simResX, simResY, seed) {
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(Math.hypot(dx, dy), simResX * 0.02);
    const perpX = -dy / len;
    const perpY = dx / len;
    const offsetFrac = 0.14 + shaderRand(seed + 601) * 0.32;
    const side = shaderRand(seed + 613) > 0.5 ? 1 : -1;
    let cx = mx + perpX * len * offsetFrac * side;
    let cy = my + perpY * len * offsetFrac * side;

    if (cache) {
      let best = { x: cx, y: cy, score: -1 };
      for (let i = 0; i < 14; i++) {
        const tx = clamp(cx + (shaderRand(seed + i * 29) - 0.5) * simResX * 0.08, 0, simResX - 1);
        const ty = clamp(cy + (shaderRand(seed + i * 31) - 0.5) * simResY * 0.10, simResY * 0.06, simResY * 0.92);
        const score = scoreCloudCell(cache, tx, ty, {
          minCloud: 0.04, simResX, simResY, originCharge,
          towardX: mx, towardY: my, towardWeight: 0.55,
          anvilBias: true,
        });
        if (score > best.score) best = { x: tx, y: ty, score };
      }
      if (best.score > 0) { cx = best.x; cy = best.y; }
    }
    return { x: cx, y: cy };
  }

  function buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, opts) {
    const seed = eventId * 29 + slot * 401 + ox * 0.01;
    const mid = findPathMidpoint(cache, ox, oy, destX, destY, opts.originCharge,
      eventId, slot, simResX, simResY, seed);
    const totalSteps = opts.steps || 14;
    const stepsA = Math.max(4, Math.floor(totalSteps * 0.52));
    const stepsB = Math.max(4, Math.floor(totalSteps * 0.52));
    const pathA = findChargedPath(cache, ox, oy, mid.x, mid.y, eventId, slot, simResX, simResY, {
      ...opts, steps: stepsA,
    });
    const pathB = findChargedPath(cache, mid.x, mid.y, destX, destY, eventId, slot + 791, simResX, simResY, {
      ...opts, steps: stepsB,
    });
    const points = pathA.points.concat(pathB.points.slice(1));
    return {
      points,
      destX: pathB.destX,
      destY: pathB.destY,
      midX: mid.x,
      midY: mid.y,
      viaMidpoint: true,
    };
  }

  function ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, minFrac, horizontal, spanOpts) {
    spanOpts = spanOpts || {};
    const dx = destX - ox;
    const dy = destY - oy;
    const len = Math.hypot(dx, dy);
    const minLen = simResX * minFrac * (spanOpts.lenScale ?? 1);
    const minYDelta = simResY * (spanOpts.minYDeltaFrac ?? (horizontal ? 0.04 : 0.03));
    if (len >= minLen && Math.abs(dy) >= minYDelta)
      return { destX, destY };
    if (horizontal) {
      const dirSign = dx >= 0 ? 1 : (dx < 0 ? -1 : (shaderRand(ox * 0.01 + oy) > 0.5 ? 1 : -1));
      const slopeSign = spanOpts.slopeSign ?? (dy >= 0 ? 1 : -1);
      const vertFrac = spanOpts.vertFrac ?? 0.10 + shaderRand(ox * 0.02 + oy) * 0.32;
      return {
        destX: clamp(ox + dirSign * minLen, 0, simResX - 1),
        destY: clamp(oy + slopeSign * Math.max(minLen * vertFrac, minYDelta), simResY * 0.06, simResY * 0.92),
      };
    }
    const angle = Math.atan2(dy || -0.12, dx || 0.1);
    const vertScale = spanOpts.vertFrac ?? 0.35;
    return {
      destX: clamp(ox + Math.cos(angle) * minLen, 0, simResX - 1),
      destY: clamp(oy + Math.sin(angle) * minLen * vertScale, simResY * 0.06, simResY * 0.92),
    };
  }

  function buildBoltBranches(routePoints, seed, branchCount, simResX, branchScale) {
    branchScale = branchScale ?? 1;
    const branches = [];
    if (!routePoints || routePoints.length < 2) return branches;
    const pathLen = routePoints.length;
    for (let b = 0; b < branchCount; b++) {
      const attachIdx = 1 + Math.floor(shaderRand(seed + b * 17) * (pathLen - 2));
      const p = routePoints[clamp(attachIdx, 0, pathLen - 1)];
      const next = routePoints[clamp(attachIdx + 1, 0, pathLen - 1)];
      const segAngle = Math.atan2(next.y - p.y, next.x - p.x);
      const ang = segAngle + (shaderRand(seed + b * 31) - 0.5) * 1.8;
      const segLen = Math.hypot(next.x - p.x, next.y - p.y);
      const blen = Math.min(segLen * (0.06 + shaderRand(seed + b * 43) * 0.20) * branchScale,
        simResX * 0.028 * branchScale);
      const vertBias = 0.25 + shaderRand(seed + b * 53) * 0.55;
      branches.push({
        x: p.x, y: p.y,
        ex: p.x + Math.cos(ang) * blen,
        ey: p.y + Math.sin(ang) * blen * vertBias,
      });
    }
    return branches;
  }

  function pathLengthNorm(points, simResX, simResY) {
    if (!points || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i++)
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const diag = Math.hypot(simResX, simResY);
    return clamp(len / Math.max(diag, 1), 0, 1.5);
  }

  function findChargedCloudAbove(cache, origin, eventId, slot, simResX, simResY, originCharge) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    let best = { x: ox, y: oy, score: -1 };
    for (let i = 0; i < 22; i++) {
      const tx = clamp(ox + (shaderRand(eventId * 2.1 + slot * 29 + i * 11) - 0.5) * simResX * 0.12, 0, simResX - 1);
      const ty = clamp(oy - simResY * (0.08 + shaderRand(eventId + i * 17) * 0.22), simResY * 0.06, oy - simResY * 0.02);
      const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, originCharge, minCloud: 0.05 });
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  function pickBFTBGroundTarget(cache, origin, eventId, slot, simResX, simResY, controls) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const dir = shaderRand(eventId * 4.7 + slot * 53) > 0.5 ? 1 : -1;
    let best = { x: ox, y: simResY * 0.03, score: -1 };
    for (let i = 0; i < 16; i++) {
      const tx = clamp(ox + dir * simResX * (0.12 + shaderRand(eventId + i * 23) * 0.22), 0, simResX - 1);
      const ty = clamp(simResY * 0.01 + shaderRand(eventId * 3.1 + i * 7) * simResY * 0.08, 0, simResY * 0.14);
      let cond = readConductivity(cache, tx, ty);
      if (!controls.enableGroundConductivity) cond = 0.5;
      const score = cond + shaderRand(eventId * 6.3 + i) * 0.15;
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  /**
   * V2.6 — IC / CC diffuse flash only (no bolt channels).
   * 50% in-front of cloud layer, 50% behind.
   */
  function buildFlashPlacement(ltType, pick, cache, eventId, slot, simResX, simResY, seed, controls, opts) {
    opts = opts || {};
    const profile = scaleBoltProfile(seed, ltType);
    let ox = pick.originX;
    let oy = pick.originY;
    let cx = ox;
    let cy = oy;

    if (cache && (ltType === LT.CLOUD_TO_CLOUD || ltType === LT.INTRACLOUD || ltType === LT.SHEET)) {
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        minYDeltaFrac: ltType === LT.SHEET ? 0.04 * profile.heightScale : 0.025 * profile.heightScale,
        maxYDeltaFrac: ltType === LT.SHEET ? 0.30 * profile.heightScale : 0.20 * profile.heightScale,
        minDistFrac: ltType === LT.SHEET ? 0.05 * profile.lenScale : 0.03 * profile.lenScale,
        maxDistFrac: ltType === LT.SHEET ? 0.32 * profile.lenScale : 0.16 * profile.lenScale,
        lenScale: profile.lenScale,
        horizontal: ltType === LT.SHEET,
        anvilBias: ltType === LT.SHEET,
      });
      ox = pair.originX;
      oy = pair.originY;
      cx = pair.destX;
      cy = pair.destY;
    } else if (ltType === LT.CLOUD_TO_CLOUD) {
      const dest = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.06);
      cx = (ox + dest.x) * 0.5;
      cy = (oy + dest.y) * 0.5;
    } else if (ltType === LT.INTRACLOUD) {
      const dest = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.03);
      cx = (ox + dest.x) * 0.5;
      cy = (oy + dest.y) * 0.5;
    } else if (ltType === LT.SHEET) {
      cx = ox + (shaderRand(seed + 13) - 0.5) * simResX * 0.10 * profile.lenScale;
      cy = oy + (shaderRand(seed + 17) - 0.5) * simResY * 0.12 * profile.heightScale;
    }

    const originMag = Math.abs(pick.chargeVal ?? readCharge(cache, ox, oy));
    let flashSize = 0.28 + clamp((originMag - 0.12) / 0.65, 0, 1) * 0.52
      + shaderRand(eventId * 5.13 + slot * 97 + 311) * 0.55;
    if (ltType === LT.SHEET)
      flashSize *= 1.65;
    if (opts.dryBurst && ltType === LT.INTRACLOUD)
      flashSize *= 0.68;

    let midX = null;
    let midY = null;
    let viaMidpoint = false;
    let routePoints = [{ x: ox, y: oy }, { x: cx, y: cy }];
    const bent = ltType === LT.SHEET || opts.strobeBurst;
    if (bent) {
      const mid = findPathMidpoint(cache, ox, oy, cx, cy,
        pick.chargeVal ?? (cache ? readCharge(cache, ox, oy) : 0),
        eventId, slot, simResX, simResY, seed + 811);
      midX = mid.x;
      midY = mid.y;
      viaMidpoint = true;
      routePoints = [{ x: ox, y: oy }, { x: midX, y: midY }, { x: cx, y: cy }];
    }

    return {
      originX: ox,
      originY: oy,
      destX: cx,
      destY: cy,
      midX,
      midY,
      viaMidpoint,
      routePoints,
      originCharge: pick.chargeVal,
      destCharge: cache ? readCharge(cache, cx, cy) : undefined,
      branches: [],
      branchCount: 0,
      pathLengthNorm: 0,
      visibilityMult: 1,
      flashSize,
      flashInFront: shaderRand(seed + 91) < 0.5,
      flashOnly: true,
    };
  }

  function isFlashOnlyType(ltType, strobeBurst) {
    if (strobeBurst && ltType === LT.SHEET)
      return true;
    return false;
  }

  function isStrobeChannel(channelId) {
    return channelId === 'strobe';
  }

  /** Strobe burst composition: sheet + intracloud flashes + anvil/spider crawlers. */
  function selectTypeForStrobeBurst(eventId, slot, charge, controls) {
    controls = controls || {};
    const r = shaderRand(eventId * 5.31 + slot * 73.0 + 1913.0);
    const pool = [
      [0.34, LT.SHEET],
      [0.33, LT.INTRACLOUD],
      [0.17, LT.SPIDER],
      [0.16, LT.ANVIL_CRAWLER],
    ].filter(([, type]) => isChargeValidForLtType(charge, type, controls, 'strobe'));
    if (pool.length === 0)
      return null;
    const sum = pool.reduce((acc, [w]) => acc + w, 0);
    let pick = r * sum;
    for (const [w, type] of pool) {
      pick -= w;
      if (pick <= 0)
        return type;
    }
    return pool[pool.length - 1][1];
  }

  function strobeBurstStrikeCount(eventId, channel, maxBolts, controls) {
    const intensity = controls.strobeLightningIntensity ?? 2.0;
    const base = 3 + Math.floor(shaderRand(eventId * 29 + channel.salt + 401) * 3);
    const extra = Math.floor(intensity * 0.8);
    return Math.min(maxBolts, base + extra);
  }

  function isDryChannel(channelId) {
    return channelId === 'dry';
  }

  /** Dry lightning: intracloud flash burst, optionally capped with one small spider crawler. */
  function dryBurstMode(eventId) {
    const r = shaderRand(eventId * 7.13 + 6311.0);
    if (r < 0.22) return 'spider_only';
    if (r < 0.58) return 'ic_plus_spider';
    return 'ic_only';
  }

  function dryBurstStrikeCount(eventId, channel, maxBolts, controls, mode) {
    if (mode === 'spider_only') return 1;
    const base = 2 + Math.floor(shaderRand(eventId * 23 + channel.salt + 631) * 2);
    return Math.min(maxBolts, mode === 'ic_plus_spider' ? base + 1 : base);
  }

  function selectTypeForDryBurst(eventId, slot, mode, numStrikes, charge, controls) {
    controls = controls || {};
    const icOk = isChargeValidForLtType(charge, LT.INTRACLOUD, controls, 'dry');
    const spiderOk = isChargeValidForLtType(charge, LT.SPIDER, controls, 'dry');
    if (mode === 'spider_only')
      return spiderOk ? LT.SPIDER : null;
    if (mode === 'ic_plus_spider' && slot === numStrikes - 1)
      return spiderOk ? LT.SPIDER : (icOk ? LT.INTRACLOUD : null);
    return icOk ? LT.INTRACLOUD : null;
  }

  function jitterPickNearAnchor(anchor, eventId, slot, simResX, simResY, cache, controls, channelId) {
    controls = controls || {};
    const thresholds = getSpawnThresholds(controls, channelId || 'intracloud');
    const minCloud = thresholds.minRawCloud;
    const spreadX = simResX * (0.06 + shaderRand(eventId + slot * 37) * 0.10);
    const spreadY = simResY * (0.03 + shaderRand(eventId + slot * 53) * 0.06);
    let ox = clamp(anchor.originX + (shaderRand(eventId * 2.1 + slot * 11) - 0.5) * spreadX, 0, simResX - 1);
    let oy = clamp(anchor.originY + (shaderRand(eventId * 3.7 + slot * 19) - 0.5) * spreadY, simResY * 0.12, simResY * 0.88);
    if (cache) {
      let best = { x: ox, y: oy, score: -1 };
      for (let i = 0; i < 10; i++) {
        const tx = clamp(ox + (shaderRand(eventId + i * 23) - 0.5) * spreadX * 0.5, 0, simResX - 1);
        const ty = clamp(oy + (shaderRand(eventId + i * 31) - 0.5) * spreadY * 0.5, simResY * 0.10, simResY * 0.90);
        const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, minCloud });
        if (score > best.score)
          best = { x: tx, y: ty, score };
      }
      if (best.score > 0) {
        ox = best.x;
        oy = best.y;
      }
    }
    const cloud = cache ? readCloud(cache, ox, oy) : (anchor.cloud ?? 0);
    const charge = cache ? readCharge(cache, ox, oy) : (anchor.chargeVal ?? 0);
    const potential = cache ? readPotential(cache, ox, oy) : (anchor.potential ?? 0);
    const cg = cloudGate(cloud);
    return {
      originX: ox,
      originY: oy,
      cloud,
      cloudGate: cg,
      chargeVal: charge,
      charge,
      potential,
    };
  }

  /**
   * V2.6 — Bolt geometry for bolt-type lightning (renderer shared; only paths differ).
   */
  function buildBoltGeometry(ltType, pick, cache, profile, eventId, slot, simResX, simResY, controls, opts) {
    opts = opts || {};
    if (isFlashOnlyType(ltType)) return null;
    const seed = eventId * 29 + slot * 401 + pick.originX * 0.01;
    const boltProfile = scaleBoltProfile(seed, ltType);
    let ox = pick.originX;
    let oy = pick.originY;
    let originCharge = pick.chargeVal ?? readCharge(cache, ox, oy);
    let destX = ox;
    let destY = oy;
    let routePoints = [{ x: ox, y: oy }];
    let branchCount = 3;
    let horizontal = false;
    let midX = null;
    let midY = null;
    let viaMidpoint = false;

    if (ltType === LT.CG || ltType === LT.CG_POSITIVE) {
      branchCount = ltType === LT.CG_POSITIVE ? 5 : 4;
      const dest = pickGroundTarget(cache, pick, eventId, slot, simResX, simResY, controls);
      destX = dest.x;
      destY = dest.y;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 22 + Math.floor(shaderRand(seed + 44) * 8),
        originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER) {
      horizontal = true;
      const isSpider = ltType === LT.SPIDER;
      const small = isSpider && opts.smallSpider;
      branchCount = small ? 3 : Math.max(3, Math.floor(
        (isSpider ? 5 : 4) * boltProfile.branchScale + shaderRand(seed + 7) * 2));
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal: true,
        anvilBias: true,
        requireOpposite: true,
        lenScale: boltProfile.lenScale * (small ? 0.55 : 1),
        minDistFrac: small ? 0.05 : (isSpider ? 0.08 : 0.06) * boltProfile.lenScale,
        maxDistFrac: small ? 0.18 : (isSpider ? 0.62 : 0.48) * boltProfile.lenScale,
        minYDeltaFrac: small ? 0.03 : (isSpider ? 0.04 : 0.06) * boltProfile.heightScale,
        maxYDeltaFrac: small ? 0.14 : (isSpider ? 0.22 : 0.34) * boltProfile.heightScale,
        samples: small ? 18 : (isSpider ? 44 : 34),
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const minFrac = small ? 0.06 : (isSpider ? 0.10 : 0.08) * boltProfile.lenScale;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, minFrac, true, {
        vertFrac: 0.08 + shaderRand(seed + 83) * (small ? 0.18 : 0.38) * boltProfile.heightScale,
        slopeSign: pair.destY >= oy ? 1 : -1,
        lenScale: boltProfile.lenScale,
        minYDeltaFrac: (small ? 0.03 : 0.05) * boltProfile.heightScale,
      });
      destX = span.destX;
      destY = span.destY;
      const pathOpts = {
        steps: small ? 8 : Math.floor((isSpider ? 18 : 14) * (0.75 + boltProfile.lenScale * 0.35)),
        horizontal: true, originCharge,
      };
      const path = usesBentPath(ltType, opts)
        ? buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts)
        : findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts);
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      if (path.viaMidpoint) {
        midX = path.midX;
        midY = path.midY;
        viaMidpoint = true;
      }
    } else if (ltType === LT.CLOUD_TO_CLOUD) {
      branchCount = 5;
      const destCell = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.10);
      destX = destCell.x;
      destY = destCell.y;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, 0.14, false, {
        vertFrac: 0.18 + shaderRand(seed + 63) * 0.35,
        slopeSign: destY >= oy ? 1 : -1,
        lenScale: boltProfile.lenScale,
      });
      destX = span.destX;
      destY = span.destY;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 20, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.INTRACLOUD) {
      branchCount = 4;
      const destCell = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.07);
      destX = destCell.x;
      destY = destCell.y;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, 0.08, false, {
        vertFrac: 0.22 + shaderRand(seed + 67) * 0.42,
        slopeSign: destY >= oy ? 1 : -1,
        lenScale: boltProfile.lenScale,
      });
      destX = span.destX;
      destY = span.destY;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 18, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.SHEET) {
      branchCount = Math.max(2, Math.floor(3 * boltProfile.branchScale + shaderRand(seed + 9)));
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal: shaderRand(seed + 61) > 0.35,
        anvilBias: true,
        lenScale: boltProfile.lenScale,
        minDistFrac: 0.05 * boltProfile.lenScale,
        maxDistFrac: 0.38 * boltProfile.lenScale,
        minYDeltaFrac: 0.04 * boltProfile.heightScale,
        maxYDeltaFrac: 0.32 * boltProfile.heightScale,
        samples: 36,
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY,
        0.06 * boltProfile.lenScale, shaderRand(seed + 67) > 0.5, {
          vertFrac: 0.12 + shaderRand(seed + 71) * 0.35 * boltProfile.heightScale,
          slopeSign: destY >= oy ? 1 : -1,
          lenScale: boltProfile.lenScale,
        });
      destX = span.destX;
      destY = span.destY;
      const pathOpts = {
        steps: Math.floor(12 + boltProfile.lenScale * 8),
        horizontal: Math.abs(destX - ox) > Math.abs(destY - oy) * 1.2,
        originCharge,
      };
      const path = buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts);
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      midX = path.midX;
      midY = path.midY;
      viaMidpoint = true;
    } else if (ltType === LT.UPWARD) {
      branchCount = 3;
      const destCell = findChargedCloudAbove(cache, pick, eventId, slot, simResX, simResY, originCharge);
      destX = destCell.x;
      destY = destCell.y;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 12, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.BOLT_FROM_BLUE) {
      branchCount = 5;
      const dest = pickBFTBGroundTarget(cache, pick, eventId, slot, simResX, simResY, controls);
      destX = dest.x;
      destY = dest.y;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, 0.14, true);
      destX = span.destX;
      destY = span.destY;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 18, horizontal: true, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.STROBE) {
      branchCount = 2;
      destY = clamp(oy + simResY * 0.04, 0, simResY - 1);
      const mid = findPathMidpoint(cache, ox, oy, destX, destY, originCharge,
        eventId, slot, simResX, simResY, seed + 821);
      midX = mid.x;
      midY = mid.y;
      viaMidpoint = true;
      routePoints = [{ x: ox, y: oy }, { x: midX, y: midY }, { x: destX, y: destY }];
    } else {
      return null;
    }

    const branches = buildBoltBranches(routePoints, seed, branchCount, simResX, boltProfile.branchScale);
    const pathNorm = pathLengthNorm(routePoints, simResX, simResY);
    const cloud = readCloud(cache, ox, oy);
    const pierce = controls.cloudObscurationStrength ?? 0.55;
    const visibilityMult = clamp(0.88 + cloud * 0.12 * pierce, 0.88, 1.2);

    return {
      originX: ox,
      originY: oy,
      destX,
      destY,
      midX,
      midY,
      viaMidpoint,
      routePoints,
      branches,
      branchCount,
      pathLengthNorm: pathNorm,
      visibilityMult,
      flashSize: pathNorm,
      originCharge,
      destCharge: readCharge(cache, destX, destY),
    };
  }

  const buildCloudBoltGeometry = buildBoltGeometry;

  function routeCloudPath(cache, origin, eventId, slot, simResX, simResY) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const destCell = findOpposingChargeCell(cache, origin, eventId, slot, simResX, simResY, 0.06);
    const path = findChargedPath(cache, ox, oy, destCell.x, destCell.y, eventId, slot, simResX, simResY, {
      steps: 14,
      originCharge: origin.chargeVal ?? readCharge(cache, ox, oy),
    });
    return { destX: path.destX, destY: path.destY, points: path.points };
  }

  function placementForSpiderAnvil(origin, profile, simResX, simResY, seed, ltType) {
    const x = origin.x ?? origin.originX;
    const y = origin.y ?? origin.originY;
    const isSpider = ltType === LT.SPIDER;
    const anvilBoost = profile ? profile.anvilFactor : 0.4;
    const horizFrac = (isSpider ? 0.52 : 0.46) * (0.75 + anvilBoost * 0.65) * (0.85 + shaderRand(seed + 2) * 0.55);
    const angle = (shaderRand(seed + 5) - 0.5) * Math.PI * 0.55;
    const dx = Math.cos(angle) * horizFrac * simResX;
    const dy = Math.sin(angle) * horizFrac * simResY * 0.06;
    return {
      destX: clamp(x + dx, 0, simResX - 1),
      destY: clamp(y + dy, simResY * 0.12, simResY * 0.88),
      flashSize: horizFrac,
      branchCount: isSpider ? 4 + Math.floor(shaderRand(seed + 9) * 2) : 3 + Math.floor(shaderRand(seed + 9)),
    };
  }

  function selectTypeForChannel(channelId, origin, eventId, slot, controls, isDry) {
    const r = shaderRand(eventId * 3.17 + slot * 41 + channelId.length * 7);
    const charge = origin.charge ?? 0;
    const chargeMag = Math.abs(charge);
    const isHigh = chargeMag > 0.42 || origin.potential > 0.55;

    if (isDry && r < 0.72) return LT.INTRACLOUD;
    switch (channelId) {
      case 'intracloud': return LT.INTRACLOUD;
      case 'cc': return r > 0.35 ? LT.CLOUD_TO_CLOUD : LT.INTRACLOUD;
      case 'sheet': return LT.SHEET;
      case 'strobe': return selectTypeForStrobeBurst(eventId, slot, charge, controls);
      case 'cg':
        if (charge >= 0.18 && isHigh && r < 0.12 * (controls.positiveCgFrequency + 0.1))
          return LT.CG_POSITIVE;
        if (charge > -0.12)
          return null;
        return LT.CG;
      case 'spider':
        if (charge < 0.08)
          return null;
        return LT.SPIDER;
      case 'anvil':
        if (charge < 0.08)
          return null;
        return LT.ANVIL_CRAWLER;
      case 'upward':
        if (charge < 0.12)
          return null;
        return LT.UPWARD;
      case 'bftb':
        if (charge > -0.08)
          return null;
        return LT.BOLT_FROM_BLUE;
      case 'dry': return LT.INTRACLOUD;
      default: return LT.SHEET;
    }
  }

  function numReturnStrokesForType(ltType, originMag, seed, controls) {
    if (ltType === LT.DRY) return 1;
    let base = 1;
    if (shaderRand(seed + 77) < controls.returnStrokeProbability) base = 2;
    if (ltType === LT.CG_POSITIVE && shaderRand(seed + 113) < 0.62) base = 3;
    if (ltType === LT.CG_POSITIVE && shaderRand(seed + 131) < 0.28) base = Math.min(controls.maxReturnStrokes, base + 1);
    if (shaderRand(seed + 199) < 0.08 && originMag > 0.5) base = Math.min(controls.maxReturnStrokes, base + 1);
    return clamp(base, 1, controls.maxReturnStrokes);
  }

  function brightnessForType(ltType, originMag, controls, opts) {
    opts = opts || {};
    const mag = clamp(Number.isFinite(originMag) ? originMag : 0.3, 0.0, 1.2);
    let b = 0.28 + mag * 0.32;
    if (ltType === LT.DRY) b *= 0.18;
    else if (ltType === LT.CG_POSITIVE) b *= 1.38;
    else b *= 0.95;
    if (opts.dryBurst) {
      if (ltType === LT.SPIDER) b *= 0.40;
      else if (ltType === LT.INTRACLOUD) b *= 0.52;
    }
    const bright = (controls.lightningBrightness ?? 0.55) * b;
    return clamp(bright, 0.04, 1.2);
  }

  function illuminationRadiusForType(ltType, controls) {
    let r = controls.maxIlluminationRadius;
    if (ltType === LT.DRY) r *= 0.32;
    else if (ltType === LT.CG_POSITIVE) r *= 2.2;
    else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER) r *= 1.5;
    else r *= 1.1;
    return r;
  }

  function isDryLightningType(ltType) {
    return ltType === LT.DRY;
  }

  /** @deprecated Single-strike dry flash — dry channel now uses IC burst + optional small spider. */
  function placementForDryStrike(origin, simResX, simResY, seed) {
    const x = origin.originX ?? origin.x;
    const y = origin.originY ?? origin.y;
    return {
      destX: x + (shaderRand(seed + 31) - 0.5) * simResX * 0.035,
      destY: Math.max(simResY * 0.18, y - simResY * (0.015 + shaderRand(seed + 47) * 0.045)),
      flashSize: 0.22 + shaderRand(seed + 59) * 0.18,
    };
  }

  function isGroundStrike(ltType) {
    return ltType === LT.CG || ltType === LT.CG_POSITIVE
      || ltType === LT.UPWARD || ltType === LT.BOLT_FROM_BLUE;
  }

  /** V2.6 — all types render with the CG bolt texture asset. */
  function boltTextureIndexForType(ltType, seed) {
    if (ltType === LT.CG_POSITIVE) return Math.floor(shaderRand(seed + 5) * 2);
    return Math.floor(shaderRand(seed + 1) * 4);
  }

  function getChannels(controls, stormActivity, profile) {
    const ch = [
      { id: 'intracloud', salt: 311, freq: () => getEffectiveFrequency(controls, 'intracloud', stormActivity, profile) },
      { id: 'cc', salt: 911, freq: () => getEffectiveFrequency(controls, 'cloudToCloud', stormActivity, profile) },
      { id: 'sheet', salt: 1511, freq: () => getEffectiveFrequency(controls, 'sheet', stormActivity, profile) },
      { id: 'strobe', salt: 1913, freq: () => getEffectiveFrequency(controls, 'strobe', stormActivity, profile) },
      { id: 'cg', salt: 2917, freq: () => getEffectiveFrequency(controls, 'cg', stormActivity, profile) },
      { id: 'spider', salt: 3911, freq: () => getEffectiveFrequency(controls, 'spider', stormActivity, profile) },
      { id: 'anvil', salt: 4513, freq: () => getEffectiveFrequency(controls, 'anvilCrawler', stormActivity, profile) },
      { id: 'upward', salt: 5117, freq: () => getEffectiveFrequency(controls, 'upward', stormActivity, profile) },
      { id: 'bftb', salt: 5719, freq: () => getEffectiveFrequency(controls, 'boltFromBlue', stormActivity, profile) },
      { id: 'dry', salt: 6311, freq: () => getEffectiveFrequency(controls, 'dry', stormActivity, profile) },
    ];
    return ch.filter(c => c.freq() > 0);
  }

  function strikeChance(freq, burstIntensity, clustering) {
    const norm = clamp(freq / 100, 0, 1);
    let chance = norm * 0.052 + norm * norm * 0.032 + 0.00035;
    chance = Math.min(0.90, chance);
    chance *= clamp(burstIntensity, 0.24, 1.1);
    if (clustering > 0.5) chance *= 1.0 + (clustering - 0.5) * 0.25;
    return chance;
  }

  /** Storm-wide charge readiness — gates spawn rate on organized electrification. */
  function computeStormChargeReadiness(cache, simResX, simResY) {
    if (!cache || !cache.data) return 0.2;
    let peakPotential = 0;
    let peakCharge = 0;
    let eligible = 0;
    let cells = 0;
    const step = Math.max(1, Math.floor(cache.cacheW / 12));
    for (let py = 0; py < cache.cacheH; py += step) {
      for (let px = 0; px < cache.cacheW; px += step) {
        const i = (py * cache.cacheW + px) * 4;
        const charge = Math.abs(cache.data[i]);
        const cloud = cache.data[i + 1];
        const potential = cache.data[i + 2];
        const cg = cloudGate(cloud);
        cells++;
        if (cloud > 0.07 && cg > 0.18) {
          eligible++;
          peakPotential = Math.max(peakPotential, potential);
          peakCharge = Math.max(peakCharge, charge * cg);
        }
      }
    }
    const coverage = eligible / Math.max(cells, 1);
    const mag = peakPotential * 0.64 + peakCharge * 0.36;
    return clamp(mag * 0.58 + coverage * 0.42, 0, 1);
  }

  /** One global spawn roll + weighted channel pick (realistic flash budget). */
  function rollLightningSpawn(channels, getStrikeChance, stormActivity, chargeReadiness, iterNum, validateChannel, globalMult) {
    if (!channels || channels.length === 0) return null;
    const readiness = clamp(chargeReadiness, 0, 1);
    if (readiness < 0.18) return null;

    const mult = clamp(globalMult ?? 1, 0, 100);

    let aggChance = 0;
    const weights = [];
    for (const ch of channels) {
      const w = getStrikeChance(ch);
      weights.push(w);
      aggChance += w;
    }
    if (aggChance <= 0) return null;

    const stormGate = clamp(stormActivity * 0.85 + 0.12, 0.1, 1.0);
    const spawnCap = Math.min(0.95, 0.12 * mult);
    const globalChance = Math.min(spawnCap, aggChance * 0.26) * readiness * stormGate;
    if (shaderRand(iterNum * 1.37 + 911.0) >= globalChance) return null;

    const sum = weights.reduce((a, b) => a + b, 0);
    for (let attempt = 0; attempt < 5; attempt++) {
      let r = shaderRand(iterNum * 7.31 + 613.0 + attempt * 83.0) * sum;
      let pick = channels[channels.length - 1];
      for (let i = 0; i < channels.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          pick = channels[i];
          break;
        }
      }
      if (validateChannel(iterNum, pick)) return pick;
    }
    return null;
  }

  function createEventRecord(strike, eventId, iterNum) {
    return {
      id: strike.eventRecordId,
      strikeId: strike.eventRecordId,
      ltType: strike.ltType,
      time: iterNum,
      originX: strike.originX,
      originY: strike.originY,
      destX: strike.destX,
      destY: strike.destY,
      polarity: strike.chargeVal >= 0 ? 1 : -1,
      brightness: strike.brightness,
      intensity: strike.originMag,
      groundStrike: strike.groundStrike,
      stormId: null,
      numReturnStrokes: strike.numReturnStrokes,
      seed: strike.seed,
      flashSize: strike.flashSize,
      eventId,
      texIndex: strike.texIndex,
    };
  }

  function buildSpawnToolsFolder(parentFolder, callbacks) {
    if (!callbacks.forceSpawnLightningType || !callbacks.forceSpawnAllLightningTypes)
      return;
    const spawnFolder = parentFolder.addFolder('Spawn Tools');
    const actions = {
      'Spawn All Types': () => callbacks.forceSpawnAllLightningTypes(),
    };
    for (const ltType of SPAWNABLE_LT_TYPES) {
      const label = LT_NAMES[ltType] || ('Type ' + ltType);
      actions['Spawn ' + label] = () => callbacks.forceSpawnLightningType(ltType);
    }
    spawnFolder.add(actions, 'Spawn All Types');
    for (const ltType of SPAWNABLE_LT_TYPES) {
      const label = LT_NAMES[ltType] || ('Type ' + ltType);
      spawnFolder.add(actions, 'Spawn ' + label);
    }
    return spawnFolder;
  }

  function buildLightningV2GUI(datGui, controls, callbacks) {
    const folder = datGui.addFolder('Lightning');
    const presetCtrl = folder.add(controls, 'lightningPreset', Object.keys(PRESETS))
      .name('Preset').onChange(name => {
        if (name !== 'Custom') {
          applyPreset(controls, name);
          callbacks.onSettingsChanged();
        }
      });

    const freqFolder = folder.addFolder('Frequency');
    const onFreqChanged = () => {
      controls.useRealisticLightningRatios = false;
      controls.lightningPreset = 'Custom';
      callbacks.onSettingsChanged();
    };
    const addFreqSlider = (obj, prop, min, max, step, label) => {
      freqFolder.add(obj, prop, min, max, step).name(label).onChange(onFreqChanged);
    };
    freqFolder.add(controls, 'globalLightningMultiplier', 0, 100, 0.5).name('Global Multiplier')
      .onChange(() => { controls.lightningPreset = 'Custom'; callbacks.onSettingsChanged(); });
    freqFolder.add(controls, 'useRealisticLightningRatios').name('Realistic Ratios')
      .onChange(() => { controls.lightningPreset = 'Custom'; callbacks.onSettingsChanged(); });
    addFreqSlider(controls, 'intracloudFrequency', 0, 100, 0.5, 'Intracloud');
    addFreqSlider(controls, 'cloudToCloudFrequency', 0, 100, 0.5, 'Cloud-to-Cloud');
    addFreqSlider(controls, 'cloudToGroundFrequency', 0, 100, 0.5, 'Cloud-to-Ground');
    addFreqSlider(controls, 'positiveCgFrequency', 0, 5, 0.05, 'Positive CG');
    addFreqSlider(controls, 'spiderLightningFrequency', 0, 5, 0.05, 'Spider');
    addFreqSlider(controls, 'anvilCrawlerFrequency', 0, 5, 0.05, 'Anvil Crawler');
    addFreqSlider(controls, 'upwardLightningFrequency', 0, 2, 0.02, 'Upward');
    addFreqSlider(controls, 'boltFromBlueFrequency', 0, 2, 0.02, 'Bolt From Blue');
    addFreqSlider(controls, 'dryLightningFrequency', 0, 5, 0.05, 'Dry Lightning');
    addFreqSlider(controls, 'sheetLightningFrequency', 0, 20, 0.1, 'Sheet');

    const visualFolder = folder.addFolder('Visual');
    visualFolder.add(controls, 'lightningBrightness', 0.1, 3, 0.05).name('Brightness');
    visualFolder.add(controls, 'lightningContrast', 0.1, 3, 0.05).name('Contrast');
    visualFolder.add(controls, 'channelThickness', 0.25, 4, 0.05).name('Channel Thickness');
    visualFolder.add(controls, 'branchDensity', 0.1, 3, 0.05).name('Branch Density');
    visualFolder.add(controls, 'branchLength', 0.1, 3, 0.05).name('Branch Length');
    visualFolder.add(controls, 'flashDuration', 0.2, 3, 0.05).name('Flash Duration');
    visualFolder.add(controls, 'channelGlowDuration', 0.1, 3, 0.05).name('Channel Glow');
    visualFolder.add(controls, 'bloomStrength', 0, 3, 0.05).name('Bloom Strength');
    visualFolder.add(controls, 'glowStrength', 0, 3, 0.05).name('Glow Strength');
    visualFolder.add(controls, 'atmosphericIlluminationStrength', 0, 3, 0.05).name('Atmospheric');
    visualFolder.add(controls, 'cloudIlluminationStrength', 0, 3, 0.05).name('Cloud');
    visualFolder.add(controls, 'rainShaftIlluminationStrength', 0, 3, 0.05).name('Rain Shaft');
    visualFolder.add(controls, 'terrainIlluminationStrength', 0, 3, 0.05).name('Terrain');
    visualFolder.add(controls, 'nighttimeFlashStrength', 0, 3, 0.05).name('Night Flash');
    visualFolder.add(controls, 'daytimeFlashStrength', 0, 2, 0.05).name('Day Flash');
    visualFolder.add(controls, 'ltEnableBloom').name('Enable Bloom');
    visualFolder.add(controls, 'ltEnableAtmosphericLighting').name('Atmospheric Lighting');
    visualFolder.add(controls, 'ltEnableCloudIllumination').name('Cloud Illumination');
    visualFolder.add(controls, 'ltEnableRainShaftIllumination').name('Rain Shaft Illumination');
    visualFolder.add(controls, 'ltEnableTerrainIllumination').name('Terrain Illumination');
    visualFolder.add(controls, 'ltEnablePersistentChannelGlow').name('Persistent Channel Glow');
    visualFolder.add(controls, 'ltEnableVolumetricCloudFlashing').name('Volumetric Cloud Flash');

    const cloudChFolder = folder.addFolder('Cloud Channels');
    const onCloudChChanged = () => { controls.lightningPreset = 'Custom'; callbacks.onSettingsChanged(); };
    cloudChFolder.add(controls, 'intracloudChannelVisibility', 0, 2, 0.05).name('Intracloud Visibility')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'cloudToCloudChannelVisibility', 0, 2, 0.05).name('CC Visibility')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'spiderChannelVisibility', 0, 2, 0.05).name('Spider Visibility')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'anvilChannelVisibility', 0, 2, 0.05).name('Anvil Visibility')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'cloudLightningBranchDensity', 0.2, 3, 0.05).name('Cloud Branch Density')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'cloudLightningBranchLength', 0.2, 3, 0.05).name('Cloud Branch Length')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'cloudLightningOpacity', 0.2, 2, 0.05).name('Cloud Channel Opacity')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'cloudObscurationStrength', 0, 1.5, 0.05).name('Cloud Pierce')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'channelIllumRatio', 0.1, 1.5, 0.05).name('Channel/Illum Balance')
      .onChange(onCloudChChanged);
    cloudChFolder.add(controls, 'precipOnlyLightningChance', 0, 1, 0.02).name('Rain-Shaft-Only Chance')
      .onChange(onCloudChChanged);

    const behaviorFolder = folder.addFolder('Behavior');
    behaviorFolder.add(controls, 'chargeGenerationRate', 0, 5, 0.05).name('Charge Generation')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'chargeMinCloudDensity', 0.05, 0.7, 0.01).name('Min Cloud Density')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'chargeStormCoreThreshold', 0.1, 0.8, 0.01).name('Storm Core Threshold')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'leaderSpeed', 0.2, 3, 0.05).name('Leader Speed');
    behaviorFolder.add(controls, 'returnStrokeProbability', 0, 1, 0.05).name('Return Stroke Prob');
    behaviorFolder.add(controls, 'maxReturnStrokes', 1, 8, 1).name('Max Return Strokes');
    behaviorFolder.add(controls, 'electricalBurstFrequency', 0, 2, 0.05).name('Burst Frequency');
    behaviorFolder.add(controls, 'electricalBurstIntensity', 0.2, 3, 0.05).name('Burst Intensity');
    behaviorFolder.add(controls, 'chargeDissipationRate', 0.2, 3, 0.05).name('Charge Dissipation');
    behaviorFolder.add(controls, 'chargeTransportStrength', 0, 3, 0.05).name('Charge Transport');
    behaviorFolder.add(controls, 'groundConductivityInfluence', 0, 3, 0.05).name('Conductivity Influence');
    behaviorFolder.add(controls, 'terrainInfluence', 0, 3, 0.05).name('Terrain Influence');
    behaviorFolder.add(controls, 'stormOrganizationInfluence', 0, 3, 0.05).name('Storm Organization');
    behaviorFolder.add(controls, 'lightningClusteringStrength', 0, 1, 0.05).name('Clustering Strength');
    behaviorFolder.add(controls, 'lightningSpawnStrictness', 0.6, 2.0, 0.05).name('Spawn Strictness')
      .onChange(() => { controls.lightningPreset = 'Custom'; callbacks.onSettingsChanged(); });
    behaviorFolder.add(controls, 'enableChargeTransport').name('Charge Transport');
    behaviorFolder.add(controls, 'enableGroundConductivity').name('Ground Conductivity');
    behaviorFolder.add(controls, 'enableElectricalBurstCycles').name('Electrical Bursts');
    behaviorFolder.add(controls, 'enableLightningClustering').name('Lightning Clustering');
    behaviorFolder.add(controls, 'enableTerrainTargeting').name('Terrain Targeting');
    behaviorFolder.add(controls, 'enableDynamicStormElectricalEvolution').name('Dynamic Evolution');

    const thunderFolder = folder.addFolder('Thunder');
    thunderFolder.add(controls, 'enableThunder').name('Enable Thunder');
    thunderFolder.add(controls, 'thunderVolume', 0, 3, 0.05).name('Volume');
    thunderFolder.add(controls, 'thunderDelayMultiplier', 0.2, 3, 0.05).name('Delay Multiplier');
    thunderFolder.add(controls, 'thunderDuration', 0.2, 3, 0.05).name('Duration');
    thunderFolder.add(controls, 'thunderBassStrength', 0, 3, 0.05).name('Bass Strength');
    thunderFolder.add(controls, 'thunderDistanceAttenuation', 0, 3, 0.05).name('Distance Attenuation');
    thunderFolder.add(controls, 'enableDistanceBasedThunderDelay').name('Distance Delay');
    thunderFolder.add(controls, 'enableRollingThunder').name('Rolling Thunder');
    thunderFolder.add(controls, 'enableThunderEchoes').name('Thunder Echoes');

    const perfFolder = folder.addFolder('Performance');
    perfFolder.add(controls, 'lightningPerformanceTier', ['Low', 'Medium', 'High', 'Ultra', 'Custom'])
      .name('Quality Tier').onChange(() => {
        if (controls.lightningPerformanceTier !== 'Custom')
          applyPerformanceTier(controls);
      });
    perfFolder.add(controls, 'maxActiveLightningEvents', 4, 500, 1).name('Max Events');
    perfFolder.add(controls, 'maxActiveBolts', 1, 500, 1).name('Max Bolts');
    perfFolder.add(controls, 'maxBranchCount', 8, 500, 4).name('Max Branches');
    perfFolder.add(controls, 'maxIlluminationRadius', 0.2, 2, 0.05).name('Illumination Radius');
    perfFolder.add(controls, 'lightningLODDistance', 0.2, 3, 0.05).name('LOD Distance');
    perfFolder.add(controls, 'gpuEffectQuality', 0.2, 2, 0.05).name('GPU Effect Quality');
    perfFolder.add(controls, 'dynamicLOD').name('Dynamic LOD');
    perfFolder.add(controls, 'adaptiveLightningQuality').name('Adaptive Quality');
    perfFolder.add(controls, 'performanceAutoScaling').name('Auto Scaling');

    const debugFolder = folder.addFolder('Debug');
    debugFolder.add(controls, 'debugShowChargeField').name('Charge Field');
    debugFolder.add(controls, 'debugShowChargeGradient').name('Charge Gradient');
    debugFolder.add(controls, 'debugShowLightningPotential').name('Potential Field');
    debugFolder.add(controls, 'debugShowConductivityMap').name('Conductivity Map');
    debugFolder.add(controls, 'debugShowStrikeOrigins').name('Strike Origins');
    debugFolder.add(controls, 'debugShowStrikeDestinations').name('Strike Destinations');
    debugFolder.add(controls, 'debugShowLightningTypeLabels').name('Type Labels');
    debugFolder.add(controls, 'debugShowElectricalBurstRegions').name('Burst Regions');
    debugFolder.add(controls, 'debugShowActiveLightningEvents').name('Active Events');
    debugFolder.add(controls, 'debugShowThunderRadius').name('Thunder Radius');
    debugFolder.add(controls, 'debugShowPerformanceMetrics').name('Performance Metrics');
    debugFolder.add(controls, 'debugShowSurfaceCharge').name('Surface Charge');
    debugFolder.add(controls, 'debugShowChargeOrganization').name('Charge Organization');
    debugFolder.add(controls, 'debugShowSpiderRoutes').name('Spider Routes');
    debugFolder.add(controls, 'debugShowAnvilRoutes').name('Anvil Routes');
    debugFolder.add(controls, 'debugShowCloudPaths').name('Cloud Paths');
    debugFolder.add(controls, 'debugShowLightningProbability').name('Probability Field');
    debugFolder.add(controls, 'debugShowChannelVisibilityMask').name('Channel Visibility Mask');
    debugFolder.add(controls, 'debugShowCloudObscurationMask').name('Cloud Obscuration Mask');
    debugFolder.add(controls, 'debugShowGeneratedCloudPath').name('Generated Cloud Path');
    debugFolder.add(controls, 'debugShowRenderedCloudPath').name('Rendered Cloud Path');
    debugFolder.add(controls, 'debugShowBoltGeometryStats').name('Bolt Geometry Stats');
    debugFolder.add(controls, 'debugShowBoltDiagnostics').name('Bolt Diagnostics Panel');

    buildSpawnToolsFolder(folder, callbacks);

    folder.open();
    return { folder, presetCtrl };
  }

  global.LightningV2 = {
    LT,
    LT_NAMES,
    SPAWNABLE_LT_TYPES,
    DEFAULT_SETTINGS,
    PRESETS,
    PERFORMANCE_TIERS,
    MAX_SHADER_STRIKES,
    applyPreset,
    applyPerformanceTier,
    getEffectiveFrequency,
    createBurstState,
    updateBurstState,
    readCharge,
    readCloud,
    readPotential,
    readConductivity,
    readSurfaceCharge,
    analyzeStormElectricalProfile,
    getTypeFrequencyMult,
    routeCloudPath,
    buildBoltGeometry,
    buildFlashPlacement,
    isFlashOnlyType,
    isStrobeChannel,
    selectTypeForStrobeBurst,
    strobeBurstStrikeCount,
    isDryChannel,
    dryBurstMode,
    dryBurstStrikeCount,
    selectTypeForDryBurst,
    jitterPickNearAnchor,
    rollPrecipOnlyStrike,
    encodeStrikeMetaY,
    findChargedEndpointPair,
    scaleBoltProfile,
    buildCloudBoltGeometry,
    findChargedPath,
    pathLengthNorm,
    placementForSpiderAnvil,
    cloudGate,
    getSpawnThresholds,
    isOriginEligibleForStrike,
    isChargeValidForLtType,
    isSimInCloudLayer,
    clampLightningSimPos,
    computeLightningPotentialAt,
    pickOriginFromPotential,
    pickGroundTarget,
    selectTypeForChannel,
    numReturnStrokesForType,
    brightnessForType,
    illuminationRadiusForType,
    isDryLightningType,
    placementForDryStrike,
    isGroundStrike,
    boltTextureIndexForType,
    getChannels,
    strikeChance,
    computeStormChargeReadiness,
    rollLightningSpawn,
    createEventRecord,
    buildLightningV2GUI,
    shaderRand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
