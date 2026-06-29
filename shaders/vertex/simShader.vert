#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;

uniform vec2 texelSize;

out vec2 fragCoord; // non normalized fragment coordinate

// normalized texure positions. p = plus 1      m = minus 1
out vec2 texCoord; // this
out vec2 texCoordXmY0; // left
out vec2 texCoordXpY0; // right
out vec2 texCoordX0Yp; // up
out vec2 texCoordX0Ym; // down

out vec2 texCoordXmYp; // left up
out vec2 texCoordXpYm; // right down

// Extended radius for pressure gradient (2 and 3 texels away)
out vec2 texCoordXm2Y0; // left 2
out vec2 texCoordXp2Y0; // right 2
out vec2 texCoordX0Yp2; // up 2
out vec2 texCoordX0Ym2; // down 2
out vec2 texCoordXm3Y0; // left 3
out vec2 texCoordXp3Y0; // right 3
out vec2 texCoordX0Yp3; // up 3
out vec2 texCoordX0Ym3; // down 3

void main()
{
  fragCoord = vertTexCoord;
  texCoord = vertTexCoord * texelSize; // normalize

  texCoordXmY0 = texCoord + vec2(-texelSize.x, 0.0);
  texCoordXpY0 = texCoord + vec2(texelSize.x, 0.0);
  texCoordX0Yp = texCoord + vec2(0.0, texelSize.y);
  texCoordX0Ym = texCoord + vec2(0.0, -texelSize.y);

  texCoordXmYp = texCoord + vec2(-texelSize.x, texelSize.y);
  texCoordXpYm = texCoord + vec2(texelSize.x, -texelSize.y);

  // Extended radius coordinates
  texCoordXm2Y0 = texCoord + vec2(-2.0 * texelSize.x, 0.0);
  texCoordXp2Y0 = texCoord + vec2(2.0 * texelSize.x, 0.0);
  texCoordX0Yp2 = texCoord + vec2(0.0, 2.0 * texelSize.y);
  texCoordX0Ym2 = texCoord + vec2(0.0, -2.0 * texelSize.y);
  texCoordXm3Y0 = texCoord + vec2(-3.0 * texelSize.x, 0.0);
  texCoordXp3Y0 = texCoord + vec2(3.0 * texelSize.x, 0.0);
  texCoordX0Yp3 = texCoord + vec2(0.0, 3.0 * texelSize.y);
  texCoordX0Ym3 = texCoord + vec2(0.0, -3.0 * texelSize.y);

    gl_Position = vec4(vertPosition, 0.0, 1.0);
}