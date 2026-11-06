const assert = require('assert');
const fs = require('fs');
const path = require('path');

const boundaryShader = fs.readFileSync(path.join(__dirname, '..', 'shaders', 'fragment', 'boundaryShader.frag'), 'utf8');
const commonGlsl = fs.readFileSync(path.join(__dirname, '..', 'shaders', 'common.glsl'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

assert.ok(!boundaryShader.includes('latitudeBasedTemperature != 0'), 'boundary shader must not relax temperatures toward a latitude climate value');
assert.ok(!boundaryShader.includes('climateTempC'), 'boundary shader must not read a climate target temperature');
assert.ok(!/realTemp\s*-\s*1\.0\)/.test(boundaryShader), 'air over water must not be biased 1 K colder than the water');
assert.ok(!boundaryShader.includes('!isLiquidWaterType(wall[TYPE]) && wall[TYPE] != WALLTYPE_ICE'), 'air columns over water / ice must still get infrared heating and cooling');
assert.ok(/#define waterHeatExchangeRate 0\.0002\b/.test(commonGlsl), 'water / air heat exchange should match the original sandbox rate');
assert.ok(/#define waterHeatCapacity 50\.0\b/.test(commonGlsl), 'water heat capacity should match the original sandbox');
assert.ok(boundaryShader.includes('(LocalWaterTemperature - realTemp) / influenceDevider * waterHeatExchangeRate'), 'air over water should exchange heat with the water at the same rate the water uses');
assert.ok(boundaryShader.includes('(airTemperature - base[TEMPERATURE]) * waterHeatExchangeRate'), 'water should exchange heat with the air above');
assert.ok(/waterEvaporation, 0\.\) \* evapHeat \* 0\.5/.test(boundaryShader), 'water evaporative cooling should match the original sandbox (half latent heat)');
assert.ok(boundaryShader.includes('netWaterHeating / waterHeatCapacity * waterTempUpdateInterval'), 'fresh and salt water should share the original surface budget');
assert.ok(!/oceanHeatCapacity|lakeHeatCapacity/.test(boundaryShader), 'fresh and salt water should use the same heat capacity');
assert.ok(!appSource.includes("'cellHeightM'"), 'boundary shader no longer needs the cell height uniform');
assert.ok(boundaryShader.includes('REF_THETA'), 'buoyancy must use the locked climate temperature');
assert.ok(boundaryShader.includes('buoyancyReferenceT(envY0)'), 'gravity must use the current environmental temperature, not the startup profile');
assert.ok(!boundaryShader.includes('climateRestoreRate'), 'daylight heating must not be cancelled by a row-mean climate restore');
assert.ok(boundaryShader.includes('base[TEMPERATURE] += lightPower * lightEffectScale'), 'sunlight must heat the surface air');
assert.ok(commonGlsl.includes('#define REF_THETA 3'), 'the reference profile must carry the climate potential temperature');
assert.ok(/paintedReal/.test(fs.readFileSync(path.join(__dirname, '..', 'shaders', 'fragment', 'advectionShader.frag'), 'utf8')), 'the temperature brush must drop vapor that no longer fits, without latent heat');

console.log('Temperature forcing regression test passed');
