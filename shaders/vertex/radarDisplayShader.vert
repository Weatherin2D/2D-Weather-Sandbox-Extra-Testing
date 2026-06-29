#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;

uniform vec2 texelSize;
uniform vec2 aspectRatios;
uniform vec3 view;
uniform float Xmult;

out vec2 texCoord;
out vec2 fragCoord;

void main()
{
  vec2 tc = vertTexCoord;
  tc.x *= Xmult;
  tc.x -= (Xmult - 1.0) / (2.0 * texelSize.x);
  fragCoord = tc;
  texCoord = tc * texelSize;

  vec2 pos = vertPosition;
  pos.x *= Xmult;
  pos.x += view.x;
  pos.y += view.y * aspectRatios[0];
  pos *= view[2];
  pos.y *= aspectRatios[1] / aspectRatios[0];
  gl_Position = vec4(pos, 0.0, 1.0);
}
