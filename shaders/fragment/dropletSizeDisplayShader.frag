#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform sampler2D dropletSizeTex;
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;

uniform vec3 view;
uniform vec4 cursor;

uniform int sizeChannel; // 0 = hail (R), 1 = all droplets (G)
uniform int colorScaleColumn;
uniform int colorScaleStops;
uniform float valueMin;
uniform float valueMax;

out vec4 fragmentColor;

const float dryLapse = 0.0;

#include "common.glsl"
#include "commonDisplay.glsl"

void main()
{
  ivec4 wall = texture(wallTex, texCoord);
  vec4 sizes = bilerp(dropletSizeTex, fragCoord);
  float sizeMm = (sizeChannel == 0) ? sizes.r : sizes.g;

  if (wall[DISTANCE] == 0) {
    switch (wall[TYPE]) {
    case 0:
      fragmentColor = vec4(0.0, 0.0, 0.0, 1.0);
      break;
    case 1:
      fragmentColor = vec4(vec3(0.10), 1.0);
      break;
    case 2:
      fragmentColor = vec4(0.0, 0.5, 0.99, 1.0);
      break;
    case 3:
      fragmentColor = vec4(1.0, 0.5, 0.0, 1.0);
      break;
    default:
      fragmentColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
  } else {
    float range = max(valueMax - valueMin, 0.001);
    float normalized = clamp((sizeMm - valueMin) / range, 0.0, 1.0);
    int palIdx = clamp(int(normalized * float(colorScaleStops - 1)), 0, colorScaleStops - 1);
    fragmentColor = texelFetch(colorScalesTex, ivec2(colorScaleColumn, palIdx), 0);
    float alpha = smoothstep(0.5, 2.0, sizeMm);
    fragmentColor = mix(vec4(0.04, 0.04, 0.06, 1.0), fragmentColor, alpha);
  }

  drawCursor(cursor, view);
}
