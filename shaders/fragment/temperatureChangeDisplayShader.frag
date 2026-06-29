#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform sampler2D prevBaseTex;
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float dryLapse;
uniform float displayVectorField;
uniform vec3 view;
uniform vec4 cursor;
uniform int colorScaleColumn;
uniform int tempUnit;

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

void main()
{
  vec4 base = bilerpWall(baseTex, wallTex, fragCoord);
  vec4 prevBase = bilerpWall(prevBaseTex, wallTex, fragCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;

  float currentTempC = KtoC(potentialToRealT(base[3]));
  float prevTempC = KtoC(potentialToRealT(prevBase[3]));
  float diff = currentTempC - prevTempC;

  if (tempUnit == 1) {
    diff *= 1.8; // convert Celsius difference to Fahrenheit difference
  }

  float rangeMin = -0.4;
  float rangeMax = 0.4;
  if (tempUnit == 1) {
    rangeMin = -0.4 * 1.8;
    rangeMax = 0.4 * 1.8;
  }
  float indexF = map_rangeC(diff, rangeMin, rangeMax, 0.0, 32.0);
  int paletteIndex = int(indexF + 0.5);

  if (wall[1] == 0) {
    switch (wall[0]) {
      case 0:
        fragmentColor = vec4(0, 0, 0, 1);
        break;
      case 1:
        fragmentColor = vec4(vec3(0.10), 1.0);
        break;
      case 2:
        fragmentColor = vec4(0, 0.5, 0.99, 1);
        break;
      case 3:
        fragmentColor = vec4(1.0, 0.5, 0.0, 1);
        break;
      default:
        fragmentColor = vec4(0, 0, 0, 1);
        break;
    }
  } else {
    fragmentColor = texelFetch(colorScalesTex, ivec2(colorScaleColumn, paletteIndex), 0);
    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}
