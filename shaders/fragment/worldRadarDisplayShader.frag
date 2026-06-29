#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

const float dryLapse = 0.;

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

uniform vec3 view;
uniform vec4 cursor;

uniform sampler2D baseTexture;
uniform sampler2D waterTexture;
uniform isampler2D wallTexture;
uniform sampler2D colorScalesTex;
uniform sampler2D precipFeedbackTexture;
uniform sampler2D precipDepositionTexture;
uniform sampler2D radarAccumTexture;

uniform float blockSize;
uniform float sensitivity;
uniform bool  dbzOpacityEnabled;
uniform float dbzOpacityStrength;
uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;
uniform int   productType;
uniform float cappiHeightFrac;
uniform int   useAccumTexture;
uniform int   accumChannel;

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

float computeDBZ(float reflectiveMass)
{
  float dBZ = 45.0 + 10.0 * log(max(reflectiveMass * 30.0, 1e-9)) / log(10.0);
  return clamp(dBZ, 0.0, 85.0);
}

float mixedPhaseBonus(float iceFrac)
{
  return 1.0 - abs(iceFrac - 0.5) * 2.0;
}

float computeCorrelation(float gridPrecip, float dust, float massScore, float iceFrac, float particleSize, float smoke, vec2 cellPos)
{
  float precip = gridPrecip + dust;
  if (precip < 0.00008)
    return 1.0;

  float cc = 0.995;
  if (particleSize < 0.45 && iceFrac < 0.4)
    return clamp(0.97 - particleSize * 0.06 - iceFrac * 0.04, 0.93, 1.0);
  if (iceFrac > 0.72 && particleSize < 0.55)
    return clamp(0.96 - particleSize * 0.1, 0.9, 1.0);

  float melting = mixedPhaseBonus(iceFrac) * smoothstep(0.22, 0.62, particleSize);
  cc -= clamp(melting, 0.0, 1.0) * 0.2;
  float hailSig = smoothstep(0.48, 0.88, particleSize) * smoothstep(0.38, 0.92, iceFrac);
  cc -= hailSig * 0.32;
  if (iceFrac < 0.22 && particleSize > 0.62)
    cc -= (particleSize - 0.55) * 0.22;

  float contam = dust / max(precip, 1e-6);
  cc -= clamp(contam * 0.55, 0.0, 0.45);
  if (smoke > 0.05 && precip > 0.0008) {
    float debrisNoise = fract(sin(dot(floor(cellPos * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
    cc -= 0.18 + debrisNoise * 0.28;
  }
  cc -= (1.0 - clamp(precip * 450.0, 0.0, 1.0)) * 0.05;
  return clamp(cc, 0.25, 1.0);
}

struct ColumnStats {
  float maxMass;
  float maxDBZ;
  float echoTop;
  float vil;
  float ccAtMax;
  float zdrAtMax;
  float iceAtMax;
  float sizeAtMax;
  float smokeMax;
  vec2  windAtMax;
  float minCC;
  float maxShear;
};

ColumnStats scanColumn(vec2 snappedTC, int stepCount)
{
  ColumnStats s;
  s.maxMass = 0.0;
  s.maxDBZ = 0.0;
  s.echoTop = 0.0;
  s.vil = 0.0;
  s.ccAtMax = 1.0;
  s.zdrAtMax = 0.0;
  s.iceAtMax = 0.0;
  s.sizeAtMax = 0.0;
  s.smokeMax = 0.0;
  s.windAtMax = vec2(0.0);
  s.minCC = 1.0;
  s.maxShear = 0.0;

  for (int step = 0; step < 64; step++) {
    if (step >= stepCount) break;
    float yFrac = float(step) / float(max(stepCount - 1, 1));
    vec2 sampleTC = vec2(snappedTC.x, yFrac);
    ivec4 wData = texture(wallTexture, sampleTC);
    if (wData[1] == 0) continue;

    vec4 wSample = texture(waterTexture, sampleTC);
    vec4 base = texture(baseTexture, sampleTC);
    vec4 pfb = texture(precipFeedbackTexture, sampleTC);
    vec2 pdep = texture(precipDepositionTexture, sampleTC).xy;

    float gridPrecip = wSample[PRECIPITATION];
    float dust = wSample[SMOKE] * 0.15;
    float mass = (gridPrecip + dust) * sensitivity;
    s.vil += gridPrecip * sensitivity;

    float massScore = pfb[MASS];
    float particleSize = clamp(pow(max(massScore, 0.0), 0.6) * 0.8, 0.0, 1.0);
    float rainDep = pdep.x;
    float snowDep = pdep.y;
    float totalDep = rainDep + snowDep;
    float iceFrac = (totalDep > 0.0001) ? (snowDep / totalDep) : smoothstep(0.4, 0.9, yFrac) * clamp(gridPrecip * 8.0, 0.0, 1.0);
    vec2 cellPos = vec2(snappedTC.x * resolution.x, yFrac * resolution.y);
    float cc = computeCorrelation(gridPrecip, dust, massScore, iceFrac, particleSize, wSample[SMOKE], cellPos);
    s.minCC = min(s.minCC, cc);

    if (gridPrecip + dust > 0.0003)
      s.echoTop = yFrac;

    if (mass > s.maxMass) {
      s.maxMass = mass;
      s.maxDBZ = computeDBZ(mass);
      s.ccAtMax = cc;
      s.sizeAtMax = particleSize;
      s.iceAtMax = iceFrac;
      s.zdrAtMax = clamp(particleSize * (1.0 - iceFrac) * 4.0 - particleSize * iceFrac * 1.5, -1.0, 5.0);
      s.windAtMax = base.xy;
      s.smokeMax = wSample[SMOKE];
    }
  }

  float dx = texelSize.x * blockSize * 2.0;
  vec2 tcL = clamp(vec2(snappedTC.x - dx, snappedTC.y * 0.5 + 0.25), texelSize * 0.5, vec2(1.0) - texelSize * 0.5);
  vec2 tcR = clamp(vec2(snappedTC.x + dx, snappedTC.y * 0.5 + 0.25), texelSize * 0.5, vec2(1.0) - texelSize * 0.5);
  float uL = texture(baseTexture, tcL).x;
  float uR = texture(baseTexture, tcR).x;
  s.maxShear = abs(uR - uL);

  return s;
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  vec2 snappedCell = floor(cellPos / blockSize + 0.5) * blockSize;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize, texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);
  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
      drawCursor(cursor, view);
      return;
    }
    discard;
  }

  int stepCount = int(ceil(resolution.y / blockSize));
  stepCount = clamp(stepCount, 4, 64);

  vec3  color = vec3(0.0);
  float pixelOpacity = opacity;

  if (productType == PRODUCT_ACCUM && useAccumTexture != 0) {
    vec4 accumSample = texture(radarAccumTexture, snappedTC);
    float mm = (accumChannel == 0) ? accumSample.r : ((accumChannel == 1) ? accumSample.g : accumSample.b);
    if (mm < 0.05)
      discard;
    float t = clamp(mm / 75.0, 0.0, 1.0);
    color = sampleColorScaleStepped(t);
    pixelOpacity *= smoothstep(0.05, 2.0, mm);
  } else if (productType == PRODUCT_CAPPI) {
    float yFrac = clamp(cappiHeightFrac, 0.02, 0.98);
    vec2 cappiTC = vec2(snappedTC.x, yFrac);
    ivec4 wC = texture(wallTexture, cappiTC);
    if (wC[1] == 0)
      discard;
    vec4 wS = texture(waterTexture, cappiTC);
    float mass = (wS[PRECIPITATION] + wS[SMOKE] * 0.15) * sensitivity;
    float dBZ = computeDBZ(mass);
    if (dBZ < 1.0)
      discard;
    if (dBZ < 5.0) {
      color = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
    } else {
      color = sampleColorScaleStepped(smoothstep(0.0, 1.0, dBZ / 85.0));
    }
  } else {
    ColumnStats col = scanColumn(snappedTC, stepCount);

    if (productType == PRODUCT_ET) {
      if (col.echoTop < 0.001)
        discard;
      color = sampleColorScaleStepped(clamp(col.echoTop, 0.0, 1.0));
      pixelOpacity *= smoothstep(0.01, 0.05, col.echoTop);
    } else if (productType == PRODUCT_VIL) {
      if (col.vil < 0.002)
        discard;
      color = sampleColorScaleStepped(clamp(col.vil * 8.0, 0.0, 1.0));
      pixelOpacity *= smoothstep(0.002, 0.02, col.vil);
    } else if (productType == PRODUCT_Z) {
      if (col.maxDBZ < 1.0)
        discard;
      if (col.maxDBZ < 5.0) {
        color = vec3(0.45, 0.82, 1.0);
        pixelOpacity *= smoothstep(1.0, 5.0, col.maxDBZ);
      } else {
        float t = smoothstep(0.0, 1.0, col.maxDBZ / 85.0);
        color = sampleColorScaleStepped(t);
        if (col.maxDBZ < 25.0)
          color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, col.maxDBZ));
      }
      if (dbzOpacityEnabled) {
        float f = smoothstep(0.0, 50.0, col.maxDBZ);
        pixelOpacity *= mix(1.0, f, dbzOpacityStrength);
      }
    } else if (productType == PRODUCT_V || productType == PRODUCT_SRV || productType == PRODUCT_WSPD) {
      float maxRaw = 0.15;
      float val = length(col.windAtMax);
      if (productType == PRODUCT_V)
        val = col.windAtMax.x;
      else if (productType == PRODUCT_SRV) {
        vec2 stormMotion = texture(baseTexture, vec2(0.5, 0.35)).xy;
        val = col.windAtMax.x - stormMotion.x;
      }
      if (col.maxMass < 0.0001 && abs(val) < maxRaw * 0.05)
        discard;
      float t = (productType == PRODUCT_WSPD)
        ? clamp(val / maxRaw, 0.0, 1.0)
        : clamp((val / maxRaw + 1.0) * 0.5, 0.0, 1.0);
      color = sampleColorScaleStepped(smoothstep(0.0, 1.0, t));
      pixelOpacity *= (col.maxMass > 0.0001) ? min(col.maxMass * 300.0, 1.0) : 0.45;
    } else if (productType == PRODUCT_CC) {
      if (col.maxMass < 0.0001)
        discard;
      float cc = col.ccAtMax;
      float t = clamp((cc - 0.2) / 0.8, 0.0, 1.0);
      float tStep = floor(t * float(colorScaleStops - 1) + 0.5) / float(colorScaleStops - 1);
      color = sampleColorScaleStepped(tStep);
      pixelOpacity *= min(col.maxMass * 300.0, 1.0);
    } else if (productType == PRODUCT_ZDR) {
      if (col.maxMass < 0.0001)
        discard;
      color = sampleColorScaleStepped(clamp((col.zdrAtMax + 1.0) / 6.0, 0.0, 1.0));
      pixelOpacity *= min(col.maxMass * 300.0, 1.0);
    } else if (productType == PRODUCT_KDP) {
      if (col.maxMass < 0.0001)
        discard;
      float kdp = col.maxMass * col.sizeAtMax * (1.0 - col.iceAtMax) * 120.0;
      color = sampleColorScaleStepped(clamp(kdp / 8.0, 0.0, 1.0));
      pixelOpacity *= min(col.maxMass * 300.0, 1.0);
    } else if (productType == PRODUCT_HCA) {
      if (col.maxMass < 0.00005 && col.smokeMax < 0.01)
        discard;
      float hcaClass = 0.0;
      if (col.smokeMax > 0.08 && col.maxMass < 0.0003) hcaClass = 5.0;
      else if (col.ccAtMax < 0.72 && col.maxDBZ > 45.0) hcaClass = 6.0;
      else if (col.sizeAtMax > 0.65 && col.iceAtMax > 0.35) hcaClass = 4.0;
      else if (col.iceAtMax > 0.75 && col.sizeAtMax < 0.45) hcaClass = 2.0;
      else if (col.iceAtMax > 0.45 && col.sizeAtMax > 0.35) hcaClass = 3.0;
      else if (col.iceAtMax > 0.55) hcaClass = 2.0;
      else if (col.maxMass > 0.0001) hcaClass = 1.0;
      color = sampleColorScaleStepped(hcaClass / 6.0);
      pixelOpacity *= max(min(col.maxMass * 400.0, 1.0), min(col.smokeMax * 2.0, 0.6));
    } else if (productType == PRODUCT_HAIL) {
      if (col.maxMass < 0.0001)
        discard;
      float hailScore = smoothstep(50.0, 70.0, col.maxDBZ) * 0.45 + col.sizeAtMax * 0.35
                      + mixedPhaseBonus(col.iceAtMax) * 0.25 + (1.0 - col.ccAtMax) * 0.2;
      hailScore = clamp(hailScore, 0.0, 1.0);
      if (hailScore < 0.15)
        discard;
      color = sampleColorScaleStepped(hailScore);
      pixelOpacity *= min(col.maxMass * 300.0, 1.0);
    } else if (productType == PRODUCT_TDS) {
      float tdsScore = smoothstep(45.0, 60.0, col.maxDBZ) * 0.35
                     + smoothstep(0.2, 0.65, 1.0 - col.minCC) * 0.35
                     + clamp(col.maxShear / 0.08, 0.0, 1.0) * 0.35;
      tdsScore = clamp(tdsScore, 0.0, 1.0);
      if (tdsScore < 0.25)
        discard;
      color = sampleColorScaleStepped(tdsScore);
      pixelOpacity *= tdsScore;
    } else if (productType == PRODUCT_MESO) {
      float mesoScore = clamp(col.maxShear / 0.12, 0.0, 1.0) * smoothstep(0.0001, 0.001, col.maxMass + 0.0005);
      if (mesoScore < 0.12)
        discard;
      color = sampleColorScaleStepped(mesoScore);
      pixelOpacity *= mesoScore;
    } else if (productType == PRODUCT_QPE) {
      if (col.maxDBZ < 5.0)
        discard;
      float zLin = pow(10.0, col.maxDBZ / 10.0);
      float rateMmHr = pow(zLin / 200.0, 1.0 / 1.6);
      color = sampleColorScaleStepped(clamp(rateMmHr / 100.0, 0.0, 1.0));
      pixelOpacity *= smoothstep(5.0, 15.0, col.maxDBZ);
    } else {
      discard;
    }
  }

  fragmentColor = vec4(color, pixelOpacity);
  drawCursor(cursor, view);
}
