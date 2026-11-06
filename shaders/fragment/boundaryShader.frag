#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;

in vec2 texCoord;     // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform sampler2D vortForceTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;
uniform sampler2D precipFeedbackTex;
uniform sampler2D precipDepositionTex;
uniform sampler2D sunColumnTex;
uniform sampler2D smokeTex;

uniform float dryLapse;
uniform float evapHeat;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform float vorticity;
uniform float lightEffectScale; // 0 = freeze radiative heating this substep (lighting skipped)
uniform float waterEvaporation;
uniform float landEvaporation;
uniform float waterWeight;
uniform vec4 initial_Tv[126];
uniform bool allowCaves;

uniform float sunAngle;
uniform float sunAzimuth;
uniform int latitudeBasedTemperature;

uniform float iterNum; // used as seed for random function

uniform float dynamicWaterTemperature;
uniform float maxWaterTemperatureC;
uniform float maxSnowAccumulationCm;
uniform float freshwaterFreezePointC;
uniform float saltwaterFreezePointC;
uniform float enableFreshwaterFreezing;
uniform float enableSaltwaterFreezing;
uniform float enableGlacierMelting;
uniform float meltingHeat;
uniform float stormSurgeStrength;      // 0–2; scales onshore-wind coastal inundation
uniform float stormSurgeWindThreshold; // windScale units; higher = needs stronger onshore wind
uniform float stormSurgeMaxCells;      // max ocean runup height in cells
uniform float stormSurgeInlandReach;   // how many land cells inland surge can reach
uniform float floodRainThreshold;      // rain-occurrence frequency (0–1) required to pond
uniform float floodPondRate;           // ponding build rate once rain frequency exceeds threshold
uniform float enableFlooding;          // 0/1 — natural rain→flood ponding
uniform float enableStormSurge;        // 0/1 — coastal storm-surge inundation
// Natural grass→forest species pick: 0 = random 50/50, 1 = Forest (conifer), 2 = Forest 2 (deciduous)
uniform float forestGrowthSpecies;
uniform float rainfallAmountMult;          // scales rain hitting soil / runoff
uniform float vegetationGrowthMult;        // scales climate-driven vegetation growth
uniform float vegetationDiebackMult;       // scales drought dieback speed
uniform float soilMoistureLossMult;        // scales soil evaporative drying
uniform float climateMoistureDecayMult;    // scales sustained climate moisture decay
uniform float fireBurnMult;                // scales fuel consumption while on fire
uniform float soilMoistureCap;             // 0 = unlimited; else max soil moisture mm
uniform sampler2D refProfileTex;           // hydrostatic reference: P (hPa), rho, vapor, climate theta
uniform sampler2D rowMeanTex;              // per-row mean potential temperature in B, air count in G
uniform int anelastic;                     // 1 = virtual-temperature buoyancy

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;
layout(location = 3) out float smoke;

#include "common.glsl"

float getInitialT(int y)
{
  int i = simProfileIndex(y, resolution.y);
  return initial_Tv[i / 4][i % 4];
}

// Neutral temperature for this height: the current climate, not the 15°C startup sounding.
float environmentPotentialT(float cellY)
{
  float th = sampleRefProfile(refProfileTex, cellY, resolution.y)[REF_THETA];
  if (th > 100.0)
    return th;
  return getInitialT(int(cellY));
}

float rowMeanPotentialT(float cellY)
{
  int y = clamp(int(cellY), 0, int(resolution.y) - 1);
  vec4 row = texelFetch(rowMeanTex, ivec2(y, 0), 0);
  if (row.g < 0.5)
    return 0.0;
  return row.b;
}

// Horizontal-mean potential temperature, so a uniform 40°C or -15°C column is neutrally buoyant.
float buoyancyReferenceT(float cellY)
{
  float meanTh = rowMeanPotentialT(cellY);
  if (meanTh > 100.0)
    return meanTh;
  return environmentPotentialT(cellY);
}

#define minimalFireVegetation 20

#define minimalFireIntensity 0.002
#define significantFloodMm 3.0 // standing water above field capacity that instantly quenches fire

#define wallVerticalInfluence 1 // 2 How many cells above the wall surface effects like heating and evaporation are applied


// #define wallManhattanInfluence 2 // 2 How many cells from the nearest wall effects like smoothing and drag are applied
#define exchangeRate 0.015       // Rate of smoothing near surface

void exchangeWith(vec2 texCoord) // exchange temperature and water
{
  // base[TEMPERATURE] -= (base[TEMPERATURE] - texture(baseTex, texCoord)[TEMPERATURE]) * exchangeRate;
  // water[0] -= (water[0] - texture(waterTex, texCoord)[0]) * exchangeRate;

  base[VX] -= (base[VX] - texture(baseTex, texCoord)[VX]) * exchangeRate;
}


float calcEvaporation(float T, float W, float V, float M)                                             // temperature, total water, vegetation, soil moisture
{
  return max((maxWater(T) - W) * landEvaporation * (V / 127. + 0.1) * min(M + 1.0, 50.0) * 0.05, 0.); // landEvaporation should be adjusted to remove * 0.05 factor
}

float calcFireIntensity(int veg, float moist, float precip) { return max(vegetationInfluence(veg) * 0.00032 - moist * 0.00020 - precip * 0.02, 0.); }

// How many cells this sample sits above an ocean surface (0 = same height, negative = below ocean top).
// Large value means not an ocean column.
float cellsAboveOceanAt(vec2 uv)
{
  ivec4 w = texture(wallTex, uv);
  if (w[TYPE] != WALLTYPE_WATER)
    return 1e6;
  // Wall ocean: VERT 0 at surface, negative below. Air above ocean: VERT = height above surface.
  return float(w[VERT_DISTANCE]);
}

bool isSurgeFloodLandType(int wallType)
{
  return wallType == WALLTYPE_LAND || wallType == WALLTYPE_FIRE
      || wallType == WALLTYPE_FOREST2 || wallType == WALLTYPE_FIRE_FOREST2
      || isSettlementWall(wallType)
      || wallType == WALLTYPE_INDUSTRIAL || wallType == WALLTYPE_RUNWAY
      || isCustomBase(wallType);
}

// Rain-occurrence frequency (0–1) for a land surface cell, kept by the land cell directly below it.
float surfaceRainFreq(ivec4 wallBelow)
{
  if (wallBelow[DISTANCE] != 0 || wallBelow[VERT_DISTANCE] != -1 || isAnyWaterType(wallBelow[TYPE]))
    return 0.0;
  return decodeRainFreq(texture(waterTex, texCoordX0Ym)[RAIN_FREQ]);
}

void main()
{
  base = texture(baseTex, texCoord);
  water = texture(waterTex, texCoord);
  smoke = texture(smokeTex, texCoord).r;

  vec4 precipFeedback = texture(precipFeedbackTex, texCoord);

  vec4 sunCol = sampleSunColumn(sunColumnTex, texCoord.x);
  float colSunAngle = sunCol.g;

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  wall = texture(wallTex, texCoord);
  ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);
  ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);
  ivec4 wallX0Yp = texture(wallTex, texCoordX0Yp);

  vec4 light = texture(lightTex, texCoord);

  bool nextToWall = false;

  wall[VERT_DISTANCE] = wallX0Ym[VERT_DISTANCE] + 1; // height above ground is counted

  if (wall[DISTANCE] != 0) {                         // is fluid, not wall

    wall[TYPE] = wallX0Ym[TYPE];                     // copy wall type from wall below

    // The air cell right above water / ice carries that surface's IR budget, which the surface itself absorbs.
    // Every other cell in the column radiates like air over land.
    if (!(wall[VERT_DISTANCE] == 1 && isAnyWaterType(wall[TYPE]))) {
      float irDelta = light[NET_HEATING] * lightEffectScale; // IR heating/cooling effect
      // Ground-adjacent land air: thermal inertia so night IR cooling is not instantaneous
      if (wall[VERT_DISTANCE] == 1)
        irDelta /= landHeatCapacity;
      base[TEMPERATURE] += irDelta;
    }

    base[TEMPERATURE] += precipFeedback[HEAT]; // rain cools air and riming heats air


    float precipCoalescence = max(-precipFeedback[VAPOR], 0.); // how much cloud water turns into rain

    water[CLOUD] -= precipCoalescence;
    water[TOTAL] -= precipCoalescence;

    float precipEvaporation = max(precipFeedback[VAPOR], 0.);

    water[TOTAL] += precipEvaporation; // evaporating rain adds water vapor to air


    //  0.004 for rain visualisation
    water[PRECIPITATION] = max(water[PRECIPITATION] * 0.997 - 0.00001 + precipFeedback[MASS] * 0.005, 0.0);


    // rain removes dust and smoke from air
    float scrub = 1. + max(-precipFeedback[VAPOR] * 0.1, 0.0) + precipFeedback[MASS] * 0.000;
    water[DUST] /= scrub; // rain formation in clouds removes dust quickly , falling rain slower
    water[DUST] -= precipFeedback[MASS] * 0.0001; // linearly to remove last little bit
    water[DUST] = max(water[DUST], 0.0);

    // same scrubbing physics for combustion smoke
    smoke /= scrub;
    smoke -= precipFeedback[MASS] * 0.0001;
    // Flame-to-smoke fade starts higher so mega-fire columns can get very dense
    smoke -= max((smoke - 12.0) * 0.006, 0.);
    // Gentle ambient fade — allow densities well above previous soft ceiling
    smoke *= 0.9990;
    smoke -= max(smoke - 8.0, 0.) * 0.004;
    smoke = max(smoke, 0.0);
    if (smoke > 4.0) {
      smoke -= water[PRECIPITATION] * 0.02; // falling precipitation extinguishes flames
    }

    // GRAVITY
    // temperature is calculated for Vy location
    vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

#define gravMult 0.0001 // 0.0001 0.0005

    // Buoyancy against the current environmental profile. A uniform hot or cold column is neutral;
    // only departures from that column rise or sink. The startup 15°C profile is not the baseline.
    float envY0 = float(int(fragCoord.y));
    float gravityForce = ((base[TEMPERATURE] + baseX0Yp[TEMPERATURE]) * 0.5 - (buoyancyReferenceT(envY0) + buoyancyReferenceT(envY0 + 1.0)) * 0.5) * gravMult;

    // float gravityForce = (base[3] - initial_T[int(fragCoord.y)]) * gravMult;

    // Anelastic: virtual temperature, so humid air is lighter than the reference column.
    if (anelastic != 0) {
      float faceY = fragCoord.y; // top face of this cell (cell centre is fragCoord.y - 0.5)
      vec4 ref = sampleRefProfile(refProfileTex, faceY, resolution.y);
      float rhoKg = max(ref[REF_RHO], 0.01) * 1000.0;
      vec4 waterUp = texture(waterTex, texCoordX0Yp);
      float vapor = (max(water[TOTAL] - water[CLOUD], 0.0) + max(waterUp[TOTAL] - waterUp[CLOUD], 0.0)) * 0.5;
      float q = vapor / rhoKg;
      float qRef = max(ref[REF_VAPOR], 0.0) / rhoKg;
      float Tface = (base[TEMPERATURE] + baseX0Yp[TEMPERATURE]) * 0.5;
      gravityForce += 0.608 * Tface * (q - qRef) * gravMult;
    }

    gravityForce -= water[CLOUD] * gravMult * waterWeight;         // cloud water weight added to gravity force

    gravityForce -= precipFeedback[MASS] * gravMult * waterWeight; // precipitation weigth added to gravity force

    gravityForce = clamp(simFiniteOr(gravityForce, 0.0), -0.05, 0.05);
    base[VY] += gravityForce;

    // base.x += sin(texCoord.x * PI * 2.0 + iterNum * 0.000005) * (1. - texCoord.y) * 0.00015; // phantom force to simulate high and low pressure areas

    float snowCover = 0.;
    float soilMoisture = 0.;

    if (wallX0Ym[DISTANCE] == 0) { // below is wall
      nextToWall = true;
      wall[DISTANCE] = 1;          // dist to nearest wall = 1

      vec4 waterX0Ym = texture(waterTex, texCoordX0Ym);
      snowCover = waterX0Ym[SNOW];
      soilMoisture = waterX0Ym[SOIL_MOISTURE];
      wall[VERT_DISTANCE] = 1; // directly above ground
    }

    if (wallXmY0[DISTANCE] == 0) {            // left is wall
      nextToWall = true;
      wall[DISTANCE] = 1;                     // dist to nearest wall = 1

      if (isLiquidWaterType(wallXmY0[TYPE])) { // if left is water, build a dyke
        wall[TYPE] = WALLTYPE_LAND;
        wall[DISTANCE] = 0;
      }

      if (wallXpY0[DISTANCE] == 0)            // left and right is wall, make this wall to fill narrow gaps
        wall[DISTANCE] = 0;
    } else if (wallXpY0[DISTANCE] == 0) {     // right is wall
      nextToWall = true;
      wall[DISTANCE] = 1;                     // dist to nearest wall = 1

      if (isLiquidWaterType(wallXpY0[TYPE])) { // if right is water, build a dyke
        wall[TYPE] = WALLTYPE_LAND;
        wall[DISTANCE] = 0;
      }
    }
    if (wallX0Yp[DISTANCE] == 0) {                                                  // above is wall
      nextToWall = true;
      if (texCoord.y < 0.99 && (!allowCaves || isAnyWaterType(wallX0Yp[TYPE]))) { // Fill in land below
        // Preserve custom terrain types when filling mountain interiors
        wall[TYPE] = isCustomTerrain(wallX0Yp[TYPE]) ? wallX0Yp[TYPE] : WALLTYPE_LAND;
        wall[DISTANCE] = 0;                                                         //  set this to wall
      } else {
        wall[DISTANCE] = 1;
      }
    }


    // if(abs(base.x) > 0.0040 && abs(base.y) > 0.0040){
    //  sample vorticity force
    vec2 vortForceX0Y0 = texture(vortForceTex, texCoord).xy;
    vec2 vortForceXmY0 = texture(vortForceTex, texCoordXmY0).xy;
    vec2 vortForceX0Ym = texture(vortForceTex, texCoordX0Ym).xy;

    float velocityFactor = length(base.xy) * 0.1; // 0.2

    // apply vorticity force
    vec2 vortApply = vec2(vortForceX0Y0.x + vortForceX0Ym.x, vortForceX0Y0.y + vortForceXmY0.y) * (vorticity + velocityFactor);
    vortApply.x = simFiniteOr(vortApply.x, 0.0);
    vortApply.y = simFiniteOr(vortApply.y, 0.0);
    base.xy += vortApply;
    //}

    if (nextToWall) {
      if (!isAnyWaterType(wall[TYPE])) { // any land
        // Uniform horizontal-surface irradiance (same as water); not screen-space sun direction.
        // Soften zenith falloff so low-sun morning/evening still heats (hard cos delays dawn warmup
        // and dumps heat too early after noon when paired with σT⁴ cooling).
        float sunElevFactor = max(cos(colSunAngle), 0.0);
        sunElevFactor = pow(sunElevFactor, 0.55);
        float lightPower = light[SUNLIGHT] * sunElevFactor;

        float albedoTotal = ALBEDO_INERT;

        if (wall[TYPE] == WALLTYPE_INERT) {
          albedoTotal = ALBEDO_INERT;
        } else if (isLandFireOrForest2(wall[TYPE]) || isCustomBase(wall[TYPE])) {
          // Snow albedo saturates around fullWhiteSnowHeight (~10 cm). Unclamped
          // map_range made veg albedo >> 1 with deep snow, so (1-albedo) went
          // negative: land cooled without bound by day and IR-heated at night.
          float snowFrac = clamp(snowCover / fullWhiteSnowHeight, 0.0, 1.0);
          float albedoSoil = map_rangeC(soilMoisture, 0., 20., ALBEDO_DRYSOIL, ALBEDO_WETSOIL);
          albedoSoil = mix(albedoSoil, ALBEDO_SNOW, snowFrac);
          float vegSample = float(wallX0Ym[VEGETATION]);
          float grassFrac = clamp(grassBiomass(int(vegSample)) / float(GRASS_VEG_MAX), 0.0, 1.0);
          float forestFrac = clamp(forestBiomass(int(vegSample)) / float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0, 1.0);
          float grassAlbedo = mix(ALBEDO_GRASS, ALBEDO_SNOW, snowFrac);
          float forestAlbedo = mix(ALBEDO_FOREST, ALBEDO_SNOW_FOREST, snowFrac);
          float vegAlbedo = mix(grassAlbedo, forestAlbedo, forestFrac);
          float vegCover = max(grassFrac * 0.55, forestFrac);
          albedoTotal = mix(albedoSoil, vegAlbedo, clamp(vegCover, 0.0, 1.0));
        } else if (isUrbanLike(wall[TYPE]) || isCustomOverlay(wall[TYPE])) {
          albedoTotal = ALBEDO_URBAN;
        } else if (isSoftSuburban(wall[TYPE])) {
          albedoTotal = ALBEDO_SUBURBAN;
        } else if (wall[TYPE] == WALLTYPE_INDUSTRIAL) {
          albedoTotal = ALBEDO_INDUSTRIAL;
        } else if (wall[TYPE] == WALLTYPE_RUNWAY) {
          albedoTotal = ALBEDO_RUNWAY;
        }

        // Standing floodwater: behave like a shallow freshwater surface (higher albedo, larger heat capacity)
        float sfcFloodMm = 0.0;
        if (wallX0Ym[DISTANCE] == 0)
          sfcFloodMm = getFloodHeightMm(texture(waterTex, texCoordX0Ym)[TOTAL]);
        float floodFrac = clamp(sfcFloodMm / 12.0, 0.0, 1.0);
        if (floodFrac > 0.0) {
          albedoTotal = mix(albedoTotal, ALBEDO_FRESH_WATER, floodFrac);
        }

        albedoTotal = clamp(albedoTotal, 0.0, 0.95);
        lightPower *= (1. - albedoTotal);
        lightPower = max(lightPower, 0.0);
        lightPower *= lightHeatingConst;
        // Dry land uses the Earth-scale solar flux directly. Flooded tiles keep water-like
        // thermal mass so standing water does not spike like bare soil. Night IR cooling
        // still uses landHeatCapacity so nights do not crash.
        lightPower /= mix(1.0, waterHeatCapacity * 0.35, floodFrac);
        base[TEMPERATURE] += lightPower * lightEffectScale; // sun heating land
      }
    }

    if (!nextToWall) { // not next to wall

      // find nearest wall
      int nearest = 255;
      // int nearestType = 0; // not used, type is only extended vertically now
      if (wallX0Ym[DISTANCE] < nearest) {
        nearest = wallX0Ym[DISTANCE];
        //   nearestType = wallX0Ym[TYPE];
      }
      if (wallX0Yp[DISTANCE] < nearest) {
        nearest = wallX0Yp[DISTANCE];
        //  nearestType = wallX0Yp[TYPE];
      }
      if (wallXmY0[DISTANCE] < nearest) {
        nearest = wallXmY0[DISTANCE];
        //  nearestType = wallXmY0[TYPE];
      }
      if (wallXpY0[DISTANCE] < nearest) {
        nearest = wallXpY0[DISTANCE];
        //   nearestType = wallXpY0[TYPE];
      }

      wall[DISTANCE] = nearest + 1; // add one to dist to wall
                                    // wall[TYPE] = nearestType;     // type = type of nearest wall
    }

#define surfaceWindSmootingDist 5

    if (wall[VERT_DISTANCE] <= surfaceWindSmootingDist) { // above surface

      if (wall[VERT_DISTANCE] == 1) {
        float surfaceDrag = 0.0015; // water or runway
        if (isUrbanLike(wall[TYPE]) || isCustomOverlay(wall[TYPE]))
          surfaceDrag = 0.040;
        else if (isSoftSuburban(wall[TYPE]))
          surfaceDrag = 0.012;
        else if (isAnyFireType(wall[TYPE])) {
          // Burning ground: light open-land drag so horizontal wind can cross fire
          surfaceDrag = 0.0025;
        }
        else if (isCustomBase(wall[TYPE])) {
          float gBio = grassBiomass(wall[VEGETATION]);
          float fBio = forestBiomass(wall[VEGETATION]);
          surfaceDrag = map_rangeC(fBio, 0., float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0015 + gBio * 0.00004, 0.020);
        }
        else if (isLandFireOrForest2(wall[TYPE])) {
          float gBio = grassBiomass(wall[VEGETATION]);
          float fBio = forestBiomass(wall[VEGETATION]);
          surfaceDrag = map_rangeC(fBio, 0., float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0015 + gBio * 0.00004, 0.020);
        }

        // base[VX] *= 1. - surfaceDrag;                        // surface drag
        base[VX] -= abs(base[VX]) * base[VX] * surfaceDrag * 50.; // quadratic surface drag
      }

      // Smoothing near surface

      if (/*wallX0Yp[VERT_DISTANCE] != 0 && */ wallX0Yp[VERT_DISTANCE] <= surfaceWindSmootingDist) { // above
        exchangeWith(texCoordX0Yp);
      }

      if (wallX0Ym[VERT_DISTANCE] > 0 /* && wallX0Ym[1] <= wallManhattanInfluence*/) { // below
        exchangeWith(texCoordX0Ym);
      }
      /*
            if (wallXmY0[1] != 0 && wallXmY0[1] <= wallManhattanInfluence) { // left
              exchangeWith(texCoordXmY0);
            }

            if (wallXpY0[1] != 0 && wallXpY0[1] <= wallManhattanInfluence) { // right
              exchangeWith(texCoordXpY0);
            }*/
    }

    if (wall[VERT_DISTANCE] <= 8) { // within height of buildings


      const float influenceDevider = float(wallVerticalInfluence); // devide by how many cells it's aplied to

      wall[VEGETATION] = wallX0Ym[VEGETATION];                     // vegetation is copied from below

      // base[PRESSURE] *= 0.995; // 0.999

      // base[PRESSURE]  += 0.001; // add air pressure at the suface. makes air rise everywhere and creates huge cells

      vec4 waterInSurface = texture(waterTex, texCoordX0Ym);

      switch (wall[TYPE]) {
      case WALLTYPE_FIRE:
      case WALLTYPE_FIRE_FOREST2:
        if (wall[VERT_DISTANCE] == 1) { // air cell immediately above a burning surface
          float sfcFlood = getFloodHeightMm(waterInSurface[TOTAL]);
          // Active fire wall types keep heating forever (until flood extinguishes the ground fire).
          // Fuel/moisture still scale smoke output; heat has a sustained floor so heat doesn't die with vegetation.
          if (sfcFlood < significantFloodMm) {
            float fuelIntensity = max(calcFireIntensity(wall[VEGETATION], waterInSurface[SOIL_MOISTURE], water[PRECIPITATION]), 0.);
            const float sustainedFireHeat = 0.006;
            float heatRate = max(fuelIntensity, sustainedFireHeat);
            base[TEMPERATURE] += heatRate * 0.65;          // modest heat — less buoyant tower
            // Smoke yield ramps with fuel; sustained floor builds density in large fires
            smoke += max(fuelIntensity, sustainedFireHeat * 0.5) * 4.5;
            // Cap still very high so mega-fire columns can reach pyrocumulus densities
            smoke = min(smoke, 48.0);
            water[TOTAL] += fuelIntensity * 0.50;          // moisture only while fuel burns
            // Gentle updraft so extra smoke spreads more than it rockets upward
            const float fireUpdraftCap = 0.045;
            if (base[VY] < fireUpdraftCap)
              base[VY] = min(base[VY] + heatRate * 1.0, fireUpdraftCap);
          }
        }
        // nobreak!
      case WALLTYPE_INDUSTRIAL:
        if (wall[TYPE] == WALLTYPE_INDUSTRIAL) { // exclude WALLTYPE_FIRE
          int texFragX = int(fragCoord.x) % 80;

          if (wall[VERT_DISTANCE] == 5 && (texFragX == 18 || texFragX == 22)) { // cooling towers
            water[TOTAL] += 0.25;
            // base[TEMPERATURE] += 0.02;
            base.xy *= 0.5;
            base.y += 0.05;
          }

          else if (wall[VERT_DISTANCE] == 6 && texFragX == 29) { // stack pollution (dust/smog look)
            water[DUST] += 0.01;
            base[TEMPERATURE] += 0.02;
            base.xy *= 0.5;
          }
        }
        // nobreak!
      case WALLTYPE_SUBURBAN:
      case 40: case 41: case 42: case 43: case 44: case 45:
      case 46: case 47: case 48: case 49:
        if (isSoftSuburban(wall[TYPE]))
          water[DUST] += 0.0000004;
        // nobreak!
      case WALLTYPE_AMERICAN_SUBURBAN:
      case WALLTYPE_URBAN:
      case 29: case 30: case 31: case 32: case 33: case 34:
      case 35: case 36: case 37: case 38: case 39:
        if (isUrbanLike(wall[TYPE]))
          water[DUST] += 0.000002; // Urban produces smog/dust
        // nobreak!
      case WALLTYPE_FOREST2:
      case WALLTYPE_LAND:
        if (wall[VERT_DISTANCE] <= wallVerticalInfluence) {

          float evaporation = calcEvaporation(realTemp, water[TOTAL], vegetationInfluence(wall[VEGETATION]), waterInSurface[SOIL_MOISTURE]) / influenceDevider;
          // Snowpack shuts down transpiration; residual is weak vapor exchange (sublimation is handled elsewhere).
          evaporation *= mix(1.0, 0.12, clamp(waterInSurface[SNOW] / fullWhiteSnowHeight, 0.0, 1.0));

          // Flooded land: sun-boosted evaporation into the air (like open freshwater)
          float floodFracAir = clamp(getFloodHeightMm(waterInSurface[TOTAL]) / 12.0, 0.0, 1.0);
          if (floodFracAir > 0.0) {
            float sunEvap = max(light[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
            float waterLikeEvap = max((maxWater(realTemp) - water[TOTAL]) * waterEvaporation, 0.0) / influenceDevider;
            evaporation = mix(evaporation, max(evaporation, waterLikeEvap), floodFracAir);
            evaporation *= (1.0 + sunEvap * 2.5 * floodFracAir);
          }

          water[TOTAL] += evaporation;
          base[TEMPERATURE] -= evaporation * evapHeat;                                      // evaporative cooling (full latent heat so later condensation does not net-warm the column)

          if (wall[VEGETATION] < 10 && water[SOIL_MOISTURE] < 5.0) {                        // Dry desert area
            water[DUST] = min(water[DUST] + (max(abs(base[VX]) - 0.12, 0.) * 0.15), 2.4); // Dust blowing up with wind
          }
        }
        break;
      case WALLTYPE_FRESH_WATER:
      case WALLTYPE_WATER:
      case WALLTYPE_ICE:
        if (wall[VERT_DISTANCE] <= wallVerticalInfluence) {
          float LocalWaterTemperature = texture(baseTex, texCoordX0Ym)[TEMPERATURE]; // water / ice temperature
          if (LocalWaterTemperature < 500.0) {                                        // skip the converted-from-land marker
            base[TEMPERATURE] += (LocalWaterTemperature - realTemp) / influenceDevider * waterHeatExchangeRate; // air heated or cooled by the surface below

            if (isLiquidWaterType(wallX0Ym[TYPE]))
              water[TOTAL] += max((maxWater(LocalWaterTemperature) - water[TOTAL]) * waterEvaporation / influenceDevider, 0.); // water evaporating
          }
        }
        break;
      }
    }
  } else {                                                                 // this is wall

    wall[VERT_DISTANCE] = wallX0Yp[VERT_DISTANCE] - 1;                     // height below ground is counted

    if (wall[VERT_DISTANCE] < 0) {                                         // below surface
      float prevRainFreq = decodeRainFreq(water[RAIN_FREQ]);
      water.ba = texture(waterTex, texCoordX0Yp).ba;                       // soil moisture and snow is copied from above
      water[SUSTAINED_MOISTURE] = texture(waterTex, texCoordX0Yp)[SUSTAINED_MOISTURE];
      wall[VEGETATION] = wallX0Yp[VEGETATION];                             // vegetation is copied from above
      // Flood height lives only on the surface — wipe packed flood from underground land
      if (!isAnyWaterType(wall[TYPE]) && isLandWaterMarker(water[TOTAL]))
        water[TOTAL] = WATER_MARKER_LAND;

      if (wallX0Yp[DISTANCE] == 0) {                                       // if above is wall
        if (!isAnyWaterType(wallX0Yp[TYPE])) {                             // above is not water
          wall[TYPE] = wallX0Yp[TYPE];                                     // copy walltype from above
        } else if (isAnyWaterType(wall[TYPE])) {                         // this is water / ice
                                                                           //   wall[TYPE] = wallX0Yp[TYPE];                                     // land can't be over water. copy walltype from above
          base[TEMPERATURE] = texture(baseTex, texCoordX0Yp)[TEMPERATURE]; // copy water temperature from above
        }
      }

      // Directly below a land surface: keep the rain-occurrence frequency (EWMA of "is raining") for the surface cell
      if (wall[VERT_DISTANCE] == -1 && !isAnyWaterType(wall[TYPE]) && wallX0Yp[DISTANCE] == 0 && !isAnyWaterType(wallX0Yp[TYPE])) {
        float rainAboveSurface = max(texture(waterTex, texCoord + vec2(0.0, 2.0 * texelSize.y))[PRECIPITATION], 0.0) * 0.55;
        float isRaining = step(rainOccurMinRate, rainAboveSurface);
        water[RAIN_FREQ] = encodeRainFreq(mix(prevRainFreq, isRaining, rainFreqEwmaAlpha));
      }

    } else if (wall[VERT_DISTANCE] == 0) { // at/in surface layer

      vec4 waterX0Yp = texture(waterTex, texCoordX0Yp);

      vec2 precipDeposition = texture(precipDepositionTex, texCoord).xy;

      vec4 lightAboveSurface = texture(lightTex, texCoordX0Yp); // sample cell above surface

      switch (wall[TYPE]) {
      case WALLTYPE_INDUSTRIAL:
        if (wall[TYPE] == WALLTYPE_INDUSTRIAL)
          wall[VEGETATION] = min(wall[VEGETATION], 15); // limit vegetation in industrial areas
      case WALLTYPE_SUBURBAN:
      case 40: case 41: case 42: case 43: case 44: case 45:
      case 46: case 47: case 48: case 49:
        if (isSoftSuburban(wall[TYPE]))
          wall[VEGETATION] = min(wall[VEGETATION], 100);
      case WALLTYPE_AMERICAN_SUBURBAN:
      case WALLTYPE_URBAN:
      case 29: case 30: case 31: case 32: case 33: case 34:
      case 35: case 36: case 37: case 38: case 39:
        if (isUrbanLike(wall[TYPE]))
          wall[VEGETATION] = min(wall[VEGETATION], 75); // limit vegetation in urban areas
      case WALLTYPE_FIRE:
      case WALLTYPE_FIRE_FOREST2:
        if (isAnyFireType(wall[TYPE])) {            // extra check to make sure it's not urban
          float floodExcessFire = getFloodHeightMm(water[TOTAL]);
          // Flood and rain still quench immediately and keep remaining canopy.
          // Fuel consumption always runs while alight; moisture can slow it but not freeze it.
          // When vegetation hits 0 the cell burns out to land.
          if (floodExcessFire >= significantFloodMm) {
            wall[TYPE] = extinguishFireType(wall[TYPE]);
          } else {
            // Moderate rainfall puts out fires while causing smoldering (increased smoke)
            float precipAbove = waterX0Yp[PRECIPITATION];
            if (precipAbove >= 0.05) {
              // Rain hitting fire extinguishes it
              wall[TYPE] = extinguishFireType(wall[TYPE]);
              // Rain causes smoldering: boost smoke when rain hits fire
              smoke += precipAbove * 3.0;
            } else if (precipAbove >= 0.01) {
              // Light rainfall causes some smoldering without full extinguishment
              smoke += precipAbove * 1.5;
            } else {
              float fireIntensity = calcFireIntensity(wall[VEGETATION], water[SOIL_MOISTURE], waterX0Yp[PRECIPITATION]) * max(fireBurnMult, 0.0);
              // Consume fuel while alight; moisture can slow the burn but the divisor is never 0.
              if (fireIntensity >= minimalFireIntensity && wall[VEGETATION] > 0
                  && int(iterNum) % (int(10. / max(fireIntensity, minimalFireIntensity)) + 1) == 0) {
                wall[VEGETATION] = max(wall[VEGETATION] - 1, 0);
              }
              if (wall[VEGETATION] <= 0)
                wall[TYPE] = WALLTYPE_LAND;
            }
          }
        }
      case WALLTYPE_FOREST2:
      case WALLTYPE_LAND:                                                                                     // no break,can also be fire or urban:
      case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: // custom base slots
        {
          // Standing flood height is separate from soil moisture (packed in TOTAL).
          float floodMm = getFloodHeightMm(water[TOTAL]);

          // Droplet ground-hits are sparse and often zero when precip is stride-skipped.
          // Near-surface air PRECIPITATION persists between hits and drives wetting/floods.
          float rainFromDrops = precipDeposition[RAIN_DEPOSITION] * 2.0;
          float rainFromAir = max(waterX0Yp[PRECIPITATION], 0.0) * 0.55;
          float rainInput = (rainFromDrops + rainFromAir) * max(rainfallAmountMult, 0.0);
          // Field capacity slows infiltration when soil is already wet; it is not a hard soil cap.
          float belowCap = max(soilFieldCapacity - water[SOIL_MOISTURE], 0.0);
          float wetFactor = smoothstep(0.0, soilFieldCapacity, belowCap);
          float infiltration = min(rainInput, maxInfiltrationRate * (0.25 + 0.75 * wetFactor));
          float runoff = max(rainInput - infiltration, 0.0);

          water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + infiltration, soilMoistureCap);

          float rainFreq = surfaceRainFreq(wallX0Ym);
          float freqThresh = clamp(floodRainThreshold, 0.0, 1.0);

          // Natural flooding: persistent/frequent rain ponds; one-off totals alone do not.
          if (enableFlooding > 0.5) {
            float freqOver = max(rainFreq - freqThresh, 0.0);
            float rainPresence = smoothstep(rainOccurMinRate, rainOccurMinRate + 0.12, rainFromAir);
            if (freqOver > 0.0 && rainPresence > 0.0)
              floodMm += freqOver * max(floodPondRate, 0.0) * rainPresence;
            // Runoff only contributes when rain has been frequent at this cell
            if (freqOver > 0.0 && runoff > 0.0)
              floodMm += runoff * 0.35 * clamp(freqOver / max(1.0 - freqThresh, 0.05), 0.0, 1.0);
          }

          // Coastal storm surge (toggleable)
          if (enableStormSurge > 0.5 && stormSurgeStrength > 0.001) {
            float bestInundation = 0.0;
            float windThresh = max(stormSurgeWindThreshold, 0.05);
            float maxCells = clamp(stormSurgeMaxCells, 0.5, 12.0);
            const int MAX_SURGE_SCAN = 24;
            int reach = int(clamp(stormSurgeInlandReach, 1.0, float(MAX_SURGE_SCAN)) + 0.5);

            for (int d = 1; d <= MAX_SURGE_SCAN; d++) {
              if (d > reach)
                break;
              float dist = float(d);

              vec2 uvL = texCoord + vec2(-dist * texelSize.x, 0.0);
              float leftAbove = cellsAboveOceanAt(uvL);
              if (leftAbove < 1e5) {
                vec2 windUvL = uvL;
                ivec4 wL = texture(wallTex, windUvL);
                if (wL[DISTANCE] == 0)
                  windUvL += vec2(0.0, texelSize.y);
                float onshoreL = max(texture(baseTex, windUvL)[VX], 0.0);
                float windScaleL = onshoreL * 10.0;
                float surgeCellsL = clamp((windScaleL - windThresh) / 3.2, 0.0, 1.0) * maxCells * stormSurgeStrength;
                float effectiveL = surgeCellsL - dist * 0.55;
                if (leftAbove <= effectiveL)
                  bestInundation = max(bestInundation, clamp(effectiveL - leftAbove, 0.0, 6.0));
              }

              vec2 uvR = texCoord + vec2(dist * texelSize.x, 0.0);
              float rightAbove = cellsAboveOceanAt(uvR);
              if (rightAbove < 1e5) {
                vec2 windUvR = uvR;
                ivec4 wR = texture(wallTex, windUvR);
                if (wR[DISTANCE] == 0)
                  windUvR += vec2(0.0, texelSize.y);
                float onshoreR = max(-texture(baseTex, windUvR)[VX], 0.0);
                float windScaleR = onshoreR * 10.0;
                float surgeCellsR = clamp((windScaleR - windThresh) / 3.2, 0.0, 1.0) * maxCells * stormSurgeStrength;
                float effectiveR = surgeCellsR - dist * 0.55;
                if (rightAbove <= effectiveR)
                  bestInundation = max(bestInundation, clamp(effectiveR - rightAbove, 0.0, 6.0));
              }
            }

            // Spread from already-flooded land neighbors
            float neighFlood = 0.0;
            if (wallXmY0[VERT_DISTANCE] == 0 && isSurgeFloodLandType(wallXmY0[TYPE]))
              neighFlood = max(neighFlood, getFloodHeightMm(texture(waterTex, texCoordXmY0)[TOTAL]));
            if (wallXpY0[VERT_DISTANCE] == 0 && isSurgeFloodLandType(wallXpY0[TYPE]))
              neighFlood = max(neighFlood, getFloodHeightMm(texture(waterTex, texCoordXpY0)[TOTAL]));
            if (neighFlood > 4.0) {
              float spreadFlood = max(neighFlood - 2.5, 0.0) * (0.55 + 0.25 * stormSurgeStrength);
              bestInundation = max(bestInundation, clamp(spreadFlood / 2800.0, 0.0, 5.0));
            }

            if (bestInundation > 0.02) {
              float targetFlood = 50.0 + bestInundation * 2800.0;
              floodMm = max(floodMm, min(targetFlood, floodMm + bestInundation * 180.0 + 8.0));
            }
          }

          floodMm = clamp(floodMm, 0.0, floodHeightPackMax);

          // Soak-in: floodwater → soil moisture (only way flood raises soil)
          float sunSoak = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
          float raining = smoothstep(freqThresh * 0.5, freqThresh + 0.25, rainFreq);
          float soakAmt = min(floodMm * (0.0012 + sunSoak * 0.006) * (1.0 - raining * 0.85), 0.12);
          floodMm -= soakAmt;
          water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + soakAmt, soilMoistureCap);

          // Same-frame quench: fire dies as soon as standing floodwater builds up
          if (isAnyFireType(wall[TYPE]) && floodMm >= significantFloodMm)
            wall[TYPE] = extinguishFireType(wall[TYPE]);

          // Legacy saves: seed climate moisture from established vegetation, not one-off rain spikes
          if (water[SUSTAINED_MOISTURE] < 0.01 && wall[VEGETATION] > 15)
            water[SUSTAINED_MOISTURE] = min(float(wall[VEGETATION]) * 0.25, 40.0);

          water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE] + infiltration * sustainedMoistureGain - sustainedMoistureDecay * max(climateMoistureDecayMult, 0.0), 0.0, 100.0);

          // Stash flood for evaporation step below (encoded after soil evap)
          water[TOTAL] = encodeLandWithFlood(floodMm);
        }
        water[SNOW] = clamp(water[SNOW] + precipDeposition[SNOW_DEPOSITION] * snowMassToHeight, 0.0, maxSnowAccumulationCm); // snow accumulation in cm


        vec4 baseAboveSurface = texture(baseTex, texCoordX0Yp);
        vec4 waterAboveSurface = texture(waterTex, texCoordX0Yp);

        float realTempAboveSurface = potentialToRealT(baseAboveSurface[TEMPERATURE], texCoordX0Yp.y);

        float evaporation = calcEvaporation(realTempAboveSurface, waterAboveSurface[TOTAL], vegetationInfluence(wall[VEGETATION]), water[SOIL_MOISTURE]) * 0.10 * max(soilMoistureLossMult, 0.0);
        evaporation *= mix(1.0, 0.12, clamp(water[SNOW] / fullWhiteSnowHeight, 0.0, 1.0));

        // Evaporate standing flood first; soil only dries when flood is gone.
        // A share of evaporating flood soaks into soil (soil rises only from flood loss).
        {
          float floodNow = getFloodHeightMm(water[TOTAL]);
          float sunEvap = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
          float rainingEvap = surfaceRainFreq(wallX0Ym);
          if (floodNow > 0.0) {
            float floodEvap = evaporation * (1.0 + sunEvap * 3.0) * (1.0 - rainingEvap * 0.9);
            floodEvap = min(floodEvap, floodNow);
            float toSoil = floodEvap * 0.45; // evaporating/receding flood wets soil
            floodNow -= floodEvap;
            water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + toSoil, soilMoistureCap);
            water[TOTAL] = encodeLandWithFlood(floodNow);
          } else {
            evaporation *= (1.0 + sunEvap * 0.75);
            // Limited only by available soil moisture (optional slider cap applied elsewhere)
            water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] - evaporation, soilMoistureCap);
          }
        }


        if (int(iterNum) % 100 == 0) { // snow and soil moisture smoothing

          // average out snow cover
          const float snowSmoothingRate = 0.02; // max 0.9
          const float moistureSmoothingRate = 0.02;
          const float sustainedSmoothingRate = 0.01;

          float numNeighbors = 0.;
          float totalNeighborSnow = 0.0;
          float totalNeighborSoilMoisture = 0.0;
          float totalNeighborSustainedMoisture = 0.0;

          if (wallXmY0[VERT_DISTANCE] == 0 && (isLandOrForest2(wallXmY0[TYPE]) || isSettlementWall(wallXmY0[TYPE]))) {
            totalNeighborSnow += texture(waterTex, texCoordXmY0)[SNOW];
            totalNeighborSoilMoisture += texture(waterTex, texCoordXmY0)[SOIL_MOISTURE];
            totalNeighborSustainedMoisture += texture(waterTex, texCoordXmY0)[SUSTAINED_MOISTURE];
            numNeighbors += 1.;
          }
          if (wallXpY0[VERT_DISTANCE] == 0 && (isLandOrForest2(wallXpY0[TYPE]) || isSettlementWall(wallXpY0[TYPE]))) {
            totalNeighborSnow += texture(waterTex, texCoordXpY0)[SNOW];
            totalNeighborSoilMoisture += texture(waterTex, texCoordXpY0)[SOIL_MOISTURE];
            totalNeighborSustainedMoisture += texture(waterTex, texCoordXpY0)[SUSTAINED_MOISTURE];
            numNeighbors += 1.;
          }
          if (numNeighbors > 0.) { // prevent devide by 0
            float avgNeighborSnow = totalNeighborSnow / numNeighbors;
            water[SNOW] += (avgNeighborSnow - water[SNOW]) * snowSmoothingRate;

            float avgNeighborSoilMoisture = totalNeighborSoilMoisture / numNeighbors;
            water[SOIL_MOISTURE] = applySoilMoistureCap(
              water[SOIL_MOISTURE] + (avgNeighborSoilMoisture - water[SOIL_MOISTURE]) * moistureSmoothingRate,
              soilMoistureCap);

            float avgNeighborSustainedMoisture = totalNeighborSustainedMoisture / numNeighbors;
            water[SUSTAINED_MOISTURE] += (avgNeighborSustainedMoisture - water[SUSTAINED_MOISTURE]) * sustainedSmoothingRate;
          }

          // dynamic vegetation — growth driven by sustained climate moisture, not one-off rain spikes
          float climateMoisture = water[SUSTAINED_MOISTURE];

          // Burning cells do not grow; fire already consumes biomass
          int vegetationGrowthRate = 0;
          if (!isAnyFireType(wall[TYPE]) && climateMoisture >= minVegetationMoisture)
            vegetationGrowthRate = int((climateMoisture - minVegetationMoisture) * sqrt(lightAboveSurface[SUNLIGHT]) * 0.0008 * max(vegetationGrowthMult, 0.0));

          if (vegetationGrowthRate > 0 && int(iterNum) % ((100 / vegetationGrowthRate) * 100) == 0) {
            int tempLimit = int(map_rangeC(realTempAboveSurface, CtoK(0.0), CtoK(25.0), 0., float(FOREST_VEG_MAX)));
            bool wasForest = isForestVegetation(wall[VEGETATION]);

            if (wall[VEGETATION] < GRASS_VEG_MAX) {
              if (tempLimit > wall[VEGETATION])
                wall[VEGETATION] = min(wall[VEGETATION] + 1, GRASS_VEG_MAX);
            } else if (wall[VEGETATION] == GRASS_VEG_MAX) {
              // Mature grass can promote into forest canopy when climate allows
              if (tempLimit > FOREST_VEG_MIN && climateMoisture >= minVegetationMoisture * 1.35)
                wall[VEGETATION] = FOREST_VEG_MIN;
            } else if (tempLimit > wall[VEGETATION]) {
              wall[VEGETATION] = min(wall[VEGETATION] + 1, FOREST_VEG_MAX);
            }

            // On first transition into forest biomass, pick conifer vs deciduous species
            if (!wasForest && isForestVegetation(wall[VEGETATION]) && isLandOrForest2(wall[TYPE])) {
              int mode = int(forestGrowthSpecies + 0.5); // 0 random, 1 forest, 2 forest2
              if (mode == 2)
                wall[TYPE] = WALLTYPE_FOREST2;
              else if (mode == 1)
                wall[TYPE] = WALLTYPE_LAND;
              else {
                float pick = random2d(texCoord * resolution + vec2(iterNum * 0.017, 91.3));
                wall[TYPE] = pick < 0.5 ? WALLTYPE_FOREST2 : WALLTYPE_LAND;
              }
            }
          }

          // Gradual drought dieback — in-game days to weeks, scaled by sustained + soil moisture
          if (wall[VEGETATION] > 0) {
            float soilMoist = water[SOIL_MOISTURE];
            float sustainedStress = max(1.0 - climateMoisture / minVegetationMoisture, 0.0);
            float soilBuffer = smoothstep(10.0, fullGreenSoilMoisture, soilMoist);
            float droughtStress = clamp(sustainedStress * (1.0 - soilBuffer * 0.55), 0.0, 1.0);

            if (droughtStress > 0.05) {
              float biomass = isForestVegetation(wall[VEGETATION])
                ? forestBiomass(wall[VEGETATION])
                : grassBiomass(wall[VEGETATION]);
              float treeSlowdown = isForestVegetation(wall[VEGETATION])
                ? 1.0 + smoothstep(0.0, float(FOREST_VEG_MAX - GRASS_VEG_MAX), biomass) * (vegTreeDiebackSlowdown - 1.0)
                : 0.62;
              float daysPerLoss = mix(vegDiebackDaysPerPointMild, vegDiebackDaysPerPointSevere, pow(droughtStress, 0.82));
              float cellJitter = 0.88 + random2d(texCoord * resolution + biomass * 0.013) * 0.24;
              float dieInterval = max(daysPerLoss * treeSlowdown * cellJitter * iterPerSimDay, vegDiebackMinIter) / max(vegetationDiebackMult, 0.05);
              int diePeriod = int(dieInterval);
              int diePhase = int(random2d(texCoord * vec2(41.7, 173.3)) * float(diePeriod));

              if (diePeriod > 0 && (int(iterNum) + diePhase) % diePeriod == 0) {
                wall[VEGETATION] = max(wall[VEGETATION] - 1, 0);
                // Drop deciduous marker once canopy biomass is gone
                if (!isForestVegetation(wall[VEGETATION]) && wall[TYPE] == WALLTYPE_FOREST2)
                  wall[TYPE] = WALLTYPE_LAND;
              }
            }
          }

          int subInterval = int(iterNum) / 100;

          // Fire cannot spread onto significantly flooded ground
          if (getFloodHeightMm(water[TOTAL]) < significantFloodMm
              && wall[VEGETATION] >= minimalFireVegetation
              && !isAnyFireType(wall[TYPE])) {
            int moistureGate = int(water[SOIL_MOISTURE] * 0.1 + water[SNOW] * 0.5) + 10;
            bool adjacentFire = isAnyFireType(wallXmY0[TYPE]) || isAnyFireType(wallXpY0[TYPE]);

            // Contiguous front: left/right neighbor fire
            if (adjacentFire && subInterval % moistureGate == 0) {
              if (wall[TYPE] == WALLTYPE_FOREST2)
                wall[TYPE] = WALLTYPE_FIRE_FOREST2;
              else
                wall[TYPE] = WALLTYPE_FIRE;
            }
            // Ember / spot fires: short-range wind-lofted smoke sampled upwind aloft
            else if (subInterval % max(moistureGate / 2, 1) == 0) {
              vec4 airAbove = texture(baseTex, texCoordX0Yp);
              float windX = airAbove[VX];
              float windMag = abs(windX);
              float windSign = sign(windX);
              if (windSign == 0.0)
                windSign = 1.0;
              // Short range only — just ahead of the front (1–4 cells)
              float lookCells = clamp(windMag * 16.0, 1.0, 4.0);
              float emberLoad = 0.0;
              for (int h = 1; h <= 3; h++) {
                vec2 emberUV = texCoord + vec2(-windSign * lookCells * texelSize.x, float(h) * texelSize.y);
                emberUV.x = fract(emberUV.x); // wrap horizontally
                emberUV.y = clamp(emberUV.y, 0.0, 1.0);
                emberLoad = max(emberLoad, texture(smokeTex, emberUV).r);
                vec2 emb2 = emberUV + vec2(-windSign * texelSize.x, 0.0);
                emb2.x = fract(emb2.x);
                emberLoad = max(emberLoad, texture(smokeTex, emb2).r);
              }
              // Concentrate near denser plume; still not only pure flame (>4.5)
              bool inEmberBand = emberLoad > 0.25 && emberLoad < 8.0;
              if (inEmberBand) {
                float dryness = clamp(1.0 - water[SOIL_MOISTURE] * 0.02 - water[SNOW] * 0.05, 0.05, 1.0);
                float windFactor = clamp(0.3 + windMag * 10.0, 0.3, 1.4);
                // Higher chance at short range so spots form just downwind
                float rangeFalloff = 1.15 - (lookCells - 1.0) * 0.12; // stronger at 1–2 cells
                float chance = clamp(emberLoad * 0.14 * windFactor * dryness * rangeFalloff, 0.0, 0.55);
                float roll = random2d(texCoord * resolution + vec2(iterNum * 0.0013, 17.7));
                if (roll < chance) {
                  if (wall[TYPE] == WALLTYPE_FOREST2)
                    wall[TYPE] = WALLTYPE_FIRE_FOREST2;
                  else
                    wall[TYPE] = WALLTYPE_FIRE;
                }
              }
            }
          }
          //}
        }
        break;
      case WALLTYPE_FRESH_WATER:
        water[SALINITY] = 0.0;
      case WALLTYPE_WATER:
        {
          if (wall[TYPE] == WALLTYPE_WATER && water[SALINITY] < 1.0)
            water[SALINITY] = oceanSalinityPpt;

          const float waterTempUpdateInterval = 20.0; // Update less often but with bigger value to reduce rounding error

          if (base[TEMPERATURE] > 500.0) // land / wall marker: freshly created water body
            base[TEMPERATURE] = CtoK(25.0);

          float salinity = salinityForWallType(wall[TYPE], water[SALINITY]);
          float freezeEnabled = enableSaltwaterFreezing;
          float freezeC = saltwaterFreezePointC;
          if (wall[TYPE] == WALLTYPE_FRESH_WATER) {
            freezeEnabled = enableFreshwaterFreezing;
            freezeC = freshwaterFreezePointC;
          }

          bool dynamicWater = dynamicWaterTemperature >= 1.0;
          float airTemperature = potentialToRealT(texture(baseTex, texCoordX0Yp)[TEMPERATURE], texCoordX0Yp.y);

          if (dynamicWater && mod(iterNum, waterTempUpdateInterval) < 0.5) {

            // average out temperature
            float numNeighbors = 0.;
            float totalNeighborTemp = 0.0;

            if (isLiquidWaterType(wallXmY0[TYPE])) { // left is water
              totalNeighborTemp += texture(baseTex, texCoordXmY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (isLiquidWaterType(wallXpY0[TYPE])) { // right is water
              totalNeighborTemp += texture(baseTex, texCoordXpY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (numNeighbors > 0.) { // prevent devide by 0
              float avgNeighborTemp = totalNeighborTemp / numNeighbors;
              base[TEMPERATURE] += (avgNeighborTemp - base[TEMPERATURE]) * 0.10;
            }

            float netWaterHeating = 0.0;
            netWaterHeating += (airTemperature - base[TEMPERATURE]) * waterHeatExchangeRate; // water heated or cooled by the air above

            netWaterHeating -=
              max((maxWater(base[TEMPERATURE]) - waterX0Yp[TOTAL]) * waterEvaporation, 0.) * evapHeat * 0.5; // evaporative cooling (half the real value, to prevent boring non convective conditions)

            float lightPower = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0); // Light power per horizontal surface area;
            lightPower *= (1. - ALBEDO_WATER);
            lightPower *= lightHeatingConst;
            netWaterHeating += lightPower * lightEffectScale; // sun heating water

            netWaterHeating += lightAboveSurface[NET_HEATING] * lightEffectScale; // IR heating/cooling effect

            base[TEMPERATURE] += netWaterHeating / waterHeatCapacity * waterTempUpdateInterval;
          }

          float waterTempC = KtoC(base[TEMPERATURE]);

          if (freezeEnabled > 0.5) {
            if (dynamicWater) {
              // Water only freezes once its own heat budget has brought it down to the freezing point;
              // heat lost below that point becomes ice instead of colder water.
              float cmPerK = iceCmPerKelvin(waterHeatCapacity, meltingHeat);
              if (waterTempC < freezeC) {
                water[SNOW] += (freezeC - waterTempC) * cmPerK;
                base[TEMPERATURE] = CtoK(freezeC);
              } else if (water[SNOW] > 0.0) {
                float melt = min(water[SNOW], (waterTempC - freezeC) * cmPerK);
                water[SNOW] -= melt;
                base[TEMPERATURE] -= melt / cmPerK;
              }
              if (water[SNOW] >= minIceFormThickness * 0.2) {
                wall[TYPE] = WALLTYPE_ICE;
                water[SALINITY] = salinity;
              }
            } else {
              float airTempC = KtoC(airTemperature);
              if (waterTempC < freezeC || airTempC < freezeC) {
                float coldness = max(freezeC - waterTempC, 0.0) + max(freezeC - airTempC, 0.0) * 0.75;
                float freezeProgress = max(coldness, 0.1) * waterFreezeRate;
                water[SNOW] = min(water[SNOW] + freezeProgress, minIceFormThickness);
                if (water[SNOW] >= minIceFormThickness * 0.2 || waterTempC < freezeC - 0.5) {
                  wall[TYPE] = WALLTYPE_ICE;
                  water[SALINITY] = salinity;
                  water[SNOW] = max(water[SNOW], minIceFormThickness);
                }
              }
            }
          } else {
            water[SNOW] = 0.0;
          }

          base[TEMPERATURE] = clamp(base[TEMPERATURE], CtoK(min(0.0, freezeC)), CtoK(maxWaterTemperatureC)); // limit water temperature range

          wall[VEGETATION] = 20;
          water[SOIL_MOISTURE] = 100.0;
        }
        break;
      case WALLTYPE_ICE:
        {
          const float waterTempUpdateInterval = 20.0;
          float iceThickness = water[SNOW];
          iceThickness += precipDeposition[SNOW_DEPOSITION] * snowMassToHeight;
          if (KtoC(base[TEMPERATURE]) <= 0.0)
            iceThickness += precipDeposition[RAIN_DEPOSITION] * 0.05; // freezing rain adds to ice sheet
          // Read raw salinity channel — do not remap land-ice marker through helpers
          float salinity = water[SALINITY];
          bool nearLiquid = isLiquidWaterType(wallXmY0[TYPE]) || isLiquidWaterType(wallXpY0[TYPE]);
          bool landIce = isLandOriginIce(salinity);
          // Thick inland ice (legacy unmarked glaciers / snow-compacted ice) → land ice
          if (!landIce && salinity < 5.0 && iceThickness > iceCapFormSnowCm && !nearLiquid)
            landIce = true;
          if (landIce) {
            salinity = landIceSalinityMarker;
            water[SALINITY] = landIceSalinityMarker; // persist every frame
          }

          float freezeC = freshwaterFreezePointC;
          if (!landIce && salinity >= 1.0)
            freezeC = saltwaterFreezePointC;

          bool dynamicWater = dynamicWaterTemperature >= 1.0;
          bool canMelt = !landIce || enableGlacierMelting > 0.5;
          float cmPerK = iceCmPerKelvin(waterHeatCapacity, meltingHeat);
          vec4 baseAbove = texture(baseTex, texCoordX0Yp);
          float airTemperature = potentialToRealT(baseAbove[TEMPERATURE], texCoordX0Yp.y);
          float airTempC = KtoC(airTemperature);
          float windSpeed = abs(baseAbove[VX]);
          bool brokeUp = false;

          if (dynamicWater) {
            if (mod(iterNum, waterTempUpdateInterval) < 0.5) {
              // Same surface energy budget as open water, minus evaporation (sublimation is handled below).
              float iceT = base[TEMPERATURE];
              float netIceHeating = (airTemperature - iceT) * waterHeatExchangeRate;
              float lightPower = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0);
              float iceAlbedo = map_rangeC(iceThickness, 0.0, fullWhiteSnowHeight, ALBEDO_WATER, ALBEDO_ICE);
              lightPower *= (1. - iceAlbedo);
              lightPower *= lightHeatingConst;
              netIceHeating += lightPower * lightEffectScale;
              netIceHeating += lightAboveSurface[NET_HEATING] * lightEffectScale;
              base[TEMPERATURE] += netIceHeating / waterHeatCapacity * waterTempUpdateInterval;

              float numNeighbors = 0.;
              float totalNeighborTemp = 0.0;

              if (wallXmY0[TYPE] == WALLTYPE_ICE || isLiquidWaterType(wallXmY0[TYPE])) {
                totalNeighborTemp += texture(baseTex, texCoordXmY0)[TEMPERATURE];
                numNeighbors += 1.;
              }
              if (wallXpY0[TYPE] == WALLTYPE_ICE || isLiquidWaterType(wallXpY0[TYPE])) {
                totalNeighborTemp += texture(baseTex, texCoordXpY0)[TEMPERATURE];
                numNeighbors += 1.;
              }
              if (numNeighbors > 0.) {
                float avgNeighborTemp = totalNeighborTemp / numNeighbors;
                base[TEMPERATURE] += (avgNeighborTemp - iceT) * 0.10;
              }

              float iceBudgetC = KtoC(base[TEMPERATURE]);
              if (iceBudgetC > freezeC && canMelt) {
                // Ice cannot warm past its melting point: the extra heat melts it instead.
                float melting = min((iceBudgetC - freezeC) * cmPerK, iceThickness);
                iceThickness -= melting;
                base[TEMPERATURE] -= melting / cmPerK;
              } else if (iceBudgetC < freezeC && !landIce) {
                // A cold surface conducts heat out of the water below, which freezes onto the underside.
                float growth = iceBasalGrowthCm(freezeC - iceBudgetC, iceThickness) * waterTempUpdateInterval;
                growth = clamp(growth, 0.0, max(maxIceThickness - iceThickness, 0.0));
                iceThickness += growth;
                base[TEMPERATURE] += growth / cmPerK;
              }
            }
          } else {
            float iceTempC = KtoC(base[TEMPERATURE]);
            if (iceTempC < freezeC - 2.0 && int(iterNum) % 50 == 0)
              iceThickness = min(iceThickness + iceGrowthRate, maxIceThickness);

            if (iceThickness > 0.0 && airTempC > freezeC && canMelt) {
              float warmth = max(airTempC - freezeC, 0.0);
              float melting = min(warmth * iceMeltRate, iceThickness);
              iceThickness -= melting;
            }
          }

          if (iceThickness > 0.1)
            base[TEMPERATURE] = min(base[TEMPERATURE], CtoK(freezeC));

          float iceTempC = KtoC(base[TEMPERATURE]);
          if (iceTempC <= freezeC) {
            float vaporDeficit = max(maxWater(CtoK(iceTempC)) - waterX0Yp[TOTAL], 0.0);
            float sublimation = min(vaporDeficit * snowSublimationRate, iceThickness);
            iceThickness -= sublimation;
          }

          // thin ice only breaks up when the air above is genuinely above freezing
          // (sea/lake ice only — land glaciers decompact to snowy land instead)
          if (!landIce && iceThickness < thinIceBreakupCm && airTempC > freezeC + 0.5 && windSpeed > 0.12) {
            iceThickness = 0.0;
            brokeUp = true;
          }

          water[SNOW] = max(iceThickness, 0.0);

          // With dynamic water, melted-through ice turns to water at its melting point; otherwise warm air decides.
          bool meltedThrough = brokeUp || (dynamicWater ? KtoC(base[TEMPERATURE]) >= freezeC - 0.05 : airTempC > freezeC);

          if (landIce && enableGlacierMelting > 0.5 && airTempC > freezeC && water[SNOW] <= iceCapFormSnowCm) {
            // Glacier melt: back to land with max snow allowed before glacier formation
            wall[TYPE] = WALLTYPE_LAND;
            water[SNOW] = iceCapFormSnowCm;
            water[SOIL_MOISTURE] = 25.0;
            water[SUSTAINED_MOISTURE] = 25.0;
            water[TOTAL] = WATER_MARKER_LAND;
            wall[VEGETATION] = 0;
            base[TEMPERATURE] = 1000.0; // land wall snow-melt feedback marker
          } else if (!landIce && water[SNOW] <= 0.1 && meltedThrough) {
            wall[TYPE] = liquidWaterTypeFromSalinity(salinity);
            if (wall[TYPE] == WALLTYPE_WATER)
              water[SALINITY] = max(salinity, oceanSalinityPpt);
            else
              water[SALINITY] = 0.0;
            water[SNOW] = 0.0;
            base[TEMPERATURE] = dynamicWater ? CtoK(freezeC + 0.05) : max(base[TEMPERATURE], CtoK(freezeC + 0.5));
          } else if (water[SNOW] <= 0.1) {
            // Keep a thin remnant; land ice with melting disabled stays glacial
            water[SNOW] = landIce ? max(water[SNOW], minIceFormThickness) : minIceFormThickness;
          }

          wall[VEGETATION] = 0;
          if (wall[TYPE] == WALLTYPE_ICE && !landIce)
            water[SOIL_MOISTURE] = 100.0;
        }
        break;
      }
    }
  }

  if (wall[DISTANCE] == 0)
    smoke = 0.0;

  base = sanitizeSimBase(base, wall[DISTANCE]);
  water = sanitizeSimWater(water, wall[DISTANCE], wall[TYPE]);
  smoke = sanitizeSimSmoke(smoke);
} // main
