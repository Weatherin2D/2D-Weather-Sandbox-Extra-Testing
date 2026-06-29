#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform vec2 aspectRatios;
uniform vec3 view;

uniform sampler2D lightTex;
uniform sampler2D planeTex;
uniform sampler2D planeGearTex;

uniform sampler2D ambientLightTex;

uniform float minShadowLight;
uniform float starVisibility;
uniform float starLightEmitStrength;
uniform float starDensity;
uniform float sunAngle;
uniform float timeOfDay;
uniform float month;

uniform float skyHorizonLine;
uniform float skyDayHue;
uniform float skyDaySatLow;
uniform float skyDaySatHigh;
uniform float skyDayValLow;
uniform float skyDayValHigh;
uniform float skyDayValPow;
uniform vec3 skyTwilightTop;
uniform vec3 skyTwilightUpper;
uniform vec3 skyTwilightMid;
uniform vec3 skyTwilightLow;
uniform vec3 skyTwilightHorizon;
uniform vec3 skyHorizonDeepRed;
uniform vec3 skyHorizonBurntOrange;
uniform vec3 skyHorizonGold;
uniform vec3 skyHorizonPaleGold;
uniform vec3 skyCrepuscularColor;
uniform float skyCrepuscularStrength;
uniform float skySunHorizAmplitude;
uniform float skySunVertScale;
uniform float skyHazeMixStrength;
uniform float skyHazeBoostStrength;

uniform float iterNum;

uniform float simHeight;

uniform vec2 planeDirectionAndGearPos;

uniform vec3 planePos;

out vec4 fragmentColor;

float light;

vec3 ambientLight;

const float dryLapse = 0.; // definition needed for common.glsl
#include "common.glsl"

#include "commonDisplay.glsl"

vec4 displayA380(vec2 pos, float angle, out vec3 emittedLight, out vec3 onLight)
{
  vec2 planeTexCoord = texCoord;

  bool planeDir = planeDirectionAndGearPos[0] == 1.; // true = left, false = right

  planeTexCoord.x -= mod(pos.x, 1.);
  // planeTexCoord.x = realMod(planeTexCoord.x, 1.0);
  planeTexCoord.y -= pos.y;
  float cellHeight = simHeight / resolution.y;

  float scaleMult = 60.0 / cellHeight; // 6000

  planeTexCoord.x *= scaleMult * aspectRatios.x;
  planeTexCoord.y *= -scaleMult;

  // planeTexCoord.y -= 0.7;

  // rotate

  float sin_factor = sin(angle);
  float cos_factor = cos(angle);

  planeTexCoord = vec2(planeTexCoord.x, planeTexCoord.y) * mat2(cos_factor, sin_factor, -sin_factor, cos_factor);

  planeTexCoord *= 0.15;              // scale
  planeTexCoord *= vec2(500., 1000.); // Aspect ratio

  planeTexCoord += vec2(0.5, 0.6);    // center rotation point


  if (planeTexCoord.x < 0.01 || planeTexCoord.x > 1.01 || planeTexCoord.y < 0.01 || planeTexCoord.y > 1.01) // prevent edge effect when mipmapping
    return vec4(0);

  vec2 gearTexCoord = vec2(planeDir ? planeTexCoord.x - 0.10 : 0.90 - planeTexCoord.x, (planeTexCoord.y - 0.46 + planeDirectionAndGearPos[1] * 0.01)) * 2.0;

  vec4 outputCol = texture(planeTex, planeTexCoord);

  vec2 planeFragCoord = planeTexCoord * vec2(1000., 500.);

  float T = mod(iterNum, 60.) / 60.;

  emittedLight += (planeDir ? vec3(1., 0., 0.) : vec3(0., 1., 0.)) * 5. * max(3. - length(planeFragCoord - vec2(planeDir ? 611. : 391., 287.)), 0.);      // wing red/green continuous light
  emittedLight += vec3(1., 1., 1.) * 5. * max(3. - length(planeFragCoord - vec2(planeDir ? 861. : 138., 286.)), 0.);                                      // Tail white continuous light

  emittedLight += vec3(1., 0., 0.) * 20. * max(7. - length(planeFragCoord - vec2(planeDir ? 341. : 659., 256.)), 0.) * ((T > 0.5 && T < 0.55) ? 1. : 0.); // red beacon light top

  emittedLight += vec3(1., 0., 0.) * 10. * max(5. - length(planeFragCoord - vec2(planeDir ? 460. : 540., 347.)), 0.) * ((T > 0.5 && T < 0.55) ? 1. : 0.); // red beacon light bottem

  emittedLight +=
    vec3(0.50, 0.65, 1.) * 30. * max(7. - length(planeFragCoord - vec2(planeDir ? 611. : 387., 287.)), 0.) * (((T > 0.0 && T < 0.05) || (T > 0.10 && T < 0.15)) ? 1. : 0.); // white wing beacon light

  emittedLight += vec3(1., 1., 1.) * 20. * max(7. - length(planeFragCoord - vec2(planeDir ? 861. : 138., 286.)), 0.) * ((T > 0.0 && T < 0.05) ? 1. : 0.);                   // Tail white beacon light


  float planeCenterLight = texture(lightTex, pos)[0]; // W/m2

  if (planeCenterLight < 100.0) {                     // if dark

                                                      // logo lights:
    onLight += vec3(1., 1., 1.) * (1. - smoothstep(0.0, 130.0, length(planeFragCoord - vec2(planeDir ? 800. : 210., 170.)))); // Tail logo

    // landing lights:
    if (planeDirectionAndGearPos[1] < 2.0) {                                                                                   // gear extended
      emittedLight += vec3(0.8, 0.9, 1.0) * 30. * max(3. - length((planeFragCoord - vec2(planeDir ? 170. : 836., 350.))), 0.); // Front gear landing light

      emittedLight += vec3(0.8, 0.9, 1.0) * 30. * max(3. - length((planeFragCoord - vec2(planeDir ? 336. : 660., 323.))), 0.); // Wing landing light

      onLight += vec3(1., 1., 1.) * 0.9 * (1. - smoothstep(0.0, 150.0, length(planeFragCoord - vec2(planeDir ? 220. : 770., 400.))));
    }
  }

  if (outputCol.a < 0.5)
    outputCol += texture(planeGearTex, gearTexCoord);

  onLight *= outputCol.a; // only shine on plane itself
  return outputCol;
}

// Screen-space disc (fixed in sky, does not pan with camera)
float celestialDisc(vec2 uv, vec2 center, float radius, float softness)
{
  vec2 d = uv - center;
  d.x *= aspectRatios.x;
  return 1.0 - smoothstep(radius - softness, radius + softness, length(d));
}

vec2 sunLocalCoord(vec2 uv, vec2 center)
{
  vec2 d = uv - center;
  d.x *= aspectRatios.x;
  return d;
}

// Smooth gaussian glow (no stepped rings)
float smoothSunGlow(vec2 uv, vec2 center, float radius, float sharpness)
{
  float d = length(sunLocalCoord(uv, center));
  return exp(-pow(d / max(radius, 1e-5), 2.0) * sharpness);
}

// Daytime yellow-white sun with starburst rays; clips at horizon for gradual rise/set
vec3 renderSun(vec2 uv, vec2 center, float scatter, float horizonLine, out float emit)
{
  vec2 d = sunLocalCoord(uv, center);
  float dist = length(d);
  float angle = atan(d.y, d.x);
  float horizonClip = smoothstep(horizonLine - 0.001, horizonLine + 0.001, uv.y);

  // Warm gold palette — keep saturation, avoid clipping to white.
  vec3 coreWhite = vec3(1.0, 0.94, 0.72);
  vec3 warmYellow = vec3(0.98, 0.78, 0.38);
  vec3 haloYellow = vec3(0.95, 0.68, 0.28);
  vec3 sunTint = mix(vec3(0.96, 0.82, 0.48), sunColor(scatter), scatter * 0.85);

  float core = smoothSunGlow(uv, center, 0.007, 3.0);
  float innerGlow = smoothSunGlow(uv, center, 0.016, 1.5);
  float outerGlow = smoothSunGlow(uv, center, 0.038, 0.6);

  // Starburst: long + short rays with varying length
  float rays12 = pow(abs(sin(angle * 6.0)), 28.0);
  float rays8 = pow(abs(cos(angle * 4.0 + 0.4)), 22.0);
  float raySeed = fract(sin(floor(angle * 7.64 + 10.0) * 127.1) * 43758.5453);
  float rayLen = mix(0.55, 1.0, raySeed);
  float rayBand = smoothstep(0.07 * rayLen, 0.0, dist) * (1.0 - smoothstep(0.012, 0.028, dist));
  float starburst = (rays12 * 0.85 + rays8 * 0.45) * rayBand;

  vec3 sunsetCore = mix(vec3(0.98, 0.86, 0.55), vec3(0.95, 0.58, 0.18), scatter);
  vec3 sunLit = sunsetCore * core * 2.2;
  sunLit += mix(warmYellow, sunTint, scatter * 0.5) * innerGlow * 1.05;
  sunLit += mix(haloYellow, vec3(0.92, 0.42, 0.10), scatter) * outerGlow * 0.55;
  sunLit += mix(warmYellow, sunTint, scatter * 0.65) * starburst * 1.15;

  emit = (core * 2.6 + innerGlow * 0.75 + starburst * 0.55 + outerGlow * 0.22) * horizonClip;
  return sunLit * horizonClip;
}

vec3 renderMoon(vec2 uv, vec2 center, float phase, out float emit)
{
  vec2 p = uv - center;
  p.x *= aspectRatios.x;
  float dist = length(p);
  const float radius = 0.016;
  if (dist > radius + 0.004)
    return vec3(0.0);

  float nx = p.x / radius;
  float terminator = -cos(phase * 6.2831853) * 1.05;
  float lit = smoothstep(terminator - 0.1, terminator + 0.1, nx);

  float edge = 1.0 - smoothstep(radius - 0.002, radius + 0.002, dist);
  vec3 litCol = vec3(0.92, 0.93, 0.98);
  vec3 darkCol = vec3(0.10, 0.11, 0.16);
  vec3 moonCol = mix(darkCol, litCol, lit) * edge;
  float glow = celestialDisc(uv, center, 0.028, 0.008) * lit * 0.25;
  moonCol += litCol * glow;
  emit = (lit * edge + glow) * 0.35;
  return moonCol;
}


void main()
{
  vec2 lightTexCoord = vec2(texCoord.x, min(texCoord.y + texelSize.y * 0.5, 1.0 - texelSize.y)); // limit vertical sample position to top of simulation

  light = smoothSunlightSample(lightTex, lightTexCoord, texelSize, 1.0) / standardSunBrightness;
  ambientLight = texture(ambientLightTex, texCoord).rgb;

  // vec3 topBackgroundCol = vec3(0.0, 0.0, 0.0);      // 0.15 dark blue
  // vec3 bottemBackgroundCol = vec3(0.20, 0.66, 1.0); // vec3(0.35, 0.58, 0.80) milky white blue
  // vec3 bottemBackgroundCol = vec3(0.40, 0.76, 1.0); // vec3(0.35, 0.58, 0.80) milky white blue

  // vec3 mixedCol = mix(bottemBackgroundCol, topBackgroundCol, clamp(pow(texCoord.y * 0.35, 0.5), 0., 1.)); // 0.2

  // vec3 mixedCol = mix(bottemBackgroundCol, topBackgroundCol, clamp(texCoord.y, 0., 1.)); // 0.2


  float horizonLine = skyHorizonLine;

  float hourAngleRad = (timeOfDay - 12.0) * 15.0 * deg2rad;
  float sunElevRad = PI * 0.5 - sunAngle;
  float sunHoriz = 0.5 + skySunHorizAmplitude * sin(hourAngleRad);
  float sunVert = horizonLine + skySunVertScale * sin(clamp(sunElevRad, -PI * 0.5, PI * 0.5));
  vec2 sunCenter = vec2(sunHoriz, sunVert);
  float scatter = clamp(map_range(sunAngle, 75.0 * deg2rad, 90.0 * deg2rad, 0.0, 1.0), 0.0, 1.0);
  float sunRiseAmount = sunVert - horizonLine;
  float sunAngleRad = abs(sunAngle);
  const float SUN_DISC_RADIUS = 0.036;
  float sunDiscVis = smoothstep(-SUN_DISC_RADIUS * 1.12, SUN_DISC_RADIUS * 0.10, sunRiseAmount);
  float sunVisibility = (1.0 - smoothstep(1.30, 1.55, sunAngleRad)) * sunDiscVis;
  bool isMorning = timeOfDay < 12.0;

  float sat = map_rangeC(texCoord.y, 0., 2.5, skyDaySatLow, skyDaySatHigh);
  float val = pow(map_rangeC(texCoord.y, 0., 3.2, skyDayValLow, skyDayValHigh), skyDayValPow);
  vec3 daySky = hsv2rgb(vec3(skyDayHue, sat, val));

  float skyHeight = clamp((texCoord.y - horizonLine) / max(1.0 - horizonLine, 0.01), 0.0, 1.0);

  float twilightAmt = 0.0;
  if (isMorning) {
    twilightAmt = max(
      smoothstep(0.03, 0.16, sunRiseAmount) * (1.0 - smoothstep(0.16, 0.38, sunRiseAmount)),
      smoothstep(1.32, 1.50, abs(sunAngle)) * smoothstep(0.02, 0.10, sunRiseAmount) * 0.85);
  } else {
    twilightAmt = smoothstep(0.05, 0.48, scatter) * (1.0 - smoothstep(0.04, 0.30, sunRiseAmount));
    twilightAmt = max(twilightAmt, smoothstep(1.22, 1.50, abs(sunAngle)) * smoothstep(0.02, 0.14, sunRiseAmount));
  }
  twilightAmt = clamp(twilightAmt, 0.0, 1.0);

  // Blue above, warm gold at horizon — skip desaturated purple/grey mid-tones.
  vec3 horizonWarm = mix(skyTwilightHorizon, skyHorizonGold, clamp(scatter * 0.95, 0.0, 1.0)) * 0.78;
  vec3 twilightSky = mix(horizonWarm, skyTwilightLow * 0.82, smoothstep(0.0, 0.20, skyHeight));
  twilightSky = mix(twilightSky, daySky, smoothstep(0.08, 0.52, skyHeight));

  vec2 relSun = texCoord - vec2(sunHoriz, horizonLine + 0.04);
  relSun.x *= aspectRatios.x;
  float sunWarmth = exp(-length(relSun) * 2.2) * (0.35 + scatter * 0.30);
  twilightSky = mix(twilightSky, vec3(0.88, 0.62, 0.24), sunWarmth * twilightAmt * 0.55);

  vec3 mixedCol = mix(daySky, twilightSky, smoothstep(0.0, 0.82, twilightAmt));

  // Star field - only visible at night (sun below horizon)
  vec3 starColor = vec3(0.0);
  vec3 starLight = vec3(0.0);
  // Only show stars when sun is below horizon (night time), not just in dark shadows
  bool isNightTime = sunAngleRad > 1.4;
  float twilightZone = smoothstep(1.3, 1.6, sunAngleRad); // Gradual fade during twilight (75 to 92 degrees)
  
  if (starVisibility > 0.0 && isNightTime) {
    float nightFactor = twilightZone;
    
    // Fade out stars near the surface (bottom of screen)
    float surfaceFade = smoothstep(0.0, 0.2, texCoord.y);
    
    // Generate pseudo-random star positions on a fixed grid
    // Stars should pan with the world (move with camera), like weather stations/radars
    // Convert screen texCoord to world coordinates
    // view.xy = camera position (range -1 to 1), view.z = zoom
    vec2 centeredCoord = (texCoord - 0.5) / view.z;           // offset from center, scaled by zoom
    vec2 worldPos = centeredCoord + vec2(view.x * 0.5, view.y * 0.5 * aspectRatios.y); // add camera position
    
    // Snap to a fixed grid so stars stay at consistent world positions
    // Grid cell size in normalized world coordinates
    float gridSize = 0.008;
    vec2 gridPos = floor(worldPos / gridSize) * gridSize + gridSize * 0.5;
    
    // Hash based on fixed grid position - same grid cell always gives same star
    vec2 starSeed = gridPos * 1000.0;
    float starRand1 = fract(sin(dot(starSeed, vec2(12.9898, 78.233))) * 43758.5453);
    float starRand2 = fract(sin(dot(starSeed + 100.0, vec2(39.346, 57.123))) * 23421.1234);
    float starRand3 = fract(sin(dot(starSeed + 200.0, vec2(73.456, 12.789))) * 12345.6789);
    
    // Only render stars at certain grid positions based on density
    // starDensity 0 = no stars, 1 = many stars
    // Map 0-1 to threshold range 0.999 (few stars) to 0.98 (many stars)
    float densityThreshold = mix(0.999, 0.97, starDensity);
    if (starRand1 > densityThreshold) {
      // Star size (0.0 to 1.0, weighted toward smaller stars)
      float starSize = pow(starRand2, 3.0);
      
      // Calculate actual star center position in screen space for this grid cell
      // Subtract camera offset and multiply by zoom to get screen position
      vec2 starScreenPos = (gridPos - vec2(view.x * 0.5, view.y * 0.5 * aspectRatios.y)) * view.z + 0.5;
      
      // Distance from current pixel to star center (accounting for aspect ratio)
      vec2 distVec = (texCoord - starScreenPos);
      distVec.x *= aspectRatios.x; // Correct for aspect ratio to make stars circular
      float dist = length(distVec);
      
      // Star radius in screen space (very small point)
      float starRadius = 0.001 + starSize * 0.002;
      
      // Only render if within star radius (creates circular point star)
      if (dist < starRadius) {
        // Twinkling speed varies by star
        float twinkleSpeed = 0.05 + starRand3 * 0.15;
        float twinkle = sin(iterNum * twinkleSpeed + starRand1 * 100.0) * 0.5 + 0.5;
        twinkle = pow(twinkle, 2.0 + starSize * 2.0);
        
        // Brightness based on size, distance from center (soft edge), and twinkling
        float edgeSoftness = smoothstep(starRadius, 0.0, dist);
        float starBrightness = (starSize * 2.0 + 0.5) * edgeSoftness;
        starBrightness *= twinkle;
        starBrightness *= starVisibility * nightFactor * surfaceFade;
        
        // Star color variation (slight blue/white tint)
        vec3 starTint = mix(vec3(1.0, 1.0, 0.95), vec3(0.85, 0.9, 1.0), starRand3);
        starColor = starTint * starBrightness;
        
        // Bigger stars emit more light, controlled by starLightEmitStrength
        starLight = starTint * starSize * starLightEmitStrength * starVisibility * nightFactor * surfaceFade * twinkle * edgeSoftness;
      }
    }
    
    // Add stars to the sky background (mixedCol) so they're behind all objects
    mixedCol += starColor;
  }

  float moonElevRad = clamp(sunAngle - PI * 0.5, 0.0, PI * 0.5);
  float moonHoriz = 0.5 + skySunHorizAmplitude * sin(hourAngleRad + PI);
  float moonVert = horizonLine + skySunVertScale * sin(moonElevRad);
  vec2 moonCenter = vec2(moonHoriz, moonVert);

  float moonVisibility = smoothstep(1.18, 1.42, sunAngleRad) * smoothstep(0.0, 0.04, moonElevRad);

  // Horizon haze color phase: sunrise red→gold→white; sunset white→gold→red
  float yAbove = max(texCoord.y - horizonLine, 0.0);
  float horizonBand = exp(-pow(yAbove / 0.12, 2.0) * 0.7);
  float sunProximity = exp(-pow((texCoord.x - sunHoriz) * 1.2, 2.0));
  float bandMask = horizonBand * (0.55 + sunProximity * 0.45);

  vec3 deepRed = skyHorizonDeepRed;
  vec3 burntOrange = skyHorizonBurntOrange;
  vec3 gold = skyHorizonGold;
  vec3 paleGold = skyHorizonPaleGold;
  vec3 hazeCol;
  float hazeBoost = 0.0;

  if (isMorning) {
    float riseT = smoothstep(0.02, 0.20, sunRiseAmount);
    hazeCol = mix(deepRed, mix(gold, paleGold, smoothstep(0.08, 0.18, sunRiseAmount)), riseT);
    hazeBoost = max(smoothstep(0.0, 0.08, sunRiseAmount), (1.0 - smoothstep(0.10, 0.30, sunRiseAmount)) * smoothstep(0.04, 0.14, sunRiseAmount));
  } else {
    float setT = 1.0 - smoothstep(0.05, 0.26, sunRiseAmount);
    hazeCol = mix(paleGold, mix(gold, mix(burntOrange, deepRed, smoothstep(0.25, 1.0, setT)), smoothstep(0.0, 0.5, setT)), smoothstep(0.0, 0.4, setT));
    hazeBoost = smoothstep(0.02, 0.92, scatter) * (1.0 - smoothstep(0.02, 0.32, sunRiseAmount));
    hazeBoost = max(hazeBoost, smoothstep(1.24, 1.50, sunAngleRad) * smoothstep(0.02, 0.14, sunRiseAmount));
  }

  float hazeStrength = clamp(twilightAmt * 0.85 + hazeBoost * bandMask, 0.0, 1.0);
  hazeStrength *= smoothstep(0.18, 0.55, scatter + twilightAmt * 0.35);
  mixedCol = mix(mixedCol, hazeCol * 0.80, hazeStrength * skyHazeMixStrength * 0.72);
  mixedCol += hazeCol * bandMask * hazeBoost * sunProximity * skyHazeBoostStrength * 0.38 * smoothstep(0.22, 0.60, scatter + twilightAmt * 0.3);

  // Crepuscular rays from sun (reference photo god-rays)
  if (twilightAmt > 0.15 || scatter > 0.3) {
    vec2 rel = texCoord - sunCenter;
    rel.x *= aspectRatios.x;
    float dist = length(rel);
    float ang = atan(rel.y, rel.x);
    float rays = 0.0;
    rays += pow(max(cos(ang * 4.0 + 0.2), 0.0), 18.0);
    rays += pow(max(cos(ang * 7.0 - 0.5), 0.0), 22.0) * 0.6;
    rays *= exp(-dist * 1.6) * smoothstep(horizonLine + 0.08, 0.45, texCoord.y);
    float rayStrength = clamp(twilightAmt + scatter * 0.5, 0.0, 1.0) * sunVisibility;
    mixedCol += skyCrepuscularColor * rays * rayStrength * skyCrepuscularStrength * 0.55;
  }
  float sunEmitStrength = 0.0;
  float moonEmitStrength = 0.0;
  vec3 celestialCol = vec3(0.0);
  vec3 celestialEmit = vec3(0.0);

  vec3 sunSkyGlow = vec3(0.0);
  if (sunVisibility > 0.001) {
    vec3 sunCol = renderSun(texCoord, sunCenter, scatter, horizonLine, sunEmitStrength);
    celestialCol += sunCol * sunVisibility;
    celestialEmit += vec3(0.92, 0.72, 0.38) * sunEmitStrength * sunVisibility * 0.65;
    float setBlend = 1.0 - smoothstep(0.04, 0.24, sunRiseAmount);
    vec3 glowTint = isMorning
      ? mix(vec3(0.95, 0.30, 0.10), vec3(0.92, 0.72, 0.38), smoothstep(0.02, 0.14, sunRiseAmount))
      : mix(vec3(0.92, 0.72, 0.38), vec3(0.95, 0.42, 0.12), smoothstep(0.1, 0.85, setBlend));
    float aboveHorizon = smoothstep(horizonLine + 0.008, horizonLine + 0.04, texCoord.y);
    float skyGlow = smoothSunGlow(texCoord, sunCenter, 0.06, 0.65) * sunVisibility * (0.18 + scatter * 0.42);
    skyGlow *= aboveHorizon;
    float wideGlow = exp(-pow(max(texCoord.y - horizonLine, 0.0) / 0.28, 2.0) * 0.35);
    wideGlow *= aboveHorizon * exp(-pow(abs(texCoord.x - sunHoriz) * 1.8, 2.0) * 0.25);
    wideGlow *= sunVisibility * 0.14;
    sunSkyGlow = glowTint * (skyGlow + wideGlow) * 0.58;
  }

  if (moonVisibility > 0.001) {
    float moonPhase = fract((month - 1.0) * 30.44 / 29.53);
    vec3 moonCol = renderMoon(texCoord, moonCenter, moonPhase, moonEmitStrength);
    celestialCol += moonCol * moonVisibility;
    celestialEmit += vec3(0.85, 0.88, 0.95) * moonEmitStrength * moonVisibility;
  }

  vec3 celestialLight = celestialEmit;

  vec3 airplaneLights;

  vec3 airplaneOnLight;

  vec4 A380Col = displayA380(planePos.xy, planePos.z, airplaneLights, airplaneOnLight);

  mixedCol *= 1.0 - A380Col.a;
  mixedCol += A380Col.rgb * A380Col.a;

  float horizonWarmth = scatter * (1.0 - smoothstep(0.04, 0.50, skyHeight));
  vec3 sunlitTint = mix(vec3(1.0), vec3(0.90, 0.68, 0.36), horizonWarmth * 0.48);
  vec3 finalColor = mixedCol * (light + minShadowLight + airplaneOnLight) * sunlitTint;

  float shadowLit = max(smoothstep(0.06, 0.28, light), scatter * 0.50);
  // Sun/moon are additive so they stay bright and sit behind clouds (drawn in this pass before terrain)
  finalColor += sunSkyGlow * shadowLit;
  finalColor += celestialCol * shadowLit;
  finalColor += starLight;
  finalColor += celestialLight * shadowLit;

  float airDensityFactor = clamp(1.0 - texCoord.y, 0., 1.);

  finalColor += ambientLight * 0.1 * airDensityFactor * shadowLit / standardSunBrightness;

  finalColor += airplaneLights;

  // Soft cap warm highlights so sunset yellows do not clip to white.
  float warmLum = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
  float warmCap = mix(1.15, 0.82, clamp(scatter + twilightAmt * 0.5, 0.0, 1.0));
  if (warmLum > warmCap)
    finalColor *= warmCap / warmLum;

  fragmentColor = vec4(finalColor, 1.0);
}