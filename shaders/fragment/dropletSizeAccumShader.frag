#version 300 es
precision highp float;

in vec4 sizeOut;

layout(location = 0) out vec4 fragmentColor;

void main()
{
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float edge = fwidth(d) * 1.25;
  if (d > 1.0 + edge)
    discard;
  fragmentColor = sizeOut;
}
