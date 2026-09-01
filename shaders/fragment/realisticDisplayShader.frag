#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;    // pixel
in vec2 texCoord;     // this normalized

in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

in vec2 onScreenUV;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;
uniform sampler2D noiseTex;
uniform sampler2D surfaceTextureMap;
uniform sampler2D customSurfaceAtlas;
uniform sampler2D curlTex;
uniform sampler2D dropletSizeTex;
uniform sampler2D lightningTex;
uniform sampler2D lightningDataTex;

uniform sampler2D ambientLightTex;
uniform sampler2D lightningOnLightTex;
uniform sampler2D lightningCloudFlashTex;
uniform sampler2D lightningSurfFlashTex;
uniform sampler2D sunColumnTex;
uniform sampler2D smokeTex;

uniform int ltUseIllumTexture;

uniform vec2 aspectRatios; // [0] Sim       [1] canvas

#define URBAN 0
#define FIRE_FOREST 1
#define SNOW_FOREST 2
#define FOREST 3
#define INDUS 4
#define FOREST2 5
#define AMER_SUBURBAN 6


uniform vec2 resolution; // sim resolution
uniform vec2 texelSize;

uniform float cellHeight; // in meters

uniform float dryLapse;
uniform float sunAngle;

uniform float minShadowLight;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // Xpos   Ypos  Size   type

uniform float displayVectorField;
uniform int enableRainbows;
uniform float smoothClouds;
uniform float floodVizStrength;
uniform float fogHazeStrength;

uniform float iterNum;
uniform float visualQuality;

uniform int ltUseLegacyStyle;

// Shader Menu - clouds / rain shafts / lightning harmony (display-only)
uniform vec3 cloudBrightTint;
uniform vec3 cloudDarkTint;
uniform vec3 rainShaftTint;
uniform vec3 snowShaftTint;
uniform float cloudLightResponse;
uniform float cloudShadowStrength;
uniform float shaftBacklight;
uniform float cloudDensityScale;
uniform float cloudOpacityMult;
uniform float rainOpacityMult;
uniform float cloudSoftness;
uniform float shaftSpecular;
uniform float skyReflectAmount;
uniform float refractDistort;
uniform float rainbowStrength;
uniform float lightningCloudFill;
// 0 Fast, 1 Balanced, 2 Full — SDF bolt quality / cost.
uniform float ltSdfQuality;
// 0 = cloud fill only; 1 = draw Enhanced SDF bolts.
uniform int ltDrawBolts;
// 0 = lightning disabled entirely (no bolts, no fill).
uniform int ltEnableLightning;
uniform float lightningShaftGlow;
uniform float sheetFlashMix;
uniform float lightningTintMode; // 0=neutral 1=matchClouds 2=custom
uniform vec3 lightningTint;
uniform float flashSoftClip;
uniform float lightningBloomCoupling;

// Intense hail/rain core cast — daytime + cloud-shadow only (guiControls.greenHue*)
uniform float greenHueStartThreshold;
uniform float greenHueEndThreshold;
uniform float greenHueStrength;
uniform float greenHueBrightness;
uniform float greenHueSaturation;
uniform float greenHueHue;

out vec4 fragmentColor;

#include "common.glsl"

#include "commonDisplay.glsl"
#include "cloudVisual.glsl"
#include "lightningV2.glsl"

vec4 base, water;
ivec4 wall;
float lightIntensity;

vec3 color;
float opacity = 1.0;

vec3 emittedLight = vec3(0.); // pure light, like lightning

float shadowLight;

// Daytime severe-core cast (set in computeCloudSmokeColor; applied after lighting so flashes keep the hue)
vec3 precipCoreHue = vec3(1.0);
float precipCoreHueAmt = 0.0;

vec3 onLight; // extra light that lights up objects, just like sunlight and shadowlight
// Lightning cloud/air fill — kept separate so sunset/sunrise chroma is preserved at compose time.
vec3 lightningFillLight = vec3(0.);


const vec3 bareDrySoilCol = pow(vec3(0.85, 0.60, 0.40), vec3(GAMMA));
const vec3 bareWetSoilCol = pow(vec3(0.5, 0.2, 0.1), vec3(GAMMA));
const vec3 greenGrassCol = pow(vec3(0.0, 0.7, 0.2), vec3(GAMMA));
const vec3 dryGrassCol = pow(vec3(0.843, 0.588, 0.294), vec3(GAMMA));


vec4 surfaceTexture(int index, vec2 pos)
{
#define numTextures 7.;             // number of textures in the map
  const float texRelHeight = 1. / numTextures;
  pos.y = clamp(pos.y, 0.01, 0.99); // make sure position is within the subtexture
  pos /= numTextures;
  pos.y += float(index) * texRelHeight;
  return texture(surfaceTextureMap, pos);
}

// customSurfaceAtlas: 8 vertical strips (slot 0..7), same UV convention as surfaceTexture
vec4 customSurfaceTexture(int slot, vec2 pos)
{
#define numCustomTextures 8.
  const float texRelHeight = 1. / numCustomTextures;
  slot = clamp(slot, 0, 7);
  pos.x = fract(pos.x);
  pos.y = clamp(pos.y, 0.01, 0.99);
  pos /= numCustomTextures;
  pos.y += float(slot) * texRelHeight;
  return texture(customSurfaceAtlas, pos);
}


// Flood tint only on land (never lakes/ocean/ice).
bool isFloodTintLandType(int wallType)
{
  return wallType == WALLTYPE_LAND || wallType == WALLTYPE_FIRE
      || wallType == WALLTYPE_URBAN || wallType == WALLTYPE_SUBURBAN || wallType == WALLTYPE_AMERICAN_SUBURBAN
      || wallType == WALLTYPE_INDUSTRIAL || wallType == WALLTYPE_RUNWAY
      || isCustomBase(wallType) || isCustomOverlay(wallType);
}

// Standing flood height (mm) on the land surface only — never underground.
float floodPondingMm()
{
  if (!isFloodTintLandType(wall[TYPE]))
    return 0.0;
  if (wall[DISTANCE] != 0 || wall[VERT_DISTANCE] != 0)
    return 0.0;
  return getFloodHeightMm(water[TOTAL]);
}

// Floodwater mix: ponding mm → depth in metres; 50% at 5 m, 100% at 25 m (depth may exceed 25 m).
// floodVizStrength = Display "Floodwater Opacity" slider (0–1) scales the whole curve.
float floodSheetOpacity(float depth)
{
  if (floodVizStrength <= 0.0)
    return 0.0;
  float floodDepth = floodPondingMm();
  if (floodDepth <= 0.0)
    return 0.0;
  float depthFade = 1.0 - smoothstep(0.0, 1.1, max(depth, 0.0));
  float floodDepthM = floodDepth * 0.001; // mm → metres
  float t = clamp(floodDepthM / floodFullOpacityDepthM, 0.0, 1.0);
  // Choose exponent so (half/full)^k = 0.5
  float k = log(0.5) / log(floodHalfOpacityDepthM / floodFullOpacityDepthM);
  float amount = pow(t, k);
  float a = amount * clamp(floodVizStrength, 0.0, 1.0);
  return clamp(a, 0.0, 1.0) * depthFade;
}

vec3 floodWaterColor()
{
  // Readable water blue under lit/shadowed mixes
  return vec3(0.08, 0.38, 0.62);
}

vec3 getLandColor(float depth)
{
  float vegMoisture = max(water[SUSTAINED_MOISTURE], water[SOIL_MOISTURE] * 0.65);
  vec3 vegetationCol = mix(greenGrassCol, dryGrassCol, max(1.0 - vegMoisture * (1. / fullGreenSoilMoisture), 0.)); // green to brown

  vec3 bareSoilCol = mix(bareDrySoilCol, bareWetSoilCol, map_rangeC(water[SOIL_MOISTURE], 0.0, 20.0, 0.0, 1.0));

  vec3 surfCol = mix(bareSoilCol, vegetationCol, grassBiomass(wall[VEGETATION]) / float(GRASS_VEG_MAX));

  const vec3 rockCol = vec3(0.70);                                 // gray rock

  vec3 color = mix(surfCol, rockCol, clamp(depth * 0.35, 0., 1.)); // * 0.15


  color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;                                   // add noise texture

  color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0)); // mix in white for snow cover

  return color;
}

vec3 getWallColor(float depth)
{
  // Land foundation only — floodwater is applied separately via opacity so it can fade to transparent
  return getLandColor(depth);
}

// Surface helpers (suburban/custom): tint color at full surface depth; caller sets opacity.
vec3 applyFloodTint(vec3 color)
{
  float floodA = floodSheetOpacity(0.0);
  if (floodA <= 0.0)
    return color;
  // Mix over land so shallow water stays see-through
  return mix(color, floodWaterColor(), clamp(floodA, 0.0, 0.92));
}

// Apply floodwater sheet: blend blue over land (amount-based transparency). Land stays visible under shallow ponding.
void applyFloodWaterSheet(float depth)
{
  float floodA = floodSheetOpacity(depth);
  if (floodA <= 0.0)
    return;
  color = mix(color, floodWaterColor(), floodA);
  opacity = 1.0; // surface stays solid; water clarity is the mix ratio, not framebuffer alpha
}

vec3 getIceColor(float iceThickness)
{
  vec3 iceCol = mix(vec3(0.82, 0.88, 0.95), vec3(0.95, 0.98, 1.0), clamp(iceThickness / fullWhiteSnowHeight, 0.0, 1.0));
  iceCol *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.15).rgb;
  if (iceThickness < thinIceBreakupCm)
    iceCol = mix(iceCol, vec3(0.65, 0.75, 0.9), 0.35); // thin, breakable ice looks darker
  return iceCol;
}

#define maxSuburbanBuildingHeight 35. // visual height in meters (2-story gabled homes)
#define suburbanLotWidth 14.0

float suburbanHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float suburbanWorldX(float fragX) { return fragX * cellHeight; }

vec3 getSuburbanGroundColor(float worldX)
{
  float lotX = mod(worldX, suburbanLotWidth);
  float lotIdx = floor(worldX / suburbanLotWidth);
  float h0 = suburbanHash(lotIdx);
  float h1 = suburbanHash(lotIdx + 17.3);

  float houseWidth = suburbanLotWidth * mix(0.58, 0.74, h0);
  float houseOffset = (suburbanLotWidth - houseWidth) * mix(0.12, 0.30, h1);
  float garageW = houseWidth * 0.36;

  vec3 lawnCol = pow(vec3(0.20, 0.56, 0.26), vec3(GAMMA));
  vec3 drivewayCol = pow(vec3(0.68, 0.68, 0.70), vec3(GAMMA));
  vec3 sidewalkCol = pow(vec3(0.76, 0.76, 0.78), vec3(GAMMA));
  vec3 streetCol = pow(vec3(0.26, 0.26, 0.28), vec3(GAMMA));

  if (lotX < 0.8)
    return streetCol;
  if (lotX < 1.6)
    return sidewalkCol;
  if (lotX > houseOffset && lotX < houseOffset + garageW + 0.6)
    return drivewayCol;

  return lawnCol;
}

vec4 suburbanHouseAt(float worldX, float heightAboveGround)
{
  float lotX = mod(worldX, suburbanLotWidth);
  float lotIdx = floor(worldX / suburbanLotWidth);

  float h0 = suburbanHash(lotIdx);
  float h1 = suburbanHash(lotIdx + 17.3);
  float h2 = suburbanHash(lotIdx + 41.7);

  float houseWidth = suburbanLotWidth * mix(0.58, 0.74, h0);
  float houseOffset = (suburbanLotWidth - houseWidth) * mix(0.12, 0.30, h1);
  float localX = lotX - houseOffset;

  vec3 siding;
  int sidingIdx = int(h0 * 4.0);
  if (sidingIdx == 0)
    siding = vec3(0.91, 0.88, 0.84);
  else if (sidingIdx == 1)
    siding = vec3(0.78, 0.80, 0.83);
  else if (sidingIdx == 2)
    siding = vec3(0.86, 0.86, 0.88);
  else
    siding = vec3(0.54, 0.61, 0.69);

  vec3 roofCol = vec3(0.20, 0.20, 0.22);
  vec3 trimCol = vec3(0.94, 0.94, 0.95);
  vec3 garageCol = vec3(0.86, 0.86, 0.88);
  vec3 glassCol = vec3(0.52, 0.64, 0.78);
  vec3 doorCol = vec3(0.42, 0.30, 0.20);

  float suburbanTexHeightNorm = maxSuburbanBuildingHeight / cellHeight;
  float floorH = suburbanTexHeightNorm * 0.36;
  float roofPeakH = suburbanTexHeightNorm * 0.22;
  float totalWallH = floorH * 2.0;
  float totalRoofH = totalWallH + roofPeakH;
  float garageW = houseWidth * 0.36;
  float garageH = floorH * 0.88;

  if (heightAboveGround > totalRoofH || localX < 0.0 || localX > houseWidth)
    return vec4(0.0);

  float ridgeX = houseWidth * 0.5;

  if (heightAboveGround > totalWallH) {
    float roofLocalY = heightAboveGround - totalWallH;
    float maxRoofHalfWidth = (1.0 - roofLocalY / roofPeakH) * houseWidth * 0.5;
    if (abs(localX - ridgeX) > maxRoofHalfWidth)
      return vec4(0.0);
    float shade = localX < ridgeX ? 0.82 : 0.94;
    return vec4(roofCol * shade, 1.0);
  }

  if (heightAboveGround < garageH && localX < garageW) {
    float panelX = fract(localX / garageW * 4.0);
    float panelY = fract(heightAboveGround / garageH * 3.0);
    float panelEdge = step(0.88, panelX) + step(0.88, panelY);
    return vec4(garageCol * mix(1.0, 0.72, clamp(panelEdge, 0.0, 1.0)), 1.0);
  }

  if (abs(heightAboveGround - floorH) < suburbanTexHeightNorm * 0.025)
    return vec4(trimCol, 1.0);

  float winW = houseWidth * 0.13;
  float winH = floorH * 0.34;
  float win1X = garageW + houseWidth * 0.07;
  float win2X = win1X + winW + houseWidth * 0.05;
  float win3X = houseWidth * 0.70;
  float winY1 = floorH * 0.52;
  float winY2 = floorH + floorH * 0.52;

  bool isWindow = false;
  if (heightAboveGround > winY1 - winH * 0.5 && heightAboveGround < winY1 + winH * 0.5) {
    if ((localX > win1X && localX < win1X + winW) || (localX > win2X && localX < win2X + winW))
      isWindow = true;
  }
  if (heightAboveGround > winY2 - winH * 0.5 && heightAboveGround < winY2 + winH * 0.5) {
    if ((localX > win1X && localX < win1X + winW) || (localX > win2X && localX < win2X + winW) || (localX > win3X && localX < win3X + winW))
      isWindow = true;
  }

  if (isWindow) {
    float lit = mix(0.35, 1.0, step(0.55, h2));
    return vec4(mix(glassCol, trimCol, 0.28) * lit, 1.0);
  }

  float doorX = houseWidth * 0.50;
  float doorW = houseWidth * 0.10;
  if (heightAboveGround < floorH * 0.78 && localX > doorX && localX < doorX + doorW)
    return vec4(doorCol, 1.0);

  if (h1 > 0.72 && localX > ridgeX - 0.25 && localX < ridgeX + 0.25 && heightAboveGround > totalWallH - suburbanTexHeightNorm * 0.08) {
    return vec4(vec3(0.45, 0.42, 0.40), 1.0);
  }

  return vec4(siding, 1.0);
}

// Matches procedural atlas: 512px width per variant × 4 variants = 2048 × 1024
const vec2 lightningTexRes = vec2(2048, 1024);
const float lightningTexAspect = lightningTexRes.x / lightningTexRes.y;

float calcLightningTime(float startIterNum)
{
  float lightningTime = iterNum - startIterNum;
  // Flash Duration GUI → ltFlashDuration stretches leader/flash stages.
  float span = 5.0 * max(ltFlashDuration, 0.2);
  return lightningTime / span; // 0..1 leader, 1+ flash/decay
}

float lightningIntensityOverTime(float Tin, vec2 lightningPos, float intensity)
{
  float T0 = Tin - 1.;

  float repeatPeriod = map_range(random2d(lightningPos), 0., 1., 1.5, 3.0);                                            // 2.5
  float numFlashes = floor(map_range(random2d(lightningPos * 2.737250), 0., 1., 1.0, max(intensity - 0.5, 0.) * 2.0)); // 0.4

  float minT = max(T0 - (repeatPeriod * numFlashes), 0.);

  float T = max(mod(T0, repeatPeriod), minT);

  return max((1. / (0.05 + pow(T * 2.0, 3.))) - 0.005, 0.) * pow(intensity, 2.0); // fading out curve
}

// Enhanced-V2 SDF lightning (branched fractal CG / spider) — primary bolt renderer.
vec3 getLightningColor(float boltSeed)
{
  float r = random2d(vec2(boltSeed * 0.001, boltSeed * 0.00137));
  if (r < 0.40) return vec3(0.60, 0.75, 1.00);
  if (r < 0.65) return vec3(0.65, 0.45, 1.00);
  if (r < 0.80) return vec3(1.00, 0.90, 0.65);
  if (r < 0.92) return vec3(0.30, 0.50, 1.00);
  if (r < 0.97) return vec3(1.00, 0.93, 0.72);
  return vec3(1.00, 0.78, 0.72);
}

float spiderSegSDF(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  return length(p - a - t * ab);
}

float segGlow(float d, float coreR) {
  return exp(-d / coreR) * 2.0
       + exp(-d / (coreR * 3.5)) * 0.18
       + exp(-d / (coreR * 6.0)) * 0.04;
}

// lodReduced: 0 = full Enhanced detail, 1 = coarsened (same seeds/angles, fewer segs).
vec3 displaySpiderLightning(vec2 sampleUV, vec2 lightningPos, float T, float boltSeed, float lodReduced)
{
  const float mainCoreR = 0.000375;
  const float subCoreR  = mainCoreR * 0.60;
  const int   MSEGS_MAX = 40;
  const int   SSEGS_MAX = 16;

  float spiderProg  = clamp(T, 0.0, 1.0);
  float flashBright = T < 1.0
      ? 1500.0 * spiderProg
      : max(500.0 / (0.05 + pow(T * 4.0, 2.5)), 0.0);
  // Look sliders applied after HDR tonemap in main (pre-tonemap multiply is crushed).
  if (flashBright < 0.0001) return vec3(0.0);

  bool reduced = lodReduced > 0.5;
  int msegs = reduced ? 20 : 40;
  int ssegs = reduced ? 8 : 16;
  int nBolts = reduced ? 2 : 3;
  int nSubs = reduced ? 2 : 3;
  // Keep similar spatial reach when segment count drops.
  float spiderStep = 0.013 * (40.0 / float(msegs));

  vec2 p      = vec2(sampleUV.x * aspectRatios[0], sampleUV.y);
  vec2 origin = vec2(lightningPos.x * aspectRatios[0], lightningPos.y);

  float totalGlow = 0.0;
  vec2  mVerts[41];
  vec2  sVerts[17];

  for (int b = 0; b < 3; b++) {
    if (b >= nBolts) break;
    float bs = boltSeed + float(b) * 137.51;

    float goRight   = random2d(vec2(bs * 0.00113, bs * 0.00173 + 1.7)) > 0.5 ? 1.0 : -1.0;
    float mainAngle = goRight > 0.0 ? 0.0 : PI;
    mainAngle += (random2d(vec2(bs * 0.00217, bs * 0.00319)) - 0.5) * 0.4;

    float ang = mainAngle;
    mVerts[0] = origin;

    for (int i = 0; i < MSEGS_MAX; i++) {
      if (i >= msegs) break;
      float r1 = random2d(vec2(bs * 0.00371 + float(i) * 0.0937, bs * 0.00591 + float(i) * 0.0517));
      ang += (r1 - 0.5) * 2.5;
      ang -= (ang - mainAngle) * 0.12;
      ang -= sin(ang) * 0.28;
      mVerts[i + 1] = mVerts[i] + vec2(cos(ang), sin(ang)) * spiderStep;
    }

    vec2  tip        = mVerts[msegs];
    vec2  tipTC      = vec2(tip.x / aspectRatios[0], clamp(tip.y, 0.0, 1.0));
    float cloudAtTip = texture(waterTex, tipTC)[CLOUD];

    if (cloudAtTip >= 0.008) {
      float minD = 1e10, minFade = 0.0;
      for (int i = 0; i < MSEGS_MAX; i++) {
        if (i >= msegs) break;
        float t0   = float(i) / float(msegs);
        float fade = clamp((spiderProg - t0) * float(msegs), 0.0, 1.0);
        float d    = spiderSegSDF(p, mVerts[i], mVerts[i + 1]);
        if (d < minD) { minD = d; minFade = fade; }
        if (minD < mainCoreR * 0.5) break;
      }
      totalGlow += segGlow(minD, mainCoreR) * minFade;

      for (int s = 0; s < 3; s++) {
        if (s >= nSubs) break;
        float ss       = bs + float(s) * 73.37;
        int   spawnIdx = min(int(random2d(vec2(ss * 0.00413, ss * 0.00237)) * float(msegs - 5)) + 2, msegs - 1);
        float subAng   = mainAngle;
        sVerts[0]      = mVerts[spawnIdx];

        for (int i = 0; i < SSEGS_MAX; i++) {
          if (i >= ssegs) break;
          float r1 = random2d(vec2(ss * 0.00511 + float(i) * 0.0937, ss * 0.00391 + float(i) * 0.0711));
          subAng += (r1 - 0.5) * 2.5;
          subAng -= (subAng - mainAngle) * 0.12;
          subAng -= sin(subAng) * 0.28;
          sVerts[i + 1] = sVerts[i] + vec2(cos(subAng), sin(subAng)) * spiderStep;
        }

        vec2  sTip       = sVerts[ssegs];
        vec2  sTipTC     = vec2(sTip.x / aspectRatios[0], clamp(sTip.y, 0.0, 1.0));
        float cloudAtSub = texture(waterTex, sTipTC)[CLOUD];
        if (cloudAtSub >= 0.008) {
          float sMinD = 1e10, sMinFade = 0.0;
          for (int i = 0; i < SSEGS_MAX; i++) {
            if (i >= ssegs) break;
            float t0   = float(i) / float(ssegs);
            float fade = clamp((spiderProg - t0) * float(ssegs), 0.0, 1.0);
            float d    = spiderSegSDF(p, sVerts[i], sVerts[i + 1]);
            if (d < sMinD) { sMinD = d; sMinFade = fade; }
            if (sMinD < subCoreR * 0.5) break;
          }
          totalGlow += segGlow(sMinD, subCoreR) * sMinFade * 0.44;
        }
      }
    }
  }

  return getLightningColor(boltSeed) * totalGlow * flashBright;
}

// sdfQuality: 0 Fast / 1 Balanced / 2 Full — arms only when Full.
vec3 displayCGLightning(vec2 sampleUV, vec2 lightningPos, float T, float boltSeed, float lodReduced, float sdfQuality)
{
  const float mainCoreR   = 0.00045;
  const float branchCoreR = 0.000375;
  const float armCoreR    = branchCoreR * 0.85;
  const float armSubCoreR = branchCoreR * 0.55;
  const int   MAIN_MAX    = 48;
  const int   SIDE_MAX    = 24;
  const int   ARM_MAX     = 40;
  const int   ASUB_MAX    = 16;

  float spiderProg  = clamp(T, 0.0, 1.0);
  float flashBright = T < 1.0
      ? 1125.0 * spiderProg
      : max(300.0 / (0.05 + pow(T * 4.0, 2.5)), 0.0);
  // Look sliders applied after HDR tonemap in main (pre-tonemap multiply is crushed).
  if (flashBright < 0.0001) return vec3(0.0);

  bool reduced = lodReduced > 0.5;
  bool drawArms = sdfQuality > 1.5;
  int mainSegs = reduced ? 24 : 48;
  int sideSegs = reduced ? 12 : 24;
  int armSegs  = reduced ? 20 : 40;
  int asubSegs = reduced ? 8 : 16;
  int nSides   = reduced ? 3 : 4;
  int nArms    = drawArms ? (reduced ? 1 : 2) : 0;
  int nAsubs   = drawArms ? (reduced ? 1 : 2) : 0;

  vec2  p       = vec2(sampleUV.x * aspectRatios[0], sampleUV.y);
  vec2  origin  = vec2(lightningPos.x * aspectRatios[0], lightningPos.y);
  float stepLen = max(lightningPos.y, 0.05) / float(mainSegs);

  float totalGlow = 0.0;

  vec2  cgVerts[49];
  cgVerts[0] = origin;
  float cgAng = -PI * 0.5;

  for (int i = 0; i < MAIN_MAX; i++) {
    if (i >= mainSegs) break;
    float r1 = random2d(vec2(boltSeed * 0.00371 + float(i) * 0.0937, boltSeed * 0.00591 + float(i) * 0.0517));
    cgAng += (r1 - 0.5) * 1.6;
    cgAng -= (cgAng + PI * 0.5) * 0.30;
    cgVerts[i + 1] = cgVerts[i] + vec2(cos(cgAng), sin(cgAng)) * stepLen;
  }

  {
    float minD = 1e10, minFade = 0.0;
    for (int i = 0; i < MAIN_MAX; i++) {
      if (i >= mainSegs) break;
      float t0   = float(i) / float(mainSegs);
      float fade = clamp((spiderProg - t0) * float(mainSegs), 0.0, 1.0);
      float d    = spiderSegSDF(p, cgVerts[i], cgVerts[i + 1]);
      if (d < minD) { minD = d; minFade = fade; }
      if (minD < mainCoreR * 0.5) break;
    }
    totalGlow += segGlow(minD, mainCoreR) * minFade;
  }

  vec2 sbVerts[25];
  for (int sb = 0; sb < 4; sb++) {
    if (sb >= nSides) break;
    float sbs     = boltSeed + float(sb) * 137.51 + 500.0;
    int   fromIdx = min(int(random2d(vec2(sbs * 0.00113, sbs * 0.00173)) * float(mainSegs - 4)) + 2, mainSegs - 2);

    float branchLen = random2d(vec2(sbs * 0.00217, sbs * 0.00319)) * 0.20 + 0.05;
    float sbStep    = max(lightningPos.y, 0.05) * branchLen / float(sideSegs);
    float sbAng     = -PI * 0.5 + (random2d(vec2(sbs * 0.00411, sbs * 0.00591)) - 0.5) * PI * 1.6;
    sbVerts[0]      = cgVerts[fromIdx];

    for (int i = 0; i < SIDE_MAX; i++) {
      if (i >= sideSegs) break;
      float r1 = random2d(vec2(sbs * 0.00511 + float(i) * 0.0937, sbs * 0.00391 + float(i) * 0.0711));
      sbAng += (r1 - 0.5) * 1.6;
      sbAng -= (sbAng + PI * 0.5) * 0.30;
      sbVerts[i + 1] = sbVerts[i] + vec2(cos(sbAng), sin(sbAng)) * sbStep;
    }

    float sbMinD = 1e10, sbMinFade = 0.0;
    for (int i = 0; i < SIDE_MAX; i++) {
      if (i >= sideSegs) break;
      float t0   = float(i) / float(sideSegs);
      float fade = clamp((spiderProg - t0) * float(sideSegs), 0.0, 1.0);
      float d    = spiderSegSDF(p, sbVerts[i], sbVerts[i + 1]);
      if (d < sbMinD) { sbMinD = d; sbMinFade = fade * (1.0 - t0 * 0.55); }
      if (sbMinD < branchCoreR * 0.5) break;
    }
    totalGlow += segGlow(sbMinD, branchCoreR) * sbMinFade * 0.50;
  }

  vec2 armVerts[41];
  vec2 asubVerts[17];
  for (int ca = 0; ca < 2; ca++) {
    if (ca >= nArms) break;
    float cas   = boltSeed + float(ca) * 137.51 + 1000.0;
    int   caIdx = min(int(random2d(vec2(cas * 0.00113, cas * 0.00173)) * 6.0), min(5, mainSegs - 1));

    float goRight = random2d(vec2(cas * 0.00317, cas * 0.00419)) > 0.5 ? 1.0 : -1.0;
    float ccAng   = goRight > 0.0 ? 0.0 : PI;
    ccAng += (random2d(vec2(cas * 0.00513, cas * 0.00217)) - 0.5) * 0.4;

    float armAng = ccAng;
    armVerts[0]  = cgVerts[caIdx];
    float armStep = 0.013 * (40.0 / float(armSegs));

    for (int i = 0; i < ARM_MAX; i++) {
      if (i >= armSegs) break;
      float r1 = random2d(vec2(cas * 0.00371 + float(i) * 0.0937, cas * 0.00591 + float(i) * 0.0517));
      armAng += (r1 - 0.5) * 2.5;
      armAng -= (armAng - ccAng) * 0.12;
      armAng -= sin(armAng) * 0.28;
      armVerts[i + 1] = armVerts[i] + vec2(cos(armAng), sin(armAng)) * armStep;
    }

    vec2  armTip     = armVerts[armSegs];
    vec2  armTipTC   = vec2(armTip.x / aspectRatios[0], clamp(armTip.y, 0.0, 1.0));
    float cloudAtArm = texture(waterTex, armTipTC)[CLOUD];
    if (cloudAtArm >= 0.008) {
      float armMinD = 1e10, armMinFade = 0.0;
      for (int i = 0; i < ARM_MAX; i++) {
        if (i >= armSegs) break;
        float t0   = float(i) / float(armSegs);
        float fade = clamp((spiderProg - t0) * float(armSegs), 0.0, 1.0);
        float d    = spiderSegSDF(p, armVerts[i], armVerts[i + 1]);
        if (d < armMinD) { armMinD = d; armMinFade = fade; }
        if (armMinD < armCoreR * 0.5) break;
      }
      totalGlow += segGlow(armMinD, armCoreR) * armMinFade * 0.65;

      for (int as = 0; as < 2; as++) {
        if (as >= nAsubs) break;
        float ass       = cas + float(as) * 73.37;
        int   aspawnIdx = min(int(random2d(vec2(ass * 0.00413, ass * 0.00237)) * float(armSegs - 5)) + 2, armSegs - 1);
        float asubAng   = ccAng;
        asubVerts[0]    = armVerts[aspawnIdx];

        for (int i = 0; i < ASUB_MAX; i++) {
          if (i >= asubSegs) break;
          float r1 = random2d(vec2(ass * 0.00511 + float(i) * 0.0937, ass * 0.00391 + float(i) * 0.0711));
          asubAng += (r1 - 0.5) * 2.5;
          asubAng -= (asubAng - ccAng) * 0.12;
          asubAng -= sin(asubAng) * 0.28;
          asubVerts[i + 1] = asubVerts[i] + vec2(cos(asubAng), sin(asubAng)) * armStep;
        }

        vec2  asubTip     = asubVerts[asubSegs];
        vec2  asubTipTC   = vec2(asubTip.x / aspectRatios[0], clamp(asubTip.y, 0.0, 1.0));
        float cloudAtAsub = texture(waterTex, asubTipTC)[CLOUD];
        if (cloudAtAsub >= 0.008) {
          float asubMinD = 1e10, asubMinFade = 0.0;
          for (int i = 0; i < ASUB_MAX; i++) {
            if (i >= asubSegs) break;
            float t0   = float(i) / float(asubSegs);
            float fade = clamp((spiderProg - t0) * float(asubSegs), 0.0, 1.0);
            float d    = spiderSegSDF(p, asubVerts[i], asubVerts[i + 1]);
            if (d < asubMinD) { asubMinD = d; asubMinFade = fade; }
            if (asubMinD < armSubCoreR * 0.5) break;
          }
          totalGlow += segGlow(asubMinD, armSubCoreR) * asubMinFade * 0.30;
        }
      }
    }
  }

  return getLightningColor(boltSeed) * totalGlow * flashBright;
}

vec3 displayLightning(vec2 pos, float lightningTime, float currentLightningIntensity)
{
  vec2 lightningTexCoord = texCoord;

  lightningTexCoord.x -= mod(pos.x, 1.);

  lightningTexCoord.y -= pos.y;

  float thick = max(ltChannelThickness, 0.25);
  float vertSpan = max(pos.y * 0.55, 0.08);
  float scaleMult = 1.0 / vertSpan;

  lightningTexCoord.x *= (scaleMult / thick) * aspectRatios[0] / lightningTexAspect;
  lightningTexCoord.y *= -scaleMult;

  lightningTexCoord.x += 0.5;                                                                                               // center lightning bolt

  if (lightningTexCoord.x < 0.01 || lightningTexCoord.x > 1.01 || lightningTexCoord.y < 0.01 || lightningTexCoord.y > 1.01) // prevent edge effect when mipmapping
    return vec3(0);

  // Sample only the first atlas tile for the legacy CG bolt pass.
  float tileSize = 1.0 / LT_TEX_VARIANTS;
  vec2 lightningTexCoordTile = lightningTexCoord;
  lightningTexCoordTile.x = lightningTexCoord.x * tileSize;
  float pixVal = texture(lightningTex, lightningTexCoordTile).r;

  const float branchShowFactor = 2.0;
  const float leaderBrightness = 50000.;    // 200.0
  const float mainBoltBrightness = 100000.; // 100000.

  float brightnessThreshold = 0.92 - lightningTime * branchShowFactor * 0.85;
  brightnessThreshold += lightningTexCoord.y * branchShowFactor * 0.85;

  brightnessThreshold = clamp(brightnessThreshold, 0., 1.);

  if (lightningTime > 1.0) { // main bolt
    brightnessThreshold = 0.90;
    currentLightningIntensity *= mainBoltBrightness;
  } else {
    currentLightningIntensity = leaderBrightness;
  }

  pixVal -= brightnessThreshold;

  pixVal = max(pixVal, 0.0);

  pixVal *= currentLightningIntensity;

  const vec3 lightningCol = vec3(0.70, 0.57, 1.0); // 0.584, 0.576, 1.0

  vec3 outputColor = max(pixVal * lightningCol, vec3(0));

  return outputColor;
}


float saturate(float x) { return min(1.0, max(0.0, x)); }
vec3 saturate(vec3 x) { return min(vec3(1., 1., 1.), max(vec3(0., 0., 0.), x)); }


vec3 bump3y(vec3 x, vec3 yoffset)
{
  vec3 y = vec3(1., 1., 1.) - x * x;
  y = saturate(y - yoffset);
  return y;
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float minQ = min(min(q.y, q.z), q.w);
  float d = q.x - minQ;
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 spectral_zucconi(float w)
{
  // w: [400, 700] wavelenght(nm)
  // x: [0,   1]
  float x = saturate((w - 400.0) / 300.0);
  const vec3 cs = vec3(3.54541723, 2.86670055, 2.29421995);
  const vec3 xs = vec3(0.69548916, 0.49416934, 0.28269708);
  const vec3 ys = vec3(0.02320775, 0.15936245, 0.53520021);
  return bump3y(cs * (x - xs), ys);
}


float normalizedSunlightAt(vec2 tc)
{
  return smoothSunlightSample(lightTex, tc, texelSize, visualQuality) / standardSunBrightness;
}

vec3 tintLightningVolume(vec3 lightRgb, vec3 matchTint)
{
  if (lightningTintMode < 0.5)
    return lightRgb;
  if (lightningTintMode < 1.5)
    return lightRgb * mix(vec3(1.0), matchTint, 0.72);
  return lightRgb * lightningTint;
}

vec3 softClipFlash(vec3 lightRgb)
{
  float clip = max(flashSoftClip, 0.05);
  return lightRgb / (vec3(1.0) + lightRgb * (0.35 / clip));
}

vec4 computeCloudSmokeColor(float cloudwater, float precip, float dustAmt, float smokeAmt, float localLightIntensity, float rainSnowFactor, float nearFireEmberMask, vec2 windVel, float dayMask, float hailMm, float dropMm, vec2 cloudUV)
{
  float densScale = max(cloudDensityScale, 0.01);
  float soft = clamp(cloudSoftness, 0.15, 2.5);

  float lit = pow(clamp(localLightIntensity, 0.0, 1.5), mix(1.0, 0.65, cloudLightResponse)) * mix(0.55, 1.35, cloudLightResponse);

  // Photographic cloud shading from existing sim density (read-only).
  CloudVisualShading cloudShade = shadeRealisticCloud(
    cloudwater, precip, lit, dayMask, cloudUV, fragCoord, densScale, soft, cloudBrightTint, cloudDarkTint);

  vec3 precipTint = mix(snowShaftTint, rainShaftTint, clamp(rainSnowFactor, 0.0, 1.0));
  float precipWeight = clamp(precip * 0.8 * densScale, 0.0, 8.0);
  float cloudWeight = cloudShade.visualWeight;
  float totalDensity = cloudWeight + precipWeight;
  float cloudOpacity = cloudShade.opacity;
  cloudOpacity *= mix(cloudOpacityMult, rainOpacityMult, clamp(precipWeight / max(totalDensity, 1e-4), 0.0, 1.0));
  cloudOpacity = clamp(cloudOpacity, 0.0, 1.0);

  vec3 cloudCol = cloudShade.albedo;

  // Soft crepuscular glow at sunlit cloud breaks (render-only).
  if (cloudShade.rayBreak > 0.001)
    onLight += vec3(1.0, 0.90, 0.72) * cloudShade.rayBreak * lit * 0.28;

  // Precip shafts take shaft tint and optional sky-ish reflection + sun backlight
  float shaftAmt = clamp(precipWeight / max(totalDensity, 1e-4), 0.0, 1.0);
  vec3 shaftCol = mix(cloudCol, precipTint, shaftAmt * 0.85);
  shaftCol = mix(shaftCol, precipTint * vec3(0.75, 0.82, 0.95), skyReflectAmount * shaftAmt);
  shaftCol += precipTint * shaftBacklight * lit * shaftAmt * 0.35;
  float spec = pow(clamp(lit, 0.0, 1.0), 4.0) * shaftSpecular * shaftAmt;
  shaftCol += vec3(spec);
  cloudCol = mix(cloudCol, shaftCol, shaftAmt);

  // Severe core cast: soft blue rain / green hail — daytime + sun-shadow only.
  // Biased toward larger droplets, especially ice/hail. Shadow gate ignores lightning.
  if (greenHueStrength > 0.001 && dayMask > 0.001 && precip > 0.01) {
    float hueStart = max(greenHueStartThreshold, 0.01);
    float hueEnd = max(greenHueEndThreshold, hueStart + 0.05);
    float intense = smoothstep(hueStart, hueEnd, precip);
    float inShadow = 1.0 - smoothstep(0.035, 0.22, lit);
    float coldFrac = 1.0 - clamp(rainSnowFactor, 0.0, 1.0);

    // Size gates from droplet accum: R=hail/ice mm, G=any droplet mm
    float iceGate = smoothstep(2.5, 24.0, max(hailMm, 0.0));
    float waterGate = smoothstep(1.5, 16.0, max(dropMm, 0.0));
    float hasSizeData = step(0.01, max(hailMm, 0.0) + max(dropMm, 0.0));
    // Prefer ice; large liquid only gently boosts. No particle data → mild cold/intense fallback.
    float sizeGate = clamp(iceGate * 0.9 + waterGate * 0.2 + iceGate * waterGate * 0.15, 0.0, 1.0);
    float sizeOrFallback = mix(mix(0.35, 0.8, intense * (0.4 + coldFrac * 0.6)), sizeGate, hasSizeData);

    float hailBias = clamp(iceGate * 0.85 + coldFrac * 0.3 + intense * coldFrac * 0.2, 0.0, 1.0);
    // Soft mid-sat hues that sit in cloud grey rather than neon primaries
    const vec3 rainCoreHue = vec3(0.58, 0.74, 0.90);
    const vec3 hailCoreHue = vec3(0.50, 0.80, 0.56);
    vec3 coreHue = mix(rainCoreHue, hailCoreHue, hailBias);

    float coreAmt = intense * inShadow * clamp(dayMask, 0.0, 1.0)
      * clamp(greenHueStrength, 0.0, 3.0) * mix(0.2, 1.0, shaftAmt)
      * mix(0.28, 1.0, sizeOrFallback);
    // Soft onset so cores feather into surrounding shafts — reduced thresholds to fill gaps
    coreAmt = smoothstep(0.01, 0.55, coreAmt);
    if (coreAmt > 0.0001) {
      float cloudLum = max(dot(cloudCol, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      float hueLum = max(dot(coreHue, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
      vec3 hueKeepLum = coreHue * (cloudLum / hueLum);
      
      // Apply brightness adjustment to hue
      hueKeepLum *= clamp(greenHueBrightness, 0.1, 3.0);
      
      // Apply saturation adjustment to hue (luminance-preserving)
      float coreLum = dot(hueKeepLum, vec3(0.2126, 0.7152, 0.0722));
      hueKeepLum = mix(vec3(coreLum), hueKeepLum, clamp(greenHueSaturation, 0.0, 2.0));
      
      // Apply hue shift via HSV rotation
      float hueShift = clamp(greenHueHue, -1.0, 1.0) * 0.5; // -1..1 → -0.5..0.5 hue rotation
      if (abs(hueShift) > 0.01) {
        vec3 hsv = rgb2hsv(hueKeepLum);
        hsv.x = fract(hsv.x + hueShift); // rotate hue in [0,1] space
        hueKeepLum = hsv2rgb(hsv);
      }
      
      // Soft multiply toward hue, then ease back into cloud for a blended cast
      vec3 softMul = mix(vec3(1.0), hueKeepLum, 0.42);
      vec3 tinted = mix(cloudCol * softMul, hueKeepLum, 0.35);
      cloudCol = mix(cloudCol, tinted, coreAmt * 0.35);
      precipCoreHue = hueKeepLum;
      precipCoreHueAmt = max(precipCoreHueAmt, coreAmt);
    }
  }

  // Dust: reddish haboob / red-sand look (thin: light orange-red, thick: dark red-brown)
  const vec3 dustThinCol = vec3(0.88, 0.38, 0.22);
  const vec3 dustThickCol = vec3(0.28, 0.06, 0.03);
  // Ignore tiny residual channel noise so flashes cannot tint the whole sky brown.
  float dustAmtVis = max(dustAmt - 0.04, 0.0);
  float dustOpacity = clamp(1. - (1. / (dustAmtVis + 1.)), 0.0, 1.0);
  vec3 dustCol = mix(dustThinCol, dustThickCol, dustOpacity);

  // Combustion smoke — thin plumes stay translucent tan; mega-fire densities become
  // dense pyrocumulus: charcoal tops, firelit orange interiors, pale billow highlights.
  const vec3 smokeAsh = vec3(0.86, 0.80, 0.74);        // thin daylight ash
  const vec3 smokeCharcoal = vec3(0.18, 0.15, 0.14);     // thick bulk
  const vec3 smokeSoot = vec3(0.06, 0.05, 0.045);        // extreme opaque core
  const vec3 smokeFireOrange = vec3(1.15, 0.42, 0.06);   // fire glow inside volume
  const vec3 smokeFireGold = vec3(1.35, 0.75, 0.22);     // hottest lit smoke
  const vec3 smokeBillowLit = vec3(0.95, 0.90, 0.85);    // sunlit cauliflower faces

  // Allow very high smokeAmt to approach full opacity (no soft 0.88 ceiling)
  const float smokeOpaqueRef = 5.5;
  float smokeOpacity = clamp(smokeAmt / (smokeAmt + smokeOpaqueRef), 0.0, 1.0);
  float megaFire = smoothstep(6.0, 22.0, smokeAmt);   // opacity ramp (unchanged)
  // Colour density ramps kick in earlier so plumes look thicker at the same mass
  float heavyCol = smoothstep(0.35, 2.2, smokeAmt);
  float megaCol = smoothstep(1.2, 5.5, smokeAmt);
  // Mega fires go fully solid; lighter plumes stay somewhat see-through
  smokeOpacity = mix(smokeOpacity * 0.90, 1.0, megaFire);
  smokeOpacity = clamp(smokeOpacity, 0.0, 1.0);

  // Density-driven body colour: ash → charcoal → near-black (lower thresholds)
  vec3 smokeBaseCol = mix(smokeAsh, smokeCharcoal, heavyCol);
  smokeBaseCol = mix(smokeBaseCol, smokeSoot, megaCol * 0.85);

  // Billowing cauliflower variation from noise (pyrocumulus lobes)
  vec2 billowUV = fragCoord * 0.11 + vec2(iterNum * 0.004, iterNum * 0.0025);
  float billow = texture(noiseTex, billowUV * 0.08).r;
  billow = mix(billow, texture(noiseTex, billowUV * 0.19 + 3.7).r, 0.45);
  billow = smoothstep(0.25, 0.78, billow);

  // Interior firelight — stronger at high density and when ambient sun is weak (night / deep shade)
  float nightBoost = 1.0 - clamp(lit, 0.0, 1.0);
  float internalGlow = heavyCol * mix(0.25, 1.0, nightBoost) * mix(0.55, 1.0, megaCol);
  internalGlow *= mix(0.7, 1.15, billow); // brighter in denser billow lobes
  smokeBaseCol = mix(smokeBaseCol, smokeFireOrange, internalGlow * 0.75);
  smokeBaseCol = mix(smokeBaseCol, smokeFireGold, internalGlow * internalGlow * 0.55);

  // Sunlit / ambient-lit billow faces (pale grey-white highlights like ref)
  float rimLit = pow(clamp(lit, 0.0, 1.2), 0.65) * heavyCol * mix(0.35, 1.0, billow);
  smokeBaseCol = mix(smokeBaseCol, smokeBillowLit, rimLit * 0.5);
  // Night mega-fire: outer shell stays darker charcoal where not firelit
  smokeBaseCol = mix(smokeBaseCol, smokeSoot, megaCol * nightBoost * (1.0 - billow) * 0.4);

  // Open flame only in denser hot cores (not the whole purple plume)
  float fireIntensity = clamp((smokeOpacity - 0.55) * 3.5, 0.0, 1.0) * (1.0 - megaCol * 0.35);
  vec3 fireCol = hsv2rgb(vec3(fireIntensity * 0.008, 0.98, 5.0)) * 1.0;
  vec3 smokeOrFireCol = mix(smokeBaseCol, fireCol, fireIntensity * 0.55);

  // Soft volume lighting on billow tops
  vec3 smokeLit = smokeOrFireCol * mix(0.72, 1.18, clamp(lit, 0.0, 1.0));
  smokeOrFireCol = mix(smokeOrFireCol, smokeLit, 0.45);

  // Self-illumination when massive fire lights the smoke from within
  shadowLight += fireIntensity * 2.0 + internalGlow * megaCol * 3.5;

  // Composite: smoke over dust over cloud (product of transparencies)
  float dustOverCloudOpacity = 1. - (1. - dustOpacity) * (1. - cloudOpacity);
  vec3 dustOverCloud = dustOpacity > 1e-5
    ? (dustCol * dustOpacity / max(dustOverCloudOpacity, 1e-4)
       + cloudCol * cloudOpacity * (1. - dustOpacity) / max(dustOverCloudOpacity, 1e-4))
    : cloudCol;
  if (dustOpacity <= 1e-5)
    dustOverCloudOpacity = cloudOpacity;

  float outOpacity = 1. - (1. - smokeOpacity) * (1. - dustOverCloudOpacity);
  vec3 outColor = (smokeOrFireCol * smokeOpacity / max(outOpacity, 1e-4))
    + (dustOverCloud * dustOverCloudOpacity * (1. - smokeOpacity) / max(outOpacity, 1e-4));

  // Embers: brief star sparks that drift with wind. Caller sets nearFireEmberMask
  // only at night and near fire (not lofted through the smoke plume).
  if (nearFireEmberMask > 0.001) {
    // Scroll star field so points appear to drift with local wind
    vec2 drift = vec2(windVel.x, max(windVel.y, 0.0) * 0.35 + 0.004) * iterNum * 18.0;
    float starScale = 2.35;
    vec2 drifted = fragCoord - drift;
    vec2 cell = floor(drifted * starScale);
    vec2 local = fract(drifted * starScale) - 0.5;
    float seed = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float waveSpeed = 0.62;
    float phase = fract(iterNum * waveSpeed + seed * 7.31);
    float flash = exp(-phase * 20.0) * step(phase, 0.16);
    float spawn = step(0.80, fract(seed * 17.3 + floor(iterNum * waveSpeed + seed * 7.31) * 0.07));
    float r2 = dot(local, local);
    float core = exp(-r2 * 95.0);
    float arms = exp(-abs(local.x) * 55.0) * exp(-abs(local.y) * 9.0)
               + exp(-abs(local.y) * 55.0) * exp(-abs(local.x) * 9.0);
    float star = max(core, arms * 0.65) * flash * spawn * nearFireEmberMask;
    float starScale2 = 3.5;
    vec2 drifted2 = fragCoord - drift * 1.15 - vec2(0.0, iterNum * 0.012);
    vec2 cell2 = floor(drifted2 * starScale2 + 11.0);
    vec2 local2 = fract(drifted2 * starScale2 + 11.0) - 0.5;
    float seed2 = fract(sin(dot(cell2, vec2(74.7, 191.3))) * 23421.631);
    float phase2 = fract(iterNum * 0.78 + seed2 * 5.17);
    float flash2 = exp(-phase2 * 24.0) * step(phase2, 0.13);
    float spawn2 = step(0.86, fract(seed2 * 9.1 + floor(iterNum * 0.78) * 0.13));
    float core2 = exp(-dot(local2, local2) * 150.0);
    float star2 = core2 * flash2 * spawn2 * nearFireEmberMask;
    float starAmt = max(star, star2 * 0.85);
    vec3 starCol = vec3(1.35, 0.95, 0.55);
    vec3 starRim = vec3(1.15, 0.45, 0.08);
    vec3 starRgb = mix(starRim, starCol, core * spawn * flash);
    outColor += starRgb * starAmt * 1.7;
    outOpacity = min(1.0, outOpacity + starAmt * 0.85);
    shadowLight += starAmt * 2.8;
  }

  return vec4(outColor, outOpacity);
}

// pathDrawBolts: false = cheap onLight fill only (waterline air path).
void applyAirLightning(vec2 uv, float cloudwater, float precip, float cloudDensity, bool pathDrawBolts)
{
  if (ltEnableLightning == 0)
    return;

  // Enhanced-V2 SDF bolts from lightningDataTex (CG / spider). V2 bolt pass disabled.
  vec4 lightningData = texture(lightningDataTex, vec2(0.5));
  if (lightningData[INTENSITY] <= 0.5)
    return;

  vec2 lightningPos = lightningData.xy;
  float lightningStartIterNum = lightningData[START_ITERNUM];
  float lightningTime = calcLightningTime(lightningStartIterNum);
  // Past useful flash window — skip all work.
  if (lightningTime > 4.0)
    return;

  float currentLightningIntensity = lightningIntensityOverTime(lightningTime, lightningPos, lightningData[INTENSITY]);

  // Cloud/precip-local fill only — never light empty air (that recolors the whole sky/sim).
  {
    float media = max(cloudDensity, 0.0) + max(precip, 0.0) * 12.0;
    // Strong reject of clear air / thin haze so flash stays inside the storm body.
    float mediaMask = clamp(1.0 - 1.0 / (1.0 + media * 0.35), 0.0, 1.0);
    mediaMask *= mediaMask;
    if (mediaMask > 0.01) {
      vec2 ldist = vec2((lightningPos.x - uv.x) * aspectRatios[0], lightningPos.y * 0.5 - uv.y);
      float ldistSq = dot(ldist, ldist);
      // Tighter falloff than a domain-wide wash.
      float lOnLight = 0.00022 / (ldistSq + 0.012);
      lOnLight *= currentLightningIntensity * lightningCloudFill * mediaMask;
      // Fill uses muted look sliders (bolts still get full post-tonemap look).
      float fillLook = mix(1.0, max(ltBrightness, 0.02) * max(ltContrast, 0.02), 0.35);
      float fillGlow = mix(1.0, 0.35 + 0.95 * max(ltGlowStrength, 0.0), 0.28);
      lightningFillLight += softClipFlash(
          tintLightningVolume(getLightningColor(lightningStartIterNum) * lOnLight, cloudBrightTint))
        * fillLook * fillGlow * 0.5;
    }
  }

  if (!pathDrawBolts || ltDrawBolts == 0)
    return;

  bool isCg = lightningData[INTENSITY] > 1.0;
  float dx = abs((uv.x - lightningPos.x) * aspectRatios[0]);
  float dy = uv.y - lightningPos.y;
  float q = ltSdfQuality;
  // AABB: Full generous; Balanced/Fast slightly tighter but still covers branched bolts.
  float aabbX = q > 1.5 ? 0.40 : 0.32;
  float aabbSpider = q > 1.5 ? 0.65 : 0.55;
  bool inAabb = isCg
    ? (dx < aabbX && uv.y > -0.05 && uv.y < lightningPos.y + 0.12)
    : (dx < aabbSpider && abs(dy) < aabbSpider);
  if (!inAabb)
    return;

  float cloudOpacity = clamp(1.0 - (1.0 / (1.0 + max(cloudDensity, 0.0))), 0.0, 1.0);

  float zoomNorm = view[2] / resolution.x;
  bool farZoom = zoomNorm <= 0.0025;
  float distFromOrigin = length(vec2(dx, isCg ? max(-dy, 0.0) : dy));
  float lodReduced;
  if (q < 0.5) {
    // Fast: always reduced.
    lodReduced = 1.0;
  } else if (q < 1.5) {
    // Balanced: full only when zoomed in closely near origin.
    lodReduced = (zoomNorm > 0.004 && distFromOrigin < 0.18 && visualQuality >= 0.45) ? 0.0 : 1.0;
  } else {
    // Full: previous distance/zoom logic.
    lodReduced = (farZoom || visualQuality < 0.45 || distFromOrigin > 0.28) ? 1.0 : 0.0;
  }

  if (isCg) {
    vec3 cgLight = displayCGLightning(uv, lightningPos, lightningTime, lightningStartIterNum, lodReduced, q);
    float cgDepth = random2d(vec2(lightningStartIterNum * 0.00137, lightningStartIterNum * 0.00271));
    // Soft occlusion — never fully kill the bolt inside dense cloud.
    float cgOcclusion = pow(max(1.0 - cloudOpacity, 0.0), cgDepth * 4.5);
    cgOcclusion = max(cgOcclusion, 0.35);
    emittedLight += cgLight * cgOcclusion;
  } else {
    emittedLight += displaySpiderLightning(uv, lightningPos, lightningTime, lightningStartIterNum, lodReduced);
    // Mild cloud dampening (old *20 crushed in-cloud bolts to invisible).
    emittedLight /= 1.0 + cloudDensity * 2.5;
  }
}


float rand(float n) { return fract(sin(n) * 43758.5453123); }

void main()
{
  vec2 bndFragCoord = vec2(fragCoord.x, clamp(fragCoord.y, 0., resolution.y)); // bound y within range
  // Smooth clouds: Hermite-interpolated samples restore soft edges (avoids blocky cells).
  // When off, keep distance-LOD cheap path (nearest / linear bilerp).
  bool farZoom = view[2] / resolution.x <= 0.0025;
  if (smoothClouds > 0.5) {
    base = smoothBilerpWallVis(baseTex, wallTex, bndFragCoord);
    water = smoothBilerpWallVis(waterTex, wallTex, bndFragCoord);
  } else if (farZoom || visualQuality < 0.45) {
    base = texture(baseTex, bndFragCoord * texelSize);
    water = texture(waterTex, bndFragCoord * texelSize);
  } else {
    base = bilerpWallVis(baseTex, wallTex, bndFragCoord);
    water = bilerpWallVis(waterTex, wallTex, bndFragCoord);
  }
  wall = texture(wallTex, bndFragCoord * texelSize);                           // texCoord
  lightIntensity = normalizedSunlightAt(bndFragCoord * texelSize);

  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  float localSunAngle = sampleSunColumn(sunColumnTex, texCoord.x).g;
  bool nightTime = abs(localSunAngle) > 85.0 * deg2rad; // false = day time

  shadowLight = minShadowLight;

  // fragmentColor = vec4(vec3(light),1); return; // View light texture for debugging

  float cloudwater = water[CLOUD];
  float nightFactor = clamp(map_range(abs(localSunAngle), 60. * deg2rad, 90. * deg2rad, 0., 1.), 0., 1.);
  float precipF = clamp(water[PRECIPITATION], 0.0, 1.0);
  vec3 icccEmit = vec3(0.0);
  vec3 icccCloud = vec3(0.0);
  vec3 icccSurf = vec3(0.0);
  vec3 precipBoltShafts = vec3(0.0);
  // Enhanced SDF path owns bolt glow; skip V2 IC/CC flash + precip-curtain wash
  // that previously multiplied per GPU segment and caused vertical end streaks.
  icccEmit = vec3(0.0);
  icccCloud = vec3(0.0);
  icccSurf = vec3(0.0);
  precipBoltShafts = vec3(0.0);

  if (texCoord.y < 0.) {                                     // below simulation area

    float depth = float(-wall[VERT_DISTANCE]) - fragCoord.y; // depth into subsurface column

    // Lakes/ocean/ice: solid body colors (no flood fade, no fade-to-black).
    // Flooded land: floodwater sheet fades to 0 opacity with depth.
    if (isAnyWaterType(wall[TYPE])) {
      if (wall[TYPE] == WALLTYPE_FRESH_WATER)
        color = vec3(0.15, 0.65, 0.95);
      else if (wall[TYPE] == WALLTYPE_ICE)
        color = getIceColor(water[SNOW]);
      else
        color = vec3(0.0, 0.42, 0.82);
      opacity = 1.0;
      shadowLight = minShadowLight;
    } else {
      color = getLandColor(depth);
      opacity = 1.0;
      applyFloodWaterSheet(depth);
    }

    lightIntensity = texture(lightTex, vec2(texCoord.x, texelSize.y))[0] / standardSunBrightness;
    // Only darken non-flood land underground; floodwater uses opacity fade instead
    if (floodSheetOpacity(depth) <= 0.0)
      lightIntensity *= pow(0.5, -fragCoord.y);

  } else if (texCoord.y > 1.0) {                                                                  // above simulation area
    // color = vec3(0); // no need to set
    opacity = 0.0;                  // completely transparent
  } else if (wall[DISTANCE] == 0) { // is wall
                                    // color = getWallColor(texCoord);

    ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
    ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);

    switch (wall[TYPE]) {
      // case WALLTYPE_INERT:
      //   color = vec3(0, 0, 0);
      //   break;

    case WALLTYPE_RUNWAY:

      if (wall[VERT_DISTANCE] == 0) {
        vec2 modTexCoord = mod(texCoord * resolution, 1.0);

        color = vec3(0.1);
        color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb; // add noise texture

        if (length(modTexCoord - vec2(0.7, 0.97)) < 0.03) {                                               // side lights
          onLight += vec3(1., 0.8, 0.3) * 300.0;
        }

        if (abs(mod(-iterNum - floor(texCoord.x * resolution.x), 150.0)) < 1.0 && length(modTexCoord - vec2(0.2, 0.98)) < 0.02) {
          onLight += vec3(0., 1.0, 0.) * 5000.0;
        }

        opacity = 1.0;
        applyFloodWaterSheet(0.0);
        break;
      }

    case WALLTYPE_URBAN:
    case WALLTYPE_AMERICAN_SUBURBAN:
    case WALLTYPE_INDUSTRIAL:
    case WALLTYPE_FIRE:
    case WALLTYPE_FIRE_FOREST2:
    case WALLTYPE_LAND:
    case WALLTYPE_FOREST2:
    case WALLTYPE_SUBURBAN:
    case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: // custom base slots
    case 18: case 19: case 20: case 21: case 22: case 23: case 24: case 25: // custom overlay slots

      // horizontally interpolate depth value
      float interpDepth = mix(mix(float(-wallXmY0[VERT_DISTANCE]), float(-wall[VERT_DISTANCE]), clamp(fract(fragCoord.x) + 0.5, 0.5, 1.)), float(-wallXpY0[VERT_DISTANCE]), clamp(fract(fragCoord.x) - 0.5, 0., 0.5));
      float depth = interpDepth - fract(fragCoord.y); // - 1.0 ?

      if (wall[TYPE] == WALLTYPE_SUBURBAN && wall[VERT_DISTANCE] == 0) {
        color = getSuburbanGroundColor(suburbanWorldX(fragCoord.x));
        color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;
        color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0));
        opacity = 1.0;
        applyFloodWaterSheet(0.0);
      } else if (isCustomTerrain(wall[TYPE]) && wall[VERT_DISTANCE] == 0) {
        // Ground: land-like soil with a tint sample from the custom strip bottom
        color = getLandColor(depth);
        int cslot = customAtlasSlot(wall[TYPE]);
        vec4 groundSample = customSurfaceTexture(cslot, vec2(mod(fragCoord.x, resolution.x) * 0.02, 0.92));
        if (groundSample.a > 0.2)
          color = mix(color, groundSample.rgb, 0.55);
        opacity = 1.0;
        applyFloodWaterSheet(0.0);
      } else {
        color = getLandColor(depth);
        opacity = 1.0;
        applyFloodWaterSheet(depth);
      }

      break;
    case WALLTYPE_ICE:
      {
        float iceThickness = water[SNOW];
        color = getIceColor(iceThickness);
        if (wall[VERT_DISTANCE] == 0 && iceThickness > fullWhiteSnowHeight)
          color = mix(color, vec3(0.98), clamp((iceThickness - fullWhiteSnowHeight) / 200.0, 0.0, 0.5)); // thick ice caps
      }
      break;
    case WALLTYPE_FRESH_WATER:
    case WALLTYPE_WATER:

      // Precomputed values (tweak to taste)
      // Frequencies
      const int numWaveComp = 5;
      const float freqs[numWaveComp] = float[numWaveComp](2.3, 3.7, 5.1, 7.6, 21.7);
      // Amplitudes
      const float amps[numWaveComp] = float[numWaveComp](0.05, 0.03, 0.02, 0.015, 0.004);
      // Speeds
      const float speeds[numWaveComp] = float[numWaveComp](0.006, 0.011, 0.018, 0.025, 0.05);
      // Phases (in radians)
      const float phases[numWaveComp] = float[numWaveComp](1.2, 3.9, 0.7, 5.1, 3.1);

      // Sum up the components
      float waveSignalL = 0.0;
      float waveSignalR = 0.0;

      for (int i = 0; i < numWaveComp; i++) {
        if (visualQuality < 0.65 && i >= 3)
          continue;
        waveSignalL += sin(fragCoord.x * freqs[i] + iterNum * speeds[i] + phases[i]) * amps[i];
        waveSignalR += sin(fragCoord.x * freqs[i] - iterNum * speeds[i] + phases[i]) * amps[i];
      }

      vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);
      float windSpeed = baseX0Yp[VX] * 10.;

      // combine based on wind direction
      float waterLevel = 0.8 + waveSignalL * max(-windSpeed, 0.) + waveSignalR * max(windSpeed, 0.);

      // Storm surge visual: raise ocean surface when strong wind blows onshore onto adjacent land
      if (wall[TYPE] == WALLTYPE_WATER && wall[VERT_DISTANCE] == 0) {
        float onshoreVis = 0.0;
        if (wallXpY0[DISTANCE] == 0 && !isAnyWaterType(wallXpY0[TYPE]))
          onshoreVis = max(onshoreVis, max(windSpeed, 0.0));
        if (wallXmY0[DISTANCE] == 0 && !isAnyWaterType(wallXmY0[TYPE]))
          onshoreVis = max(onshoreVis, max(-windSpeed, 0.0));
        waterLevel += clamp((onshoreVis - 0.5) * 0.06, 0.0, 0.22);
        waterLevel = clamp(waterLevel, 0.15, 0.98);
      }

      if (wall[VERT_DISTANCE] == 0 && fract(fragCoord.y) > waterLevel) { // air
        vec2 airFC = fragCoord + vec2(0., 0.5);
        vec2 airUV = airFC * texelSize;
        vec2 airBnd = vec2(airFC.x, clamp(airFC.y, 0., resolution.y));
        vec4 airWater = smoothClouds > 0.5
          ? smoothBilerpWallVis(waterTex, wallTex, airBnd)
          : ((farZoom || visualQuality < 0.45)
            ? texture(waterTex, airBnd * texelSize)
            : bilerpWallVis(waterTex, wallTex, airBnd));
        float airCloud = airWater[CLOUD];
        float airPrecip = airWater[PRECIPITATION];
        vec4 airBaseSample = smoothClouds > 0.5
          ? smoothBilerpWallVis(baseTex, wallTex, airBnd)
          : texture(baseTex, airBnd * texelSize);
        float airRainSnow = map_rangeC(KtoC(potentialToRealT(airBaseSample[TEMPERATURE])), 0.0, 5.0, 0.0, 1.0);
        // Match dust/cloud: Hermite/bilerp smoke so fire plumes are not blocky cells
        float airSmoke = smoothClouds > 0.5
          ? smoothBilerpWallVis(smokeTex, wallTex, airBnd).r
          : ((farZoom || visualQuality < 0.45)
            ? texture(smokeTex, airBnd * texelSize).r
            : bilerpWallVis(smokeTex, wallTex, airBnd).r);
        // Night-only star embers near fire at waterline; drift with local wind
        float nearEmber = 0.0;
        if (isAnyFireType(wall[TYPE]) && wall[VERT_DISTANCE] == 0)
          nearEmber = clamp(airSmoke * 0.2, 0.0, 1.0) * nightFactor;
        vec2 airWind = airBaseSample.xy;
        vec4 airSizes = texture(dropletSizeTex, airUV);
        vec4 airColor = computeCloudSmokeColor(airCloud, airPrecip, airWater[DUST], airSmoke, normalizedSunlightAt(airUV), airRainSnow, nearEmber, airWind, 1.0 - nightFactor, airSizes.r, airSizes.g, airUV);
        opacity = airColor.a;
        color = airColor.rgb;
        // Waterline air: cheap fill only — full SDF runs on true air fragments.
        applyAirLightning(airUV, airCloud, airPrecip, max(airCloud * 13.6, 0.0), false);
      } else {
        if (wall[TYPE] == WALLTYPE_FRESH_WATER)
          color = vec3(0.15, 0.65, 0.95); // fresh water — lighter cyan
        else
          color = vec3(0.0, 0.42, 0.82); // salt water — deeper blue
      }

      // Beach slope only when land/ice surface meets water surface (same elevation).
      // Do not draw into water beside underwater land — that creates a jutting
      // "nose" under cliffs where the shore is higher than the waterline.
      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);

      if (wall[VERT_DISTANCE] == 0
          && wallXmY0[DISTANCE] == 0 && wallXmY0[VERT_DISTANCE] == 0 && !isLiquidWaterType(wallXmY0[TYPE])
          && (fragCoord.y < 1. || !isAnyWaterType(wallX0Ym[TYPE]))) {
        // Land / glacier surface to the left — soft 45° beach into this water cell
        if (localX + localY < 1.0) {
          opacity = 1.0;
          ivec4 landWall = wallXmY0;
          vec4 landWater = texture(waterTex, texCoordXmY0);
          wall = landWall;
          water = landWater;
          float shoreDepth = float(-wall[VERT_DISTANCE]) - localY;
          if (wall[TYPE] == WALLTYPE_ICE)
            color = getIceColor(water[SNOW]);
          else {
            color = getLandColor(shoreDepth);
            applyFloodWaterSheet(shoreDepth);
          }
          shadowLight = minShadowLight;
        }
      }
      if (wall[VERT_DISTANCE] == 0
          && wallXpY0[DISTANCE] == 0 && wallXpY0[VERT_DISTANCE] == 0 && !isLiquidWaterType(wallXpY0[TYPE])
          && (fragCoord.y < 1. || !isAnyWaterType(wallX0Ym[TYPE]))) {
        // Land / glacier surface to the right — soft 45° beach into this water cell
        if (localY - localX < 0.0) {
          opacity = 1.0;
          ivec4 landWall = wallXpY0;
          vec4 landWater = texture(waterTex, texCoordXpY0);
          wall = landWall;
          water = landWater;
          float shoreDepth = float(-wall[VERT_DISTANCE]) - localY;
          if (wall[TYPE] == WALLTYPE_ICE)
            color = getIceColor(water[SNOW]);
          else {
            color = getLandColor(shoreDepth);
            applyFloodWaterSheet(shoreDepth);
          }
          shadowLight = minShadowLight;
        }
      }

      break;
    }
  } else { // air

    float rainSnowFactorAir = map_rangeC(KtoC(realTemp), 0.0, 5.0, 0.0, 1.0);
    // Smooth smoke the same way as dust/cloud in waterTex (smoke lives in a separate texture)
    float airSmokeAmt = smoothClouds > 0.5
      ? smoothBilerpWallVis(smokeTex, wallTex, bndFragCoord).r
      : ((farZoom || visualQuality < 0.45)
        ? texture(smokeTex, bndFragCoord * texelSize).r
        : bilerpWallVis(smokeTex, wallTex, bndFragCoord).r);
    // Night-only star embers just above fire (cells 1–2); drift with wind, die quickly
    float nearFireEmberMask = 0.0;
    if (isAnyFireType(wall[TYPE]) && wall[VERT_DISTANCE] >= 1 && wall[VERT_DISTANCE] <= 2) {
      float heightFall = wall[VERT_DISTANCE] == 1 ? 1.0 : 0.45;
      float flameCore = clamp((airSmokeAmt - 0.25) * 0.4, 0.12, 1.0);
      nearFireEmberMask = flameCore * heightFall * nightFactor;
    }
    vec2 airWind = base.xy;
    vec4 dropSizes = texture(dropletSizeTex, bndFragCoord * texelSize);
    vec4 airColor = computeCloudSmokeColor(cloudwater, water[PRECIPITATION], water[DUST], airSmokeAmt, lightIntensity, rainSnowFactorAir, nearFireEmberMask, airWind, 1.0 - nightFactor, dropSizes.r, dropSizes.g, bndFragCoord * texelSize);
    opacity = airColor.a;
    color = airColor.rgb;

    // Subtle refraction warp behind dense precip/cloud (display approx)
    if (refractDistort > 0.001 && airColor.a > 0.08) {
      float warp = refractDistort * clamp(airColor.a, 0.0, 1.0) * 0.012;
      vec2 warpUV = texCoord + vec2(sin(texCoord.y * 40.0 + iterNum * 0.02) * warp,
                                    cos(texCoord.x * 28.0) * warp * 0.55);
      warpUV = clamp(warpUV, vec2(0.0), vec2(1.0));
      vec3 skyHint = texture(ambientLightTex, warpUV).rgb;
      color = mix(color, color * 0.85 + skyHint * rainShaftTint * 0.35, clamp(refractDistort * airColor.a, 0.0, 0.45));
    }

    applyAirLightning(texCoord, cloudwater, water[PRECIPITATION], max(cloudwater * 13.6, 0.0), true);


    if (enableRainbows != 0 && visualQuality >= 0.55 && view[2] / resolution.x > 0.0025) {
    vec2 rainbowCenter = vec2(0.0, -1.5 + abs(localSunAngle) * 0.60);

    float centerDist = length(onScreenUV - rainbowCenter) * 1.3;

    const float cameraHeight = 1.0;

    float angle = atan(centerDist / cameraHeight) * rad2deg;

    float waveLength = map_range(angle, 40.0, 42.0, 400., 700.);

    float rainSnowFactor = rainSnowFactorAir;

    vec3 rainbowCol = spectral_zucconi(waveLength) * min(pow(lightIntensity, 2.0) * 1.9, 1.0) * min(water[PRECIPITATION] * 3.0, 1.0) * rainSnowFactor * 0.7 * rainbowStrength;

    emittedLight += rainbowCol;
    opacity = max(opacity - length(rainbowCol), 0.); // remove some white rain to prevent overbrightening and increase color saturation
    }


    if (wall[VERT_DISTANCE] >= 0 && wall[VERT_DISTANCE] < 10) { // near surface
      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);
      // ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

#define texAspect 3584. / 4096. // height / width of surface atlas (7 strips × 512)
#define maxTreeHeight 40.       // height in meters when vegetation max = 127
#define maxBuildingHeight 400.  // height in meters upto wich the urban texture reaches
#define maxAmericanSuburbanHeight 55. // 1–2 story American suburban houses

      // Surface facade detail (urban, industrial, suburban, trees) stays visible at all zoom levels.
      if (isCustomTerrain(wallX0Ym[TYPE])) {
        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);
        float urbanTexHeightNorm = maxBuildingHeight / cellHeight;
        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = 1.0 - (heightAboveGround / urbanTexHeightNorm);
        int cslot = customAtlasSlot(wallX0Ym[TYPE]);
        vec4 texCol = customSurfaceTexture(cslot, vec2(urbanTexCoordX, urbanTexCoordY));
        if (texCol.a > 0.5) {
          if (nightTime) {
            shadowLight = 1.0;
            texCol.rgb *= vec3(1.0, 0.85, 0.6);
          } else if (length(texCol.rgb) < 0.08) {
            texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      } else if (wallX0Ym[TYPE] == WALLTYPE_URBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);

        float urbanTexHeightNorm = maxBuildingHeight / cellHeight; // example: 200 / 40 = 5

        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = heightAboveGround / urbanTexHeightNorm;

        // urbanTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), 127., 50., 0., 1.0); // building height

        urbanTexCoordY = 1.0 - urbanTexCoordY;

        vec4 texCol = surfaceTexture(URBAN, vec2(urbanTexCoordX, urbanTexCoordY));
        if (texCol.a > 0.5) { // if not transparent

          if (nightTime) {
            shadowLight = 1.0;                 // city lights
            texCol.rgb *= vec3(1.0, 0.8, 0.5); // yellowish windows
          } else {                             // day time
            texCol.rgb *= vec3(0.8, 0.9, 1.0); // Blueish windows

            if (length(texCol.rgb) < 0.1)
              texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      } else if (wallX0Ym[TYPE] == WALLTYPE_AMERICAN_SUBURBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);
        float amerTexHeightNorm = maxAmericanSuburbanHeight / cellHeight;
        float amerTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / amerTexHeightNorm;
        float amerTexCoordY = 1.0 - (heightAboveGround / amerTexHeightNorm);

        vec4 texCol = surfaceTexture(AMER_SUBURBAN, vec2(amerTexCoordX, amerTexCoordY));
        if (texCol.a > 0.5) {
          if (nightTime) {
            shadowLight = 1.0;
            texCol.rgb *= vec3(1.0, 0.85, 0.6);
          } else {
            texCol.rgb *= vec3(0.95, 0.97, 1.0);
            if (length(texCol.rgb) < 0.1)
              texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      } else if (wallX0Ym[TYPE] == WALLTYPE_INDUSTRIAL) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);

        float urbanTexHeightNorm = maxBuildingHeight / cellHeight; // example: 200 / 40 = 5

        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = heightAboveGround / urbanTexHeightNorm;

        // urbanTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), 127., 50., 0., 1.0); // building height

        urbanTexCoordY = 1.0 - urbanTexCoordY;

        vec4 texCol = surfaceTexture(INDUS, vec2(urbanTexCoordX, urbanTexCoordY));
        if (texCol.a > 0.5) { // if not transparent

          if (nightTime) {
            shadowLight = 1.0;                 // city lights
            texCol.rgb *= vec3(1.0, 0.8, 0.5); // yellowish windows
          } else {                             // day time
            texCol.rgb *= vec3(0.8, 0.9, 1.0); // Blueish windows

            if (length(texCol.rgb) < 0.1)
              texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      } else if (wallX0Ym[TYPE] == WALLTYPE_SUBURBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);
        float suburbanTexHeightNorm = maxSuburbanBuildingHeight / cellHeight;

        if (heightAboveGround < suburbanTexHeightNorm) {
          vec4 texCol = suburbanHouseAt(suburbanWorldX(fragCoord.x), heightAboveGround);
          if (texCol.a > 0.5) {
            if (nightTime) {
              shadowLight = 1.0;
              float windowGlow = step(0.45, length(texCol.rgb))
                * suburbanHash(floor(suburbanWorldX(fragCoord.x) / suburbanLotWidth) + 91.3);
              texCol.rgb = mix(texCol.rgb * 0.35, texCol.rgb * vec3(1.0, 0.82, 0.55), windowGlow);
            } else {
              texCol.rgb *= vec3(1.0, 0.98, 0.94);
            }
            color = texCol.rgb;
            opacity = texCol.a;
          }
        }
      }


      if (wall[VERT_DISTANCE] == 1) {                                                 // 1 above surface
                                                                                      //  if (wallX0Ym[VERT_DISTANCE] == 0) {

        float treeTexHeightNorm = maxTreeHeight / cellHeight;                         // example: 40 / 120 = 0.333

        float treeTexCoordY = localY / treeTexHeightNorm;                             // full height trees

        treeTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), float(FOREST_VEG_MAX), float(FOREST_VEG_MIN), 0., 1.0); // tree height from forest biomass

        float treeTexCoordX = fragCoord.x * texAspect / treeTexHeightNorm;            // static scaled trees

        float heightAboveGround = localY / treeTexHeightNorm;

        treeTexCoordX -= base.x * heightAboveGround * 1.00; // 2.5  trees waving with the wind effect

        treeTexCoordX *= 0.72;                              // Trees only go up to 72% of the texture height
        treeTexCoordY *= 0.72;                              // Trees only go up to 72% of the texture height
        treeTexCoordY = 1. - treeTexCoordY;                 // texture is upside down

        vec4 texCol = vec4(0.0);
        if (wallX0Ym[VEGETATION] > GRASS_VEG_MAX &&
            (wallX0Ym[TYPE] == WALLTYPE_LAND || wallX0Ym[TYPE] == WALLTYPE_FOREST2 || wallX0Ym[TYPE] == WALLTYPE_URBAN || wallX0Ym[TYPE] == WALLTYPE_AMERICAN_SUBURBAN || wallX0Ym[TYPE] == WALLTYPE_SUBURBAN || isCustomBase(wallX0Ym[TYPE]))) { // forest canopy only
          vec4 surfaceWater = texture(waterTex, texCoordX0Ym);                     // snow on land below
          float snow = surfaceWater[SNOW];
          if (snow * 0.01 / cellHeight > heightAboveGround)
            texCol = vec4(vec3(1.), 1.);                                                                                                                          // show white snow layer above ground
          else {                                                                                                                                                  // display vegetation
            float treeScale = wallX0Ym[TYPE] == WALLTYPE_SUBURBAN ? 0.55 : 1.0;
            int treeStrip = wallX0Ym[TYPE] == WALLTYPE_FOREST2 ? FOREST2 : FOREST;
            vec4 treeColor = surfaceTexture(treeStrip, vec2(treeTexCoordX, treeTexCoordY * treeScale + (1.0 - treeScale) * 0.5));
            float treeVegMoist = max(surfaceWater[SUSTAINED_MOISTURE], surfaceWater[SOIL_MOISTURE] * 0.65);
            vec4 vegetationCol = mix(treeColor, vec4(dryGrassCol, 1.), max(0.5 - treeVegMoist * (0.5 / fullGreenSoilMoisture), 0.) * treeColor.a); // green to brown
            if (wallX0Ym[TYPE] == WALLTYPE_SUBURBAN)
              vegetationCol.a *= step(0.82, suburbanHash(floor(suburbanWorldX(fragCoord.x) / suburbanLotWidth) + 53.1));
            texCol = mix(vegetationCol, surfaceTexture(SNOW_FOREST, vec2(treeTexCoordX, treeTexCoordY * treeScale)), min(snow / fullWhiteSnowHeight, 1.0));
          }
        } else if (isAnyFireType(wallX0Ym[TYPE]) && wallX0Ym[VEGETATION] > GRASS_VEG_MAX) {
          texCol = surfaceTexture(FIRE_FOREST, vec2(treeTexCoordX, treeTexCoordY));
        }
        if (texCol.a > 0.5) { // if not transparent
          color = texCol.rgb;

          shadowLight = minShadowLight;        // make sure trees are dark at night

          if (isAnyFireType(wallX0Ym[TYPE])) // fire below
            shadowLight = 1.0;

          opacity = 1. - (1. - opacity) * (1. - texCol.a); // alpha blending
        }
      }

      if (wall[VERT_DISTANCE] == 1) {
        // draw 45° slopes (land and glaciers; skip open water)
        ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
        ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);

        if (wallXmY0[DISTANCE] == 0 && !isLiquidWaterType(wall[TYPE])) { // wall to the left and below
          if (localX + localY < 1.0) {
            opacity = 1.0;
            water = texture(waterTex, texCoordX0Ym);
            ivec4 savedWall = wall;
            wall = wallX0Ym;
            if (wall[TYPE] == WALLTYPE_ICE)
              color = getIceColor(water[SNOW]);
            else {
              color = getLandColor(localY - 0.6);
              applyFloodWaterSheet(localY - 0.6);
            }
            wall = savedWall;
            shadowLight = minShadowLight; // fire should not light ground
          }
        }
        if (wallXpY0[DISTANCE] == 0 && !isLiquidWaterType(wall[TYPE])) { // wall to the right and below
          if (localY - localX < 0.0) {
            opacity = 1.0;
            water = texture(waterTex, texCoordX0Ym);
            ivec4 savedWall = wall;
            wall = wallX0Ym;
            if (wall[TYPE] == WALLTYPE_ICE)
              color = getIceColor(water[SNOW]);
            else {
              color = getLandColor(localY - 0.6);
              applyFloodWaterSheet(localY - 0.6);
            }
            wall = savedWall;
            shadowLight = minShadowLight; // fire should not light ground
          }
        }
      }
    }
    float arrow = vectorField(base.xy, displayVectorField);

    if (arrow > 0.5) {
      fragmentColor = vec4(vec3(1., 1., 0.), 1.);
      return; // exit shader
    }

    // color.rg += vec2(arrow);
    // color.b -= arrow;
    // opacity += arrow;
    // lightIntensity += arrow;
  }


  // Sunset red peaks near dusk, then fades so deep night has no reddish sun tint on clouds.
  float absSunAng = abs(localSunAngle);
  float scatering = clamp(map_range(absSunAng, 75. * deg2rad, 88. * deg2rad, 0., 1.), 0., 1.);
  float deepNight = clamp(map_range(absSunAng, 88. * deg2rad, 96. * deg2rad, 0., 1.), 0., 1.);
  scatering *= (1.0 - deepNight);

  vec3 sunTint = sunColor(scatering);
  vec3 finalLight = sunTint * lightIntensity;


  if (fract(cursor.w) > 0.5) {                                               // enable flashlight
    vec2 vecFromMouse = cursor.xy - texCoord;
    vecFromMouse.x *= texelSize.y / texelSize.x;                             // aspect ratio correction to make it a circle
                                                                             // shadowLight += max(1. / (1.+length(vecFromMouse)*5.0),0.0); // point light
    shadowLight += max(cos(min(length(vecFromMouse) * 5.0, 2.)) * 1.0, 0.0); // smooth flashlight
  }

  vec3 ambientLight = texture(ambientLightTex, texCoord).rgb;

  onLight += ambientLight * pow(1. - clamp(-texCoord.y * 15., 0., 1.), 2.5);


  finalLight += sunTint * shadowLight + onLight;

  // Lightning fill: soft in-cloud lift only — never dominate scene chroma (dust/sky wash).
  {
    float flashLum = max(dot(lightningFillLight, vec3(0.2126, 0.7152, 0.0722)), 0.0);
    if (flashLum > 1e-6) {
      float baseLum = max(dot(finalLight, vec3(0.2126, 0.7152, 0.0722)), 0.015);
      // Cap fill so existing lighting (incl. dust/cloud albedo under sun) keeps its colour.
      flashLum = min(flashLum, baseLum * 0.45 + 0.03);
      float sunLum = max(dot(sunTint, vec3(0.2126, 0.7152, 0.0722)), 0.05);
      vec3 sunChroma = sunTint / sunLum;
      // Prefer neutral white over bolt palette — blue flash recolored brown dust globally.
      float preserveSunChroma = (1.0 - deepNight) * 0.75;
      vec3 fillChroma = mix(vec3(1.0), sunChroma, preserveSunChroma);
      finalLight += fillChroma * flashLum;
    }
  }

  // June 8 flash spill compositing (harmony-scaled earlier)
  if (wall[DISTANCE] == 0)
    finalLight += icccSurf + precipBoltShafts;
  else if (texCoord.y > 0.0 && texCoord.y <= 1.0)
    finalLight += icccCloud + icccSurf * max(precipF, 0.22);
  else if (texCoord.y < 0.0)
    finalLight += icccSurf + precipBoltShafts;

  opacity += min(length(emittedLight) * 0.1, 0.2);
  opacity = clamp(opacity, 0.0, 1.0);
  vec3 litBase = max(color * finalLight, 0.);
  float emitCoupling = mix(1.0, lightningBloomCoupling, 0.45);
  vec3 safeEmitted = (emittedLight * emitCoupling) / (vec3(1.0) + emittedLight * (0.35 / max(flashSoftClip, 0.05)));
  // Brightness / Contrast / Glow must run AFTER tonemap — HDR crush hid slider changes.
  float ltLook = max(ltBrightness, 0.02) * max(ltContrast, 0.02);
  float ltGlowLook = 0.35 + 0.95 * max(ltGlowStrength, 0.0);
  safeEmitted *= ltLook * ltGlowLook;
  // Soft-cap bolt HDR so bloom doesn't lift the whole frame's colour during strikes.
  float boltHdr = max(dot(safeEmitted, vec3(0.2126, 0.7152, 0.0722)), 0.0);
  if (boltHdr > 8.0)
    safeEmitted *= 8.0 / boltHdr;
  // Additive bolts only — never replace lit cloud/dust colour with flash.
  vec3 finalColor = litBase + safeEmitted;

  // Keep severe-core chroma through lightning / fill: re-apply as luminance-preserving tint
  // after lighting so bright flashes cannot bleach the hue away.
  if (precipCoreHueAmt > 0.001) {
    float lum = max(dot(finalColor, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    float hueLum = max(dot(precipCoreHue, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
    vec3 hueKeepLum = precipCoreHue * (lum / hueLum);
    // Soft multiply + ease so flash-lit cores keep a blended cast (not a hard wash)
    vec3 softMul = mix(vec3(1.0), precipCoreHue, 0.40);
    vec3 tinted = mix(finalColor * softMul, hueKeepLum, 0.30);
    float flashAmt = smoothstep(0.03, 0.75, precipCoreHueAmt) * 0.34;
    finalColor = mix(finalColor, tinted, flashAmt);
  }

  // Near-surface fog / haze in moist cool air (off when fogHazeStrength == 0)
  if (fogHazeStrength > 0.0 && wall[DISTANCE] > 0) {
    float rhFog = relativeHumd(realTemp, water[TOTAL]);
    float nearSfc = 1.0 - smoothstep(0.0, 0.14, texCoord.y);
    float cool = 1.0 - smoothstep(2.0, 18.0, KtoC(realTemp));
    float moist = smoothstep(0.72, 1.05, rhFog) + smoothstep(0.15, 1.5, water[CLOUD]) * 0.35;
    float fogAmt = clamp(fogHazeStrength * nearSfc * moist * cool, 0.0, 0.9);
    vec3 fogCol = mix(vec3(0.72, 0.78, 0.88), rainShaftTint, 0.35) * max(max(lightIntensity, shadowLight), 0.15);
    finalColor = mix(finalColor, fogCol, fogAmt * 0.7);
    opacity = mix(opacity, max(opacity, 0.4), fogAmt * 0.45);
  }

  // Soft wet highlight — keep flood tint lit/shadowed so ponding stays visible after lighting
  if (wall[DISTANCE] == 0 && isFloodTintLandType(wall[TYPE]) && floodPondingMm() > 0.0) {
    float depthLit = float(-wall[VERT_DISTANCE]) - fract(fragCoord.y);
    float floodA = floodSheetOpacity(max(depthLit, 0.0));
    if (floodA > 0.0) {
      float sunLit = clamp(max(lightIntensity, shadowLight), 0.08, 1.0);
      vec3 shadowedFlood = floodWaterColor() * mix(0.55, 1.0, sunLit);
      finalColor = mix(finalColor, shadowedFlood, clamp(floodA * 0.65 * sunLit, 0.0, 0.75));
    }
  }

  fragmentColor = vec4(finalColor, opacity);

  drawCursor(cursor, view); // over everything else
}
