#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

vec2 fragCoord;          // (in) not used just defined for commonDisplay.glsl
in vec2 texCoord;        // this
in vec2 texCoordXmY0;    // left
in vec2 texCoordX0Ym;    // down
in vec2 texCoordXpY0;    // right
in vec2 texCoordX0Yp;    // up

uniform vec2 resolution; // sim resolution
uniform vec2 texelSize;

uniform float exposure;
uniform float saturation;
uniform float contrast;
uniform float bloomStrength;

uniform sampler2D hdrTex;
uniform sampler2D bloomTex;
out vec4 fragmentColor;


#include "commonDisplay.glsl"

void main()
{
  vec3 outputCol = texture(hdrTex, texCoord).rgb;

  vec3 bloom = texture(bloomTex, texCoord).rgb;

  outputCol += bloom * bloomStrength;

  outputCol *= exposure;

  outputCol = pow(outputCol, ONE_OVER_GAMMA); // gamma correction

  // Contrast: centered at 0.5 in display space
  outputCol = (outputCol - 0.5) * contrast + 0.5;

  // Saturation: luminance-preserving desaturation/oversaturation
  float lum = dot(outputCol, vec3(0.2126, 0.7152, 0.0722));
  outputCol = mix(vec3(lum), outputCol, saturation);

  outputCol = clamp(outputCol, 0.0, 1.0);

  fragmentColor = vec4(outputCol, 1.0);
}
