#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float dryLapse;
uniform float simHeight;
uniform float evapHeat;

layout(location = 0) out float cape;

#include "common.glsl"

void main()
{
  float dzR = simHeight / resolution.y;
  float dT  = -9.8 * dzR / 1000.0;

  // Find surface
  int surfaceY = 0;
  for (int y = 0; y < 512; y++) {
    if (float(y) >= resolution.y) break;
    ivec4 wall = texture(wallTex, vec2(texCoord.x, (float(y) + 0.5) * texelSize.y));
    if (wall[DISTANCE] != 0) { surfaceY = y; break; }
  }

  vec2 sfcCoord   = vec2(texCoord.x, (float(surfaceY) + 0.5) * texelSize.y);
  vec4 sfcBase    = texture(baseTex,  sfcCoord);
  vec4 sfcWater   = texture(waterTex, sfcCoord);
  float sfcTempC  = KtoC(sfcBase[TEMPERATURE] - sfcCoord.y * dryLapse);
  float mixW      = maxWater(dewpoint(clamp(sfcWater[TOTAL], 0.0, 0.1)));

  float prevT  = sfcTempC;
  float prevCW = 0.0;
  float totalCape = 0.0;

  for (int y = surfaceY + 1; y < 512; y++) {
    if (float(y) >= resolution.y) break;
    float texY   = (float(y) + 0.5) * texelSize.y;
    vec4 envBase = texture(baseTex, vec2(texCoord.x, texY));
    float envTk  = envBase[TEMPERATURE] - texY * dryLapse;

    float cw   = max(mixW - maxWater(CtoK(prevT + dT)), 0.0);
    float dWt  = (cw - prevCW) * evapHeat;
    float denom = dT - dWt;
    float mult = abs(denom) > 0.0001 ? dT / denom : 1.0;
    prevT  = prevT + dT * mult;
    prevCW = max(mixW - maxWater(CtoK(prevT)), 0.0);

    float buoy = 9.81 * (CtoK(prevT) - envTk) / envTk;
    if (buoy > 0.0) totalCape += buoy * dzR;
  }

  cape = totalCape;
}
