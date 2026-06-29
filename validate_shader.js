const fs = require('fs');
const b = fs.readFileSync('shaders/fragment/boundaryShader.frag','utf8').split(/\r?\n/);
const c = fs.readFileSync('shaders/common.glsl','utf8').split(/\r?\n/);
const out = [];
for(const line of b){ if(line.trim() === '#include "common.glsl"'){ out.push(...c); } else { out.push(line); } }
const src = out.join('\n');
const glslang = require('@webgpu/glslang');
const G = glslang();
try {
  G.compileGLSL(src, 'fragment');
  console.log('VALID');
} catch (e) {
  console.error('ERROR', e.message);
}
