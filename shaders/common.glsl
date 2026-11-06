precision highp int;
precision highp isampler2D;

#define PI 3.1415926535897932384626433832795
#define rad2deg 57.2958
#define deg2rad 0.0174533


#define lightHeatingConst 0.000002   // how much a unit of IR or sunlight (W/m2) changes the temperature per iteration

// Earth solar constant at 1 AU (TSIS-1 / IAU), W/m². Intensity slider 1.0 = this TOA beam.
#define earthSolarConstantWm2 1361.0
#define standardSunBrightness earthSolarConstantWm2

#define maxWaterTemp 40.0

#define waterHeatExchangeRate 0.0002 // sensible heat exchange between a water / ice surface and the air cell above
#define waterHeatCapacity 50.0       // as multiple of airs heat capacity

#define iceDensityGPerM3 917000.0
// Air column depth that lightHeatingConst heats by 1 K per W/m^2 per iteration: dt / (rho * cp * lightHeatingConst).
#define heatUnitDepthM 120.0
// Land near-surface air has no soil reservoir; this slows diurnal swings so nights
// cool less abruptly and the afternoon peak lags solar noon (water uses 50).
#define landHeatCapacity 5.5

#define fullGreenSoilMoisture 50.0 // level of soil moisture where vegetation reaches the greenest color

#define soilFieldCapacity 85.0       // mm; soil pore space reference (slows infiltration when exceeded; not a hard soil cap)
#define maxInfiltrationRate 1.2      // mm per iteration; caps burst infiltration from downpours
#define floodHeightPackMax 100000.0  // mm; TOTAL flood packing must stay below WATER_MARKER_SALT
#define soilMoistureSafetyMax 1.0e8  // mm; float safety only — not a gameplay/physics cap
#define floodFullOpacityDepthM 25.0  // metres where floodwater opacity reaches 100% (50% at 5 m)
#define floodHalfOpacityDepthM 5.0   // metres where floodwater opacity reaches 50%
#define sustainedMoistureGain 0.12   // fraction of infiltrated rain that builds long-term climate moisture
#define sustainedMoistureDecay 0.00002 // mm per iteration; climate moisture memory (was 0.00015 — drained greenness too fast)
#define minVegetationMoisture 12.0   // mm sustained moisture required for vegetation growth
#define rainFreqEwmaAlpha 0.004      // EWMA blend toward current "is raining" each surface step
#define rainOccurMinRate 0.02        // air precip intensity treated as a rain occurrence

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
#define RAIN_FREQ 3          // rain-occurrence frequency (0–1) stored negated in the land cell directly below the surface (reuses SNOW channel)
#define SALINITY 1           // salinity ppt on water & ice surface only (reuses CLOUD channel)

#define WATER_MARKER_LAND 1001.0
#define WATER_MARKER_SALT 1002.0
#define WATER_MARKER_FRESH 1003.0
#define WATER_MARKER_ICE 1004.0

// Standing flood depth on land walls is packed into TOTAL above WATER_MARKER_LAND.
// Keeps the land marker band below SALT (1002): floodMm * scale < 1.0 → up to floodHeightPackMax mm.
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
  return clamp(mm, 0.0, floodHeightPackMax);
}

float encodeLandWithFlood(float floodMm)
{
  if (floodMm < FLOOD_HEIGHT_NOISE_MM)
    return WATER_MARKER_LAND;
  return WATER_MARKER_LAND + clamp(floodMm, 0.0, floodHeightPackMax) * FLOOD_HEIGHT_SCALE;
}

// Rain frequency is stored negated so snow copied down from the surface (always >= 0) reads as 0.
float decodeRainFreq(float stored) { return clamp(-stored, 0.0, 1.0); }
float encodeRainFreq(float rainFreq) { return -clamp(rainFreq, 0.0, 1.0); }

float applySoilMoistureCap(float moistureMm, float soilMoistureCap)
{
  float m = moistureMm;
  if (m != m) // NaN
    m = 0.0;
  m = max(m, 0.0);
  if (soilMoistureCap > 0.0)
    m = min(m, soilMoistureCap);
  return min(m, soilMoistureSafetyMax);
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
// Extra urban looks (Downtown remains WALLTYPE_URBAN = 4)
#define WALLTYPE_URBAN_VARIANTS_BEGIN 29
#define WALLTYPE_URBAN_VARIANTS_END 39
// Extra suburban looks (Gabled = 7, American Tract = 28)
#define WALLTYPE_SUBURBAN_VARIANTS_BEGIN 40
#define WALLTYPE_SUBURBAN_VARIANTS_END 49

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
bool isAnyUrban(int t) {
  return t == WALLTYPE_URBAN || (t >= WALLTYPE_URBAN_VARIANTS_BEGIN && t <= WALLTYPE_URBAN_VARIANTS_END);
}
bool isAnySuburban(int t) {
  return t == WALLTYPE_SUBURBAN || t == WALLTYPE_AMERICAN_SUBURBAN
      || (t >= WALLTYPE_SUBURBAN_VARIANTS_BEGIN && t <= WALLTYPE_SUBURBAN_VARIANTS_END);
}
// Urban heat-island physics: all urban looks + American Tract (legacy)
bool isUrbanLike(int t) { return isAnyUrban(t) || t == WALLTYPE_AMERICAN_SUBURBAN; }
// Milder suburban physics (excludes American Tract)
bool isSoftSuburban(int t) { return isAnySuburban(t) && t != WALLTYPE_AMERICAN_SUBURBAN; }
bool isSettlementWall(int t) { return isAnyUrban(t) || isAnySuburban(t); }

int urbanWallTypeFromVariant(int v)
{
  v = clamp(v, 0, 11);
  if (v == 0) return WALLTYPE_URBAN;
  return WALLTYPE_URBAN_VARIANTS_BEGIN + v - 1;
}
int suburbanWallTypeFromVariant(int v)
{
  v = clamp(v, 0, 11);
  if (v == 0) return WALLTYPE_SUBURBAN;
  if (v == 1) return WALLTYPE_AMERICAN_SUBURBAN;
  return WALLTYPE_SUBURBAN_VARIANTS_BEGIN + v - 2;
}
// Atlas strip for baked extra looks. -1 = use a builtin strip or procedural painter.
int settlementSurfaceIndex(int t)
{
  if (t >= WALLTYPE_URBAN_VARIANTS_BEGIN && t <= WALLTYPE_URBAN_VARIANTS_END)
    return 7 + (t - WALLTYPE_URBAN_VARIANTS_BEGIN);
  if (t >= WALLTYPE_SUBURBAN_VARIANTS_BEGIN && t <= WALLTYPE_SUBURBAN_VARIANTS_END)
    return 18 + (t - WALLTYPE_SUBURBAN_VARIANTS_BEGIN);
  return -1;
}
float settlementMaxHeight(int t)
{
  if (t == WALLTYPE_URBAN) return 400.0;
  if (t == WALLTYPE_SUBURBAN) return 35.0;
  if (t == WALLTYPE_AMERICAN_SUBURBAN) return 55.0;
  if (t == 29) return 120.0; // Mid-rise City
  if (t == 30) return 80.0;  // Historic Old Town
  if (t == 31) return 35.0;  // Brownstone Rows
  if (t == 32) return 70.0;  // Waterfront Docks
  if (t == 33) return 400.0; // Financial Towers
  if (t == 34) return 90.0;  // Housing Blocks
  if (t == 35) return 80.0;  // Stadium District
  if (t == 36) return 110.0; // Civic Center
  if (t == 37) return 40.0;  // Market District
  if (t == 38) return 150.0; // Brutalist Towers
  if (t == 39) return 45.0;  // Small Downtown
  if (t == 40) return 80.0;  // Townhouses
  if (t == 41) return 55.0;  // Ranch Houses
  if (t == 42) return 100.0; // McMansions
  if (t == 43) return 90.0;  // Garden Apartments
  if (t == 44) return 40.0;  // Mobile Homes
  if (t == 45) return 80.0;  // Victorian Street
  if (t == 46) return 60.0;  // Mediterranean
  if (t == 47) return 50.0;  // Cottage Lane
  if (t == 48) return 70.0;  // Duplex Split-level
  if (t == 49) return 85.0;  // Strip Commercial
  return 80.0;
}
bool canPaintUrbanOn(int t)
{
  return isLandOrForest2(t) || t == WALLTYPE_RUNWAY || t == WALLTYPE_INDUSTRIAL
      || isAnyUrban(t) || t == WALLTYPE_AMERICAN_SUBURBAN;
}
bool canPaintSuburbanOn(int t, int variant)
{
  if (isLandOrForest2(t) || t == WALLTYPE_RUNWAY || t == WALLTYPE_INDUSTRIAL || isAnySuburban(t))
    return true;
  if (variant == 1 && isAnyUrban(t)) // American Tract may overlay urban
    return true;
  return false;
}
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
// Row 0 = sun/climate. Optional row 1 = terrain height in cells (realistic silhouette).
vec4 sampleSunColumn(sampler2D sunColumnTex, float texX)
{
  ivec2 sz = textureSize(sunColumnTex, 0);
  int x = int(floor(texX * float(max(sz.x, 1))));
  x = clamp(x, 0, sz.x - 1);
  return texelFetch(sunColumnTex, ivec2(x, 0), 0);
}

// Match CPU autoMinShadowLight: zenith 85° → 0.040 day fill, 100° → 0.005 night fill.
// Use local column zenith so multi-longitude day regions are not crushed by a night clock.
float effectiveMinShadowLight(float zenithRad, float globalMinShadow, int autoOn)
{
  if (autoOn != 0)
    return map_rangeC(abs(zenithRad) * rad2deg, 100.0, 85.0, 0.005, 0.040);
  return globalMinShadow;
}

float climateTempCFromLatitude(float lat)
{
  return 30.0 - 55.0 * pow(abs(lat) / 90.0, 1.15);
}

// Keep lighting sun tied to ground level (sky horizonLine is forced to 0).
const float SUN_HORIZON_LINE = 0.0;

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

// Hard bounds so a single Inf/NaN cell cannot infect the whole grid.
// Velocities are cells/iteration; 2.5 stays above violent tornadoes even at Y=1000.
#define SIM_PROFILE_SAMPLES 504
#define SIM_MAX_CELL_VEL 2.5
#define SIM_MAX_PRESSURE 8.0
#define SIM_T_AIR_MIN 180.0
#define SIM_T_AIR_MAX 460.0

bool simIsFinite(float x) { return (x == x) && (abs(x) < 1.0e15); }

float simFiniteOr(float x, float fallback) { return simIsFinite(x) ? x : fallback; }

int simProfileIndex(int y, float resY)
{
  float t = clamp(float(y) / max(resY - 1.0, 1.0), 0.0, 1.0);
  return int(clamp(t * float(SIM_PROFILE_SAMPLES - 1) + 0.5, 0.0, float(SIM_PROFILE_SAMPLES - 1)));
}

vec2 simClampVel(vec2 vel)
{
  vel.x = clamp(simFiniteOr(vel.x, 0.0), -SIM_MAX_CELL_VEL, SIM_MAX_CELL_VEL);
  vel.y = clamp(simFiniteOr(vel.y, 0.0), -SIM_MAX_CELL_VEL, SIM_MAX_CELL_VEL);
  return vel;
}

vec4 sanitizeSimBase(vec4 b, int wallDist)
{
  b[VX] = clamp(simFiniteOr(b[VX], 0.0), -SIM_MAX_CELL_VEL, SIM_MAX_CELL_VEL);
  b[VY] = clamp(simFiniteOr(b[VY], 0.0), -SIM_MAX_CELL_VEL, SIM_MAX_CELL_VEL);
  b[PRESSURE] = clamp(simFiniteOr(b[PRESSURE], 0.0), -SIM_MAX_PRESSURE, SIM_MAX_PRESSURE);
  float t = simFiniteOr(b[TEMPERATURE], 288.15);
  if (wallDist == 0) {
    // Wall cells use ~1000 as the snow-melt feedback marker.
    if (t > 600.0)
      b[TEMPERATURE] = clamp(t, 600.0, 2000.0);
    else
      b[TEMPERATURE] = clamp(t, SIM_T_AIR_MIN, SIM_T_AIR_MAX);
  } else {
    b[TEMPERATURE] = clamp(t, SIM_T_AIR_MIN, SIM_T_AIR_MAX);
  }
  return b;
}

vec4 sanitizeSimWater(vec4 w, int wallDist, int wallType)
{
  if (wallDist == 0) {
    w[0] = simFiniteOr(w[0], WATER_MARKER_LAND);
    w[1] = simFiniteOr(w[1], 0.0);
    w[2] = simFiniteOr(w[2], 0.0);
    w[3] = simFiniteOr(w[3], 0.0);
    if (!isAnyWaterType(wallType)) {
      w[SOIL_MOISTURE] = clamp(w[SOIL_MOISTURE], 0.0, soilMoistureSafetyMax);
      w[SNOW] = clamp(w[SNOW], -1.0, 50000.0); // negative = RAIN_FREQ below the surface
    } else {
      w[SNOW] = clamp(w[SNOW], 0.0, maxIceThickness);
    }
  } else {
    w[TOTAL] = clamp(simFiniteOr(w[TOTAL], 0.0), 0.0, 100.0);
    w[CLOUD] = clamp(simFiniteOr(w[CLOUD], 0.0), 0.0, 100.0);
    w[PRECIPITATION] = clamp(simFiniteOr(w[PRECIPITATION], 0.0), 0.0, 50.0);
    w[DUST] = clamp(simFiniteOr(w[DUST], 0.0), 0.0, 5.0);
  }
  return w;
}

float sanitizeSimSmoke(float s) { return clamp(simFiniteOr(s, 0.0), 0.0, 48.0); }

////////////// Physical pressure ///////////////
// refProfileTex (SIM_PROFILE_SAMPLES x 1, RGBA32F).
// P, rho and vapor follow the live column. Theta is the locked climate, not the 15°C startup sounding.
#define REF_P_HPA 0   // hydrostatic reference pressure (hPa)
#define REF_RHO 1     // reference air density (kg/m^3)
#define REF_VAPOR 2   // environmental water vapor (g/m^3, same units as water[TOTAL])
#define REF_THETA 3   // climate potential temperature (K): neutral buoyancy and the held background profile
#define MAX_SYNOPTIC_SYSTEMS 16

vec4 sampleRefProfile(sampler2D refTex, float cellY, float resY)
{
  float t = clamp(cellY / max(resY, 1.0), 0.0, 1.0) * float(SIM_PROFILE_SAMPLES - 1);
  int i0 = int(floor(t));
  int i1 = min(i0 + 1, SIM_PROFILE_SAMPLES - 1);
  return mix(texelFetch(refTex, ivec2(i0, 0), 0), texelFetch(refTex, ivec2(i1, 0), 0), fract(t));
}

float refPressureHpa(sampler2D refTex, float cellY, float resY) { return sampleRefProfile(refTex, cellY, resY)[REF_P_HPA]; }

float refDensity(sampler2D refTex, float cellY, float resY) { return max(sampleRefProfile(refTex, cellY, resY)[REF_RHO], 0.01); }

// Density normalized to the bottom of the domain (1 at y = 0).
float refDensityNorm(sampler2D refTex, float cellY, float resY)
{
  return refDensity(refTex, cellY, resY) / max(texelFetch(refTex, ivec2(0, 0), 0)[REF_RHO], 0.01);
}

// Momentum equation in cell units: dv = -dp/rho * dt^2/dx^2, so 1 unit of fluid PRESSURE
// equals rho * (dx/dt)^2 Pa. paPerUnitPerRho = (cellHeight / dtSec)^2 * user scale.
// Anelastic mode divides the gradient by normalized density, which leaves surface density here.
float fluidToPa(sampler2D refTex, float p, float cellY, float resY, float paPerUnitPerRho, int anelastic)
{
  float rho = anelastic != 0 ? max(texelFetch(refTex, ivec2(0, 0), 0)[REF_RHO], 0.01) : refDensity(refTex, cellY, resY);
  return p * rho * paPerUnitPerRho;
}

float paToFluid(sampler2D refTex, float pa, float cellY, float resY, float paPerUnitPerRho, int anelastic)
{
  float rho = anelastic != 0 ? max(texelFetch(refTex, ivec2(0, 0), 0)[REF_RHO], 0.01) : refDensity(refTex, cellY, resY);
  return pa / max(rho * paPerUnitPerRho, 1e-6);
}

// Synoptic Low/High are column features: full strength at the surface, reversing aloft
// so a Low converges low down and diverges high up. Must match synopticVerticalProfile() in app.js.
float synopticVerticalProfile(float heightFrac) { return mix(1.0, -0.4, smoothstep(0.1, 0.75, heightFrac)); }

// sys: x (cells), y (cells, unused), radius (cells, scaled by aspect like the CPU nudge), signed amplitude (hPa)
float synopticBackgroundHpa(vec4 sys[MAX_SYNOPTIC_SYSTEMS], int count, float cellX, float cellY, vec2 res, bool wrap)
{
  float aspect = res.y / max(res.x, 1.0);
  float sum = 0.0;
  for (int i = 0; i < MAX_SYNOPTIC_SYSTEMS; i++) {
    if (i >= count)
      break;
    vec4 s = sys[i];
    if (s.z < 1.0)
      continue;
    float dx = cellX - s.x;
    if (wrap) {
      float adx = abs(dx);
      if (adx > res.x - adx)
        dx = dx > 0.0 ? dx - res.x : dx + res.x;
    }
    float d = abs(dx) * aspect / s.z;
    if (d >= 1.0)
      continue;
    sum += s.w * (1.0 - smoothstep(0.0, 1.0, d));
  }
  return sum * synopticVerticalProfile(clamp(cellY / max(res.y, 1.0), 0.0, 1.0));
}

////////////// Water Functions ///////////////
#define wf_devider 250.0 // 250.0 Real water 	230 less steep curve
#define wf_pow 17.0      // 17.0						10
// https://www.geogebra.org/calculator/jc9hkfq4

float maxWater(float T)
{
  T = clamp(simFiniteOr(T, 273.15), 180.0, 370.0);
  return pow((T / wf_devider), wf_pow); // T in Kelvin, w in grams per m^3
}

float dewpoint(float W)
{
  W = simFiniteOr(W, 0.0);
  if (W < 0.00001)
    return 0.0;
  else
    return wf_devider * pow(W, 1.0 / wf_pow);
}

float relativeHumd(float T, float W) { return simFiniteOr(W, 0.0) / max(maxWater(T), 1.0e-12); }

////////////// Water / ice phase change ///////////////

// Ice thickness (cm) that one kelvin of a surface cell's heat content freezes or melts.
float iceCmPerKelvin(float heatCapacity, float meltingHeat)
{
  return heatCapacity / max(meltingHeat, 0.01) * heatUnitDepthM / iceDensityGPerM3 * 100.0;
}

// Floating ice thickening from below while its surface is colder than the water (Stefan's law), cm per iteration.
float iceBasalGrowthCm(float surfaceBelowFreezeK, float thicknessCm)
{
  return 2.07e-5 * max(surfaceBelowFreezeK, 0.0) / max(thicknessCm, 2.0);
}

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
  T = max(simFiniteOr(T, 273.15), 0.0);
  return pow(T * 0.01, 4.) * IR_constant; // Stefan–Boltzmann law
}

float IR_temp(float IR) // inversed Stefan–Boltzmann law
{
  IR = max(simFiniteOr(IR, 0.0), 0.0);
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