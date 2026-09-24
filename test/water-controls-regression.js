const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
const boundaryShaderPath = path.join(__dirname, '..', 'shaders', 'fragment', 'boundaryShader.frag');
const advectionShaderPath = path.join(__dirname, '..', 'shaders', 'fragment', 'advectionShader.frag');

const appSource = fs.readFileSync(appPath, 'utf8');
const boundaryShader = fs.readFileSync(boundaryShaderPath, 'utf8');
const advectionShader = fs.readFileSync(advectionShaderPath, 'utf8');

assert.ok(appSource.includes('freshwaterFreezePointC') && appSource.includes('saltwaterFreezePointC'), 'app.js should expose freshwater and saltwater freeze-point controls');
assert.ok(boundaryShader.includes('freshwaterFreezePointC') && boundaryShader.includes('saltwaterFreezePointC'), 'boundary shader should read freshwater and saltwater freeze-point uniforms');
assert.ok(advectionShader.includes('maxWaterTemperatureC') && boundaryShader.includes('maxWaterTemperatureC'), 'water shaders should use a configurable max water temperature');
assert.ok(appSource.includes('enableGlacierFormation') && appSource.includes('enableGlacierMelting'), 'app.js should expose glacier formation and melting toggles');
assert.ok(advectionShader.includes('enableGlacierFormation'), 'advection shader should gate glacier formation');
assert.ok(boundaryShader.includes('enableGlacierMelting'), 'boundary shader should gate glacier melting');
assert.ok(appSource.includes('maxSnowAccumulationCm'), 'app.js should expose max snow accumulation control');
assert.ok(boundaryShader.includes('maxSnowAccumulationCm'), 'boundary shader should clamp land snow with maxSnowAccumulationCm');
assert.ok(!boundaryShader.includes('4000.0); // snow accumulation'), 'boundary shader should not hardcode the land snow accumulation cap');
assert.ok(appSource.includes('maxSoilMoisture'), 'app.js should expose max soil moisture control');
assert.ok(boundaryShader.includes('maxSoilMoisture'), 'boundary shader should use maxSoilMoisture uniform');
assert.ok(advectionShader.includes('maxSoilMoisture'), 'advection shader should use maxSoilMoisture uniform');
assert.ok(!boundaryShader.includes('min(M + 1.0, 50.0)'), 'boundary shader should not cap evaporation soil-moisture factor at 50');
assert.ok(boundaryShader.includes('rainEvent'), 'boundary shader should flood from rainfall frequency events');
assert.ok(!boundaryShader.includes('rainOver * max(floodPondRate'), 'boundary shader should not pond flood from rainfall intensity totals');

console.log('Water controls regression test passed');
