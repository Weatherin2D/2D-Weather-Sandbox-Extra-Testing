const fs = require('fs');
const glslang = require('@webgpu/glslang');
const G = glslang();

function load(p) {
  return fs.readFileSync(p, 'utf8');
}

function compile(name, fragPath, includes) {
  let src = load(fragPath);
  for (const [inc, path] of Object.entries(includes)) {
    src = src.split(`#include "${inc}"`).join(load(path));
  }
  try {
    G.compileGLSL(src, 'fragment');
    console.log(name + ': OK');
  } catch (e) {
    console.error(name + ': FAIL', e.message);
    process.exitCode = 1;
  }
}

compile('lightningSummary', 'shaders/fragment/lightningSummaryShader.frag', {
  'common.glsl': 'shaders/common.glsl',
});
compile('lightningDebug', 'shaders/fragment/lightningDebugShader.frag', {});
compile('realisticDisplay', 'shaders/fragment/realisticDisplayShader.frag', {
  'common.glsl': 'shaders/common.glsl',
  'commonDisplay.glsl': 'shaders/commonDisplay.glsl',
  'lightningV2.glsl': 'shaders/fragment/lightningV2.glsl',
});
