#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 texCoordXmY0;
in vec2 texCoordXpY0;
in vec2 texCoordX0Ym;
in vec2 texCoordX0Yp;

uniform sampler2D chargeTex;
uniform sampler2D waterTex;
uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform vec2 texelSize;
uniform vec2 resolution;
uniform float dryLapse;

layout(location = 0) out vec4 summary;

#include "common.glsl"

void main()
{
  float charge = texture(chargeTex, texCoord).r;
  vec4 water = texture(waterTex, texCoord);
  vec4 base  = texture(baseTex, texCoord);
  ivec4 wall = texture(wallTex, texCoord);

  float cloud  = water[CLOUD];
  float precip = water[PRECIPITATION];
  float updraft = max(base[VY], 0.0);

  float chargeL = texture(chargeTex, texCoordXmY0).r;
  float chargeR = texture(chargeTex, texCoordXpY0).r;
  float chargeD = texture(chargeTex, texCoordX0Ym).r;
  float chargeU = texture(chargeTex, texCoordX0Yp).r;
  vec2 grad = vec2(chargeR - chargeL, chargeU - chargeD) * 0.5;

  float realTemp = potentialToRealT(base[TEMPERATURE]);
  float graupelZone = smoothstep(CtoK(-22.0), CtoK(-14.0), realTemp)
                    * (1.0 - smoothstep(CtoK(-8.0), CtoK(2.0), realTemp));
  float iceContent = cloud * graupelZone * (0.4 + updraft * 1.2);
  float hailProxy = precip * graupelZone * updraft;

  float cloudGate = clamp(1.0 - 1.0 / (1.0 + cloud * 13.0), 0.0, 1.0);
  float stormOrg = cloudGate * (0.35 + updraft * 0.9 + length(grad) * 1.4);

  float potential = abs(charge) * cloudGate * (0.62 + updraft * 0.48)
                  + length(grad) * cloudGate * 0.72
                  + iceContent * 0.38 + hailProxy * 0.28
                  + stormOrg * 0.34 + precip * cloudGate * 0.18;
  potential = clamp(potential, 0.0, 2.0);

  float conductivity = 0.08;
  float surfaceCharge = 0.0;
  float chargeGradMag = length(grad);

  if (wall[DISTANCE] == 0) {
    surfaceCharge = texture(chargeTex, texCoord).g;
    float airAbove = texture(chargeTex, vec2(texCoord.x, min(texCoord.y + texelSize.y, 1.0))).r;
    float oppose = abs(airAbove - surfaceCharge);

    if (isLiquidWaterType(wall[TYPE]))
      conductivity = 1.0;
    else if (wall[TYPE] == WALLTYPE_ICE)
      conductivity = 0.15;
    else {
      float moist = clamp(water[SOIL_MOISTURE] / 20.0, 0.0, 1.0);
      if (moist > 0.65) conductivity = 0.72 + moist * 0.22;
      else if (moist > 0.28) conductivity = 0.28 + moist * 0.55;
      else conductivity = 0.06 + moist * 0.18;
      conductivity += float(wall[VEGETATION]) / 127.0 * 0.10;
    }

    ivec4 wL = texture(wallTex, texCoordXmY0);
    ivec4 wR = texture(wallTex, texCoordXpY0);
    float elev = float(wall[VERT_DISTANCE]);
    if (elev >= float(wL[VERT_DISTANCE]) && elev >= float(wR[VERT_DISTANCE]))
      conductivity += 0.22;
    if (elev > 3.0)
      conductivity += smoothstep(3.0, 14.0, elev) * 0.18;

    potential += oppose * 0.25 + abs(surfaceCharge) * 0.15;
    summary = vec4(surfaceCharge, cloud, potential, conductivity);
    return;
  }

  conductivity = chargeGradMag;
  float anvilBoost = smoothstep(0.35, 1.0, cloud) * (1.0 - min(updraft * 0.8, 0.85));
  potential += anvilBoost * 0.22;

  summary = vec4(charge, cloud, potential, conductivity);
}
