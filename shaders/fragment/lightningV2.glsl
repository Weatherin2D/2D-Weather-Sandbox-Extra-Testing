// Lightning V2.11 — GPU procedural SDF bolts + dual illumination modes
// Included by realisticDisplayShader.frag — waterTex / CLOUD from common.glsl

#define LT_V2_PROCEDURAL 1
#define LT_MAX_STRIKES 8
#define LT_PROC_SEGS 48
#define LT_SPIDER_SEGS 40
#define LT_SUB_SEGS 16
#define LT_MAIN_CORE_R 0.00045
#define LT_BRANCH_CORE_R 0.000375

uniform int ltNumStrikes;
uniform float ltEventAge;
uniform vec4 ltStrikePos[LT_MAX_STRIKES];
uniform vec4 ltStrikeDest[LT_MAX_STRIKES];
uniform vec4 ltStrikeMeta[LT_MAX_STRIKES];
uniform vec4 ltStrikeRoute[LT_MAX_STRIKES];

uniform float ltBrightness;
uniform float ltContrast;
uniform float ltFlashDuration;
uniform float ltGlowStrength;
uniform float ltAtmosIllum;
uniform float ltCloudIllum;
uniform float ltRainIllum;
uniform float ltNightFlash;
uniform float ltDayFlash;
uniform int ltEnableAtmos;
uniform int ltEnableCloudIllum;
uniform int ltEnableRainIllum;
uniform int ltEnableVolumetric;
uniform float ltCloudObscuration;
uniform float ltChannelIllumRatio;
uniform float ltStrobeFlicker;

const vec3 LT_CORE_COL = vec3(1.0, 0.98, 1.0);
const vec3 LT_GLOW_COL = vec3(0.88, 0.74, 1.0);
const vec3 LT_CLOUD_WARM = vec3(1.0, 0.90, 0.68);
const vec3 LT_SHEET_COL = vec3(0.94, 0.82, 1.0);

// --- type helpers -----------------------------------------------------------

bool ltDry(float t)    { return t > 10.5 && t < 11.5; }
bool ltIC(float t)     { return t > 0.5 && t < 1.5; }
bool ltCC(float t)     { return t > 1.5 && t < 2.5; }
bool ltSheet(float t)  { return t > 2.5 && t < 3.5; }
bool ltFlashOnly(float t) { return ltIC(t) || ltCC(t); }
bool ltPrecipOnly(float metaY) {
  return (metaY > 1.04 && metaY < 1.06) || (metaY > 0.04 && metaY < 0.06) || metaY > 1.14;
}
bool ltPrecipOnlyBolt(float metaY) { return metaY > 1.14; }
bool ltFlashInFront(float metaY) {
  if (ltPrecipOnlyBolt(metaY)) return false;
  if (ltPrecipOnly(metaY)) return metaY > 0.5;
  return metaY > 0.5;
}
bool ltPrecipOnlyBehind(float metaY) {
  if (ltPrecipOnlyBolt(metaY)) return true;
  return metaY > 0.04 && metaY < 0.06;
}
bool ltStrikeIsFlash(float ltType, float metaY) {
  if (metaY > 1.14) return false;
  if (ltPrecipOnly(metaY))
    return ltFlashOnly(ltType) || ltSheet(ltType);
  // metaY in (0.02, 0.98) encodes bolt branch density — render channel, not diffuse flash
  if (metaY > 0.02 && metaY < 0.98)
    return false;
  return ltFlashOnly(ltType) || (ltSheet(ltType) && metaY <= 1.0);
}
bool ltSpider(float t) { return t > 6.5 && t < 7.5; }
bool ltAnvil(float t)  { return t > 7.5 && t < 8.5; }
bool ltCG(float t)     { return t > 4.5 && t < 6.5; }
bool ltPositive(float t) { return t > 5.5 && t < 6.5; }
bool ltUpward(float t) { return t > 8.5 && t < 9.5; }
bool ltBFTB(float t)   { return t > 9.5 && t < 10.5; }
bool ltIsGroundBolt(float t) { return ltCG(t) || ltPositive(t) || ltDry(t); }

// Bolt glimpses through cloud mass — dense cloud hides, thin gaps and cloud base reveal partial channel
float ltBehindCloudBoltOcclusion(vec2 uv, float cloudwater, vec2 origin, vec2 dest, float ltType, float seed) {
  float cloudOpacity = clamp(1.0 - 1.0 / (1.0 + cloudwater * 13.6), 0.0, 1.0);
  float cloudNoise = 0.38 + 0.62 * random2d(uv * vec2(410.0, 640.0) + seed * 0.0027);
  float wispy = 0.42 + 0.58 * random2d(uv * vec2(180.0, 920.0) + seed * 0.0051);

  float cloudBase = max(origin.y, dest.y);
  float belowBase = smoothstep(cloudBase - 0.015, cloudBase + 0.09, uv.y);
  float inCloud = 1.0 - belowBase;

  float peek = pow(1.0 - cloudOpacity, 1.85) * cloudNoise;
  float shaftGlimpse = mix(0.10, 0.42, wispy);
  float vis = mix(peek * 0.48 + 0.03, shaftGlimpse, belowBase);

  if (ltIsGroundBolt(ltType)) {
    float along = smoothstep(dest.y - 0.02, origin.y + 0.01, uv.y);
    float upperHide = mix(vis, peek * 0.32 + 0.02, inCloud);
    vis = mix(upperHide, mix(0.14, 0.38, wispy), belowBase * along);
  } else {
    vis = mix(peek * 0.40 + 0.02, vis, inCloud * 0.65 + belowBase * 0.35);
  }

  return clamp(vis, 0.0, 0.58);
}

float ltPhase(float age) {
  return clamp(age / max(5.5 * ltFlashDuration, 2.0), 0.0, 1.0);
}

float ltPropagate(float age, float ltType) {
  if (ltIsGroundBolt(ltType)) return 1.0;
  float step = (floor(ltPhase(age) * 5.0) + 1.0) / 5.0;
  return clamp(step, 0.2, 1.0);
}

float ltCloudEmbedVis(float cloud, float visMult) {
  float d = clamp(cloud * 13.6, 0.0, 2.5);
  float soft = max(0.88, 1.0 - d * 0.04 * ltCloudObscuration);
  return soft * max(visMult, 0.88);
}

// --- SDF primitives (reference system) --------------------------------------

float ltSpiderSegSDF(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = dot(ba, ba);
  float h = denom > 1e-12 ? clamp(dot(pa, ba) / denom, 0.0, 1.0) : 0.0;
  return length(pa - ba * h);
}

float ltSegGlow(float d, float coreR) {
  float d2 = d * d;
  float r2 = coreR * coreR;
  return exp(-d2 / (r2 * 2.2)) * 1.6
       + exp(-d2 / (r2 * 10.0)) * 0.20
       + exp(-d2 / (r2 * 35.0)) * 0.05;
}

vec3 ltGetLightningColor(vec2 pos, float seed) {
  float r = random2d(pos * 19.17 + vec2(seed * 0.013, seed * 0.007));
  if (r < 0.35) return vec3(0.85, 0.92, 1.0);
  r -= 0.35;
  if (r < 0.25) return vec3(0.75, 0.65, 1.0);
  r -= 0.25;
  if (r < 0.15) return vec3(1.0, 0.98, 1.0);
  r -= 0.15;
  if (r < 0.12) return vec3(1.0, 0.88, 0.55);
  return vec3(1.0, 0.72, 0.82);
}

float ltSampleCloud(vec2 normPos) {
  normPos = clamp(normPos, vec2(0.001), vec2(0.999));
  return texture(waterTex, normPos)[CLOUD];
}

vec2 ltAspectPos(vec2 normPos, float aspect) {
  return vec2(normPos.x * aspect, normPos.y);
}

float ltHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// 2D strike fingerprint — one cheap call per bolt, mixed into branch seeds
float ltStrikeSeedMix(vec2 origin, vec2 dest, float seed) {
  return seed + rand2d(origin * 131.7 + dest * 71.3 + vec2(seed * 0.0037, seed * 0.0051)) * 8192.0;
}

// Track nearest segment — avoids bright blobs at joints.
void ltTrackSeg(inout float minD, inout float minFade, inout float minCoreR,
    vec2 p, vec2 a, vec2 b, float coreR, float fade) {
  if (fade <= 0.0) return;
  float d = ltSpiderSegSDF(p, a, b);
  if (d < minD) {
    minD = d;
    minFade = fade;
    minCoreR = coreR;
  }
}

void ltBoltTiming(float T, float intensity, bool isCG, out float prog, out float brightness) {
  float i = max(intensity, 0.35);
  if (T < 1.0) {
    prog = T;
    brightness = 118.0 * i;
  } else {
    prog = 1.0;
    float T0 = T - 1.0;
    float flash = max(1.0 / (0.08 + pow(T0 * 3.2, 2.2)), 0.0);
    float blend = smoothstep(0.90, 1.04, T);
    brightness = mix(118.0, flash * 68.0, blend) * i;
  }
}

// Freeform 2D branch — full vertical + horizontal jitter toward a target (Video Project 60 style)
float ltEvalFreeformBranch(vec2 p, vec2 startA, vec2 endA, vec2 startNorm, vec2 endNorm,
    float aspect, float pathSeed, int numSegs, float coreR, float weight, float prog,
    bool requireCloudTip, float vertWeight, float jitter) {
  float minD = 1e9;
  float minFade = 0.0;
  float minCoreR = coreR;

  vec2 cur = startA;
  vec2 curNorm = startNorm;
  vec2 deltaTotal = endA - startA;
  float span = max(length(deltaTotal), 1e-4);
  vec2 targetDir = deltaTotal / span;
  float mainAng = atan(targetDir.y, targetDir.x);
  float ang = mainAng + (ltHash(pathSeed + 7.1) - 0.5) * 1.35;
  float stepLen = span / float(max(numSegs, 1));
  float restore = 0.10 + ltHash(pathSeed + 11.7) * 0.12;

  for (int i = 0; i < LT_SPIDER_SEGS; i++) {
    if (i >= numSegs) break;
    float fi = float(i);
    float t0 = fi / float(numSegs);
    float t1 = (fi + 1.0) / float(numSegs);
    float fade = clamp((prog - t0) * float(numSegs), 0.0, 1.0);

    float rnd = ltHash(pathSeed + fi * 17.3 + 0.31);
    ang += (rnd - 0.5) * jitter;
    ang = mix(ang, mainAng, restore);

    vec2 stepDir = vec2(cos(ang), sin(ang));
    stepDir.y *= mix(0.45, 1.0, vertWeight);
    stepDir = normalize(stepDir + vec2(0.0002, 0.0001));

    vec2 ideal = mix(startA, endA, t1);
    float steer = 0.16 + ltHash(pathSeed + fi * 3.7 + 19.0) * 0.14;
    vec2 next = mix(cur + stepDir * stepLen, ideal, steer);
    vec2 nextNorm = mix(startNorm, endNorm, t1);

    ltTrackSeg(minD, minFade, minCoreR, p, cur, next, coreR, fade);
    cur = next;
    curNorm = nextNorm;
  }

  if (requireCloudTip && ltSampleCloud(clamp(curNorm, vec2(0.001), vec2(0.999))) < 0.008)
    return 0.0;

  return ltSegGlow(minD, minCoreR) * minFade * weight;
}

// Intra-cloud / CC / CG discharge — jagged 2D paths (seg glow only)
float ltEvalCloudDischargeBolt(vec2 p, vec2 origin, vec2 dest, float aspect, float seed,
    float prog, float brightness, int numMainPaths, int segsMain, float spread, bool requireCloudTip) {
  vec2 oA = ltAspectPos(origin, aspect);
  vec2 dA = ltAspectPos(dest, aspect);
  vec2 chord = dA - oA;
  float chordLen = max(length(chord), max(origin.y, 0.04) * 0.12);
  vec2 chordDir = chord / chordLen;
  vec2 perp = vec2(-chordDir.y, chordDir.x);
  float branchCoreR = LT_BRANCH_CORE_R * 0.86;
  float strikeSeed = ltStrikeSeedMix(origin, dest, seed);
  float vertWeight = 0.62 + ltHash(strikeSeed + 2.0) * 0.38;
  float jitter = 1.85 + ltHash(strikeSeed + 3.0) * 2.10;
  float glow = 0.0;

  for (int m = 0; m < 3; m++) {
    if (m >= numMainPaths) break;
    float mf = float(m);
    float pathSeed = strikeSeed + mf * 163.0 + 7.0;
    float along = ltHash(pathSeed + 1.0)
      * (0.22 + 0.58 * mf / max(float(numMainPaths - 1), 1.0));
    float side = (ltHash(pathSeed + 3.0) - 0.5) * spread * chordLen;
    float pathVert = vertWeight * (0.82 + ltHash(pathSeed + 5.0) * 0.36);
    int pathSegs = segsMain + int(ltHash(pathSeed + 9.0) * 8.0) - 4;

    float endT = requireCloudTip
      ? 0.03 + ltHash(pathSeed + 13.0) * 0.12
      : 0.76 + ltHash(pathSeed + 13.0) * 0.20;
    vec2 startA = requireCloudTip
      ? mix(oA, dA, along) + perp * side * 0.55
      : mix(oA, dA, along * 0.20) + perp * side * 0.38;
    vec2 endA = requireCloudTip
      ? mix(dA, oA, endT) + perp * side
      : mix(oA, dA, endT) + perp * side * 0.42;
    vec2 startNorm = requireCloudTip
      ? mix(origin, dest, along) + vec2(perp.x * side * 0.55 / max(aspect, 0.01), perp.y * side * 0.55)
      : mix(origin, dest, along * 0.20) + vec2(perp.x * side * 0.38 / max(aspect, 0.01), perp.y * side * 0.38);
    vec2 endNorm = requireCloudTip
      ? mix(dest, origin, endT) + vec2(perp.x * side / max(aspect, 0.01), perp.y * side)
      : mix(origin, dest, endT) + vec2(perp.x * side * 0.42 / max(aspect, 0.01), perp.y * side * 0.42);

    glow += ltEvalFreeformBranch(p, startA, endA, startNorm, endNorm, aspect,
      pathSeed, pathSegs, branchCoreR, 1.0, prog, requireCloudTip, pathVert, jitter) * brightness;

    for (int s = 0; s < 3; s++) {
      float sf = float(s);
      if (ltHash(pathSeed + 170.0 + sf * 11.0) > 0.42) continue;
      float jointT = 0.10 + ltHash(pathSeed + 200.0 + sf * 7.1) * 0.75;
      vec2 jA = mix(startA, endA, jointT);
      vec2 jNorm = mix(startNorm, endNorm, jointT);
      vec2 kick = vec2(
        (ltHash(pathSeed + 300.0 + sf) - 0.5) * spread * chordLen * 1.6,
        (ltHash(pathSeed + 310.0 + sf) - 0.5) * spread * chordLen * 1.35);
      vec2 subEnd = jA + kick;
      vec2 subEndNorm = jNorm + vec2(kick.x / max(aspect, 0.01), kick.y);
      glow += ltEvalFreeformBranch(p, jA, subEnd, jNorm, subEndNorm, aspect,
        pathSeed + 400.0 + sf * 13.0, LT_SUB_SEGS, branchCoreR * 0.60, 0.44, prog, requireCloudTip,
        pathVert * 0.92, jitter * 0.95) * brightness;
    }
  }

  return glow;
}

// Vertical branch (CG main channel, upward leaders)
float ltEvalVerticalBranch(vec2 p, vec2 startA, vec2 endA, vec2 startNorm, vec2 endNorm,
    float aspect, float seed, int numSegs, float coreR, float weight, float prog,
    float restore, float jitter) {
  float minD = 1e9;
  float minFade = 0.0;
  float minCoreR = coreR;

  vec2 cur = startA;
  vec2 curNorm = startNorm;
  float ang = -PI * 0.5;
  float span = max(length(endA - startA), 1e-4);
  float stepLen = span / float(numSegs);

  for (int i = 0; i < LT_PROC_SEGS; i++) {
    if (i >= numSegs) break;
    float fi = float(i);
    float t0 = fi / float(numSegs);
    float fade = clamp((prog - t0) * float(numSegs), 0.0, 1.0);

    float rnd = ltHash(seed + fi * 13.7 + 2.1);
    ang += (rnd - 0.5) * jitter;
    ang = mix(ang, -PI * 0.5, restore);

    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 ideal = mix(startA, endA, (fi + 1.0) / float(numSegs));
    vec2 next = mix(cur + dir * stepLen, ideal, 0.18);
    vec2 nextNorm = mix(startNorm, endNorm, (fi + 1.0) / float(numSegs));

    ltTrackSeg(minD, minFade, minCoreR, p, cur, next, coreR, fade);
    cur = next;
    curNorm = nextNorm;
  }

  return ltSegGlow(minD, minCoreR) * minFade * weight;
}

// Short downward side branch from CG main bolt
float ltEvalSideBranch(vec2 p, vec2 attachA, vec2 attachNorm, float aspect, float seed,
    int numSegs, float coreR, float weight, float prog, float cloudH) {
  float minD = 1e9;
  float minFade = 0.0;
  float minCoreR = coreR;

  float ang = -PI * 0.5 + (ltHash(seed + 5.1) - 0.5) * PI * 1.6;
  vec2 cur = attachA;
  float stepLen = cloudH * (0.05 + ltHash(seed + 9.3) * 0.20) / float(numSegs);

  for (int i = 0; i < LT_SUB_SEGS; i++) {
    if (i >= numSegs) break;
    float fi = float(i);
    float t0 = fi / float(numSegs);
    float fade = clamp((prog - t0) * float(numSegs), 0.0, 1.0) * (1.0 - t0 * 0.55);

    ang += (ltHash(seed + fi * 7.9) - 0.5) * 0.9;
    ang = mix(ang, -PI * 0.5, 0.22);
    vec2 next = cur + vec2(sin(ang), -cos(ang)) * stepLen;

    ltTrackSeg(minD, minFade, minCoreR, p, cur, next, coreR, fade);
    cur = next;
  }

  return ltSegGlow(minD, minCoreR) * minFade * weight;
}

// CG bolt — same jagged freeform style as intra-cloud bolts, cloud → ground
float ltEvalCGBolt(vec2 p, vec2 origin, vec2 dest, float aspect, float seed,
    float prog, float brightness, bool positive) {
  vec2 oA = ltAspectPos(origin, aspect);
  vec2 dA = ltAspectPos(dest, aspect);
  float span = max(length(dA - oA), max(origin.y, 0.04) * 0.14);
  float mixSeed = ltStrikeSeedMix(origin, dest, seed);
  int paths = 1 + int(ltHash(mixSeed + 81.0) * 2.0);
  int segs = 36 + int(ltHash(mixSeed + 82.0) * 24.0);
  float spread = (0.22 + ltHash(mixSeed + 83.0) * 0.26) * max(span, 0.06);
  float coreScale = positive ? 1.10 : 1.0;
  return ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, brightness * coreScale,
    paths, segs, spread, false);
}

// Spider / anvil — multi-path 2D discharge inside cloud volume
float ltEvalSpiderFamilyBolt(vec2 p, vec2 origin, vec2 dest, float aspect, float seed,
    float prog, float brightness, int numMain, int segsPerMain, bool anvil) {
  vec2 oA = ltAspectPos(origin, aspect);
  vec2 dA = ltAspectPos(dest, aspect);
  float chordLen = max(length(dA - oA), max(origin.y, 0.04) * (anvil ? 0.50 : 0.38));
  float spread = (anvil ? 0.55 : 0.42) / max(chordLen, 0.01);
  return ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, brightness,
    numMain, segsPerMain, spread, true);
}

// Compact intracloud / upward vertical discharge
float ltEvalCompactBolt(vec2 p, vec2 origin, vec2 dest, float aspect, float seed,
    float prog, float brightness, bool upward) {
  if (upward) {
    vec2 oA = ltAspectPos(origin, aspect);
    vec2 dA = ltAspectPos(dest, aspect);
    return ltEvalVerticalBranch(p, dA, oA, dest, origin, aspect, seed,
      28, LT_BRANCH_CORE_R, 1.0, prog, 0.18, 1.2) * brightness;
  }
  vec2 oA = ltAspectPos(origin, aspect);
  vec2 dA = ltAspectPos(dest, aspect);
  float span = max(length(dA - oA), max(origin.y, 0.04) * 0.10);
  return ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, brightness,
    1, 34, 0.35 / span, true);
}

vec3 ltRenderProceduralStrike(vec2 uv, float aspect, vec2 origin, vec2 dest,
    float lightningTime, float ltType, float intensity, float visMult,
    float brightMult, float cloudwater, float seed, bool behindCloud) {
  vec2 p = ltAspectPos(uv, aspect);

  bool isCG = ltIsGroundBolt(ltType);
  bool isPositive = ltPositive(ltType);
  float prog;
  float boltBright;
  ltBoltTiming(lightningTime, intensity * brightMult, isCG, prog, boltBright);

  if (ltDry(ltType))
    boltBright *= 0.18;

  float glow = 0.0;

  if (ltIC(ltType)) {
    vec2 oA = ltAspectPos(origin, aspect);
    vec2 dA = ltAspectPos(dest, aspect);
    float span = max(length(dA - oA), max(origin.y, 0.04) * 0.12);
    float mixSeed = ltStrikeSeedMix(origin, dest, seed);
    int paths = 1 + int(ltHash(mixSeed + 51.0) * 2.0);
    int segs = 28 + int(ltHash(mixSeed + 52.0) * 14.0);
    float spread = (0.26 + ltHash(mixSeed + 53.0) * 0.30) * max(span, 0.08);
    glow = ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, boltBright, paths, segs, spread, true);
  } else if (ltCC(ltType)) {
    vec2 oA = ltAspectPos(origin, aspect);
    vec2 dA = ltAspectPos(dest, aspect);
    float span = max(length(dA - oA), max(origin.y, 0.04) * 0.12);
    float mixSeed = ltStrikeSeedMix(origin, dest, seed);
    int paths = 2 + int(ltHash(mixSeed + 61.0) * 2.0);
    int segs = 30 + int(ltHash(mixSeed + 62.0) * 16.0);
    float spread = (0.30 + ltHash(mixSeed + 63.0) * 0.38) * max(span, 0.08);
    glow = ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, boltBright, paths, segs, spread, true);
  } else if (ltSpider(ltType)) {
    glow = ltEvalSpiderFamilyBolt(p, origin, dest, aspect, seed, prog, boltBright, 3, LT_SPIDER_SEGS, false);
  } else if (ltAnvil(ltType)) {
    glow = ltEvalSpiderFamilyBolt(p, origin, dest, aspect, seed + 17.0, prog, boltBright, 3, LT_SPIDER_SEGS, true);
  } else if (ltBFTB(ltType)) {
    vec2 oA = ltAspectPos(origin, aspect);
    vec2 dA = ltAspectPos(dest, aspect);
    float span = max(length(dA - oA), max(origin.y, 0.04) * 0.14);
    float mixSeed = ltStrikeSeedMix(origin, dest, seed);
    int paths = 1 + int(ltHash(mixSeed + 71.0) * 2.0);
    int segs = 26 + int(ltHash(mixSeed + 72.0) * 12.0);
    float spread = (0.28 + ltHash(mixSeed + 73.0) * 0.34) * max(span, 0.08);
    glow = ltEvalCloudDischargeBolt(p, origin, dest, aspect, seed, prog, boltBright, paths, segs, spread, true);
  } else if (ltIsGroundBolt(ltType)) {
    glow = ltEvalCGBolt(p, origin, dest, aspect, seed, prog, boltBright, isPositive);
  } else if (ltUpward(ltType)) {
    glow = ltEvalCompactBolt(p, origin, dest, aspect, seed + 61.0, prog, boltBright, true);
  } else {
    glow = ltEvalCompactBolt(p, origin, dest, aspect, seed + 59.0, prog, boltBright, false);
  }

  if (glow <= 0.0)
    return vec3(0.0);

  float cgDepth = ltHash(seed + 777.0);
  float cloudOpacity = clamp(1.0 - 1.0 / (1.0 + cloudwater * 13.6), 0.0, 1.0);

  if (behindCloud) {
    float occ = ltBehindCloudBoltOcclusion(uv, cloudwater, origin, dest, ltType, seed);
    glow *= occ;
    visMult *= 0.92;
  } else {
    float cgOcclusion = pow(1.0 - cloudOpacity, cgDepth * 4.5);
    float embed = mix(cloudOpacity * 0.55, smoothstep(dest.y + 0.02, origin.y - 0.01, uv.y) * 0.30, isCG ? 1.0 : 0.0);
    glow *= mix(1.0, cgOcclusion, embed);
  }

  float vis = ltCloudEmbedVis(cloudwater, visMult) * ltBrightness * ltContrast;
  vis /= max(sqrt(float(ltNumStrikes)), 1.0);

  vec3 col = ltGetLightningColor(origin, seed);
  float warmBase = isCG ? max(cloudwater, 0.05) : cloudwater;
  float warmMix = clamp(warmBase * 9.0, 0.0, 0.62) * clamp(prog, 0.25, 1.0);
  col = mix(col, LT_CLOUD_WARM, warmMix);
  return col * glow * vis;
}

float ltFlashEnvelope(float age) {
  float t = ltPhase(age);
  if (ltStrobeFlicker > 0.5) {
    float gate = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.86, 1.0, t));
    float flicker = 0.45 + 0.55 * abs(sin(t * 28.0 + sin(t * 15.0) * 0.35));
    return gate * flicker;
  }
  float rise = smoothstep(0.0, 0.08, t);
  float primary = exp(-t * 4.8) * rise;
  float secondary = exp(-max(t - 0.16, 0.0) * 7.5) * 0.12 * step(0.12, t);
  float envelope = (primary + secondary) * (1.0 - smoothstep(0.82, 1.0, t));
  return clamp(envelope, 0.0, 1.0);
}

// Soft diffuse falloff — pure wide Gaussian, no hard cutoff band
float ltSmoothFlashFalloff(vec2 delta, float radius) {
  float dist2 = dot(delta, delta);
  float r2 = max(radius * radius, 1e-8);
  return exp(-dist2 / (r2 * 3.0))
       + exp(-dist2 / (r2 * 12.0)) * 0.35
       + exp(-dist2 / (r2 * 40.0)) * 0.12;
}

float ltDistToSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
  return length(pa - ba * h);
}

// Smooth 0→1 proximity fade — no hard capsule/circle cutoff
float ltStrikeProxFade(vec2 p, vec2 oA, vec2 dA, float ltType) {
  float d = ltDistToSegment(p, oA, dA);
  float span = max(length(dA - oA), 0.025);
  float reach = 0.09 + span * 0.82;
  if (ltIsGroundBolt(ltType))
    reach += abs(dA.y - oA.y) * 0.32;
  else if (ltSpider(ltType) || ltAnvil(ltType))
    reach += span * 0.45;
  float edge = max(reach * 0.72, 0.04);
  return exp(-pow(max(d, 0.0) / edge, 2.2) * 1.6);
}

// Wide multi-scale Gaussian glow along bolt path
float ltBoltChannelGlow(vec2 p, vec2 oA, vec2 dA, float prop, float cloud) {
  vec2 tip = mix(oA, dA, clamp(prop, 0.0, 1.0));
  float d = min(ltDistToSegment(p, oA, dA), ltDistToSegment(p, oA, tip));
  float d2 = d * d;
  float span = max(length(dA - oA), 0.025);
  float sigma = 0.018 + span * 0.13;
  float s2 = sigma * sigma;
  float glow = exp(-d2 / (s2 * 1.4)) * 0.32
             + exp(-d2 / (s2 * 5.5)) * 0.26
             + exp(-d2 / (s2 * 18.0)) * 0.17
             + exp(-d2 / (s2 * 50.0)) * 0.10
             + exp(-d2 / (s2 * 130.0)) * 0.05;
  float cloudW = smoothstep(0.0, 0.20, cloud);
  return glow * mix(0.50, 1.0, cloudW);
}

bool ltPixelNearStrike(vec2 uv, float aspect, vec2 origin, vec2 dest, float ltType) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 oA = vec2(origin.x * aspect, origin.y);
  vec2 dA = vec2(dest.x * aspect, dest.y);
  return ltStrikeProxFade(p, oA, dA, ltType) > 0.00008;
}

bool ltPixelNearPath(vec2 uv, float aspect, vec2 origin, vec2 dest, float margin) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 oA = vec2(origin.x * aspect, origin.y);
  vec2 dA = vec2(dest.x * aspect, dest.y);
  vec2 bmin = min(oA, dA) - vec2(margin);
  vec2 bmax = max(oA, dA) + vec2(margin);
  return all(greaterThanEqual(p, bmin)) && all(lessThanEqual(p, bmax));
}

float ltCloudBoltCullReach(vec2 origin, vec2 dest) {
  float vertSpan = abs(origin.y - dest.y);
  float horizSpan = abs(origin.x - dest.x);
  float cloudH = max(max(origin.y, dest.y), 0.04);
  return max(length(vec2(horizSpan, vertSpan)) * 0.72, cloudH * 0.38) + 0.14;
}

bool ltPixelNearPrecipShaft(vec2 uv, float aspect, vec2 origin, vec2 dest, float flashSize) {
  vec2 center = mix(origin, dest, 0.5);
  float cloudBase = max(origin.y, dest.y);
  float horizReach = (0.03 + flashSize * 0.16) * 2.8;
  float horiz = abs((uv.x - center.x) * aspect);
  if (horiz > horizReach)
    return false;
  return uv.y >= cloudBase - 0.02 && uv.y <= cloudBase + 0.68;
}

float ltPathGlowPoint(vec2 p, vec2 at, float r) {
  return exp(-dot(p - at, p - at) / (r * r));
}

float ltPolyGlow(vec2 p, vec2 o, vec2 d, float prop, float cloud) {
  float mask = smoothstep(0.02, 0.14, cloud);
  float r = 0.006 + mask * 0.012;
  vec2 tip = mix(o, d, clamp(prop, 0.0, 1.0));
  return ltPathGlowPoint(p, tip, r) * mask;
}

void ltAccumulateBoltsAndIllum(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor,
    out vec3 bolts, out vec3 boltsBehindCloud, out vec3 illum) {
  bolts = vec3(0.0);
  boltsBehindCloud = vec3(0.0);
  illum = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0)
    return;

  float flashPhase = ltPhase(ltEventAge);
  float lightningTime = flashPhase * 1.35;
  bool boltsActive = flashPhase < 0.98;
  bool illumActive = ltEnableAtmos != 0 && flashPhase >= 0.03 && flashPhase < 0.99;
  if (!boltsActive && !illumActive)
    return;

  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float strikeNorm = 1.0 / max(sqrt(float(ltNumStrikes)), 1.0);
  float illumScale = ltChannelIllumRatio * ltCloudIllum * 0.85;
  vec2 p = vec2(uv.x * aspect, uv.y);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    float ltType = ltStrikePos[i].z;
    float metaY = ltStrikeMeta[i].y;
    bool precipOnly = ltPrecipOnly(metaY);
    bool isFlash = ltStrikeIsFlash(ltType, metaY);
    bool behindCloud = ltPrecipOnlyBehind(metaY);

    if (isFlash && !behindCloud)
      continue;

    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    vec2 oA = vec2(origin.x * aspect, origin.y);
    vec2 dA = vec2(dest.x * aspect, dest.y);
    float proxFade = ltStrikeProxFade(p, oA, dA, ltType);
    if (proxFade < 1e-6)
      continue;

    float visMult = ltStrikeMeta[i].z;
    float intensity = ltStrikeDest[i].z;
    float brightMult = ltStrikeMeta[i].w;
    float seed = ltStrikePos[i].w;

    if (boltsActive) {
      vec3 boltCol = ltRenderProceduralStrike(uv, aspect, origin, dest, lightningTime,
        ltType, intensity, visMult, brightMult, cloudwater, seed, behindCloud);

      float prop = ltPropagate(ltEventAge, ltType);
      float pathGlow = ltBoltChannelGlow(p, oA, dA, prop, cloudwater) * proxFade;
      float haloStr = flashPhase * intensity * brightMult * dayNight * strikeNorm * ltGlowStrength;
      vec3 haloCol = mix(LT_GLOW_COL, LT_CLOUD_WARM, clamp(cloudwater * 9.0, 0.0, 0.75));
      vec3 halo = haloCol * pathGlow * haloStr * 0.32;
      if (behindCloud)
        halo *= ltBehindCloudBoltOcclusion(uv, cloudwater, origin, dest, ltType, seed);

      boltCol += halo;
      if (behindCloud)
        boltsBehindCloud += boltCol;
      else
        bolts += boltCol;
    }

    if (illumActive) {
      float prop = ltPropagate(ltEventAge, ltType);
      float pathGlow = ltBoltChannelGlow(p, oA, dA, prop, cloudwater) * proxFade;
      float behindMult = behindCloud
        ? ltBehindCloudBoltOcclusion(uv, cloudwater, origin, dest, ltType, seed) * 0.5
        : 1.0;
      float str = flashPhase * intensity * brightMult * dayNight * strikeNorm * 0.35;
      vec3 warmFlash = mix(LT_GLOW_COL, LT_CLOUD_WARM, clamp(cloudwater * 10.0, 0.0, 0.82));
      float glowMult = ltGlowStrength * (0.55 + flashPhase * 0.45);
      illum += warmFlash * pathGlow * str * illumScale * glowMult * behindMult * 0.04;
    }
  }
  illum = min(illum * 0.0032, vec3(0.09));
  illum = illum / (vec3(1.0) + illum * 6.5);
}

vec3 ltRenderStrikeBolts(vec2 uv, float aspect, float cloudwater) {
  vec3 bolts;
  vec3 unusedBehind;
  vec3 unusedIllum;
  ltAccumulateBoltsAndIllum(uv, aspect, cloudwater, 0.0, 0.0, bolts, unusedBehind, unusedIllum);
  return bolts;
}

// Volumetric rain-shaft illumination (reference: lit precipitation columns, cloud-base rim)
void ltPrecipShaftLight(vec2 uv, float aspect, vec2 origin, vec2 dest, float flashSize,
    float flashPhase, float intensity, float precip, float seed,
    out float shaftLight, out float cloudRimLight) {
  shaftLight = 0.0;
  cloudRimLight = 0.0;
  if (precip < 0.012 || flashPhase < 0.01)
    return;

  vec2 center = mix(origin, dest, 0.5);
  float cloudBase = max(origin.y, dest.y);
  float shaftSpan = 0.18 + flashSize * 0.52 + ltHash(seed + 19.0) * 0.22;
  float totalShaft = 0.0;

  for (int si = 0; si < 3; si++) {
    float sf = float(si);
    float shaftSeed = seed + sf * 47.3;
    float xOff = (ltHash(shaftSeed) - 0.5) * (0.028 + flashSize * 0.10);
    float horiz = abs((uv.x - center.x - xOff) * aspect);
    float horizRad = 0.010 + flashSize * 0.048 + ltHash(shaftSeed + 1.0) * 0.022;
    float horizFall = exp(-(horiz * horiz) / (horizRad * horizRad * 1.35));
    float coreBeam = horizFall * 0.38;

    float belowBase = smoothstep(cloudBase - 0.014, cloudBase + 0.028, uv.y);
    float shaftBot = cloudBase + shaftSpan * (0.55 + ltHash(shaftSeed + 3.0) * 0.45);
    float vertMask = belowBase * (1.0 - smoothstep(cloudBase + 0.04, shaftBot, uv.y));

    float streak = 0.22 + 0.78 * random2d(vec2(uv.x * 195.0 + seed * 0.01 + sf * 11.0, floor(uv.y * 310.0)));
    float patchMix = 0.42 + 0.58 * random2d(vec2(center.x * 110.0 + shaftSeed, uv.y * 42.0));
    totalShaft += (horizFall * streak + coreBeam * 0.55) * vertMask * patchMix;
  }
  totalShaft /= 3.0;

  float rimBand = smoothstep(cloudBase - 0.07, cloudBase - 0.01, uv.y)
    * (1.0 - smoothstep(cloudBase + 0.01, cloudBase + 0.09, uv.y));
  float rimHoriz = exp(-pow((uv.x - center.x) * aspect / (0.042 + flashSize * 0.13), 2.0));
  cloudRimLight = rimBand * rimHoriz * precip * 0.72;

  float envelope = flashPhase * intensity * ltRainIllum * precip;
  shaftLight = totalShaft * envelope;
  cloudRimLight *= flashPhase * intensity * ltRainIllum;
}

float ltPrecipCurtain(vec2 uv, float aspect, vec2 origin, vec2 dest, float flashSize,
    float flashPhase, float intensity, float precip, float seed) {
  float shaft;
  float rim;
  ltPrecipShaftLight(uv, aspect, origin, dest, flashSize, flashPhase, intensity, precip, seed, shaft, rim);
  return shaft + rim * 0.55;
}

// Diffuse intracloud/sheet flash — cloud & surface lighting only (no emissive disk)
void ltApplyDiffuseFlash(vec2 uv, float aspect, vec2 center, float radius,
    float flashPhase, float intensity, float dayNight, float scale,
    float cloudwater, float precip, bool inFront, vec3 flashCol,
    out vec3 cloudLight, out vec3 surfaceLight) {
  cloudLight = vec3(0.0);
  surfaceLight = vec3(0.0);
  vec2 delta = vec2((uv.x - center.x) * aspect, uv.y - center.y);
  float falloff = ltSmoothFlashFalloff(delta, radius);
  if (falloff < 0.001)
    return;

  float cloudMask = smoothstep(0.04, 0.28, cloudwater);
  float precipMask = smoothstep(0.03, 0.20, precip);
  float flash = flashPhase * intensity * dayNight * falloff * scale * 0.36;
  float dist2 = dot(delta, delta);
  float radius2 = radius * radius;
  float coreMix = 1.0 - smoothstep(radius2 * 0.08, radius2 * 1.8, dist2);
  vec3 col = mix(flashCol, LT_CORE_COL, coreMix * 0.52) * flash;

  if (inFront) {
    cloudLight += col * cloudMask * 0.016;
    surfaceLight += col * (0.012 + precipMask * 0.008);
  } else {
    surfaceLight += col * (0.014 + precipMask * 0.010);
    cloudLight += col * cloudMask * 0.014;
  }
}

void ltAccumulateFlashes(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor,
    out vec3 flashEmitted, out vec3 flashCloudLight, out vec3 flashSurfaceLight, out vec3 precipBoltShafts) {
  flashEmitted = vec3(0.0);
  flashCloudLight = vec3(0.0);
  flashSurfaceLight = vec3(0.0);
  precipBoltShafts = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0)
    return;

  float flashPhase = ltFlashEnvelope(ltEventAge);
  if (flashPhase < 0.01)
    return;

  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float cloudMask = smoothstep(0.06, 0.32, cloudwater);
  float precipMask = smoothstep(0.04, 0.22, precip);
  float scale = ltBrightness * ltContrast / max(sqrt(float(ltNumStrikes)), 1.0);
  bool rainShaftsActive = ltEnableRainIllum != 0;

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    float ltType = ltStrikePos[i].z;
    float metaY = ltStrikeMeta[i].y;
    bool precipOnly = ltPrecipOnly(metaY);
    bool isFlash = ltStrikeIsFlash(ltType, metaY);

    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    float flashSize = max(ltStrikeMeta[i].x, isFlash ? 0.15 : 0.12);
    if (ltSheet(ltType))
      flashSize *= 1.35;

    float intensity = ltStrikeDest[i].z * ltStrikeMeta[i].w;
    float seed = ltStrikePos[i].w;
    vec3 flashCol = ltGetLightningColor(origin, seed);
    bool inFront = ltFlashInFront(metaY);

    // --- Precip-shaft-only mode (hidden or sheet flash — lit rain columns) ---
    if (precipOnly) {
      if (!rainShaftsActive)
        continue;
      if (!ltPixelNearPrecipShaft(uv, aspect, origin, dest, flashSize))
        continue;

      float shaftStr = intensity * dayNight * scale;
      if (isFlash)
        shaftStr *= 1.45;
      else if (ltIsGroundBolt(ltType))
        shaftStr *= 1.25;

      float shaft;
      float cloudRim;
      ltPrecipShaftLight(uv, aspect, origin, dest, flashSize, flashPhase,
        shaftStr, precip, seed, shaft, cloudRim);

      vec3 shaftCol = mix(LT_SHEET_COL, flashCol, isFlash ? 0.35 : 0.18);
      precipBoltShafts += shaftCol * shaft * 0.42;
      flashSurfaceLight += shaftCol * shaft * 0.14;
      flashCloudLight += mix(LT_CLOUD_WARM, flashCol, 0.4) * cloudRim * cloudMask * 0.028;
      continue;
    }

    if (isFlash) {
      vec2 center = mix(origin, dest, 0.5);
      float radius = 0.062 + flashSize * 0.19;
      vec3 diffuseCloud;
      vec3 diffuseSurf;
      ltApplyDiffuseFlash(uv, aspect, center, radius, flashPhase,
        intensity, dayNight, scale, cloudwater, precip, inFront, flashCol,
        diffuseCloud, diffuseSurf);
      flashCloudLight += diffuseCloud;
      flashSurfaceLight += diffuseSurf;
    } else {
      continue;
    }

    // Rain shafts also pick up spill light during area-flash strikes
    if (rainShaftsActive && precipMask > 0.02) {
      float spill = ltPrecipCurtain(uv, aspect, origin, dest, flashSize, flashPhase * 0.72,
        intensity * dayNight * scale * 0.85, precip, seed);
      flashSurfaceLight += flashCol * spill * 0.10;
      precipBoltShafts += LT_SHEET_COL * spill * 0.08;
    }
  }
}

void ltGetICCCFlash(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor,
    out vec3 flashEmitted, out vec3 flashCloudLight, out vec3 flashSurfaceLight) {
  vec3 unusedShafts;
  ltAccumulateFlashes(uv, aspect, cloudwater, precip, nightFactor,
    flashEmitted, flashCloudLight, flashSurfaceLight, unusedShafts);
}

void ltGetPrecipBoltShafts(vec2 uv, float aspect, float precip, float nightFactor,
    out vec3 flashSurfaceLight) {
  vec3 unusedEmit;
  vec3 unusedCloud;
  vec3 unusedSurf;
  ltAccumulateFlashes(uv, aspect, 0.0, precip, nightFactor,
    unusedEmit, unusedCloud, unusedSurf, flashSurfaceLight);
}

vec3 ltComputeStrikeIllumination(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor) {
  vec3 unusedBolts;
  vec3 unusedBehind;
  vec3 illum;
  ltAccumulateBoltsAndIllum(uv, aspect, cloudwater, precip, nightFactor, unusedBolts, unusedBehind, illum);
  return illum;
}
