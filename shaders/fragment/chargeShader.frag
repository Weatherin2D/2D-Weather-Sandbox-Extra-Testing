#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D chargeTex; // previous frame charge

uniform vec2 texelSize;
uniform vec2 resolution;
uniform float dryLapse;

// Output: R = air charge (V, bipolar), G = ground-surface charge (V, bipolar)
layout(location = 0) out vec2 charge;

#include "common.glsl"

// ── Microphysics charge separation (not height bands) ─────────────────────
//
// Tripole structure emerges from storm dynamics, not fixed altitude layers:
//
//   (+) Ice crystals lofted in updrafts (cold mixed-phase aloft)
//   (−) Graupel/hail from ice–liquid collisions in −10 to −20 °C updraft core
//   (+) Weak screening pocket at cloud base (warm rain export)
//   Ground (+) induced under negative cloud base
//
// Requires active convection and dense cloud — precipitation enhances charging
// but thick cloud alone (bases, anvils, cores) can also separate charge.

#define CHARGE_DECAY        0.9965
#define CHARGE_DIFFUSION    0.017
#define CHARGE_SCALE_BASE   0.0025
#define MAX_LT_DISCHARGE    4

uniform float chargeGenerationRate;
uniform float chargeMinCloudDensity;
uniform float chargeStormCoreThreshold;
uniform float chargeTransportStrength;
uniform float chargeDissipationRate;

uniform int ltDischargeCount;
uniform vec4 ltDischarge[MAX_LT_DISCHARGE];     // xy = uv, z = amount, w = radius px
uniform vec4 ltDischargeMeta[MAX_LT_DISCHARGE]; // x = ltType (for column shape)

uniform vec4 userInputValues; // xpos  ypos  intensity  brush size
#define BRUSH_INTENSITY 2
#define BRUSH_SIZE 3
uniform int userInputType;    // 23 = charge brush
uniform int invertTool;       // 0 = add + / remove −, 1 = add − / remove +
uniform bool wrapHorizontally;

#define CHARGE_TOOL_TYPE 23
#define CHARGE_BRUSH_RATE 4.0

float applyDirectedCharge(float c, float delta, bool towardPositive)
{
  float amt = abs(delta);
  if (amt < 1e-8)
    return c;
  if (towardPositive) {
    if (delta > 0.0) {
      if (c < 0.0)
        c = min(c + amt, 0.0);
      else
        c = min(c + amt, 1.0);
    } else {
      if (c > 0.0)
        c = max(c + delta, 0.0);
      else
        c = max(c + delta, -1.0);
    }
  } else {
    if (delta > 0.0) {
      if (c > 0.0)
        c = max(c - amt, 0.0);
      else
        c = max(c - amt, -1.0);
    } else {
      if (c < 0.0)
        c = min(c - delta, 0.0);
      else
        c = min(c - delta, 1.0);
    }
  }
  return clamp(c, -1.0, 1.0);
}

void applyChargeBrush(inout float cellCharge, vec2 coord)
{
  if (userInputType != CHARGE_TOOL_TYPE)
    return;

  bool inBrush = false;
  float weight = 1.0;

  if (userInputValues.x < -0.5) {
    if (abs(userInputValues.y - coord.y) < userInputValues[BRUSH_SIZE] * texelSize.y)
      inBrush = true;
  } else {
    vec2 vecFromMouse;
    if (wrapHorizontally)
      vecFromMouse = vec2(absHorizontalDist(userInputValues.x, coord.x), userInputValues.y - coord.y);
    else
      vecFromMouse = vec2(abs(userInputValues.x - coord.x), userInputValues.y - coord.y);
    vecFromMouse.x *= texelSize.y / texelSize.x;
    float distFromMouse = length(vecFromMouse);
    weight = smoothstep(userInputValues[BRUSH_SIZE] * texelSize.y, 0., distFromMouse);
    if (distFromMouse < userInputValues[BRUSH_SIZE] * texelSize.y)
      inBrush = true;
  }

  if (!inBrush)
    return;

  bool towardPositive = invertTool == 0;
  float delta = userInputValues[BRUSH_INTENSITY] * weight * CHARGE_BRUSH_RATE;
  cellCharge = applyDirectedCharge(cellCharge, delta, towardPositive);
}

void main()
{
  vec4 base  = texture(baseTex,  texCoord);
  vec4 water = texture(waterTex, texCoord);
  ivec4 wall = texture(wallTex,  texCoord);

  vec2 prev  = texture(chargeTex, texCoord).rg;

  // ── Wall / ground cells: induced surface charge ─────────────────────────
  if (wall[DISTANCE] == 0) {
    vec2 aboveCoord = vec2(texCoord.x, min(texCoord.y + texelSize.y, 1.0));
    float airChargeAbove = texture(chargeTex, aboveCoord).r;
    float airLeft  = texture(chargeTex, vec2(max(texCoord.x - texelSize.x, 0.0), aboveCoord.y)).r;
    float airRight = texture(chargeTex, vec2(min(texCoord.x + texelSize.x, 1.0), aboveCoord.y)).r;
    float gradAbove = (airRight - airLeft) * 0.5;

    float surfDecay = mix(CHARGE_DECAY, 0.993, clamp(chargeDissipationRate - 1.0, 0.0, 1.0) * 0.35);
    float groundCharge = prev.g * surfDecay;
    groundCharge -= airChargeAbove * 0.10;
    groundCharge -= gradAbove * 0.045;
    if (sign(airChargeAbove) != sign(groundCharge) && abs(airChargeAbove) > 0.08)
      groundCharge += sign(-airChargeAbove) * min(abs(airChargeAbove) * 0.05, 0.12);
    groundCharge = clamp(groundCharge, -1.0, 1.0);
    applyChargeBrush(groundCharge, texCoord);
    charge = vec2(0.0, groundCharge);
    return;
  }

  // ── Air cells ───────────────────────────────────────────────────────────
  float realTemp   = potentialToRealT(base[TEMPERATURE]);
  float cloudWater = water[CLOUD];
  float precip     = water[PRECIPITATION];
  float vy         = base[VY];
  float updraft    = max(vy, 0.0);
  float downdraft  = max(-vy, 0.0);

  // Storm core: charge only where cloud exceeds local neighborhood (convection)
  float cL = texture(waterTex, texCoordXmY0)[CLOUD];
  float cR = texture(waterTex, texCoordXpY0)[CLOUD];
  float cD = texture(waterTex, texCoordX0Ym)[CLOUD];
  float cU = texture(waterTex, texCoordX0Yp)[CLOUD];

  ivec4 wallLeft  = texture(wallTex, texCoordXmY0);
  ivec4 wallRight = texture(wallTex, texCoordXpY0);
  ivec4 wallDown  = texture(wallTex, texCoordX0Ym);
  ivec4 wallUp    = texture(wallTex, texCoordX0Yp);

  float neighborCloud = cloudWater;
  float neighborCount = 1.0;
  if (wallLeft[DISTANCE]  != 0) { neighborCloud += cL; neighborCount += 1.0; }
  if (wallRight[DISTANCE] != 0) { neighborCloud += cR; neighborCount += 1.0; }
  if (wallDown[DISTANCE]  != 0) { neighborCloud += cD; neighborCount += 1.0; }
  if (wallUp[DISTANCE]    != 0) { neighborCloud += cU; neighborCount += 1.0; }

  float localMean = neighborCloud / neighborCount;
  float chargeScale = CHARGE_SCALE_BASE * chargeGenerationRate;
  float minCloudDens = chargeMinCloudDensity;
  float denseCloudHigh = minCloudDens + 0.63;
  float stormCoreGateLow = minCloudDens * 0.6875;
  // Convective core (local peak) OR uniformly dense layer (anvil / cloud-base shelf)
  float corePeak = smoothstep(localMean * 0.55 + 0.10, localMean + 0.70, cloudWater);
  float uniformDense = smoothstep(chargeStormCoreThreshold, chargeStormCoreThreshold + 0.44, cloudWater)
                     * smoothstep(chargeStormCoreThreshold - 0.03, chargeStormCoreThreshold + 0.40, localMean);
  float stormCore = max(corePeak, uniformDense * 0.85);
  stormCore *= smoothstep(stormCoreGateLow, 1.05, cloudWater);

  float denseCloud = smoothstep(minCloudDens, denseCloudHigh, cloudWater) * stormCore;

  // Collision: precip enhances; dense cloud + updraft can charge without rain
  float cloudOnlyColl = cloudWater * cloudWater * (0.42 + updraft * 1.35 + downdraft * 0.40);
  cloudOnlyColl += cloudWater * denseCloud * updraft * 0.50;
  float precipColl = cloudWater * precip * (1.0 + updraft * 1.6 + downdraft * 0.7);
  float collision = cloudOnlyColl + precipColl;

  // Graupel → negative: mixed-phase −10 to −20 °C in active updraft
  float graupelZone = smoothstep(CtoK(-22.0), CtoK(-14.0), realTemp)
                    * (1.0 - smoothstep(CtoK(-8.0), CtoK(2.0), realTemp));
  float graupelBoost = 0.35 + updraft * 1.4 + downdraft * 0.5;
  float negativeGen = collision * graupelZone * graupelBoost * denseCloud * chargeScale * 1.6;
  float mixedCloudNeg = cloudWater * denseCloud * graupelZone
                      * (0.18 + updraft * 0.75) * chargeScale * 0.55;
  negativeGen += mixedCloudNeg;

  // Ice crystals → positive: lofted in cold updraft above graupel layer
  float iceCrystalZone = smoothstep(CtoK(-38.0), CtoK(-24.0), realTemp)
                       * (1.0 - smoothstep(CtoK(-18.0), CtoK(-10.0), realTemp));
  float positiveGen = collision * iceCrystalZone * (0.25 + updraft * 1.8) * denseCloud * chargeScale * 1.1;
  positiveGen += cloudWater * updraft * iceCrystalZone * denseCloud * chargeScale * 0.32;

  // Anvil: cold dense spread-out cloud (no precip required)
  float anvilZone = smoothstep(CtoK(-48.0), CtoK(-26.0), realTemp)
                  * smoothstep(0.40, 1.15, cloudWater)
                  * (0.55 + (1.0 - min(updraft * 1.2, 1.0)) * 0.45);
  float anvilPositiveGen = cloudWater * anvilZone * denseCloud * chargeScale * 0.38;
  positiveGen += anvilPositiveGen;

  // Cloud base screening (+): dense warm cloud; precip adds extra
  float cloudBaseZone = smoothstep(CtoK(-3.0), CtoK(7.0), realTemp);
  float warmPositiveGen = cloudWater * cloudBaseZone * denseCloud * chargeScale * 0.24;
  warmPositiveGen += precip * cloudWater * cloudBaseZone * denseCloud * chargeScale * 0.14;

  // Falling hydrometeors transport negative charge downward (needs precip)
  float precipTransport = precip * (0.20 + downdraft * 1.1 + updraft * 0.15) * denseCloud * chargeScale * 0.50;

  float chargeLeft  = texture(chargeTex, texCoordXmY0).r;
  float chargeRight = texture(chargeTex, texCoordXpY0).r;
  float chargeDown  = texture(chargeTex, texCoordX0Ym).r;
  float chargeUp    = texture(chargeTex, texCoordX0Yp).r;

  float netCharge = positiveGen + warmPositiveGen - negativeGen - precipTransport;
  float tripoleSign = sign(realTemp - CtoK(-15.0));
  float updraftOrg = updraft * denseCloud * chargeScale * 0.10 * tripoleSign;
  float layerShear = (chargeUp - chargeDown) * updraft * denseCloud * 0.09;
  float dipoleDrive = graupelZone * iceCrystalZone * denseCloud * chargeScale * 0.22;
  dipoleDrive *= sign(updraft - 0.12 + (realTemp - CtoK(-16.0)) * 0.0008);
  netCharge += updraftOrg + layerShear + dipoleDrive;

  // ── Diffusion (air cells only) ───────────────────────────────────────────

  float neighborSum = 0.0;
  float neighborDiffCount = 0.0;
  if (wallLeft[DISTANCE]  != 0) { neighborSum += chargeLeft;  neighborDiffCount += 1.0; }
  if (wallRight[DISTANCE] != 0) { neighborSum += chargeRight; neighborDiffCount += 1.0; }
  if (wallDown[DISTANCE]  != 0) { neighborSum += chargeDown;  neighborDiffCount += 1.0; }
  if (wallUp[DISTANCE]    != 0) { neighborSum += chargeUp;    neighborDiffCount += 1.0; }

  float diffusion = 0.0;
  if (neighborDiffCount > 0.0) {
    diffusion = (neighborSum / neighborDiffCount - prev.r) * CHARGE_DIFFUSION;
  }

  // ── Advection with wind ──────────────────────────────────────────────────
  vec2 vel = base.xy;
  vec2 upstreamCoord = texCoord - vel * texelSize * 0.5;
  upstreamCoord = clamp(upstreamCoord, vec2(0.0), vec2(1.0));
  float advectedCharge = texture(chargeTex, upstreamCoord).r;

  float transportMix = clamp(chargeTransportStrength, 0.0, 3.0) * 0.32;
  float dissipation = mix(CHARGE_DECAY, 0.992, clamp(chargeDissipationRate - 1.0, 0.0, 1.0) * 0.5);
  float airCharge = mix(prev.r, advectedCharge, transportMix);
  airCharge = airCharge * dissipation + diffusion + netCharge;

  // Lightning discharge — neutralize charge around strike origins this iteration
  for (int d = 0; d < MAX_LT_DISCHARGE; d++) {
    if (d >= ltDischargeCount) break;
    vec2  delta = (texCoord - ltDischarge[d].xy) * resolution;
    float amount = ltDischarge[d].z;
    float rad    = max(ltDischarge[d].w, 4.0);
    float ltType = ltDischargeMeta[d].x;
    float distNorm;
    if (ltType >= 5.0) {
      float dx = abs(delta.x) / rad;
      float dy = abs(delta.y) / (rad * 2.8);
      distNorm = length(vec2(dx, dy));
    } else {
      distNorm = length(delta) / rad;
    }
    float falloff = exp(-distNorm * distNorm * 2.4);
    float discharge = amount * falloff;
    if (discharge > 0.0001) {
      float mag = max(0.0, abs(airCharge) - discharge);
      airCharge = sign(airCharge) * mag;
      if (mag < 0.02)
        airCharge = 0.0;
    }
  }

  airCharge = clamp(airCharge, -1.0, 1.0);
  applyChargeBrush(airCharge, texCoord);

  charge = vec2(airCharge, 0.0);
}
