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

uniform sampler2D baseTexture;
uniform sampler2D waterTexture;
uniform isampler2D wallTexture;
uniform sampler2D colorScalesTex;
uniform sampler2D precipFeedbackTexture;
uniform sampler2D precipDepositionTexture;

uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;
uniform bool  dbzOpacityEnabled;
uniform float dbzOpacityStrength;

const int MAX_RADARS = 32;
uniform int   radarCount;
uniform vec2  radarPositions[MAX_RADARS];
uniform float radarRanges[MAX_RADARS];
uniform float radarResolutions[MAX_RADARS];
uniform float radarSensitivities[MAX_RADARS];

out vec4 fragmentColor;

vec3 sampleColorScaleStepped(float t)
{
  int idx = clamp(int(t * float(colorScaleStops)), 0, colorScaleStops - 1);
  return texelFetch(colorScalesTex, ivec2(colorScaleColumn, idx), 0).rgb;
}

float computeReflectivityAt(vec2 cellPos, vec2 radarPos, float radarRange, float radarResolution, float sensitivity)
{
  vec2  delta = cellPos - radarPos;
  float dist  = length(delta);
  float angle = atan(delta.y, delta.x);

  if (dist > radarRange || dist < 0.5) return -1.0;

  float distFrac = dist / radarRange;

  float resMult   = 1.0 / max(radarResolution, 0.1);
  float rangeStep = max(0.01, distFrac * distFrac * 3.0 * resMult * (radarRange / 400.0));
  float azStep    = max(0.001, 0.03 * resMult * (radarRange / 400.0));

  float snappedDist  = (floor(dist  / rangeStep + 0.5)) * rangeStep;
  float snappedAngle = (floor(angle / azStep    + 0.5)) * azStep;

  vec2 snappedCell = radarPos + vec2(cos(snappedAngle), sin(snappedAngle)) * snappedDist;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize,
                           texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);
  if (wallData[1] == 0) return -1.0;

  vec4 waterData = texture(waterTexture, snappedTC);
  float gridPrecip = waterData[2];
  float dust = waterData[3] * 0.15;
  float totalReflectiveMass = (gridPrecip + dust) * sensitivity;

  float dBZ = 45.0 + 10.0 * log(max(totalReflectiveMass * 30.0, 1e-9)) / log(10.0);
  return clamp(dBZ, 0.0, 85.0);
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  vec2  tc      = clamp(cellPos * texelSize, texelSize * 0.5, vec2(1.0) - texelSize * 0.5);
  ivec4 wallData = texture(wallTexture, tc);

  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
    } else {
      discard;
    }
    return;
  }

  float maxDBZ = -1.0;
  for (int i = 0; i < MAX_RADARS; i++) {
    if (i >= radarCount) break;
    float dBZ = computeReflectivityAt(cellPos, radarPositions[i], radarRanges[i],
                                    radarResolutions[i], radarSensitivities[i]);
    maxDBZ = max(maxDBZ, dBZ);
  }

  if (maxDBZ < 1.0) discard;

  vec3  color        = vec3(0.0);
  float pixelOpacity = opacity;

  if (maxDBZ < 5.0) {
    color        = vec3(0.45, 0.82, 1.0);
    pixelOpacity *= smoothstep(1.0, 5.0, maxDBZ);
  } else {
    float t = smoothstep(0.0, 1.0, maxDBZ / 85.0);
    color = sampleColorScaleStepped(t);
    if (maxDBZ < 25.0)
      color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, maxDBZ));
  }

  if (dbzOpacityEnabled) {
    float dbzOpacityFactor = smoothstep(0.0, 50.0, maxDBZ);
    dbzOpacityFactor = mix(1.0, dbzOpacityFactor, dbzOpacityStrength);
    pixelOpacity *= dbzOpacityFactor;
  }

  fragmentColor = vec4(color, pixelOpacity);
}
