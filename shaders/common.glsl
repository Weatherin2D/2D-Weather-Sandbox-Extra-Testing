precision highp int;
precision highp isampler2D;

#define PI 3.1415926535897932384626433832795
#define rad2deg 57.2958
#define deg2rad 0.0174533


#define lightHeatingConst 0.000002   // how much a unit of IR or sunlight (W/m2) changes the temperature per iteration

#define standardSunBrightness 1250.; // W/m2

#define maxWaterTemp 40.0

#define waterHeatExchangeRate 0.0002

#define waterHeatCapacity 50.0     // as multiple of airs heat capacity

#define fullGreenSoilMoisture 50.0 // level of soil moisture where vegetation reaches the greenest color

// Max soil moisture (field capacity) is a GUI uniform: maxSoilMoisture (default 85 mm).
#define maxInfiltrationRate 1.2      // mm per iteration; caps burst infiltration from downpours
#define soilMoistureMax 100000.0     // mm; flood height can exceed visual full-opacity depth (~100 m pack limit)
#define floodFullOpacityDepthM 25.0  // metres where floodwater opacity reaches 100% (50% at 5 m)
#define floodHalfOpacityDepthM 5.0   // metres where floodwater opacity reaches 50%
#define sustainedMoistureGain 0.12   // fraction of infiltrated rain that builds long-term climate moisture
#define sustainedMoistureDecay 0.00002 // mm per iteration; climate moisture memory (was 0.00015 — drained greenness too fast)
#define minVegetationMoisture 12.0   // mm sustained moisture required for vegetation growth

#define iterPerSimDay 300000.0              // in-game iterations per day (timePerIteration = 0.00008 h)
#define vegDiebackDaysPerPointMild 50.0      // days between biomass loss when stress is barely above zero (10x slower)
#define vegDiebackDaysPerPointSevere 3.2   // days between loss under severe drought (~20 days grass, ~60–100 days forest)
#define vegDiebackMinIter 120000.0           // minimum spacing between dieback steps (10x slower)
#define vegTreeDiebackSlowdown 3.8          // large trees die slower than grass

#define fullWhiteSnowHeight 10.0   // snow height at witch full whiteness is displayed and max albedo is achieved
#define snowMassToHeight 0.05

#define snowMeltRate 0.000015
#define snowSublimationRate 0.000008 // surface snow/ice sublimation when below 0 C
#define iceMeltRate 0.004            // ice sheet melt rate driven by warm air above surface
#define waterFreezeRate 0.08         // open water freeze rate; scales with degrees below freezing
#define iceGrowthRate 0.015          // cm per cold iteration for thickening ice sheets
#define minIceFormThickness 3.0      // cm initial ice when water freezes
#define thinIceBreakupCm 12.0        // thin ice breaks up in wind/warmth
#define iceCapFormSnowCm 80.0        // snow depth before compaction to land ice
#define maxIceThickness 2000.0       // cm max ice sheet / ice cap thickness
#define oceanSalinityPpt 35.0        // default ocean salinity (parts per thousand)
#define landIceSalinityMarker -1.0   // marks land-origin ice (glaciers / ice caps); melts back to land

#define ALBEDO_ICE 0.70
#define ALBEDO_SNOW 0.80        // above 10 cm of snow cover without vegetation
#define ALBEDO_SNOW_FOREST 0.28 // at max vegetation and above 10 cm of snow
#define ALBEDO_FOREST 0.10
#define ALBEDO_GRASS 0.20       // short grass / shrub canopy
#define ALBEDO_DRYSOIL 0.35     // desert sand / bare dry soil
#define ALBEDO_WETSOIL 0.16     // above 20 mm of soil moisture
#define ALBEDO_URBAN 0.12       // mixed city roofs/pavement
#define ALBEDO_SUBURBAN 0.18
#define ALBEDO_INDUSTRIAL 0.10
#define ALBEDO_RUNWAY 0.05      // asphalt
#define ALBEDO_WATER 0.06       // open ocean
#define ALBEDO_FRESH_WATER 0.08 // lakes / rivers (slightly higher)
#define ALBEDO_INERT 0.90       // non-heated boundary / bedrock filler

// TEXTURE DESCRIPTIONS AND DEFINES

// base texture: RGBA32F
// .x  Horizontal velocity                              -1.0 to 1.0
// .y  Vertical   velocity                              -1.0 to 1.0
#define VX 0
#define VY 1
#define PRESSURE 2    // Pressure                                          >= 0
#define TEMPERATURE 3 // Temperature in air and water, indicator in wall

// water texture: RGBA32F
#define TOTAL 0         // Vapor + cloud water             >= 0
#define CLOUD 1         // cloud water                     >= 0
#define PRECIPITATION 2 // precipitation in air            >= 0
#define SOIL_MOISTURE 2 // active surface moisture in mm   >= 0
#define DUST 3          // dust/smog in air                >= 0 (desert loft, urban, brush)
#define SMOKE 3         // legacy alias → DUST channel; combustion smoke is separate smokeTex
#define SNOW 3          // snow at surface in cm           0 to 40000
#define SUSTAINED_MOISTURE 1 // long-term climate moisture at land surface only (reuses CLOUD channel)
#define SALINITY 1           // salinity ppt on water & ice surface only (reuses CLOUD channel)

#define WATER_MARKER_LAND 1001.0
#define WATER_MARKER_SALT 1002.0
#define WATER_MARKER_FRESH 1003.0
#define WATER_MARKER_ICE 1004.0

// Standing flood depth on land walls is packed into TOTAL above WATER_MARKER_LAND.
// Keeps the land marker band below SALT (1002): floodMm * scale < 1.0 → up to 100000 mm.
#define FLOOD_HEIGHT_SCALE 1.0e-5
// Float32 around 1001 has ~0.00012 ULP (~12 mm at this scale). Ignore smaller "phantom" floods.
#define FLOOD_HEIGHT_NOISE_MM 40.0

bool isLandWaterMarker(float total)
{
  return total >= WATER_MARKER_LAND && total < WATER_MARKER_SALT;
}

float getFloodHeightMm(float total)
{
  if (!isLandWaterMarker(total))
    return 0.0;
  float mm = (total - WATER_MARKER_LAND) / FLOOD_HEIGHT_SCALE;
  // Kill float-precision ghosts (often ~12–20 mm on the bottom land layer)
  if (mm < FLOOD_HEIGHT_NOISE_MM)
    return 0.0;
  return clamp(mm, 0.0, soilMoistureMax);
}

float encodeLandWithFlood(float floodMm)
{
  if (floodMm < FLOOD_HEIGHT_NOISE_MM)
    return WATER_MARKER_LAND;
  return WATER_MARKER_LAND + clamp(floodMm, 0.0, soilMoistureMax) * FLOOD_HEIGHT_SCALE;
}

// wall texture: RGBA8I
#define TYPE 0 //             walltype:

#define WALLTYPE_INERT 0
#define WALLTYPE_LAND 1
#define WALLTYPE_WATER 2      // salt water / ocean
#define WALLTYPE_FIRE 3
#define WALLTYPE_URBAN 4
#define WALLTYPE_RUNWAY 5
#define WALLTYPE_INDUSTRIAL 6
#define WALLTYPE_SUBURBAN 7
#define WALLTYPE_FRESH_WATER 8 // lakes / rivers
#define WALLTYPE_ICE 9         // frozen water, ice sheets, ice caps
// Custom terrain: atlas slot is encoded in TYPE so VEGETATION stays free for grass/forest
#define WALLTYPE_CUSTOM_BASE 10           // slots 10..17
#define WALLTYPE_CUSTOM_BASE_LAST 17
#define WALLTYPE_CUSTOM_OVERLAY 18        // slots 18..25
#define WALLTYPE_CUSTOM_OVERLAY_LAST 25
// Deciduous forest species (same physics as land/fire; distinct tree atlas strip)
#define WALLTYPE_FOREST2 26
#define WALLTYPE_FIRE_FOREST2 27
// Texture-based American suburban (urban-like facade physics, own atlas strip)
#define WALLTYPE_AMERICAN_SUBURBAN 28

#define DISTANCE 1      // manhattan distance to nearest wall                   0 to 127
#define VERT_DISTANCE 2 // height above/below ground. Surface = 0               -127 to 127
#define VEGETATION 3    // vegetation 0–127: grass/shrub 0–50, forest 51–127 (mutually exclusive bands)

bool isCustomBase(int t) { return t >= WALLTYPE_CUSTOM_BASE && t <= WALLTYPE_CUSTOM_BASE_LAST; }
bool isCustomOverlay(int t) { return t >= WALLTYPE_CUSTOM_OVERLAY && t <= WALLTYPE_CUSTOM_OVERLAY_LAST; }
bool isCustomTerrain(int t) { return isCustomBase(t) || isCustomOverlay(t); }
bool isForest2Land(int t) { return t == WALLTYPE_FOREST2; }
bool isForest2Fire(int t) { return t == WALLTYPE_FIRE_FOREST2; }
bool isForest2Species(int t) { return t == WALLTYPE_FOREST2 || t == WALLTYPE_FIRE_FOREST2; }
bool isAnyFireType(int t) { return t == WALLTYPE_FIRE || t == WALLTYPE_FIRE_FOREST2; }
bool isLandOrForest2(int t) { return t == WALLTYPE_LAND || t == WALLTYPE_FOREST2; }
bool isLandFireOrForest2(int t) { return t == WALLTYPE_LAND || t == WALLTYPE_FIRE || isForest2Species(t); }
bool isUrbanLike(int t) { return t == WALLTYPE_URBAN || t == WALLTYPE_AMERICAN_SUBURBAN; }
int igniteFireType(int landType) { return landType == WALLTYPE_FOREST2 ? WALLTYPE_FIRE_FOREST2 : WALLTYPE_FIRE; }
int extinguishFireType(int fireType) { return fireType == WALLTYPE_FIRE_FOREST2 ? WALLTYPE_FOREST2 : WALLTYPE_LAND; }
int customAtlasSlot(int t)
{
  if (isCustomBase(t)) return t - WALLTYPE_CUSTOM_BASE;
  if (isCustomOverlay(t)) return t - WALLTYPE_CUSTOM_OVERLAY;
  return 0;
}
int makeCustomBaseType(int slot) { return WALLTYPE_CUSTOM_BASE + clamp(slot, 0, 7); }
int makeCustomOverlayType(int slot) { return WALLTYPE_CUSTOM_OVERLAY + clamp(slot, 0, 7); }

#define GRASS_VEG_MAX 50
#define FOREST_VEG_MIN 51
#define FOREST_VEG_MAX 127

float grassBiomass(int veg) { return float(min(veg, GRASS_VEG_MAX)); }

float forestBiomass(int veg) { return float(max(veg - GRASS_VEG_MAX, 0)); }

bool isForestVegetation(int veg) { return veg > GRASS_VEG_MAX; }

// Combined surface influence — forest transpires and shelters more than grass
float vegetationInfluence(int veg) { return grassBiomass(veg) * 0.38 + forestBiomass(veg) + 0.08; }


//  light texture: RGBA32F
#define SUNLIGHT 0    // sunlight                                             0 to 1.0
#define NET_HEATING 1 // net heating effect of IR + sun absorbed by smoke
#define IR_DOWN 2     // IR coming down                                       >= 0
#define IR_UP 3       // IR going  up                                         >= 0

// Precipitation mass:
#define WATER 0
#define ICE 1

// Precipitation feedback
#define MASS 0
#define HEAT 1
#define VAPOR 2
// 3 not used

// Lightning Location
// #define POSX 0
// #define POSY 1
#define START_ITERNUM 2
#define INTENSITY 3

// Precipitation deposition
#define RAIN_DEPOSITION 0
#define SNOW_DEPOSITION 1


// Universal Functions
float map_range(float value, float min1, float max1, float min2, float max2) { return min2 + (value - min1) * (max2 - min2) / (max1 - min1); }

float map_rangeC(float value, float min1, float max1, float min2, float max2) { return clamp(map_range(value, min1, max1, min2, max2), min(min2, max2), max(min2, max2)); }

// sunZenithAngle: 0 = overhead, PI/2 = horizon. sunAzimuth: hour angle (rad), 0 at solar noon.
vec2 sunlightSampleOffset(vec2 texelSize, float sunZenithAngle, float sunAzimuth)
{
  return vec2(sin(sunZenithAngle) * sin(sunAzimuth) * texelSize.x, cos(sunZenithAngle) * texelSize.y);
}

vec2 sunlightDirection(float sunZenithAngle, float sunAzimuth)
{
  return vec2(sin(sunZenithAngle) * sin(sunAzimuth), cos(sunZenithAngle));
}

// sunColumnTex RGBA: R=top sun intensity, G=zenith rad, B=azimuth rad, A=climate sea-level °C
vec4 sampleSunColumn(sampler2D sunColumnTex, float texX)
{
  return texture(sunColumnTex, vec2(texX, 0.5));
}

float climateTempCFromLatitude(float lat)
{
  return 30.0 - 55.0 * pow(abs(lat) / 90.0, 1.15);
}

const float SUN_HORIZON_LINE = 0.028;

vec2 sunScreenPosition(float sunZenithAngle, float sunAzimuth)
{
  float sunElevRad = clamp(PI * 0.5 - sunZenithAngle, 0.0, PI * 0.5);
  return vec2(0.5 + 0.44 * sin(sunAzimuth), SUN_HORIZON_LINE + 0.94 * sin(sunElevRad));
}

// Lighting sun can sit below the screen horizon briefly after sunset (upward rays).
vec2 sunScreenPositionForLight(float sunZenithAngle, float sunAzimuth)
{
  float horiz = 0.5 + 0.44 * sin(sunAzimuth);
  float elev = PI * 0.5 - sunZenithAngle;
  if (elev >= 0.0)
    return vec2(horiz, SUN_HORIZON_LINE + 0.94 * sin(min(elev, PI * 0.5)));
  float below = clamp(-elev / 0.30, 0.0, 1.0);
  float underglow = (1.0 - smoothstep(0.42, 1.0, below)) * smoothstep(0.0, 0.12, below);
  return vec2(horiz, SUN_HORIZON_LINE - 0.055 * underglow - 0.025 * below);
}

// 0 at day/deep night; peaks just after sunset with light from below the horizon.
float twilightUnderglowStrength(float sunZenithAngle)
{
  float z = sunZenithAngle;
  float below = max(z - PI * 0.5, 0.0);
  float under = (1.0 - smoothstep(0.0, 0.20, below)) * smoothstep(0.0, 0.035, below);
  float approach = smoothstep(1.50, 1.565, z) * (1.0 - smoothstep(1.565, 1.59, z));
  return max(under, approach * 0.3);
}

// Unit step toward the sun in texCoord space (aspect-corrected).
vec2 sunlightRayToSun(vec2 texelSize, vec2 texCoord, float sunZenithAngle, float sunAzimuth)
{
  vec2 sunPos = sunScreenPositionForLight(sunZenithAngle, sunAzimuth);
  vec2 toSun = sunPos - texCoord;
  toSun.x *= texelSize.y / texelSize.x;
  float len = length(toSun);
  if (len < 1e-5)
    return vec2(0.0, texelSize.y);
  return (toSun / len) * texelSize;
}

// Hermite-smoothed cloud water (reduces grid speckle in shadow rays).
float smoothCloudWaterAt(sampler2D waterTex, vec2 tc)
{
  vec2 st = tc * resolution - vec2(0.5);
  vec2 ipos = floor(st);
  vec2 fpos = fract(st);
  vec2 sf = fpos * fpos * (3.0 - 2.0 * fpos);
  vec2 uvA = (ipos + vec2(0.5, 0.5)) / resolution;
  vec2 uvB = (ipos + vec2(1.5, 0.5)) / resolution;
  vec2 uvC = (ipos + vec2(0.5, 1.5)) / resolution;
  vec2 uvD = (ipos + vec2(1.5, 1.5)) / resolution;
  float a = texture(waterTex, uvA)[CLOUD];
  float b = texture(waterTex, uvB)[CLOUD];
  float c = texture(waterTex, uvC)[CLOUD];
  float d = texture(waterTex, uvD)[CLOUD];
  return mix(mix(a, b, sf.x), mix(c, d, sf.x), sf.y);
}

// Per-pixel visibility to the sun (0 = in shadow, 1 = full sun). Shadows fan out from sun position.
float sunLineOfSightVisibility(sampler2D waterTex, isampler2D wallTex, vec2 texCoord, vec2 texelSize, float sunZenithAngle, float sunAzimuth)
{
  vec2 sunPos = sunScreenPositionForLight(sunZenithAngle, sunAzimuth);
  vec2 toSun = sunPos - texCoord;
  toSun.x *= texelSize.y / texelSize.x;
  float dist = length(toSun);
  if (dist < length(texelSize) * 0.25)
    return 1.0;

  vec2 stepUV = (toSun / dist) * texelSize;
  float stepsNeeded = dist / max(length(stepUV), 1e-7);
  int maxSteps = int(clamp(stepsNeeded, 8.0, 220.0));
  float transmittance = 1.0;

  for (int i = 1; i < 224; i++) {
    if (i >= maxSteps)
      break;
    vec2 p = texCoord + stepUV * float(i);
    if (p.y > 1.0)
      return transmittance;
    if (p.y < 0.0 || p.x < 0.0 || p.x > 1.0)
      return transmittance;

    if (texture(wallTex, p)[DISTANCE] == 0)
      return 0.0; // wall blocks sun

    vec4 w = texture(waterTex, p);
    float cloudW = smoothCloudWaterAt(waterTex, p);
    // Only dense cloud blocks direct sun; thin wisps stay mostly transparent to light.
    float thickCloud = max(cloudW - 5.0, 0.0);
    float cloudShadowWeight = pow(clamp(thickCloud / 14.0, 0.0, 1.0), 2.0);
    float cloudExtinction = cloudShadowWeight * cloudW * 0.008;
    // Dust (water ch3) only here — callers that have smokeTex should sum smoke at the sample site separately if needed.
    float extinction = min(cloudExtinction + w[PRECIPITATION] * 0.025 + w[DUST] * 0.004, 0.92);
    transmittance *= (1.0 - extinction);
  }
  return transmittance;
}

// Line-of-sight with dust + combustion smoke extinction (smokeTex R channel).
float sunLineOfSightVisibilitySmoke(sampler2D waterTex, sampler2D smokeTex, isampler2D wallTex, vec2 texCoord, vec2 texelSize, float sunZenithAngle, float sunAzimuth)
{
  vec2 sunPos = sunScreenPositionForLight(sunZenithAngle, sunAzimuth);
  vec2 toSun = sunPos - texCoord;
  toSun.x *= texelSize.y / texelSize.x;
  float dist = length(toSun);
  if (dist < length(texelSize) * 0.25)
    return 1.0;

  vec2 stepUV = (toSun / dist) * texelSize;
  float stepsNeeded = dist / max(length(stepUV), 1e-7);
  int maxSteps = int(clamp(stepsNeeded, 8.0, 220.0));
  float transmittance = 1.0;

  for (int i = 1; i < 224; i++) {
    if (i >= maxSteps)
      break;
    vec2 p = texCoord + stepUV * float(i);
    if (p.y > 1.0)
      return transmittance;
    if (p.y < 0.0 || p.x < 0.0 || p.x > 1.0)
      return transmittance;

    if (texture(wallTex, p)[DISTANCE] == 0)
      return 0.0;

    vec4 w = texture(waterTex, p);
    float smokeAmt = texture(smokeTex, p).r;
    float cloudW = smoothCloudWaterAt(waterTex, p);
    float thickCloud = max(cloudW - 5.0, 0.0);
    float cloudShadowWeight = pow(clamp(thickCloud / 14.0, 0.0, 1.0), 2.0);
    float cloudExtinction = cloudShadowWeight * cloudW * 0.008;
    float aerosol = w[DUST] + smokeAmt;
    float extinction = min(cloudExtinction + w[PRECIPITATION] * 0.025 + aerosol * 0.004, 0.92);
    transmittance *= (1.0 - extinction);
  }
  return transmittance;
}

uint hash(uint x)
{
  x += (x << 10u);
  x ^= (x >> 6u);
  x += (x << 3u);
  x ^= (x >> 11u);
  x += (x << 15u);
  return x;
}
float random(float f)
{
  const uint mantissaMask = 0x007FFFFFu;
  const uint one = 0x3F800000u;

  uint h = hash(floatBitsToUint(f));
  h &= mantissaMask;
  h |= one;

  float r2 = uintBitsToFloat(h);
  // return mod(r2 - 1.0, 1.0);
  return fract(r2);
}

float random2d(vec2 s)
{
  const uint mantissaMask = 0x007FFFFFu;
  const uint one = 0x3F800000u;

  uint h = hash(floatBitsToUint(s.x) + hash(floatBitsToUint(s.y)));
  h &= mantissaMask;
  h |= one;

  float r2 = uintBitsToFloat(h);
  return mod(r2, 1.0);
}

float rand2d(vec2 co)
{
  const float a = 12.9898;
  const float b = 78.233;
  const float c = 43758.5453123;
  float dt = dot(co.xy, vec2(a, b));
  float sn = mod(dt, 3.14);
  return fract(sin(sn) * c);
}

// Temperature Functions

float potentialToRealT(float potential) { return potential - texCoord.y * dryLapse; }

float potentialToRealT(float potential, float texCoordY) { return potential - texCoordY * dryLapse; }

float realToPotentialT(float real) { return real + texCoord.y * dryLapse; }

float CtoK(float c) { return c + 273.15; }

float KtoC(float k) { return k - 273.15; }

bool isLiquidWaterType(int wallType) { return wallType == WALLTYPE_WATER || wallType == WALLTYPE_FRESH_WATER; }

bool isAnyWaterType(int wallType) { return isLiquidWaterType(wallType) || wallType == WALLTYPE_ICE; }

float salinityForWallType(int wallType, float salinityChannel)
{
  if (wallType == WALLTYPE_FRESH_WATER)
    return 0.0;
  if (wallType == WALLTYPE_WATER)
    return max(salinityChannel, oceanSalinityPpt);
  if (wallType == WALLTYPE_ICE)
    return salinityChannel;
  return 0.0;
}

float waterFreezeTempC(float salinityPpt) { return -0.054 * salinityPpt; }

int liquidWaterTypeFromSalinity(float salinityPpt)
{
  if (salinityPpt < 5.0)
    return WALLTYPE_FRESH_WATER;
  return WALLTYPE_WATER;
}

// Land glaciers / ice caps use a negative salinity marker so melt restores land + snow,
// instead of becoming a lake. Frozen lakes/seas keep salinity >= 0 and melt to water.
// IMPORTANT: advection must NOT clamp SUSTAINED_MOISTURE on ice — that channel is SALINITY.
bool isLandOriginIce(float salinityPpt) { return salinityPpt < 0.0; }

float dT_saturated(float dTdry,
                   float dTl) // dTl = temperature difference because of latent heat
{
  float denom = dTdry - dTl;
  if (abs(denom) < 1e-8)
    return dTdry;
  return dTdry * (dTdry / denom);
}
////////////// Water Functions ///////////////
#define wf_devider 250.0 // 250.0 Real water 	230 less steep curve
#define wf_pow 17.0      // 17.0						10
// https://www.geogebra.org/calculator/jc9hkfq4

float maxWater(float T)
{
  return pow((T / wf_devider), wf_pow); // T in Kelvin, w in grams per m^3
}

float dewpoint(float W)
{
  if (W < 0.00001)
    return 0.0;
  else
    return wf_devider * pow(W, 1.0 / wf_pow);
}

float relativeHumd(float T, float W) { return (W / maxWater(T)); }

// interpolation

vec4 bilerp(sampler2D tex, vec2 pos)
{
  vec2 st = pos - 0.5; // calc pixel coordinats

  vec2 ipos = vec2(floor(st));
  vec2 fpos = fract(st);

  ipos /= resolution;
  ipos += texelSize * 0.5;

  vec4 a = texture(tex, ipos);
  vec4 b = texture(tex, ipos + vec2(texelSize.x, 0));
  vec4 c = texture(tex, ipos + vec2(0, texelSize.y));
  vec4 d = texture(tex, ipos + vec2(texelSize.x, texelSize.y));

  float mixAB = fpos.x;
  float mixCD = fpos.x;
  float mixAB_CD = fpos.y;

  return mix(mix(a, b, mixAB), mix(c, d, mixCD), mixAB_CD);
}

vec4 bilerpWall(sampler2D tex, isampler2D wallTex,
                vec2 pos) // prevents sampeling from wall cell
{
  vec2 st = pos - 0.5;    // calc pixel coordinats

  vec2 ipos = vec2(floor(st));
  vec2 fpos = fract(st);

  vec4 a = texture(tex, (ipos + vec2(0.5, 0.5)) / resolution);
  vec4 b = texture(tex, (ipos + vec2(1.5, 0.5)) / resolution);
  vec4 c = texture(tex, (ipos + vec2(0.5, 1.5)) / resolution);
  vec4 d = texture(tex, (ipos + vec2(1.5, 1.5)) / resolution);

  ivec4 wa = texture(wallTex, (ipos + vec2(0.5, 0.5)) / resolution);
  ivec4 wb = texture(wallTex, (ipos + vec2(1.5, 0.5)) / resolution);
  ivec4 wc = texture(wallTex, (ipos + vec2(0.5, 1.5)) / resolution);
  ivec4 wd = texture(wallTex, (ipos + vec2(1.5, 1.5)) / resolution);

  float mixAB = fpos.x;
  float mixCD = fpos.x;
  float mixAB_CD = fpos.y;

  if (wa[DISTANCE] == 0)
    mixAB = 1.;
  else if (wb[DISTANCE] == 0)
    mixAB = 0.;

  if (wc[DISTANCE] == 0)
    mixCD = 1.;
  else if (wd[DISTANCE] == 0)
    mixCD = 0.;

  if (wa[DISTANCE] == 0 && wb[1] == 0)
    mixAB_CD = 1.;
  else if (wc[DISTANCE] == 0 && wd[DISTANCE] == 0)
    mixAB_CD = 0.;

  return mix(mix(a, b, mixAB), mix(c, d, mixCD), mixAB_CD);
}

#define IR_constant 5.670374419 // ×10−8

float IR_emitted(float T)
{
  return pow(T * 0.01, 4.) * IR_constant; // Stefan–Boltzmann law
}

float IR_temp(float IR) // inversed Stefan–Boltzmann law
{
  return pow(IR / IR_constant, 1. / 4.) * 100.0;
}

float absHorizontalDist(float a, float b) // for wrapping horizontal position around simulation border
{
  return min(min(abs(a - b), abs(1.0 + a - b)), 1.0 - a + b);
}
/*
float realMod(float a, float b)
{
    // proper modulo to handle negative numbers
    return mod(mod(a, b) + b, b);
}
*/


// new hash funtions:


// Standard 2x2 hash algorithm.
vec2 hash22(vec2 p, float seed)
{
  float n = sin(dot(p, vec2(41, 289)));
  p = fract(vec2(2097152, 262144) * n);
  return cos(p * 6.283 + seed * 2.);
  return abs(fract(p + seed * .5) - .5) * 4. - 1.;  // Snooker.
  return abs(cos(p * 6.283 + seed * 2.)) * 2. - 1.; // Bounce.
}

float simplesque2D(vec2 p, float seed)
{
  vec2 s = floor(p + (p.x + p.y) * .3660254); // Skew the current point.
  p -= s - (s.x + s.y) * .2113249;            // Vector to unskewed base vertice.

  // Clever way to perform an "if" statement to determine which of two triangles we need.
  float i = p.x < p.y ? 1. : 0.; // Apparently, faster than: step(p.x, p.y);

  vec2 ioffs = vec2(1. - i, i);  // Vertice offset, based on above.

  // Vectors to the other two triangle vertices.
  vec2 p1 = p - ioffs + .2113249, p2 = p - .5773502;

  // Vector to hold the falloff value of the current pixel with respect to each vertice.
  vec3 d = max(.5 - vec3(dot(p, p), dot(p1, p1), dot(p2, p2)), 0.); // Range [0, 0.5]

  d *= d * d * 12.;                                                 //(2*2*2*1.5)
  // d *= d*d*d*36.;

  vec3 w = vec3(dot(hash22(s, seed), p), dot(hash22(s + ioffs, seed), p1), dot(hash22(s + 1., seed), p2));
  return .5 + dot(w, d); // Range [0, 1]... Hopefully. Needs more attention.
}

float func2D(vec2 p, float seed) { return simplesque2D(p * 4., seed) * .66 + simplesque2D(p * 8., seed) * 0.34; }


// src: https://www.shadertoy.com/view/WttXWX

// --- choose one:
// #define hashi(x) lowbias32(x)
// #define hashi(x) triple32(x)

// #define hash(x) (float(hashi(x)) / float(0xffffffffU))


// bias: 0.17353355999581582 ( very probably the best of its kind )
uint lowbias32(uint x)
{
  x ^= x >> 16;
  x *= 0x7feb352dU;
  x ^= x >> 15;
  x *= 0x846ca68bU;
  x ^= x >> 16;
  return x;
}

// bias: 0.020888578919738908 = minimal theoretic limit
uint triple32(uint x)
{
  x ^= x >> 17;
  x *= 0xed5ad4bbU;
  x ^= x >> 11;
  x *= 0xac4c1b51U;
  x ^= x >> 15;
  x *= 0x31848babU;
  x ^= x >> 14;
  return x;
}

float hash2(int x) { return float(triple32(uint(x))) / float(0xffffffffU); }


// float h = hash( V.x + hashi(V.y) ); // clean 2D hash
//  float h = hash( V.x + (V.y<<16) );  // 2D hash (should be ok too )

float rand2(vec2 s)
{
  // return hash( x + hashi(y) ); // clean 2D hash
  return hash2(int(s.x * 379071.) + int(s.y * 756398.) << 16); // 2D hash (should be ok too )
}

// Color Functions

vec3 hsv2rgb(vec3 c)
{
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 sunColor(float scattering) // 0.0 = white     0.5 = orange     1.0 = red
{
  float val = 1.0 - scattering;
  return hsv2rgb(vec3(0.015 + val * 0.15, min(2.0 - val * 2.0, 1.), 1.));
}

// Color-scale lookup. interpolate != 0 samples the baked ramp with LINEAR
// filtering (RH-style smooth). interpolate == 0 snaps to the nearest stop.
vec4 sampleColorScale(sampler2D tex, int column, float t, int stops, int interpolate)
{
  t = clamp(t, 0.0, 1.0);
  if (interpolate != 0) {
    ivec2 scaleSize = textureSize(tex, 0);
    float u = (float(column) + 0.5) / float(scaleSize.x);
    return texture(tex, vec2(u, t));
  }
  int n = max(stops, 2);
  int palIdx = clamp(int(t * float(n - 1) + 0.5), 0, n - 1);
  return texelFetch(tex, ivec2(column, palIdx), 0);
}