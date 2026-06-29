#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 texCoord;

uniform sampler2D summaryTex;
uniform sampler2D chargeTex;
uniform int debugMode; // 0=potential, 1=charge, 2=gradient, 3=conductivity
uniform vec2 texelSize;

out vec4 fragmentColor;

void main()
{
  vec4 sum = texture(summaryTex, texCoord);
  float charge = sum.r;
  float potential = sum.b;
  float cond = sum.a;

  if (debugMode == 1) {
    float c = abs(charge);
    fragmentColor = vec4(charge > 0.0 ? vec3(0.2, 0.5, 1.0) : vec3(1.0, 0.3, 0.2), clamp(c, 0.0, 1.0));
    return;
  }
  if (debugMode == 2) {
    float cL = texture(chargeTex, texCoord - vec2(texelSize.x, 0.0)).r;
    float cR = texture(chargeTex, texCoord + vec2(texelSize.x, 0.0)).r;
    float cD = texture(chargeTex, texCoord - vec2(0.0, texelSize.y)).r;
    float cU = texture(chargeTex, texCoord + vec2(0.0, texelSize.y)).r;
    vec2 grad = vec2(cR - cL, cU - cD);
    float g = clamp(length(grad) * 3.0, 0.0, 1.0);
    fragmentColor = vec4(vec3(0.1 + g, 0.2 + g * 0.5, 0.8 + g * 0.2), 0.85);
    return;
  }
  if (debugMode == 3) {
    fragmentColor = vec4(vec3(0.1, 0.3 + cond * 0.5, 0.15 + cond * 0.7), 0.9);
    return;
  }
  // potential field (default)
  float p = clamp(potential, 0.0, 1.5) / 1.5;
  fragmentColor = vec4(vec3(p * 0.3, p * 0.6, p), 0.85);
}
