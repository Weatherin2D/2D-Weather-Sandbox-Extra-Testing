#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform sampler2D chargeTex;
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;

uniform vec3 view;
uniform vec4 cursor;

// Color scale column for charge (blue=negative, white=neutral, red=positive)
uniform int colorScaleColumn;
uniform int colorScaleStops;

out vec4 fragmentColor;

// Declare globals needed by commonDisplay.glsl
const float dryLapse = 0.0;

#include "common.glsl"
#include "commonDisplay.glsl"

void main()
{
  ivec4 wall = texture(wallTex, texCoord);
  vec2  chargeVal = texture(chargeTex, texCoord).rg;

  if (wall[DISTANCE] == 0) {
    // Wall cell: show ground/surface charge from G channel
    // Also sample the air cell directly above to show induced charge more clearly
    vec2 aboveCoord = vec2(texCoord.x, texCoord.y + texelSize.y);
    float groundCharge = chargeVal.g;
    float airAbove     = texture(chargeTex, aboveCoord).r;

    // Use whichever is stronger — the stored ground charge or the air above
    float displayCharge = abs(groundCharge) > abs(airAbove) ? groundCharge : -airAbove * 0.8;

    // Bipolar: map [-1,1] → [0,1]
    float normalized = clamp((displayCharge + 1.0) * 0.5, 0.0, 1.0);
    int palIdx = clamp(int(normalized * float(colorScaleStops - 1)), 0, colorScaleStops - 1);
    vec4 chargeColor = texelFetch(colorScalesTex, ivec2(colorScaleColumn, palIdx), 0);

    // Show charge magnitude as brightness — stronger charge = more saturated color
    float chargeMag = abs(displayCharge);
    float brightness = 0.15 + chargeMag * 0.85; // always at least 15% visible
    fragmentColor = mix(vec4(0.06, 0.06, 0.08, 1.0), chargeColor, brightness);
  } else {
    // Air cell: show air charge from R channel
    float airCharge = chargeVal.r;

    // Bipolar: map [-1,1] → [0,1]
    float normalized = clamp((airCharge + 1.0) * 0.5, 0.0, 1.0);
    int palIdx = clamp(int(normalized * float(colorScaleStops - 1)), 0, colorScaleStops - 1);
    fragmentColor = texelFetch(colorScalesTex, ivec2(colorScaleColumn, palIdx), 0);

    // Fade to near-black where charge is near zero (cleaner look)
    float chargeMag = abs(airCharge);
    float alpha = smoothstep(0.02, 0.15, chargeMag);
    fragmentColor = mix(vec4(0.04, 0.04, 0.06, 1.0), fragmentColor, alpha);
  }

  drawCursor(cursor, view);
}
