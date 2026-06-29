#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;

in vec2 texCoord;
in vec2 texCoordXmY0;
in vec2 texCoordX0Ym;
in vec2 texCoordXpY0;
in vec2 texCoordX0Yp;

uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform sampler2D radarFieldTex;
uniform sampler2D radarSourceTex;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform int fieldUpdateMode;

layout(location = 0) out vec4 radarFieldOut;

#define DISTANCE 1

vec4 blurField()
{
  vec2 texCoordXmYm = texCoord + vec2(-texelSize.x, -texelSize.y);
  vec2 texCoordXpYp = texCoord + vec2(texelSize.x, texelSize.y);
  vec2 texCoordXmYp = texCoord + vec2(-texelSize.x, texelSize.y);
  vec2 texCoordXpYm = texCoord + vec2(texelSize.x, -texelSize.y);

  vec4 center = texture(radarFieldTex, texCoord) * 4.0;
  vec4 cross = (texture(radarFieldTex, texCoordXmY0) + texture(radarFieldTex, texCoordXpY0) + texture(radarFieldTex, texCoordX0Ym) +
                texture(radarFieldTex, texCoordX0Yp)) *
               2.0;
  vec4 diag = texture(radarFieldTex, texCoordXmYm) + texture(radarFieldTex, texCoordXpYp) + texture(radarFieldTex, texCoordXmYp) +
              texture(radarFieldTex, texCoordXpYm);

  return (center + cross + diag) / 16.0;
}

vec4 blurSource()
{
  vec2 texCoordXmYm = texCoord + vec2(-texelSize.x, -texelSize.y);
  vec2 texCoordXpYp = texCoord + vec2(texelSize.x, texelSize.y);
  vec2 texCoordXmYp = texCoord + vec2(-texelSize.x, texelSize.y);
  vec2 texCoordXpYm = texCoord + vec2(texelSize.x, -texelSize.y);

  vec4 center = texture(radarSourceTex, texCoord) * 4.0;
  vec4 cross = (texture(radarSourceTex, texCoordXmY0) + texture(radarSourceTex, texCoordXpY0) + texture(radarSourceTex, texCoordX0Ym) +
                texture(radarSourceTex, texCoordX0Yp)) *
               2.0;
  vec4 diag = texture(radarSourceTex, texCoordXmYm) + texture(radarSourceTex, texCoordXpYp) + texture(radarSourceTex, texCoordXmYp) + texture(radarSourceTex, texCoordXpYm);

  return (center + cross + diag) / 16.0;
}

void main()
{
  ivec4 wall = texture(wallTex, texCoord);
  if (wall[DISTANCE] == 0) {
    radarFieldOut = vec4(0.0);
    return;
  }

  vec4 previousField = blurField();
  vec4 blurredSource = blurSource();

  if (fieldUpdateMode == 1) {
    float previousHail = previousField.a;
    float sourceHail = blurredSource.a;
    radarFieldOut = vec4(0.0, 0.0, 0.0, max(previousHail * 0.972 + sourceHail * 0.110, 0.0));
    return;
  }

  const vec4 decay = vec4(0.955, 0.955, 0.930, 0.940);
  const vec4 sourceGain = vec4(0.42, 0.42, 0.24, 0.30);

  radarFieldOut = max(previousField * decay + blurredSource * sourceGain, vec4(0.0));
}
