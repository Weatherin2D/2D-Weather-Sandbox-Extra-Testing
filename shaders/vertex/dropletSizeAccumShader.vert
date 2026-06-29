#version 300 es
precision highp float;

layout(location = 0) in vec2 dropPosition;
layout(location = 1) in vec2 mass;
layout(location = 2) in float density;

out vec4 sizeOut;

#include "dropletSize.glsl"

void main()
{
  if (mass.x < 0.0) {
    gl_Position = vec4(-3.0, -3.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    sizeOut = vec4(0.0);
    return;
  }

  float widthMm = dropletHorizWidthMm(mass, density);
  if (widthMm <= 0.0) {
    gl_Position = vec4(-3.0, -3.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    sizeOut = vec4(0.0);
    return;
  }

  float hailMm = isHailParticle(mass, density) ? widthMm : 0.0;

  gl_Position = vec4(dropPosition, 0.0, 1.0);
  gl_PointSize = 2.0;
  // G = max size of any active droplet (rain, snow, graupel, hail, …)
  sizeOut = vec4(hailMm, widthMm, 0.0, 1.0);
}
