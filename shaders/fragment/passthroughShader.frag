#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 texCoord;
uniform sampler2D tex;
out vec4 fragmentColor;

void main()
{
  fragmentColor = texture(tex, texCoord);
}
