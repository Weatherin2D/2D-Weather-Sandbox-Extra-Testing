#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;

in vec2 texCoord;
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

in vec2 texCoordXmYp; // left up
in vec2 texCoordXpYm; // right down

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D smokeTex;

uniform vec4 userInputValues; // xpos    Ypos     intensity     Brush Size

#define BRUSH_INTENSITY 2
#define BRUSH_SIZE 3

uniform vec2 userInputMove;  // moveX  moveY
uniform int userInputType;   // 0 = nothing 	1 = temp ...
uniform int userInputCustomSlot;   // atlas slot 0–7 for custom terrain brushes
uniform int userInputSurfaceKind;  // 0 land/custom 1 fresh 2 sea 3 iceSheet 4 iceCap
uniform int userInputSettlementVariant; // 0–11 urban/suburban look index

uniform vec4 airplaneValues; // xpos   Ypos   throttle   fire

uniform bool wrapHorizontally;

uniform float dryLapse;
uniform float evapHeat;
uniform float meltingHeat;
uniform float condensationRate;
uniform float cloudEvaporationRate;

uniform float globalEffectsStartAlt;
uniform float globalEffectsEndAlt;
uniform float globalDrying;
uniform float globalHeating;
uniform float soundingForcing;
uniform float waterTemperature;
uniform float maxWaterTemperatureC;
uniform float enableGlacierFormation;
uniform float iterNum;
uniform float soilMoistureCap; // 0 = unlimited; else max soil moisture mm
uniform int brushOnlyMode; // 1 = copy fields + apply brush only (pause-edit; no advection/physics)
uniform bool allowCaves;

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;
layout(location = 3) out float smoke;

uniform vec2 resolution;

vec2 texelSize;

uniform vec4 initial_Tv[126];
uniform vec4 realWorldSounding_Tv[126];
uniform vec4 realWorldSounding_Wv[126];
uniform vec4 realWorldSounding_Velv[126];

#include "common.glsl"

float getInitialT(int y)
{
  int i = simProfileIndex(y, resolution.y);
  return initial_Tv[i / 4][i % 4];
}
float getRealWorldSounding_T(int y)
{
  int i0 = simProfileIndex(max(y - 1, 0), resolution.y);
  int i1 = simProfileIndex(y, resolution.y);
  return (realWorldSounding_Tv[i1 / 4][i1 % 4] + realWorldSounding_Tv[i0 / 4][i0 % 4]) / 2.;
}
float getRealWorldSounding_W(int y)
{
  int i0 = simProfileIndex(max(y - 1, 0), resolution.y);
  int i1 = simProfileIndex(y, resolution.y);
  return (realWorldSounding_Wv[i1 / 4][i1 % 4] + realWorldSounding_Wv[i0 / 4][i0 % 4]) / 2.;
}
float getRealWorldSounding_Vel(int y)
{
  int i0 = simProfileIndex(max(y - 1, 0), resolution.y);
  int i1 = simProfileIndex(y, resolution.y);
  return (realWorldSounding_Velv[i1 / 4][i1 % 4] + realWorldSounding_Velv[i0 / 4][i0 % 4]) / 2.;
}

void main()
{
  wall = texture(wallTex, texCoord);

  texelSize = vec2(1.) / resolution;

  float actualTempChange = 0.0, realTemp;

  // Pause-edit path: copy state and only apply the brush — no advection, condensation, or gravity.
  if (brushOnlyMode != 0) {
    base = texture(baseTex, texCoord);
    water = texture(waterTex, texCoord);
    smoke = texture(smokeTex, texCoord).r;
    if (wall[DISTANCE] != 0)
      realTemp = potentialToRealT(base[TEMPERATURE]);
  } else if (wall[DISTANCE] != 0) { // not wall

    vec4 cellX0Y0 = texture(baseTex, texCoord);
    vec4 cellXmY0 = texture(baseTex, texCoordXmY0);
    vec4 cellX0Ym = texture(baseTex, texCoordX0Ym);
    vec4 cellXpY0 = texture(baseTex, texCoordXpY0);
    vec4 cellX0Yp = texture(baseTex, texCoordX0Yp);

    vec4 cellXmYp = texture(baseTex, texCoordXmYp);
    vec4 cellXpYm = texture(baseTex, texCoordXpYm);

    // calculate velocities for different positions within cell
    vec2 velAtP = simClampVel(vec2((cellXmY0.x + cellX0Y0.x) / 2.,
                       (cellX0Ym.y + cellX0Y0.y) / 2.));                                        // center of cell
    vec2 velAtVx = simClampVel(vec2(cellX0Y0.x, (cellX0Ym.y + cellXpY0.y + cellX0Y0.y + cellXpYm.y) / 4.)); // midle of right edge of cell
    vec2 velAtVy = simClampVel(vec2((cellXmY0.x + cellX0Yp.x + cellXmYp.x + cellX0Y0.x) / 4.,
                        cellX0Y0.y));                                                           // midle of top edge of cell

    // ADVECT AIR:

    base[VX] = bilerp(baseTex, fragCoord - velAtVx).x;
    base[VY] = bilerp(baseTex, fragCoord - velAtVy).y;

    base[PRESSURE] = bilerpWall(baseTex, wallTex, fragCoord - velAtP)[PRESSURE];
    base[TEMPERATURE] = bilerpWall(baseTex, wallTex, fragCoord - velAtP)[TEMPERATURE];

    water.xyw = bilerpWall(waterTex, wallTex, fragCoord - velAtP).xyw; // centered (water.w = dust)

    water[PRECIPITATION] = bilerpWall(waterTex, wallTex, fragCoord - velAtP + vec2(0, 0.05))[PRECIPITATION]; // precipitation visualization advected with flow, and downward

    smoke = bilerpWall(smokeTex, wallTex, fragCoord - velAtP).r; // combustion smoke, same advection as dust

    realTemp = potentialToRealT(base[TEMPERATURE]);


    // excessWater: vapor+cloud above saturation at current T (can be negative when dry)
    float excessWater = water[TOTAL] - maxWater(realTemp);
    // Vapor that should be cloud but isn't yet (or deficit when evaporating)
    float overSaturation = excessWater - water[CLOUD];

    float condensation;
    if (overSaturation < 0.0) {
      // Cloud evaporates into undersaturated air (faster than condensation, GUI-tunable)
      float evapRate = max(cloudEvaporationRate, 0.0);
      condensation = overSaturation * evapRate;
    } else {
      // Soft onset near equilibrium — thin haze doesn't flicker, but still fires towers
      float onset = smoothstep(0.0, 0.006, overSaturation);
      condensation = overSaturation * max(condensationRate, 0.0) * onset;
    }
    condensation = max(condensation, -water[CLOUD]); // never evaporate more cloud than exists

    // Latent heat is conservative: the same heat per gram for condensation and evaporation.
    actualTempChange = condensation * evapHeat;

    base[TEMPERATURE] += actualTempChange;
    realTemp += actualTempChange;
    water[CLOUD] = max(water[CLOUD] + condensation, 0.0);


    // Radiative cooling and heating effects

    if (texCoord.y > globalEffectsStartAlt && texCoord.y < globalEffectsEndAlt) {
      water[TOTAL] -= clamp(globalDrying, 0., max(water[TOTAL] - maxWater(max(realTemp - 20.0, CtoK(-80.))), 0.)); // only dry down to a dew point 20 C below the temperature

      base[TEMPERATURE] += globalHeating;


      // apply real sounding

      int soundingArrayindex = int(texCoord.y * (1.0 / texelSize.y));

      float Tdiff = base[TEMPERATURE] - getRealWorldSounding_T(soundingArrayindex);
      base[TEMPERATURE] -= Tdiff * 0.001 * soundingForcing;


      float Wdiff = water[TOTAL] - getRealWorldSounding_W(soundingArrayindex);
      water[TOTAL] -= Wdiff * 0.001 * soundingForcing;

      base.xy *= 1.0 - map_rangeC(soundingForcing, 0.1, 1.0, 0.0, 0.001); // drag to stabilize with high forcing

      float velDiff = base[VX] - getRealWorldSounding_Vel(soundingArrayindex);
      base[VX] -= velDiff * map_rangeC(soundingForcing, 0.9, 1.0, 0.0, 0.001);


      // if (texCoord.y > 0.93) {
      //   base[TEMPERATURE] -= (KtoC(realTemp) - -55.0) * 0.0005; // tropopause temperature stabilization
      //   water[TOTAL] -= (water[TOTAL] - 0.0125) * 0.0001;       // keep stratosphere dew point around -80C
      // }
    }

    // water[0] -= max(water[1] - 0.1, 0.0) * 0.0001; // Precipitation effect
    // drying !


    water[TOTAL] = max(water[TOTAL], 0.0); // prevent water from going negative

  } else {                                 // this is wall

    base = texture(baseTex, texCoord);     // pass trough

    water = texture(waterTex, texCoord);
    smoke = 0.0;                             // smoke only lives in air

    if (isLandOrForest2(wall[TYPE])) { // land / deciduous forest land
      base[TEMPERATURE] = 1000.0;      // Set snow melting feedback to 0
    }

    // water[TOTAL] = 1111.; // indicate this is wall

    ivec4 wallX0Yp = texture(wallTex, texCoordX0Yp);

    // prevent negative numbers
    // NOTE: SUSTAINED_MOISTURE and SALINITY share channel 1 — only clamp on land.
    // Clamping on ice/water would wipe the land-ice salinity marker every frame.
    wall[VEGETATION] = max(wall[VEGETATION], 0);
    bool landSurface = !isAnyWaterType(wall[TYPE]);
    if (landSurface) {
      water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE], soilMoistureCap);
      water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE], 0.0, 100.0);
      if (wallX0Yp[DISTANCE] != 0)
        water[SNOW] = max(water[SNOW], 0.0); // newly exposed surface may still hold RAIN_FREQ
    }

    if (wallX0Yp[DISTANCE] != 0) { // cell above is not wall, surface layer


      vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);
      vec4 waterX0Yp = texture(waterTex, texCoordX0Yp);

      float tempC = KtoC(potentialToRealT(baseX0Yp[TEMPERATURE])); // temperature of cell above

      if (landSurface && water[SNOW] > 0.0 && tempC > 0.0) {       // snow melting on ground
        float melting = min(tempC * snowMeltRate, water[SNOW]);
        water[SNOW] -= melting;
        base[TEMPERATURE] += melting / snowMassToHeight * meltingHeat; // signal snow melting mass, cooling will be applied in pressure shader
        water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + melting, soilMoistureCap); // melting snow adds water to soil
        water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE] + melting * sustainedMoistureGain, 0.0, 100.0);
      }

      if (landSurface && water[SNOW] > 0.0 && tempC <= 0.0) { // snow sublimation below freezing
        float vaporDeficit = max(maxWater(CtoK(tempC)) - waterX0Yp[TOTAL], 0.0);
        float sublimation = min(vaporDeficit * snowSublimationRate, water[SNOW]);
        water[SNOW] -= sublimation;
        base[TEMPERATURE] += sublimation / snowMassToHeight * meltingHeat * 0.5;
      }

      if (wall[TYPE] == WALLTYPE_ICE) { // land ice cap / ice sheet sublimation
        float vaporDeficit = max(maxWater(CtoK(tempC)) - waterX0Yp[TOTAL], 0.0);
        float sublimation = min(vaporDeficit * snowSublimationRate * 0.5, water[SNOW]);
        water[SNOW] -= sublimation;
      }

      if (enableGlacierFormation > 0.5 && isLandOrForest2(wall[TYPE]) && water[SNOW] > iceCapFormSnowCm && tempC < -8.0 && int(iterNum) % 200 == 0) { // compact deep snow to land ice
        wall[TYPE] = WALLTYPE_ICE;
        water[SALINITY] = landIceSalinityMarker;
      }

      if (landSurface && water[SOIL_MOISTURE] > 0.0 && tempC > 0.0) { // water evaporating from ground
        float evaporation = max((maxWater(CtoK(tempC)) - water[TOTAL]) * 0.00001, 0.);
        water[SOIL_MOISTURE] -= evaporation;
      }
    }
  }

  // USER INPUT:

  bool inBrush = false;           // if cell is in brush area
  float weight = 1.0;             // 1.0 at center, 0.0 at border

  if (userInputValues.x < -0.5) { // whole width brush
    if (abs(userInputValues.y - texCoord.y) < userInputValues[BRUSH_SIZE] * texelSize.y)
      inBrush = true;
  } else { // circular brush

    vec2 vecFromMouse;

    if (wrapHorizontally) {
      vecFromMouse = vec2(absHorizontalDist(userInputValues.x, texCoord.x), userInputValues.y - texCoord.y);
    } else {
      vecFromMouse = vec2(abs(userInputValues.x - texCoord.x), userInputValues.y - texCoord.y);
    }

    vecFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle

    float distFromMouse = length(vecFromMouse);

    weight = smoothstep(userInputValues[BRUSH_SIZE] * texelSize.y, 0., distFromMouse);

    if (distFromMouse < userInputValues[BRUSH_SIZE] * texelSize.y) {
      inBrush = true;
    }
  }

  bool overlaySurfaceTool = userInputType == 13 || userInputType == 14 || userInputType == 15 || userInputType == 16
      || userInputType == 17 || userInputType == 20 || userInputType == 21
      || userInputType == 22 || userInputType == 27 || userInputType == 28
      || userInputType == 30 || userInputType == 31 || userInputType == 32
      || userInputType == 33;
  // Clicking the visible interpolated slope still paints this column's occupancy cap
  // (vegetation / urban live there). Allow a tall vertical window so small hills
  // above the integer cell still receive grass and trees.
  if (!inBrush && overlaySurfaceTool && wall[DISTANCE] == 0 && !isAnyWaterType(wall[TYPE])
      && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
    float r = userInputValues[BRUSH_SIZE] * texelSize.y;
    float dy = userInputValues.y - texCoord.y;
    if (userInputValues.x < -0.5) {
      if (dy <= r * 8.0 && dy >= -r * 8.0)
        inBrush = true;
    } else {
      float dx = wrapHorizontally ? absHorizontalDist(userInputValues.x, texCoord.x)
                                  : abs(userInputValues.x - texCoord.x);
      dx *= texelSize.y / texelSize.x;
      if (dx < r && dy <= r * 8.0 && dy >= -r * 8.0)
        inBrush = true;
    }
  }

  if (inBrush) {
    if (userInputType == 1) {                                              // temperature
      base[3] += userInputValues[BRUSH_INTENSITY];
      if (wall[DISTANCE] != 0) {
        // Painted air keeps only the vapor that fits the new temperature, without latent heat,
        // so cooling to -15°C does not condense the old dewpoint and spring back toward 10–20°C.
        float paintedReal = potentialToRealT(base[TEMPERATURE]);
        float sat = maxWater(paintedReal);
        if (water[TOTAL] > sat) {
          water[TOTAL] = sat;
          water[CLOUD] = min(water[CLOUD], water[TOTAL]);
        }
      } else if (isAnyWaterType(wall[TYPE]))                               // water / ice wall
        base[3] = clamp(base[TEMPERATURE], CtoK(-30.0), CtoK(maxWaterTemperatureC));
    } else if (userInputType == 2 && wall[DISTANCE] != 0) { // water vapor / cloud — air cells only (land TOTAL packs flood height)
      float cloudWaterChange = userInputValues[BRUSH_INTENSITY]; // positive intensity

      if (water[CLOUD] > 0.0) {                // add as liquid
        water[CLOUD] += cloudWaterChange;
        water[CLOUD] = max(water[CLOUD], 0.0); // prevent negative cloudwater
      }
      water[TOTAL] += cloudWaterChange;
      water[TOTAL] = max(water[TOTAL], 0.0);

    } else if (userInputType == 3 && wall[DISTANCE] != 0) { // dust, only apply if not wall
      water[DUST] += userInputValues[BRUSH_INTENSITY];
      water[DUST] = min(max(water[DUST], 0.0), 2.0);

    } else if (userInputType == 34 && wall[DISTANCE] != 0) { // combustion smoke brush
      smoke += userInputValues[BRUSH_INTENSITY];
      smoke = min(max(smoke, 0.0), 48.0);

    } else if (userInputType == 4) {                                                 // drag/move air

      if (userInputValues.x < -0.5) {                                                // whole width brush
        base.x += userInputMove.x * 5.0 * weight * userInputValues[BRUSH_INTENSITY]; // only move horizontally
      } else {
        base.xy += userInputMove * 5.0 * weight * userInputValues[BRUSH_INTENSITY];
      }
    } else if (userInputType == 6 && wall[DISTANCE] != 0) { // air pressure (Ctrl = low)
      base[PRESSURE] += userInputValues[BRUSH_INTENSITY] * weight * 0.01;
    } else if (userInputType == 5 && wall[DISTANCE] != 0) { // precipitation in air (invert removes)
      water[PRECIPITATION] += userInputValues[BRUSH_INTENSITY] * 8.0;
      water[PRECIPITATION] = max(water[PRECIPITATION], 0.0);
      // Light cloud drip so painted precip looks like falling from moisture
      if (userInputValues[BRUSH_INTENSITY] > 0.0) {
        water[CLOUD] = max(water[CLOUD], userInputValues[BRUSH_INTENSITY] * 0.35);
        water[TOTAL] = max(water[TOTAL], water[CLOUD]);
      }
    } else if (userInputType >= 10) {               // wall
      if (userInputValues[BRUSH_INTENSITY] > 0.0) { // build wall if positive value else remove wall

        bool setWall = false;
        bool prevWallWasSolid = wall[DISTANCE] == 0;
        int prevWallType = wall[TYPE];

        switch (userInputType) {       // set wall type
        case 10: // inert
          if (allowCaves) {
            if (wall[DISTANCE] == 0 && wall[TYPE] == WALLTYPE_INERT)
              break;
            wall[TYPE] = WALLTYPE_INERT;
            setWall = true;
          }
          break;
        case 11: // land
          if (allowCaves) {
            if (wall[DISTANCE] == 0 && (isLandFireOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE])
                || wall[TYPE] == WALLTYPE_RUNWAY || wall[TYPE] == WALLTYPE_INDUSTRIAL
                || isCustomTerrain(wall[TYPE])))
              break; // already land-like: keep soil moisture and vegetation
            wall[TYPE] = WALLTYPE_LAND;
            setWall = true;
          }
          break;
        case 12: // fresh water
          if (allowCaves) {
            if (wall[DISTANCE] == 0 && wall[TYPE] == WALLTYPE_FRESH_WATER)
              break;
            wall[TYPE] = WALLTYPE_FRESH_WATER;
            setWall = true;
          }
          break;
        case 24: // salt water
          if (allowCaves) {
            if (wall[DISTANCE] == 0 && wall[TYPE] == WALLTYPE_WATER)
              break;
            wall[TYPE] = WALLTYPE_WATER;
            setWall = true;
          }
          break;
        case 25: // ice sheet
          if (allowCaves && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            wall[TYPE] = WALLTYPE_ICE;
            water[SALINITY] = oceanSalinityPpt;
            water[SNOW] = max(water[SNOW], 5.0 + userInputValues[BRUSH_INTENSITY] * 20.0);
            setWall = true;
          }
          break;
        case 26: // ice cap
          if (allowCaves && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            wall[TYPE] = WALLTYPE_ICE;
            water[SALINITY] = landIceSalinityMarker;
            water[SNOW] = max(water[SNOW], 50.0 + userInputValues[BRUSH_INTENSITY] * 200.0);
            setWall = true;
          }
          break;
        case 29: { // custom base terrain
          if (allowCaves) {
            int slot = clamp(userInputCustomSlot, 0, 7);
            int dest = makeCustomBaseType(slot);
            if (wall[DISTANCE] == 0 && wall[TYPE] == dest)
              break;
            wall[TYPE] = dest;
            setWall = true;
          }
          break;
        }
        case 13:                                                                                                     // set fire
          if (wall[DISTANCE] == 0 && isLandOrForest2(wall[TYPE]) && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            wall[TYPE] = igniteFireType(wall[TYPE]);
            setWall = true;
          }
          break;
        case 14:                                               // set urban (variant 0–11)
          if (wall[DISTANCE] == 0 && canPaintUrbanOn(wall[TYPE]) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            wall[TYPE] = urbanWallTypeFromVariant(userInputSettlementVariant);
          }
          break;
        case 15:                                               // set runway
          if (wall[DISTANCE] == 0 && (isLandOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || wall[TYPE] == WALLTYPE_INDUSTRIAL) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            wall[TYPE] = WALLTYPE_RUNWAY;
          }
          break;
        case 16:                                               // set industrial
          if (wall[DISTANCE] == 0 && (isLandOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || wall[TYPE] == WALLTYPE_RUNWAY) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            wall[TYPE] = WALLTYPE_INDUSTRIAL;
          }
          break;
        case 17:                                               // set suburban (variant 0–11)
          if (wall[DISTANCE] == 0 && canPaintSuburbanOn(wall[TYPE], userInputSettlementVariant) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            wall[TYPE] = suburbanWallTypeFromVariant(userInputSettlementVariant);
          }
          break;
        case 33:                                               // set American suburban (protocol alias)
          if (wall[DISTANCE] == 0 && canPaintSuburbanOn(wall[TYPE], 1) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            wall[TYPE] = WALLTYPE_AMERICAN_SUBURBAN;
          }
          break;

        case 20:                                                                                                      // add soil moisture
          if (wall[DISTANCE] == 0 && !isAnyWaterType(wall[TYPE]) && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            float moistureBrush = userInputValues[BRUSH_INTENSITY] * 10.0;
            water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + moistureBrush, soilMoistureCap);
            water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE] + moistureBrush * sustainedMoistureGain, 0.0, 100.0);
          }
          break;
        case 31: // floodwater — add standing flood height (does not change soil moisture)
          if (wall[DISTANCE] == 0 && !isAnyWaterType(wall[TYPE]) && texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            float floodBrush = userInputValues[BRUSH_INTENSITY] * 200.0;
            float floodMm = getFloodHeightMm(water[TOTAL]) + floodBrush;
            water[TOTAL] = encodeLandWithFlood(floodMm);
          }
          break;
        case 21:                                               // add snow
          if (wall[DISTANCE] == 0 && (isLandOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || wall[TYPE] == WALLTYPE_INDUSTRIAL || wall[TYPE] == WALLTYPE_ICE) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) { // if land wall and no wall above
            water[SNOW] += userInputValues[BRUSH_INTENSITY] * 0.5;
          }
          break;
        case 22:                                               // grass / shrub (legacy vegetation tool id)
        case 27:                                               // grass / shrub
          if (wall[DISTANCE] == 0 && (isLandFireOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || wall[TYPE] == WALLTYPE_INDUSTRIAL || isCustomBase(wall[TYPE])) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            if (wall[VEGETATION] > GRASS_VEG_MAX)
              wall[VEGETATION] = max(wall[VEGETATION] - 1, FOREST_VEG_MIN);
            else
              wall[VEGETATION] = min(wall[VEGETATION] + 1, GRASS_VEG_MAX);
          }
          break;
        case 28:                                               // forest (conifer)
          if (wall[DISTANCE] == 0 && (isLandFireOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || isCustomBase(wall[TYPE])) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            // Convert deciduous species back to pine land/fire identity
            if (wall[TYPE] == WALLTYPE_FOREST2)
              wall[TYPE] = WALLTYPE_LAND;
            else if (wall[TYPE] == WALLTYPE_FIRE_FOREST2)
              wall[TYPE] = WALLTYPE_FIRE;
            if (wall[VEGETATION] <= GRASS_VEG_MAX)
              wall[VEGETATION] = FOREST_VEG_MIN;
            else
              wall[VEGETATION] = min(wall[VEGETATION] + 1, FOREST_VEG_MAX);
          }
          break;
        case 32:                                               // forest 2 (deciduous)
          if (wall[DISTANCE] == 0 && (isLandFireOrForest2(wall[TYPE]) || isSettlementWall(wall[TYPE]) || isCustomBase(wall[TYPE])) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            // Mark deciduous species on land/fire; urban/suburban/custom keep TYPE (pine look there)
            if (wall[TYPE] == WALLTYPE_LAND || wall[TYPE] == WALLTYPE_FOREST2)
              wall[TYPE] = WALLTYPE_FOREST2;
            else if (wall[TYPE] == WALLTYPE_FIRE || wall[TYPE] == WALLTYPE_FIRE_FOREST2)
              wall[TYPE] = WALLTYPE_FIRE_FOREST2;
            if (wall[VEGETATION] <= GRASS_VEG_MAX)
              wall[VEGETATION] = FOREST_VEG_MIN;
            else
              wall[VEGETATION] = min(wall[VEGETATION] + 1, FOREST_VEG_MAX);
          }
          break;
        case 30: // custom overlay on land (urban-like gate)
          if (wall[DISTANCE] == 0 &&
              (isLandOrForest2(wall[TYPE]) || isCustomBase(wall[TYPE]) ||
               wall[TYPE] == WALLTYPE_RUNWAY || wall[TYPE] == WALLTYPE_INDUSTRIAL ||
               isCustomOverlay(wall[TYPE])) &&
              texture(wallTex, texCoordX0Yp)[DISTANCE] != 0) {
            wall[TYPE] = makeCustomOverlayType(clamp(userInputCustomSlot, 0, 7));
          }
          break;
        }

        if (setWall) {
          bool alreadySolid = prevWallWasSolid;
          wall[DISTANCE] = 0;         // set wall
          if (!alreadySolid)
            base[TEMPERATURE] = 1000.0; // indicate this is wall and no snow cooling
                                      // water = vec4(0.0);

          if (wall[TYPE] == WALLTYPE_LAND) {
            if (!alreadySolid || isAnyWaterType(prevWallType)) {
              water[TOTAL] = WATER_MARKER_LAND;
              water[SOIL_MOISTURE] = 25.0;
              water[SUSTAINED_MOISTURE] = 25.0;
              if (isAnyWaterType(prevWallType))
                wall[VEGETATION] = 0;
            }
            // wall[VEGETATION] = 100;
          } else if (wall[TYPE] == WALLTYPE_FRESH_WATER) {
            base[TEMPERATURE] = waterTemperature;
            water[SALINITY] = 0.0;
            water[SNOW] = 0.0;
          } else if (wall[TYPE] == WALLTYPE_WATER) { // salt water surface
            base[TEMPERATURE] = waterTemperature;
            water[SALINITY] = oceanSalinityPpt;
            water[SNOW] = 0.0;
          } else if (wall[TYPE] == WALLTYPE_ICE) {
            base[TEMPERATURE] = CtoK(-5.0);
            if (water[SNOW] < 1.0)
              water[SNOW] = 10.0;
          } else if (isCustomBase(wall[TYPE])) {
            // Physics class from surfaceKind; atlas slot lives in TYPE (VEGETATION free for forests)
            if (userInputSurfaceKind == 1) { // fresh
              base[TEMPERATURE] = waterTemperature;
              water[SALINITY] = 0.0;
              water[SNOW] = 0.0;
            } else if (userInputSurfaceKind == 2) { // sea
              base[TEMPERATURE] = waterTemperature;
              water[SALINITY] = oceanSalinityPpt;
              water[SNOW] = 0.0;
            } else if (userInputSurfaceKind == 3) { // ice sheet
              base[TEMPERATURE] = CtoK(-5.0);
              water[SALINITY] = oceanSalinityPpt;
              water[SNOW] = max(water[SNOW], 5.0 + userInputValues[BRUSH_INTENSITY] * 20.0);
            } else if (userInputSurfaceKind == 4) { // ice cap
              base[TEMPERATURE] = CtoK(-5.0);
              water[SALINITY] = landIceSalinityMarker;
              water[SNOW] = max(water[SNOW], 50.0 + userInputValues[BRUSH_INTENSITY] * 200.0);
            } else if (!alreadySolid) {
              water[SOIL_MOISTURE] = 25.0;
              water[SUSTAINED_MOISTURE] = 25.0;
            }
          }
        }
      } else {
        if (wall[DISTANCE] == 0) {           // remove wall only if it is a wall and not bottem layer

          if (userInputType == 13) {         // fire
            if (isAnyFireType(wall[TYPE])) // extinguish fire
              wall[TYPE] = extinguishFireType(wall[TYPE]);
          } else if (userInputType == 14) {
            if (isAnyUrban(wall[TYPE])) // remove buildings
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 15) {
            if (wall[TYPE] == WALLTYPE_RUNWAY) // remove runway
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 16) {
            if (wall[TYPE] == WALLTYPE_INDUSTRIAL) // remove industry
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 17) {
            if (isAnySuburban(wall[TYPE])) // remove suburban
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 33) {
            if (isAnySuburban(wall[TYPE])) // remove American suburban / suburban class
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 30) {
            if (isCustomOverlay(wall[TYPE]))
              wall[TYPE] = WALLTYPE_LAND;
          } else if (userInputType == 20) {        // remove moisture
            float moistureBrush = userInputValues[BRUSH_INTENSITY] * 10.0;
            water[SOIL_MOISTURE] = applySoilMoistureCap(water[SOIL_MOISTURE] + moistureBrush, soilMoistureCap);
            water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE] + moistureBrush * sustainedMoistureGain, 0.0, 100.0);
          } else if (userInputType == 31) { // remove floodwater only (invert) — never dries soil
            float floodBrush = userInputValues[BRUSH_INTENSITY] * 200.0; // negative when inverted
            float floodMm = max(getFloodHeightMm(water[TOTAL]) + floodBrush, 0.0);
            water[TOTAL] = encodeLandWithFlood(floodMm);
          } else if (userInputType == 21) {
            water[SNOW] += userInputValues[BRUSH_INTENSITY] * 0.5; // remove snow / ice thickness
          } else if (!allowCaves && (userInputType == 10 || userInputType == 11 || userInputType == 12
                     || userInputType == 24 || userInputType == 25 || userInputType == 26
                     || userInputType == 29)) {
            // Heightfield sculpt handles raise/lower; do not punch grid cells.
          } else if (userInputType == 22 || userInputType == 27) {
            wall[VEGETATION] = max(wall[VEGETATION] - 1, 0);
            if (wall[VEGETATION] <= GRASS_VEG_MAX) {
              if (wall[TYPE] == WALLTYPE_FOREST2)
                wall[TYPE] = WALLTYPE_LAND;
              else if (wall[TYPE] == WALLTYPE_FIRE_FOREST2)
                wall[TYPE] = WALLTYPE_FIRE;
            }
          } else if (userInputType == 28 || userInputType == 32) {
            if (wall[VEGETATION] > GRASS_VEG_MAX)
              wall[VEGETATION] = max(wall[VEGETATION] - 1, 0);
            else
              wall[VEGETATION] = 0;
            if (wall[VEGETATION] <= GRASS_VEG_MAX) {
              if (wall[TYPE] == WALLTYPE_FOREST2)
                wall[TYPE] = WALLTYPE_LAND;
              else if (wall[TYPE] == WALLTYPE_FIRE_FOREST2)
                wall[TYPE] = WALLTYPE_FIRE;
            }
          } else if (texCoord.y > texelSize.y) {
            wall[DISTANCE] = 255;                                  // remove wall
            base[VX] = 0.0;                                        // reset all properties to prevent NaN bug
            base[VY] = 0.0;
            base[PRESSURE] = 0.0;
            base[TEMPERATURE] = getInitialT(int(texCoord.y * (1.0 / texelSize.y)));
            water[TOTAL] = 0.0;
            water[CLOUD] = 0.0;
            water[PRECIPITATION] = 0.0;
            water[DUST] = 0.0;
            smoke = 0.0;
          }
        }
      }
    }
  }

  if (wall[DISTANCE] == 0) { // is wall

    if (wall[TYPE] == WALLTYPE_WATER)
      water[TOTAL] = WATER_MARKER_SALT;
    else if (wall[TYPE] == WALLTYPE_FRESH_WATER)
      water[TOTAL] = WATER_MARKER_FRESH;
    else if (wall[TYPE] == WALLTYPE_ICE)
      water[TOTAL] = WATER_MARKER_ICE;
    else if (wall[VERT_DISTANCE] == 0) // surface land: preserve packed standing flood height
      water[TOTAL] = encodeLandWithFlood(getFloodHeightMm(water[TOTAL]));
    else // underground land never stores flood (avoids float ghosts on the bottom layer)
      water[TOTAL] = WATER_MARKER_LAND;

  } else { // no wall
           //   water[CLOUD] = max(water[TOTAL] - maxWater(realTemp), 0.0); // recalculate cloud water
  }

  vec2 vecFromPlane;

  if (wrapHorizontally) {
    vecFromPlane = vec2(absHorizontalDist(airplaneValues.x, texCoord.x), airplaneValues.y - texCoord.y);
  } else {
    vecFromPlane = vec2(abs(airplaneValues.x - texCoord.x), airplaneValues.y - texCoord.y);
  }

  vecFromPlane.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle
  vecFromPlane *= resolution.y;                // convert to cell coordinates

  if (airplaneValues[3] < 0.0)
    vecFromPlane += vec2(0., -1.);            // dump water below plane

  float distFromPlane = length(vecFromPlane); // in cells


  float planeInfluence = max(1.0 - distFromPlane, 0.) * 0.03;


  if (airplaneValues[3] < 0.0) {
    water[PRECIPITATION] += planeInfluence * 100.0; // dump water
  }

  // water[TOTAL] += planeInfluence * airplaneValues[2] * 1.0; // moisture
  // water[SMOKE] += planeInfluence * 0.1;                     // smoke
  //   base[TEMPERATURE] += planeInfluence * 74.0; // heat


  if (airplaneValues[3] > 0.9) { // PLANE CRASH!

    if (distFromPlane < 1.5) {
      if (wall[DISTANCE] == 0) {
        if (isLandOrForest2(wall[TYPE]) && wall[VERT_DISTANCE] == 0) // if land surface, set ground on fire
          wall[TYPE] = igniteFireType(wall[TYPE]);                   // start fire when plane hits the ground
      } else {                                                       // air, create FIRE BALL!
        base[PRESSURE] += 0.05;                                      // pressure wave
        base[TEMPERATURE] = CtoK(50.0);                              // heat
        water[TOTAL] += 1.;                                          // moisture
        smoke += 18.;                                                // combustion smoke (dense fireball)
      }
    }
  }

  base = sanitizeSimBase(base, wall[DISTANCE]);
  water = sanitizeSimWater(water, wall[DISTANCE], wall[TYPE]);
  smoke = sanitizeSimSmoke(smoke);
}