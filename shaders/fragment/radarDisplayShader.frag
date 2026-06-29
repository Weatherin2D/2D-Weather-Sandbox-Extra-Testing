#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

const float dryLapse = 0.;
#include "common.glsl"

uniform vec3 view;
uniform vec4 cursor;
uniform vec2 aspectRatios;
uniform float Xmult;

uniform sampler2D baseTexture;
uniform sampler2D waterTexture;
uniform isampler2D wallTexture;
uniform sampler2D colorScalesTex;
uniform sampler2D precipFeedbackTexture;
uniform sampler2D precipDepositionTexture;
uniform sampler2D radarAccumTexture;

uniform vec2  radarPos;
uniform float radarRange;
uniform int   productType;
uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;
uniform float radarResolution;
uniform float sensitivity;
uniform bool  dbzOpacityEnabled;
uniform float dbzOpacityStrength;
uniform float cappiHeightFrac;
uniform int   useAccumTexture;
uniform int   accumChannel;

out vec4 fragmentColor;

const int PRODUCT_Z     = 0;
const int PRODUCT_V     = 1;
const int PRODUCT_CC    = 2;
const int PRODUCT_ET    = 3;
const int PRODUCT_SRV   = 4;
const int PRODUCT_ZDR   = 5;
const int PRODUCT_KDP   = 6;
const int PRODUCT_HCA   = 7;
const int PRODUCT_HAIL  = 8;
const int PRODUCT_TDS   = 9;
const int PRODUCT_MESO  = 10;
const int PRODUCT_QPE   = 11;
const int PRODUCT_VIL   = 12;
const int PRODUCT_CAPPI = 13;
const int PRODUCT_WSPD  = 14;
const int PRODUCT_ACCUM = 15;

vec3 sampleColorScaleStepped(float t)
{
  int idx = clamp(int(t * float(colorScaleStops - 1) + 0.5), 0, colorScaleStops - 1);
  return texelFetch(colorScalesTex, ivec2(colorScaleColumn, idx), 0).rgb;
}

float mixedPhaseBonus(float iceFrac)
{
  return 1.0 - abs(iceFrac - 0.5) * 2.0;
}

// NWS-style rhoHV: rain/snow cores near 1.0 (maroon), melting/hail/debris lower
float computeCorrelation(float gridPrecip, float dust, float massScore, float iceFrac, float particleSize, float smoke, vec2 cellPos)
{
  float precip = gridPrecip + dust;
  if (precip < 0.00008)
    return 1.0;

  float cc = 0.995;

  // Stratiform rain and small warm-rain drops — high CC (red/maroon on scale)
  if (particleSize < 0.45 && iceFrac < 0.4)
    return clamp(0.97 - particleSize * 0.06 - iceFrac * 0.04, 0.93, 1.0);

  // Dry snow crystals aloft
  if (iceFrac > 0.72 && particleSize < 0.55)
    return clamp(0.96 - particleSize * 0.1, 0.9, 1.0);

  // Melting layer / mixed-phase (bright-band analog)
  float melting = mixedPhaseBonus(iceFrac) * smoothstep(0.22, 0.62, particleSize);
  cc -= clamp(melting, 0.0, 1.0) * 0.2;

  // Hail / graupel
  float hailSig = smoothstep(0.48, 0.88, particleSize) * smoothstep(0.38, 0.92, iceFrac);
  cc -= hailSig * 0.32;

  // Oversized warm-rain drops
  if (iceFrac < 0.22 && particleSize > 0.62)
    cc -= (particleSize - 0.55) * 0.22;

  // Dust and non-meteorological scatterers (speckled low-CC like debris signatures)
  float contam = dust / max(precip, 1e-6);
  cc -= clamp(contam * 0.55, 0.0, 0.45);
  if (smoke > 0.05 && precip > 0.0008) {
    float debrisNoise = fract(sin(dot(floor(cellPos * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
    cc -= 0.18 + debrisNoise * 0.28;
  }

  cc -= (1.0 - clamp(precip * 450.0, 0.0, 1.0)) * 0.05;
  return clamp(cc, 0.25, 1.0);
}

vec2 snapGate(vec2 cellPos, vec2 rPos, float rRange, float rRes, out float gateAngle, out float gateDistFrac)
{
  vec2  delta = cellPos - rPos;
  float dist  = length(delta);
  gateAngle   = atan(delta.y, delta.x);
  gateDistFrac = dist / rRange;

  float resMult   = 1.0 / max(rRes, 0.1);
  float rangeStep = max(0.01, gateDistFrac * gateDistFrac * 3.0 * resMult * (rRange / 400.0));
  float azStep    = max(0.001, 0.03 * resMult * (rRange / 400.0));

  float snappedDist  = (floor(dist  / rangeStep + 0.5)) * rangeStep;
  float snappedAngle = (floor(gateAngle / azStep + 0.5)) * azStep;

  vec2 snappedCell = rPos + vec2(cos(snappedAngle), sin(snappedAngle)) * snappedDist;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  return snappedCell;
}

vec2 cellToTC(vec2 cell)
{
  return clamp(cell * texelSize, texelSize * 0.5, vec2(1.0) - texelSize * 0.5);
}

float computeDBZ(float reflectiveMass)
{
  float dBZ = 45.0 + 10.0 * log(max(reflectiveMass * 30.0, 1e-9)) / log(10.0);
  return clamp(dBZ, 0.0, 85.0);
}

struct GateSample {
  vec4 water;
  vec4 base;
  vec4 precipFeedback;
  vec2 precipDep;
  float reflectiveMass;
  float dBZ;
  float particleSize;
  float iceFrac;
  float cc;
  float zdr;
  bool  valid;
};

GateSample sampleGateAt(vec2 snappedCell)
{
  GateSample g;
  vec2 tc = cellToTC(snappedCell);
  ivec4 wallData = texture(wallTexture, tc);
  g.valid = wallData[1] != 0;
  if (!g.valid) return g;

  g.water = texture(waterTexture, tc);
  g.base = texture(baseTexture, tc);
  g.precipFeedback = texture(precipFeedbackTexture, tc);
  g.precipDep = texture(precipDepositionTexture, tc).xy;

  float gridPrecip = g.water[PRECIPITATION];
  float dust = g.water[SMOKE] * 0.15;
  g.reflectiveMass = (gridPrecip + dust) * sensitivity;
  g.dBZ = computeDBZ(g.reflectiveMass);

  float massScore = g.precipFeedback[MASS];
  g.particleSize = clamp(pow(max(massScore, 0.0), 0.6) * 0.8, 0.0, 1.0);

  float rainDep = g.precipDep.x;
  float snowDep = g.precipDep.y;
  float totalDep = rainDep + snowDep;
  g.iceFrac = (totalDep > 0.0001) ? (snowDep / totalDep) : 0.0;
  if (totalDep < 0.0001) {
    float heightFactor = snappedCell.y / resolution.y;
    g.iceFrac = smoothstep(0.4, 0.9, heightFactor) * clamp(g.water[PRECIPITATION] * 8.0, 0.0, 1.0);
  }

  g.cc = computeCorrelation(gridPrecip, dust, massScore, g.iceFrac, g.particleSize, g.water[SMOKE], snappedCell);

  g.zdr = (g.particleSize * (1.0 - g.iceFrac) * 4.0) - (g.particleSize * g.iceFrac * 1.5);
  g.zdr = clamp(g.zdr, -1.0, 5.0);

  return g;
}

float radialVelocityAt(vec2 snappedCell, float angle, GateSample g)
{
  vec2 radialDir = vec2(cos(angle), sin(angle));
  return dot(g.base.xy, radialDir);
}

float columnEchoTop(vec2 snappedTC, float threshold)
{
  float echoTopFrac = 0.0;
  for (int step = 0; step < 300; step++) {
    float yFrac = float(step) / 300.0;
    vec2 sampleTC = vec2(snappedTC.x, yFrac);
    ivec4 wData = texture(wallTexture, sampleTC);
    if (wData[1] == 0) continue;
    vec4 wSample = texture(waterTexture, sampleTC);
    float reflectiveMass = wSample[PRECIPITATION] + wSample[SMOKE] * 0.15;
    if (reflectiveMass > threshold) echoTopFrac = yFrac;
  }
  return echoTopFrac;
}

float columnVIL(vec2 snappedTC)
{
  float vil = 0.0;
  int stepCount = int(min(resolution.y, 128.0));
  for (int step = 0; step < 128; step++) {
    if (step >= stepCount) break;
    float yFrac = float(step) / float(max(stepCount - 1, 1));
    vec2 sampleTC = vec2(snappedTC.x, yFrac);
    ivec4 wData = texture(wallTexture, sampleTC);
    if (wData[1] == 0) continue;
    vec4 wSample = texture(waterTexture, sampleTC);
    vil += wSample[PRECIPITATION] * sensitivity;
  }
  return vil;
}

float azimuthalShear(vec2 rPos, float rRange, float rRes, float dist, float angle, float azStep)
{
  float resMult = 1.0 / max(rRes, 0.1);
  float distFrac = dist / rRange;
  float rangeStep = max(0.01, distFrac * distFrac * 3.0 * resMult * (rRange / 400.0));
  float snappedDist = (floor(dist / rangeStep + 0.5)) * rangeStep;

  vec2 cellA = rPos + vec2(cos(angle + azStep), sin(angle + azStep)) * snappedDist;
  vec2 cellB = rPos + vec2(cos(angle - azStep), sin(angle - azStep)) * snappedDist;
  cellA.x = mod(cellA.x, resolution.x);
  cellB.x = mod(cellB.x, resolution.x);

  GateSample gA = sampleGateAt(cellA);
  GateSample gB = sampleGateAt(cellB);
  if (!gA.valid || !gB.valid) return 0.0;

  float vA = radialVelocityAt(cellA, angle + azStep, gA);
  float vB = radialVelocityAt(cellB, angle - azStep, gB);
  return abs(vA - vB);
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  vec2  delta = cellPos - radarPos;
  float dist  = length(delta);
  float angle = atan(delta.y, delta.x);

  if (dist > radarRange || dist < 0.5) discard;

  float distFrac = dist / radarRange;
  float resMult   = 1.0 / max(radarResolution, 0.1);
  float azStep    = max(0.001, 0.03 * resMult * (radarRange / 400.0));

  float gateAngle;
  float gateDistFrac;
  vec2 snappedCell = snapGate(cellPos, radarPos, radarRange, radarResolution, gateAngle, gateDistFrac);
  vec2 snappedTC   = cellToTC(snappedCell);

  ivec4 wallData = texture(wallTexture, snappedTC);
  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
    } else {
      discard;
    }
    return;
  }

  vec2 stormMotion = texture(baseTexture, cellToTC(radarPos)).xy;
  vec3  color = vec3(0.0);
  float pixelOpacity = opacity;

  if (productType == PRODUCT_ET) {
    float echoTopFrac = columnEchoTop(snappedTC, 0.0005);
    if (echoTopFrac < 0.001) discard;
    float t = clamp(echoTopFrac, 0.0, 1.0);
    color = sampleColorScaleStepped(smoothstep(0.0, 1.0, t));
    pixelOpacity *= smoothstep(0.01, 0.05, echoTopFrac);

  } else if (productType == PRODUCT_VIL) {
    float vil = columnVIL(snappedTC);
    if (vil < 0.002) discard;
    float t = clamp(vil * 8.0, 0.0, 1.0);
    color = sampleColorScaleStepped(t);
    pixelOpacity *= smoothstep(0.002, 0.02, vil);

  } else if (productType == PRODUCT_CAPPI) {
    float yCell = clamp(cappiHeightFrac, 0.02, 0.98) * resolution.y;
    vec2 cappiCell = vec2(snappedCell.x, yCell);
    GateSample g = sampleGateAt(cappiCell);
    if (!g.valid || g.dBZ < 1.0) discard;
    if (g.dBZ < 5.0) {
      color = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, g.dBZ);
    } else {
      float t = smoothstep(0.0, 1.0, g.dBZ / 85.0);
      color = sampleColorScaleStepped(t);
    }

  } else if (productType == PRODUCT_ACCUM && useAccumTexture != 0) {
    vec4 accumSample = texture(radarAccumTexture, snappedTC);
    float mm = (accumChannel == 0) ? accumSample.r : ((accumChannel == 1) ? accumSample.g : accumSample.b);
    if (mm < 0.05) discard;
    float t = clamp(mm / 75.0, 0.0, 1.0);
    color = sampleColorScaleStepped(t);
    pixelOpacity *= smoothstep(0.05, 2.0, mm);

  } else {
    GateSample g = sampleGateAt(snappedCell);
    if (!g.valid) discard;

    if (productType == PRODUCT_Z) {
      if (g.dBZ < 1.0) discard;
      if (g.dBZ < 5.0) {
        color = vec3(0.45, 0.82, 1.0);
        pixelOpacity *= smoothstep(1.0, 5.0, g.dBZ);
      } else {
        float t = smoothstep(0.0, 1.0, g.dBZ / 85.0);
        color = sampleColorScaleStepped(t);
        if (g.dBZ < 25.0)
          color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, g.dBZ));
      }
      if (dbzOpacityEnabled) {
        float dbzOpacityFactor = smoothstep(0.0, 50.0, g.dBZ);
        dbzOpacityFactor = mix(1.0, dbzOpacityFactor, dbzOpacityStrength);
        pixelOpacity *= dbzOpacityFactor;
      }

    } else if (productType == PRODUCT_V || productType == PRODUCT_SRV) {
      float radialVel = radialVelocityAt(snappedCell, angle, g);
      if (productType == PRODUCT_SRV)
        radialVel -= dot(stormMotion, vec2(cos(angle), sin(angle)));

      float maxRaw = 0.15;
      if (g.reflectiveMass < 0.0001 && abs(radialVel) < maxRaw * 0.05) discard;
      float t = clamp((radialVel / maxRaw + 1.0) * 0.5, 0.0, 1.0);
      color = sampleColorScaleStepped(smoothstep(0.0, 1.0, t));
      float airOpacity = clamp(abs(radialVel) / (maxRaw * 0.3), 0.0, 1.0) * 0.45;
      pixelOpacity *= (g.reflectiveMass > 0.0001) ? min(g.reflectiveMass * 300.0, 1.0) : airOpacity;

    } else if (productType == PRODUCT_WSPD) {
      float wspd = length(g.base.xy);
      float maxRaw = 0.15;
      if (g.reflectiveMass < 0.0001 && wspd < maxRaw * 0.03) discard;
      float t = clamp(wspd / maxRaw, 0.0, 1.0);
      color = sampleColorScaleStepped(t);
      pixelOpacity *= (g.reflectiveMass > 0.0001) ? min(g.reflectiveMass * 300.0, 1.0) : clamp(wspd / (maxRaw * 0.25), 0.2, 1.0);

    } else if (productType == PRODUCT_CC) {
      if (g.reflectiveMass < 0.0001) discard;
      float t = clamp((g.cc - 0.2) / 0.8, 0.0, 1.0);
      float tStep = floor(t * float(colorScaleStops - 1) + 0.5) / float(colorScaleStops - 1);
      color = sampleColorScaleStepped(tStep);
      pixelOpacity *= min(g.reflectiveMass * 300.0, 1.0);

    } else if (productType == PRODUCT_ZDR) {
      if (g.reflectiveMass < 0.0001) discard;
      float t = (g.zdr + 1.0) / 6.0;
      color = sampleColorScaleStepped(clamp(t, 0.0, 1.0));
      pixelOpacity *= min(g.reflectiveMass * 300.0, 1.0);

    } else if (productType == PRODUCT_KDP) {
      if (g.reflectiveMass < 0.0001) discard;
      float kdp = g.reflectiveMass * g.particleSize * (1.0 - g.iceFrac) * 120.0;
      float t = clamp(kdp / 8.0, 0.0, 1.0);
      color = sampleColorScaleStepped(t);
      pixelOpacity *= min(g.reflectiveMass * 300.0, 1.0);

    } else if (productType == PRODUCT_HCA) {
      if (g.reflectiveMass < 0.00005 && g.water[SMOKE] < 0.01) discard;
      float hcaClass = 0.0;
      if (g.water[SMOKE] > 0.08 && g.reflectiveMass < 0.0003)
        hcaClass = 5.0;
      else if (g.cc < 0.72 && g.dBZ > 45.0)
        hcaClass = 6.0;
      else if (g.particleSize > 0.65 && g.iceFrac > 0.35)
        hcaClass = 4.0;
      else if (g.iceFrac > 0.75 && g.particleSize < 0.45)
        hcaClass = 2.0;
      else if (g.iceFrac > 0.45 && g.particleSize > 0.35)
        hcaClass = 3.0;
      else if (g.iceFrac > 0.55)
        hcaClass = 2.0;
      else if (g.reflectiveMass > 0.0001)
        hcaClass = 1.0;
      float t = hcaClass / 6.0;
      color = sampleColorScaleStepped(t);
      pixelOpacity *= max(min(g.reflectiveMass * 400.0, 1.0), min(g.water[SMOKE] * 2.0, 0.6));

    } else if (productType == PRODUCT_HAIL) {
      if (g.reflectiveMass < 0.0001) discard;
      float hailScore = 0.0;
      hailScore += smoothstep(50.0, 70.0, g.dBZ) * 0.45;
      hailScore += g.particleSize * 0.35;
      hailScore += mixedPhaseBonus(g.iceFrac) * 0.25;
      hailScore += (1.0 - g.cc) * 0.2;
      hailScore = clamp(hailScore, 0.0, 1.0);
      if (hailScore < 0.15) discard;
      color = sampleColorScaleStepped(hailScore);
      pixelOpacity *= min(g.reflectiveMass * 300.0, 1.0);

    } else if (productType == PRODUCT_TDS) {
      float shear = azimuthalShear(radarPos, radarRange, radarResolution, dist, angle, azStep * 2.5);
      float tdsScore = 0.0;
      tdsScore += smoothstep(45.0, 60.0, g.dBZ) * 0.35;
      tdsScore += smoothstep(0.2, 0.65, 1.0 - g.cc) * 0.35;
      tdsScore += clamp(shear / 0.08, 0.0, 1.0) * 0.35;
      tdsScore = clamp(tdsScore, 0.0, 1.0);
      if (tdsScore < 0.25) discard;
      color = sampleColorScaleStepped(tdsScore);
      pixelOpacity *= tdsScore;

    } else if (productType == PRODUCT_MESO) {
      float shear = azimuthalShear(radarPos, radarRange, radarResolution, dist, angle, azStep * 2.0);
      if (g.reflectiveMass < 0.00005 && shear < 0.02) discard;
      float mesoScore = clamp(shear / 0.12, 0.0, 1.0);
      mesoScore *= smoothstep(0.0001, 0.001, g.reflectiveMass + 0.0005);
      if (mesoScore < 0.12) discard;
      color = sampleColorScaleStepped(mesoScore);
      pixelOpacity *= mesoScore;

    } else if (productType == PRODUCT_QPE) {
      if (g.dBZ < 5.0) discard;
      float zLinear = pow(10.0, g.dBZ / 10.0);
      float rateMmHr = pow(zLinear / 200.0, 1.0 / 1.6);
      float t = clamp(rateMmHr / 100.0, 0.0, 1.0);
      color = sampleColorScaleStepped(t);
      pixelOpacity *= smoothstep(5.0, 15.0, g.dBZ);

    } else {
      discard;
    }
  }

  fragmentColor = vec4(color, pixelOpacity);
}
