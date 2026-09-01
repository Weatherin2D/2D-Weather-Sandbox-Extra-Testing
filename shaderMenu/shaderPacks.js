/**
 * Shader/appearance "pack" storage and builtin presets for the Shader Menu.
 * A pack bundles appearance tuning, clouds/rain tint+response knobs, optional
 * sky overrides, optional custom textures and optional custom shader sources.
 */
(function(global) {
  'use strict';

  const STORAGE_KEY = 'weatherSandboxShaderPacks_v1';

  const CLOUDS_RAIN_DEFAULTS = {
    cloudBrightTint: [0.98, 0.96, 0.92],
    cloudDarkTint: [0.38, 0.48, 0.72],
    rainShaftTint: [0.85, 0.88, 0.92],
    snowShaftTint: [0.95, 0.97, 1.0],
    cloudLightResponse: 1.12,
    cloudShadowStrength: 0.62,
    shaftBacklight: 0.42,
    cloudDensityScale: 1.0,
    cloudOpacityMult: 1.0,
    rainOpacityMult: 1.0,
    cloudSoftness: 0.92,
    shaftSpecular: 0.25,
    skyReflectAmount: 0.15,
    refractDistort: 0.0,
    rainbowStrength: 1.0,
    lightningCloudFill: 1.0,
    lightningShaftGlow: 1.0,
    sheetFlashMix: 1.0,
    lightningTintMode: 'neutral',
    lightningTint: [0.70, 0.57, 1.0],
    flashSoftClip: 1.0,
    lightningBloomCoupling: 1.0,
  };

  const APPEARANCE_DEFAULTS = {
    exposure: 1.0,
    saturation: 1.0,
    contrast: 1.0,
    bloomStrength: 1.0,
    enableRainbows: true,
    smoothClouds: true,
    floodWaterOpacity: 0.75,
    fogHazeStrength: 0.0,
    minShadowLight: 0.02,
  };

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function cloneVec(v, fallback) {
    if (Array.isArray(v) && v.length >= fallback.length) {
      const out = [];
      for (let i = 0; i < fallback.length; i++) {
        out.push(Number.isFinite(+v[i]) ? +v[i] : fallback[i]);
      }
      return out;
    }
    return fallback.slice();
  }

  function getCloudsRainDefaults() {
    return cloneCloudsRain(CLOUDS_RAIN_DEFAULTS);
  }

  function cloneCloudsRain(src) {
    const s = isPlainObject(src) ? src : {};
    const out = {};
    for (const key in CLOUDS_RAIN_DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(CLOUDS_RAIN_DEFAULTS, key)) continue;
      const def = CLOUDS_RAIN_DEFAULTS[key];
      if (Array.isArray(def)) {
        out[key] = cloneVec(s[key], def);
      } else if (typeof def === 'string') {
        out[key] = typeof s[key] === 'string' ? s[key] : def;
      } else if (typeof def === 'boolean') {
        out[key] = typeof s[key] === 'boolean' ? s[key] : def;
      } else {
        out[key] = Number.isFinite(+s[key]) ? +s[key] : def;
      }
    }
    return out;
  }

  function mergeCloudsRain(partial) {
    const base = getCloudsRainDefaults();
    if (!isPlainObject(partial)) return base;
    return cloneCloudsRain(Object.assign({}, base, partial));
  }

  function cloneAppearance(src) {
    const s = isPlainObject(src) ? src : {};
    const out = {};
    for (const key in APPEARANCE_DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(APPEARANCE_DEFAULTS, key)) continue;
      const def = APPEARANCE_DEFAULTS[key];
      if (typeof def === 'boolean') {
        out[key] = typeof s[key] === 'boolean' ? s[key] : def;
      } else {
        out[key] = Number.isFinite(+s[key]) ? +s[key] : def;
      }
    }
    return out;
  }

  function makePack(fields) {
    const f = fields || {};
    return {
      id: String(f.id || uid()),
      name: String(f.name || 'Untitled Pack'),
      version: 1,
      builtin: !!f.builtin,
      appearance: cloneAppearance(f.appearance),
      cloudsRain: mergeCloudsRain(f.cloudsRain),
      sky: isPlainObject(f.sky) ? Object.assign({}, f.sky) : null,
      textures: {
        sky: (f.textures && f.textures.sky) || null,
        sun: (f.textures && f.textures.sun) || null,
      },
      shaders: {
        post: (f.shaders && f.shaders.post) || null,
        sky: (f.shaders && f.shaders.sky) || null,
        realistic: (f.shaders && f.shaders.realistic) || null,
      },
    };
  }

  function uid() {
    return 'pack_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
  }

  function buildBuiltinPacks() {
    const vanilla = makePack({
      id: 'builtin_vanilla',
      name: 'Vanilla',
      builtin: true,
      appearance: {
        exposure: 1.0,
        saturation: 1.0,
        contrast: 1.0,
        bloomStrength: 1.0,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.75,
        fogHazeStrength: 0.0,
        minShadowLight: 0.02,
      },
      cloudsRain: {},
    });

    const cinematic = makePack({
      id: 'builtin_cinematic',
      name: 'Cinematic',
      builtin: true,
      appearance: {
        exposure: 1.12,
        saturation: 1.05,
        contrast: 1.08,
        bloomStrength: 1.25,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.78,
        fogHazeStrength: 0.08,
        minShadowLight: 0.02,
      },
      cloudsRain: {
        cloudDarkTint: [0.32, 0.42, 0.68],
        lightningCloudFill: 0.55,
        lightningShaftGlow: 0.5,
        sheetFlashMix: 0.6,
        lightningTintMode: 'matchClouds',
        flashSoftClip: 0.7,
        shaftSpecular: 0.32,
        skyReflectAmount: 0.20,
      },
    });

    const stormy = makePack({
      id: 'builtin_stormy',
      name: 'Stormy',
      builtin: true,
      appearance: {
        exposure: 0.95,
        saturation: 0.92,
        contrast: 1.06,
        bloomStrength: 0.85,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.8,
        fogHazeStrength: 0.35,
        minShadowLight: 0.015,
      },
      cloudsRain: {
        cloudBrightTint: [0.82, 0.85, 0.9],
        cloudDarkTint: [0.22, 0.28, 0.4],
        rainShaftTint: [0.62, 0.68, 0.75],
        snowShaftTint: [0.85, 0.89, 0.95],
        cloudShadowStrength: 0.62,
        shaftBacklight: 0.22,
        lightningCloudFill: 0.75,
        lightningShaftGlow: 0.7,
        sheetFlashMix: 0.8,
      },
    });

    const goldenHour = makePack({
      id: 'builtin_golden_hour',
      name: 'Golden Hour',
      builtin: true,
      appearance: {
        exposure: 1.08,
        saturation: 1.12,
        contrast: 1.02,
        bloomStrength: 1.15,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.72,
        fogHazeStrength: 0.05,
        minShadowLight: 0.03,
      },
      cloudsRain: {
        cloudBrightTint: [1.0, 0.92, 0.78],
        cloudDarkTint: [0.5, 0.48, 0.62],
        shaftSpecular: 0.42,
        skyReflectAmount: 0.28,
        lightningTintMode: 'matchClouds',
        sheetFlashMix: 0.75,
      },
    });

    const supercell = makePack({
      id: 'builtin_supercell',
      name: 'Supercell',
      builtin: true,
      appearance: {
        exposure: 0.98,
        saturation: 1.08,
        contrast: 1.12,
        bloomStrength: 1.05,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.82,
        fogHazeStrength: 0.12,
        minShadowLight: 0.018,
      },
      cloudsRain: {
        cloudBrightTint: [0.88, 0.95, 0.82],
        cloudDarkTint: [0.28, 0.42, 0.32],
        rainShaftTint: [0.55, 0.72, 0.58],
        snowShaftTint: [0.78, 0.9, 0.85],
        cloudShadowStrength: 0.68,
        shaftBacklight: 0.28,
        cloudDensityScale: 1.15,
        lightningCloudFill: 0.7,
        lightningShaftGlow: 0.65,
        sheetFlashMix: 0.85,
        lightningTintMode: 'matchClouds',
        flashSoftClip: 0.75,
      },
    });

    const arctic = makePack({
      id: 'builtin_arctic',
      name: 'Arctic',
      builtin: true,
      appearance: {
        exposure: 1.05,
        saturation: 0.95,
        contrast: 1.04,
        bloomStrength: 0.95,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.7,
        fogHazeStrength: 0.18,
        minShadowLight: 0.035,
      },
      cloudsRain: {
        cloudBrightTint: [0.92, 0.96, 1.0],
        cloudDarkTint: [0.35, 0.48, 0.72],
        rainShaftTint: [0.72, 0.86, 0.95],
        snowShaftTint: [0.95, 0.98, 1.0],
        cloudLightResponse: 1.1,
        cloudShadowStrength: 0.4,
        shaftBacklight: 0.4,
        skyReflectAmount: 0.3,
        shaftSpecular: 0.35,
        lightningCloudFill: 0.6,
        lightningShaftGlow: 0.55,
        lightningTintMode: 'matchClouds',
      },
    });

    const monsoon = makePack({
      id: 'builtin_monsoon',
      name: 'Monsoon',
      builtin: true,
      appearance: {
        exposure: 1.02,
        saturation: 1.1,
        contrast: 1.05,
        bloomStrength: 1.1,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.88,
        fogHazeStrength: 0.25,
        minShadowLight: 0.025,
      },
      cloudsRain: {
        cloudBrightTint: [0.95, 0.93, 0.88],
        cloudDarkTint: [0.38, 0.45, 0.52],
        rainShaftTint: [0.45, 0.7, 0.72],
        snowShaftTint: [0.85, 0.92, 0.95],
        rainOpacityMult: 1.25,
        cloudOpacityMult: 1.1,
        shaftBacklight: 0.38,
        cloudSoftness: 1.15,
        skyReflectAmount: 0.22,
        lightningCloudFill: 0.65,
        lightningShaftGlow: 0.75,
        sheetFlashMix: 0.7,
      },
    });

    const noir = makePack({
      id: 'builtin_noir',
      name: 'Noir',
      builtin: true,
      appearance: {
        exposure: 0.85,
        saturation: 0.55,
        contrast: 1.15,
        bloomStrength: 0.9,
        enableRainbows: false,
        smoothClouds: true,
        floodWaterOpacity: 0.7,
        fogHazeStrength: 0.15,
        minShadowLight: 0.012,
      },
      cloudsRain: {
        cloudBrightTint: [0.75, 0.76, 0.8],
        cloudDarkTint: [0.18, 0.2, 0.28],
        rainShaftTint: [0.4, 0.42, 0.48],
        snowShaftTint: [0.7, 0.72, 0.78],
        cloudShadowStrength: 0.7,
        shaftBacklight: 0.18,
        shaftSpecular: 0.15,
        lightningCloudFill: 0.5,
        lightningShaftGlow: 0.45,
        sheetFlashMix: 0.55,
        lightningTintMode: 'matchClouds',
        flashSoftClip: 0.6,
        lightningBloomCoupling: 0.75,
      },
    });

    const dustStorm = makePack({
      id: 'builtin_dust_storm',
      name: 'Dust Storm',
      builtin: true,
      appearance: {
        exposure: 0.92,
        saturation: 1.05,
        contrast: 1.08,
        bloomStrength: 0.7,
        enableRainbows: false,
        smoothClouds: true,
        floodWaterOpacity: 0.65,
        fogHazeStrength: 0.4,
        minShadowLight: 0.028,
      },
      cloudsRain: {
        cloudBrightTint: [0.9, 0.78, 0.58],
        cloudDarkTint: [0.45, 0.32, 0.22],
        rainShaftTint: [0.7, 0.58, 0.4],
        snowShaftTint: [0.85, 0.78, 0.65],
        cloudShadowStrength: 0.55,
        shaftBacklight: 0.2,
        rainOpacityMult: 0.85,
        skyReflectAmount: 0.08,
        rainbowStrength: 0.0,
        lightningCloudFill: 0.55,
        lightningShaftGlow: 0.4,
        sheetFlashMix: 0.5,
        lightningTintMode: 'custom',
        lightningTint: [0.95, 0.75, 0.45],
      },
    });

    const softMist = makePack({
      id: 'builtin_soft_mist',
      name: 'Soft Mist',
      builtin: true,
      appearance: {
        exposure: 1.1,
        saturation: 0.98,
        contrast: 0.95,
        bloomStrength: 1.05,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.7,
        fogHazeStrength: 0.2,
        minShadowLight: 0.04,
      },
      cloudsRain: {
        cloudBrightTint: [0.98, 0.96, 0.98],
        cloudDarkTint: [0.7, 0.72, 0.82],
        rainShaftTint: [0.88, 0.9, 0.95],
        snowShaftTint: [0.96, 0.97, 1.0],
        cloudSoftness: 1.45,
        cloudOpacityMult: 1.2,
        rainOpacityMult: 0.9,
        cloudShadowStrength: 0.28,
        shaftBacklight: 0.45,
        shaftSpecular: 0.18,
        skyReflectAmount: 0.25,
        lightningCloudFill: 0.45,
        lightningShaftGlow: 0.4,
        sheetFlashMix: 0.5,
        flashSoftClip: 0.8,
      },
    });

    const neonNight = makePack({
      id: 'builtin_neon_night',
      name: 'Neon Night',
      builtin: true,
      appearance: {
        exposure: 1.05,
        saturation: 1.2,
        contrast: 1.1,
        bloomStrength: 1.6,
        enableRainbows: true,
        smoothClouds: true,
        floodWaterOpacity: 0.75,
        fogHazeStrength: 0.08,
        minShadowLight: 0.02,
      },
      cloudsRain: {
        cloudBrightTint: [0.85, 0.9, 1.0],
        cloudDarkTint: [0.25, 0.3, 0.55],
        rainShaftTint: [0.55, 0.75, 1.0],
        snowShaftTint: [0.8, 0.9, 1.0],
        shaftSpecular: 0.55,
        shaftBacklight: 0.5,
        skyReflectAmount: 0.2,
        lightningCloudFill: 0.85,
        lightningShaftGlow: 0.9,
        sheetFlashMix: 0.9,
        lightningTintMode: 'custom',
        lightningTint: [0.4, 0.9, 1.0],
        flashSoftClip: 0.85,
        lightningBloomCoupling: 1.25,
        rainbowStrength: 1.15,
      },
    });

    return [
      vanilla, cinematic, stormy, goldenHour,
      supercell, arctic, monsoon, noir, dustStorm, softMist, neonNight,
    ];
  }

  const BUILTIN_PACKS = buildBuiltinPacks();

  function getBuiltinPacks() {
    return BUILTIN_PACKS.map(function(p) { return JSON.parse(JSON.stringify(p)); });
  }

  function loadUserPacks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(function(p) { return makePack(Object.assign({}, p, { builtin: false })); });
    } catch (e) {
      return [];
    }
  }

  function saveUserPacks(packs) {
    try {
      const arr = Array.isArray(packs) ? packs : [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.map(function(p) {
        return makePack(Object.assign({}, p, { builtin: false }));
      })));
      return true;
    } catch (e) {
      return false;
    }
  }

  function upsertUserPack(pack) {
    const normalized = makePack(Object.assign({}, pack, { builtin: false }));
    const packs = loadUserPacks();
    const idx = packs.findIndex(function(p) { return p.id === normalized.id; });
    if (idx >= 0) packs[idx] = normalized;
    else packs.push(normalized);
    saveUserPacks(packs);
    return normalized;
  }

  function deleteUserPack(id) {
    const packs = loadUserPacks();
    const before = packs.length;
    const filtered = packs.filter(function(p) { return p.id !== id; });
    if (filtered.length !== before) {
      saveUserPacks(filtered);
      return true;
    }
    return false;
  }

  function exportPackJson(pack) {
    const normalized = makePack(pack);
    return JSON.stringify(normalized, null, 2);
  }

  function importPackJson(jsonString) {
    if (typeof jsonString !== 'string' || !jsonString.trim()) {
      throw new Error('Empty pack JSON');
    }
    const reviver = function(key, value) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
      return value;
    };
    let data;
    try {
      data = JSON.parse(jsonString, reviver);
    } catch (e) {
      throw new Error('Invalid pack JSON: ' + (e.message || e));
    }
    if (!isPlainObject(data)) throw new Error('Pack JSON must be an object');
    const pack = makePack(Object.assign({}, data, { id: data.id || uid(), builtin: false }));
    return pack;
  }

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    CLOUDS_RAIN_DEFAULTS: CLOUDS_RAIN_DEFAULTS,
    APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
    getCloudsRainDefaults: getCloudsRainDefaults,
    cloneCloudsRain: cloneCloudsRain,
    mergeCloudsRain: mergeCloudsRain,
    getBuiltinPacks: getBuiltinPacks,
    loadUserPacks: loadUserPacks,
    saveUserPacks: saveUserPacks,
    upsertUserPack: upsertUserPack,
    deleteUserPack: deleteUserPack,
    exportPackJson: exportPackJson,
    importPackJson: importPackJson,
    makePack: makePack,
  };

  global.ShaderMenu = global.ShaderMenu || {};
  global.ShaderMenu.packs = api;
})(typeof window !== 'undefined' ? window : this);
