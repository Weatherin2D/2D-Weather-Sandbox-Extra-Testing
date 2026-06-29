/*
This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details. You should have received a copy of the GNU General Public License along
with this program. If not, see <https://www.gnu.org/licenses/>.
*/

function updateSetupSliders()
{
  let simResX = parseInt(simResSelX.value);
  let simResY = parseInt(simResSelY.value);
  let simHeight = parseInt(simHeightSel.value);

  let cellHeight = simHeight / simResY;
  let simWidth = cellHeight * simResX;

  document.getElementById('simWorldProperties').innerHTML = 'cellHeight: ' + cellHeight.toFixed(1) + ' m  &nbsp&nbsp&nbsp   Simulation width: ' + (simWidth / 1000).toFixed(1) + ' km';

  document.getElementById('simHeightWarning').style.display = (simHeight == 15000) ? 'none' : 'block';
  document.getElementById('simResYWarning').style.display = (simResY == 300) ? 'none' : 'block';
  document.getElementById('simResShowX').value = simResX;
  document.getElementById('simResShowY').value = simResY
  document.getElementById('simHeightShow').value = simHeight + ' m';
  
  // Sync text input values with slider values
  document.getElementById('simResInputX').value = simResX;
  document.getElementById('simResInputY').value = simResY;
  document.getElementById('simHeightInput').value = simHeight;
}

function updateFromTextInput(inputId, sliderId)
{
  let input = document.getElementById(inputId);
  let slider = document.getElementById(sliderId);
  let min = parseInt(input.min);
  let max = parseInt(input.max);
  let step = parseInt(input.step);
  let value = parseInt(input.value);
  
  // Clamp value to min/max
  if (value < min) value = min;
  if (value > max) value = max;
  
  // Round to nearest step
  value = Math.round(value / step) * step;
  
  input.value = value;
  slider.value = value;
  updateSetupSliders();
}

var FPS = 60.0;


function mixGeneric(a, b, t, {clamp = false} = {})
{
  const clampT = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  if (typeof a === 'number' && typeof b === 'number') {
    const tt = clamp ? clampT(t) : t;
    return a * (1 - tt) + b * tt;
  }

  // arrays / typed arrays
  if (Array.isArray(a) || ArrayBuffer.isView(a)) {
    if (!Array.isArray(b) && !ArrayBuffer.isView(b))
      throw new TypeError('mismatched types');
    if (a.length !== b.length)
      throw new RangeError('length mismatch');
    const out = new (Array.isArray(a) ? Array : a.constructor)(a.length);
    for (let i = 0; i < a.length; i++) {
      const tt = clamp ? clampT(t[i] ?? t) : (Array.isArray(t) ? t[i] ?? t : t);
      out[i] = a[i] * (1 - tt) + b[i] * tt;
    }
    return out;
  }

  // vector-like object with same keys
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = {};
    for (const k of Object.keys(a)) {
      if (typeof a[k] === 'number' && typeof b[k] === 'number') {
        const tt = clamp ? clampT(t[k] ?? t) : (t && typeof t === 'object' ? (t[k] ?? t) : t);
        out[k] = a[k] * (1 - tt) + b[k] * tt;
      }
    }
    return out;
  }

  throw new TypeError('Unsupported types for mixGeneric');
}

const corsUrl = 'https://my-cors-proxy.nielsdaemen747.workers.dev/?url='; // my own proxy worker on cloudfare

async function getSoundingGraphImgUrl(url)
{
  try {
    const response = await fetch(corsUrl + encodeURIComponent(url));
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const img = doc.querySelectorAll('img')[0];
    return 'https://www.meteociel.fr/' + img.getAttribute('src');
  } catch (error) {
    console.error('Error fetching the data:', error);
  }
}

// Function to scrape table data from the given URL
async function scrapeTableData(url)
{
  try {
    const response = await fetch(corsUrl + encodeURIComponent(url));
    const html = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Select the rows of the main table (starting at line 51)
    const rows = doc.querySelectorAll('table:nth-of-type(2) tr:not(:first-child)');

    const tableData = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');

      const rowData = {
        alt : parseFloat(cells[0].textContent),
        p : parseFloat(cells[1].textContent),
        t : parseFloat(cells[2].textContent),
        tw : parseFloat(cells[3].textContent),
        td : parseFloat(cells[4].textContent),
        rh : parseFloat(cells[5].textContent),
        vel : parseFloat(cells[6].textContent.split(' / ')[1]),
        angle : parseFloat(cells[6].textContent.split(' / ')[0]),
      };

      const hasNaN = Object.values(rowData).some(v => Number.isNaN(v));

      if (!hasNaN) // discard if the row contains any NaN
        tableData.push(rowData);
    });
    return tableData;

  } catch (error) {
    console.error('Error fetching the data:', error);
  }
}

async function loadSounding(stationID, timeStamp)
{

  const imgMapType = 1; // 0 = large classic emagram   1 = small emagram
  const graphPageUrl = 'https://www.meteociel.fr/cartes_obs/sondage_display.php?id=' + stationID + '&map=' + imgMapType + '&date=' + timeStamp;
  const tablePageUrl = 'https://www.meteociel.fr/cartes_obs/sondage_display.php?id=' + stationID + '&map=4&date=' + timeStamp;

  const SoundingGraphImgUrl = await getSoundingGraphImgUrl(graphPageUrl);

  const soundingImgEl = document.getElementById('soundingPreview');
  soundingImgEl.src = SoundingGraphImgUrl;

  // console.log(graphPageUrl, SoundingGraphImgUrl, tablePageUrl);

  return scrapeTableData(tablePageUrl);
}

function sampleIsInvalid(s) { return isNaN(s.t) || isNaN(s.td) || isNaN(s.vel); }

function rawSoundingToSimSounding(soundingData, simHeight, inSimSoundingRes)
{
  let soundingForSim = [];

  // Safety check: ensure soundingData exists and has valid data
  if (!soundingData || soundingData.length === 0) {
    console.warn('No sounding data available, using default profile');
    // Return a default sounding profile
    for (let y = 0; y < inSimSoundingRes; y++) {
      const alt = y * (simHeight / sim_res_y);
      const temp = 20 - (alt / 1000) * 6.5; // Standard lapse rate
      soundingForSim[y] = {'t' : temp, 'td' : temp - 10, 'vel' : 0.01};
    }
    return soundingForSim;
  }

  // Debug: check first few data points to understand the input format
  console.log('rawSoundingToSimSounding input sample:', soundingData[0], soundingData[Math.floor(soundingData.length/2)], soundingData[soundingData.length-1]);

  // The sounding data is stored with increasing altitude (index 0 = lowest, last = highest)
  // We need to find the correct data point for each simulation level
  
  for (let y = 0; y < inSimSoundingRes; y++) {
    const inSimAlt = y * (simHeight / sim_res_y);
    
    // Find the data point just above or equal to the simulation altitude
    let idx = 0;
    while (idx < soundingData.length - 1 && soundingData[idx]['alt'] < inSimAlt) {
      idx++;
    }
    
    // Safety check
    if (idx >= soundingData.length) {
      soundingForSim[y] = {'t' : -50, 'td' : -60, 'vel' : 0.01};
      continue;
    }
    
    const sampleAbove = soundingData[idx];
    const sampleBelow = soundingData[Math.max(0, idx - 1)];
    
    let s = sampleAbove;
    
    // Interpolate if we have a sample below and the altitudes don't match
    if (sampleAbove['alt'] !== inSimAlt && idx > 0) {
      const altDiff = sampleAbove['alt'] - sampleBelow['alt'];
      if (altDiff > 0) {
        const a = (inSimAlt - sampleBelow['alt']) / altDiff;
        s = mixGeneric(sampleBelow, sampleAbove, a);
      }
    }

    let twoDimentionalVel = s.vel * Math.cos(s.angle * degToRad);   // km/h
    const inSimVel = msToRawVelocity(twoDimentionalVel / 3.6);      // convert to m/s first

    soundingForSim[y] = {'t' : s.t, 'td' : s.td, 'vel' : inSimVel};
  }

  // Debug: check output
  console.log('rawSoundingToSimSounding output sample:', soundingForSim[0], soundingForSim[Math.floor(inSimSoundingRes/2)], soundingForSim[inSimSoundingRes-1]);

  return soundingForSim;
}

var stationSelector;

const presets = [
  {name : 'Summer storms in northern Italy', location : 'Milan', date : '2025-06-05', hour : 12}, {name : 'Some cells in the Netherlands', location : 'Essen', date : '2016-06-23', hour : 12},
  {name : 'Supercell in the Netherlands', location : 'De Bilt', date : '2014-06-09', hour : 12}, {name : 'Cold winter on Gotland', location : 'Gotland', date : '2025-01-03', hour : 12},
  {name : 'Spring cells in Germany', location : 'Stuttgart', date : '2021-06-09', hour : 12}, {name : 'Hot summer in Spain', location : 'Madrid', date : '2018-07-07', hour : 12},
  {name : 'Double inversion over Sicily', location : 'Sicily', date : '2021-07-14', hour : 12}, {name : 'Low base with CAPE in Rome', location : 'Rome', date : '2021-07-16', hour : 12},
  {name : 'High low level cape over mediterranean in fall', location : 'Ajaccio', date : '2025-10-23', hour : 12}
];

var startDate;
var startLatitude;

function createPresetSelect()
{
  let select = document.getElementById('presetSelect');

  //  console.log(presets);

  presets.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = preset.name;
    select.appendChild(option);
  });
  select.value = -1;

  select.onchange = function() {
    let preset = presets[select.selectedIndex];

    document.getElementById('datePicker').value = preset.date;

    startDate = new Date(preset.date);

    document.getElementById('hourSelector').value = preset.hour;

    stationSelector.selectedIndex = Object.keys(soundingStations).indexOf(preset.location);
    stationSelector.dispatchEvent(new Event('change', {bubbles : true}));

    prepareSounding();
  };
}

const soundingStations = {
  'Andoya' : {id : 1010, lat : 69.1144},
  'Lapland' : {id : 2836, lat : 67.4160},
  'Iceland' : {id : 4018, lat : 64.9631},
  'Trondheim' : {id : 1241, lat : 63.4305},
  'Helsinki' : {id : 2963, lat : 60.1699},
  'Stavanger' : {id : 1415, lat : 58.9700},
  'Gotland' : {id : 2591, lat : 57.6359},
  'North Sea' : {id : 1400, lat : 56.5333},
  'Moscow' : {id : 27730, lat : 55.7558},
  'Gdańsk' : {id : 12120, lat : 54.3520},
  'Greifswald' : {id : 10184, lat : 54.0833},
  'Norderney' : {id : 10113, lat : 53.7000},
  'Hamburg' : {id : 10035, lat : 53.5507},
  'Nottingham' : {id : 3354, lat : 52.9500},
  'Bergen(DE)' : {id : 10238, lat : 52.8092},
  'Meppen' : {id : 10304, lat : 52.7928},
  'Berlin' : {id : 10393, lat : 52.5235},
  'Warsaw' : {id : 12374, lat : 52.2297},
  'De Bilt' : {id : 6260, lat : 52.1085},
  'Essen' : {id : 10410, lat : 51.4556},
  'Wroclaw' : {id : 12425, lat : 51.1079},
  'Brussels' : {id : 6458, lat : 50.8371},
  'Meiningen' : {id : 10548, lat : 50.5678},
  'Kraków' : {id : 12575, lat : 50.0647},
  'Idar-Oberstein' : {id : 10618, lat : 49.7167},
  'Nuremberg' : {id : 10771, lat : 49.4521},
  'Paris' : {id : 7145, lat : 48.8567},
  'Stuttgart' : {id : 10739, lat : 48.7758},
  'Brest' : {id : 7110, lat : 48.3900},
  'Vienna' : {id : 11035, lat : 48.2092},
  'Altenstadt' : {id : 10954, lat : 48.3556},
  'Munich' : {id : 10868, lat : 48.1333},
  'peißenberg' : {id : 10962, lat : 47.7975},
  'Insbruck' : {id : 11120, lat : 47.2692},
  'Bern' : {id : 6610, lat : 46.9480},
  'Udine' : {id : 16045, lat : 46.0713},
  'Zagreb' : {id : 14240, lat : 45.8150},
  'Milan' : {id : 16064, lat : 45.4642},
  'Bordeaux' : {id : 7510, lat : 44.8378},
  'Bologna' : {id : 16144, lat : 44.4968},
  'Bucharest' : {id : 15420, lat : 44.4268},
  'Cuneo' : {id : 16113, lat : 44.3843},
  'Zadar' : {id : 14430, lat : 44.1194},
  'Montpellier' : {id : 7645, lat : 43.6119},
  'Barcelona' : {id : 8190, lat : 41.3851},
  'Ajaccio' : {id : 7761, lat : 41.9192},
  'Rome' : {id : 16245, lat : 41.9028},
  'Istanbul' : {id : 17064, lat : 41.0082},
  'Madrid' : {id : 8221, lat : 40.4168},
  'Sardinia' : {id : 16546, lat : 40.1209},
  'Lisbon' : {id : 8536, lat : 38.7223},
  'Athens' : {id : 16716, lat : 37.9792},
  'Sicily' : {id : 16429, lat : 37.6000},
  'Krete' : {id : 16754, lat : 35.2401},
  'Cyprus' : {id : 17607, lat : 35.1264},
  'Palestine' : {id : 40179, lat : 32.0853},
  'Cairo' : {id : 62378, lat : 30.0444},
};

function createStationSelect()
{
  let select = document.getElementById('stationSelect');

  for (const [key, value] of Object.entries(soundingStations)) {
    let option = document.createElement('option');
    option.value = value.id;
    option.innerHTML = key + ' ' + value.lat.toFixed(1) + '° N';
    select.appendChild(option);
  }
  select.value = 10868;

  select.onchange = function() {
    startLatitude = Object.values(soundingStations)[select.selectedIndex].lat;
    prepareSounding();
  };

  let datePicker = document.getElementById('datePicker');
  datePicker.onchange = function() {
    startDate = new Date(datePicker.value);
    prepareSounding();
  };

  return select;
}


// Ensure the DOM is fully loaded before running the function
document.addEventListener('DOMContentLoaded', () => {
  createPresetSelect();
  stationSelector = createStationSelect();
  prepareSounding();
  
  // Add event listeners for the sliders
  document.getElementById('simResSelX').addEventListener('input', updateSetupSliders);
  document.getElementById('simResSelY').addEventListener('input', updateSetupSliders);
  document.getElementById('simHeightSel').addEventListener('input', updateSetupSliders);
  
  // Add event listeners for the text inputs
  document.getElementById('simResInputX').addEventListener('input', function() { updateFromTextInput('simResInputX', 'simResSelX'); });
  document.getElementById('simResInputY').addEventListener('input', function() { updateFromTextInput('simResInputY', 'simResSelY'); });
  document.getElementById('simHeightInput').addEventListener('input', function() { updateFromTextInput('simHeightInput', 'simHeightSel'); });
});


var canvas;
var gl;

var clockEl;

var simDateTime;

var SETUP_MODE = false;
var simRuntimeFrames = 0;
const LIGHTNING_WARMUP_FRAMES = 48;

var loadingBar;
var cam;
var soundSystem;

const PI = 3.14159265359;
const degToRad = 0.0174533;
const radToDeg = 57.2957795;
const kmToMil = 0.62137;
const mToFt = 3.28084;

const saveFileVersionID = 263574038; // Uint32 id — includes airmass generator positions + settings

const guiControls_default = {
  vorticity : 0.005,
  dragMultiplier : 0.001, // 0.01
  wind : 0.0,
  globalEffectsStartAlt : 0,
  globalEffectsEndAlt : 10000,
  globalDrying : 0.000000, // 0.000010
  globalHeating : 0.0,
  soundingForcing : 0.0,
  sunIntensity : 1.0,
  waterTemperature : 25.0, // °C
  dynamicWaterTemperature : true,
  landEvaporation : 0.00005,
  waterEvaporation : 0.0001,
  evapHeat : 2.90,          //  Real: 2260 J/g
  meltingHeat : 0.43,       //  Real:  334 J/g
  condensationRate : 0.0050,
  waterWeight : 0.25,       // 0.50
  inactiveDroplets : 0,
  aboveZeroThreshold : 1.0, // PRECIPITATION
  subZeroThreshold : 0.005, // 0.01
  spawnChance : 0.00005,
  snowDensity : 0.2,        // 0.3
  fallSpeed : 0.0003,
  growthRate0C : 0.0001,    // 0.0005
  growthRate_30C : 0.001,   // 0.01
  freezingRate : 0.01,
  meltingRate : 0.01,
  evapRate : 0.0008, // 0.0005
  displayMode : 'DISP_REAL',
  wrapHorizontally : true,
  SmoothCam : true,
  camSpeed : 0.01,
  exposure : 1.0,
  saturation : 1.0,
  contrast : 1.0,
  greenHueStartThreshold : 0.8,
  greenHueEndThreshold : 1.8,
  greenHueStrength : 0.8,
  enhancedLooks : false,
  timeOfDay : 12.0,
  latitude : 45.0,
  month : 6.65, // Northern hemisphere summer solstice
  sunAngle : 90.0,
  dayNightCycle : true,
  realtimeMode : false,  // 1:1 sim time with wall clock (sun, clock, and physics)
  accelerateNight : true,
  greenhouseGases : 0.001,
  waterGreenHouseEffect : 0.0015,
  IR_rate : 1.0,
  invertSun : false,
  tool : 'TOOL_NONE',
  invertTool : false,
  brushSize : 20,
  wholeWidth : false,
  brushIntensity : 0.01,
  allowCaves : true,
  showGraph : false,
  soundingShowWindBarbs : true,
  soundingShowParcels : true,
  soundingShowMixingRatio : true,
  soundingShowHeights : true,
  soundingShowThetaE : true,
  soundingLayoutEdit : false,
  graphFixedPosition : false, // When true, graph stays at fixed position instead of following cursor
  graphFixedX : 0,
  graphFixedY : 0,
  realDewPoint : false, // show real dew point in graph, instead of dew point with cloud water included
  enablePrecipitation : true,
  showDrops : false,
  paused : false,
  IterPerFrame : 10,
  auto_IterPerFrame : true,
  sound : true,
  enableBloom : true,
  // Sound volume controls
  soundVolumeWind    : 1.0,
  soundVolumeRain    : 1.0,
  soundVolumeAmbient : 1.0,  // forest / beach / urban
  soundVolumeThunder : 1.0,
  soundWindEnabled    : true,
  soundRainEnabled    : true,
  soundAmbientEnabled : true,
  soundThunderEnabled : true,
  enableCloudLightning : true,
  cloudLightningIntensity : 2.0,
  cloudLightningThreshold : 0.3,
  cloudLightningFrequency : 0.8,
  cloudLightningDischarge : 1.0,
  enableCloudFlash : true,
  cloudFlashIntensity : 2.5,
  cloudFlashThreshold : 0.25,
  cloudFlashFrequency : 1.2,
  cloudFlashDischarge : 1.0,
  enableStrobeLightning : true,
  strobeLightningIntensity : 2.0,
  strobeLightningThreshold : 0.3,
  strobeLightningFrequency : 0.8,
  strobeLightningDischarge : 1.0,
  enableCloudGroundLightning : true,  cloudGroundLightningIntensity : 2.0,
  cloudGroundLightningThreshold : 0.3,
  cloudGroundLightningFrequency : 0.8,
  cloudGroundLightningDischarge : 1.0,
  lightningBoltWidth : 1.0,
  lightningRepeat : true,          // allow repeat strikes driven by charge
  lightningCrossTrigger : true,    // CG can trigger CC crawlers and vice versa
  chargeGenerationRate : 1.0,
  chargeMinCloudDensity : 0.32,
  chargeStormCoreThreshold : 0.38,
  ...(typeof LightningV2 !== 'undefined' ? LightningV2.DEFAULT_SETTINGS : {}),
  enableVectorField : false,
  // Nuke settings
  nukeBlastRadius : 50,
  nukeTemperature : 100.0,
  nukeSmokeAmount : 2.0,
  nukeFallSpeed : 10.0,
  nukeIgnitionEnabled : true,
  dryLapseRate : 10.0,     // Real: 9.8 degrees / km
  simHeight : 15000,       // meters
  twelveHourClock : false, // only for display.  false = metric
  lengthUnit : 'LENGTH_UNIT_METRIC',
  tempUnit : 'TEMP_UNIT_C',
  windUnit : 'SPEED_UNIT_KMH',
  speedUnit : 'SPEED_UNIT_KMH',
  shearUnit : 'SPEED_UNIT_KMH',
  lapseUnit : 'LAPSE_UNIT_C_KM',
  temperatureChangeIterations : 5,
  radarOpacity : 0.8,
  radarUpdateFrequency : 60,
  worldRadarResolution : 20.0,
  worldRadarSensitivity : 0.65,
  worldRadarProduct : 'reflectivity',
  radarOverlay : false,
  radarOverlaySource : 'composite',
  radarCappiHeight : 0.45,
  radarLightningIcons : true,
  radarLightningIconDuration : 5,
  dbzOpacityEnabled : false,
  dbzOpacityStrength : 0.9,
  riskUpdateFrequency : 30,
  starVisibility : 0.25,
  starLightEmitStrength : 0.15,
  starDensity : 0.5,
  minShadowLight : 0.02,
  autoMinShadowLight : true,
  displayWeatherStations : true,
  displayRadars : true,
  displayAirmassGenerators : true,
  airplaneMode : false,
  slowMotion : false,
  readoutCursor : false,
  fullscreenResolution : 'Default',
  skipCurlCalculation : false,
  skipCAPECalculation : false,
  reducedPrecipitation : false,
  disableTempChangeHistory : false,
  skipLightingCalculation : false,
  reducedWeatherStationUpdates : false,
  skipAdvection : false,
  skipChargeCalculation : false,
  // Menu styling
  menuBackgroundColor : '#222222',
  menuTextColor : '#ffffff',
  menuAccentColor : '#2196F3',
  menuWidth : 400,
  hodograph2DNodes : 30,
  hodographProfileNodes : 30,
  analogRelevancy : 50,
};

var horizontalDisplayMult = 3.0; // 3.0 to cover srceen while zoomed out

var guiControls;

var displayVectorField = false;

var displayWeatherStations = true;
var displayRadars = true;
var displayAirmassGenerators = true;

var riskCanvas = null;
var riskData = []; // stores {sx, sfcY, color} computed on frequency interval

var soundingOverlayCanvas = null;
var soundingOverlayData = [];
var sampleSoundingColorScale = null;

var radarOverlayCanvas = null;
var radarImageData = null;
var radarGuiFolder = null;
var radarOverlaySourceController = null;
var radarAccumTexture = null;
var radarAccumData = null;
var lightningIconsPauseClockMs = 0;
var radarLightningCanvas = null;
var radarLightningStrikes = [];
var registeredLightningEvents = new Set();
var registeredThunderEvents = new Set();
var proceduralLightningState = {
  eventAge: -1, eventId: -1, builtEventId: -1, channelId: null,
  trackedEventId: -1, trackedChannel: null, strikes: [],
  lastCompletedEventId: -1,
  flashStartMs: 0,
  frozenVisualAge: null,
};
var chargeDischargesThisIter = [];
var lightningFieldCache = null;
var lightningFieldCacheFrame = -1;
var lightningStormProfile = null;
var lightningStormProfileFrame = -1;
var lightningSummaryTexture = null;
var lightningSummaryFrameBuff = null;
var lightningSummaryBuffer = null;
var lightningCacheW = 0;
var lightningCacheH = 0;
const LIGHTNING_CACHE_SCALE = 4;
const LIGHTNING_FLASH_DURATION = 11;
var particleLightningReadBuffer = new Float32Array(4);
var procLightningPosArr = new Float32Array(32);
var procLightningDestArr = new Float32Array(32);
var procLightningMetaArr = new Float32Array(32);
var procLightningRouteArr = new Float32Array(32);
var lightningBurstState = typeof LightningV2 !== 'undefined' ? LightningV2.createBurstState() : { phase: 'burst', burstIntensity: 1.0 };
var lightningFrameCpuCache = {
  frame: -1,
  stormActivity: null,
  activeChannels: null,
  strikeChannels: null,
  channelStrikeChances: null,
  chargeValidByKey: null,
  originPickByKey: null,
};
var lightningEventLog = [];
var lightningEventIdCounter = 0;
var lightningDebugCanvas = null;
var forcedLightningQueue = [];

var nukeOverlayCanvas = null;
var nukeOverlayCtx = null;

var sunIsUp = true;

var airplaneMode = false;

var dropletFollowID = -1;

const DROPLET_WIDTH_CM_THRESHOLD_MM = 10;

/** Equivalent oblate spheroid widths (mm) from droplet mass, phase, and density. */
function computeDropletWidths(water, ice, density)
{
  const totalMass = Math.max(water, 0) + Math.max(ice, 0);
  if (totalMass < 0.001)
    return { horiz: 0, vert: 0, horizStr: '0 mm', vertStr: '0 mm' };

  const radius = Math.pow(totalMass, 1 / 3);
  const mmPerRadius = 8.0;
  const baseDiam = radius * 2 * mmPerRadius;
  const liquidFrac = water / totalMass;
  const oblate = liquidFrac * 0.38 + (density >= 0.82 ? 0.12 : 0) + (density < 0.45 ? 0.08 : 0);
  const aspect = 1 + clamp(oblate, 0, 0.55);
  const horiz = baseDiam * aspect;
  const vert = baseDiam / aspect;
  return {
    horiz,
    vert,
    horizStr: formatDropletWidthMm(horiz),
    vertStr: formatDropletWidthMm(vert)
  };
}

function formatDropletWidthMm(mm)
{
  if (mm >= DROPLET_WIDTH_CM_THRESHOLD_MM)
    return (mm / 10).toFixed(2) + ' cm';
  return mm.toFixed(2) + ' mm';
}

var minShadowLight = 0.02;

var saveFileName = '';

var guiControlsFromSaveFile = null;
var datGui;

var sim_res_x;
var sim_res_y;
var sim_aspect; //  = sim_res_x / sim_res_y
var sim_height = 15000;

var cellHeight = 15000. / 300.; // guiControls.simHeight / sim_res_y;  // in meters // cell width is the same

var frameNum = 0;
var lastFrameNum = 0;

var iterNum = 0;
var lastRadarCacheIterNum = -1;

// global framebuffers for measurements
var frameBuff_0;
var lightFrameBuff_0;

var dryLapse;


const timePerIteration = 0.00008; // in hours (0.00008 = 0.288 sec, at 40m cell size that means the speed of light & sound = 138.88 m/s = 500 km/h)
const REALTIME_ITERS_PER_MS = 1.0 / (timePerIteration * 3600 * 1000); // iterations per real ms at 1:1 sim speed
const REALTIME_MAX_CATCHUP_MS = 500; // cap lag catch-up so a long stall does not burst the sim forward
const TARGET_FRAME_MS = 28;

var NUM_DROPLETS;
const NUM_DROPLETS_DEVIDER = 25; // 25

let hdrFBO;
var hdrRenderScaleState = 1.0;

let bloomFBOs = [];

let ambientLightFBOs = [];
let emittedLightFBO;


function clamp(num, min, max) { return Math.min(Math.max(num, min), max); }

function screenToSimX(screenX)
{
  let leftEdge = canvas.width / 2.0 - (canvas.width * cam.curZoom) / 2.0;
  let rightEdge = canvas.width / 2.0 + (canvas.width * cam.curZoom) / 2.0;
  return map_range(screenX, leftEdge, rightEdge, 0.0, 1.0) - cam.curXpos / 2.0;
}

function screenToSimY(screenY)
{
  let topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * cam.curZoom) / 2.0;
  let bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * cam.curZoom) / 2.0;
  return map_range(screenY, bottemEdge, topEdge, 0.0, 1.0) - (cam.curYpos / 2.0) * sim_aspect;
}

function simToScreenX(simX)
{
  simX += 0.5;
  simX /= sim_res_x;
  let leftEdge = canvas.width / 2.0 - (canvas.width * cam.curZoom) / 2.0;
  let rightEdge = canvas.width / 2.0 + (canvas.width * cam.curZoom) / 2.0;
  return map_range(simX + cam.curXpos / 2.0, 0.0, 1.0, leftEdge, rightEdge);
}

function simToScreenY(simY)
{
  simY += 0.5; // center in cell
  simY /= sim_res_y;
  let topEdge = canvas.height / 2.0 - ((canvas.width / sim_aspect) * cam.curZoom) / 2.0;
  let bottemEdge = canvas.height / 2.0 + ((canvas.width / sim_aspect) * cam.curZoom) / 2.0;
  return map_range(simY + (cam.curYpos / 2.0) * sim_aspect, 0.0, 1.0, bottemEdge, topEdge);
}

function buildRadarOverlaySourceOptions()
{
  const options = {
    'Composite Radar': 'composite',
    'World Radar': 'world',
  };
  for (let i = 0; i < radars.length; i++)
    options[radars[i].getName() + ' #' + (i + 1)] = 'radar_' + i;
  return options;
}

function refreshRadarOverlaySourceDropdown()
{
  if (!radarGuiFolder)
    return;
  const options = buildRadarOverlaySourceOptions();
  const validValues = Object.values(options);
  if (!validValues.includes(guiControls.radarOverlaySource))
    guiControls.radarOverlaySource = validValues.includes('radar_0') ? 'radar_0' : 'composite';
  if (radarOverlaySourceController)
    radarGuiFolder.remove(radarOverlaySourceController);
  radarOverlaySourceController = radarGuiFolder.add(guiControls, 'radarOverlaySource', options)
    .name('Overlay Source')
    .listen();
  if (typeof datGui !== 'undefined' && datGui && datGui.updateDisplay)
    datGui.updateDisplay();
}

function getRadarsForProductCycle()
{
  if (radars.length === 0)
    return [];
  const match = /^radar_(\d+)$/.exec(guiControls.radarOverlaySource || '');
  if (match) {
    const radar = radars[parseInt(match[1], 10)];
    return radar ? [ radar ] : [];
  }
  const enabled = radars.filter(r => r.getEnabled());
  if (enabled.length > 0)
    return enabled;
  return [ ...radars ];
}

/** Tower-radar products (composite / world modes are separate display modes). */
const RADAR_PRODUCT_CATALOG = [
  { id: 'reflectivity', name: 'Base Reflectivity (Z)', category: 'Reflectivity',
    productType: 0, colorScale: 'radarReflectivity',
    desc: 'Precipitation intensity at one tilt; stronger returns = heavier rain/hail/snow.' },
  { id: 'echotops', name: 'Echo Tops', category: 'Reflectivity',
    productType: 3, colorScale: 'radarEchoTops',
    desc: 'Height of the highest significant echo; tall tops imply strong updrafts.' },
  { id: 'cappi', name: 'CAPPI (fixed height)', category: 'Reflectivity',
    productType: 13, colorScale: 'radarReflectivity',
    desc: 'Reflectivity on a constant-altitude surface (set height in Radar folder).' },
  { id: 'vil', name: 'Vertically Integrated Liquid (VIL)', category: 'Reflectivity',
    productType: 12, colorScale: 'radarVil',
    desc: 'Total liquid water in the column; high VIL suggests hail potential.' },
  { id: 'velocity', name: 'Radial Velocity (V)', category: 'Doppler Velocity',
    productType: 1, colorScale: 'radarVelocity',
    desc: 'Wind toward/away from the radar; used for rotation and downburst detection.' },
  { id: 'storm_relative_velocity', name: 'Storm-Relative Velocity (SRV)', category: 'Doppler Velocity',
    productType: 4, colorScale: 'radarVelocity',
    desc: 'Radial velocity with storm motion removed; highlights mesocyclones.' },
  { id: 'wind_speed', name: 'Wind Speed (gate)', category: 'Doppler Velocity',
    productType: 14, colorScale: 'radarVelocity',
    desc: 'Horizontal wind speed at the beam gate (simplified VAD-style).' },
  { id: 'zdr', name: 'Differential Reflectivity (ZDR)', category: 'Dual-Polarization',
    productType: 5, colorScale: 'radarZdr',
    desc: 'Drop shape: high ZDR = oblate rain; low ZDR = hail or ice.' },
  { id: 'correlation', name: 'Correlation Coefficient (CC)', category: 'Dual-Polarization',
    productType: 2, colorScale: 'radarCorrelation',
    desc: 'Target uniformity; low CC can mean debris, hail, or mixed types.' },
  { id: 'kdp', name: 'Specific Differential Phase (KDP)', category: 'Dual-Polarization',
    productType: 6, colorScale: 'radarKdp',
    desc: 'Heavy rain estimation from phase shift proxy.' },
  { id: 'hca', name: 'Hydrometeor Classification (HCA)', category: 'Dual-Polarization',
    productType: 7, colorScale: 'radarHca',
    desc: 'Rain, snow, graupel, hail, biological, debris, or mixed.' },
  { id: 'hail', name: 'Hail Detection', category: 'Severe Weather',
    productType: 8, colorScale: 'hail',
    desc: 'Estimated hail likelihood from reflectivity and dual-pol cues.' },
  { id: 'tds', name: 'Tornado Debris Signature (TDS)', category: 'Severe Weather',
    productType: 9, colorScale: 'radarTds',
    desc: 'High Z, low CC, and strong shear — possible lofted debris.' },
  { id: 'mesocyclone', name: 'Mesocyclone Detection (MDA)', category: 'Severe Weather',
    productType: 10, colorScale: 'radarMeso',
    desc: 'Azimuthal velocity shear suggesting rotating updrafts.' },
  { id: 'qpe', name: 'Quantitative Precipitation Estimation (QPE)', category: 'Rainfall',
    productType: 11, colorScale: 'radarQpe',
    desc: 'Instantaneous rainfall rate from Z–R relationship.' },
  { id: 'accumulation_1h', name: '1-hr Accumulation', category: 'Rainfall',
    productType: 15, colorScale: 'radarAccum', accumChannel: 0,
    desc: 'Rolling ~1 hour rainfall total (exponential decay).' },
  { id: 'accumulation_3h', name: '3-hr Accumulation', category: 'Rainfall',
    productType: 15, colorScale: 'radarAccum', accumChannel: 1,
    desc: 'Rolling ~3 hour rainfall total.' },
  { id: 'accumulation_24h', name: '24-hr Accumulation', category: 'Rainfall',
    productType: 15, colorScale: 'radarAccum', accumChannel: 2,
    desc: 'Rolling ~24 hour rainfall total.' },
];

const RADAR_PRODUCT_CYCLE_ORDER = RADAR_PRODUCT_CATALOG.map(p => p.id);

const RADAR_COLOR_SCALE_LOOKUP = {
  radarReflectivity: { col: 18, stops: 36 },
  radarVelocity:     { col: 19, stops: 33 },
  radarCorrelation:  { col: 20, stops: 22 },
  radarEchoTops:     { col: 21, stops: 32 },
  radarZdr:          { col: 50, stops: 33 },
  radarKdp:          { col: 51, stops: 33 },
  radarHca:          { col: 52, stops: 8 },
  hail:              { col: 44, stops: 33 },
  radarTds:          { col: 53, stops: 33 },
  radarMeso:         { col: 54, stops: 33 },
  radarQpe:          { col: 55, stops: 33 },
  radarVil:          { col: 56, stops: 33 },
  radarAccum:        { col: 57, stops: 33 },
};

function getRadarProductMeta(productId)
{
  return RADAR_PRODUCT_CATALOG.find(p => p.id === productId)
    || RADAR_PRODUCT_CATALOG[0];
}

function getRadarProductTypeFromId(productId)
{
  return getRadarProductMeta(productId).productType;
}

function getRadarAccumChannel(productId)
{
  const meta = getRadarProductMeta(productId);
  return meta.accumChannel !== undefined ? meta.accumChannel : 0;
}

function anyRadarNeedsAccumTexture()
{
  if (guiControls.displayMode === 'DISP_RADAR_WORLD' && worldRadarNeedsAccumTexture())
    return true;
  if (guiControls.radarOverlay && guiControls.radarOverlaySource === 'world' && worldRadarNeedsAccumTexture())
    return true;
  for (let i = 0; i < radars.length; i++) {
    const p = radars[i].getProduct();
    if (!p.startsWith('accumulation'))
      continue;
    if (radars[i].getEnabled())
      return true;
    const match = /^radar_(\d+)$/.exec(guiControls.radarOverlaySource || '');
    if (guiControls.radarOverlay && match && parseInt(match[1], 10) === i)
      return true;
  }
  return false;
}

function initRadarAccumTexture()
{
  if (!gl || radarAccumTexture)
    return;
  const n = sim_res_x * sim_res_y;
  radarAccumData = new Float32Array(n * 4);
  radarAccumTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, radarAccumTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, radarAccumData);
}

function resetRadarAccumulation()
{
  if (radarAccumData)
    radarAccumData.fill(0);
  if (radarAccumTexture && gl) {
    gl.bindTexture(gl.TEXTURE_2D, radarAccumTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, radarAccumData);
  }
}

function updateRadarAccumTextureFromCache()
{
  if (!anyRadarNeedsAccumTexture() || typeof frameBuff_1 === 'undefined')
    return;
  initRadarAccumTexture();
  const n = sim_res_x * sim_res_y;
  const waterPixels = new Float32Array(n * 4);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frameBuff_1);
  gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterPixels);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

  const updateFreq = Math.max(1, Math.round(guiControls.radarUpdateFrequency || 1));
  const dtHours = timePerIteration * updateFreq;
  const decay1 = Math.exp(-dtHours / 1.0);
  const decay3 = Math.exp(-dtHours / 3.0);
  const decay24 = Math.exp(-dtHours / 24.0);

  for (let i = 0; i < n; i++) {
    const precip = Math.max(waterPixels[i * 4 + 2], 0);
    const dust = Math.max(waterPixels[i * 4 + 3], 0) * 0.15;
    const mass = precip + dust;
    let dBZ = 0;
    if (mass > 1e-9) {
      dBZ = 45.0 + 10.0 * Math.log10(Math.max(mass * 30.0, 1e-9));
      dBZ = Math.min(85, Math.max(0, dBZ));
    }
    let rateMmHr = 0;
    if (dBZ >= 5) {
      const zLin = Math.pow(10, dBZ / 10);
      rateMmHr = Math.pow(zLin / 200, 1 / 1.6);
    }
    const add = rateMmHr * dtHours;
    const base = i * 4;
    radarAccumData[base]     = radarAccumData[base]     * decay1 + add;
    radarAccumData[base + 1] = radarAccumData[base + 1] * decay3 + add;
    radarAccumData[base + 2] = radarAccumData[base + 2] * decay24 + add;
    radarAccumData[base + 3] = 0;
  }

  gl.bindTexture(gl.TEXTURE_2D, radarAccumTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, radarAccumData);
}

function buildRadarProductSelectOptions()
{
  const categories = [ ...new Set(RADAR_PRODUCT_CATALOG.map(p => p.category)) ];
  const groups = {};
  for (const cat of categories)
    groups[cat] = [];
  for (const p of RADAR_PRODUCT_CATALOG)
    groups[p.category].push(p);
  return { categories, groups };
}

function buildWorldRadarProductGuiOptions()
{
  const options = {};
  for (const p of RADAR_PRODUCT_CATALOG)
    options[p.name] = p.id;
  return options;
}

/** Virtual PPI site for world radar (polar geometry like tower radars, not column slices). */
function getWorldRadarSite()
{
  const enabled = radars.filter(r => r.getEnabled());
  let x = sim_res_x * 0.5;
  let y = Math.max(8, sim_res_y * 0.12);
  let range = Math.hypot(sim_res_x, sim_res_y) * 0.72;

  if (enabled.length === 1) {
    const r = enabled[0];
    x = r.getXpos();
    y = r.getYpos();
    range = r.getRange();
  } else if (enabled.length > 1) {
    x = enabled.reduce((s, r) => s + r.getXpos(), 0) / enabled.length;
    y = enabled.reduce((s, r) => s + r.getYpos(), 0) / enabled.length;
    range = Math.max(...enabled.map(r => r.getRange()));
  }

  return {
    x,
    y,
    range: Math.max(range, 250),
    resolution: guiControls.worldRadarResolution,
    sensitivity: guiControls.worldRadarSensitivity,
  };
}

function worldRadarNeedsAccumTexture()
{
  const p = guiControls.worldRadarProduct || 'reflectivity';
  return p.startsWith('accumulation');
}

function download(filename, data)
{
  var url = URL.createObjectURL(data);
  const element = document.createElement('a');
  element.setAttribute('href', url);
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// Universal Functions

function mod(a, b)
{
  // proper modulo to handle negative numbers
  return ((a % b) + b) % b;
}

function map_range(value, low1, high1, low2, high2) { return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1); }

function map_range_C(value, low1, high1, low2, high2) { return clamp(low2 + ((high2 - low2) * (value - low1)) / (high1 - low1), Math.min(low2, high2), Math.max(low2, high2)); }

// Temperature Functions

function CtoK(C) { return C + 273.15; }

function KtoC(K) { return K - 273.15; }

function CtoF(C) { return C * 1.8 + 32.0; }


function dT_saturated(dTdry, dTl)
{
  // dTl = temperature difference because of latent heat
  // if (dTl == 0.0)
  //   return dTdry;
  //  else {
  var multiplier = dTdry / (dTdry - dTl);
  return dTdry * multiplier;
  // }
}

const IR_constant = 5.670374419; // ×10−8

function IR_emitted(T)
{
  return Math.pow(T * 0.01, 4) * IR_constant; // Stefan–Boltzmann law
}

function IR_temp(IR)
{
  // inversed Stefan–Boltzmann law
  return Math.pow(IR / IR_constant, 1.0 / 4.0) * 100.0;
}

////////////// Water Functions ///////////////
const wf_devider = 250.0;
const wf_pow = 17.0;

function maxWater(Td)
{
  return Math.pow(Td / wf_devider,
                  wf_pow); // w = ((Td)/(250))^(18) // Td in Kelvin, w in grams per m^3
}

function dewpoint(W)
{
  //  if (W < 0.00001) // can't remember why this was here...
  //    return 0.0;
  //  else
  return wf_devider * Math.pow(W, 1.0 / wf_pow);
}

function relativeHumd(T, W) { return (W / maxWater(T)) * 100.0; }

// Print funtions:

function convertTempToSelectedUnit(tempC)
{
  switch (guiControls.tempUnit) {
  case 'TEMP_UNIT_C':
    return tempC;
  case 'TEMP_UNIT_F':
    return CtoF(tempC);
  case 'TEMP_UNIT_K':
    return (tempC + 273.15);
  }
}

function printTemp(tempC)
{
  let tempStr = convertTempToSelectedUnit(tempC).toFixed(1);
  switch (guiControls.tempUnit) {
  case 'TEMP_UNIT_C':
    return tempStr + '°C';
  case 'TEMP_UNIT_F':
    return tempStr + '°F';
  case 'TEMP_UNIT_K':
    return tempStr + ' K';
  }
}

function mmToIn(mm) { return mm * 0.393701; }

function msToKnots(ms) { return ms * 1.94384; };

function msToMPH(ms) { return ms * 2.23694; };

function knotsToMs(kt) { return kt * 0.514444; };

function printSnowHeight(snowHeight_cm)
{
  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL') {
    return mmToIn(snowHeight_cm).toFixed(1) + '"'; // inches
  } else
    return snowHeight_cm.toFixed(1) + ' cm';
}

function printSoilMoisture(soilMoisture_mm)
{
  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL') {
    return mmToIn(soilMoisture_mm).toFixed(1) + '"'; // inches
  } else
    return soilMoisture_mm.toFixed(1) + ' mm';
}


function printDistance(m)
{
  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL') {
    let miles = m * kmToMil / 1000;
    let ft = m * mToFt;
    return miles < 1.0 ? ft.toFixed(0) + ' ft' : miles.toFixed(1) + ' miles';
  } else {
    let km = m / 1000;
    return m < 1000 ? m.toFixed(0) + ' m' : km.toFixed(1) + ' km';
  }
}

function printAltitude(meters)
{
  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL') {
    let feet = meters * mToFt;
    return feet.toFixed() + ' ft';
  } else
    return meters.toFixed() + ' m';
}

function printHailSize(diameterIn)
{
  if (diameterIn < 0.05) return 'None';
  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL')
    return diameterIn.toFixed(2) + '"';
  return (diameterIn * 2.54).toFixed(1) + ' cm';
}

function formatLightningEstimate(flashesPerMin)
{
  if (flashesPerMin < 0.05) return 'Negligible';
  if (flashesPerMin < 0.35) return 'Low (~' + flashesPerMin.toFixed(1) + '/min)';
  if (flashesPerMin < 1.5) return 'Mod (~' + flashesPerMin.toFixed(1) + '/min)';
  if (flashesPerMin < 5) return 'High (~' + flashesPerMin.toFixed(1) + '/min)';
  if (flashesPerMin < 15) return 'Very High (~' + flashesPerMin.toFixed(1) + '/min)';
  return 'Intense (~' + flashesPerMin.toFixed(1) + '/min)';
}

function convertVelocityToSelectedUnit(ms, unitKey)
{
  const unit = unitKey || guiControls.speedUnit;
  switch (unit) {
  case 'SPEED_UNIT_KMH':
    return ms * 3.6;
  case 'SPEED_UNIT_MS':
    return ms;
  case 'SPEED_UNIT_MPH':
    return msToMPH(ms);
  case 'SPEED_UNIT_KT':
    return msToKnots(ms);
  }
}

function printVelocity(ms)
{
  let velStr = convertVelocityToSelectedUnit(ms).toFixed();
  switch (guiControls.speedUnit) {
  case 'SPEED_UNIT_KMH':
    return velStr + ' km/h';
  case 'SPEED_UNIT_MS':
    return velStr + ' m/s';
  case 'SPEED_UNIT_MPH':
    return velStr + ' MPH';
  case 'SPEED_UNIT_KT':
    return velStr + ' kt';
  }
}

function printShear(ms)
{
  const unit = guiControls.shearUnit || guiControls.speedUnit || 'SPEED_UNIT_KMH';
  let velStr = convertVelocityToSelectedUnit(ms, unit).toFixed();
  switch (unit) {
  case 'SPEED_UNIT_KMH':
    return velStr + ' km/h';
  case 'SPEED_UNIT_MS':
    return velStr + ' m/s';
  case 'SPEED_UNIT_MPH':
    return velStr + ' MPH';
  case 'SPEED_UNIT_KT':
    return velStr + ' kt';
  }
}

function printLapseRate(cPerKm)
{
  if (isNaN(cPerKm)) return 'N/A';
  switch (guiControls.lapseUnit || 'LAPSE_UNIT_C_KM') {
  case 'LAPSE_UNIT_C_KFT':
    return (cPerKm / 3.28084).toFixed(2) + ' °C/kft';
  case 'LAPSE_UNIT_F_KFT':
    return ((cPerKm * 9 / 5) / 3.28084).toFixed(2) + ' °F/kft';
  default:
    return cPerKm.toFixed(1) + ' °C/km';
  }
}

function formatDrySlotReadout(drySlot)
{
  if (!drySlot || drySlot.strength < 0.12) return 'None';
  const label = drySlot.strength >= 0.65 ? 'Strong' : drySlot.strength >= 0.35 ? 'Mod' : 'Weak';
  const baseKm = drySlot.baseAgl / 1000;
  const topKm = drySlot.topAgl / 1000;
  return label + ' ' + baseKm.toFixed(1) + '-' + topKm.toFixed(1) + 'km RH' + Math.round(drySlot.minRh) + '%';
}

function printVerticalVelocity(ms)
{
  let veloStr = ms >= 0. ? '+' : '';
  let unitStr = '';

  if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL') {
    veloStr += (ms * 196.8504).toFixed(0);
    unitStr = ' ft/m';
  } else {
    veloStr += ms.toFixed(1);
    unitStr = ' m/s';
  }
  return [ veloStr, unitStr ];
}

function rawVelocityTo_ms(vel)
{                          // Raw velocity is in cells/iteration
  vel /= timePerIteration; // convert to cells per hour
  vel *= cellHeight;       // convert to meters per hour
  vel /= 3600.0;           // convert to m/s
  return vel;
}

function msToRawVelocity(vel)
{                          // Raw velocity is in cells/iteration
  vel *= 3600;             // convert to meters per hour
  vel /= cellHeight;       // convert to cells per hour
  vel *= timePerIteration; // convert to raw (cells per iteration)
  return vel;
}

function CtoK(c) { return c + 273.15; }

function realToPotentialT(realT, y) { return realT + (y / sim_res_y) * dryLapse; }

function potentialToRealT(potentialT, y) { return potentialT - (y / sim_res_y) * dryLapse; }

function integrateCapeSegment(B0, B1, dz)
{
  if (B0 >= 0 && B1 >= 0)
    return {pos: (B0 + B1) * 0.5 * dz, neg: 0};
  if (B0 <= 0 && B1 <= 0)
    return {pos: 0, neg: (B0 + B1) * 0.5 * dz};
  const factor = Math.abs(B0) / (Math.abs(B0) + Math.abs(B1));
  const zcross = factor * dz;
  if (B0 < 0)
    return {pos: B1 * (dz - zcross) * 0.5, neg: B0 * zcross * 0.5};
  return {pos: B0 * zcross * 0.5, neg: B1 * (dz - zcross) * 0.5};
}

function computeParcelProfileForColumn(surfaceTempC, surfaceTdC, startIndex, simResY, dz)
{
  const parcelTemps = new Float32Array(simResY);
  const mixingWater = maxWater(CtoK(surfaceTdC));
  let prevTemp = surfaceTempC;
  let prevCloudWater = 0.0;
  parcelTemps.fill(NaN);
  parcelTemps[startIndex] = surfaceTempC;

  for (let y = startIndex + 1; y < simResY; y++) {
    const dT = -guiControls.dryLapseRate * dz / 1000.0;
    const nextDry = prevTemp + dT;
    const cloudWater = Math.max(mixingWater - maxWater(CtoK(nextDry)), 0.0);
    const dWt = (cloudWater - prevCloudWater) * guiControls.evapHeat;
    const deltaT = dT_saturated(dT, dWt);
    prevTemp = prevTemp + deltaT;
    parcelTemps[y] = prevTemp;
    prevCloudWater = Math.max(mixingWater - maxWater(CtoK(prevTemp)), 0.0);
  }

  return parcelTemps;
}

function buoyAtAltCol(buoy, alt, startIndex, simResY, dz)
{
  const y = alt / dz;
  let y0 = Math.floor(y);
  let y1 = y0 + 1;
  if (y1 >= simResY) y1 = simResY - 1;
  if (y0 < startIndex) y0 = startIndex;
  if (y1 < startIndex) y1 = startIndex;
  if (y0 === y1) {
    const b = buoy[y0];
    return isNaN(b) ? 0 : b;
  }
  const t = (y - y0) / (y1 - y0);
  const b0 = buoy[y0];
  const b1 = buoy[y1];
  if (isNaN(b0) && isNaN(b1)) return 0;
  if (isNaN(b0)) return b1;
  if (isNaN(b1)) return b0;
  return b0 + (b1 - b0) * t;
}

function integrateBuoyLayerCol(buoy, altBot, altTop, mode, startIndex, simResY, dz)
{
  const minAlt = startIndex * dz;
  altBot = Math.max(altBot, minAlt);
  if (isNaN(altBot) || isNaN(altTop) || altTop <= altBot) return 0;

  const steps = Math.max(1, Math.ceil((altTop - altBot) / dz));
  const stepDz = (altTop - altBot) / steps;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const a0 = altBot + i * stepDz;
    const a1 = altBot + (i + 1) * stepDz;
    const b0 = buoyAtAltCol(buoy, a0, startIndex, simResY, dz);
    const b1 = buoyAtAltCol(buoy, a1, startIndex, simResY, dz);
    const seg = integrateCapeSegment(b0, b1, stepDz);
    total += mode === 'pos' ? Math.max(0, seg.pos) : Math.min(0, seg.neg);
  }
  return total;
}

function findLclAltFromParcel(parcelTemps, envDewC, startIndex, simResY, dz, isFluid)
{
  const altFromIndex = (index) => index * dz;
  const parcelBaseAlt = altFromIndex(startIndex);
  const mixingWater = maxWater(CtoK(envDewC[startIndex]));

  for (let y = startIndex + 1; y < simResY; y++) {
    if (isNaN(parcelTemps[y]) || isNaN(parcelTemps[y - 1])) continue;
    const cwPrev = Math.max(mixingWater - maxWater(CtoK(parcelTemps[y - 1])), 0);
    const cwHere = Math.max(mixingWater - maxWater(CtoK(parcelTemps[y])), 0);
    if (cwHere > 0 && cwPrev <= 0) {
      const denom = cwHere - cwPrev;
      const ratio = denom > 1e-9 ? cwPrev / denom : 0;
      return altFromIndex(y - 1) + Math.max(0, Math.min(1, ratio)) * dz;
    }
  }

  for (let y = startIndex + 1; y < simResY; y++) {
    if (isNaN(parcelTemps[y])) continue;
    if (isFluid && !isFluid[y]) continue;
    const tParcel = parcelTemps[y];
    const tDew = envDewC[y];
    if (isNaN(tDew)) continue;
    const t0 = parcelTemps[y - 1];
    const d0 = envDewC[y - 1];
    if (isNaN(t0) || isNaN(d0)) continue;
    if (t0 > d0 + 0.05 && tParcel <= tDew + 0.05) {
      const denom = (t0 - d0) - (tParcel - tDew);
      const ratio = Math.abs(denom) > 1e-6 ? (t0 - d0) / denom : 0.5;
      return altFromIndex(y - 1) + Math.max(0, Math.min(1, ratio)) * dz;
    }
  }

  const surfT = parcelTemps[startIndex];
  const surfTd = envDewC[startIndex];
  if (!isNaN(surfT) && !isNaN(surfTd) && surfT <= surfTd + 0.05) {
    return parcelBaseAlt;
  }
  const surfTdiff = (isNaN(surfT) || isNaN(surfTd)) ? 0 : surfT - surfTd;
  return parcelBaseAlt + (surfTdiff > 0 ? (surfTdiff / 8.0) * 1000.0 : 0);
}

function computeCAPEForColumn(envTempsC, envDewC, parcelTemps, startIndex, isFluid, simResY, dz, sfcAltM)
{
  const B_MIN = 0.02;
  const MIN_CAPE_LAYER_M = 350;
  const altFromIndex = (index) => index * dz;
  let lclAlt = NaN;
  let lfcAlt = NaN;
  let elAlt = NaN;
  let cape = 0.0;
  let cinh = 0.0;
  let cape3km = 0.0;
  const top3kmAlt = (sfcAltM != null ? sfcAltM : startIndex * dz) + 3000;

  const buoy = new Float32Array(simResY);
  for (let y = startIndex; y < simResY; y++) {
    if (isNaN(parcelTemps[y])) {
      buoy[y] = 0;
      continue;
    }
    if (!isFluid[y]) {
      buoy[y] = NaN;
      continue;
    }
    const envTk = CtoK(envTempsC[y]);
    const parcelTk = CtoK(parcelTemps[y]);
    buoy[y] = 9.81 * (parcelTk - envTk) / envTk;
  }

  function buoyBelow(y) {
    for (let yy = y - 1; yy >= startIndex; yy--) {
      if (!isNaN(buoy[yy])) return buoy[yy];
    }
    return buoy[startIndex];
  }

  const parcelBaseAlt = altFromIndex(startIndex);
  lclAlt = findLclAltFromParcel(parcelTemps, envDewC, startIndex, simResY, dz, isFluid);

  if (buoy[startIndex] > B_MIN) {
    lfcAlt = parcelBaseAlt;
  } else {
    const lfcSearchMinAlt = Math.max(parcelBaseAlt, lclAlt - dz * 0.5);
    for (let y = startIndex + 1; y < simResY; y++) {
      if (isNaN(parcelTemps[y])) continue;
      const bHere = buoy[y];
      if (isNaN(bHere)) continue;
      if (altFromIndex(y) < lfcSearchMinAlt) continue;
      const bBelow = buoyBelow(y);
      if (bBelow <= B_MIN && bHere > B_MIN) {
        const denom = bBelow - bHere;
        const ratio = denom !== 0 ? bBelow / denom : 0.5;
        lfcAlt = altFromIndex(y - 1) + Math.max(0, Math.min(1, ratio)) * dz;
        break;
      }
    }
  }

  if (!isNaN(lfcAlt)) {
    let prevBuoy = buoy[Math.max(startIndex, Math.floor(lfcAlt / dz))];
    if (isNaN(prevBuoy)) prevBuoy = buoyBelow(Math.floor(lfcAlt / dz) + 1);
    for (let y = startIndex + 1; y < simResY; y++) {
      if (isNaN(buoy[y])) continue;
      if (altFromIndex(y) < lfcAlt + MIN_CAPE_LAYER_M) continue;
      if (prevBuoy > B_MIN && buoy[y] <= B_MIN) {
        const denom = prevBuoy - buoy[y];
        const ratio = denom !== 0 ? prevBuoy / denom : 0.5;
        elAlt = altFromIndex(y - 1) + Math.max(0, Math.min(1, ratio)) * dz;
        break;
      }
      prevBuoy = buoy[y];
    }
    if (isNaN(elAlt)) {
      elAlt = altFromIndex(simResY - 1);
    } else if (elAlt - lfcAlt < MIN_CAPE_LAYER_M) {
      let prevB = buoy[Math.max(startIndex, Math.floor(lfcAlt / dz))];
      if (isNaN(prevB)) prevB = B_MIN;
      for (let y = Math.floor(lfcAlt / dz) + 1; y < simResY; y++) {
        if (isNaN(buoy[y])) continue;
        if (altFromIndex(y) < lfcAlt + MIN_CAPE_LAYER_M) {
          prevB = buoy[y];
          continue;
        }
        if (prevB > B_MIN && buoy[y] <= B_MIN) {
          const denom = prevB - buoy[y];
          const ratio = denom !== 0 ? prevB / denom : 0.5;
          const candidateEl = altFromIndex(y - 1) + Math.max(0, Math.min(1, ratio)) * dz;
          if (candidateEl - lfcAlt >= MIN_CAPE_LAYER_M) {
            elAlt = candidateEl;
            break;
          }
        }
        prevB = buoy[y];
      }
      if (elAlt - lfcAlt < MIN_CAPE_LAYER_M) {
        elAlt = altFromIndex(simResY - 1);
      }
    }
  }

  if (isNaN(lfcAlt)) {
    for (let y = startIndex + 1; y < simResY; y++) {
      if (!isFluid[y] || isNaN(buoy[y])) continue;
      if (buoy[y] > B_MIN) {
        lfcAlt = altFromIndex(y);
        break;
      }
    }
  }
  if (!isNaN(lfcAlt) && isNaN(elAlt)) {
    for (let y = simResY - 2; y > startIndex; y--) {
      if (!isFluid[y] || isNaN(buoy[y])) continue;
      if (buoy[y] > B_MIN) {
        elAlt = altFromIndex(y);
        break;
      }
    }
    if (isNaN(elAlt)) {
      elAlt = altFromIndex(simResY - 1);
    }
  }

  const cinhTopAlt = isNaN(lfcAlt)
    ? Math.min(parcelBaseAlt + 10000, (simResY - 1) * dz)
    : lfcAlt;
  cinh = integrateBuoyLayerCol(buoy, parcelBaseAlt, cinhTopAlt, 'neg', startIndex, simResY, dz);

  if (!isNaN(lfcAlt) && !isNaN(elAlt) && elAlt > lfcAlt) {
    cape = integrateBuoyLayerCol(buoy, lfcAlt, elAlt, 'pos', startIndex, simResY, dz);
    const cape3Top = Math.min(elAlt, top3kmAlt);
    if (cape3Top > lfcAlt) {
      cape3km = integrateBuoyLayerCol(buoy, lfcAlt, cape3Top, 'pos', startIndex, simResY, dz);
    }
  } else if (!isNaN(lfcAlt) && cape === 0) {
    for (let y = startIndex + 1; y < simResY; y++) {
      if (!isFluid[y] || isNaN(buoy[y]) || buoy[y] <= B_MIN) continue;
      const topAlt = altFromIndex(y);
      if (topAlt > lfcAlt + MIN_CAPE_LAYER_M) {
        elAlt = isNaN(elAlt) ? topAlt : elAlt;
        cape = integrateBuoyLayerCol(buoy, lfcAlt, topAlt, 'pos', startIndex, simResY, dz);
        break;
      }
    }
  }

  return {cape, cinh, lclAlt, lfcAlt, elAlt, cape3km};
}

function meanLayerParcelForColumn(envTempsC, envDewC, startIndex, simResY, dz)
{
  const maxLevels = Math.max(1, Math.min(simResY - startIndex, Math.round(1000 / dz)));
  let sumT = 0.0;
  let sumTd = 0.0;
  for (let y = startIndex; y < startIndex + maxLevels; y++) {
    sumT += envTempsC[y];
    sumTd += envDewC[y];
  }
  return computeParcelProfileForColumn(sumT / maxLevels, sumTd / maxLevels, startIndex, simResY, dz);
}

function computeColumnSoundingMetrics(envTempsC, envDewC, isFluid, vxRaw, vyRaw, waterArr, simResY, dz)
{
  let surfaceLevel = -1;
  for (let y = 0; y < simResY; y++) {
    if (isFluid[y]) {
      surfaceLevel = y;
      break;
    }
  }
  if (surfaceLevel < 0) return null;

  const sfcAltM = surfaceLevel * dz;

  const sbProfile = computeParcelProfileForColumn(
    envTempsC[surfaceLevel], envDewC[surfaceLevel], surfaceLevel, simResY, dz);
  const sbMetrics = computeCAPEForColumn(
    envTempsC, envDewC, sbProfile, surfaceLevel, isFluid, simResY, dz, sfcAltM);
  const sbCape = sbMetrics.cape;

  const mlProfile = meanLayerParcelForColumn(envTempsC, envDewC, surfaceLevel, simResY, dz);
  const mlMetrics = computeCAPEForColumn(
    envTempsC, envDewC, mlProfile, surfaceLevel, isFluid, simResY, dz, sfcAltM);
  const mlCape = mlMetrics.cape;
  const mlCinh = mlMetrics.cinh;

  let muCape = 0;
  let muCinh = sbMetrics.cinh;
  let muLcl = sbMetrics.lclAlt;
  let muLfc = sbMetrics.lfcAlt;
  let muEl = sbMetrics.elAlt;
  let muParcelLevel = surfaceLevel;
  for (let y = surfaceLevel; y < simResY - 1; y++) {
    if (!isFluid[y]) continue;
    const pp = computeParcelProfileForColumn(envTempsC[y], envDewC[y], y, simResY, dz);
    const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, isFluid, simResY, dz, sfcAltM);
    if (m.cape > muCape) {
      muCape = m.cape;
      muCinh = m.cinh;
      muLcl = m.lclAlt;
      muLfc = m.lfcAlt;
      muEl = m.elAlt;
      muParcelLevel = y;
    }
  }
  if (muCape < sbCape) {
    muCape = sbCape;
    muCinh = sbMetrics.cinh;
    muLcl = sbMetrics.lclAlt;
    muLfc = sbMetrics.lfcAlt;
    muEl = sbMetrics.elAlt;
    muParcelLevel = surfaceLevel;
  }
  const muParcelAgl = (muParcelLevel - surfaceLevel) * dz;

  let elevatedCape = 0;
  const elevOriginMin = surfaceLevel + Math.round(1500 / dz);
  for (let y = elevOriginMin; y < simResY - 1; y++) {
    if (!isFluid[y]) continue;
    const pp = computeParcelProfileForColumn(envTempsC[y], envDewC[y], y, simResY, dz);
    const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, isFluid, simResY, dz, sfcAltM);
    if (m.cape > elevatedCape) elevatedCape = m.cape;
  }

  let cape3km = 0;
  const max3kmLevel = surfaceLevel + Math.round(3000 / dz);
  for (let y = surfaceLevel; y < Math.min(max3kmLevel, simResY); y++) {
    if (!isFluid[y]) continue;
    const pp = computeParcelProfileForColumn(envTempsC[y], envDewC[y], y, simResY, dz);
    const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, isFluid, simResY, dz, sfcAltM);
    if (m.cape3km > cape3km)
      cape3km = m.cape3km;
  }

  let liftedIndex = NaN;
  const y500mb = surfaceLevel + Math.round(5500 / dz);
  if (y500mb < simResY && isFluid[y500mb]) {
    const parcelTemp500 = sbProfile[y500mb];
    if (!isNaN(parcelTemp500))
      liftedIndex = envTempsC[y500mb] - parcelTemp500;
  }

  let freezingAlt = NaN;
  for (let y = surfaceLevel; y < simResY - 1; y++) {
    if (!isFluid[y] || !isFluid[y + 1]) continue;
    const t0 = envTempsC[y];
    const t1 = envTempsC[y + 1];
    if (t0 > 0 && t1 <= 0) {
      const ratio = t0 / (t0 - t1);
      freezingAlt = (y + ratio) * dz;
      break;
    }
  }
  if (isNaN(freezingAlt) && envTempsC[surfaceLevel] <= 0)
    freezingAlt = surfaceLevel * dz;

  function windShearToAlt(altM) {
    const targetY = surfaceLevel + Math.round(altM / dz);
    if (targetY >= simResY) return 0;
    const surfVx = rawVelocityTo_ms(vxRaw[surfaceLevel]);
    const surfVy = rawVelocityTo_ms(vyRaw[surfaceLevel]);
    const topVx = rawVelocityTo_ms(vxRaw[targetY]);
    const topVy = rawVelocityTo_ms(vyRaw[targetY]);
    return Math.hypot(topVx - surfVx, topVy - surfVy);
  }
  const shear3km = windShearToAlt(3000);
  const shear6km = windShearToAlt(6000);
  const shear8km = windShearToAlt(8000);

  const STORM_MOTION_MS = 30 / 3.6;
  let stormU = STORM_MOTION_MS;
  let stormV = 0;
  {
    let sumU = 0, sumV = 0, n = 0;
    for (let y = surfaceLevel; y < simResY; y++) {
      if (!isFluid[y]) continue;
      const altM = (y - surfaceLevel) * dz;
      if (altM <= 6000) {
        sumU += rawVelocityTo_ms(vxRaw[y]);
        sumV += rawVelocityTo_ms(vyRaw[y]);
        n++;
      }
    }
    if (n > 0) {
      const mU = sumU / n, mV = sumV / n;
      const mSpd = Math.hypot(mU, mV);
      if (mSpd > 0.01) {
        stormU = mU / mSpd * STORM_MOTION_MS;
        stormV = mV / mSpd * STORM_MOTION_MS;
      }
    }
  }

  function calculateSRH(altM) {
    const targetY = surfaceLevel + Math.round(altM / dz);
    if (targetY >= simResY) return 0;
    let sumU = 0, count = 0;
    for (let y = surfaceLevel; y < targetY; y++) {
      if (!isFluid[y]) continue;
      sumU += vxRaw[y];
      count++;
    }
    if (count === 0) return 0;
    const stormURaw = sumU / count;
    let srh = 0;
    for (let y = surfaceLevel; y < targetY - 1; y++) {
      if (!isFluid[y] || !isFluid[y + 1]) continue;
      const stormRelU1 = vxRaw[y] - stormURaw;
      const stormRelU2 = vxRaw[y + 1] - stormURaw;
      const du_dz = (stormRelU2 - stormRelU1) / dz;
      const avgU = (stormRelU1 + stormRelU2) / 2;
      srh += avgU * du_dz * dz;
    }
    return Math.abs(srh);
  }
  const srh1km = calculateSRH(1000);
  const srh3km = calculateSRH(3000);

  let sriU = 0, sriV = 0, sriCount = 0;
  for (let y = surfaceLevel; y < simResY; y++) {
    if (!isFluid[y]) continue;
    const altM = (y - surfaceLevel) * dz;
    if (altM >= 500 && altM <= 3000) {
      sriU += rawVelocityTo_ms(vxRaw[y]) - stormU;
      sriV += rawVelocityTo_ms(vyRaw[y]) - stormV;
      sriCount++;
    }
  }
  if (sriCount > 0) { sriU /= sriCount; sriV /= sriCount; }
  const sriMag = Math.hypot(sriU, sriV);

  let pwat_mm = 0;
  for (let y = surfaceLevel; y < simResY; y++) {
    if (!isFluid[y]) continue;
    pwat_mm += waterArr[y] * dz * 0.001;
  }

  function lapseRateLayer(altBot, altTop) {
    const yBot = surfaceLevel + Math.round(altBot / dz);
    const yTop = surfaceLevel + Math.round(altTop / dz);
    if (yTop >= simResY || yBot >= simResY) return NaN;
    return (envTempsC[yBot] - envTempsC[yTop]) / ((altTop - altBot) / 1000);
  }
  const lapse03 = lapseRateLayer(0, 3000);
  const lapse36 = lapseRateLayer(3000, 6000);

  function analyzeDrySlotCol() {
    const rhProfile = [];
    for (let y = surfaceLevel; y < simResY; y++) {
      if (!isFluid[y]) continue;
      const altAgl = (y - surfaceLevel) * dz;
      const tK = CtoK(envTempsC[y]);
      const rh = relativeHumd(tK, waterArr[y]);
      rhProfile.push({altAgl, rh, dewDep: envTempsC[y] - envDewC[y]});
    }
    if (rhProfile.length < 6)
      return {strength: 0};
    const midLayers = rhProfile.filter(p => p.altAgl >= 1500 && p.altAgl <= 9000);
    if (midLayers.length === 0) return {strength: 0};
    let minRh = 100, minPt = midLayers[0];
    for (const p of midLayers) {
      if (p.rh < minRh) { minRh = p.rh; minPt = p; }
    }
    const blLayers = rhProfile.filter(p => p.altAgl <= 1500);
    const blMeanRh = blLayers.reduce((s, p) => s + p.rh, 0) / blLayers.length;
    const belowLayers = rhProfile.filter(p => p.altAgl >= minPt.altAgl - 1000 && p.altAgl < minPt.altAgl);
    const aboveLayers = rhProfile.filter(p => p.altAgl > minPt.altAgl && p.altAgl <= minPt.altAgl + 2000);
    const belowMean = belowLayers.length ? belowLayers.reduce((s, p) => s + p.rh, 0) / belowLayers.length : blMeanRh;
    const aboveMean = aboveLayers.length ? aboveLayers.reduce((s, p) => s + p.rh, 0) / aboveLayers.length : minRh;
    const surroundMean = (blMeanRh + belowMean + aboveMean) / 3;
    const rhDeficit = Math.max(0, surroundMean - minRh);
    const dryThreshold = Math.min(55, minRh + 12);
    let baseAgl = minPt.altAgl, topAgl = minPt.altAgl;
    for (const p of rhProfile) {
      if (p.altAgl >= 1000 && p.rh <= dryThreshold && p.dewDep >= 12) {
        baseAgl = Math.min(baseAgl, p.altAgl);
        topAgl = Math.max(topAgl, p.altAgl);
      }
    }
    const depthKm = Math.max(0, (topAgl - baseAgl) / 1000);
    const notchScore = map_range_C(rhDeficit, 8, 40, 0, 1);
    const drynessScore = map_range_C(minRh, 45, 12, 0.2, 1);
    const depthScore = map_range_C(depthKm, 0.4, 3.5, 0.2, 1);
    const dewDepScore = map_range_C(minPt.dewDep, 12, 32, 0.2, 1);
    return {strength: notchScore * drynessScore * depthScore * dewDepScore};
  }
  const drySlot = analyzeDrySlotCol();
  const drySlotStrength = drySlot.strength;
  const moistEnv = 1 - drySlotStrength * 0.55;

  const mlLcl_m = mlMetrics.lclAlt || 0;
  const esrh_approx = Math.max(0, shear3km * 50);
  const stpLcl = Math.max(0, (2000 - mlLcl_m) / 1000);
  const stpCinh = Math.min(1, (mlCinh + 200) / 150);
  const stp = (mlCape / 1500) * (esrh_approx / 150) * stpLcl * stpCinh * moistEnv;

  const vtpLapse = isNaN(lapse03) ? 0 : Math.max(0, lapse03 / 6.5);
  const vtpShear = shear6km / 20;
  const vtpPwat = pwat_mm / 38;
  const vtp = (muCape / 1500) * vtpShear * vtpLapse * vtpPwat * moistEnv;

  let dcape = 0;
  {
    const y4km = surfaceLevel + Math.round(4000 / dz);
    const y8km = Math.min(surfaceLevel + Math.round(8000 / dz), simResY - 1);
    let minThetaE = Infinity, dcapeStartY = y4km;
    for (let y = y4km; y <= y8km; y++) {
      if (!isFluid[y]) continue;
      const tK = CtoK(envTempsC[y]);
      const thetaE = tK + 2500 * Math.max(waterArr[y], 0) / 1004;
      if (thetaE < minThetaE) { minThetaE = thetaE; dcapeStartY = y; }
    }
    const startTk = CtoK(envTempsC[dcapeStartY]);
    let parcelTk = startTk;
    let prevBuoy2 = 0;
    for (let y = dcapeStartY - 1; y >= surfaceLevel; y--) {
      if (!isFluid[y]) continue;
      const envTk = CtoK(envTempsC[y]);
      parcelTk += 9.8 * dz / 1000.0;
      const buoy = 9.81 * (envTk - parcelTk) / parcelTk;
      if (buoy < 0) {
        dcape += (Math.abs(buoy) + Math.abs(prevBuoy2)) / 2 * dz;
      }
      prevBuoy2 = buoy;
    }
  }

  const mixedPhaseKm = (!isNaN(freezingAlt) && !isNaN(muEl))
    ? Math.max(0, (muEl - freezingAlt) / 1000) : 0;
  const updraftMs = Math.sqrt(2 * Math.max(0, muCape));
  let estHailIn = 0;
  if (muCape >= 400 && !isNaN(freezingAlt) && !isNaN(muEl) && mixedPhaseKm > 0.5) {
    estHailIn = 0.08;
    estHailIn += map_range_C(muCape, 400, 2000, 0, 0.75);
    estHailIn += map_range_C(muCape, 2000, 4500, 0, 1.25);
    if (!isNaN(lapse03)) estHailIn += map_range_C(lapse03, 6.0, 8.5, 0, 0.45);
    estHailIn += map_range_C(shear6km, 8, 24, 0, 0.55);
    estHailIn += map_range_C(mixedPhaseKm, 2, 8, 0, 0.65);
    estHailIn *= map_range_C(updraftMs, 12, 42, 0.45, 1.0);
    estHailIn *= moistEnv;
  }

  let lightningFlMin = 0;
  if (muCape >= 150 && !isNaN(muLfc) && mixedPhaseKm > 0.5) {
    const lScore = map_range_C(muCape, 150, 3500, 0, 1);
    const pScore = map_range_C(pwat_mm, 8, 45, 0, 1);
    const mScore = map_range_C(mixedPhaseKm, 1.5, 9, 0, 1);
    const uScore = map_range_C(updraftMs, 8, 40, 0, 1);
    const sScore = map_range_C(shear6km, 5, 18, 0.2, 1);
    const slotScore = 1 - drySlotStrength * 0.6;
    lightningFlMin = lScore * pScore * mScore * uScore * sScore * slotScore * 38.0;
  }

  const sfcPress_hPa = 1013.25 * Math.pow(1.0 - 2.25577e-5 * sfcAltM, 5.25588);

  return {
    surfaceLevel,
    sbCape, muCape, mlCape, cape3km,
    muCinh, mlCinh,
    liftedIndex,
    pwat_mm,
    drySlotStrength,
    muLcl: isNaN(muLcl) ? 0 : muLcl,
    muLfc: isNaN(muLfc) ? 0 : muLfc,
    muEl: isNaN(muEl) ? 0 : muEl,
    freezingAlt: isNaN(freezingAlt) ? 0 : freezingAlt,
    sfcPress_hPa,
    sfcAltM,
    muParcelAgl,
    elevatedCape,
    srh1km, srh3km,
    shear3km, shear6km, shear8km,
    sriMag,
    lapse03: isNaN(lapse03) ? 0 : lapse03,
    lapse36: isNaN(lapse36) ? 0 : lapse36,
    stp, vtp,
    dcape,
    estHailIn,
    lightningFlMin,
  };
}

function computeColumnHazardsAndFire(metrics, envTempsC, waterVaporCol, soilMoistureSfc, vxRaw, vyRaw)
{
  const surfaceLevel = metrics.surfaceLevel;
  const moistEnv = 1 - metrics.drySlotStrength * 0.55;
  const mixedPhaseKm = (metrics.freezingAlt > 0 && metrics.muEl > 0)
    ? Math.max(0, (metrics.muEl - metrics.freezingAlt) / 1000) : 0;

  function hf(v, min, moderate, full) {
    if (v < min) return 0;
    if (v >= full) return 1;
    if (v <= moderate) return map_range_C(v, min, moderate, 0.08, 0.42);
    return map_range_C(v, moderate, full, 0.42, 1);
  }

  function hazardProbability(factors, cap) {
    if (factors.length === 0) return 0;
    if (factors.some(f => f <= 0)) return 0;
    const gm = Math.pow(factors.reduce((a, b) => a * b, 1), 1 / factors.length);
    return Math.min(cap, Math.round(Math.pow(gm, 1.55) * 100));
  }

  const moistF = hf(moistEnv, 0.45, 0.65, 0.88);
  const lapseN = metrics.lapse03;
  const muCape = metrics.muCape;
  const stp = metrics.stp;
  const vtp = metrics.vtp;
  const srh3km = metrics.srh3km;
  const shear3km = metrics.shear3km;
  const shear6km = metrics.shear6km;
  const dcape = metrics.dcape;
  const estHailIn = metrics.estHailIn;
  const pwat_mm = metrics.pwat_mm;
  const drySlotStrength = metrics.drySlotStrength;

  let hazardGeneralThunderstorm = 0;
  if (muCape >= 200) {
    hazardGeneralThunderstorm = hazardProbability([
      hf(muCape, 200, 500, 1400),
      hf(pwat_mm, 12, 22, 40),
    ], 38);
  }

  const surfaceTemp = envTempsC[surfaceLevel];
  const surfaceRH = relativeHumd(CtoK(surfaceTemp), waterVaporCol[surfaceLevel]);
  const surfaceWind = rawVelocityTo_ms(Math.hypot(vxRaw[surfaceLevel], vyRaw[surfaceLevel]));
  let fireIndex = 0;
  if (surfaceTemp > 25) fireIndex += (surfaceTemp - 25) * 2;
  if (surfaceRH < 30) fireIndex += (30 - surfaceRH) * 1.5;
  if (surfaceWind > 5) fireIndex += (surfaceWind - 5);
  if (soilMoistureSfc < 10) fireIndex += (10 - soilMoistureSfc) * 0.5;

  return {
    hazardPdsTornado: hazardProbability([
      hf(stp, 2.5, 5, 10), hf(vtp, 1.5, 3.5, 7), hf(srh3km, 200, 320, 480),
      hf(muCape, 2200, 3200, 5000), moistF,
    ], 52),
    hazardTornado: hazardProbability([
      hf(stp, 0.8, 2, 5), hf(vtp, 0.6, 1.8, 4), hf(srh3km, 100, 200, 380),
      hf(shear3km, 10, 16, 26), moistF,
    ], 48),
    hazardSupercell: hazardProbability([
      hf(muCape, 900, 1600, 3200), hf(shear6km, 14, 20, 32),
      hf(srh3km, 80, 180, 320), moistF,
    ], 55),
    hazardGiantHail: hazardProbability([
      hf(muCape, 1800, 2600, 4500), hf(lapseN, 7.8, 8.5, 9.8),
      hf(shear6km, 18, 24, 36), hf(mixedPhaseKm, 3.5, 5.5, 8), moistF,
    ], 50),
    hazardLargeHail: hazardProbability([
      hf(muCape, 1100, 1800, 3200), hf(lapseN, 7.0, 7.8, 9.0),
      hf(estHailIn, 0.85, 1.25, 2.2), moistF,
    ], 45),
    hazardHail: hazardProbability([
      hf(muCape, 550, 1000, 2200), hf(lapseN, 6.2, 7.0, 8.5),
      hf(mixedPhaseKm, 1.8, 3.5, 7), moistF,
    ], 42),
    hazardDestructiveWinds: hazardProbability([
      hf(dcape, 1100, 1700, 2800), hf(shear6km, 20, 28, 40),
      hf(drySlotStrength, 0.35, 0.55, 0.85),
    ], 48),
    hazardDamagingWinds: hazardProbability([
      hf(dcape, 650, 1000, 1800), hf(shear6km, 16, 22, 34),
      hf(Math.max(dcape / 1200, drySlotStrength), 0.45, 0.7, 1.0),
    ], 40),
    hazardFlooding: hazardProbability([
      hf(pwat_mm, 32, 42, 58), hf(muCape, 350, 800, 1800),
      hf(1 - map_range_C(shear6km, 6, 18, 0, 1), 0.35, 0.55, 0.85), moistF,
    ], 45),
    hazardGeneralThunderstorm,
    fireIndex,
  };
}

function computeStormTypeComposites(metrics, drySlotStrength)
{
  const moistEnv = 1 - drySlotStrength * 0.55;
  const {
    sbCape, muCape, cape3km,
    shear3km, shear6km, shear8km,
    srh3km, pwat_mm, dcape, stp,
    lapse03, sriMag,
    muParcelAgl = 0, elevatedCape = 0, sfcAltM = 0, muLcl = 0,
  } = metrics;

  function cf(v, min, moderate, full) {
    if (v <= 0) return 0;
    if (v < min) return map_range_C(v, 0, min, 0.04, 0.18);
    if (v >= full) return 1;
    if (v <= moderate) return map_range_C(v, min, moderate, 0.18, 0.5);
    return map_range_C(v, moderate, full, 0.5, 1);
  }

  // Blend strongest core signals with overall profile — avoids one weak factor zeroing the score
  function stormComposite(factors, cap = 100) {
    if (factors.length === 0) return 0;
    const sorted = [...factors].sort((a, b) => b - a);
    const topN = sorted.slice(0, Math.min(4, sorted.length));
    if (topN[0] <= 0 || topN.filter(f => f >= 0.12).length < 2) return 0;
    const gmTop = Math.pow(
      topN.reduce((a, b) => a * Math.max(b, 0.06), 1),
      1 / topN.length
    );
    const meanAll = factors.reduce((a, b) => a + Math.max(b, 0.04), 0) / factors.length;
    const blend = gmTop * 0.72 + meanAll * 0.28;
    return Math.min(cap, Math.round(Math.pow(blend, 1.12) * 100));
  }

  function applyBonus(base, bonus, weight = 0.22) {
    return Math.min(100, Math.round(base * (1 - weight + weight * Math.max(0.35, bonus))));
  }

  const lapseN = lapse03 || 0;
  const muLclAgl = Math.max(0, muLcl - sfcAltM);
  const lowShear = Math.max(0, 24 - shear6km);
  const lowSrh = Math.max(0, 130 - srh3km);
  const dryMid = Math.max(0, 42 - pwat_mm);
  const deepShear = Math.max(0, shear8km - shear3km);
  const orgFactor = Math.max(
    cf(stp, 0.15, 0.6, 3.5),
    cf(shear3km, 6, 12, 22) * 0.85 + cf(srh3km, 50, 120, 260) * 0.15
  );

  const pulse = stormComposite([
    cf(muCape, 200, 600, 2000),
    cf(lowShear, 3, 8, 14),
    cf(lowSrh, 10, 35, 75),
    cf(cape3km > 0 ? Math.min(1.2, sbCape / Math.max(cape3km, 1)) : 0.35, 0.35, 0.65, 1.0),
  ]);

  const multicell = stormComposite([
    cf(muCape, 300, 800, 2400),
    cf(shear3km, 4, 10, 18),
    cf(shear6km, 6, 12, 24),
    cf(pwat_mm, 14, 24, 40),
    cf(moistEnv, 0.42, 0.62, 0.85),
    cf(Math.max(0, 1 - Math.abs(shear6km - 16) / 16), 0.1, 0.4, 0.75),
  ]);

  const lpBase = stormComposite([
    cf(muCape, 500, 1100, 3000),
    cf(shear6km, 10, 16, 30),
    cf(srh3km, 50, 110, 240),
    cf(dryMid, 4, 10, 20),
    cf(lapseN, 5.5, 6.8, 8.8),
    cf(pwat_mm, 0, 18, 32), // drier midlevels favored
  ]);
  const lpSupercell = applyBonus(lpBase, cf(drySlotStrength, 0, 0.15, 0.55));

  const classicBase = stormComposite([
    cf(muCape, 550, 1200, 3000),
    cf(shear6km, 10, 16, 30),
    cf(srh3km, 55, 120, 280),
    orgFactor,
    cf(pwat_mm, 14, 24, 42),
    cf(moistEnv, 0.38, 0.58, 0.82),
  ]);
  const classicSupercell = applyBonus(classicBase, cf(sriMag, 0, 6, 14));

  const hpBase = stormComposite([
    cf(muCape, 600, 1300, 3200),
    cf(shear6km, 9, 15, 26),
    cf(srh3km, 50, 110, 260),
    cf(pwat_mm, 24, 34, 52),
    cf(moistEnv, 0.55, 0.72, 0.9),
    cf(Math.max(0, 1800 - muLclAgl), 200, 700, 1200),
  ]);
  const hpSupercell = applyBonus(hpBase, cf(Math.max(0, 42 - lapseN), 0, 5, 12));

  const squallLine = stormComposite([
    cf(shear6km, 12, 18, 32),
    cf(dcape, 350, 750, 1900),
    cf(muCape, 250, 650, 1800),
    cf(pwat_mm, 15, 26, 44),
    cf(deepShear, 2, 6, 14),
    cf(drySlotStrength, 0.08, 0.25, 0.55),
  ]);

  const derecho = stormComposite([
    cf(dcape, 700, 1200, 2500),
    cf(shear6km, 15, 22, 36),
    cf(shear8km, 17, 26, 40),
    cf(muCape, 300, 750, 2000),
    cf(Math.max(0, 1 - srh3km / 300), 0.15, 0.4, 0.75),
    cf(drySlotStrength, 0.1, 0.3, 0.6),
  ], 95);

  let convMode = 'None';
  let convModeColor = '#888888';
  if (muCape >= 200) {
    const sfcStrong = sbCape >= 350;
    const elevStrong = elevatedCape >= 350;
    const muElevated = muParcelAgl >= 1200;
    const muSurface = muParcelAgl <= 500;
    if (sfcStrong && elevStrong && muParcelAgl > 700 && muParcelAgl < 3500) {
      convMode = 'Mixed';
      convModeColor = '#CCAAFF';
    } else if (muElevated || (elevStrong && elevatedCape > sbCape * 1.12 && muParcelAgl > 600)) {
      convMode = 'Elevated';
      convModeColor = '#66CCFF';
    } else if (muSurface && sbCape >= muCape * 0.72) {
      convMode = 'Surface-Based';
      convModeColor = '#88FF88';
    } else if (sfcStrong && !elevStrong) {
      convMode = 'Surface-Based';
      convModeColor = '#88FF88';
    } else if (elevStrong && !sfcStrong) {
      convMode = 'Elevated';
      convModeColor = '#66CCFF';
    } else {
      convMode = 'Mixed';
      convModeColor = '#CCAAFF';
    }
  }

  const types = [
    { key: 'pulse', label: 'Pulse Thunderstorm', shortLabel: 'Pulse TS', score: pulse, color: '#AAAAAA' },
    { key: 'multicell', label: 'Multicell (Classic) TS', shortLabel: 'Multicell', score: multicell, color: '#88CCFF' },
    { key: 'lp', label: 'LP Supercell', shortLabel: 'LP Supercell', score: lpSupercell, color: '#FF8800' },
    { key: 'classic', label: 'Classic Supercell', shortLabel: 'Classic SC', score: classicSupercell, color: '#FF4400' },
    { key: 'hp', label: 'HP Supercell', shortLabel: 'HP Supercell', score: hpSupercell, color: '#FF0066' },
    { key: 'squall', label: 'Squall Line', shortLabel: 'Squall Line', score: squallLine, color: '#CC6600' },
    { key: 'derecho', label: 'Derecho', shortLabel: 'Derecho', score: derecho, color: '#FF00AA' },
  ].sort((a, b) => b.score - a.score);

  return {
    pulse, multicell, lpSupercell, classicSupercell, hpSupercell, squallLine, derecho,
    convMode, convModeColor, types,
    dominantType: types[0].score > 0 ? types[0] : null,
  };
}

const SOUNDING_VIEW_CONFIGS = [
  { mode: 'DISP_CAPE',       key: 'sbCape',           scaleId: 'cape',       min: 0,    max: 10000, label: 'CAPE',           unit: 'J/kg' },
  { mode: 'DISP_MU_CAPE',    key: 'muCape',           scaleId: 'cape',       min: 0,    max: 10000, label: 'MU CAPE',        unit: 'J/kg' },
  { mode: 'DISP_ML_CAPE',    key: 'mlCape',           scaleId: 'cape',       min: 0,    max: 10000, label: 'ML CAPE',        unit: 'J/kg' },
  { mode: 'DISP_3_CAPE',     key: 'cape3km',          scaleId: 'cape',       min: 0,    max: 10000, label: '3CAPE',          unit: 'J/kg' },
  { mode: 'DISP_CINH',       key: 'muCinh',           scaleId: 'cinh',       min: -250, max: 0,     label: 'CINH',           unit: 'J/kg' },
  { mode: 'DISP_LI',         key: 'liftedIndex',      scaleId: 'liftedIndex', min: -6,  max: 6,     label: 'Lifted Index',   unit: '°C' },
  { mode: 'DISP_PWAT',       key: 'pwat_mm',          scaleId: 'pwat',       min: 0,    max: 80,    label: 'Precip Water',   unit: 'mm' },
  { mode: 'DISP_DRY_SLOT',   key: 'drySlotStrength',  scaleId: 'drySlot',    min: 0,    max: 1,     label: 'Dry Slot',       unit: '' },
  { mode: 'DISP_LCL',        key: 'muLcl',            scaleId: 'lcl',        min: 0,    max: 4000,  label: 'LCL',            unit: 'm' },
  { mode: 'DISP_LFC',        key: 'muLfc',            scaleId: 'lfc',        min: 0,    max: 12000, label: 'LFC',            unit: 'm' },
  { mode: 'DISP_EL',         key: 'muEl',             scaleId: 'el',         min: 0,    max: 16000, label: 'EL',             unit: 'm' },
  { mode: 'DISP_FZL',        key: 'freezingAlt',      scaleId: 'fzl',        min: 0,    max: 6000,  label: 'Freezing Level', unit: 'm' },
  { mode: 'DISP_SRH_1KM',    key: 'srh1km',           scaleId: 'srh1km',     min: 0,    max: 350,   label: '0-1km SRH',      unit: 'm²/s²' },
  { mode: 'DISP_SRH_3KM',    key: 'srh3km',           scaleId: 'srh3km',     min: 0,    max: 600,   label: '0-3km SRH',      unit: 'm²/s²' },
  { mode: 'DISP_SHEAR_3KM',  key: 'shear3km',         scaleId: 'shear3km',   min: 0,    max: 40,    label: '0-3km Shear',    unit: 'm/s' },
  { mode: 'DISP_SHEAR_6KM',  key: 'shear6km',         scaleId: 'shear6km',   min: 0,    max: 60,    label: '0-6km Shear',    unit: 'm/s' },
  { mode: 'DISP_SHEAR_8KM',  key: 'shear8km',         scaleId: 'shear8km',   min: 0,    max: 70,    label: '0-8km Shear',    unit: 'm/s' },
  { mode: 'DISP_SRI',        key: 'sriMag',           scaleId: 'sri',        min: 0,    max: 25,    label: 'SRI',            unit: 'm/s' },
  { mode: 'DISP_LAPSE_03',   key: 'lapse03',          scaleId: 'lapse03',    min: 4,    max: 10,    label: 'Lapse 0-3km',    unit: '°C/km' },
  { mode: 'DISP_LAPSE_36',   key: 'lapse36',          scaleId: 'lapse36',    min: 4,    max: 10,    label: 'Lapse 3-6km',    unit: '°C/km' },
  { mode: 'DISP_STP',        key: 'stp',              scaleId: 'stp',        min: 0,    max: 10,    label: 'STP',            unit: '' },
  { mode: 'DISP_VTP',        key: 'vtp',              scaleId: 'vtp',        min: 0,    max: 12,    label: 'VTP',            unit: '' },
  { mode: 'DISP_DCAPE',      key: 'dcape',            scaleId: 'dcape',      min: 0,    max: 3000,  label: 'DCAPE',          unit: 'J/kg' },
  { mode: 'DISP_HAIL',       key: 'estHailIn',        scaleId: 'hail',       min: 0,    max: 4,     label: 'Est. Hail',      unit: 'in' },
  { mode: 'DISP_LIGHTNING',  key: 'lightningFlMin',   scaleId: 'lightning',  min: 0,    max: 40,    label: 'Lightning',      unit: 'fl/min' },
  { mode: 'DISP_LIGHTNING_HOTSPOTS', key: 'lightningHotspotFreq', scaleId: 'lightningHotspots', min: 0, max: 10, label: 'Lightning Frequency (Hotspots)', unit: 'fl/min' },
  { mode: 'DISP_SFC_PRES',   key: 'sfcPress_hPa',     scaleId: 'sfcPres',    min: 900,  max: 1050,  label: 'Sfc Pressure',   unit: 'hPa' },
  { mode: 'DISP_HAZ_PDS_TORNADO', key: 'hazardPdsTornado', scaleId: 'hazardProb', min: 0, max: 100, label: 'PDS Tornado', unit: '%' },
  { mode: 'DISP_HAZ_TORNADO', key: 'hazardTornado', scaleId: 'hazardProb', min: 0, max: 100, label: 'Tornado', unit: '%' },
  { mode: 'DISP_HAZ_SUPERCELL', key: 'hazardSupercell', scaleId: 'hazardProb', min: 0, max: 100, label: 'Supercell', unit: '%' },
  { mode: 'DISP_HAZ_GIANT_HAIL', key: 'hazardGiantHail', scaleId: 'hazardProb', min: 0, max: 100, label: 'Giant Hail', unit: '%' },
  { mode: 'DISP_HAZ_LARGE_HAIL', key: 'hazardLargeHail', scaleId: 'hazardProb', min: 0, max: 100, label: 'Large Hail', unit: '%' },
  { mode: 'DISP_HAZ_HAIL', key: 'hazardHail', scaleId: 'hazardProb', min: 0, max: 100, label: 'Hail', unit: '%' },
  { mode: 'DISP_HAZ_DEST_WINDS', key: 'hazardDestructiveWinds', scaleId: 'hazardProb', min: 0, max: 100, label: 'Destructive Winds', unit: '%' },
  { mode: 'DISP_HAZ_DMG_WINDS', key: 'hazardDamagingWinds', scaleId: 'hazardProb', min: 0, max: 100, label: 'Damaging Winds', unit: '%' },
  { mode: 'DISP_HAZ_FLOODING', key: 'hazardFlooding', scaleId: 'hazardProb', min: 0, max: 100, label: 'Flooding/Heavy Rain', unit: '%' },
  { mode: 'DISP_HAZ_GENERAL_TS', key: 'hazardGeneralThunderstorm', scaleId: 'hazardProb', min: 0, max: 100, label: 'General Thunderstorm', unit: '%' },
  { mode: 'DISP_FIRE_RISK', key: 'fireIndex', scaleId: 'fireRisk', min: 0, max: 80, label: 'Fire Risk', unit: '' },
];

function isSoundingDisplayMode(mode)
{
  return SOUNDING_VIEW_CONFIGS.some(c => c.mode === mode);
}

function getSoundingViewConfig(mode)
{
  return SOUNDING_VIEW_CONFIGS.find(c => c.mode === mode);
}

const DROPLET_VIEW_CONFIGS = [
  { mode: 'DISP_HAIL_SIZE',     scaleId: 'hailSize',     label: 'Hail Size',     unit: 'mm', channel: 0, min: 0, max: 100 },
  { mode: 'DISP_DROPLET_SIZE',  scaleId: 'dropletSize',  label: 'Droplet Size',  unit: 'mm', channel: 1, min: 0, max: 100 },
];

function isDropletSizeDisplayMode(mode)
{
  return DROPLET_VIEW_CONFIGS.some(c => c.mode === mode);
}

function getDropletSizeViewConfig(mode)
{
  return DROPLET_VIEW_CONFIGS.find(c => c.mode === mode);
}

function cloudGateFromDensityJS(originCloud)
{
  return clamp(1.0 - 1.0 / (1.0 + originCloud * 13.0), 0.0, 1.0);
}

function computeColumnLightningHotspot(chargeCol, cloudWaterCol, isFluid, simResY, lightningFlMin)
{
  let surfaceLevel = -1;
  for (let y = 0; y < simResY; y++) {
    if (isFluid[y]) {
      surfaceLevel = y;
      break;
    }
  }
  if (surfaceLevel < 0)
    return {lightningHotspotScore: 0, lightningHotspotFreq: 0, hotspotY: 0};

  let maxScore = 0;
  let hotspotY = surfaceLevel;
  for (let y = surfaceLevel; y < simResY; y++) {
    if (!isFluid[y]) continue;
    const cloud = cloudWaterCol[y];
    const cg = cloudGateFromDensityJS(cloud);
    const score = Math.abs(chargeCol[y]) * cg * (0.45 + cloud * 0.35);
    if (score > maxScore) {
      maxScore = score;
      hotspotY = y;
    }
  }

  let activeFreq = 0;
  if (guiControls.enableCloudLightning) activeFreq += guiControls.cloudLightningFrequency;
  if (guiControls.enableCloudFlash) activeFreq += guiControls.cloudFlashFrequency;
  if (guiControls.enableStrobeLightning) activeFreq += guiControls.strobeLightningFrequency;
  if (guiControls.enableCloudGroundLightning) activeFreq += guiControls.cloudGroundLightningFrequency;

  const hotspotNorm = clamp(maxScore / 0.45, 0, 1.5);
  const physicsFlMin = maxScore * activeFreq * 0.08;
  const soundingFlMin = lightningFlMin * hotspotNorm;
  const lightningHotspotFreq = Math.max(physicsFlMin, soundingFlMin);

  return {lightningHotspotScore: maxScore, lightningHotspotFreq, hotspotY};
}


// Global Classes:

class Vec2D // simple 2D vector
{
  x;
  y;
  constructor(x = 0, y = 0)
  {
    this.x = x;
    this.y = y;
  }
  static fromAngle(angle, mag) // create vector from angle and optional magnitude
  {
    if (mag == null)
      mag = 1.0;
    let x = -Math.cos(angle) * mag;
    let y = Math.sin(angle) * mag;
    return new Vec2D(x, y);
  }

  copy() { return new Vec2D(this.x, this.y); }
  add(other)
  {
    this.x += other.x;
    this.y += other.y;
    return this;
  }
  subtract(other)
  {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }
  mult(mult)
  {
    this.x *= mult;
    this.y *= mult;
    return this;
  }
  div(div)
  {
    this.x /= div;
    this.y /= div;
    return this;
  }

  rotate(angle) // rotate vector
  {
    let newX = Math.sin(angle) * this.y + Math.cos(angle) * this.x;
    this.y = Math.cos(angle) * this.y - Math.sin(angle) * this.x;
    this.x = newX;
    return this;
  }

  mag() { return Math.sqrt(this.x * this.x + this.y * this.y); } // get magnitude of vector

  magSq() { return this.x * this.x + this.y * this.y; }          // square of magnitude

  angle()                                                        // get angle of vector
  {
    return Math.atan(this.y / -this.x);
  }
}

class FBO // wraps texture, frambuffer and info in one
{
  width;
  height;
  texelSizeX;
  texelSizeY;
  texture;
  frameBuffer;

  constructor(w, h, internalFormat, format, type, texFilter, wrapMode_S)
  {
    this.width = w;
    this.height = h;
    gl.activeTexture(gl.TEXTURE0);
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texFilter);

    if (!wrapMode_S)
      wrapMode_S = gl.CLAMP_TO_EDGE;

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode_S);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    this.frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.texelSizeX = 1.0 / this.width;
    this.texelSizeY = 1.0 / this.height;
  }
}

function getHdrRenderDimensions()
{
  return {
    w: Math.max(2, Math.round(canvas.width * hdrRenderScaleState)),
    h: Math.max(2, Math.round(canvas.height * hdrRenderScaleState))
  };
}

function createHdrFBO()
{
  const dim = getHdrRenderDimensions();
  hdrFBO = new FBO(dim.w, dim.h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
}

function createBloomFBOs()
{
  const dim = getHdrRenderDimensions();
  let res = new Vec2D(dim.w, dim.h);

  bloomFBOs.length = 0;           // empty array
  for (let i = 0; i < 100; i++) { // max bloom iterations
    let width = res.x >> i;       // right shift to devide by 2 multiple times
    let height = res.y >> i;

    //  console.log('BloomFBO', i, width, height)

    if (width < 2 || height < 2)
      break; // stop when texture resolution is 2 x 2

    let fbo = new FBO(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    bloomFBOs.push(fbo);
  }
}


function createAmbientLightFBOs()
{
  emittedLightFBO = new FBO(sim_res_x, sim_res_y, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);

  let res = new Vec2D(sim_res_x, sim_res_y);

  // console.log('createAmbientLightFBOs');

  ambientLightFBOs.length = 0;   // empty array
  for (let i = 0; i < 80; i++) { // max iterations
    let width = res.x >> i;      // right shift to devide by 2 multiple times
    let height = res.y >> i;

    if (width < 2 || height < 2)
      break; // stop when texture width or height is <= 2

    let fbo = new FBO(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, gl.REPEAT);
    ambientLightFBOs.push(fbo);
  }
}

class Weatherstation
{
  #width = 120; // 100 display size
  #height = 70; // 55
  #mainDiv;
  #canvas;
  #c; // 2d canvas context
  #x; // position in simulation
  #y;

  #isOnLand = false;
  #isOnWater = false;

  #time;             // ISO time string of moment of last measurement
  #temperature = 0;  // °C
  #dewpoint = 0;     // °C
  #relativeHumd = 0; // %
  #velocity = 0;     // ms
  #soilMoisture = 0; // mm
  #snowHeight = 0;   // cm
  #airQuality = 0;   // AQI
  #waterTemperature = 0;
  

  #netIRpow = 0;
  #solarPower = 0;

  #predictedWeather = 'sunny'; // sunny, partly_cloudy, cloudy, rainy, thunderstorms

  #weatherIconDiv;

  #chartCanvas;
  #historyChart;

  #displaySunAndIRPower;


  constructor(xIn, yIn)
  {
    this.#x = Math.floor(xIn);
    this.#y = Math.floor(yIn);
    this.#mainDiv = document.createElement('div');
    this.#canvas = document.createElement('canvas');
    this.#mainDiv.appendChild(this.#canvas);
    document.body.appendChild(this.#mainDiv);
    this.#canvas.height = this.#height;
    this.#canvas.width = this.#width;

    this.#mainDiv.style.position = 'absolute';
    this.#mainDiv.style.width = '0px';
    this.#mainDiv.style.height = '0px';

    this.#c = this.#canvas.getContext('2d');

    this.#canvas.style.position = 'absolute';
    this.#canvas.style.zIndex = 1; // z-index

    this.#displaySunAndIRPower = false;

    // Create weather icon div
    this.#weatherIconDiv = document.createElement('div');
    this.#weatherIconDiv.style.position = 'absolute';
    this.#weatherIconDiv.style.fontSize = '32px';
    this.#weatherIconDiv.style.zIndex = 2;
    this.#weatherIconDiv.style.pointerEvents = 'none';
    this.#weatherIconDiv.textContent = '☀️';
    document.body.appendChild(this.#weatherIconDiv);

    let thisObj = this;
    this.#canvas.addEventListener('mousedown', function(event) {
      if (event.button == 0) {     // left mouse button
        if (guiControls.tool == 'TOOL_STATION') {
          thisObj.destroy();       // remove weather station
          event.stopPropagation(); // prevent mousedown on body from firing
        } else {
          if (guiControls.dayNightCycle == true) {
            thisObj.#chartCanvas.style.display = (thisObj.#chartCanvas.style.display == 'none') ? 'block' : 'none'; // toggle visibility of chart canvas
          }
        }
      } else if (event.button == 2) {                                   // right mouse button
        thisObj.#displaySunAndIRPower = !thisObj.#displaySunAndIRPower; // toggle display of radiation flux
      }
    });

    this.#canvas.addEventListener('contextmenu', function(event) { event.preventDefault(); }); // Prevent the browser's context menu from appearing

    this.createChartJSCanvas();
  }

  createChartJSCanvas()
  {
    this.#chartCanvas = document.createElement('canvas');

    this.#mainDiv.appendChild(this.#chartCanvas);

    const ctx = this.#chartCanvas.getContext('2d');

    this.#chartCanvas.height = 400;
    this.#chartCanvas.width = 500;

    let style = this.#chartCanvas.style;

    style.marginTop = '100px';

    style.position = 'relative';

    style.left = '-200px';

    style.display = 'none'; // hide initially


    this.#historyChart = new Chart(ctx, {
      type : 'line',
      data : {
        labels : [], // Time-based labels
        datasets : [
          {
            label : 'Temperature',
            data : [],
            backgroundColor : 'rgba(255, 0, 0, 0.9)',
            borderColor : 'rgba(255, 0, 0, 1)',
            radius : 0,
            borderWidth : 1,
            fill : false,
          },
          {
            label : 'Dew Point',
            data : [],
            backgroundColor : '#00FFFF',
            borderColor : '#00FFFF',
            radius : 0,
            borderWidth : 1,
            fill : false,
          },
          {label : 'Wind Speed', data : [], backgroundColor : '#AAAAAA', borderColor : '#AAAAAA', radius : 0, borderWidth : 1, fill : false, hidden : true},                            //
          {label : 'Air Quality', data : [], backgroundColor : '#803c00', borderColor : '#803c00', radius : 0, borderWidth : 1, fill : false, hidden : true},                           //
          {label : 'Precipitation', data : [], backgroundColor : '#0055FF', borderColor : '#0055FF', radius : 0, borderWidth : 1, fill : false, hidden : true, reallyHidden : true},    //
          {label : 'Snow Height', data : [], backgroundColor : '#FFFFFF', borderColor : '#FFFFFF', radius : 0, borderWidth : 1, fill : false, hidden : true, reallyHidden : true},      //
          {label : 'Water Temperature', data : [], backgroundColor : '#406cff', borderColor : '#406cff', radius : 0, borderWidth : 1, fill : false, hidden : true, reallyHidden : true} //
        ]
      },
      options : {
        scales : {
          x : {
            type : 'time', // Set the x-axis to use a time scale
            time : {unit : 'minute', tooltipFormat : 'HH:mm'},
            title : {
              display : true,
              color : 'white' // Make sure title color is white
            },
            ticks : {
              color : 'white' // White color for the x-axis labels
            },
            grid : {
              color : 'rgba(255, 255, 255, 0.2)' // Optional: light white for grid lines
            }
          },
          y : {
            beginAtZero : false, // Start the y-axis at 0
            ticks : {
              color : 'white'    // White color for the y-axis labels
            },
            title : {
              display : true,
              color : 'white' // Make sure title color is white
            },
            grid : {
              color : 'rgba(255, 255, 255, 0.2)' // Optional: light white for grid lines
            }
          }
        },
        plugins : {
          legend : {
            display : true,
            labels : {
              color : 'white', // White color for legend text
              font : {
                size : 14,
                family : 'Arial' // Optional: Ensure font family is set
              },
              filter : function(item, chart) { return !chart.datasets[item.datasetIndex].reallyHidden; }
            }
          }
        },
        responsive : false, // Auto rescale on canvas resize
        maintainAspectRatio : false,
        animation : false,  // Disables all animations
        normalized : true
        // parsing : false
      }
    });
  }

  updateChartJS() // add newest measurement to chart
  {
    if (this.#historyChart) {
      this.#historyChart.data.datasets[0].data.push(convertTempToSelectedUnit(this.#temperature));
      this.#historyChart.data.datasets[1].data.push(convertTempToSelectedUnit(this.#dewpoint));
      this.#historyChart.data.datasets[2].data.push(convertVelocityToSelectedUnit(this.#velocity));
      this.#historyChart.data.datasets[3].data.push(this.#airQuality);

      if (this.#isOnLand) {
        this.#historyChart.data.datasets[4].data.push(guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL' ? mmToIn(this.#soilMoisture) : this.#soilMoisture);
        this.#historyChart.data.datasets[5].data.push(guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL' ? mmToIn(this.#snowHeight) : this.#snowHeight);
      } else if (this.#isOnWater) {
        this.#historyChart.data.datasets[6].data.push(convertTempToSelectedUnit(this.#waterTemperature));
      }

      this.#historyChart.data.labels.push(this.#time);

      if (this.#historyChart.data.labels.length > 60 * 24) { // max 24 hour history. Remove the oldest data and label
        this.#historyChart.data.labels.shift();
        this.#historyChart.data.datasets.forEach(dataSet => { dataSet.data.shift(); });
      }

      if (guiControls.dayNightCycle == true) {
        if (this.#chartCanvas.style.display != 'none') // only update if visible
          this.#historyChart.update();
      } else {
        this.#chartCanvas.style.display = 'none';
      }
    }
  }

  clearChart()
  {
    this.#historyChart.data.datasets.forEach(dataSet => { dataSet.data = []; });
    this.#historyChart.data.labels = [];
    this.#historyChart.update();
  }

  destroy()
  {
    this.#chartCanvas.remove();
    this.#canvas.parentElement.removeChild(this.#canvas); // remove canvas element
    this.#weatherIconDiv.remove(); // remove weather icon div
    let index = weatherStations.indexOf(this);
    weatherStations.splice(index, 1);                     // remove object from array
  }

  measure()
  {
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // basetexture
    var baseTextureValues = new Float32Array(4 * 3);
    gl.readPixels(this.#x, this.#y - 1, 1, 3, gl.RGBA, gl.FLOAT, baseTextureValues);

    let T = potentialToRealT(baseTextureValues[1 * 4 + 3], this.#y); // temperature in kelvin

    this.#temperature = KtoC(T);
    this.#velocity = rawVelocityTo_ms(Math.sqrt(Math.pow(baseTextureValues[2 * 4 + 0], 2) + Math.pow(baseTextureValues[4 + 1], 2)));

    // gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
    var waterTextureValues = new Float32Array(2 * 4);
    gl.readPixels(this.#x, this.#y - 1, 1, 2, gl.RGBA, gl.FLOAT, waterTextureValues);

    if (waterTextureValues[4 + 0] > 1000.) { // is not air
      this.destroy();                        // remove weather station
      return;
    }

    if (waterTextureValues[0 + 0] > 1001.5) { // water wall
      this.#waterTemperature = KtoC(baseTextureValues[0 + 3]);
    } else {
      this.#waterTemperature = -100.;
    }

    this.#dewpoint = KtoC(dewpoint(waterTextureValues[4 + 0]));

    if (guiControls.realDewPoint) {
      this.#dewpoint = Math.min(this.#temperature, this.#dewpoint);
    }

    this.#relativeHumd = relativeHumd(T, waterTextureValues[4 + 0]);

    if (guiControls.realDewPoint) {
      this.#relativeHumd = Math.min(this.#relativeHumd, 100.0);
    }


    if (waterTextureValues[0] > 1000.5 && waterTextureValues[0] < 1001.5) { // on land surface
      this.#soilMoisture = waterTextureValues[2];
      this.#snowHeight = waterTextureValues[3];

      if (!this.#isOnLand) {
        this.clearChart();
        this.#isOnLand = true;
        this.#isOnWater = false;
        this.#historyChart.data.datasets[4].reallyHidden = false;
        this.#historyChart.data.datasets[5].reallyHidden = false;
        this.#historyChart.data.datasets[6].reallyHidden = true;
      }

    } else if (waterTextureValues[0] > 1001.5) { // on water surface
      if (!this.#isOnWater) {
        this.clearChart();
        this.#isOnWater = true;
        this.#isOnLand = false;
        this.#historyChart.data.datasets[4].reallyHidden = true;
        this.#historyChart.data.datasets[5].reallyHidden = true;
        this.#historyChart.data.datasets[6].reallyHidden = false;
      }
    } else { // in air
      if (this.#isOnLand || this.#isOnWater) {
        this.clearChart();
        this.#isOnLand = false;
        this.#isOnWater = false;
        this.#soilMoisture = 0;
        this.#snowHeight = 0;
        this.#waterTemperature = -10.0;
        this.#historyChart.data.datasets[4].reallyHidden = true;
        this.#historyChart.data.datasets[5].reallyHidden = true;
        this.#historyChart.data.datasets[6].reallyHidden = true;
      }
    }


    this.#airQuality = waterTextureValues[4 + 3] * 300.0; // read smoke

    gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // light texture
    var lightTextureValues = new Float32Array(4);
    gl.readPixels(this.#x, this.#y, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues);

    this.#netIRpow = lightTextureValues[2] - lightTextureValues[3]; // IR_DOWN - IR_UP
    // this.#netIRpow = lightTextureValues[1] / 0.000002; // or calculate from NET_HEATING

    let directSunlight = Math.max(lightTextureValues[0] * Math.sin(guiControls.sunAngle * degToRad), 0.0);

    this.#solarPower = directSunlight;

    this.#time = simDateTime.toISOString();
    this.#predictWeather();
    this.updateChartJS(); // update chart
  }

  #predictWeather()
  {
    // Weather prediction based on sensor readings
    // Factors: relative humidity, temperature, solar power, dew point, wind speed, air quality, soil moisture (rainfall), snow height, net IR power

    const rh = this.#relativeHumd;
    const temp = this.#temperature;
    const solar = this.#solarPower;
    const dewpoint = this.#dewpoint;
    const wind = this.#velocity;
    const airQuality = this.#airQuality;
    const soilMoisture = this.#soilMoisture;
    const snowHeight = this.#snowHeight;
    const netIR = this.#netIRpow;

    // Calculate dew point depression (temp - dewpoint)
    const dewPointDepression = temp - dewpoint;

    // Thunderstorm conditions: high humidity, high wind, high air quality (smoke), unstable conditions
    if (rh > 75 && wind > 8 && airQuality > 50 && dewPointDepression < 5) {
      this.#predictedWeather = 'thunderstorms';
    }
    // Rainy conditions: high humidity, significant soil moisture (rainfall), but only if solar is low (not sunny)
    else if (soilMoisture > 0.5 && rh > 65 && solar < 100) {
      this.#predictedWeather = 'rainy';
    }
    // Sunny: prioritize high solar power, even with moderate humidity (lowered threshold)
    else if (solar > 200) {
      this.#predictedWeather = 'sunny';
    }
    // Partly cloudy: moderate solar power (lowered threshold)
    else if (solar > 100) {
      this.#predictedWeather = 'partly_cloudy';
    }
    // Cloudy conditions: high humidity, low solar power, no significant precipitation
    else if (rh > 60 && soilMoisture < 0.5) {
      this.#predictedWeather = 'cloudy';
    }
    // Rainy conditions with low solar power
    else if (soilMoisture > 0.5 && rh > 60) {
      this.#predictedWeather = 'rainy';
    }
    // Default fallback based on humidity
    else if (rh > 60) {
      this.#predictedWeather = 'cloudy';
    } else if (rh > 40) {
      this.#predictedWeather = 'partly_cloudy';
    } else {
      this.#predictedWeather = 'sunny';
    }
  }

  #getWeatherIcon()
  {
    switch(this.#predictedWeather) {
      case 'sunny':
        return '☀️';
      case 'partly_cloudy':
        return '⛅';
      case 'cloudy':
        return '☁️';
      case 'rainy':
        return '🌧️';
      case 'thunderstorms':
        return '⛈️';
      default:
        return '☀️';
    }
  }

  getXpos() { return this.#x; }

  getYpos() { return this.#y; }

  setHidden(hidden)
  {
    this.#mainDiv.style.display = hidden ? 'none' : 'block';
    this.#weatherIconDiv.style.display = hidden ? 'none' : 'block';
    this.#chartCanvas.style.display = 'none'; // hide charts
  }

  updateCanvas()
  {
    let screenX = simToScreenX(this.#x) - this.#width / 2;
    let screenY = simToScreenY(this.#y) - this.#height;

    // if (screenX > 0 && screenX < canvas.width && screenY > 0 && screenY < canvas.height) {
    this.#mainDiv.style.left = screenX + 'px';
    this.#mainDiv.style.top = screenY + 'px';
    // this.#canvas.style.left = screenX + 'px';
    // this.#canvas.style.top = screenY + 'px';
    let c = this.#c;
    c.clearRect(0, 0, this.#width, this.#height);
    c.fillStyle = '#00000000';
    c.fillRect(0, 0, this.#width, this.#height);

    // Update weather icon div position (above the station)
    this.#weatherIconDiv.style.left = (screenX + this.#width / 2 - 16) + 'px'; // Center the icon
    this.#weatherIconDiv.style.top = (screenY - 40) + 'px'; // Position 40px above the station
    
    // Add wind icon if wind speed is above 20 knots (10.29 m/s)
    let iconText = this.#getWeatherIcon();
    if (this.#velocity > 10.29) { // 20 knots = 10.29 m/s
      iconText += ' 💨';
    }
    this.#weatherIconDiv.textContent = iconText;

    // temperature
    c.font = '15px Arial';
    c.fillStyle = '#FFFFFF';
    c.fillText(printTemp(this.#temperature), 30, 15);

    if (this.#displaySunAndIRPower) {
      c.font = '12px Arial';
      c.fillStyle = '#00FFFF';
      c.fillText(this.#relativeHumd.toFixed(1) + ' %', 30, 28);

      c.fillStyle = '#FFFFFF';
      c.fillText('🔅 ' + this.#solarPower.toFixed(1) + 'W/m2', 10, 40);
      c.fillStyle = '#FFFFFF';
      c.fillText('♨️' + this.#netIRpow.toFixed(1) + 'W/m2', 10, 55);
    } else {
      c.font = '12px Arial';
      c.fillStyle = '#00FFFF';
      c.fillText(printTemp(this.#dewpoint), 30, 28);

      c.fillStyle = '#FFFFFF';
      c.fillText(printVelocity(this.#velocity), 20, 40);

      if (this.#soilMoisture > 0.) {
        c.fillText(printSoilMoisture(this.#soilMoisture), 0, 52);
        c.fillText('💧', 20, 65);
      } else if (this.#waterTemperature > -1.0) {
        c.fillStyle = '#406cff';
        c.fillText(printTemp(this.#waterTemperature), 0, 52);
        c.fillText('🌊 🌡', 20, 65);
      }

      if (this.#snowHeight > 0.) {
        c.fillText(printSnowHeight(this.#snowHeight), 67, 52);
        c.font = '14px Arial';
        c.fillText('❄', 85, 65);
      }
    }


    // Position pointer
    c.beginPath();
    c.moveTo(this.#width / 2, this.#height * 0.80);
    c.lineTo(this.#width / 2, this.#height);
    c.strokeStyle = 'white';
    c.stroke();
    //  }
  }
}


class Radar
{
  #width = 80;
  #height = 90;
  #mainDiv;
  #canvas;
  #c; // 2d canvas context
  #x; // position in simulation
  #y;

  #name = 'Radar';
  #product = 'reflectivity';
  #range = 1000;
  #resolution = 100.0;
  #sensitivity = 1.0; // 0.0 to 10.0 (0% to 1000%)
  #productSelect = null;
  #hdrTextEl = null;
  #enabledToggle = null;
  #toggleTrack = null;
  #toggleKnob = null;
  #rangeSlider = null;
  #rangeValBadge = null;
  #resSlider = null;
  #resValBadge = null;
  #sensSlider = null;
  #sensValBadge = null;
  #updateFrequency = 60; // iterations between updates
  #lastUpdateIteration = -1; // last iteration when radar was updated
  #cacheFBO = null; // framebuffer to cache radar display
  #enabled = false;
  #menuDiv;
  #selectBtn;
  #menuSelectBtn;

  constructor(xIn, yIn)
  {
    this.#x = Math.floor(xIn);
    this.#y = Math.floor(yIn);
    this.#mainDiv = document.createElement('div');
    this.#canvas = document.createElement('canvas');
    this.#mainDiv.appendChild(this.#canvas);
    document.body.appendChild(this.#mainDiv);
    this.#canvas.height = this.#height;
    this.#canvas.width = this.#width;

    this.#mainDiv.style.position = 'absolute';
    this.#mainDiv.style.width = '0px';
    this.#mainDiv.style.height = '0px';

    this.#c = this.#canvas.getContext('2d');

    this.#canvas.style.position = 'absolute';
    this.#canvas.style.zIndex = 1;

    let thisObj = this;
    this.#canvas.addEventListener('mousedown', function(event) {
      if (event.button == 0) { // left mouse button
        if (guiControls.tool == 'TOOL_RADAR') {
          thisObj.destroy();
          event.stopPropagation();
        } else {
          thisObj.toggleMenu();
        }
      }
    });

    this.#canvas.addEventListener('contextmenu', function(event) { event.preventDefault(); });

    this.createMenu();

    // Select button below icon — only visible when disabled
    this.#selectBtn = document.createElement('button');
    this.#selectBtn.textContent = 'Select';
    this.#selectBtn.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:' + (this.#height - 22) + 'px;font-size:13px;font-weight:bold;padding:4px 14px;cursor:pointer;background:#1a1a2e;color:#4a90e2;border:2px solid #4a90e2;border-radius:5px;white-space:nowrap;z-index:2;';
    let thisObj2 = this;
    this.#selectBtn.addEventListener('click', function(event) {
      event.stopPropagation();
      thisObj.activateAsPrimaryRadar();
    });
    this.#mainDiv.appendChild(this.#selectBtn);
    this.#selectBtn.style.display = this.#enabled ? 'none' : 'block';

    // Initialize cache FBO (will be created when GL context is ready)
    this.#cacheFBO = null;
  }

  initCacheFBO()
  {
    if (this.#cacheFBO) return; // Already initialized
    this.#cacheFBO = new FBO(sim_res_x, sim_res_y, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  }

  createMenu()
  {
    this.#menuDiv = document.createElement('div');
    this.#menuDiv.style.cssText = `
      position: absolute;
      display: none;
      z-index: 1000;
      background: #13131f;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 0;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 13px;
      min-width: 266px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.75);
      overflow: hidden;
    `;

    let thisObj = this;

    // Header bar
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:linear-gradient(135deg,#191930,#0e0e22);border-bottom:1px solid #252540;cursor:move;user-select:none;gap:8px;';

    let dragOffX = 0, dragOffY = 0, dragging = false;
    hdr.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      dragging = true;
      dragOffX = e.clientX - thisObj.#menuDiv.getBoundingClientRect().left;
      dragOffY = e.clientY - thisObj.#menuDiv.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      thisObj.#menuDiv.style.left = (e.clientX - dragOffX) + 'px';
      thisObj.#menuDiv.style.top  = (e.clientY - dragOffY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    const hdrTitle = document.createElement('span');
    hdrTitle.style.cssText = 'font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;flex:1;min-width:0;';
    hdrTitle.innerHTML = '<span style="flex-shrink:0">📡</span>';
    const hdrText = document.createElement('span');
    hdrText.textContent = this.#name;
    hdrText.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    hdrTitle.appendChild(hdrText);
    this.#hdrTextEl = hdrText;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&#x2715;';
    closeBtn.style.cssText = 'background:rgba(255,255,255,0.07);border:none;color:#777;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;';
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.background='rgba(220,60,60,0.35)'; closeBtn.style.color='#fff'; });
    closeBtn.addEventListener('mouseout',  () => { closeBtn.style.background='rgba(255,255,255,0.07)'; closeBtn.style.color='#777'; });
    closeBtn.addEventListener('click', () => { thisObj.#menuDiv.style.display = 'none'; });
    hdr.appendChild(hdrTitle);
    hdr.appendChild(closeBtn);
    this.#menuDiv.appendChild(hdr);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:14px 15px 16px;';

    // Helper: section label
    const mkSectionLabel = (text) => {
      const l = document.createElement('div');
      l.textContent = text;
      l.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:6px;margin-top:14px;';
      return l;
    };

    // Helper: styled select
    const mkSelect = (optList, currentVal, onChange) => {
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;box-sizing:border-box;background:#0b0b17;border:1px solid #252540;border-radius:6px;color:#d0d0e0;padding:7px 10px;font-size:12px;cursor:pointer;outline:none;';
      optList.forEach(({value, text}) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        if (value === currentVal) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function() { onChange(this.value); });
      return sel;
    };

    const mkSliderGroup = (text, initVal, unit, min, max, step, onChange) => {
      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;margin-top:13px;';
      const lb = document.createElement('span');
      lb.textContent = text;
      lb.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;';
      const badge = document.createElement('span');
      badge.textContent = initVal + unit;
      badge.style.cssText = 'color:#4a90e2;font-size:11px;font-weight:700;background:rgba(74,144,226,0.13);padding:1px 8px;border-radius:10px;';
      hd.appendChild(lb);
      hd.appendChild(badge);
      const sl = document.createElement('input');
      sl.type = 'range';
      sl.min = min; sl.max = max; sl.step = step;
      sl.value = initVal;
      sl.style.cssText = 'width:100%;accent-color:#4a90e2;cursor:pointer;margin-top:2px;';
      sl.addEventListener('input', function() {
        badge.textContent = onChange(this.value) + unit;
      });
      return { hd, sl, badge };
    };

    // Helper: divider line
    const mkDivider = () => {
      const d = document.createElement('div');
      d.style.cssText = 'border-top:1px solid #1c1c30;margin:10px -15px;';
      return d;
    };

    // ── Product ─────────────────────────────────────────────────────
    body.appendChild(mkSectionLabel('Product'));
    const productSelect = document.createElement('select');
    productSelect.style.cssText = 'width:100%;box-sizing:border-box;background:#0b0b17;border:1px solid #252540;border-radius:6px;color:#d0d0e0;padding:7px 10px;font-size:12px;cursor:pointer;outline:none;';
    const { categories, groups } = buildRadarProductSelectOptions();
    for (const cat of categories) {
      const og = document.createElement('optgroup');
      og.label = cat;
      for (const prod of groups[cat]) {
        const opt = document.createElement('option');
        opt.value = prod.id;
        opt.textContent = prod.name;
        opt.title = prod.desc;
        if (prod.id === thisObj.#product)
          opt.selected = true;
        og.appendChild(opt);
      }
      productSelect.appendChild(og);
    }
    productSelect.addEventListener('change', function() {
      thisObj.setProduct(this.value);
      const meta = getRadarProductMeta(this.value);
      if (meta.desc) productSelect.title = meta.desc;
    });
    productSelect.title = getRadarProductMeta(this.#product).desc || '';
    this.#productSelect = productSelect;
    body.appendChild(productSelect);
    body.appendChild(mkDivider());

    // ── Radar Type Preset ────────────────────────────────────────────
    body.appendChild(mkSectionLabel('Radar Type Preset'));
    const presets = [
      { value: 'custom', name: 'Custom',                            range: 1000, resolution: 100.0, sensitivity: 1.0 },
      { value: 'L',      name: 'L-Band (1-2 GHz) — Long Range',    range: 8000, resolution: 20.0,  sensitivity: 0.6 },
      { value: 'S',      name: 'S-Band (2-4 GHz) — Weather',       range: 6000, resolution: 35.0,  sensitivity: 0.8 },
      { value: 'C',      name: 'C-Band (4-8 GHz) — General',       range: 4000, resolution: 55.0,  sensitivity: 1.0 },
      { value: 'X',      name: 'X-Band (8-12 GHz) — High Res',     range: 2000, resolution: 80.0,  sensitivity: 1.3 },
      { value: 'Ku',     name: 'Ku-Band (12-18 GHz) — Very High',  range: 800,  resolution: 150.0, sensitivity: 1.6 },
      { value: 'Ka',     name: 'Ka-Band (27-40 GHz) — Extreme',    range: 400,  resolution: 250.0, sensitivity: 2.0 }
    ];
    const presetSelect = mkSelect(
      presets.map(p => ({value:p.value, text:p.name})),
      'custom',
      (v) => {
        const preset = presets.find(p => p.value === v);
        if (preset && preset.value !== 'custom') {
          thisObj.#range = preset.range;
          thisObj.#resolution = preset.resolution;
          thisObj.#sensitivity = preset.sensitivity;
          thisObj.#rangeSlider.value = preset.range;
          thisObj.#rangeValBadge.textContent = preset.range + ' km';
          thisObj.#resSlider.value = preset.resolution;
          thisObj.#resValBadge.textContent = preset.resolution.toFixed(1) + 'x';
          thisObj.#sensSlider.value = preset.sensitivity * 100;
          thisObj.#sensValBadge.textContent = Math.round(preset.sensitivity * 100) + '%';
        }
      }
    );
    body.appendChild(presetSelect);
    body.appendChild(mkDivider());

    // ── Parameters ───────────────────────────────────────────────────
    body.appendChild(mkSectionLabel('Parameters'));

    const { hd: rangeHd, sl: _rs, badge: _rb } = mkSliderGroup(
      'Range', this.#range, ' km', 10, 10000, 1,
      (v) => { thisObj.#range = parseInt(v); return parseInt(v); }
    );
    this.#rangeSlider = _rs; this.#rangeValBadge = _rb;
    body.appendChild(rangeHd); body.appendChild(this.#rangeSlider);

    const { hd: resHd, sl: _rss, badge: _rsb } = mkSliderGroup(
      'Resolution', this.#resolution.toFixed(1), 'x', 0.3, 100.0, 0.1,
      (v) => { thisObj.#resolution = parseFloat(v); return parseFloat(v).toFixed(1); }
    );
    this.#resSlider = _rss; this.#resValBadge = _rsb;
    body.appendChild(resHd); body.appendChild(this.#resSlider);

    const { hd: sensHd, sl: _ss, badge: _sb } = mkSliderGroup(
      'Sensitivity', Math.round(thisObj.#sensitivity * 100), '%', 0, 1000, 1,
      (v) => { thisObj.#sensitivity = parseInt(v) / 100; return Math.round(parseInt(v)); }
    );
    this.#sensSlider = _ss; this.#sensValBadge = _sb;
    body.appendChild(sensHd); body.appendChild(this.#sensSlider);
    body.appendChild(mkDivider());

    // ── Enabled toggle switch ────────────────────────────────────────
    const enabledRow = document.createElement('div');
    enabledRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:13px;';
    const enabledLbl = document.createElement('span');
    enabledLbl.textContent = 'Enabled';
    enabledLbl.style.cssText = 'color:#aaa;font-size:12px;';

    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;';
    const enabledToggle = document.createElement('input');
    enabledToggle.type = 'checkbox';
    enabledToggle.checked = this.#enabled;
    enabledToggle.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    const isOn = this.#enabled;
    const toggleTrack = document.createElement('span');
    toggleTrack.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:${isOn ? '#3a7ad4' : '#252540'};border-radius:24px;transition:background 0.2s;`;
    const toggleKnob = document.createElement('span');
    toggleKnob.style.cssText = `position:absolute;height:18px;width:18px;left:${isOn ? '23px' : '3px'};bottom:3px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.5);`;
    toggleTrack.appendChild(toggleKnob);
    toggleLabel.appendChild(enabledToggle);
    toggleLabel.appendChild(toggleTrack);

    this.#enabledToggle = enabledToggle;
    this.#toggleTrack = toggleTrack;
    this.#toggleKnob = toggleKnob;

    enabledToggle.addEventListener('change', function() {
      if (this.checked)
        thisObj.activateAsPrimaryRadar();
      else
        thisObj.setEnabled(false);
      toggleTrack.style.background = this.checked ? '#3a7ad4' : '#252540';
      toggleKnob.style.left = this.checked ? '23px' : '3px';
    });

    enabledRow.appendChild(enabledLbl);
    enabledRow.appendChild(toggleLabel);
    body.appendChild(enabledRow);

    // ── Select button ────────────────────────────────────────────────
    this.#menuSelectBtn = document.createElement('button');
    this.#menuSelectBtn.textContent = 'Select This Radar';
    this.#menuSelectBtn.style.cssText = 'width:100%;padding:9px;cursor:pointer;background:linear-gradient(135deg,#1a5535,#1e7045);color:#b0f0c8;border:1px solid #2a9050;border-radius:7px;font-size:13px;font-weight:700;transition:filter 0.15s;';
    this.#menuSelectBtn.addEventListener('mouseover', () => { thisObj.#menuSelectBtn.style.filter='brightness(1.2)'; });
    this.#menuSelectBtn.addEventListener('mouseout',  () => { thisObj.#menuSelectBtn.style.filter='brightness(1)'; });
    this.#menuSelectBtn.addEventListener('click', function(event) {
      event.stopPropagation();
      thisObj.activateAsPrimaryRadar();
    });
    body.appendChild(this.#menuSelectBtn);

    this.#menuDiv.appendChild(body);
    document.body.appendChild(this.#menuDiv);
  }

  static closeAllMenusExcept(exceptRadar)
  {
    for (let i = 0; i < radars.length; i++) {
      if (radars[i] !== exceptRadar)
        radars[i].closeMenu();
    }
  }

  getMenuDiv() { return this.#menuDiv; }

  closeMenu()
  {
    this.#menuDiv.style.display = 'none';
  }

  getRadarIndex()
  {
    return radars.indexOf(this);
  }

  activateAsPrimaryRadar()
  {
    radars.forEach(r => r.setEnabled(false));
    this.setEnabled(true);
    const idx = this.getRadarIndex();
    if (idx >= 0) {
      guiControls.radarOverlaySource = 'radar_' + idx;
      refreshRadarOverlaySourceDropdown();
    }
  }

  syncMenuToState()
  {
    if (this.#productSelect)
      this.#productSelect.value = this.#product;
    if (this.#enabledToggle) {
      this.#enabledToggle.checked = this.#enabled;
      if (this.#toggleTrack)
        this.#toggleTrack.style.background = this.#enabled ? '#3a7ad4' : '#252540';
      if (this.#toggleKnob)
        this.#toggleKnob.style.left = this.#enabled ? '23px' : '3px';
    }
    if (this.#menuSelectBtn)
      this.#menuSelectBtn.style.display = this.#enabled ? 'none' : 'block';
    if (this.#rangeSlider) {
      this.#rangeSlider.value = this.#range;
      if (this.#rangeValBadge) this.#rangeValBadge.textContent = this.#range + ' km';
    }
    if (this.#resSlider) {
      this.#resSlider.value = this.#resolution;
      if (this.#resValBadge) this.#resValBadge.textContent = this.#resolution.toFixed(1) + 'x';
    }
    if (this.#sensSlider) {
      this.#sensSlider.value = Math.round(this.#sensitivity * 100);
      if (this.#sensValBadge) this.#sensValBadge.textContent = Math.round(this.#sensitivity * 100) + '%';
    }
  }

  toggleMenu(forceOpen)
  {
    const opening = forceOpen || this.#menuDiv.style.display === 'none';
    if (!opening) {
      this.closeMenu();
      return;
    }
    Radar.closeAllMenusExcept(this);
    this.syncMenuToState();
    const screenX = simToScreenX(this.#x);
    const screenY = simToScreenY(this.#y);
    this.#menuDiv.style.left = screenX + 'px';
    this.#menuDiv.style.top = (screenY - 200) + 'px';
    this.#menuDiv.style.display = 'block';
  }

  destroy()
  {
    this.#menuDiv.remove();
    this.#selectBtn.remove();
    this.#canvas.parentElement.removeChild(this.#canvas);
    this.#mainDiv.remove();
    let index = radars.indexOf(this);
    radars.splice(index, 1);
    if (guiControls.radarOverlaySource === 'radar_' + index
        || (guiControls.radarOverlaySource && guiControls.radarOverlaySource.startsWith('radar_'))) {
      const match = /^radar_(\d+)$/.exec(guiControls.radarOverlaySource);
      if (match && parseInt(match[1], 10) === index)
        guiControls.radarOverlaySource = radars.length > 0 ? 'radar_0' : 'composite';
      else if (match && parseInt(match[1], 10) > index)
        guiControls.radarOverlaySource = 'radar_' + (parseInt(match[1], 10) - 1);
    }
    refreshRadarOverlaySourceDropdown();
  }

  getXpos() { return this.#x; }
  getYpos() { return this.#y; }
  getName() { return this.#name; }
  getProduct() { return this.#product; }
  setProduct(product)
  {
    this.#product = product;
    if (this.#productSelect) {
      this.#productSelect.value = product;
      const meta = getRadarProductMeta(product);
      if (meta.desc)
        this.#productSelect.title = meta.desc;
    }
  }
  getRange() { return this.#range; }
  setRange(range) { this.#range = range; }
  getResolution() { return this.#resolution; }
  setResolution(resolution) { this.#resolution = resolution; }
  getSensitivity() { return this.#sensitivity; }
  setSensitivity(sensitivity) { this.#sensitivity = sensitivity; }
  getUpdateFrequency() { return this.#updateFrequency; }
  setUpdateFrequency(freq) { this.#updateFrequency = freq; }
  getLastUpdateIteration() { return this.#lastUpdateIteration; }
  setLastUpdateIteration(iter) { this.#lastUpdateIteration = iter; }
  getCacheFBO() { return this.#cacheFBO; }
  setCacheFBO(fbo) { this.#cacheFBO = fbo; }
  getEnabled() { return this.#enabled; }
  setEnabled(val) {
    this.#enabled = val;
    if (this.#selectBtn) this.#selectBtn.style.display = val ? 'none' : 'block';
    if (this.#menuSelectBtn) this.#menuSelectBtn.style.display = val ? 'none' : 'block';
  }
  getSettings() {
    return {
      name: this.#name,
      product: this.#product,
      range: this.#range,
      resolution: this.#resolution,
      sensitivity: this.#sensitivity,
      enabled: this.#enabled
    };
  }
  setSettings(settings) {
    if (settings.name !== undefined) {
      this.#name = settings.name;
      if (this.#hdrTextEl)
        this.#hdrTextEl.textContent = this.#name;
    }
    if (settings.product !== undefined)
      this.setProduct(settings.product);
    if (settings.range !== undefined) this.#range = settings.range;
    if (settings.resolution !== undefined) this.#resolution = settings.resolution;
    if (settings.sensitivity !== undefined) this.#sensitivity = settings.sensitivity;
    if (settings.enabled !== undefined) this.setEnabled(settings.enabled);
    this.syncMenuToState();
  }

  setHidden(hidden)
  {
    this.#mainDiv.style.display = hidden ? 'none' : 'block';
  }

  updateCanvas()
  {
    let screenX = simToScreenX(this.#x) - this.#width / 2;
    let screenY = simToScreenY(this.#y) - this.#height;

    this.#mainDiv.style.left = screenX + 'px';
    this.#mainDiv.style.top = screenY + 'px';

    let c = this.#c;
    c.clearRect(0, 0, this.#width, this.#height);
    c.fillStyle = '#00000000';
    c.fillRect(0, 0, this.#width, this.#height);

    // Draw radar tower icon
    c.fillStyle = '#FF0000';
    c.beginPath();
    c.arc(this.#width / 2, this.#height / 2, 8, 0, Math.PI * 2);
    c.fill();

    // Draw tower structure
    c.strokeStyle = '#FF0000';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(this.#width / 2, this.#height / 2 + 8);
    c.lineTo(this.#width / 2, this.#height - 5);
    c.stroke();

    // Draw radar dish
    c.beginPath();
    c.arc(this.#width / 2, this.#height / 2 - 5, 12, Math.PI, 0);
    c.stroke();

    // Draw name above tower
    c.font = 'bold 12px Arial';
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.fillText(this.#name, this.#width / 2, 12);

    // Position pointer
    c.beginPath();
    c.moveTo(this.#width / 2, this.#height - 5);
    c.lineTo(this.#width / 2, this.#height);
    c.strokeStyle = 'white';
    c.lineWidth = 2;
    c.stroke();
  }
}


function cycleRadarProducts(direction)
{
  const targets = getRadarsForProductCycle();
  if (targets.length === 0)
    return;
  for (const radar of targets) {
    let currentIndex = RADAR_PRODUCT_CYCLE_ORDER.indexOf(radar.getProduct());
    if (currentIndex < 0)
      currentIndex = 0;
    const nextIndex = (currentIndex + direction + RADAR_PRODUCT_CYCLE_ORDER.length) % RADAR_PRODUCT_CYCLE_ORDER.length;
    radar.setProduct(RADAR_PRODUCT_CYCLE_ORDER[nextIndex]);
  }
  if (typeof datGui !== 'undefined' && datGui && datGui.updateDisplay)
    datGui.updateDisplay();
}


let weatherStations = []; // array holding all weather stations
let radars = []; // array holding all radars
let markers = []; // array holding all markers
let airmassGenerators = []; // array holding all airmass generators
let nukes = []; // array holding all nukes

class Marker
{
  #width = 60;
  #height = 60;
  #mainDiv;
  #canvas;
  #c; // 2d canvas context
  #x; // position in simulation
  #y;
  #name = 'Marker';
  #color = '#FF0000';
  #menuDiv;

  constructor(xIn, yIn)
  {
    this.#x = Math.floor(xIn);
    this.#y = Math.floor(yIn);
    this.#mainDiv = document.createElement('div');
    this.#canvas = document.createElement('canvas');
    this.#mainDiv.appendChild(this.#canvas);
    document.body.appendChild(this.#mainDiv);
    this.#canvas.height = this.#height;
    this.#canvas.width = this.#width;

    this.#mainDiv.style.position = 'absolute';
    this.#mainDiv.style.width = '0px';
    this.#mainDiv.style.height = '0px';

    this.#c = this.#canvas.getContext('2d');

    this.#canvas.style.position = 'absolute';
    this.#canvas.style.zIndex = 1;

    let thisObj = this;
    this.#canvas.addEventListener('mousedown', function(event) {
      if (event.button == 0) { // left mouse button
        if (guiControls.tool == 'TOOL_MARKER') {
          thisObj.destroy();
          event.stopPropagation();
        } else {
          thisObj.toggleMenu();
        }
      }
    });

    this.#canvas.addEventListener('contextmenu', function(event) { event.preventDefault(); });

    this.createMenu();
  }

  createMenu()
  {
    this.#menuDiv = document.createElement('div');
    this.#menuDiv.style.cssText = `
      position: absolute;
      display: none;
      z-index: 1000;
      background: #1a1a2e;
      border: 1px solid #3a3a5c;
      border-radius: 10px;
      padding: 0;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 13px;
      min-width: 240px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      overflow: hidden;
    `;

    let thisObj = this;

    // Header bar
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#12122a; border-bottom:1px solid #3a3a5c; cursor:move;';
    // Drag to move
    let dragOffX = 0, dragOffY = 0, dragging = false;
    hdr.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      dragging = true;
      dragOffX = e.clientX - thisObj.#menuDiv.getBoundingClientRect().left;
      dragOffY = e.clientY - thisObj.#menuDiv.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      thisObj.#menuDiv.style.left = (e.clientX - dragOffX) + 'px';
      thisObj.#menuDiv.style.top  = (e.clientY - dragOffY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
    const hdrTitle = document.createElement('span');
    hdrTitle.textContent = '📍 ' + this.#name + ' Settings';
    hdrTitle.style.fontWeight = 'bold';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none; border:none; color:#aaa; font-size:16px; cursor:pointer; padding:0 4px; line-height:1;';
    closeBtn.addEventListener('click', () => { thisObj.#menuDiv.style.display = 'none'; });
    hdr.appendChild(hdrTitle);
    hdr.appendChild(closeBtn);
    this.#menuDiv.appendChild(hdr);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding: 14px;';

    const mkLabel = (text) => {
      const l = document.createElement('div');
      l.textContent = text;
      l.style.cssText = 'color:#aaa; font-size:11px; text-transform:uppercase; letter-spacing:1px; margin-bottom:5px; margin-top:10px;';
      return l;
    };

    const mkInput = (type, val) => {
      const i = document.createElement('input');
      i.type = type;
      i.value = val;
      i.style.cssText = 'width:100%; box-sizing:border-box; background:#0d0d1a; border:1px solid #3a3a5c; border-radius:5px; color:white; padding:6px 8px; font-size:13px;';
      return i;
    };

    // Name
    body.appendChild(mkLabel('Name'));
    const nameInput = mkInput('text', this.#name);
    nameInput.addEventListener('change', function() { thisObj.#name = this.value; hdrTitle.textContent = '📍 ' + thisObj.#name + ' Settings'; });
    body.appendChild(nameInput);

    // Color
    body.appendChild(mkLabel('Color'));
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.#color;
    colorInput.style.cssText = 'width:100%; height:40px; box-sizing:border-box; background:#0d0d1a; border:1px solid #3a3a5c; border-radius:5px; cursor:pointer;';
    colorInput.addEventListener('change', function() { thisObj.#color = this.value; });
    body.appendChild(colorInput);

    this.#menuDiv.appendChild(body);
    document.body.appendChild(this.#menuDiv);
  }

  toggleMenu()
  {
    const screenX = simToScreenX(this.#x);
    const screenY = simToScreenY(this.#y);
    this.#menuDiv.style.left = screenX + 'px';
    this.#menuDiv.style.top = (screenY - 200) + 'px';
    this.#menuDiv.style.display = (this.#menuDiv.style.display == 'none') ? 'block' : 'none';
  }

  updateCanvas()
  {
    let screenX = simToScreenX(this.#x) - this.#width / 2;
    let screenY = simToScreenY(this.#y) - this.#height / 2;

    this.#mainDiv.style.left = screenX + 'px';
    this.#mainDiv.style.top = screenY + 'px';

    let c = this.#c;
    c.clearRect(0, 0, this.#width, this.#height);

    // Draw marker icon (pin shape)
    c.fillStyle = this.#color;
    c.beginPath();
    c.moveTo(this.#width / 2, 5);
    c.quadraticCurveTo(this.#width - 5, 5, this.#width - 5, this.#height / 2);
    c.quadraticCurveTo(this.#width - 5, this.#height - 10, this.#width / 2, this.#height - 5);
    c.quadraticCurveTo(5, this.#height - 10, 5, this.#height / 2);
    c.quadraticCurveTo(5, 5, this.#width / 2, 5);
    c.fill();

    // Draw inner circle
    c.fillStyle = '#FFFFFF';
    c.beginPath();
    c.arc(this.#width / 2, this.#height / 2 - 5, 8, 0, Math.PI * 2);
    c.fill();

    // Draw marker name below
    c.fillStyle = '#FFFFFF';
    c.font = '12px Arial';
    c.textAlign = 'center';
    c.fillText(this.#name, this.#width / 2, this.#height + 15);
  }

  destroy()
  {
    this.#mainDiv.remove();
    this.#menuDiv.remove();
    let index = markers.indexOf(this);
    if (index > -1) {
      markers.splice(index, 1);
    }
  }

  getXpos() { return this.#x; }
  getYpos() { return this.#y; }
  getName() { return this.#name; }
  getColor() { return this.#color; }
  setName(name) { this.#name = name; }
  setColor(color) { this.#color = color; }
}

const MAX_AIRMASS = 16;
// Same per-iteration scales as the global heating/drying sliders in Fluid Parameters.
const AIRMASS_HEATING_SLIDER_SCALE = 0.00001;
const AIRMASS_DRYING_SLIDER_SCALE = 0.000001;

function airmassInfluenceWeight(dist, radius)
{
  const inner = radius * 0.82;
  if (dist <= inner)
    return 1.0;
  if (dist >= radius)
    return 0.0;
  return 1.0 - (dist - inner) / (radius - inner);
}

function applyAirmassGeneratorsCpu()
{
  if (!airmassGenerators.length || typeof gl === 'undefined')
    return;

  const startAlt = guiControls.globalEffectsStartAlt / guiControls.simHeight;
  const endAlt = guiControls.globalEffectsEndAlt / guiControls.simHeight;
  const aspect = sim_res_y / sim_res_x;
  const wrapX = guiControls.wrapHorizontally;

  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);

  for (let g = 0; g < airmassGenerators.length; g++) {
    const gen = airmassGenerators[g];
    const cx = gen.getXpos();
    const cy = gen.getYpos();
    const radius = gen.getRadius();
    const heating = gen.getHeating();
    const drying = gen.getDrying();
    const windAffect = gen.getWindAffect();
    const windVec = AirmassGenerator.directionVector(gen.getWindDirection());

    if (heating === 0 && drying === 0 && windAffect === 0)
      continue;

    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(sim_res_x - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(sim_res_y - 1, Math.ceil(cy + radius));
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0)
      continue;

    const baseData = new Float32Array(w * h * 4);
    const waterData = new Float32Array(w * h * 4);
    const wallData = new Int8Array(w * h * 4);

    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, waterData);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(x0, y0, w, h, gl.RGBA_INTEGER, gl.BYTE, wallData);

    let changed = false;

    for (let ly = 0; ly < h; ly++) {
      const y = y0 + ly;
      const texY = (y + 0.5) / sim_res_y;
      const inAltBand = texY > startAlt && texY < endAlt;

      for (let lx = 0; lx < w; lx++) {
        const x = x0 + lx;
        const idx = (ly * w + lx) * 4;

        if (wallData[idx + 1] === 0)
          continue;

        let dx = x - cx;
        if (wrapX) {
          dx = Math.abs(dx);
          dx = Math.min(dx, sim_res_x - dx);
        } else {
          dx = Math.abs(dx);
        }
        const dy = y - cy;
        const dist = Math.sqrt((dx * aspect) * (dx * aspect) + dy * dy);
        const weight = airmassInfluenceWeight(dist, radius);
        if (weight <= 0.0001)
          continue;

        if (inAltBand) {
          if (heating !== 0) {
            baseData[idx + 3] += heating * weight;
            changed = true;
          }

          if (drying !== 0) {
            const realTemp = potentialToRealT(baseData[idx + 3], y);
            const dryAmt = drying * weight;
            if (dryAmt > 0) {
              const floorW = maxWater(Math.max(realTemp - 20.0, CtoK(-80)));
              const remove = Math.min(dryAmt, Math.max(0, waterData[idx] - floorW));
              if (remove > 0) {
                waterData[idx] -= remove;
                changed = true;
              }
            } else {
              const realTempAfter = potentialToRealT(baseData[idx + 3], y);
              const headroom = Math.max(0, maxWater(realTempAfter) - waterData[idx]);
              const add = Math.min(-dryAmt, headroom);
              if (add > 0) {
                waterData[idx] += add;
                changed = true;
              }
            }
          }
        }

        if (windAffect > 0) {
          const vx = baseData[idx];
          const vy = baseData[idx + 1];
          const curSpeed = Math.sqrt(vx * vx + vy * vy);
          const desiredX = windVec.dx * Math.max(curSpeed, 0.25);
          const desiredY = windVec.dy * Math.max(curSpeed, 0.25);
          const blend = windAffect * weight * 0.003;
          baseData[idx] += (desiredX - vx) * blend;
          baseData[idx + 1] += (desiredY - vy) * blend;
          changed = true;
        }
      }
    }

    if (!changed)
      continue;

    [baseTexture_0, baseTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
    });
    [waterTexture_0, waterTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.FLOAT, waterData);
    });
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

class AirmassGenerator
{
  // 0=Up, 90=Right, 180=Down, 270=Left
  static directionVector(degrees)
  {
    const rad = degrees * Math.PI / 180.0;
    return { dx: Math.sin(rad), dy: -Math.cos(rad) };
  }

  static directionLabel(degrees)
  {
    const d = ((Math.round(degrees) % 360) + 360) % 360;
    if (d === 0) return 'Up';
    if (d === 90) return 'Right';
    if (d === 180) return 'Down';
    if (d === 270) return 'Left';
    return d + '°';
  }

  static heatingSliderToValue(sliderVal)
  {
    return parseInt(sliderVal, 10) * AIRMASS_HEATING_SLIDER_SCALE;
  }

  static dryingSliderToValue(sliderVal)
  {
    return parseInt(sliderVal, 10) * AIRMASS_DRYING_SLIDER_SCALE;
  }

  #width = 72;
  #height = 72;
  #mainDiv;
  #canvas;
  #c;
  #x;
  #y;
  #name = 'Airmass';
  #radius = 200;
  #heatingLevel = 0;
  #dryingLevel = 0;
  #windAffect = 0.0;
  #windDirection = 0.0;
  #moveEnabled = false;
  #moveSpeed = 1.0;
  #moveDirection = 0.0;
  #menuDiv;
  #hdrTextEl = null;
  #radiusSlider = null;
  #radiusValBadge = null;
  #heatingSlider = null;
  #heatingValBadge = null;
  #dryingSlider = null;
  #dryingValBadge = null;
  #windAffectSlider = null;
  #windAffectValBadge = null;
  #windDirSlider = null;
  #windDirValBadge = null;
  #moveToggle = null;
  #moveToggleTrack = null;
  #moveToggleKnob = null;
  #moveSpeedSlider = null;
  #moveSpeedValBadge = null;
  #moveDirSlider = null;
  #moveDirValBadge = null;
  #moveControlsWrap = null;

  constructor(xIn, yIn)
  {
    this.#x = Math.floor(xIn);
    this.#y = Math.floor(yIn);
    this.#mainDiv = document.createElement('div');
    this.#canvas = document.createElement('canvas');
    this.#mainDiv.appendChild(this.#canvas);
    document.body.appendChild(this.#mainDiv);
    this.#canvas.height = this.#height;
    this.#canvas.width = this.#width;

    this.#mainDiv.style.position = 'absolute';
    this.#mainDiv.style.width = '0px';
    this.#mainDiv.style.height = '0px';

    this.#c = this.#canvas.getContext('2d');
    this.#canvas.style.position = 'absolute';
    this.#canvas.style.zIndex = 1;

    const thisObj = this;
    this.#canvas.addEventListener('mousedown', function(event) {
      if (event.button == 0) {
        if (guiControls.tool == 'TOOL_AIRMASS') {
          thisObj.destroy();
          event.stopPropagation();
        } else {
          thisObj.toggleMenu();
        }
      }
    });
    this.#canvas.addEventListener('contextmenu', function(event) { event.preventDefault(); });
    this.createMenu();
  }

  createMenu()
  {
    this.#menuDiv = document.createElement('div');
    this.#menuDiv.style.cssText = `
      position: absolute;
      display: none;
      z-index: 1000;
      background: #13131f;
      border: 1px solid #252540;
      border-radius: 12px;
      padding: 0;
      color: white;
      font-family: Arial, sans-serif;
      font-size: 13px;
      min-width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.75);
      overflow: hidden;
    `;

    const thisObj = this;
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:11px 14px;background:linear-gradient(135deg,#191930,#0e0e22);border-bottom:1px solid #252540;cursor:move;user-select:none;gap:8px;';

    let dragOffX = 0, dragOffY = 0, dragging = false;
    const closeBtn = document.createElement('button');
    hdr.addEventListener('mousedown', (e) => {
      if (e.target === closeBtn) return;
      dragging = true;
      dragOffX = e.clientX - thisObj.#menuDiv.getBoundingClientRect().left;
      dragOffY = e.clientY - thisObj.#menuDiv.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      thisObj.#menuDiv.style.left = (e.clientX - dragOffX) + 'px';
      thisObj.#menuDiv.style.top = (e.clientY - dragOffY) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    const hdrTitle = document.createElement('span');
    hdrTitle.style.cssText = 'font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;flex:1;min-width:0;';
    hdrTitle.innerHTML = '<span style="flex-shrink:0">🌡️</span>';
    const hdrText = document.createElement('span');
    hdrText.textContent = this.#name + ' Generator';
    hdrText.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    hdrTitle.appendChild(hdrText);
    this.#hdrTextEl = hdrText;

    closeBtn.innerHTML = '&#x2715;';
    closeBtn.style.cssText = 'background:rgba(255,255,255,0.07);border:none;color:#777;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;';
    closeBtn.addEventListener('mouseover', () => { closeBtn.style.background='rgba(220,60,60,0.35)'; closeBtn.style.color='#fff'; });
    closeBtn.addEventListener('mouseout', () => { closeBtn.style.background='rgba(255,255,255,0.07)'; closeBtn.style.color='#777'; });
    closeBtn.addEventListener('click', () => { thisObj.#menuDiv.style.display = 'none'; });
    hdr.appendChild(hdrTitle);
    hdr.appendChild(closeBtn);
    this.#menuDiv.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'padding:14px 15px 16px;';

    const mkSectionLabel = (text) => {
      const l = document.createElement('div');
      l.textContent = text;
      l.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:6px;margin-top:14px;';
      return l;
    };

    const mkSliderGroup = (text, initVal, unit, min, max, step, formatFn, onChange) => {
      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;margin-top:13px;';
      const lb = document.createElement('span');
      lb.textContent = text;
      lb.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;';
      const badge = document.createElement('span');
      badge.textContent = formatFn(initVal) + unit;
      badge.style.cssText = 'color:#4a90e2;font-size:11px;font-weight:700;background:rgba(74,144,226,0.13);padding:1px 8px;border-radius:10px;';
      hd.appendChild(lb);
      hd.appendChild(badge);
      const sl = document.createElement('input');
      sl.type = 'range';
      sl.min = min; sl.max = max; sl.step = step;
      sl.value = initVal;
      sl.style.cssText = 'width:100%;accent-color:#4a90e2;cursor:pointer;margin-top:2px;';
      sl.addEventListener('input', function() {
        onChange(this.value);
        badge.textContent = formatFn(this.value) + unit;
      });
      sl.addEventListener('change', function() {
        onChange(this.value);
        badge.textContent = formatFn(this.value) + unit;
      });
      return { hd, sl, badge };
    };

    const mkDivider = () => {
      const d = document.createElement('div');
      d.style.cssText = 'border-top:1px solid #1c1c30;margin:10px -15px;';
      return d;
    };

    const mkDirectionButtons = (setDegrees, slider, badge) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;margin-bottom:4px;';
      const dirs = [
        { label: 'Up', deg: 0 },
        { label: 'Right', deg: 90 },
        { label: 'Down', deg: 180 },
        { label: 'Left', deg: 270 },
      ];
      dirs.forEach(({ label, deg }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.style.cssText = 'padding:5px 4px;cursor:pointer;background:#0b0b17;color:#b8c0d0;border:1px solid #252540;border-radius:6px;font-size:11px;font-weight:600;transition:background 0.15s,border-color 0.15s;';
        btn.addEventListener('mouseover', () => { btn.style.background='#151528'; btn.style.borderColor='#4a90e2'; });
        btn.addEventListener('mouseout', () => { btn.style.background='#0b0b17'; btn.style.borderColor='#252540'; });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setDegrees(deg);
          if (slider) slider.value = deg;
          if (badge) badge.textContent = AirmassGenerator.directionLabel(deg);
        });
        row.appendChild(btn);
      });
      return row;
    };

    body.appendChild(mkSectionLabel('Influence Area'));
    const radiusGroup = mkSliderGroup('Radius', this.#radius, ' px', 25, 30000, 10,
      (v) => parseInt(v, 10),
      (v) => { thisObj.#radius = parseInt(v, 10); return thisObj.#radius; });
    this.#radiusSlider = radiusGroup.sl;
    this.#radiusValBadge = radiusGroup.badge;
    body.appendChild(radiusGroup.hd);
    body.appendChild(this.#radiusSlider);
    body.appendChild(mkDivider());

    body.appendChild(mkSectionLabel('Airmass Effects (same scale as global heating/drying)'));
    const heatGroup = mkSliderGroup('Heating', this.#heatingLevel, '/iter', -5000, 5000, 1,
      (v) => AirmassGenerator.heatingSliderToValue(v).toFixed(5),
      (v) => { thisObj.#heatingLevel = parseInt(v, 10); });
    this.#heatingSlider = heatGroup.sl;
    this.#heatingValBadge = heatGroup.badge;
    body.appendChild(heatGroup.hd);
    body.appendChild(this.#heatingSlider);

    const dryGroup = mkSliderGroup('Drying', this.#dryingLevel, '/iter', -5000, 5000, 1,
      (v) => AirmassGenerator.dryingSliderToValue(v).toFixed(6),
      (v) => { thisObj.#dryingLevel = parseInt(v, 10); });
    this.#dryingSlider = dryGroup.sl;
    this.#dryingValBadge = dryGroup.badge;
    body.appendChild(dryGroup.hd);
    body.appendChild(this.#dryingSlider);

    const windGroup = mkSliderGroup('Wind Affect', this.#windAffect, '', 0, 100, 0.05,
      (v) => parseFloat(v).toFixed(2),
      (v) => { thisObj.#windAffect = parseFloat(v); });
    this.#windAffectSlider = windGroup.sl;
    this.#windAffectValBadge = windGroup.badge;
    body.appendChild(windGroup.hd);
    body.appendChild(this.#windAffectSlider);

    const windDirGroup = mkSliderGroup('Wind Direction', this.#windDirection, '', 0, 360, 1,
      (v) => AirmassGenerator.directionLabel(v),
      (v) => { thisObj.#windDirection = parseInt(v, 10); });
    this.#windDirSlider = windDirGroup.sl;
    this.#windDirValBadge = windDirGroup.badge;
    body.appendChild(windDirGroup.hd);
    body.appendChild(this.#windDirSlider);
    body.appendChild(mkDirectionButtons(
      (deg) => { thisObj.#windDirection = deg; },
      this.#windDirSlider,
      this.#windDirValBadge));
    body.appendChild(mkDivider());

    body.appendChild(mkSectionLabel('Movement'));
    const moveRow = document.createElement('div');
    moveRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:13px;';
    const moveLbl = document.createElement('span');
    moveLbl.textContent = 'Move Through Simulation';
    moveLbl.style.cssText = 'color:#aaa;font-size:12px;';

    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText = 'position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;';
    this.#moveToggle = document.createElement('input');
    this.#moveToggle.type = 'checkbox';
    this.#moveToggle.checked = this.#moveEnabled;
    this.#moveToggle.style.cssText = 'opacity:0;width:0;height:0;position:absolute;';
    this.#moveToggleTrack = document.createElement('span');
    this.#moveToggleTrack.style.cssText = `position:absolute;top:0;left:0;right:0;bottom:0;background:${this.#moveEnabled ? '#3a7ad4' : '#252540'};border-radius:24px;transition:background 0.2s;`;
    this.#moveToggleKnob = document.createElement('span');
    this.#moveToggleKnob.style.cssText = `position:absolute;height:18px;width:18px;left:${this.#moveEnabled ? '23px' : '3px'};bottom:3px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.5);`;
    this.#moveToggleTrack.appendChild(this.#moveToggleKnob);
    toggleLabel.appendChild(this.#moveToggle);
    toggleLabel.appendChild(this.#moveToggleTrack);
    this.#moveToggle.addEventListener('change', function() {
      thisObj.#moveEnabled = this.checked;
      thisObj.#moveToggleTrack.style.background = this.checked ? '#3a7ad4' : '#252540';
      thisObj.#moveToggleKnob.style.left = this.checked ? '23px' : '3px';
      if (thisObj.#moveControlsWrap)
        thisObj.#moveControlsWrap.style.display = this.checked ? 'block' : 'none';
    });
    moveRow.appendChild(moveLbl);
    moveRow.appendChild(toggleLabel);
    body.appendChild(moveRow);

    this.#moveControlsWrap = document.createElement('div');
    this.#moveControlsWrap.style.display = this.#moveEnabled ? 'block' : 'none';

    const speedGroup = mkSliderGroup('Move Speed', this.#moveSpeed, ' px/it', 0, 200, 0.01,
      (v) => parseFloat(v).toFixed(2),
      (v) => { thisObj.#moveSpeed = parseFloat(v); });
    this.#moveSpeedSlider = speedGroup.sl;
    this.#moveSpeedValBadge = speedGroup.badge;
    this.#moveControlsWrap.appendChild(speedGroup.hd);
    this.#moveControlsWrap.appendChild(this.#moveSpeedSlider);

    const moveDirGroup = mkSliderGroup('Move Direction', this.#moveDirection, '', 0, 360, 1,
      (v) => AirmassGenerator.directionLabel(v),
      (v) => { thisObj.#moveDirection = parseInt(v, 10); });
    this.#moveDirSlider = moveDirGroup.sl;
    this.#moveDirValBadge = moveDirGroup.badge;
    this.#moveControlsWrap.appendChild(moveDirGroup.hd);
    this.#moveControlsWrap.appendChild(this.#moveDirSlider);
    this.#moveControlsWrap.appendChild(mkDirectionButtons(
      (deg) => { thisObj.#moveDirection = deg; },
      this.#moveDirSlider,
      this.#moveDirValBadge));
    body.appendChild(this.#moveControlsWrap);

    this.#menuDiv.appendChild(body);
    document.body.appendChild(this.#menuDiv);
  }

  static closeAllMenusExcept(exceptGen)
  {
    for (let i = 0; i < airmassGenerators.length; i++) {
      if (airmassGenerators[i] !== exceptGen)
        airmassGenerators[i].closeMenu();
    }
  }

  closeMenu() { this.#menuDiv.style.display = 'none'; }

  syncMenuToState()
  {
    if (this.#radiusSlider) {
      this.#radiusSlider.value = this.#radius;
      if (this.#radiusValBadge) this.#radiusValBadge.textContent = this.#radius + ' px';
    }
    if (this.#heatingSlider) {
      this.#heatingSlider.value = this.#heatingLevel;
      if (this.#heatingValBadge) this.#heatingValBadge.textContent = AirmassGenerator.heatingSliderToValue(this.#heatingLevel).toFixed(5);
    }
    if (this.#dryingSlider) {
      this.#dryingSlider.value = this.#dryingLevel;
      if (this.#dryingValBadge) this.#dryingValBadge.textContent = AirmassGenerator.dryingSliderToValue(this.#dryingLevel).toFixed(6);
    }
    if (this.#windAffectSlider) {
      this.#windAffectSlider.value = this.#windAffect;
      if (this.#windAffectValBadge) this.#windAffectValBadge.textContent = this.#windAffect.toFixed(2);
    }
    if (this.#windDirSlider) {
      this.#windDirSlider.value = this.#windDirection;
      if (this.#windDirValBadge) this.#windDirValBadge.textContent = AirmassGenerator.directionLabel(this.#windDirection);
    }
    if (this.#moveToggle) {
      this.#moveToggle.checked = this.#moveEnabled;
      if (this.#moveToggleTrack)
        this.#moveToggleTrack.style.background = this.#moveEnabled ? '#3a7ad4' : '#252540';
      if (this.#moveToggleKnob)
        this.#moveToggleKnob.style.left = this.#moveEnabled ? '23px' : '3px';
    }
    if (this.#moveControlsWrap)
      this.#moveControlsWrap.style.display = this.#moveEnabled ? 'block' : 'none';
    if (this.#moveSpeedSlider) {
      this.#moveSpeedSlider.value = this.#moveSpeed;
      if (this.#moveSpeedValBadge) this.#moveSpeedValBadge.textContent = this.#moveSpeed.toFixed(2) + ' px/it';
    }
    if (this.#moveDirSlider) {
      this.#moveDirSlider.value = this.#moveDirection;
      if (this.#moveDirValBadge) this.#moveDirValBadge.textContent = AirmassGenerator.directionLabel(this.#moveDirection);
    }
  }

  toggleMenu(forceOpen)
  {
    const opening = forceOpen || this.#menuDiv.style.display === 'none';
    if (!opening) {
      this.closeMenu();
      return;
    }
    AirmassGenerator.closeAllMenusExcept(this);
    this.syncMenuToState();
    const screenX = simToScreenX(this.#x);
    const screenY = simToScreenY(this.#y);
    this.#menuDiv.style.left = screenX + 'px';
    this.#menuDiv.style.top = (screenY - 220) + 'px';
    this.#menuDiv.style.display = 'block';
  }

  step()
  {
    if (!this.#moveEnabled || this.#moveSpeed <= 0)
      return;
    const { dx, dy } = AirmassGenerator.directionVector(this.#moveDirection);
    this.#x += dx * this.#moveSpeed;
    this.#y += dy * this.#moveSpeed;
    if (guiControls.wrapHorizontally) {
      while (this.#x < 0) this.#x += sim_res_x;
      while (this.#x >= sim_res_x) this.#x -= sim_res_x;
    } else {
      this.#x = clamp(this.#x, 0, sim_res_x - 1);
    }
    this.#y = clamp(this.#y, 0, sim_res_y - 1);
  }

  destroy()
  {
    this.#menuDiv.remove();
    this.#mainDiv.remove();
    const index = airmassGenerators.indexOf(this);
    if (index > -1)
      airmassGenerators.splice(index, 1);
  }

  setHidden(hidden) { this.#mainDiv.style.display = hidden ? 'none' : 'block'; }

  updateCanvas()
  {
    const screenX = simToScreenX(this.#x) - this.#width / 2;
    const screenY = simToScreenY(this.#y) - this.#height / 2;
    this.#mainDiv.style.left = screenX + 'px';
    this.#mainDiv.style.top = screenY + 'px';

    const c = this.#c;
    c.clearRect(0, 0, this.#width, this.#height);

    const cx = this.#width / 2;
    const cy = this.#height / 2;

    c.strokeStyle = 'rgba(120, 200, 255, 0.9)';
    c.fillStyle = 'rgba(80, 170, 255, 0.85)';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = 10 + (i % 2) * 4;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.stroke();

    c.beginPath();
    c.arc(cx, cy, 5, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();

    c.font = 'bold 11px Arial';
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.fillText(this.#name, cx, this.#height - 4);
  }

  drawRadiusOverlay(ctx)
  {
    const sx = simToScreenX(this.#x);
    const sy = simToScreenY(this.#y);
    const edgeX = simToScreenX(this.#x + this.#radius);
    const screenRadius = Math.abs(edgeX - sx);
    if (screenRadius < 2)
      return;

    ctx.beginPath();
    ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.#windAffect > 0.01) {
      const windVec = AirmassGenerator.directionVector(this.#windDirection);
      const len = Math.min(screenRadius * 0.45, 80);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + windVec.dx * len, sy + windVec.dy * len);
      ctx.strokeStyle = 'rgba(255, 200, 80, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (this.#moveEnabled && this.#moveSpeed > 0) {
      const moveVec = AirmassGenerator.directionVector(this.#moveDirection);
      const len = Math.min(screenRadius * 0.35, 60);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + moveVec.dx * len, sy + moveVec.dy * len);
      ctx.strokeStyle = 'rgba(180, 120, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  getXpos() { return this.#x; }
  getYpos() { return this.#y; }
  getRadius() { return this.#radius; }
  getHeating() { return this.#heatingLevel * AIRMASS_HEATING_SLIDER_SCALE; }
  getDrying() { return this.#dryingLevel * AIRMASS_DRYING_SLIDER_SCALE; }
  getWindAffect() { return this.#windAffect; }
  getWindDirection() { return this.#windDirection; }

  getSettings()
  {
    return {
      radius: this.#radius,
      heatingLevel: this.#heatingLevel,
      dryingLevel: this.#dryingLevel,
      windAffect: this.#windAffect,
      windDirection: this.#windDirection,
      moveEnabled: this.#moveEnabled,
      moveSpeed: this.#moveSpeed,
      moveDirection: this.#moveDirection,
    };
  }

  setSettings(settings)
  {
    if (settings.radius !== undefined) this.#radius = settings.radius;
    if (settings.heatingLevel !== undefined) this.#heatingLevel = settings.heatingLevel;
    if (settings.dryingLevel !== undefined) this.#dryingLevel = settings.dryingLevel;
    if (settings.windAffect !== undefined) this.#windAffect = settings.windAffect;
    if (settings.windDirection !== undefined) this.#windDirection = settings.windDirection;
    if (settings.moveEnabled !== undefined) this.#moveEnabled = settings.moveEnabled;
    if (settings.moveSpeed !== undefined) this.#moveSpeed = settings.moveSpeed;
    if (settings.moveDirection !== undefined) this.#moveDirection = settings.moveDirection;
    this.syncMenuToState();
  }
}

class Nuke
{
  #x; // position in simulation
  #y;
  #vx; // velocity
  #vy;
  #exploded;

  constructor(xIn, yIn)
  {
    this.#x = xIn;
    this.#y = yIn;
    this.#vx = 0;
    this.#vy = -guiControls.nukeFallSpeed / cellHeight; // convert m/s to sim units (downward in sim coordinates)
    this.#exploded = false;
  }

  move()
  {
    if (this.#exploded) return;

    // Apply gravity using the simulation time step correctly
    const secondsPerIter = timePerIteration * 3600.0;
    this.#vy -= 9.81 * secondsPerIter / cellHeight; // gravity in sim units (downward)

    // Update position
    this.#x += this.#vx * secondsPerIter;
    this.#y += this.#vy * secondsPerIter;

    // Check for ground impact using the active wall texture
    const x = Math.floor(this.#x);
    const y = Math.floor(this.#y);
    if (x >= 0 && x < sim_res_x && y >= 0 && y < sim_res_y) {
      if (!this._wallPixel) this._wallPixel = new Int8Array(4); // reuse buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, window.frameBuff_1 || frameBuff_1);
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      gl.readPixels(x, y, 1, 1, gl.RGBA_INTEGER, gl.BYTE, this._wallPixel);
      if (this._wallPixel[1] <= 0) {
        this.explode();
        return;
      }
    }

    // Check for bottom of simulation domain
    if (this.#y >= sim_res_y - 1) {
      this.explode();
    }
  }

  explode()
  {
    if (this.#exploded) return;
    this.#exploded = true;

    // Apply blast effect by directly modifying the simulation textures
    const blastRadius = guiControls.nukeBlastRadius;
    const centerX = Math.floor(this.#x);
    const centerY = Math.floor(this.#y);
    const blastTemp = CtoK(guiControls.nukeTemperature);

    // Read current base, water, and wall texture data from the active framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, window.frameBuff_1 || frameBuff_1);
    gl.viewport(0, 0, sim_res_x, sim_res_y);

    const baseData = new Float32Array(sim_res_x * sim_res_y * 4);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseData);

    const waterData = new Float32Array(sim_res_x * sim_res_y * 4);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterData);

    const wallData = new Int8Array(sim_res_x * sim_res_y * 4);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallData);

    // Apply blast effect
    for (let dy = -blastRadius; dy <= blastRadius; dy++) {
      for (let dx = -blastRadius; dx <= blastRadius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= blastRadius) {
          const x = centerX + dx;
          const y = centerY + dy;
          if (x >= 0 && x < sim_res_x && y >= 0 && y < sim_res_y) {
            const intensity = 1.0 - (dist / blastRadius);
            const index = (y * sim_res_x + x) * 4;
            baseData[index + 3] = Math.max(baseData[index + 3], blastTemp * intensity);
            waterData[index + 3] = Math.min(waterData[index + 3] + guiControls.nukeSmokeAmount * intensity, 2.0);
            
            // Check if there's land/vegetation at this location and ignite it
            if (guiControls.nukeIgnitionEnabled && wallData[index + 0] === 1) {
              // Wall type 1 is land with vegetation; change to fire wall type
              wallData[index + 0] = 3; // Set wall type to FIRE (3)
              // The fire system will naturally burn out as vegetation is consumed
            }
          }
        }
      }
    }

    // Write back the modified data to both ping-pong texture buffers
    [window.baseTexture_0 || baseTexture_0, window.baseTexture_1 || baseTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseData);
    });

    [window.waterTexture_0 || waterTexture_0, window.waterTexture_1 || waterTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterData);
    });

    [window.wallTexture_0 || wallTexture_0, window.wallTexture_1 || wallTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallData);
    });

    // Remove from nukes array after a delay
    setTimeout(() => {
      this.#exploded = true; // Mark as exploded so it gets removed
    }, 1000);
  }

  isExploded() { return this.#exploded; }
  getX() { return this.#x; }
  getY() { return this.#y; }
}

// Extract a single top-level JSON object from text that may include binary prefix bytes.
function extractJsonObject(text)
{
  const start = text.indexOf('{');
  if (start < 0)
    return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped)
        escaped = false;
      else if (ch === '\\')
        escaped = true;
      else if (ch === '"')
        inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{')
      depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0)
        return text.slice(start, i + 1);
    }
  }

  return null;
}

const MAX_SAVED_RADARS = 10000;
const MAX_SAVED_AIRMASS = 10000;

function isPlausibleGuiControlsLength(len, offset, totalBytes)
{
  return len >= 64 && len < 2000000 &&
    offset + Uint32Array.BYTES_PER_ELEMENT + len <= totalBytes;
}

function radarPositionsLookValid(positions, count)
{
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < 0 || y < 0 || x >= sim_res_x || y >= sim_res_y)
      return false;
  }
  return true;
}

function applyRadarSettingsFromSave(radarSettings)
{
  if (!Array.isArray(radarSettings) || radars.length === 0)
    return;

  const n = Math.min(radarSettings.length, radars.length);
  for (let i = 0; i < n; i++) {
    if (radarSettings[i] && typeof radarSettings[i] === 'object')
      radars[i].setSettings(radarSettings[i]);
  }

  if (n < radars.length)
    console.warn('Save file has settings for ' + n + ' radars but ' + radars.length + ' towers were loaded');
  else
    console.log('Loaded radar settings for ' + n + ' radar towers');
}

function airmassPositionsLookValid(positions, count)
{
  for (let i = 0; i < count; i++) {
    const x = positions[i * 2];
    const y = positions[i * 2 + 1];
    if (x < 0 || y < 0 || x >= sim_res_x || y >= sim_res_y)
      return false;
  }
  return true;
}

function applyAirmassSettingsFromSave(airmassSettings)
{
  if (!Array.isArray(airmassSettings) || airmassGenerators.length === 0)
    return;

  const n = Math.min(airmassSettings.length, airmassGenerators.length);
  for (let i = 0; i < n; i++) {
    if (airmassSettings[i] && typeof airmassSettings[i] === 'object')
      airmassGenerators[i].setSettings(airmassSettings[i]);
  }

  if (n < airmassGenerators.length)
    console.warn('Save file has settings for ' + n + ' airmass generators but ' + airmassGenerators.length + ' were loaded');
  else
    console.log('Loaded airmass settings for ' + n + ' generators');
}

async function loadAirmassGeneratorsFromSave(dataBlob, sliceStart, totalBytes)
{
  if (sliceStart + Int16Array.BYTES_PER_ELEMENT > totalBytes)
    return sliceStart;

  const numBuf = await dataBlob.slice(sliceStart, sliceStart + Int16Array.BYTES_PER_ELEMENT).arrayBuffer();
  const numAirmass = new Int16Array(numBuf)[0];
  let offset = sliceStart + Int16Array.BYTES_PER_ELEMENT;

  if (numAirmass === 0) {
    airmassGenerators = [];
    return offset;
  }

  if (numAirmass <= 0 || numAirmass >= MAX_SAVED_AIRMASS) {
    console.warn('Invalid airmass generator count in save file:', numAirmass);
    return sliceStart;
  }

  const posBytes = numAirmass * 2 * Int16Array.BYTES_PER_ELEMENT;
  if (offset + posBytes > totalBytes) {
    console.warn('Truncated airmass generator positions in save file');
    return sliceStart;
  }

  const airmassBuf = await dataBlob.slice(offset, offset + posBytes).arrayBuffer();
  const safeLen = Math.floor(airmassBuf.byteLength / Int16Array.BYTES_PER_ELEMENT) * Int16Array.BYTES_PER_ELEMENT;
  if (safeLen < posBytes) {
    console.warn('Incomplete airmass generator position data in save file');
    return sliceStart;
  }

  const airmassArray = new Int16Array(airmassBuf, 0, safeLen / Int16Array.BYTES_PER_ELEMENT);
  const count = Math.floor(airmassArray.length / 2);
  if (count !== numAirmass || !airmassPositionsLookValid(airmassArray, count)) {
    console.warn('Airmass generator section invalid — skipping');
    return sliceStart;
  }

  airmassGenerators = [];
  for (let i = 0; i < count; i++)
    airmassGenerators.push(new AirmassGenerator(airmassArray[i * 2], airmassArray[i * 2 + 1]));

  console.log('Loaded ' + count + ' airmass generators');
  return offset + posBytes;
}

async function readLengthPrefixedJsonBlob(blob, offsetInBlob)
{
  if (offsetInBlob + Uint32Array.BYTES_PER_ELEMENT > blob.size)
    return { offset: offsetInBlob, data: null };

  const lenBuf = await blob.slice(offsetInBlob, offsetInBlob + Uint32Array.BYTES_PER_ELEMENT).arrayBuffer();
  const length = new Uint32Array(lenBuf)[0];
  const start = offsetInBlob + Uint32Array.BYTES_PER_ELEMENT;
  const end = start + length;

  if (length <= 0 || length >= 500000 || end > blob.size)
    return { offset: offsetInBlob, data: null };

  try {
    const text = await blob.slice(start, end).text();
    return { offset: end, data: JSON.parse(text) };
  } catch (e) {
    return { offset: offsetInBlob, data: null };
  }
}

async function loadAirmassSettingsFromSaveBlob(settingsArrayBlob, offsetInBlob)
{
  const result = await readLengthPrefixedJsonBlob(settingsArrayBlob, offsetInBlob);
  if (result.data)
    applyAirmassSettingsFromSave(result.data);
}

function finalizeLoadedAirmassGenerators()
{
  if (airmassGenerators.length === 0)
    return;

  if (guiControls && guiControls.displayAirmassGenerators !== undefined)
    displayAirmassGenerators = guiControls.displayAirmassGenerators;

  for (let i = 0; i < airmassGenerators.length; i++) {
    airmassGenerators[i].updateCanvas();
    airmassGenerators[i].setHidden(!displayAirmassGenerators);
  }
}

function buildSavedAirmassGeneratorsForGuiControls()
{
  if (airmassGenerators.length === 0)
    return null;

  return airmassGenerators.map(gen => ({
    x: gen.getXpos(),
    y: gen.getYpos(),
    ...gen.getSettings(),
  }));
}

function restoreSavedAirmassGeneratorsFromGuiControls()
{
  const saved = guiControls && guiControls.__savedAirmassGenerators;
  if (!Array.isArray(saved) || saved.length === 0)
    return;

  if (airmassGenerators.length === 0) {
    for (let i = 0; i < saved.length; i++) {
      const entry = saved[i];
      if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.y))
        airmassGenerators.push(new AirmassGenerator(entry.x, entry.y));
    }
  }

  applyAirmassSettingsFromSave(saved.map(entry => {
    const settings = Object.assign({}, entry);
    delete settings.x;
    delete settings.y;
    return settings;
  }));

  delete guiControls.__savedAirmassGenerators;
}

async function loadRadarTowersFromSave(dataBlob, sliceStart, totalBytes)
{
  if (sliceStart + Int16Array.BYTES_PER_ELEMENT > totalBytes)
    return sliceStart;

  if (sliceStart + 1 <= totalBytes) {
    const firstChar = await dataBlob.slice(sliceStart, sliceStart + 1).text();
    if (firstChar === '{')
      return sliceStart;
  }

  if (sliceStart + Uint32Array.BYTES_PER_ELEMENT <= totalBytes) {
    const guiLenBuf = await dataBlob.slice(sliceStart, sliceStart + Uint32Array.BYTES_PER_ELEMENT).arrayBuffer();
    const guiLen = new Uint32Array(guiLenBuf)[0];
    if (isPlausibleGuiControlsLength(guiLen, sliceStart, totalBytes))
      return sliceStart;
  }

  const numRadarsBuf = await dataBlob.slice(sliceStart, sliceStart + Int16Array.BYTES_PER_ELEMENT).arrayBuffer();
  const numRadars = new Int16Array(numRadarsBuf)[0];
  let offset = sliceStart + Int16Array.BYTES_PER_ELEMENT;

  if (numRadars === 0)
    return offset;

  if (numRadars <= 0 || numRadars >= MAX_SAVED_RADARS) {
    console.warn('Invalid radar count in save file:', numRadars);
    return sliceStart;
  }

  const posBytes = numRadars * 2 * Int16Array.BYTES_PER_ELEMENT;
  if (offset + posBytes > totalBytes) {
    console.warn('Truncated radar positions in save file');
    return sliceStart;
  }

  const radarBuf = await dataBlob.slice(offset, offset + posBytes).arrayBuffer();
  const safeLen = Math.floor(radarBuf.byteLength / Int16Array.BYTES_PER_ELEMENT) * Int16Array.BYTES_PER_ELEMENT;
  if (safeLen < posBytes) {
    console.warn('Incomplete radar position data in save file');
    return sliceStart;
  }

  const radarArray = new Int16Array(radarBuf, 0, safeLen / Int16Array.BYTES_PER_ELEMENT);
  const count = Math.floor(radarArray.length / 2);
  if (count !== numRadars || !radarPositionsLookValid(radarArray, count)) {
    console.warn('Radar section invalid or from older save format without towers — skipping');
    return sliceStart;
  }

  radars = [];
  for (let i = 0; i < count; i++)
    radars.push(new Radar(radarArray[i * 2], radarArray[i * 2 + 1]));

  refreshRadarOverlaySourceDropdown();
  console.log('Loaded ' + count + ' radar towers');
  return offset + posBytes;
}

async function loadRadarSettingsFromSaveBlob(settingsArrayBlob, offsetInBlob)
{
  if (offsetInBlob >= settingsArrayBlob.size)
    return;

  const lenBuf = await settingsArrayBlob.slice(offsetInBlob, offsetInBlob + Uint32Array.BYTES_PER_ELEMENT).arrayBuffer();
  if (lenBuf.byteLength >= Uint32Array.BYTES_PER_ELEMENT) {
    const radarSettingsLength = new Uint32Array(lenBuf)[0];
    const settingsStart = offsetInBlob + Uint32Array.BYTES_PER_ELEMENT;
    const settingsEnd = settingsStart + radarSettingsLength;

    if (radarSettingsLength > 0 && radarSettingsLength < 500000 && settingsEnd <= settingsArrayBlob.size) {
      try {
        const text = await settingsArrayBlob.slice(settingsStart, settingsEnd).text();
        applyRadarSettingsFromSave(JSON.parse(text));
        return;
      } catch (e) {
        console.log('Failed to parse length-prefixed radar settings:', e.message);
      }
    }
  }

  const text = await settingsArrayBlob.slice(offsetInBlob).text();
  const trimmed = text.trim();
  if (!trimmed.startsWith('['))
    return;

  try {
    const arrEnd = trimmed.indexOf(']');
    if (arrEnd >= 0)
      applyRadarSettingsFromSave(JSON.parse(trimmed.slice(0, arrEnd + 1)));
  } catch (e) {
    console.log('No radar settings in save file:', e.message);
  }
}

function finalizeLoadedRadars()
{
  if (radars.length === 0)
    return;

  if (guiControls && guiControls.displayRadars !== undefined)
    displayRadars = guiControls.displayRadars;

  for (let i = 0; i < radars.length; i++) {
    radars[i].updateCanvas();
    radars[i].setHidden(!displayRadars);
  }
  refreshRadarOverlaySourceDropdown();
}

function buildSavedRadarTowersForGuiControls()
{
  if (radars.length === 0)
    return null;

  return radars.map(radar => ({
    x : radar.getXpos(),
    y : radar.getYpos(),
    ...radar.getSettings(),
  }));
}

function restoreSavedRadarTowersFromGuiControls()
{
  const saved = guiControls && guiControls.__savedRadarTowers;
  if (!Array.isArray(saved) || saved.length === 0)
    return;

  if (radars.length === 0) {
    for (let i = 0; i < saved.length; i++) {
      const entry = saved[i];
      if (entry && Number.isFinite(entry.x) && Number.isFinite(entry.y))
        radars.push(new Radar(entry.x, entry.y));
    }
    refreshRadarOverlaySourceDropdown();
  }

  applyRadarSettingsFromSave(saved.map(entry => {
    const settings = Object.assign({}, entry);
    delete settings.x;
    delete settings.y;
    return settings;
  }));

  delete guiControls.__savedRadarTowers;
}

async function loadMasterFormatSettings(dataBlob, sliceStart, totalBytes)
{
  if (sliceStart + Int16Array.BYTES_PER_ELEMENT > totalBytes)
    return;

  const numWSBuf = await dataBlob.slice(sliceStart, sliceStart + Int16Array.BYTES_PER_ELEMENT).arrayBuffer();
  const numWeatherStations = new Int16Array(numWSBuf)[0];
  let offset = sliceStart + Int16Array.BYTES_PER_ELEMENT;

  console.log('numWeatherStations', numWeatherStations);

  if (numWeatherStations > 0 && numWeatherStations < 10000) {
    const wsBytes = numWeatherStations * 2 * Int16Array.BYTES_PER_ELEMENT;
    if (offset + wsBytes > totalBytes)
      return;

    const weatherStationBuf = await dataBlob.slice(offset, offset + wsBytes).arrayBuffer();
    const weatherStationArray = new Int16Array(weatherStationBuf);
    weatherStations = [];

    for (let i = 0; i < numWeatherStations; i++)
      weatherStations.push(new Weatherstation(weatherStationArray[i * 2], weatherStationArray[i * 2 + 1]));

    offset += wsBytes;
  } else if (numWeatherStations !== 0) {
    console.warn('Invalid weather station count in save file:', numWeatherStations);
    return;
  }

  offset = await loadRadarTowersFromSave(dataBlob, offset, totalBytes);

  if (offset >= totalBytes)
    return;

  const settingsText = await dataBlob.slice(offset).text();
  const jsonStr = extractJsonObject(settingsText);

  if (jsonStr)
    guiControlsFromSaveFile = jsonStr;
  else
    console.warn('No guiControls JSON found after weather stations in save file');
}

async function loadNewFormatSettings(dataBlob, sliceStart, totalBytes, fileVersion)
{
  if (sliceStart >= totalBytes)
    return;

  const settingsArrayBlob = dataBlob.slice(sliceStart);

  try {
    let tempSliceStart = 0;
    let tempSliceEnd = Uint32Array.BYTES_PER_ELEMENT;
    const guiControlsLengthBuf = await settingsArrayBlob.slice(tempSliceStart, tempSliceEnd).arrayBuffer();

    if (guiControlsLengthBuf.byteLength < Uint32Array.BYTES_PER_ELEMENT)
      throw new Error('Too short for length prefix');

    const guiControlsLength = new Uint32Array(guiControlsLengthBuf)[0];

    if (guiControlsLength > 0 && guiControlsLength < 1000000 &&
        tempSliceEnd + guiControlsLength <= settingsArrayBlob.size) {
      tempSliceStart = tempSliceEnd;
      tempSliceEnd += guiControlsLength;
      guiControlsFromSaveFile = await settingsArrayBlob.slice(tempSliceStart, tempSliceEnd).text();

      tempSliceStart = tempSliceEnd;
      await loadRadarSettingsFromSaveBlob(settingsArrayBlob, tempSliceStart);

      if (fileVersion === saveFileVersionID) {
        const radarLenBuf = await settingsArrayBlob.slice(tempSliceEnd, tempSliceEnd + Uint32Array.BYTES_PER_ELEMENT).arrayBuffer();
        if (radarLenBuf.byteLength >= Uint32Array.BYTES_PER_ELEMENT) {
          const radarLen = new Uint32Array(radarLenBuf)[0];
          const afterRadar = tempSliceEnd + Uint32Array.BYTES_PER_ELEMENT + radarLen;
          await loadAirmassSettingsFromSaveBlob(settingsArrayBlob, afterRadar);
        }
      }
      return;
    }

    throw new Error('Invalid guiControls length prefix');
  } catch (e) {
    console.log('Using legacy settings layout in save file:', e.message);
    const settingsText = await settingsArrayBlob.text();
    const jsonStr = extractJsonObject(settingsText);

    if (jsonStr) {
      guiControlsFromSaveFile = jsonStr;
      const tail = settingsText.slice(settingsText.indexOf(jsonStr) + jsonStr.length);
      const arrStart = tail.indexOf('[');
      if (arrStart >= 0) {
        try {
          const arrEnd = tail.indexOf(']', arrStart);
          if (arrEnd >= 0)
            applyRadarSettingsFromSave(JSON.parse(tail.slice(arrStart, arrEnd + 1)));
        } catch (_) { /* no radar settings in legacy tail */ }
      }
    } else {
      console.warn('Could not locate guiControls JSON in settings section');
    }
  }
}


window.loadData = async function()
{
  let file = document.getElementById('fileInput').files[0];

  if (file) {                                                    // load data from save file
    guiControlsFromSaveFile = null;
    weatherStations = [];
    radars = [];
    airmassGenerators = [];

    let versionBlob = file.slice(0, 4);                          // extract first 4 bytes containing version id
    let versionBuf = await versionBlob.arrayBuffer();
    let version = new Uint32Array(versionBuf)[0];                // convert to Uint32

    if (version == saveFileVersionID || version == 263574037 || version == 263574036 || version == 1939327491) { // allow current, previous, and older version
      // check version id, only proceed if file has the right version id
      let fileArrBuf = await file.slice(4).arrayBuffer();
      let fileUint8Arr = new Uint8Array(fileArrBuf);
      let decompressed;
      try {
        decompressed = window.pako.inflate(fileUint8Arr);
      } catch(e) {
        alert('Failed to decompress save file. The file may be corrupted or from an incompatible version.');
        document.getElementById('fileInput').value = '';
        return;
      }
      let dataBlob = new Blob([ decompressed ]);

      let sliceStart = 0;
      let sliceEnd = 4;

      let resBlob = dataBlob.slice(sliceStart, sliceEnd);
      let resBuf = await resBlob.arrayBuffer();
      resArray = new Uint16Array(resBuf);
      sim_res_x = resArray[0];
      sim_res_y = resArray[1];

      if (!sim_res_x || !sim_res_y || sim_res_x > 16000 || sim_res_y > 10000) {
        alert('Save file has invalid resolution (' + sim_res_x + 'x' + sim_res_y + '). File may be corrupted.');
        document.getElementById('fileInput').value = '';
        return;
      }

      NUM_DROPLETS = (sim_res_x * sim_res_y) / NUM_DROPLETS_DEVIDER;
      if (guiControls && guiControls.reducedPrecipitation) {
        NUM_DROPLETS = Math.floor(NUM_DROPLETS * 0.5); // Reduce droplets by 50%
      }
      NUM_DROPLETS = Math.min(NUM_DROPLETS, 120000); // safety cap to prevent freeze on large old files

      saveFileName = file.name;

      if (saveFileName.includes('.')) {
        saveFileName = saveFileName.split('.').slice(0, -1).join('.'); // remove extension
      }

      console.log('loading file: ' + saveFileName);
      console.log('File versionID: ' + version);
      console.log('sim_res_x: ' + sim_res_x);
      console.log('sim_res_y: ' + sim_res_y);
      console.log('Total decompressed size:', decompressed.byteLength);


      sliceStart = sliceEnd;
      sliceEnd += sim_res_x * sim_res_y * 4 * 4;
      console.log('baseTex slice:', sliceStart, 'to', sliceEnd, 'size:', sliceEnd - sliceStart);
      let baseTexBlob = dataBlob.slice(sliceStart, sliceEnd);
      let baseTexBuf = await baseTexBlob.arrayBuffer();
      let baseTexF32 = new Float32Array(baseTexBuf);

      sliceStart = sliceEnd;
      sliceEnd += sim_res_x * sim_res_y * 4 * 4; // 4 * float
      console.log('waterTex slice:', sliceStart, 'to', sliceEnd, 'size:', sliceEnd - sliceStart);
      let waterTexBlob = dataBlob.slice(sliceStart, sliceEnd);
      let waterTexBuf = await waterTexBlob.arrayBuffer();
      let waterTexF32 = new Float32Array(waterTexBuf);

      sliceStart = sliceEnd;
      sliceEnd += sim_res_x * sim_res_y * 4 * 1; // 4 * byte
      console.log('wallTex slice:', sliceStart, 'to', sliceEnd, 'size:', sliceEnd - sliceStart);
      let wallTexBlob = dataBlob.slice(sliceStart, sliceEnd);
      let wallTexBuf = await wallTexBlob.arrayBuffer();
      let wallTexI8 = new Int8Array(wallTexBuf);

      // Read precipitation: format stores droplet count (263574037 and newer)
      if (version == saveFileVersionID || version == 263574037) {
        sliceStart = sliceEnd;
        sliceEnd += 1 * Uint32Array.BYTES_PER_ELEMENT;
        let numDropletsBlob = dataBlob.slice(sliceStart, sliceEnd);
        let numDropletsBuf = await numDropletsBlob.arrayBuffer();
        let savedNumDroplets = new Uint32Array(numDropletsBuf)[0];
        NUM_DROPLETS = savedNumDroplets;
        console.log('Loaded saved NUM_DROPLETS:', NUM_DROPLETS);

        sliceStart = sliceEnd;
        sliceEnd += NUM_DROPLETS * Float32Array.BYTES_PER_ELEMENT * 5;
        console.log('precipArray slice:', sliceStart, 'to', sliceEnd, 'size:', sliceEnd - sliceStart);
        
        if (sliceEnd > decompressed.byteLength) {
          console.error('ERROR: precipArray slice extends past end of file!');
          alert('Save file appears to be corrupted.');
          document.getElementById('fileInput').value = '';
          return;
        }
        
        let precipArrayBlob = dataBlob.slice(sliceStart, sliceEnd);
        let precipArrayBuf = await precipArrayBlob.arrayBuffer();
        precipArray = new Float32Array(precipArrayBuf);
        console.log('precipArray actual length:', precipArray.length, 'expected:', NUM_DROPLETS * 5);
      } else if (version == 263574036 || version == 1939327491) {
        // Master / legacy format: precipitation size is derived from resolution (no saved droplet count)
        NUM_DROPLETS = Math.min(NUM_DROPLETS, 120000);
        sliceStart = sliceEnd;
        sliceEnd += NUM_DROPLETS * Float32Array.BYTES_PER_ELEMENT * 5;
        if (sliceEnd <= decompressed.byteLength) {
          let precipArrayBlob = dataBlob.slice(sliceStart, sliceEnd);
          let precipArrayBuf = await precipArrayBlob.arrayBuffer();
          precipArray = new Float32Array(precipArrayBuf);
          console.log('Loaded precipitation from legacy save file (version ' + version + ')');
        } else {
          sliceEnd = sliceStart;
          precipArray = null;
          console.log('No precipitation section in legacy save file — using defaults');
        }
      } else {
        precipArray = null;
      }

      if (version == saveFileVersionID || version == 263574037) {             // formats with saved droplet count
        console.log('Loading weather stations, radars, and settings for new version');
        
        // Helper: safely read a slice — returns null if not enough bytes remain
        const totalBytes = decompressed.byteLength;
        function safeSlice(start, end) {
          if (start >= totalBytes) return null;
          return dataBlob.slice(start, Math.min(end, totalBytes));
        }

        try { // wrap entire optional section — any parse error falls back to defaults

        sliceStart = sliceEnd;
        sliceEnd += 1 * Int16Array.BYTES_PER_ELEMENT;
        const numWSBlob = safeSlice(sliceStart, sliceEnd);
        let numWeatherStations = 0;
        if (numWSBlob) {
          let numWeatherStationsBuf = await numWSBlob.arrayBuffer();
          if (numWeatherStationsBuf.byteLength >= Int16Array.BYTES_PER_ELEMENT) {
            numWeatherStations = new Int16Array(numWeatherStationsBuf)[0];
          }
        }

        console.log('numWeatherStations', numWeatherStations);

        if (numWeatherStations > 0 && numWeatherStations < 10000) {
          sliceStart = sliceEnd;
          sliceEnd += numWeatherStations * 2 * Int16Array.BYTES_PER_ELEMENT;
          const wsBlob = safeSlice(sliceStart, sliceEnd);
          if (wsBlob) {
            let weatherStationBuf = await wsBlob.arrayBuffer();
            const safeLen = Math.floor(weatherStationBuf.byteLength / Int16Array.BYTES_PER_ELEMENT) * Int16Array.BYTES_PER_ELEMENT;
            if (safeLen >= 2 * Int16Array.BYTES_PER_ELEMENT) {
              let weatherStationArray = new Int16Array(weatherStationBuf, 0, safeLen / Int16Array.BYTES_PER_ELEMENT);
              const count = Math.floor(weatherStationArray.length / 2);
              for (i = 0; i < count; i++) {
                weatherStations.push(new Weatherstation(weatherStationArray[i * 2], weatherStationArray[i * 2 + 1]));
              }
            }
          }
        } else {
          sliceEnd = sliceStart + numWeatherStations * 2 * Int16Array.BYTES_PER_ELEMENT;
        }

        sliceStart = await loadRadarTowersFromSave(dataBlob, sliceEnd, totalBytes);

        if (version == saveFileVersionID)
          sliceStart = await loadAirmassGeneratorsFromSave(dataBlob, sliceStart, totalBytes);

        sliceEnd = sliceStart;
        if (sliceStart < totalBytes)
          await loadNewFormatSettings(dataBlob, sliceStart, totalBytes, version);
        else
          console.log('Save file has no settings section — using defaults');

        } catch(e) {
          // Older file with same version ID but missing/truncated optional sections
          console.warn('Could not load optional save data (weather stations, radars, settings) — using defaults. Reason:', e.message);
        }
      } else if (version == 263574036) {
        try {
          await loadMasterFormatSettings(dataBlob, sliceEnd, decompressed.byteLength);
          console.log('Loaded guiControls from master-format save file (v263574036)');
        } catch (e) {
          console.warn('Could not load settings from master-format save file:', e.message);
        }
      } else if (version == 1939327491) {
        weatherStations = [];
        radars = [];
        console.log('Oldest save format — simulation textures loaded, default settings used');
      }

      mainScript(baseTexF32, waterTexF32, wallTexI8, precipArray);
    } else {
      // wrong id
      alert('Incompatible file!');
      document.getElementById('fileInput').value = ''; // clear file
    }
  } else {
    // no file, so create new simulation
    sim_res_x = parseInt(document.getElementById('simResSelX').value);
    sim_res_y = parseInt(document.getElementById('simResSelY').value);
    sim_height = parseInt(document.getElementById('simHeightSel').value);

    NUM_DROPLETS = (sim_res_x * sim_res_y) / NUM_DROPLETS_DEVIDER;
    if (guiControls && guiControls.reducedPrecipitation) {
      NUM_DROPLETS = Math.floor(NUM_DROPLETS * 0.5); // Reduce droplets by 50%
    }
    SETUP_MODE = true;

    mainScript(null); // run without initial textures
  }
}

function loadImage(url)
{
  return new Promise((resolve, reject) => {
    let img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

class LoadingBar
{
  #loadingBar;
  #bar;
  #underBar;
  #percent;
  #description;

  constructor(percentIn)
  {
    if (percentIn == null)
      this.percent = 0;
    else
      this.percent = percentIn;

    // create html
    this.loadingBar = document.createElement('div');
    this.bar = document.createElement('div');
    this.loadingBar.appendChild(this.bar);

    this.underBar = document.createElement('div');
    this.loadingBar.appendChild(this.underBar);

    this.loadingBar.style.width = '100%';
    this.loadingBar.style.height = '100px';
    this.loadingBar.style.color = 'white';
    this.loadingBar.style.textAlign = 'center';
    this.loadingBar.style.lineHeight = '50px';
    this.loadingBar.style.backgroundColor = 'gray';
    this.loadingBar.style.marginTop = '400px';
    this.loadingBar.style.position = 'absolute';
    this.loadingBar.style.zIndex = '2';

    this.underBar.style.width = '100%';
    this.underBar.style.height = '50px';
    this.underBar.style.backgroundColor = 'black';

    this.bar.style.height = '50px';

    this.bar.style.backgroundColor = 'green';
    this.bar.style.fontSize = '20px';

    this.#update();

    document.body.appendChild(this.loadingBar);
  }

  async add(num, text)
  {
    this.percent += num;
    this.description = text;
    await this.#update();
  }

  async set(num, text)
  {
    this.percent = num;
    this.description = text;
    await this.#update();
  }

  async showError(error)
  {
    this.bar.style.backgroundColor = 'red';
    this.description = error;
    await this.#update();
  }

  #update()
  {
    return new Promise((resolve) => {
      this.bar.style.width = this.percent + '%';
      this.bar.innerHTML = this.percent + '%';
      this.underBar.innerHTML = this.description;
      let timeout;
      if (this.percent == 100)
        timeout = 5;
      else
        timeout = 5; // 50 for nicer feel
      setTimeout(() => { resolve(); }, timeout);
    });
  }

  remove() { this.loadingBar.parentNode.removeChild(this.loadingBar); }
}


function setLoadingBar()
{
  return new Promise((resolve) => {
    var element = document.getElementById('IntroScreen');
    element.parentNode.removeChild(element); // remove introscreen div

    var nav = document.querySelector('.main-nav');
    if (nav) nav.classList.add('sim-running');

    document.body.style.backgroundColor = 'black';

    loadingBar = new LoadingBar(1);

    setTimeout(() => { resolve(); }, 10);
  });
}

var soundingData;
var realWorldSounding_T;
var realWorldSounding_W;
var realWorldSounding_Vel;
var customSoundingLoaded = false;

function saveSoundingToFile()
{
  if (!soundingData || soundingData.length === 0) {
    alert('No sounding data to save!');
    return;
  }

  // Create header with metadata
  let content = "# Sounding Data Export\n";
  content += "# Alt(m), Pressure(hPa), Temp(C), WetBulb(C), DewPoint(C), RH(%), Velocity(km/h), Angle(deg)\n";
  
  // Add data rows
  soundingData.forEach(row => {
    content += `${row.alt.toFixed(1)}, ${row.p.toFixed(1)}, ${row.t.toFixed(1)}, ${row.tw.toFixed(1)}, ${row.td.toFixed(1)}, ${row.rh.toFixed(1)}, ${row.vel.toFixed(1)}, ${row.angle.toFixed(1)}\n`;
  });

  // Create download
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sounding_data.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadSoundingFromFile(file)
{
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split('\n');
    const newSoundingData = [];
    
    lines.forEach(line => {
      line = line.trim();
      // Skip comments and empty lines
      if (line.startsWith('#') || line === '') return;
      
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 8) {
        const rowData = {
          alt: parseFloat(parts[0]),
          p: parseFloat(parts[1]),
          t: parseFloat(parts[2]),
          tw: parseFloat(parts[3]),
          td: parseFloat(parts[4]),
          rh: parseFloat(parts[5]),
          vel: parseFloat(parts[6]),
          angle: parseFloat(parts[7])
        };
        
        // Validate data
        if (!Object.values(rowData).some(v => isNaN(v))) {
          newSoundingData.push(rowData);
        }
      }
    });
    
    if (newSoundingData.length > 0) {
      soundingData = newSoundingData;
      customSoundingLoaded = true; // Mark that a custom sounding was loaded
      console.log('Loaded custom sounding data sample:', newSoundingData[0], newSoundingData[Math.floor(newSoundingData.length/2)], newSoundingData[newSoundingData.length-1]);
      // Update the sounding uniforms in the shader (only if simulation is initialized)
      if (guiControls && guiControls.simHeight && realWorldSounding_T) {
        updateSoundingUniforms();
        console.log('Updated sounding uniforms. realWorldSounding_T[0]:', realWorldSounding_T[0], 'realWorldSounding_T[100]:', realWorldSounding_T[100]);
      } else {
        console.log('Simulation not yet initialized, uniforms will be updated when simulation starts');
      }
      // Update the preview image
      updateSoundingPreview(newSoundingData);
      alert('Sounding loaded successfully! Use the Sounding Forcing slider to apply it to the simulation.');
    } else {
      alert('Failed to load sounding data. Invalid file format.');
    }
  };
  reader.readAsText(file);
}

function updateSoundingUniforms()
{
  if (!soundingData || soundingData.length < 10) return;
  if (!guiControls || !guiControls.simHeight) {
    console.warn('guiControls not initialized yet, cannot update sounding uniforms');
    return;
  }
  if (!realWorldSounding_T || !realWorldSounding_W || !realWorldSounding_Vel) {
    console.warn('Sounding arrays not initialized yet, cannot update sounding uniforms');
    return;
  }
  
  var soundingForSim = rawSoundingToSimSounding(soundingData, guiControls.simHeight, sim_res_y + 1);
  
  for (var y = 0; y < sim_res_y + 1; y++) {
    let soundingSample = soundingForSim[y];
    realWorldSounding_T[y] = realToPotentialT(CtoK(soundingSample.t), y);
    realWorldSounding_W[y] = maxWater(CtoK(soundingSample.td), y);
    realWorldSounding_Vel[y] = soundingSample.vel;
  }
  
  gl.useProgram(advectionProgram);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Tv'), realWorldSounding_T);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Wv'), realWorldSounding_W);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Velv'), realWorldSounding_Vel);
}

function updateSoundingPreview(soundingData)
{
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  
  // Find min/max altitude and temperature
  const alts = soundingData.map(d => d.alt);
  const temps = soundingData.map(d => d.t);
  const dewpoints = soundingData.map(d => d.td);
  
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const minTemp = Math.min(...temps, ...dewpoints) - 5;
  const maxTemp = Math.max(...temps, ...dewpoints) + 5;
  
  // Helper to map coordinates
  const mapX = (temp) => ((temp - minTemp) / (maxTemp - minTemp)) * (canvas.width - 40) + 20;
  const mapY = (alt) => canvas.height - ((alt - minAlt) / (maxAlt - minAlt)) * (canvas.height - 40) - 20;
  
  // Draw temperature line (red)
  ctx.strokeStyle = '#ff4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  soundingData.forEach((d, i) => {
    const x = mapX(d.t);
    const y = mapY(d.alt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Draw dewpoint line (blue)
  ctx.strokeStyle = '#4444ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  soundingData.forEach((d, i) => {
    const x = mapX(d.td);
    const y = mapY(d.alt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Labels
  ctx.fillStyle = '#fff';
  ctx.font = '12px Arial';
  ctx.fillText('Temperature (°C)', 20, 15);
  ctx.fillText('Altitude (m)', canvas.width - 80, canvas.height - 5);
  
  // Legend
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(20, canvas.height - 30, 20, 10);
  ctx.fillStyle = '#fff';
  ctx.fillText('Temp', 45, canvas.height - 20);
  
  ctx.fillStyle = '#4444ff';
  ctx.fillRect(100, canvas.height - 30, 20, 10);
  ctx.fillStyle = '#fff';
  ctx.fillText('Dewpoint', 125, canvas.height - 20);
  
  // Update preview image
  const soundingImgEl = document.getElementById('soundingPreview');
  soundingImgEl.src = canvas.toDataURL();
}

async function prepareSounding()
{
  const dateSel = document.getElementById('datePicker');
  const date = new Date(dateSel.value);
  let epochTime = Math.floor(date.getTime() / 1000);

  const hourSelector = document.getElementById('hourSelector');
  const hour = hourSelector.options[hourSelector.selectedIndex].value;

  epochTime += hour * 3600;

  soundingData = await loadSounding(stationSelector.options[stationSelector.selectedIndex].value, epochTime);
  customSoundingLoaded = false; // This is a real-world sounding, not custom
  
  // Update the shader uniforms with the new sounding data
  if (soundingData && soundingData.length > 10) {
    updateSoundingUniforms();
  }
}

async function mainScript(initialBaseTex, initialWaterTex, initialWallTex, initialRainDrops)
{


  await setLoadingBar();

  let lastSaveTime = new Date();
  let postProcessingProgram;

  class Camera
  {
    #spring = 0.02;   // 0.02
    #damp = 0.70;     // 0.70
    wrapHorizontally; // bool
    smooth;           // bool
    curXpos;
    curXposLin;
    curYpos;
    curZoom;
    tarXpos;
    tarYpos;
    tarZoom;
    #Xvel;
    #Yvel;
    #Zvel;

    constructor()
    {
      this.curXpos = 0;
      this.curXposLin = 0;
      this.curYpos = -0.5 + sim_res_y / sim_res_x; // viewYpos = -0.5 + sim_res_y / sim_res_x;// match bottem of sim area to bottem of screen
      this.curZoom = 1.0001;
      this.tarXpos = 0;
      this.tarYpos = -0.5 + sim_res_y / sim_res_x;
      this.tarZoom = 1.0001;
      this.wrapHorizontally = true;
      this.smooth = true;
      this.#Xvel = 0;
      this.#Yvel = 0;
      this.#Zvel = 0;
    }

    center()
    {
      this.tarXpos = this.curXpos = this.curXposLin = 0.0;
      this.tarYpos = this.curYpos = -0.5 + sim_res_y / sim_res_x;
      this.tarZoom = this.curZoom = 1.0001;
      this.#Xvel = 0;
      this.#Yvel = 0;
      this.#Zvel = 0;
    }

    changeCurXpos(change)
    {
      this.curXposLin = this.curXposLin + change;
      this.curXpos = mod(this.curXposLin + 1.0, 2.0) - 1.0;
    }

    setPosition(x, y, zoom)
    {
      this.curXpos = this.tarXpos = x;
      this.curYpos = this.tarYpos = y;

      if (zoom)
        this.curZoom = this.tarZoom = zoom;
    }

    move()
    {
      let xDif = this.tarXpos - this.curXposLin;
      let yDif = this.tarYpos - this.curYpos;
      let zoomDif = this.tarZoom - this.curZoom;
      if (this.smooth) {
        this.#Xvel += xDif * this.#spring;
        this.#Xvel *= this.#damp;
        this.changeCurXpos(this.#Xvel);

        this.#Yvel += yDif * this.#spring;
        this.#Yvel *= this.#damp;
        this.curYpos += this.#Yvel;

        this.#Zvel += zoomDif * this.#spring;
        this.#Zvel *= this.#damp;
        this.curZoom += this.#Zvel;
      } else {
        this.changeCurXpos(xDif);
        this.curYpos += yDif;
        this.curZoom += zoomDif;
      }

      // Throttle sound readbacks to every 4th frame — audible change rate is ~15 Hz, well above 4-6 Hz
      if (guiControls.sound && !guiControls.paused && (frameNum % 4 === 0)) {
        soundSystem.updateAmbientSound(this.curXpos, this.curYpos, this.curZoom);
      }
    }

    changeViewZoom(change)
    {
      this.tarZoom *= 1.0 + change;

      let minZoom = 0.5;
      let maxZoom = 35.0 * sim_aspect;

      if (this.tarZoom > maxZoom) {
        this.tarZoom = maxZoom;
        return false;
      } else if (this.tarZoom < minZoom) {
        this.tarZoom = minZoom;
        return false;
      } else {
        return true;
      }
    }

    changeViewXpos(change)
    {
      this.tarXpos += change;
      if (!this.wrapHorizontally)
        this.tarXpos = clamp(this.tarXpos, -0.99, 0.99);
    }

    changeViewYpos(change) { this.tarYpos = clamp(this.tarYpos + change, -2.50, 0.50); }

    zoomAtMousePos(delta)
    {
      if (cam.changeViewZoom(delta)) {
        // zoom center at mouse position
        var mousePositionZoomCorrectionX = (((mouseX - canvas.width / 2 + this.tarXpos) * delta) / cam.tarZoom / canvas.width) * 2.0;
        var mousePositionZoomCorrectionY = ((((mouseY - canvas.height / 2 + this.tarYpos) * delta) / cam.tarZoom / canvas.height) * 2.0) / canvas_aspect;
        this.changeViewXpos(-mousePositionZoomCorrectionX);
        this.changeViewYpos(mousePositionZoomCorrectionY);
      }
    }
  }

  cam = new Camera();

  class JetEngineSoundGenerator
  {
    constructor(ctx) { this.audioCtx = ctx; }

    createSource(bufferSize)
    {
      const bufferSource = this.audioCtx.createBufferSource();
      bufferSource.buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      return bufferSource;
    }

    createLowNoiseSource()
    {
      const bufferSize = 20 * this.audioCtx.sampleRate;
      const bufferSource = this.createSource(bufferSize);
      const data = bufferSource.buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 2)
        data[i] = Math.random() * 2 - 1;
      for (let i = 1; i < bufferSize - 1; i += 2)   // Fill in the gaps
        data[i] = (data[i - 1] + data[i + 1]) / 2.; // average of surrounding samples
      return bufferSource;
    }

    start()
    {
      // High-pitch turbine whine
      this.lowWhine = this.audioCtx.createOscillator();
      this.lowWhine.type = "sine";
      this.lowWhineGain = this.audioCtx.createGain();

      this.highWhine = this.audioCtx.createOscillator();
      this.highWhine.type = "sine";
      this.highWhineGain = this.audioCtx.createGain();

      // low rumble noise
      this.lowNoiseSource = this.createLowNoiseSource();
      this.lowNoiseSource.loop = true;
      this.lowNoiseFilter = this.audioCtx.createBiquadFilter();
      this.lowNoiseFilter.type = "lowpass";
      this.lowNoiseFilter.Q.value = 5.5;
      this.lowNoiseGain = this.audioCtx.createGain();

      // stereo pan
      this.pan = this.audioCtx.createStereoPanner();

      // Master mix
      this.mix = this.audioCtx.createGain();
      this.mix.gain.value = 0.;

      // Connect graph
      this.lowWhine.connect(this.lowWhineGain).connect(this.mix);
      this.highWhine.connect(this.highWhineGain).connect(this.mix);
      this.lowNoiseSource.connect(this.lowNoiseFilter).connect(this.lowNoiseGain).connect(this.mix);
      this.mix.connect(this.pan).connect(this.audioCtx.destination);

      // Start
      this.lowWhine.start();
      this.highWhine.start();
      this.lowNoiseSource.start();
    }

    update(N1, dist, horizontalAngle)
    {
      const rpm = N1 * 7000;
      const whineFreq = 100 + rpm * 1.0; // 300 + rpm * 0.8;
      const noiseFreq = N1 * 600;        // 200 + N1 * 300;

      this.lowWhine.frequency.value = whineFreq / 2.;
      this.highWhine.frequency.value = whineFreq;
      this.lowNoiseFilter.frequency.value = noiseFreq;

      const airVol = Math.sqrt(N1) * 3.;
      const whineVol = Math.sqrt(Math.min(N1, 0.3)) * 0.005;

      this.lowNoiseGain.gain.value = airVol;
      this.lowWhineGain.gain.value = whineVol;
      this.highWhineGain.gain.value = whineVol;

      dist += 1.0; // prevent devide by 0

      this.pan.pan.value = -horizontalAngle / 90.;
      this.mix.gain.value = 170.0 / dist;
    }

    mute() { if (this.mix && this.mix.gain) this.mix.gain.value = 0.; }

    stop()
    {
      this.mix.gain.value = 0;
      this.lowWhine.stop();
      this.highWhine.stop();
      this.lowNoiseSource.stop();
    }
  }

  class SoundSystem
  {
    audioCtx;
    jetEngineSound;

    thunderCCSounds = [];
    thunderCGSounds = [];

    urban_sound;
    forest_sound;
    beach_sound;
    rain_sound;
    wind_sound;


    constructor()
    {
      this.audioCtx = new window.AudioContext();
      this.jetEngineSound = new JetEngineSoundGenerator(this.audioCtx);
      // load sound files asynchronously
      this.loadThunderSounds('cc', 8).then(buffers => { this.thunderCCSounds = buffers; });
      this.loadThunderSounds('cg', 8).then(buffers => { this.thunderCGSounds = buffers; });

      this.loadSound('urban.m4a').then(buffer => { this.urban_sound = this.playLoop(buffer, 0.0); });
      this.loadSound('forest.mp3').then(buffer => { this.forest_sound = this.playLoop(buffer, 0.0); });
      this.loadSound('beach.mp3').then(buffer => { this.beach_sound = this.playLoop(buffer, 0.0); });
      this.loadSound('rain.m4a').then(buffer => { this.rain_sound = this.playLoop(buffer, 0.0); });
      this.loadSound('wind.m4a').then(buffer => { this.wind_sound = this.playLoop(buffer, 0.0); });
    }

    async loadSound(url)
    {
      const resp = await fetch('resources/sounds/' + url);
      const arrayBuffer = await resp.arrayBuffer();
      return await this.audioCtx.decodeAudioData(arrayBuffer);
    }

    async loadThunderSounds(name, num)
    {
      const soundPromises = [];
      for (let i = 1; i <= num; i++) {
        const filename = name + `${i}.m4a`;
        soundPromises.push(this.loadSound(filename));
      }
      return await Promise.all(soundPromises);
    }

    soundThunder(x, y, intensity)
    {
      if (!Number.isFinite(x) || !Number.isFinite(y))
        return;

      let camXnorm = 1. - (cam.curXpos + 1.0) / 2.0;

      let camDistFromSim = cellHeight * sim_res_x * 0.5 / Math.max(cam.curZoom, 1e-6);

      let camHorDistFromStrike = (x - camXnorm) * cellHeight * sim_res_x;

      let vecStrikeToCam = new Vec2D(camDistFromSim, camHorDistFromStrike);

      let distance = vecStrikeToCam.mag();
      if (!Number.isFinite(distance))
        distance = 1000.0;

      let leftRightBalance = -vecStrikeToCam.angle();
      if (!Number.isFinite(leftRightBalance))
        leftRightBalance = 0.0;

      // Speed of sound ≈ 343 m/s — thunder follows the flash, delayed by distance
      let soundDelay = distance / 343;
      soundDelay = Math.max(soundDelay, 0.12);

      let simTimeMult = timePerIteration * guiControls.IterPerFrame * FPS * 3600; // how much faster sim time is than real time

      soundDelay /= simTimeMult;
      soundDelay = Math.min(Math.max(soundDelay, 0.0), 120.0);

      if (!guiControls.soundThunderEnabled) return;

      const safeIntensity = Number.isFinite(intensity) ? clamp(intensity, 0.0, 2.0) : 0.5;
      let soundArray = safeIntensity > 0.75 ? this.thunderCGSounds : this.thunderCCSounds;
      if (!soundArray || soundArray.length === 0) return;
      let randomThunderSound = soundArray[Math.floor(Math.random() * soundArray.length)];
      if (!randomThunderSound) return;
      const thunderVol = guiControls.soundVolumeThunder ?? 1.0;
      let volume = safeIntensity * 0.16 * thunderVol;
      volume /= (1.0 + distance * 0.004);
      volume = clamp(volume, 0.0, 0.55);
      this.playOnce(randomThunderSound, volume, leftRightBalance, soundDelay);
    }

    playOnce(buffer, volume = 1, leftRightBalance = 0, delay = 0)
    {
      if (!buffer) return;
      const safeVolume = Number.isFinite(volume) ? clamp(volume, 0.0, 1.0) : 0.0;
      const safePan = Number.isFinite(leftRightBalance) ? clamp(leftRightBalance, -1., 1.) : 0.0;
      const safeDelay = Number.isFinite(delay) ? clamp(delay, 0.0, 120.0) : 0.12;
      const src = this.audioCtx.createBufferSource();
      const gain = this.audioCtx.createGain();
      const pan = this.audioCtx.createStereoPanner();
      src.buffer = buffer;
      src.loop = false;
      gain.gain.value = safeVolume;
      pan.pan.value = safePan;
      src.connect(gain).connect(pan).connect(this.audioCtx.destination);
      src.start(this.audioCtx.currentTime + safeDelay);
    }

    playLoop(buffer, volume = 1, leftRightBalance = 0)
    {
      const src = this.audioCtx.createBufferSource();
      const gain = this.audioCtx.createGain();
      const pan = this.audioCtx.createStereoPanner();
      src.buffer = buffer;
      src.loop = true;
      gain.gain.value = volume;
      pan.pan.value = clamp(leftRightBalance, -1., 1.);
      src.connect(gain).connect(pan).connect(this.audioCtx.destination);
      src.start();
      return {gain : gain.gain, pan : pan.pan};
    }

    updateAmbientSound(Xpos, Ypos, zoom)
    {
      let camDistFromSim = cellHeight * sim_res_x * 0.5 / zoom; // asuming 90° HFOV

      if (camDistFromSim < 5000) {

        const sampleWidth = Math.floor(clamp(camDistFromSim / cellHeight * 3, 30, 200)); // sample just a litte wider than the fov
        const sampleWidth_2 = Math.floor(sampleWidth / 2);
        const sampleWidth_3 = Math.floor(sampleWidth / 3);

        let simXpos = Math.floor((-Xpos + 1) * 0.5 * sim_res_x);
        let simYpos = clamp(Math.floor((-Ypos * sim_aspect + 1) * 0.5 * sim_res_y), 0, sim_res_y - 1);

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT2); // walltexture

        // Reuse a pre-allocated buffer sized to the max possible sampleWidth (200)
        // to avoid allocating a new Int8Array on every call (GC pressure).
        if (!this._wallScratch || this._wallScratch.length < 4 * 200)
          this._wallScratch = new Int8Array(4 * 200);
        const wallTextureValues = this._wallScratch;
        gl.readPixels(simXpos - sampleWidth_2, simYpos, sampleWidth, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues);

        let cellsAboveSurface = wallTextureValues[sampleWidth_2 * 4 + 2];

        let camHeightAboveSurface = cellsAboveSurface * cellHeight;

        let vecCamToSurface = new Vec2D(camDistFromSim, camHeightAboveSurface);

        let distanceToSurface = vecCamToSurface.mag();

        // Use plain scalars instead of Vec2D objects to avoid GC pressure in the hot loop
        let forestL = 0, forestR = 0, beachL = 0, beachR = 0, urbanL = 0, urbanR = 0;

        let distVolumeMult = map_range_C(1.0 / (clamp(distanceToSurface, 1000, 5000) / 1000.0), 0.2, 1.0, 0.0, 1.0); // multiplier based on camera distance to surface

        const sq3 = sampleWidth_3 * sampleWidth_3;
        for (let i = 0; i < sampleWidth; i++) {
          const Lgain = clamp((sampleWidth_3 - Math.abs(i - sampleWidth_3)) / sq3, 0., 1.);
          const Rgain = clamp((sampleWidth_3 - Math.abs(i - sampleWidth_3 * 2)) / sq3, 0., 1.);
          const wType = wallTextureValues[i * 4 + 0];

          if (wType == 1) { // land vegetation
            const vegetationNorm = wallTextureValues[i * 4 + 3] / 127.0;
            forestL += Lgain * vegetationNorm;
            forestR += Rgain * vegetationNorm;
          } else if (wType == 2) { // water
            beachL += Lgain;
            beachR += Rgain;
          } else if (wType == 4 || wType == 6) { // urban or industrial
            urbanL += Lgain;
            urbanR += Rgain;
          }
        }

        const forest = new Vec2D(forestL * distVolumeMult * 0.15, forestR * distVolumeMult * 0.15);
        const beach  = new Vec2D(beachL  * distVolumeMult * 1.0,  beachR  * distVolumeMult * 1.0);
        const urban  = new Vec2D(urbanL  * distVolumeMult * 1.0,  urbanR  * distVolumeMult * 1.0);

        const ambientMult = guiControls.soundAmbientEnabled ? guiControls.soundVolumeAmbient : 0.0;
        this.setSoundLeftRight(this.forest_sound, forest.x * ambientMult, forest.y * ambientMult);
        this.setSoundLeftRight(this.beach_sound,  beach.x  * ambientMult, beach.y  * ambientMult);
        this.setSoundLeftRight(this.urban_sound,  urban.x  * ambientMult, urban.y  * ambientMult);

        // wind sound — reuse pre-allocated Float32Array
        gl.readBuffer(gl.COLOR_ATTACHMENT0); // basetexture
        if (!this._baseScratch) this._baseScratch = new Float32Array(4);
        const baseTextureValues = this._baseScratch;
        let justAboveSurfaceCellY = simYpos - cellsAboveSurface + 3;
        gl.readPixels(simXpos, justAboveSurfaceCellY, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues); // read single cell at mouse position

        let windVolume = Math.abs(baseTextureValues[0]) * 10.0;
        windVolume *= distVolumeMult;
        windVolume *= guiControls.soundWindEnabled ? guiControls.soundVolumeWind : 0.0;
        this.setSoundGainAndPan(this.wind_sound, windVolume);

        let tempC = KtoC(potentialToRealT(baseTextureValues[3], justAboveSurfaceCellY));

        // rain sound

        let rainVolume = 0;

        if (tempC > 0) {

          gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
          if (!this._waterScratch) this._waterScratch = new Float32Array(4);
          const waterTextureValues = this._waterScratch;

          gl.readPixels(simXpos, justAboveSurfaceCellY, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);

          rainVolume = Math.pow(waterTextureValues[2] * 0.5, 0.5);

          rainVolume *= map_range_C(tempC, 0., 3., 0., 1.); // rain sound fades as temperature approaches 0 (wet snow)
          rainVolume *= distVolumeMult;
          rainVolume *= guiControls.soundRainEnabled ? guiControls.soundVolumeRain : 0.0;
        }

        this.setSoundGainAndPan(this.rain_sound, rainVolume);

        //    console.log(distVolumeMult, rainVolume, windVolume);
      }

      if (airplaneMode) {
        let camXnorm = 1. - (cam.curXpos + 1.0) / 2.0;
        let camYnorm = 1. - (cam.curYpos * sim_aspect + 1.0) / 2.0;

        //    console.log(camXnorm, airplane.phys.pos.x);

        const vecCamToPlaneOnFlatSimArea = airplane.phys.pos.copy().subtract(new Vec2D(camXnorm * cellHeight * sim_res_x, camYnorm * cellHeight * sim_res_y));

        const distCamToPlane = new Vec2D(vecCamToPlaneOnFlatSimArea.mag(), camDistFromSim).mag();

        const horizontalAngleCamToPlane = new Vec2D(camDistFromSim, vecCamToPlaneOnFlatSimArea.x).angle() * radToDeg;

        this.jetEngineSound.update(airplane.getN1(), distCamToPlane, horizontalAngleCamToPlane);
      }
    }

    setSoundLeftRight(sound, L, R)
    {
      let gain = Math.max(L, R);
      if (gain == 0) {
        this.setSoundGainAndPan(sound, 0, 0);
        return;
      }
      let pan = (R - L) / gain;
      this.setSoundGainAndPan(sound, gain, pan);
    }

    setSoundGainAndPan(sound, gain, pan = 0.0)
    {
      if (sound) {
        sound.gain.value = gain;
        sound.pan.value = pan;
      }
    }

    mute()
    {
      this.setSoundGainAndPan(this.forest_sound, 0);
      this.setSoundGainAndPan(this.beach_sound, 0);
      this.setSoundGainAndPan(this.urban_sound, 0);
      this.setSoundGainAndPan(this.rain_sound, 0);
      this.setSoundGainAndPan(this.wind_sound, 0);
      this.jetEngineSound.mute();
    }
  }

  // AIRPLANE

  class PIDController
  {
    #previousValue;
    #previousError;
    integral;

    constructor(kp, ki, kd, iThreshold)
    {
      this.kp = kp; // Proportional gain
      this.ki = ki; // Integral gain
      this.kd = kd; // Derivative gain
      this.iThreshold = iThreshold;
      this.resetState();
    }

    resetState()
    {
      this.#previousValue = 0;
      this.#previousError = 0;
      this.integral = 0;
    }

    update(setpoint, measuredValue)
    {
      const error = setpoint - measuredValue;

      const derivative = error - this.#previousError;

      let integralActive =
        this.iThreshold == null || (Math.abs(error) < this.iThreshold && Math.abs(derivative) < this.iThreshold / 100.); // only adjust integral if already close and stable to target

      if (integralActive)
        this.integral += error;
      else
        this.integral = 0;

      this.#previousError = error;
      this.#previousValue = measuredValue;

      let totalOutput = this.kp * error + this.kd * derivative;

      if (integralActive) {
        totalOutput += this.ki * this.integral;
      }

      return totalOutput;
    }
  }

  class Autopilot
  {
    mode;
    autoThrottleEnabled;
    targetPitch;
    targetAltitude;
    targetIAS;
    targetGlideslope;

    // dependencies:
    #instrumentPanel;
    #airplane;

    constructor(airplane)
    {
      this.#airplane = airplane;
      // PID for altitude to pitch
      this.altitudePID = new PIDController(0.04, 0.00003, 20.0, 100.0);
      // PID for pitch to elevator
      this.pitchPID = new PIDController(0.4, 0.001, 20.0, 5.0, true); // 0.5, 0.001, 100.0

      this.speedPID = new PIDController(0.05, 0.00005, 1.0, 10.0);

      // PID for glideslope to pitch
      this.glideslopePID = new PIDController(2.0, 0.0015, 5.0, 3.0);

      this.targetPitch = 0.0;
      this.targetAltitude = 5000.0;
      this.targetIAS = 0.0;
      this.mode = 'ALTITUDE';

      this.autoThrottleEnabled = false;

      this.targetGlideslope = -3.0;
    }

    bindInstrumentPanel(instrumentPanel) { this.#instrumentPanel = instrumentPanel; }

    setMode(mode) { this.mode = mode; }

    setAutoThrottle(ATHR_state) { this.autoThrottleEnabled = ATHR_state; }

    resetState()
    {
      this.altitudePID.resetState();
      this.pitchPID.resetState();
      this.speedPID.resetState();
      this.glideslopePID.resetState();
    }

    update(pitchAttitude, altitude, trueVel, IAS, vecToRunway, gearOnGround)
    {
      let targetIAS = this.targetIAS;

      switch (this.mode) {

      case 'ALTITUDE':
        this.targetPitch = clamp(this.altitudePID.update(this.targetAltitude, altitude) + 3.0, -6.0, 10.0); // add 3.0 degree pitch bias

        this.targetPitch *= 1.0 - Math.abs(trueVel.y) * 0.03;                                               // limit vertical speed

        break;
      case 'AUTOLAND':

        if (vecToRunway.x <= 4000) {
          this.#airplane.setGear(true);
        }

        let currentGlideslope = trueVel.angle() * radToDeg;
        let adjustedTargetGlideslope = 0.0;

        if (vecToRunway.x <= 200) {
          adjustedTargetGlideslope = Math.max((vecToRunway.y - 10) * -0.08, -2.0); // flare
          // targetGlideslope = Math.max(targetGlideslope, currentGlideslope); // prevent acelerating down when entering at shallow angle
          targetIAS = 0.0;

        } else {

          let slopeToRunway = vecToRunway.angle() * radToDeg;

          adjustedTargetGlideslope = this.targetGlideslope + clamp((slopeToRunway - this.targetGlideslope) * 3.0, -5.0, 3.0); // move towards ideal glideslope

          targetIAS = map_range_C(vecToRunway.x, 2000, 15000, 95, 128);                                                       // target speed depend on distance to runway
          this.#instrumentPanel.setTargetIAS(msToKnots(targetIAS));
        }

        this.targetPitch = clamp(this.glideslopePID.update(adjustedTargetGlideslope, currentGlideslope) + 0.0, -6.0, 10.0);

        break;
      }


      let throttle = clamp(this.speedPID.update(targetIAS, IAS) + 0.60, 0.0, 1.0); // add 60% thrust bias

      // console.log(this.targetAltitude, altitude, this.targetPitch);

      let elevator = clamp(this.pitchPID.update(this.targetPitch, pitchAttitude) + 0.2, -1.0, 1.0);


      if (gearOnGround) {
        elevator = 0.40;
        throttle = -1.0;
      }

      //  console.log(this.#desiredPitch, pitchAttitude, elevator);

      return [ elevator, throttle ];
    }
  }

  class N1Indicator
  {
    container;
    percentText;
    fillArc;
    arcLength;

    constructor(parentElement)
    {
      this.container = document.createElement('div');
      this.container.innerHTML += `
          <svg class="gauge" viewBox="0 90 320 90" aria-hidden="true">
            <path class="bg-arc" d="M40 140 A120 120 0 0 1 280 140" />
            <path id="fillArc" class="fill-arc" d="M40 140 A120 120 0 0 1 280 140" />
            <text id="percentText" x="160" y="140" class="value">0%</text>
          </svg>
      `;

      this.percentText = this.container.querySelector('#percentText');
      this.fillArc = this.container.querySelector('#fillArc');

      this.arcLength = this.fillArc.getTotalLength();
      this.fillArc.style.strokeDasharray = this.arcLength + ' ' + this.arcLength;
      this.fillArc.style.strokeDashoffset = this.arcLength;

      parentElement.appendChild(this.container);
    }

    getColor(p)
    {
      if (p < 80) {
        const ratio = p / 80;
        const r = Math.round(0 + ratio * 255);
        const g = 255;
        return `rgb(${r},${g},0)`;
      } else if (p < 100) {
        const ratio = (p - 90) / 10;
        const r = 255;
        const g = Math.round(255 - ratio * 155);
        return `rgb(${r},${g},0)`;
      } else {
        return `rgb(255,0,0)`;
      }
    }

    update(N1)
    {
      const p = N1 * 100.;
      this.percentText.textContent = p.toFixed(1) + '%';
      this.fillArc.style.stroke = this.getColor(p);
      const offset = this.arcLength * (1 - p / 100);
      this.fillArc.style.strokeDashoffset = offset;
    }
  }

  class InstrumentPanel
  {
    #instrumentCanvas;
    #panelImg;
    #targetAltInput;
    #targetIASInput;
    #targetGlideslopeInput;
    #autolandButton;
    #autoThrottleButton;
    #altHoldButton;
    #panelDiv;
    #N1Indicator;

    // dependencies:
    #autopilot

    constructor(autopilot)
    {
      this.#autopilot = autopilot;
      this.#panelDiv = document.createElement('div');
      this.#instrumentCanvas = document.createElement('canvas');
      this.#instrumentCanvas.width = 800;
      this.#instrumentCanvas.height = 660;
      this.#panelDiv.style.opacity = 0.7;
      this.#panelDiv.style.position = 'absolute';
      this.#panelDiv.style.bottom = 0;
      this.#panelDiv.style.right = 0;
      this.#panelDiv.style.left = 'auto';
      this.loadImages();
      this.genAutopilotBar(this.#panelDiv);
      this.#panelDiv.appendChild(this.#instrumentCanvas);
      body.appendChild(this.#panelDiv);
    }

    setDisplaySideRight(right)
    {
      if (right) {
        this.#panelDiv.style.right = 0;
        this.#panelDiv.style.left = 'auto';
      } else { // left
        this.#panelDiv.style.right = 'auto';
        this.#panelDiv.style.left = 0;
      }
    }

    setMode_AUTOLAND(on)
    {
      if (on) {
        this.#autopilot.setMode('AUTOLAND');
        this.#altHoldButton.checked = false;
      } else {
        this.#autopilot.setMode('NONE');
      }
    }

    setMode_ALTITUDE(on)
    {
      if (on) {
        this.#autopilot.setMode('ALTITUDE');
        this.#autolandButton.checked = false;
      } else {
        this.#autopilot.setMode('NONE');
      }
    }

    setAutoThrottle(ATHR_state) { this.#autopilot.setAutoThrottle(ATHR_state); }

    genAutopilotBar(panelDiv)
    {
      const container = document.createElement('div');

      const speedLabel = document.createElement('label');
      speedLabel.style = 'position: absolute; left: 10px;';

      this.#targetIASInput = document.createElement('input');
      this.#targetIASInput.type = 'number';
      this.#targetIASInput.id = 'speed';
      this.#targetIASInput.className = 'autopilotNumberInput';
      this.#targetIASInput.min = '0';
      this.#targetIASInput.max = '330';
      this.#targetIASInput.step = '5';
      this.#targetIASInput.value = '220';
      this.#targetIASInput.style = 'width: 150px;';
      this.#targetIASInput.readOnly = true;
      this.#targetIASInput.style.cursor = 'default';
      this.#targetIASInput.style.userSelect = 'none';
      this.#targetIASInput.style.webkitUserSelect = 'none';
      this.#targetIASInput.style.mozUserSelect = 'none';
      this.#targetIASInput.style.msUserSelect = 'none';
      this.#targetIASInput.tabIndex = -1;
      this.#targetIASInput.addEventListener('focus', (e) => e.target.blur());
      this.#targetIASInput.addEventListener('wheel', (e) => { e.stopPropagation(); });
      this.#targetIASInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
      speedLabel.appendChild(this.#targetIASInput);

      const speedSpan = document.createElement('span');
      speedSpan.textContent = 'KT';
      speedSpan.style = 'position: absolute; right: 100px;';
      speedLabel.appendChild(speedSpan);
      container.appendChild(speedLabel);

      this.#autoThrottleButton = document.createElement('input');
      this.#autoThrottleButton.type = 'checkbox';
      this.#autoThrottleButton.id = 'athr';
      this.#autoThrottleButton.className = 'airbus-switch';
      this.#autoThrottleButton.addEventListener('change', () => this.setAutoThrottle(this.#autoThrottleButton.checked));
      container.appendChild(this.#autoThrottleButton);

      let athrLabel = document.createElement('label');
      athrLabel.htmlFor = 'athr';
      athrLabel.className = 'airbus-label';
      athrLabel.innerHTML = 'A/THR';
      athrLabel.style = 'position: absolute; left: 200px;';
      container.appendChild(athrLabel);

      this.#N1Indicator = new N1Indicator(container);

      const glideSlopeLabel = document.createElement('label');
      glideSlopeLabel.style = 'position: absolute; left: 420px;';

      this.#targetGlideslopeInput = document.createElement('input');
      this.#targetGlideslopeInput.type = 'number';
      this.#targetGlideslopeInput.id = 'targetGlideSlopeInput';
      this.#targetGlideslopeInput.className = 'autopilotNumberInput';
      this.#targetGlideslopeInput.name = 'altitude';
      this.#targetGlideslopeInput.min = '2';
      this.#targetGlideslopeInput.max = '6';
      this.#targetGlideslopeInput.step = '1';
      this.#targetGlideslopeInput.value = '3';
      this.#targetGlideslopeInput.style.width = '55px';
      this.#targetGlideslopeInput.readOnly = true;
      this.#targetGlideslopeInput.style.cursor = 'default';
      this.#targetGlideslopeInput.style.userSelect = 'none';
      this.#targetGlideslopeInput.style.webkitUserSelect = 'none';
      this.#targetGlideslopeInput.style.mozUserSelect = 'none';
      this.#targetGlideslopeInput.style.msUserSelect = 'none';
      this.#targetGlideslopeInput.tabIndex = -1;
      this.#targetGlideslopeInput.addEventListener('focus', (e) => e.target.blur());
      this.#targetGlideslopeInput.addEventListener('wheel', (e) => { e.stopPropagation(); });
      this.#targetGlideslopeInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
      glideSlopeLabel.appendChild(this.#targetGlideslopeInput);

      const glidSlopeSpan = document.createElement('span');
      glidSlopeSpan.textContent = '°';
      glidSlopeSpan.style = 'position: absolute; right: 20px;';
      glideSlopeLabel.appendChild(glidSlopeSpan);
      container.appendChild(glideSlopeLabel);

      this.#autolandButton = document.createElement('input');
      this.#autolandButton.type = 'checkbox';
      this.#autolandButton.id = 'autoland';
      this.#autolandButton.className = 'airbus-switch';
      this.#autolandButton.addEventListener('change', e => {this.setMode_AUTOLAND(e.target.checked)});
      container.appendChild(this.#autolandButton);

      let autolandLabel = document.createElement('label');
      autolandLabel.htmlFor = 'autoland';
      autolandLabel.className = 'airbus-label';
      autolandLabel.innerHTML = 'LAND';
      autolandLabel.style = 'position: absolute; left: 500px;';
      container.appendChild(autolandLabel);

      this.#altHoldButton = document.createElement('input');
      this.#altHoldButton.type = 'checkbox';
      this.#altHoldButton.id = 'althold';
      this.#altHoldButton.className = 'airbus-switch';
      this.#altHoldButton.addEventListener('change', e => {this.setMode_ALTITUDE(e.target.checked)});
      container.appendChild(this.#altHoldButton);

      let altLabel = document.createElement('label');
      altLabel.htmlFor = 'althold';
      altLabel.className = 'airbus-label';
      altLabel.innerHTML = 'ALT';
      altLabel.style = 'position: absolute; left: 600px;';
      container.appendChild(altLabel);


      const targetAltitudeLabel = document.createElement('label');

      this.#targetAltInput = document.createElement('input');
      this.#targetAltInput.type = 'number';
      this.#targetAltInput.id = 'altitude';
      this.#targetAltInput.className = 'autopilotNumberInput';
      this.#targetAltInput.name = 'altitude';
      this.#targetAltInput.min = '0';
      this.#targetAltInput.max = '40000';
      this.#targetAltInput.step = '100';
      this.#targetAltInput.value = '10000';
      this.#targetAltInput.style.width = '55px';
      this.#targetAltInput.style = 'position: absolute; left: 670px;';
      this.#targetAltInput.addEventListener('wheel', (e) => { e.stopPropagation(); });
      this.#targetAltInput.addEventListener('keydown', (e) => { e.stopPropagation(); });
      targetAltitudeLabel.appendChild(this.#targetAltInput);

      const targetAltSpan = document.createElement('span');
      targetAltSpan.textContent = 'ft';
      targetAltSpan.style = 'position: absolute; right: 70px;';
      targetAltitudeLabel.appendChild(targetAltSpan);

      container.appendChild(targetAltitudeLabel);


      container.style = 'height: 60px; display: flex; justify-content: space-between; align-items: center; background-color: #222222; color: white';

      panelDiv.appendChild(container);

      this.setMode_ALTITUDE();
    }

    setTargetIAS(targetIAS) { this.#targetIASInput.value = targetIAS.toFixed(0); }


    getTargetAlt() { return this.#targetAltInput.value / mToFt; }
    getTargetIAS() { return knotsToMs(this.#targetIASInput.value); }
    getTargetGlideslope() { return -this.#targetGlideslopeInput.value; }

    remove()
    {
      this.#instrumentCanvas.remove();
      this.#panelDiv.remove()
    }

    async loadImages() { this.#panelImg = await loadImage('resources/img/Panel.png'); }

    async display(pitchAngle, airAngle, altitude, radarAltitude, IAS, trueVel, OAT_C, throttle, N1, elevator, targetPitch, autopilotEn, gearStatus, runwayPointer, vecToRunway, brake)
    {
      let ctx = this.#instrumentCanvas.getContext('2d');
      let width = this.#instrumentCanvas.width - 50;
      let height = this.#instrumentCanvas.height;
      const topBarHeight = 50;
      let mainHeight = height - topBarHeight; // height of virtual horizon part

      let targetAltitude = this.getTargetAlt();
      let targetIAS = this.getTargetIAS();

      // ATTITUDE INDICATOR / VIRTUAL HORIZON:

      const pixPerDeg = 15.0;

      let y0 = mainHeight / 2 + topBarHeight + pitchAngle * pixPerDeg; // y pos of 0 deg pitch line

      ctx.beginPath();
      ctx.rect(0, -1000, width, 1000 + y0);
      ctx.fillStyle = '#05A3ED'; // blue
      ctx.fill();
      ctx.beginPath();
      ctx.rect(0, y0, width, 1500);
      ctx.fillStyle = '#F0843C'; // brown
      ctx.fill();


      ctx.strokeStyle = 'white';
      ctx.fillStyle = 'white';
      ctx.beginPath();
      for (let i = Math.round((pitchAngle) / 10) * 10 - 50; i < pitchAngle + 50; i += 2.5) {
        let y = y0 - i * pixPerDeg;
        if (i % 10 == 0) {
          ctx.moveTo(width / 2 - width * 0.15, y);
          ctx.lineTo(width / 2 + width * 0.15, y);
          if (i != 0) {
            ctx.fillText(i, width / 2 - width * 0.25, y + 12);
            ctx.fillText(i, width / 2 + width * 0.21, y + 12);
          }
        } else if (i % 5 == 0) {
          ctx.moveTo(width / 2 - width * 0.075, y);
          ctx.lineTo(width / 2 + width * 0.075, y);
        } else { // 2.5 deg
          ctx.moveTo(width / 2 - width * 0.0375, y);
          ctx.lineTo(width / 2 + width * 0.0375, y);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = 'yellow';
      ctx.beginPath();
      let moveIndY = mainHeight / 2 + topBarHeight + (pitchAngle - trueVel.angle() * radToDeg) * pixPerDeg; // airAngle
      ctx.moveTo(width / 2 - width * 0.15, moveIndY);
      ctx.lineTo(width / 2 + width * 0.15, moveIndY);
      ctx.stroke();

      ctx.strokeStyle = 'green';
      ctx.beginPath();
      let targIndY = mainHeight / 2 + topBarHeight + (pitchAngle - targetPitch) * pixPerDeg;
      ctx.moveTo(width / 2 - width * 0.15, targIndY);
      ctx.lineTo(width / 2 + width * 0.15, targIndY);
      ctx.stroke();

      if (vecToRunway.x < 150000) {
        ctx.strokeStyle = 'blue';
        ctx.beginPath();
        let runwayIndY = mainHeight / 2 + topBarHeight + (pitchAngle - runwayPointer) * pixPerDeg;
        ctx.moveTo(width / 2 - width * 0.15, runwayIndY);
        ctx.lineTo(width / 2 + width * 0.15, runwayIndY);
        ctx.stroke();
        ctx.fillStyle = 'blue';
        ctx.font = '20px serif';
        ctx.fillText(printDistance(vecToRunway.x), width / 2 - width * 0.15 - 70, runwayIndY - 5);
        ctx.fillText(printDistance(vecToRunway.y + 7.5), width / 2 + width * 0.15, runwayIndY - 5);
        ctx.fillText((vecToRunway.angle() * radToDeg).toFixed(1) + ' °', width / 2 + width * 0.23, runwayIndY - 5);
      }

      if (this.#panelImg)
        ctx.drawImage(this.#panelImg, 0, topBarHeight, width, mainHeight);

      // ALTITUDE INDICATOR:

      const altIndXpos = 640; // pos of vertical line

      ctx.beginPath();
      ctx.moveTo(altIndXpos, topBarHeight);
      ctx.lineTo(altIndXpos, height);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'white';
      ctx.fillStyle = 'white';
      ctx.stroke();
      ctx.font = '30px serif';

      let unit = ' m'

      if (guiControls.lengthUnit == 'LENGTH_UNIT_IMPERIAL')
      {
        altitude *= mToFt;
        radarAltitude *= mToFt;
        targetAltitude *= mToFt;
        unit = ' ft'
      }

      const pxPerAlt = 0.65;
      const altRange = 500; // + and -

      ctx.beginPath();
      for (let i = Math.round((altitude - altRange) / 100) * 100; i < altitude + altRange; i += 50) {
        let y = mainHeight / 2 + topBarHeight - (i - altitude) * pxPerAlt;
        if (i % 100 == 0) {
          ctx.moveTo(altIndXpos, y);
          ctx.lineTo(altIndXpos + 20, y);
          ctx.fillText(i, altIndXpos + 25, y + 12);
        } else {
          ctx.moveTo(altIndXpos, y);
          ctx.lineTo(altIndXpos + 10, y);
        }
      }
      ctx.stroke();
      ctx.fillStyle = 'black';
      ctx.fillRect(altIndXpos - 3, mainHeight / 2 + topBarHeight - 25, 113, 50);
      ctx.fillStyle = 'white';
      ctx.fillText(altitude.toFixed(0) + unit, altIndXpos, mainHeight / 2 + topBarHeight + 10);

      // Show ground level
      ctx.beginPath();
      ctx.fillStyle = '#aa0000aa';
      ctx.fillRect(altIndXpos - 3, mainHeight / 2 + topBarHeight + radarAltitude * pxPerAlt, 100, 500);

      // Show target altitude
      ctx.beginPath();
      let targetAltY = mainHeight / 2 + topBarHeight + (altitude - targetAltitude) * pxPerAlt;
      ctx.moveTo(altIndXpos, targetAltY);
      ctx.lineTo(altIndXpos + 100, targetAltY);
      ctx.strokeStyle = 'green';
      ctx.stroke();

      // VELOCITY INDICATOR:
      const velIndXpos = 110;
      ctx.beginPath();
      ctx.moveTo(velIndXpos, topBarHeight);
      ctx.lineTo(velIndXpos, height);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'white';
      ctx.fillStyle = 'white';
      ctx.stroke();
      ctx.font = '30px serif';

      let stallSpeed = 70.0; // m/s
      let overSpeed = 173.0; // m/s

      if (guiControls.speedUnit == 'SPEED_UNIT_KT') {
        IAS = msToKnots(IAS);
        targetIAS = msToKnots(targetIAS);
        stallSpeed = msToKnots(stallSpeed);
        overSpeed = msToKnots(overSpeed);
        unit = ' kt'
      } else {
        unit = ' km/h'
        IAS *= 3.6; // convert m/s to km/h
        targetIAS *= 3.6;
        stallSpeed *= 3.6;
        overSpeed *= 3.6;
      }

      const pxPerVel = 10.0;
      const velRange = 35; // + and -

      ctx.beginPath();
      for (let i = Math.max(Math.round((IAS) / 10) * 10 - velRange, 0); i < IAS + velRange; i += 5) {
        let y = mainHeight / 2 + topBarHeight - (i - IAS) * pxPerVel;
        if (i % 10 == 0) {
          ctx.moveTo(velIndXpos - 20, y);
          ctx.lineTo(velIndXpos, y);
          ctx.fillText(i, 0, y + 12);
        } else {
          ctx.moveTo(velIndXpos - 10, y);
          ctx.lineTo(velIndXpos, y);
        }
      }
      ctx.stroke();
      ctx.fillStyle = 'black';
      ctx.fillRect(0, mainHeight / 2 + topBarHeight - 25, velIndXpos + 3, 50);
      ctx.fillStyle = 'white';
      ctx.fillText(IAS.toFixed(0) + unit, 0, mainHeight / 2 + topBarHeight + 10);

      // Show stall speed
      ctx.beginPath();
      ctx.fillStyle = '#aa0000aa';
      ctx.fillRect(0, mainHeight / 2 + topBarHeight + (IAS - stallSpeed) * pxPerVel, velIndXpos + 3, 5000);

      // Show over speed
      ctx.beginPath();
      ctx.fillStyle = '#aa0000aa';
      ctx.fillRect(0, mainHeight / 2 + topBarHeight + (IAS - overSpeed) * pxPerVel - 5000, velIndXpos + 3, 5000);

      // Show target IAS
      ctx.beginPath();
      let targetIasY = mainHeight / 2 + topBarHeight + (IAS - targetIAS) * pxPerVel;
      ctx.moveTo(0, targetIasY);
      ctx.lineTo(velIndXpos + 3, targetIasY);
      ctx.strokeStyle = 'green';
      ctx.stroke();

      // VERTICAL VElOCITY INDICATOR
      ctx.fillStyle = 'black';
      ctx.fillRect(width, topBarHeight, 50, mainHeight);
      let hue = clamp(120.0 + trueVel.y * 10.0, 0.0, 200.0);
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;

      let verticalSpeedIndicatorVal = trueVel.y < 0 ? Math.sqrt(-trueVel.y) : -Math.sqrt(trueVel.y);
      ctx.fillRect(width + 10, mainHeight / 2 + topBarHeight, 30, verticalSpeedIndicatorVal * 40.);

      ctx.fillStyle = 'black';
      ctx.fillRect(width, mainHeight / 2 + topBarHeight - 13, 50, 26);

      const [veloStr, unitStr] = printVerticalVelocity(trueVel.y);

      ctx.font = '20px serif';
      ctx.fillStyle = 'white';
      ctx.fillText(veloStr, width, mainHeight / 2 + topBarHeight + 6);
      ctx.fillText(unitStr, width + 10, mainHeight / 2 + topBarHeight + 22);

      // OVERHEAD
      ctx.fillStyle = '#222222';
      ctx.fillRect(0, 0, this.#instrumentCanvas.width, topBarHeight);

      ctx.fillStyle = '#00FFFF';
      ctx.font = '30px serif';
      ctx.fillText('🌡 ' + printTemp(OAT_C), 0, 40);

      ctx.fillStyle = '#FFFF00';
      ctx.fillText('🎚️ ' + throttle.toFixed() + ' %', 140, 40);

      this.#N1Indicator.update(N1);

      let gearStatusIndicator = '';
      if (gearStatus == 'UP') {
        gearStatusIndicator = 'UP';
        ctx.fillStyle = '#444444';
      } else if (gearStatus == 'EXTENDING' || gearStatus == 'RETRACTING') {
        gearStatusIndicator = 'UNLK';
        ctx.fillStyle = '#FF0000';
      } else if (gearStatus == 'DOWN') {
        gearStatusIndicator = '▽▽▽';
        ctx.fillStyle = '#00FF00';
      }
      ctx.fillText(gearStatusIndicator, 290, 40);


      let AOA = pitchAngle - airAngle;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('∠ ' + AOA.toFixed(1) + '°', 410, 40);

      if (AOA > 14.0) {
        ctx.fillStyle = '#FF0000';
        ctx.fillText('STALL!', 605, 40);
      }

      if (autopilotEn) {
        ctx.fillStyle = '#00FF00';
        ctx.fillText('AP', 540, 40);
      }

      if (IAS > overSpeed) {
        ctx.fillStyle = '#FF0000';
        ctx.fillText('Overspeed!', 605, 40);
      }

      // BELOW VIRTUAL HORIZON

      ctx.fillStyle = '#AAA';
      ctx.fillText('GS: ' + printVelocity(trueVel.mag()), 130, 640);

      if (brake) {
        ctx.fillStyle = '#F00';
        ctx.fillText('BRAKE', 340, 640);
      }

      ctx.fillStyle = '#AAA';
      ctx.fillText('ELE: ' + elevator.toFixed(2), 500, 640);
    }
  }


  const dt = 1. / FPS;

  class PhysicsObject
  {        // 2D PhysicsObject
    m;     // mass in kg
    I;     // moment of inertia
    pos;   // in meters
    vel;   // in m/s
    angle; // radians
    aVel;  // angular velocity in rad/s

    constructor(m, I, x, y, vx, vy)
    {
      this.m = m;
      this.I = I;
      this.pos = new Vec2D(x, y);
      this.vel = new Vec2D(vx, vy);
      this.angle = 0.0;
      this.aVel = 0.0;
    }

    applyAcceleration(a) { this.vel.add(a.mult(dt)); }

    applyForce(F, pos) // position relative to center
    {
      F.mult(dt);
      this.vel.add(F.copy().div(this.m)); // simply apply force at center of mass
      if (pos != null) {                  // apply torque if force not applied at the center of mass

        let angleToCm = pos.angle();      // angle to center of mass

                                          // console.log(F);
        F.rotate(-angleToCm); // make force vector perpendicular to vector to center off mass

                              // console.log('After rotating ', F, angleToCm * radToDeg);

        let torque = -F.y * pos.mag(); // if force perpendicular to vector from center, mult by dist from center
        this.aVel += torque / this.I;
      }
    }

    move(directionIsLeft)
    {
      let movementPerFrame = this.vel.copy();
      movementPerFrame.mult(dt);
      if (!directionIsLeft)
        movementPerFrame.x = -movementPerFrame.x;
      this.pos.add(movementPerFrame);
      this.pos.x = mod(this.pos.x, sim_res_x * cellHeight); // make sure airplane position stays within sim area
      this.angle += this.aVel * dt;                         // rotate
    }
  }

  class JetEngine
  {
    N1;     // 0. to 1.
    thrust; // 0. to 1.
    starting;
    started;

    constructor()
    {
      this.N1 = 0.186;
      this.starting = false;
      this.started = true;
    }

    toggle()
    {
      if (this.started) {
        this.stop();
      } else {
        this.start();
      }
    }

    start()
    {
      if (!this.started) {
        this.starting = true;
      }
    }

    stop()
    {
      this.started = false;
      this.starting = false;
    }

    update(throttle)
    {
      if (this.starting) {
        this.N1 += 0.00008;
        this.N1 *= 1.006;
        if (this.N1 >= 0.15) {
          this.starting = false;
          this.started = true;
        }
      } else if (this.started)
        this.N1 += (Math.abs(throttle) + 0.223) * 0.0042;

      this.N1 *= 0.995; // drag

      this.thrust = Math.pow(this.N1, 2.0);

      return throttle < 0. ? this.thrust * -0.7 : this.thrust;
    }
  }

  class Airplane
  {
    #instrumentPanel;
    #autopilot;

    directionIsLeft; // false means right

    #relVelAngle;    // angle of velocity relative to air
    #airspeed;       // true airspeed, m/s
    #groundSpeed;
    #IAS;            // indicated airspeed, m/s
    #camFollow;
    #OAT;            // outdoor air temperature

    #radarAltitude;  // meters above ground
    #framesSinceCrash;
    #gearExtPos;     // down: 0.0  up: 7.0
    #gearOnGround;   // if the wheels are touching the ground
    #braking;

    #runwayThresholdPos;

    // Controls
    elevator;
    throttle;
    prevThrottle;

    #gearStatus; // UP EXTENDING DOWN RETRACTING
    #autopilotEnabled;

    jetEngine;

    phys; // physics object, containing all physical properties including position and velocity

    getClosestRunwayPos()
    {
      let Xpos = Math.floor(mod(this.phys.pos.x / cellHeight, sim_res_x));
      // let Ypos = Math.floor(clamp(this.phys.pos.y / cellHeight + 1.0, 100, sim_res_y - 1));

      let Ypos = 90;

      // console.log(Ypos);

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
      gl.readBuffer(gl.COLOR_ATTACHMENT2); // walltexture
      var wallTextureValues = new Int8Array(sim_res_x * 4);
      gl.readPixels(0, Ypos, sim_res_x, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues);

      if (this.directionIsLeft) {
        let x = Xpos - 1;
        while (x != Xpos) {
          if (x < 0)
            x = sim_res_x - 1;

          if (wallTextureValues[x * 4 + 0] == 5) // found runway
          {
            return new Vec2D(x * cellHeight, (Ypos - wallTextureValues[x * 4 + 2]) * cellHeight + 15);
          }
          x--;
        }
      } else { // direction is right
        let x = Xpos + 1;
        while (x != Xpos) {
          if (x > sim_res_x - 1)
            x = 0;

          if (wallTextureValues[x * 4 + 0] == 5) // found runway
          {
            return new Vec2D(x * cellHeight, (Ypos - wallTextureValues[x * 4 + 2]) * cellHeight + 15);
          }
          x++;
        }
      }
      return new Vec2D(0, 0);
    }

    constructor()
    {
      this.#camFollow = true;
      this.phys = new PhysicsObject(1, 1, 0, 0);
      this.phys.pos.x = -99.0;
      this.phys.pos.y = -99.0;
      this.#IAS = 0.0;
      this.#OAT = 0.0;
      this.#airspeed = 0.0;
      this.#groundSpeed = 0.0;
      this.#autopilotEnabled = false;
      this.#gearOnGround = false;
      this.#braking = false;
      this.#runwayThresholdPos = new Vec2D(0, 0);
    }

    toggleCamFollow()
    {
      if (airplaneMode)
        this.#camFollow = !this.#camFollow;
    }

    enableAirplaneMode(autopilotEn)
    {
      this.#autopilot = new Autopilot(this);
      this.setAutopilot(autopilotEn);
      this.#instrumentPanel = new InstrumentPanel(this.#autopilot);
      this.#autopilot.bindInstrumentPanel(this.#instrumentPanel);
      airplaneMode = true;
      this.directionIsLeft = true; // left
      this.#camFollow = true;
      let M = 400 * 1000;          // mass: 400 tons
      let L = 50.0;                // effective length in meters
      let I = 1 / 12 * M * L * L;  // moment of inertia

      let simXpos = Math.floor(mouseXinSim * sim_res_x);
      let simYpos = findSimYposAboveSurfaceAtMouseX();

      let startsOnSurface = simYpos > (mouseYinSim * sim_res_y); // It is placed above the mouse position

      let planePosX = simXpos * cellHeight;
      let planePosY = Math.min(simYpos * cellHeight - (startsOnSurface ? 32.0 : 0.0), 15000.0);

      let velX = startsOnSurface ? 0.0 : map_range_C(mouseYinSim, 0.0, 1.0, -100.0, -200);

      this.phys = new PhysicsObject(M, I, planePosX, planePosY, velX, 0.0);
      this.phys.angle = startsOnSurface ? 0.0 : 5.0 * degToRad;
      this.throttle = startsOnSurface ? 0.00 : 0.40; // %

      if (startsOnSurface) {
        this.#gearStatus = 'DOWN';
        this.#gearExtPos = 0.0;
      } else {
        this.#gearStatus = 'UP';
        this.#gearExtPos = 7.0;

        this.#runwayThresholdPos = this.getClosestRunwayPos();
      }

      cam.tarZoom = 100.0;

      this.jetEngine = new JetEngine();
      soundSystem.jetEngineSound.start();
    }

    changeDirection()
    {
      if (this.directionIsLeft) {
        if (!confirm('Do you want to change the flight direction to Right?'))
          return;
      } else {
        if (!confirm('Do you want to change the flight direction to Left?'))
          return;
      }
      this.directionIsLeft = !this.directionIsLeft;
      this.#instrumentPanel.setDisplaySideRight(this.directionIsLeft);
      this.#runwayThresholdPos = this.getClosestRunwayPos();
    }

    disableAirplaneMode()
    {
      airplaneMode = false;
      this.#framesSinceCrash = -1;
      this.phys.pos.x = -99.0;
      this.phys.pos.y = -99.0;
      this.#camFollow = false;
      this.display(); // run display function one more time to update uniforms
      this.#instrumentPanel.remove();
      document.body.style.cursor = 'default';
      soundSystem.jetEngineSound.stop();
    }

    getN1() { return this.jetEngine ? this.jetEngine.N1 : 0.0; }

    onUpPressed()
    {
      if (this.throttle == 0.) {
        this.throttle = +0.01;
      }
    }

    onDownPressed()
    {
      if (this.throttle == 0.) {
        this.throttle = -0.01;
      }
    }

    setBrakes(enabled) { this.#braking = enabled; }

    toggleEngine() { this.jetEngine.toggle(); }

    toggleGear() { this.setGear(this.#gearStatus == 'UP'); }

    setGear(boolDown)
    {
      if (boolDown) {
        if (this.#gearStatus == 'UP')
          this.#gearStatus = 'EXTENDING';

      } else {
        if (this.#gearStatus == 'DOWN')
          this.#gearStatus = 'RETRACTING';
      }
    }

    // https://aviation.stackexchange.com/questions/64490/is-there-a-simple-relationship-between-angle-of-attack-and-lift-coefficient/97747#97747?newreg=547ea95b1d784abf993b7d1850dcc938
    Cl(AOA) // lift coefficient https://www.desmos.com/calculator/aeeizqvarp
    {
      let lift = 0.0;
      if ((AOA > 0. && AOA < PI / 7.23) || (AOA > 7. / 8.124 * PI && AOA < PI)) {
        lift = Math.sin(6. * AOA);
      } else {
        lift = Math.sin(2. * AOA);
      }
      return lift;
    }

    Cd(AOA) // drag coefficient
    {
      return 1.0 - Math.cos(2 * AOA);
    }

    move()
    {
      if (this.#framesSinceCrash >= 0) {
        this.#framesSinceCrash++;
        if (this.#framesSinceCrash > 30)
          this.disableAirplaneMode();
        return;
      }

      let Xpos = mod(this.phys.pos.x / cellHeight - 1., sim_res_x);
      let Ypos = Math.min(this.phys.pos.y / cellHeight + 1.0, sim_res_y - 1);

      let fractX = fract(Xpos);
      let fractY = fract(Ypos);

      Xpos = Math.floor(Xpos);
      Ypos = Math.floor(Ypos);

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);                                   // basetexture
      var baseTextureValues = new Float32Array(4 * 2 * 2);
      gl.readPixels(Xpos, Ypos, 2, 2, gl.RGBA, gl.FLOAT, baseTextureValues); // order bottem up: x0y0 x1y0 x0y1 x1y1

      let temperature = KtoC(potentialToRealT(baseTextureValues[3], Ypos));

      function fract(f) { return f % 1.; }
      function mix(x, y, a) { return x * (1. - a) + y * a; }

      function bilerp(array, ind, fractX, fractY) // ind: index of value in array to get
      {
        let top = mix(array[2 * 4 + ind], array[3 * 4 + ind], fractX);
        let bottem = mix(array[0 * 4 + ind], array[1 * 4 + ind], fractX);
        return mix(bottem, top, fractY);
      }


      // Linearly interpolatate velocity
      let Vx = bilerp(baseTextureValues, 0, fractX, fractY);
      let Vy = bilerp(baseTextureValues, 1, fractX, fractY);

      let airVel = new Vec2D(this.directionIsLeft ? Vx : -Vx, Vy);

      if (this.phys.pos.y > guiControls.simHeight) {
        airVel.mult(0.0);              // still air above sim area
      } else {
        airVel.mult(cellHeight * 3.6); // convert to m/s
      }

      this.#OAT = temperature;

      // gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
      // var waterTextureValues = new Float32Array(4);
      // gl.readPixels(Xpos, Ypos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);
      // let dewpoint = KtoC(dewpoint(waterTextureValues[0]));

      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      var wallTextureValues = new Int8Array(4 * 3 * 1);
      gl.readPixels(Xpos, Ypos, 3, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues);

      // wrap arround the edge of the sim area
      if (Xpos == sim_res_x - 2) {
        gl.readPixels(0, Ypos, 1, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues.subarray(2 * 4));
      } else if (Xpos == sim_res_x - 1) {
        gl.readPixels(0, Ypos, 2, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues.subarray(1 * 4));
      }

      let radarAltL = (wallTextureValues[0 * 4 + 2] + fractY - 1.) * cellHeight;
      let radarAltM = (wallTextureValues[1 * 4 + 2] + fractY - 1.) * cellHeight;
      let radarAltR = (wallTextureValues[2 * 4 + 2] + fractY - 1.) * cellHeight;


      let radarAltFrontGear = this.directionIsLeft ? mix(radarAltL, radarAltM, Math.min(fractX + 0.14, 1.)) : mix(radarAltM, radarAltR, Math.min(fractX, 1.));

      this.#radarAltitude = Math.min(mix(radarAltL, radarAltM, fractX), mix(radarAltM, radarAltR, fractX));

      // console.log(Xpos, Ypos, radarAltL.toFixed(1), radarAltM.toFixed(1), radarAltR.toFixed(1), fractX);

      if (this.#gearStatus == 'EXTENDING') {
        this.#gearExtPos = Math.max(this.#gearExtPos - 0.01, 0.0);
        if (this.#gearExtPos == 0.0)
          this.#gearStatus = 'DOWN';
      } else if (this.#gearStatus == 'RETRACTING') {
        this.#gearExtPos = Math.min(this.#gearExtPos + 0.01, 7.0);
        if (this.#gearExtPos == 7.0)
          this.#gearStatus = 'UP';
      }

      let heightAboveGround = this.#radarAltitude;

      let heightAboveObstacles = radarAltM;

      let gearTouchAlt = 8.0 - this.#gearExtPos;

      let bounceForceMult = 100000.0;

      if (wallTextureValues[1 * 4 + 0] == 1) { // over land

        let treeHeight = map_range_C(wallTextureValues[1 * 4 + 3], 80, 127, 0., 15.);
        heightAboveObstacles -= treeHeight;

      } else if (wallTextureValues[1 * 4 + 0] == 2) { // over water
        heightAboveObstacles += 20.;
        gearTouchAlt = -5.0;                          // + (7.0 - this.#gearExtPos) * 0.2;
        bounceForceMult = 9000.0 + Math.abs(this.phys.vel.x) * 600.0;

        let draught = gearTouchAlt - heightAboveGround;
        if (draught > 0.0) {
          let waterDragForce = this.phys.vel.x * -50000.0 * draught;
          // console.log(waterDragForce);
          if (waterDragForce > 3000000 || this.#gearExtPos < 7.0) { // crash on water
            guiControls.IterPerFrame = 1;
            guiControls.auto_IterPerFrame = false;
            this.#framesSinceCrash = 0;
            soundSystem.jetEngineSound.stop();
          }

          this.phys.applyForce(new Vec2D(waterDragForce, 0.));

          this.jetEngine.stop();
        }

      } else if (wallTextureValues[1 * 4 + 0] == 4) { // over urban
        heightAboveObstacles -= 80.0;
      }

      let mainGearForce = Math.max(gearTouchAlt - heightAboveGround, 0.0) * bounceForceMult * 100.0;

      if (mainGearForce > 0.0) {
        this.#gearOnGround = true;
        mainGearForce -= this.phys.vel.y * 500000; // damping
      } else {
        this.#gearOnGround = false;
      }

      this.phys.applyForce(new Vec2D(0.0, mainGearForce), new Vec2D(1., 0.));

      let frontGearPosX = 36.0;                                                         // m

      let frontGearAlt = radarAltFrontGear + Math.sin(this.phys.angle) * frontGearPosX; // front gear altitude is not completely acurate yet

      let frontGearForce = Math.max(gearTouchAlt - frontGearAlt, 0.0) * bounceForceMult * 5.0;

      if (frontGearForce > 0.0)
        frontGearForce -= this.phys.aVel * 5000000; // damping

      this.phys.applyForce(new Vec2D(0.0, -frontGearForce), new Vec2D(-frontGearPosX, 0.));

      let gearPos = clamp(-(heightAboveGround - gearTouchAlt), 0.0, 5.0) + this.#gearExtPos; // 0 is all the way down, positive is up into the airplane

      gl.useProgram(skyBackgroundDisplayProgram);
      gl.uniform2f(uloc_sky_planeDirectionAndGearPos, this.directionIsLeft, gearPos);

      if (wallTextureValues[0] != 2 && (heightAboveObstacles < 6.0 || radarAltL < 6.0 || (heightAboveObstacles < 10.0 && Math.abs(this.phys.angle) > 0.25))) { // crash into the surface
        guiControls.IterPerFrame = 1;
        guiControls.auto_IterPerFrame = false;
        this.#framesSinceCrash = 0;
        soundSystem.jetEngineSound.stop();
      }

      this.#groundSpeed = this.phys.vel.mag();

      let relVel = this.phys.vel.copy().subtract(airVel);           // velocity relative to air
      this.#airspeed = relVel.mag();                                // true airspeed in m/s
      let relAlt = this.phys.pos.y / 12000.0;                       // 12000 m = 1.0
      let relAirDensity = Math.pow(1. - relAlt * 0.47, 2.0);        // 1.0 is sea level, 0.28 is 12000 meters
      let relIndVel = relVel.copy().mult(Math.sqrt(relAirDensity)); // convert velocity relative to air to indicated, wich is also what the airplane feels

      this.#IAS = relIndVel.mag();

      // this.phys.angle += this.elevator * 0.001; // simple pitch control for testing

      // this.#relVelAngle = this.phys.vel.angle(); // ignore air movement for testing
      this.#relVelAngle = relVel.angle();


      let AOA = this.phys.angle - this.#relVelAngle;
      let dynamicPressMult = relIndVel.magSq(); // dynamic pressure
      let liftForce = this.Cl(AOA) * dynamicPressMult * 800.0;
      let dragForce = this.Cd(AOA) * dynamicPressMult * 800.0;

      // console.log(Math.round(liftForce, 1), Math.round(dragForce, 1));
      // console.log((liftForce / dragForce).toFixed(1));
      // console.log(Math.abs(this.phys.vel.x));

      let mainWingForce = new Vec2D(dragForce, liftForce);
      mainWingForce.rotate(this.#relVelAngle);
      this.phys.applyForce(mainWingForce); // Apply Main wing force at center off mass

      // console.log('this.elevator ' + this.elevator);

      let vertStabilAOA = AOA - (this.elevator * 15.0 + 3.0) * degToRad; // angled at -12 to 18 degrees relative to main wing with 3 deg center position

      // console.log('vertStabilAOA ', vertStabilAOA * radToDeg);

      let vertStabilPos = new Vec2D(35., 0.); // 35 meters to the right of the center of mass
      vertStabilPos.rotate(this.phys.angle);
      // console.log('vertStabilPos ', vertStabilPos);
      let vertStabilForce = new Vec2D(this.Cd(vertStabilAOA) * dynamicPressMult * 40.0, this.Cl(vertStabilAOA) * dynamicPressMult * 40.0);
      vertStabilForce.rotate(this.#relVelAngle);

      // console.log((vertStabilAOA * radToDeg).toFixed(2), vertStabilForce.copy().div(10000));

      let thrust = this.jetEngine.update(this.throttle);

      let thrustAltMult = 0.5 + relAirDensity * 0.5;

      this.phys.applyForce(vertStabilForce, vertStabilPos);                                        // apply vertical stabiliser force
      this.phys.applyForce(Vec2D.fromAngle(this.phys.angle, thrust * thrustAltMult * 311000 * 4)); // Thrust 4 X 311 kN
      this.phys.applyAcceleration(new Vec2D(0.0, -9.81));                                          // gravity

      let normRelVel = new Vec2D(Math.cos(this.#relVelAngle), Math.sin(this.#relVelAngle));
      let dragMult = (this.#gearStatus == 'UP' ? 25.0 : 35.0) + Math.abs(Math.sin(AOA) * 150.0);
      let dragMag = dynamicPressMult * dragMult;

      this.phys.applyForce(new Vec2D(normRelVel.x * dragMag, -normRelVel.y * dragMag));

      if (this.#gearOnGround) {
        let gearDragForce = (this.#braking ? 1100000.0 : 50000.0); // braking and wheel friction

        this.phys.applyForce(new Vec2D(this.phys.vel.x > 0.0 ? -gearDragForce : gearDragForce, 0.));
      }

      this.phys.aVel *= 1. - 0.15 * dt; // angular velocity drag

      this.phys.move(this.directionIsLeft);
    }

    hasCrashed() { return this.#framesSinceCrash >= 0; }

    setAutopilot(enabledIn)
    {
      document.body.style.cursor = enabledIn ? 'default' : 'crosshair';
      this.#autopilotEnabled = enabledIn;

      if (enabledIn == true) {
        this.#runwayThresholdPos = this.getClosestRunwayPos();
        this.#autopilot.resetState();
        this.#autopilot.targetPitch = this.phys.angle * radToDeg;
      }
    }

    calcVecToRunway()
    {
      if (this.directionIsLeft) {
        let distToRunwayY = this.phys.pos.y - this.#runwayThresholdPos.y;
        let distToRunwayX = 0;
        if (this.phys.pos.x > this.#runwayThresholdPos.x) {               // to the right of runway
          distToRunwayX = this.phys.pos.x - this.#runwayThresholdPos.x;
        } else if (this.phys.pos.x > this.#runwayThresholdPos.x - 3000) { // above runway
          distToRunwayX = 0;
        } else {                                                          // to the left of runway, wrap around map
          distToRunwayX = sim_res_x * cellHeight + (this.phys.pos.x - this.#runwayThresholdPos.x);
        }
        let vecToRunway = new Vec2D(distToRunwayX, distToRunwayY);
        return vecToRunway;
      } else {
        let distToRunwayY = this.phys.pos.y - this.#runwayThresholdPos.y;
        let distToRunwayX = 0;
        if (this.phys.pos.x < this.#runwayThresholdPos.x) {               // to the left of runway
          distToRunwayX = this.#runwayThresholdPos.x - this.phys.pos.x;
        } else if (this.phys.pos.x < this.#runwayThresholdPos.x + 3000) { // above runway
          distToRunwayX = 0;
        } else {                                                          // to the left of runway, wrap around map
          distToRunwayX = sim_res_x * cellHeight + (this.phys.pos.x - this.#runwayThresholdPos.x);
        }
        let vecToRunway = new Vec2D(distToRunwayX, distToRunwayY);
        return vecToRunway;
      }
    }

    takeUserInput()
    {
      this.prevThrottle = this.throttle;

      if (upPressed) {
        this.throttle += 0.01;
      } else if (downPressed) {
        this.throttle -= 0.01;
      }

      const [autopilotElevator, autopilotThrottle] = this.#autopilot.update(this.phys.angle * radToDeg, this.phys.pos.y, this.phys.vel, this.#IAS, this.calcVecToRunway(), this.#gearOnGround);

      this.#autopilot.targetAltitude = this.#instrumentPanel.getTargetAlt();
      this.#autopilot.targetIAS = this.#instrumentPanel.getTargetIAS();
      this.#autopilot.targetGlideslope = this.#instrumentPanel.getTargetGlideslope();

      if (this.#autopilot.autoThrottleEnabled) {
        this.throttle = autopilotThrottle;

        if (this.throttle < 0.0)
          this.#braking = true;
      }

      const gp = navigator.getGamepads()[0];

      if (this.#autopilotEnabled) {

        this.elevator = autopilotElevator;
      } else if (gp) {
        this.elevator = -gp.axes[1];
      } else {                                                              // manual elevator control
        this.elevator = (mouseY - canvas.height / 2) / canvas.height * 2.0; // pitch input -1.0 to +1.0
      }

      // this.elevator /= 1.0 + Math.max(this.#airspeed - 80, 0.) * 0.01;          // limit elevator throw at higher airspeed
      this.elevator += Math.max(-this.phys.angle * radToDeg - 50.0, 0.) * 0.03; // limit elevator to prevent going down steeper than vertical
      this.elevator -= Math.max(this.phys.angle * radToDeg - 50.0, 0.) * 0.03;  // limit elevator to prevent going up steeper than vertical

      // console.log(this.phys.angle * radToDeg, this.elevator);

      if (gp) {
        if (!this.#autopilot.autoThrottleEnabled) {
          this.throttle = (gp.axes[2] + 1.) / 2.;
          this.throttle *= -gp.axes[4]; // reverse thrust
        }
        this.#braking = gp.buttons[0].pressed;

        this.setGear(gp.axes[7] > 0.)
      }

      this.throttle = clamp(this.throttle, (this.#gearOnGround && (this.prevThrottle < 0. || this.#autopilot.autoThrottleEnabled || gp)) ? -0.3 : 0.0,
                            (this.prevThrottle > 0. || this.#autopilot.autoThrottleEnabled || gp) ? 1.0 : 0.0);
    }

    display()
    {
      let normXpos = this.phys.pos.x / cellHeight / sim_res_x;
      let normYpos = (this.phys.pos.y / cellHeight + 1.0) / sim_res_y;

      // console.log(normXpos, normYpos);
      gl.useProgram(skyBackgroundDisplayProgram);
      gl.uniform3f(uloc_sky_planePos, normXpos, normYpos, this.directionIsLeft ? this.phys.angle : -this.phys.angle);
      gl.useProgram(advectionProgram);
      gl.uniform4f(uloc_adv_airplaneValues, normXpos, normYpos, this.throttle, this.#framesSinceCrash > 0 ? 1.0 : (zPressed ? -1.0 : 0.0));
      gl.useProgram(skyBackgroundDisplayProgram);

      if (this.#camFollow) {
        cam.tarXpos = -normXpos * 2.0 + 1.0;
        cam.tarYpos = -normYpos * 2.0 * (sim_res_y / sim_res_x) + (sim_res_y / sim_res_x);
      }

      let vecToRunway = this.calcVecToRunway();

      this.#instrumentPanel.display(this.phys.angle * radToDeg, this.#relVelAngle * radToDeg, this.phys.pos.y, this.#radarAltitude, this.#IAS, this.phys.vel, this.#OAT, this.throttle * 100.0,
                                    this.jetEngine.N1, this.elevator, this.#autopilot.targetPitch, this.#autopilotEnabled, this.#gearStatus, vecToRunway.angle() * radToDeg, vecToRunway,
                                    this.#braking);
    }
  }

  var airplane = new Airplane();

  document.body.style.overflow = 'hidden'; // prevent scrolling bar from apearing

  canvas = document.getElementById('mainCanvas');
  nukeOverlayCanvas = document.createElement('canvas');
  nukeOverlayCanvas.id = 'nukeOverlayCanvas';
  nukeOverlayCanvas.style.position = 'fixed';
  nukeOverlayCanvas.style.top = '0';
  nukeOverlayCanvas.style.left = '0';
  nukeOverlayCanvas.style.pointerEvents = 'none';
  nukeOverlayCanvas.style.zIndex = '2';
  nukeOverlayCanvas.style.display = 'block';
  document.body.appendChild(nukeOverlayCanvas);
  nukeOverlayCtx = nukeOverlayCanvas.getContext('2d');

  var contextAttributes = {
    alpha : false,
    desynchronized : false,
    antialias : true,
    depth : false,
    failIfMajorPerformanceCaveat : false,
    powerPreference : 'high-performance',
    premultipliedAlpha : true, // true
    preserveDrawingBuffer : false,
    stencil : false,
  };
  gl = canvas.getContext('webgl2', contextAttributes);
  // console.log(gl.getContextAttributes());

  if (!gl) {
    alert('Your browser does not support WebGL2, Download a new browser.');
    throw ' Error: Your browser does not support WebGL2';
  }

  // SETUP GUI

  if (guiControlsFromSaveFile == null) { // use default settings
    setupDatGui(JSON.stringify(guiControls_default));
    guiControls.simHeight = sim_height;
    guiControls.globalEffectsEndAlt = sim_height;

    if (startDate) {
      guiControls.month = startDate.getMonth() + 1 + startDate.getDate() / 30.5;
    }

    if (startLatitude) {
      guiControls.latitude = startLatitude;
    }

  } else {
    setupDatGui(guiControlsFromSaveFile);                     // use settings from save file

    for (const [key, value] of Object.entries(guiControls)) { // set numerical values that could not be loaded from the savefile to their defaults.
      if (value === -1) {
        guiControls[key] = guiControls_default[key];
      }
    }

    // Preserve simulation height from save file (do not derive from resolution)
    if (guiControls.simHeight > 0) {
      sim_height = guiControls.simHeight;
    } else {
      sim_height = guiControls_default.simHeight;
      guiControls.simHeight = sim_height;
    }
  }

  if (!guiControls.speedUnit && guiControls.windUnit)
    guiControls.speedUnit = guiControls.windUnit;
  if (!guiControls.shearUnit)
    guiControls.shearUnit = guiControls.speedUnit || guiControls_default.shearUnit;
  if (!guiControls.lapseUnit)
    guiControls.lapseUnit = guiControls_default.lapseUnit;

  restoreSavedRadarTowersFromGuiControls();
  restoreSavedAirmassGeneratorsFromGuiControls();

  var uloc_charge_generationRate = null;
  var uloc_charge_minCloudDensity = null;
  var uloc_charge_stormCoreThreshold = null;
  var uloc_charge_transportStrength = null;
  var uloc_charge_dissipationRate = null;
  var postProc_exposure_loc = null;
  var postProc_saturation_loc = null;
  var postProc_contrast_loc = null;
  var postProc_bloomStrength_loc = null;

  function setChargeGenerationUniforms()
  {
    if (!chargeProgram || uloc_charge_generationRate === null)
      return;
    gl.useProgram(chargeProgram);
    gl.uniform1f(uloc_charge_generationRate, guiControls.chargeGenerationRate);
    gl.uniform1f(uloc_charge_minCloudDensity, guiControls.chargeMinCloudDensity);
    gl.uniform1f(uloc_charge_stormCoreThreshold, guiControls.chargeStormCoreThreshold);
    if (uloc_charge_transportStrength !== null)
      gl.uniform1f(uloc_charge_transportStrength, guiControls.chargeTransportStrength || 1.0);
    if (uloc_charge_dissipationRate !== null)
      gl.uniform1f(uloc_charge_dissipationRate, guiControls.chargeDissipationRate || 1.0);
  }

  function setGuiUniforms()
  { // set all uniforms to new values
    gl.useProgram(boundaryProgram);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'vorticity'), guiControls.vorticity);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'landEvaporation'), guiControls.landEvaporation);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'waterEvaporation'), guiControls.waterEvaporation);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'dynamicWaterTemperature'), guiControls.dynamicWaterTemperature ? 1.0 : 0.0);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'evapHeat'), guiControls.evapHeat);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'waterWeight'), guiControls.waterWeight);
    gl.useProgram(velocityProgram);
    gl.uniform1f(gl.getUniformLocation(velocityProgram, 'dragMultiplier'), guiControls.dragMultiplier);
    gl.uniform1f(gl.getUniformLocation(velocityProgram, 'wind'), guiControls.wind);
    gl.useProgram(lightingProgram);
    gl.uniform1f(gl.getUniformLocation(lightingProgram, 'waterTemperature'), CtoK(guiControls.waterTemperature));
    gl.uniform1f(gl.getUniformLocation(lightingProgram, 'greenhouseGases'), guiControls.greenhouseGases);
    gl.uniform1f(gl.getUniformLocation(lightingProgram, 'waterGreenHouseEffect'), guiControls.waterGreenHouseEffect);
    gl.uniform1f(gl.getUniformLocation(lightingProgram, 'IR_rate'), guiControls.IR_rate);
    gl.useProgram(advectionProgram);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'evapHeat'), guiControls.evapHeat);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'meltingHeat'), guiControls.meltingHeat);
    gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'meltingHeat'), guiControls.meltingHeat);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'condensationRate'), guiControls.condensationRate);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalDrying'), guiControls.globalDrying);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalHeating'), guiControls.globalHeating);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'soundingForcing'), guiControls.soundingForcing);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsStartAlt'), guiControls.globalEffectsStartAlt / guiControls.simHeight);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsEndAlt'), guiControls.globalEffectsEndAlt / guiControls.simHeight);
    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'waterTemperature'), CtoK(guiControls.waterTemperature));
    gl.useProgram(precipitationProgram);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'evapHeat'), guiControls.evapHeat);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'meltingHeat'), guiControls.meltingHeat);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'aboveZeroThreshold'), guiControls.aboveZeroThreshold);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'subZeroThreshold'), guiControls.subZeroThreshold);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'spawnChanceMult'), guiControls.spawnChance);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'snowDensity'), guiControls.snowDensity);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'fallSpeed'), guiControls.fallSpeed);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'growthRate0C'), guiControls.growthRate0C);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'growthRate_30C'), guiControls.growthRate_30C);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'freezingRate'), guiControls.freezingRate);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'meltingRate'), guiControls.meltingRate);
    gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'evapRate'), guiControls.evapRate);
    gl.useProgram(postProcessingProgram);
    if (postProc_exposure_loc !== null) {
      gl.uniform1f(postProc_exposure_loc, guiControls.exposure);
      gl.uniform1f(postProc_saturation_loc, guiControls.saturation);
      gl.uniform1f(postProc_contrast_loc, guiControls.contrast);
      if (postProc_bloomStrength_loc !== null)
        gl.uniform1f(postProc_bloomStrength_loc, guiControls.bloomStrength ?? 1.0);
    }
    setChargeGenerationUniforms();
  }

  function updateMenuStyle()
  {
    // Apply menu width
    datGui.width = guiControls.menuWidth;
    
    // Apply background color
    const guiElement = datGui.domElement;
    guiElement.style.backgroundColor = guiControls.menuBackgroundColor;
    
    // Apply text color to all elements
    const allTextElements = guiElement.querySelectorAll('*');
    allTextElements.forEach(el => {
      if (el.classList.contains('property-name') || 
          el.classList.contains('c') || 
          el.tagName === 'LABEL' ||
          el.tagName === 'SPAN') {
        el.style.color = guiControls.menuTextColor;
      }
    });
    
    // Apply accent color to sliders only
    const sliders = guiElement.querySelectorAll('.slider-fg');
    sliders.forEach(slider => {
      slider.style.backgroundColor = guiControls.menuAccentColor;
    });
    
    // Keep folder titles white (not accent color)
    const folders = guiElement.querySelectorAll('.title');
    folders.forEach(folder => {
      folder.style.color = guiControls.menuTextColor;
      // Make folder titles clickable to toggle open/close
      folder.style.cursor = 'pointer';
      folder.addEventListener('click', () => {
        const li = folder.parentElement;
        const ul = li.querySelector('ul');
        if (ul) {
          ul.classList.toggle('closed');
        }
      });
    });
  }

  function setupDatGui(strGuiControls)
  {
    datGui = new dat.GUI();
    disableDatGuiBuiltinKeybinds();

    try {
      const jsonStr = extractJsonObject(strGuiControls) || strGuiControls.trim();
      guiControls = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('Save file settings are invalid or corrupted, using defaults:', e.message);
      guiControls = JSON.parse(JSON.stringify(guiControls_default));
    }

    if (!guiControls.radarOverlaySource)
      guiControls.radarOverlaySource = 'composite';
    if (!guiControls.worldRadarProduct)
      guiControls.worldRadarProduct = 'reflectivity';
    if (guiControls.chargeGenerationRate === undefined)
      guiControls.chargeGenerationRate = guiControls_default.chargeGenerationRate;
    if (guiControls.chargeMinCloudDensity === undefined)
      guiControls.chargeMinCloudDensity = guiControls_default.chargeMinCloudDensity;
    if (guiControls.chargeStormCoreThreshold === undefined)
      guiControls.chargeStormCoreThreshold = guiControls_default.chargeStormCoreThreshold;

    if (typeof LightningV2 !== 'undefined') {
      Object.keys(LightningV2.DEFAULT_SETTINGS).forEach(key => {
        if (guiControls[key] === undefined)
          guiControls[key] = LightningV2.DEFAULT_SETTINGS[key];
      });
      if (guiControls.lightningPreset && guiControls.lightningPreset !== 'Custom')
        LightningV2.applyPreset(guiControls, guiControls.lightningPreset);
    }

    guiControls.tool = 'TOOL_NONE';

    cam.wrapHorizontally = guiControls.wrapHorizontally;
    cam.smooth = guiControls.SmoothCam;

    if (guiControls.wrapHorizontally)
      horizontalDisplayMult = 3.0;
    else
      horizontalDisplayMult = 1.0;


    if (frameNum == 0) {
      // only hide during initial setup. When resetting settings and
      // reinitializing datGui, H key no longer works to unhide it
      datGui.hide();
    }
    // add functions to guicontrols object
    guiControls.download = function() { prepareDownload(); };

    guiControls.openColorScaleEditor = function() {
      const panel = document.getElementById('colorScalePanel');
      if (panel) {
        panel.style.display = 'block';
      }
    };

    guiControls.openKeybindEditor = function() {
      const panel = document.getElementById('keybindPanel');
      if (panel) {
        panel.style.display = 'block';
        if (typeof refreshKeybindEditorList === 'function')
          refreshKeybindEditorList();
      }
    };

    guiControls.openSkyEditor = function() {
      const panel = document.getElementById('skyPanel');
      if (panel) {
        panel.style.display = 'block';
        if (typeof refreshSkyEditor === 'function')
          refreshSkyEditor();
      }
    };

    guiControls.openAllRadarMenus = function() {
      for (let i = 0; i < radars.length; i++) {
        if (radars[i].getMenuDiv && radars[i].getMenuDiv().style.display === 'none') {
          radars[i].toggleMenu();
        }
      }
    };

    guiControls.resetSettings = function() {
      if (confirm('Are you sure you want to reset all settings to default?')) {
        datGui.destroy();                                 // remove datGui completely
        setupDatGui(JSON.stringify(guiControls_default)); // generate new one with new settings
        setGuiUniforms();
        hideOrShowGraph();
        updateSunlight();
      }
    };

    var fluidParams_folder = datGui.addFolder('Fluid');

    fluidParams_folder.add(guiControls, 'vorticity', 0.0, 0.010, 0.001)
      .onChange(function() {
        gl.useProgram(boundaryProgram);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'vorticity'), guiControls.vorticity);
      })
      .name('Vorticity');

    fluidParams_folder.add(guiControls, 'dragMultiplier', 0.0, 1.0, 0.01)
      .onChange(function() {
        gl.useProgram(velocityProgram);
        gl.uniform1f(gl.getUniformLocation(velocityProgram, 'dragMultiplier'), guiControls.dragMultiplier);
      })
      .name('Drag');

    fluidParams_folder.add(guiControls, 'wind', -1.0, 1.0, 0.01)
      .onChange(function() {
        gl.useProgram(velocityProgram);
        gl.uniform1f(gl.getUniformLocation(velocityProgram, 'wind'), guiControls.wind);
      })
      .name('Wind');

    fluidParams_folder.add(guiControls, 'globalDrying', 0.0, 0.0001, 0.000001)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalDrying'), guiControls.globalDrying);
      })
      .name('Global Drying');

    fluidParams_folder.add(guiControls, 'globalHeating', -0.001, 0.001, 0.00001)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalHeating'), guiControls.globalHeating);
      })
      .name('Global Heating');

    // , 0, 1.0, 0.01
    fluidParams_folder.add(guiControls, 'soundingForcing', 0, 1.0, 0.01)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'soundingForcing'), guiControls.soundingForcing);
      })
      .name('Sounding Forcing');

    fluidParams_folder.add(guiControls, 'globalEffectsEndAlt', 0, guiControls.simHeight, 10)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        if (guiControls.globalEffectsEndAlt < guiControls.globalEffectsStartAlt) {
          guiControls.globalEffectsStartAlt = guiControls.globalEffectsEndAlt;
          gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsStartAlt'), guiControls.globalEffectsStartAlt / guiControls.simHeight);
        }
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsEndAlt'), guiControls.globalEffectsEndAlt / guiControls.simHeight);
      })
      .listen()
      .name('Apply below altitude');

    fluidParams_folder.add(guiControls, 'globalEffectsStartAlt', 0, guiControls.simHeight, 10)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        if (guiControls.globalEffectsStartAlt > guiControls.globalEffectsEndAlt) {
          guiControls.globalEffectsEndAlt = guiControls.globalEffectsStartAlt;
          gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsEndAlt'), guiControls.globalEffectsEndAlt / guiControls.simHeight);
        }

        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'globalEffectsStartAlt'), guiControls.globalEffectsStartAlt / guiControls.simHeight);
      })
      .listen()
      .name('Apply above altitude');


    var UI_folder = datGui.addFolder('User Interaction');

    UI_folder
      .add(guiControls, 'tool', {
        'Flashlight' : 'TOOL_NONE',
        'Temperature' : 'TOOL_TEMPERATURE',
        'Water Vapor / Cloud' : 'TOOL_WATER',
        'Land' : 'TOOL_WALL_LAND',
        'Fresh Water / Lake' : 'TOOL_WALL_FRESH',
        'Salt Water / Ocean' : 'TOOL_WALL_SEA',
        'Ice Sheet' : 'TOOL_WALL_ICE_SHEET',
        'Ice Cap / Glacier' : 'TOOL_WALL_ICE_CAP',
        'Urban' : 'TOOL_WALL_URBAN',
        'Suburban' : 'TOOL_WALL_SUBURBAN',
        'Runway' : 'TOOL_WALL_RUNWAY',
        'Industrial' : 'TOOL_WALL_INDUSTRIAL',
        'Fire' : 'TOOL_WALL_FIRE',
        'Smoke / Dust' : 'TOOL_SMOKE',
        'Soil Moisture' : 'TOOL_WALL_MOIST',
        'Vegetation' : 'TOOL_VEGETATION',
        'Snow' : 'TOOL_WALL_SNOW',
        'Wind' : 'TOOL_WIND',
        'Charge' : 'TOOL_CHARGE',
        'Weather Station' : 'TOOL_STATION',
        'Radar Tower' : 'TOOL_RADAR',
        'Airmass Generator' : 'TOOL_AIRMASS',
        'Marker' : 'TOOL_MARKER',
        'Nuke' : 'TOOL_NUKE',
      })
      .name('Tool')
      .listen();
    UI_folder.add(guiControls, 'brushSize', 1, 200, 1).name('Brush Diameter').listen();
    UI_folder.add(guiControls, 'wholeWidth').name('Whole Width Brush').listen();
    UI_folder.add(guiControls, 'brushIntensity', 0.005, 1, 0.001).name('Brush Intensity');
    UI_folder.add(guiControls, 'invertTool').name('Invert Tool (charge − / +)').listen();
    UI_folder.add(guiControls, 'allowCaves')
      .onChange(function() {
        gl.useProgram(boundaryProgram);
        gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'allowCaves'), guiControls.allowCaves ? 1 : 0);
      })
      .name('Allow Caves');

    var radiation_folder = datGui.addFolder('Radiation');

    radiation_folder.add(guiControls, 'timeOfDay', 0.0, 23.96, 0.01).onChange(onUpdateTimeOfDaySlider).name('Time of day').listen();

    radiation_folder.add(guiControls, 'dayNightCycle').name('Day/Night Cycle').listen();

    radiation_folder.add(guiControls, 'accelerateNight').name('Accelerate Night').listen();

    radiation_folder.add(guiControls, 'latitude', -90.0, 90.0, 0.1).onChange(function() { updateSunlight(); }).name('Latitude').listen();

    radiation_folder.add(guiControls, 'month', 1.0, 12.99, 0.01).onChange(onUpdateMonthSlider).name('Month').listen();

    radiation_folder.add(guiControls, 'sunAngle', -10.0, 190.0, 0.1)
      .onChange(function() {
        updateSunlight('MANUAL_ANGLE');
        guiControls.dayNightCycle = false;
      })
      .name('Sun Angle')
      .listen();

    radiation_folder.add(guiControls, 'sunIntensity', 0.0, 4.0, 0.01).onChange(function() { updateSunlight('MANUAL_ANGLE'); }).name('Sun Intensity');

    radiation_folder.add(guiControls, 'greenhouseGases', 0.0, 0.01, 0.0001)
      .onChange(function() {
        gl.useProgram(lightingProgram);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, 'greenhouseGases'), guiControls.greenhouseGases);
      })
      .name('Greenhouse Gases');

    radiation_folder.add(guiControls, 'waterGreenHouseEffect', 0.0, 0.01, 0.0001)
      .onChange(function() {
        gl.useProgram(lightingProgram);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, 'waterGreenHouseEffect'), guiControls.waterGreenHouseEffect);
      })
      .name('Water Vapor Greenhouse Effect');

    radiation_folder
      .add(guiControls, 'IR_rate', 0.0, 10.0, 0.1)
      /*.onChange(function() {
        gl.useProgram(lightingProgram);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, 'IR_rate'), guiControls.IR_rate);
      })*/
      .name('IR Multiplier');

    var water_folder = datGui.addFolder('Water');

    water_folder.add(guiControls, 'waterTemperature', 0.0, 40.0, 0.1)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'waterTemperature'), CtoK(guiControls.waterTemperature));
        gl.useProgram(lightingProgram);
        gl.uniform1f(gl.getUniformLocation(lightingProgram, 'waterTemperature'), CtoK(guiControls.waterTemperature));
      })
      .name('Lake / Sea Temperature (°C)');

    water_folder.add(guiControls, 'dynamicWaterTemperature').name('Dynamic Water Temperature').onChange(function() {
      gl.useProgram(boundaryProgram);
      gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'dynamicWaterTemperature'), guiControls.dynamicWaterTemperature ? 1.0 : 0.0);
    });

    water_folder.add(guiControls, 'landEvaporation', 0.0, 0.0004, 0.00001)
      .onChange(function() {
        gl.useProgram(boundaryProgram);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'landEvaporation'), guiControls.landEvaporation);
      })
      .name('Land Evaporation');
    water_folder.add(guiControls, 'waterEvaporation', 0.0, 0.0004, 0.00001)
      .onChange(function() {
        gl.useProgram(boundaryProgram);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'waterEvaporation'), guiControls.waterEvaporation);
      })
      .name('Lake / Sea Evaporation');
    water_folder.add(guiControls, 'evapHeat', 0.0, 5.0, 0.1)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'evapHeat'), guiControls.evapHeat);
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'evapHeat'), guiControls.evapHeat);
        gl.useProgram(boundaryProgram);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'evapHeat'), guiControls.evapHeat);
      })
      .name('Evaporation Heat');
    water_folder.add(guiControls, 'meltingHeat', 0.0, 5.0, 0.1)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'meltingHeat'), guiControls.meltingHeat);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'meltingHeat'), guiControls.meltingHeat);
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'meltingHeat'), guiControls.meltingHeat);
      })
      .name('Melting Heat');
    water_folder.add(guiControls, 'condensationRate', 0.00001, 0.020, 0.001)
      .onChange(function() {
        gl.useProgram(advectionProgram);
        gl.uniform1f(gl.getUniformLocation(advectionProgram, 'condensationRate'), guiControls.condensationRate);
      })
      .listen()
      .name('Condensation Rate');
    water_folder.add(guiControls, 'waterWeight', 0.0, 2.0, 0.01)
      .onChange(function() {
        gl.useProgram(boundaryProgram);
        gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'waterWeight'), guiControls.waterWeight);
      })
      .name('Water Weight');

    var precipitation_folder = datGui.addFolder('Precipitation');

    precipitation_folder.add(guiControls, 'aboveZeroThreshold', 0.1, 2.0, 0.001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'aboveZeroThreshold'), guiControls.aboveZeroThreshold);
      })
      .name('Precipitation Threshold +°C');

    precipitation_folder.add(guiControls, 'subZeroThreshold', 0.0, 1.0, 0.001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'subZeroThreshold'), guiControls.subZeroThreshold);
      })
      .name('Precipitation Threshold -°C');

    precipitation_folder.add(guiControls, 'spawnChance', 0.00001, 0.0001, 0.00001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'spawnChanceMult'), guiControls.spawnChance);
      })
      .name('Spawn Rate')
      .listen();

    precipitation_folder.add(guiControls, 'snowDensity', 0.1, 0.9, 0.01)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'snowDensity'), guiControls.snowDensity);
      })
      .name('Snow Density');

    precipitation_folder.add(guiControls, 'fallSpeed', 0.0001, 0.001, 0.0001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'fallSpeed'), guiControls.fallSpeed);
      })
      .name('Fall Speed');

    precipitation_folder.add(guiControls, 'growthRate0C', 0.0001, 0.005, 0.0001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'growthRate0C'), guiControls.growthRate0C);
      })
      .name('Growth Rate 0°C');

    precipitation_folder.add(guiControls, 'growthRate_30C', 0.0001, 0.005, 0.0001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'growthRate_30C'), guiControls.growthRate_30C);
      })
      .name('Growth Rate -30°C');

    precipitation_folder
      .add(guiControls, 'freezingRate', 0.0005, 0.01, 0.0001) // 0.0035
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'freezingRate'), guiControls.freezingRate);
      })
      .name('Freezing Rate');

    precipitation_folder
      .add(guiControls, 'meltingRate', 0.0005, 0.01, 0.0001) // 0.0035
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'meltingRate'), guiControls.meltingRate);
      })
      .name('Melting Rate');

    precipitation_folder.add(guiControls, 'evapRate', 0.0001, 0.005, 0.0001)
      .onChange(function() {
        gl.useProgram(precipitationProgram);
        gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'evapRate'), guiControls.evapRate);
      })
      .name('Evaporation Rate');

    precipitation_folder.add(guiControls, 'inactiveDroplets', 0, NUM_DROPLETS).listen().name('Inactive Droplets');

    var radar_folder = datGui.addFolder('Radar');
    radarGuiFolder = radar_folder;
    radar_folder.add(guiControls, 'radarOpacity', 0.0, 1.0, 0.05).name('Radar Imagery Opacity').listen();
    radar_folder.add(guiControls, 'radarUpdateFrequency', 1, 300, 1).name('Update Frequency (iterations)').listen();
    radar_folder.add(guiControls, 'radarOverlay').name('Overlay on Realistic View').listen();
    refreshRadarOverlaySourceDropdown();
    radar_folder.add(guiControls, 'radarLightningIcons').name('Lightning Strike Icons').listen();
    radar_folder.add(guiControls, 'radarLightningIconDuration', 1, 120, 0.5).name('Lightning Icon Duration (s)').listen();
    radar_folder.add(guiControls, 'dbzOpacityEnabled').name('dBZ-Based Opacity').listen();
    radar_folder.add(guiControls, 'dbzOpacityStrength', 0.0, 10.0, 0.05).name('dBZ Opacity Strength').listen();
    radar_folder.add(guiControls, 'worldRadarProduct', buildWorldRadarProductGuiOptions())
      .name('World Radar Product').listen();
    radar_folder.add(guiControls, 'worldRadarResolution', 0.3, 500.0, 0.1).name('World PPI Gate Resolution').listen();
    radar_folder.add(guiControls, 'worldRadarSensitivity', 0.0, 10.0, 0.01).name('World Radar Sensitivity').listen();
    radar_folder.add(guiControls, 'radarCappiHeight', 0.05, 0.95, 0.01).name('CAPPI Height (fraction)').listen();
    guiControls.resetRadarAccumulation = function() { resetRadarAccumulation(); };
    radar_folder.add(guiControls, 'resetRadarAccumulation').name('Reset Rain Accumulation');

    if (typeof LightningV2 !== 'undefined') {
      LightningV2.buildLightningV2GUI(datGui, guiControls, {
        setChargeGenerationUniforms,
        onSettingsChanged() { guiControls.lightningPreset = 'Custom'; },
        forceSpawnLightningType,
        forceSpawnAllLightningTypes,
      });
    } else {
      var lightning_folder = datGui.addFolder('Lightning');
      lightning_folder.add(guiControls, 'chargeGenerationRate', 0.0, 5.0, 0.05)
        .onChange(setChargeGenerationUniforms).name('Cloud Charge Generation');
    }

    var display_folder = datGui.addFolder('Display');

    const displayModeOptions = {
        '1 Temperature -26°C to 30°C' : 'DISP_TEMPERATURE',
        '2 Water Vapor' : 'DISP_WATER',
        '3 Realistic' : 'DISP_REAL',
        '4 Horizontal Velocity' : 'DISP_HORIVEL',
        '5 Vertical Velocity' : 'DISP_VERTVEL',
        '6 IR Heating / Cooling' : 'DISP_IRHEATING',
        '7 IR Down -60°C to 26°C' : 'DISP_IRDOWNTEMP',
        '8 IR Up -26°C to 30°C' : 'DISP_IRUPTEMP',
        '9 Precipitation Mass' : 'DISP_PRECIPFEEDBACK_MASS',
        'Precipitation Heating/Cooling' : 'DISP_PRECIPFEEDBACK_HEAT',
        'Precipitation Condensation/Evaporation' : 'DISP_PRECIPFEEDBACK_VAPOR',
        'Rain Deposition' : 'DISP_PRECIPFEEDBACK_RAIN',
        'Snow Deposition' : 'DISP_PRECIPFEEDBACK_SNOW',
        'Precipitation/Soil Moisture' : 'DISP_SOIL_MOISTURE',
        'Curl' : 'DISP_CURL',
        'Relative Humidity / Cloud Density' : 'DISP_HUMD',
        'Air Quality' : 'DISP_AIRQUALITY',
        'Temperature Change' : 'DISP_TEMPERATURE_CHANGE',
        'Charge' : 'DISP_CHARGE',
        'Hail Size' : 'DISP_HAIL_SIZE',
        'Droplet Size' : 'DISP_DROPLET_SIZE',
        'Radar Imagery' : 'DISP_RADAR',
        'Composite Radar' : 'DISP_RADAR_COMPOSITE',
        'World Radar' : 'DISP_RADAR_WORLD',
        'Convective Risk' : 'DISP_RISK'
    };
    SOUNDING_VIEW_CONFIGS.forEach(cfg => {
      displayModeOptions['Sounding: ' + cfg.label] = cfg.mode;
    });

    display_folder
      .add(guiControls, 'displayMode', displayModeOptions)
      .name('Display Mode')
      .listen();
    display_folder.add(guiControls, 'exposure', 0.25, 5.0, 0.01)
      .onChange(function() {
        gl.useProgram(postProcessingProgram);
        gl.uniform1f(gl.getUniformLocation(postProcessingProgram, 'exposure'), guiControls.exposure);
      })
      .name('Exposure');

    display_folder.add(guiControls, 'camSpeed', 0.001, 0.050, 0.001).name('Camera Pan Speed');


    display_folder.add(guiControls, 'wrapHorizontally')
      .onChange(function() {
        cam.wrapHorizontally = guiControls.wrapHorizontally;
        cam.center();
        if (guiControls.wrapHorizontally)
          horizontalDisplayMult = 3.0;
        else
          horizontalDisplayMult = 1.0;
      })
      .name('Wrap Horizontally');

    display_folder.add(guiControls, 'SmoothCam').onChange(function() { cam.smooth = guiControls.SmoothCam; }).name('Smooth Camera');

    display_folder.add(guiControls, 'showGraph').onChange(hideOrShowGraph).name('Show Sounding Graph').listen();
    display_folder.add(guiControls, 'showDrops').name('Show Droplets').listen();
    display_folder.add(guiControls, 'realDewPoint').name('Show Real Dew Point');

    display_folder.add(guiControls, 'saturation', 0.0, 3.0, 0.01)
      .onChange(function() {
        gl.useProgram(postProcessingProgram);
        gl.uniform1f(gl.getUniformLocation(postProcessingProgram, 'saturation'), guiControls.saturation);
      })
      .name('Saturation');

    display_folder.add(guiControls, 'contrast', 0.5, 3.0, 0.01)
      .onChange(function() {
        gl.useProgram(postProcessingProgram);
        gl.uniform1f(gl.getUniformLocation(postProcessingProgram, 'contrast'), guiControls.contrast);
      })
      .name('Contrast');

    display_folder.add(guiControls, 'starVisibility', 0.0, 1.0, 0.01)
      .onChange(function() { uploadSkyUniforms(); })
      .name('Star Visibility');

    display_folder.add(guiControls, 'starLightEmitStrength', 0.0, 0.5, 0.01)
      .onChange(function() { uploadSkyUniforms(); })
      .name('Star Light Emit Strength');

    display_folder.add(guiControls, 'starDensity', 0.0, 1.0, 0.01)
      .onChange(function() { uploadSkyUniforms(); })
      .name('Star Density');

    display_folder.add(guiControls, 'autoMinShadowLight').name('Auto Shadow Light');

    display_folder.add(guiControls, 'minShadowLight', 0.0, 0.2, 0.001)
      .onChange(function() {
        if (!guiControls.autoMinShadowLight) {
          gl.useProgram(realisticDisplayProgram);
          gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, 'minShadowLight'), guiControls.minShadowLight);
          gl.useProgram(skyBackgroundDisplayProgram);
          gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'minShadowLight'), guiControls.minShadowLight);
        }
      })
      .name('Min Shadow Light (0=darkest)');

    display_folder.add(guiControls, 'twelveHourClock').name('12-hour clock');

    display_folder
      .add(guiControls, 'lengthUnit', {
        'km / meters / cm / mm' : 'LENGTH_UNIT_METRIC',
        'miles / ft / inch' : 'LENGTH_UNIT_IMPERIAL',
      })
      .name('Length Unit')
      .onChange(function() {
        for (i = 0; i < weatherStations.length; i++) {
          weatherStations[i].clearChart();
        }
      });

    display_folder
      .add(guiControls, 'speedUnit', {
        'km/h' : 'SPEED_UNIT_KMH',
        'm/s' : 'SPEED_UNIT_MS',
        'mph' : 'SPEED_UNIT_MPH',
        'kt' : 'SPEED_UNIT_KT',
      })
      .name('Speed Unit')
      .onChange(function() {
        for (i = 0; i < weatherStations.length; i++) {
          weatherStations[i].clearChart();
        }
      });

    display_folder
      .add(guiControls, 'shearUnit', {
        'km/h' : 'SPEED_UNIT_KMH',
        'm/s' : 'SPEED_UNIT_MS',
        'mph' : 'SPEED_UNIT_MPH',
        'kt' : 'SPEED_UNIT_KT',
      })
      .name('Shear Unit');

    display_folder
      .add(guiControls, 'lapseUnit', {
        '°C/km' : 'LAPSE_UNIT_C_KM',
        '°C/kft' : 'LAPSE_UNIT_C_KFT',
        '°F/kft' : 'LAPSE_UNIT_F_KFT',
      })
      .name('Lapse Unit');

    display_folder
      .add(guiControls, 'tempUnit', {
        '°C' : 'TEMP_UNIT_C',
        '°F' : 'TEMP_UNIT_F',
        'K' : 'TEMP_UNIT_K',
      })
      .name('Temperature Unit')
      .onChange(function() {
        for (i = 0; i < weatherStations.length; i++) {
          weatherStations[i].clearChart();
        }
      });


    var advanced_folder = datGui.addFolder('Advanced');

    // Nukes folder
    var nukes_folder = datGui.addFolder('Nukes');
    nukes_folder.add(guiControls, 'nukeBlastRadius', 10, 200, 1).name('Blast Radius');
    nukes_folder.add(guiControls, 'nukeTemperature', 0, 500, 10).name('Blast Temperature (°C)');
    nukes_folder.add(guiControls, 'nukeSmokeAmount', 0, 10, 0.1).name('Smoke Amount');
    nukes_folder.add(guiControls, 'nukeFallSpeed', 1, 50, 1).name('Fall Speed (m/s)');
    nukes_folder.add(guiControls, 'nukeIgnitionEnabled').name('Ignite Vegetation');

    advanced_folder.add(guiControls, 'enablePrecipitation')
      .onChange(function() {
        initRainDrops();
        setupPrecipitationBuffers();
        guiControls.inactiveDroplets = NUM_DROPLETS;
      })
      .name('Enable Precipitation');

    advanced_folder.add(guiControls, 'IterPerFrame', 1, 50, 1)
      .onChange(function() { guiControls.auto_IterPerFrame = false; })
      .name('Iterations / Frame').listen();

    advanced_folder.add(guiControls, 'auto_IterPerFrame').name('Auto Adjust').listen();


    advanced_folder.add(guiControls, 'sound').name('Enable Sound').onChange(function() {
      if (guiControls.sound) {
        if (soundSystem == null) {
          soundSystem = new SoundSystem();
        }
      } else {
        soundSystem?.mute();
      }
    });

    advanced_folder.add(guiControls, 'enableBloom').name('Enable Bloom');
    if (guiControls.performanceAutoScaling !== undefined)
      advanced_folder.add(guiControls, 'performanceAutoScaling').name('Auto Performance Scaling');
    advanced_folder.add(guiControls, 'enableVectorField').name('Vector Field');
    advanced_folder.add(guiControls, 'displayWeatherStations')
      .onChange(function() {
        displayWeatherStations = guiControls.displayWeatherStations;
        for (i = 0; i < weatherStations.length; i++) {
          weatherStations[i].setHidden(!displayWeatherStations);
        }
      })
      .name('Weather Stations');
    advanced_folder.add(guiControls, 'displayRadars')
      .onChange(function() {
        displayRadars = guiControls.displayRadars;
        for (i = 0; i < radars.length; i++) {
          radars[i].setHidden(!displayRadars);
        }
      })
      .name('Radars');
    advanced_folder.add(guiControls, 'displayAirmassGenerators')
      .onChange(function() {
        displayAirmassGenerators = guiControls.displayAirmassGenerators;
        for (i = 0; i < airmassGenerators.length; i++) {
          airmassGenerators[i].setHidden(!displayAirmassGenerators);
        }
      })
      .name('Airmass Generators');
    advanced_folder.add(guiControls, 'airplaneMode')
      .onChange(function() {
        airplaneMode = guiControls.airplaneMode;
        if (airplaneMode) {
          airplane.enableAirplaneMode(false);
        } else {
          airplane.disableAirplaneMode();
        }
      })
      .name('Airplane Mode');
    advanced_folder.add(guiControls, 'slowMotion')
      .name('Realtime (Slow Motion)');
    advanced_folder.add(guiControls, 'realDewPoint').name('Real Dew Point');
    advanced_folder.add(guiControls, 'soundingMode')
      .onChange(function() {
        gl.useProgram(velocityProgram);
        gl.uniform1f(gl.getUniformLocation(velocityProgram, 'dragMultiplier'),
          guiControls.soundingMode ? 999.0 : guiControls.dragMultiplier);
      })
      .name('Sounding Mode');
    advanced_folder.add(guiControls, 'fullscreenResolution', 
      ['Default', '640x480', '800x600', '1024x768', '1280x720', '1280x1024', '1366x768', '1600x900', '1920x1080', '2560x1440', '3840x2160'])
      .onChange(changeFullscreenResolution)
      .name('Fullscreen Res');
    advanced_folder.add(guiControls, 'skipCurlCalculation').name('Skip Curl (Faster)');
    advanced_folder.add(guiControls, 'skipCAPECalculation').name('Skip CAPE (Faster)');
    advanced_folder.add(guiControls, 'skipLightingCalculation').name('Skip Lighting (Major boost)');
    advanced_folder.add(guiControls, 'skipAdvection').name('Skip Advection (No fluid)');
    advanced_folder.add(guiControls, 'skipChargeCalculation').name('Skip Charge (Faster)');
    advanced_folder.add(guiControls, 'reducedWeatherStationUpdates').name('Reduce Station Updates');
    advanced_folder.add(guiControls, 'reducedPrecipitation')
      .onChange(function() {
        initRainDrops();
        setupPrecipitationBuffers();
        guiControls.inactiveDroplets = NUM_DROPLETS;
      })
      .name('Reduce Precipitation');
    advanced_folder.add(guiControls, 'disableTempChangeHistory').name('Disable Temp History');

    advanced_folder.add(guiControls, 'resetSettings').name('Reset all settings');

    datGui.add(guiControls, 'paused').onChange(handlePause).name('Paused').listen();
    datGui.add(guiControls, 'download').name('Save Simulation to File');
    datGui.add(guiControls, 'openColorScaleEditor').name('Open Color Scale Editor');
    datGui.add(guiControls, 'openKeybindEditor').name('Open Keybind Editor');
    datGui.add(guiControls, 'openSkyEditor').name('Open Sky Editor');
    datGui.add(guiControls, 'hodograph2DNodes', 5, 100, 1).name('2D Hodograph Nodes');
    datGui.add(guiControls, 'hodographProfileNodes', 5, 100, 1).name('Profile Hodograph Nodes');
    datGui.add(guiControls, 'analogRelevancy', 0, 100, 1).name('Analog Relevancy').onChange(() => {
      if (typeof soundingGraph !== 'undefined' && soundingGraph) {
        soundingGraph._similarAnalogsFingerprint = '';
        soundingGraph.renderMetricsSimilarSection(soundingGraph._lastAnalogSnapshot, true);
      }
    });

    datGui.width = 400;
  }

  // guiControls.paused = true; // pause before first iteration for debugging

  await loadingBar.set(3, 'Initializing Sounding Graph');
  // END OF GUI

  window.startSimulation = function()
  {
    if (!postProcessingProgram) {
      console.warn('Simulation still loading — GPU programs not ready yet.');
      return;
    }
    console.log('startSimulation called, SETUP_MODE was:', SETUP_MODE);
    SETUP_MODE = false;
    simRuntimeFrames = 0;
    gl.useProgram(postProcessingProgram);
    if (postProc_exposure_loc !== null) {
      gl.uniform1f(postProc_exposure_loc, guiControls.exposure);
      gl.uniform1f(postProc_saturation_loc, guiControls.saturation);
      gl.uniform1f(postProc_contrast_loc, guiControls.contrast);
      if (postProc_bloomStrength_loc !== null)
        gl.uniform1f(postProc_bloomStrength_loc, guiControls.bloomStrength ?? 1.0);
    }
    datGui.show(); // unhide

    clockEl = document.createElement('div');
    document.body.appendChild(clockEl);

    smoothedFrameMs = 18;

    clockEl.innerHTML = '';
    clockEl.style.position = 'fixed';
    clockEl.style.zIndex = '3';
    clockEl.style.left = '0';
    clockEl.style.top = '10px';
    clockEl.style.width = '100%';
    clockEl.style.textAlign = 'center';
    clockEl.style.fontFamily = "'Segoe UI', Arial, sans-serif";
    clockEl.style.fontSize = '32px';
    clockEl.style.fontWeight = '700';
    clockEl.style.color = '#ffffff';
    clockEl.style.textShadow = '0 1px 3px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.7)';
    clockEl.style.webkitFontSmoothing = 'antialiased';
    clockEl.style.pointerEvents = 'none';

    simDateTime = new Date(2000, Math.floor(guiControls.month) - 1, (guiControls.month % 1) * 30.417);

    // initialize time and solar angle
    if (guiControls.dayNightCycle) {
      onUpdateTimeOfDaySlider();
      onUpdateMonthSlider();
    } else {
      updateSunlight('MANUAL_ANGLE'); // set angle from savefile
    }

    if (guiControls.realtimeMode)
      enableRealtimeMode();
  }

function formatSoundingSimTimeLabel()
{
  const totalSec = Math.max(0, iterNum * timePerIteration * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  if (h >= 1) {
    return 'Sim ' + h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return 'Sim ' + m + ':' + String(s).padStart(2, '0');
}

function formatSoundingObsTimeLabel()
{
  if (typeof simDateTime === 'undefined' || !simDateTime) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = simDateTime;
  const utc = d.getUTCHours().toString().padStart(2, '0') + ':00 UTC';
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' + utc;
}

function skewSatVaporPressureHpa(Tc)
{
  return 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5));
}

function skewSatMixingRatioGkg(Tc, hpa)
{
  const es = skewSatVaporPressureHpa(Tc);
  if (hpa <= es + 0.01) return 60;
  return (622 * es) / (hpa - es);
}

function skewTempFromMixingRatioGkg(wGkg, hpa)
{
  let lo = -90, hi = 60;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) * 0.5;
    if (skewSatMixingRatioGkg(mid, hpa) > wGkg) hi = mid;
    else lo = mid;
  }
  return (lo + hi) * 0.5;
}

function skewAltMFromHpa(hpa)
{
  return (1.0 - Math.pow(hpa / 1013.25, 1.0 / 5.25588)) / 2.25577e-5;
}

function skewHpaFromAltM(altM)
{
  return 1013.25 * Math.pow(1.0 - 2.25577e-5 * Math.max(0, altM), 5.25588);
}

function windAtAltFromHodo(hodoPoints, altM)
{
  if (!hodoPoints || hodoPoints.length === 0) return {u: 0, v: 0};
  if (altM <= hodoPoints[0].altM) return {u: hodoPoints[0].u, v: hodoPoints[0].v};
  const last = hodoPoints[hodoPoints.length - 1];
  if (altM >= last.altM) return {u: last.u, v: last.v};
  for (let i = 0; i < hodoPoints.length - 1; i++) {
    const p0 = hodoPoints[i];
    const p1 = hodoPoints[i + 1];
    if (altM >= p0.altM && altM <= p1.altM) {
      const t = p1.altM > p0.altM ? (altM - p0.altM) / (p1.altM - p0.altM) : 0;
      return {
        u: p0.u + (p1.u - p0.u) * t,
        v: p0.v + (p1.v - p0.v) * t,
      };
    }
  }
  return {u: last.u, v: last.v};
}

function computeLayerMeanWind(hodoPoints, botM, topM)
{
  let sumU = 0, sumV = 0, n = 0;
  for (const p of hodoPoints) {
    if (p.altM >= botM && p.altM <= topM) {
      sumU += p.u;
      sumV += p.v;
      n++;
    }
  }
  if (n === 0) return windAtAltFromHodo(hodoPoints, (botM + topM) * 0.5);
  return {u: sumU / n, v: sumV / n};
}

function computeBunkersStormMotion(hodoPoints)
{
  const sfc = windAtAltFromHodo(hodoPoints, 0);
  const km6 = windAtAltFromHodo(hodoPoints, 6000);
  const mean = computeLayerMeanWind(hodoPoints, 0, 6000);
  const shearU = km6.u - sfc.u;
  const shearV = km6.v - sfc.v;
  const shearMag = Math.hypot(shearU, shearV);
  const dev = 7.5;
  let right = {...mean};
  let left = {...mean};
  if (shearMag > 0.5) {
    const perpU = -shearV / shearMag;
    const perpV = shearU / shearMag;
    right = {u: mean.u + perpU * dev, v: mean.v + perpV * dev};
    left = {u: mean.u - perpU * dev, v: mean.v - perpV * dev};
  }
  return {right, left, mean};
}

function computeCorfidiVectors(hodoPoints)
{
  const low = computeLayerMeanWind(hodoPoints, 0, 3000);
  const mid = computeLayerMeanWind(hodoPoints, 3000, 9000);
  const shearU = mid.u - low.u;
  const shearV = mid.v - low.v;
  const mag = Math.hypot(shearU, shearV) || 1;
  const down = {u: low.u + shearU * 0.35, v: low.v + shearV * 0.35};
  const up = {u: mid.u - shearU * 0.35, v: mid.v - shearV * 0.35};
  return {down, up, shearMag: mag};
}

function formatWindDirSpd(u, v)
{
  const spd = Math.hypot(u, v);
  if (spd < 0.2) return 'calm';
  const dir = Math.round((Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360);
  return dir + '°/' + Math.round(msToKnots(spd)) + ' kt';
}

function computeEHI(capeJkg, srhM2s2, shearMs)
{
  if (capeJkg <= 0 || srhM2s2 <= 0) return 0;
  const capeTerm = capeJkg / 30000;
  const srhTerm = srhM2s2 / 150;
  const shearTerm = Math.min(2, Math.max(0.3, shearMs / 12));
  return capeTerm * srhTerm * shearTerm;
}

function computeSHIP(muCape, shear6km, lapse700_500, mucin)
{
  const capeF = Math.max(0, muCape / 1500);
  const shearF = Math.max(0, shear6km / 20);
  const lapseF = Math.max(0, (lapse700_500 || 0) / 9);
  const cinF = Math.max(0.2, 1 - Math.max(0, mucin) / 200);
  return capeF * shearF * lapseF * cinF * 3.0;
}

function computeSCP(muCape, shear6km, srh3km)
{
  return (muCape / 1000) * (shear6km / 10) * (srh3km / 100);
}

function computeThetaEC(tempC, mixingRatio)
{
  const tK = CtoK(tempC);
  return tK + 2500 * Math.max(mixingRatio, 0) / 1004;
}

function findWetBulbZeroAlt(envTempsC, envDewC, surfaceLevel, sim_res_y, dz, wallTextureValues)
{
  for (let y = surfaceLevel; y < sim_res_y - 1; y++) {
    if (wallTextureValues[4 * y + 1] === 0 || wallTextureValues[4 * (y + 1) + 1] === 0) continue;
    const rh = relativeHumd(CtoK(envTempsC[y]), maxWater(CtoK(envDewC[y])));
    const tw0 = envTempsC[y] - (100 - rh) / 5;
    const rh1 = relativeHumd(CtoK(envTempsC[y + 1]), maxWater(CtoK(envDewC[y + 1])));
    const tw1 = envTempsC[y + 1] - (100 - rh1) / 5;
    if (tw0 > 0 && tw1 <= 0) {
      const ratio = tw0 / (tw0 - tw1);
      return (y - surfaceLevel + ratio) * dz;
    }
  }
  return NaN;
}

function computeCriticalAngle(hodoPoints, stormU, stormV)
{
  const sfc = windAtAltFromHodo(hodoPoints, 0);
  const km1 = windAtAltFromHodo(hodoPoints, 1000);
  const inflowU = sfc.u - stormU;
  const inflowV = sfc.v - stormV;
  const shearU = km1.u - sfc.u;
  const shearV = km1.v - sfc.v;
  const a = Math.atan2(inflowV, inflowU);
  const b = Math.atan2(shearV, shearU);
  let deg = Math.abs((a - b) * 180 / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return Math.round(deg);
}

function drawSkewWindBarb(ctx, stemX, y, uMs, vMs)
{
  const spdKt = msToKnots(Math.hypot(uMs, vMs));
  if (spdKt < 1) return;
  
  // Calculate wind direction (flip to show wind direction correctly)
  const windDir = Math.atan2(-uMs, vMs); // opposite of velocity direction
  
  // Stem length based on speed
  const stemLen = Math.min(34, 8 + spdKt * 0.42);
  
  // Calculate stem endpoint
  const tipX = stemX - stemLen * Math.sin(windDir);
  const tipY = y - stemLen * Math.cos(windDir);
  
  // Draw stem
  ctx.beginPath();
  ctx.moveTo(stemX, y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  
  // Break down speed into barb components
  let flags = Math.floor(spdKt / 50);
  let rem = spdKt - flags * 50;
  let pennants = Math.floor(rem / 10);
  rem -= pennants * 10;
  let half = rem >= 5 ? 1 : 0;
  
  // Calculate perpendicular direction (for barbs) - at 45 degree angle from stem
  const barbAngle = windDir - Math.PI / 4; // 45 degrees to the right of stem
  const barbLen = 10;
  
  // Start position along stem
  let barb_pos = 0;
  const step = 4; // spacing between barbs
  
  // Draw 50-knot flags (filled triangles)
  for (let i = 0; i < flags; i++) {
    const pos_t = barb_pos / stemLen;
    const px = stemX + (tipX - stemX) * pos_t;
    const py = y + (tipY - y) * pos_t;
    
    // Next point along stem
    const nextPos_t = Math.min(1, (barb_pos + step) / stemLen);
    const nextPx = stemX + (tipX - stemX) * nextPos_t;
    const nextPy = y + (tipY - y) * nextPos_t;
    
    // Barb endpoint
    const barbEndX = px + barbLen * Math.cos(barbAngle);
    const barbEndY = py + barbLen * Math.sin(barbAngle);
    
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(barbEndX, barbEndY);
    ctx.lineTo(nextPx, nextPy);
    ctx.closePath();
    ctx.fill();
    
    barb_pos += step;
  }
  
  // Draw 10-knot pennants (lines at 45 degrees)
  for (let i = 0; i < pennants; i++) {
    const pos_t = barb_pos / stemLen;
    const px = stemX + (tipX - stemX) * pos_t;
    const py = y + (tipY - y) * pos_t;
    
    const barbEndX = px + barbLen * Math.cos(barbAngle);
    const barbEndY = py + barbLen * Math.sin(barbAngle);
    
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(barbEndX, barbEndY);
    ctx.stroke();
    
    barb_pos += step;
  }
  
  // Draw 5-knot half-barb
  if (half) {
    const pos_t = barb_pos / stemLen;
    const px = stemX + (tipX - stemX) * pos_t;
    const py = y + (tipY - y) * pos_t;
    
    const barbEndX = px + barbLen * 0.5 * Math.cos(barbAngle);
    const barbEndY = py + barbLen * 0.5 * Math.sin(barbAngle);
    
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(barbEndX, barbEndY);
    ctx.stroke();
  }
}

  var soundingGraph = {
    graphCanvas : null,
    ctx : null,
    saveButtonBounds : null,
    _lastGraphX : null,
    _windDisplaySmooth : null,
    _capeDisplaySmooth : null,
    _panelWidth : 360,
    _railContentRight : 0,
    FOOTER_READOUT_MIN : 150,
    FOOTER_READOUT_MAX : 210,
    FOOTER_PARCEL_MIN : 200,
    FOOTER_PANEL_EDGE : 0,
    FOOTER_CONTROLS_W : 200,
    _dashboardReady : false,
    _hoverReadout : null,
    resizeCanvas : function() {
      const h = window.innerHeight;
      this.graphCanvas.height = h;
      this.graphCanvas.style.height = h + 'px';
      const w = this._railContentRight > 0
        ? Math.ceil(this._railContentRight + 6)
        : Math.min(window.innerWidth, Math.round(h * 1.05) + 420);
      this.graphCanvas.width = w;
      this.graphCanvas.style.width = w + 'px';
    },
    init : function() {
      this.graphCanvas = document.getElementById('graphCanvas');
      this.resizeCanvas();
      this.ctx = this.graphCanvas.getContext('2d', { alpha: true });
      var style = this.graphCanvas.style;
      if (guiControls.showGraph) {
        style.display = 'block';
        const dash = document.getElementById('soundingDashboard');
        if (dash) {
          dash.classList.add('visible');
          dash.setAttribute('aria-hidden', 'false');
        }
        const metricsPanel = document.getElementById('soundingMetricsPanel');
        if (metricsPanel) metricsPanel.style.display = 'flex';
      } else {
        style.display = 'none';
        const dash = document.getElementById('soundingDashboard');
        if (dash) {
          dash.classList.remove('visible');
          dash.setAttribute('aria-hidden', 'true');
        }
        const metricsPanel = document.getElementById('soundingMetricsPanel');
        if (metricsPanel) metricsPanel.style.display = 'none';
      }
      
      // Add click handler for the Freeze/Save Sounding button
      if (!this.buttonClickHandler) {
        this.buttonClickHandler = (e) => {
          if (!this.saveButtonBounds) {
            console.log('Button bounds not set');
            return;
          }
          const rect = this.graphCanvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          console.log('Click at:', x, y, 'Button bounds:', this.saveButtonBounds, this.unlockButtonBounds);
          
          // Check if save button was clicked
          if (x >= this.saveButtonBounds.x && x <= this.saveButtonBounds.x + this.saveButtonBounds.width &&
              y >= this.saveButtonBounds.y && y <= this.saveButtonBounds.y + this.saveButtonBounds.height) {
            console.log('Save button clicked! Current fixedPosition:', guiControls.graphFixedPosition);
            if (guiControls.graphFixedPosition) {
              // Save sounding (stay frozen)
              this.saveCurrentSounding();
              console.log('Sounding saved, staying frozen');
            } else {
              // Freeze position
              guiControls.graphFixedPosition = true;
              guiControls.graphFixedX = Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
              guiControls.graphFixedY = Math.floor(mouseYinSim * sim_res_y);
              console.log('Frozen to position:', guiControls.graphFixedX, guiControls.graphFixedY);
            }
          }
          
          // Check if unlock button was clicked (only exists when frozen)
          if (this.unlockButtonBounds && 
              x >= this.unlockButtonBounds.x && x <= this.unlockButtonBounds.x + this.unlockButtonBounds.width &&
              y >= this.unlockButtonBounds.y && y <= this.unlockButtonBounds.y + this.unlockButtonBounds.height) {
            console.log('Unlock button clicked - unfreezing without saving');
            guiControls.graphFixedPosition = false;
            console.log('Unlocked - now following cursor');
          }
        };
        this.graphCanvas.addEventListener('click', this.buttonClickHandler);
      }
      this.initSoundingDashboard();
    },
    initSoundingDashboard : function() {
      if (this._dashboardReady) return;
      const dash = document.getElementById('soundingDashboard');
      if (!dash) return;
      this._dashboardReady = true;
      const bindToggle = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = guiControls[key];
        el.addEventListener('change', () => {
          guiControls[key] = el.checked;
        });
      };
      bindToggle('togWindBarbs', 'soundingShowWindBarbs');
      bindToggle('togParcels', 'soundingShowParcels');
      bindToggle('togMixing', 'soundingShowMixingRatio');
      bindToggle('togHeights', 'soundingShowHeights');
      bindToggle('togThetaE', 'soundingShowThetaE');
      const saveBtn = document.getElementById('soundingSaveBtn');
      const freezeBtn = document.getElementById('soundingFreezeBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          if (!guiControls.graphFixedPosition) {
            guiControls.graphFixedPosition = true;
            guiControls.graphFixedX = Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
            guiControls.graphFixedY = Math.floor(mouseYinSim * sim_res_y);
          }
          this.saveCurrentSounding();
        });
      }
      if (freezeBtn) freezeBtn.addEventListener('click', () => toggleSoundingFreeze());
      bindToggle('togLayoutEdit', 'soundingLayoutEdit');
      const layoutResetBtn = document.getElementById('soundingLayoutResetBtn');
      if (layoutResetBtn) {
        layoutResetBtn.addEventListener('click', () => this.resetCustomLayout());
      }
      const layoutEditEl = document.getElementById('togLayoutEdit');
      if (layoutEditEl) {
        layoutEditEl.addEventListener('change', () => this.setLayoutEditMode(guiControls.soundingLayoutEdit));
      }
      const shareBtn = document.getElementById('soundingShareImageBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', () => {
          if (!this.downloadSoundingPng()) {
            alert('Could not download sounding image. Open the Skew-T graph (G) and try again.');
          }
        });
      }
      this.initLayoutEditor();
      this.setLayoutEditMode(guiControls.soundingLayoutEdit);
      this.initAnalogsPanel();
    },
    _escapeHtml : function(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    SOUNDING_LAYOUT_STORAGE_KEY : 'soundingLayoutCustom_v1',
    _customLayout : null,
    _layoutDrag : null,
    _layoutEditorReady : false,
    loadCustomLayout : function() {
      try {
        const raw = localStorage.getItem(this.SOUNDING_LAYOUT_STORAGE_KEY);
        this._customLayout = raw ? JSON.parse(raw) : {};
      } catch (e) {
        this._customLayout = {};
      }
    },
    saveCustomLayout : function() {
      if (!this._customLayout) return;
      try {
        localStorage.setItem(this.SOUNDING_LAYOUT_STORAGE_KEY, JSON.stringify(this._customLayout));
      } catch (e) { /* ignore quota */ }
    },
    resetCustomLayout : function() {
      this._customLayout = {};
      try {
        localStorage.removeItem(this.SOUNDING_LAYOUT_STORAGE_KEY);
      } catch (e) { /* ignore */ }
      if (guiControls.showGraph) {
        const gx = guiControls.graphFixedPosition
          ? guiControls.graphFixedX
          : Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
        soundingGraph.draw(gx, mouseYinSim);
      }
    },
    _clampLayoutRect : function(r, minW, minH, maxW, maxH) {
      return {
        left: Math.max(0, r.left),
        top: Math.max(0, r.top),
        width: Math.max(minW, Math.min(maxW, r.width)),
        height: Math.max(minH, Math.min(maxH, r.height)),
      };
    },
    applyCustomSoundingLayout : function(ls) {
      const c = this._customLayout;
      if (!c) return ls;
      const out = Object.assign({}, ls);
      if (c.skewT) {
        const r = c.skewT;
        out.skewTLeft = r.left;
        out.skewTWidth = r.width;
        out.skewTRight = r.left + r.width;
        out.skewTPlotRight = out.skewTRight - ls.SKEW_META_W;
        out.plotTop = r.top;
        out.plotBottom = r.top + r.height;
        out.plotHeight = r.height;
        out.graphBottem = out.plotBottom;
      }
      if (c.hodo) {
        const r = c.hodo;
        out.infoBoxX = r.left;
        out.infoBoxWidth = r.width;
        const hodoPlotH = Math.max(40, r.height - ls.HODO_LEGEND_H - ls.HODO_STATS_H);
        out.hodographRadius = Math.max(24, Math.min(120, Math.round(hodoPlotH * 0.5 - ls.hodoPanelPad)));
        out.hodoPanelSize = (out.hodographRadius + ls.hodoPanelPad) * 2;
        out.hodographCx = r.left + r.width * 0.5;
        out.hodographCy = r.top + out.hodographRadius + ls.hodoPanelPad;
        out.hodoBlockBottom = r.top + r.height;
        out.readoutBoxY = out.hodoBlockBottom + ls.hodoReadoutGap;
      } else if (c.skewT && !c.metrics) {
        out.infoBoxX = out.skewTRight + ls.hodoReadoutGap;
      }
      if (c.metrics) {
        const r = c.metrics;
        out.infoBoxX = r.left;
        out.readoutBoxY = r.top;
        out.infoBoxWidth = r.width;
        out.metricsHeight = r.height;
      }
      if (c.windCol) {
        const r = c.windCol;
        out.windColLeft = r.left;
        out.WIND_COL_W = r.width;
        out.windBarbX = r.left + Math.min(34, Math.max(14, r.width * 0.35));
        out.railContentRight = r.left + r.width + ls.RAIL_RIGHT_PAD;
      } else {
        out.windColLeft = out.infoBoxX + out.infoBoxWidth + ls.RAIL_INNER_GAP + ls.WIND_COL_EXTRA_SHIFT;
        out.railContentRight = out.windColLeft + out.WIND_COL_W + ls.RAIL_RIGHT_PAD;
      }
      return out;
    },
    buildDashboardLayout : function(ls, canvasH) {
      const c = this._customLayout || {};
      const panelTop = 8;
      const panelH = ls.SOUNDING_FOOTER_H - 16;
      const footerGap = 8;
      const readoutNatural = Math.round(ls.skewTRight - ls.skewTLeft);
      const readoutW = Math.min(
        this.FOOTER_READOUT_MAX,
        Math.max(this.FOOTER_READOUT_MIN, readoutNatural));
      const controlsW = this.FOOTER_CONTROLS_W;
      const controlsLeft = Math.round(ls.windColLeft - controlsW - footerGap);
      const readoutLeft = this.FOOTER_PANEL_EDGE;
      const parcelLeft = readoutLeft + readoutW + footerGap;
      const parcelW = Math.max(this.FOOTER_PARCEL_MIN, controlsLeft - footerGap - parcelLeft);
      const defaults = {
        footerReadout: {left: readoutLeft, top: panelTop, width: readoutW, height: panelH},
        footerParcel: {left: parcelLeft, top: panelTop, width: parcelW, height: panelH},
        footerControls: {left: controlsLeft, top: panelTop, width: controlsW, height: panelH},
        metrics: {
          left: ls.infoBoxX,
          top: ls.readoutBoxY,
          width: ls.infoBoxWidth,
          height: Math.max(72, ls.plotBottom - ls.readoutBoxY - 4),
        },
      };
      const panels = {};
      for (const key of ['footerReadout', 'footerParcel', 'footerControls', 'metrics']) {
        panels[key] = c[key] ? Object.assign({}, defaults[key], c[key]) : defaults[key];
      }
      return {
        railW: ls.railContentRight,
        footerH: ls.SOUNDING_FOOTER_H,
        footerGap,
        panels,
        readoutLeft: panels.footerReadout.left,
        readoutW: panels.footerReadout.width,
        parcelLeft: panels.footerParcel.left,
        parcelW: panels.footerParcel.width,
        controlsLeft: panels.footerControls.left,
        controlsW: panels.footerControls.width,
        metricsLeft: panels.metrics.left,
        metricsTop: panels.metrics.top,
        metricsWidth: panels.metrics.width,
        metricsHeight: panels.metrics.height,
      };
    },
    _applyPanelRect : function(el, rect) {
      if (!el || !rect) return;
      el.style.left = Math.round(rect.left) + 'px';
      el.style.top = Math.round(rect.top) + 'px';
      el.style.width = Math.round(rect.width) + 'px';
      el.style.height = Math.round(rect.height) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    },
    setLayoutEditMode : function(active) {
      const dash = document.getElementById('soundingDashboard');
      if (dash) dash.classList.toggle('layout-edit-active', !!active);
      const layer = document.getElementById('soundingLayoutLayer');
      if (layer) layer.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active && this._lastLayoutState) {
        this._ensureCustomLayoutSeeded(this._lastLayoutState);
      }
    },
    _ensureCustomLayoutSeeded : function(ls) {
      if (!ls) return;
      if (!this._customLayout) this._customLayout = {};
      const seed = (key, rect) => {
        if (!this._customLayout[key]) {
          this._customLayout[key] = {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }
      };
      seed('skewT', {
        left: ls.skewTLeft,
        top: ls.plotTop,
        width: ls.skewTRight - ls.skewTLeft,
        height: ls.plotBottom - ls.plotTop,
      });
      seed('hodo', {
        left: ls.infoBoxX,
        top: ls.plotTop,
        width: ls.infoBoxWidth,
        height: ls.hodoBlockBottom - ls.plotTop,
      });
      seed('windCol', {
        left: ls.windColLeft,
        top: ls.plotTop,
        width: ls.WIND_COL_W + 36,
        height: ls.plotBottom - ls.plotTop,
      });
    },
    _scheduleLayoutRedraw : function() {
      if (this._layoutRedrawPending) return;
      this._layoutRedrawPending = true;
      requestAnimationFrame(() => {
        this._layoutRedrawPending = false;
        if (!guiControls.showGraph) return;
        const gx = guiControls.graphFixedPosition
          ? guiControls.graphFixedX
          : Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
        this.draw(gx, mouseYinSim);
      });
    },
    _layoutCanvasSize : function() {
      const gc = this.graphCanvas;
      if (!gc) return {w: 0, h: 0};
      return {w: gc.width, h: gc.height};
    },
    syncLayoutRegionOverlays : function(ls) {
      const layer = document.getElementById('soundingLayoutLayer');
      if (!layer) return;
      const c = this._customLayout || {};
      const pick = (key, fallback) => (c[key] ? c[key] : fallback);
      const regions = {
        skewT: {
          label: 'Skew-T',
          left: pick('skewT', {left: ls.skewTLeft}).left,
          top: pick('skewT', {top: ls.plotTop}).top,
          width: pick('skewT', {width: ls.skewTRight - ls.skewTLeft}).width,
          height: pick('skewT', {height: ls.plotBottom - ls.plotTop}).height,
        },
        hodo: {
          label: 'Hodograph',
          left: pick('hodo', {left: ls.infoBoxX}).left,
          top: pick('hodo', {top: ls.plotTop}).top,
          width: pick('hodo', {width: ls.infoBoxWidth}).width,
          height: pick('hodo', {height: ls.hodoBlockBottom - ls.plotTop}).height,
        },
        windCol: {
          label: 'Wind profile',
          left: pick('windCol', {left: ls.windColLeft}).left,
          top: pick('windCol', {top: ls.plotTop}).top,
          width: pick('windCol', {width: ls.WIND_COL_W + 36}).width,
          height: pick('windCol', {height: ls.plotBottom - ls.plotTop}).height,
        },
      };
      for (const [id, spec] of Object.entries(regions)) {
        let el = layer.querySelector('[data-region="' + id + '"]');
        if (!el) continue;
        el.style.left = Math.round(spec.left) + 'px';
        el.style.top = Math.round(spec.top) + 'px';
        el.style.width = Math.round(Math.max(40, spec.width)) + 'px';
        el.style.height = Math.round(Math.max(40, spec.height)) + 'px';
        el.setAttribute('data-label', spec.label);
      }
    },
    _layoutCommitRect : function(regionKey, rect) {
      if (!this._customLayout) this._customLayout = {};
      const {w, h} = this._layoutCanvasSize();
      this._customLayout[regionKey] = this._clampLayoutRect(rect, 48, 40, w, h);
      this.saveCustomLayout();
    },
    _layoutOnPointerMove : function(e) {
      const drag = this._layoutDrag;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const rect = {
        left: drag.origLeft + dx,
        top: drag.origTop + dy,
        width: drag.origW + (drag.mode === 'resize' ? dx : 0),
        height: drag.origH + (drag.mode === 'resize' ? dy : 0),
      };
      if (drag.kind === 'panel') {
        const el = document.getElementById(drag.panelId);
        if (el) this._applyPanelRect(el, rect);
        if (!this._customLayout) this._customLayout = {};
        this._customLayout[drag.regionKey] = rect;
      } else if (drag.kind === 'region') {
        const el = drag.regionEl;
        if (el) {
          el.style.left = Math.round(rect.left) + 'px';
          el.style.top = Math.round(rect.top) + 'px';
          el.style.width = Math.round(Math.max(40, rect.width)) + 'px';
          el.style.height = Math.round(Math.max(40, rect.height)) + 'px';
        }
        if (!this._customLayout) this._customLayout = {};
        this._customLayout[drag.regionKey] = rect;
      }
      this._scheduleLayoutRedraw();
    },
    _layoutOnPointerUp : function() {
      if (this._layoutDrag) {
        const drag = this._layoutDrag;
        if (drag.kind === 'panel' && this._customLayout && this._customLayout[drag.regionKey]) {
          const {w, h} = this._layoutCanvasSize();
          this._customLayout[drag.regionKey] = this._clampLayoutRect(
            this._customLayout[drag.regionKey], 80, 48, w, h);
        }
        if (drag.kind === 'region' && this._customLayout && this._customLayout[drag.regionKey]) {
          const {w, h} = this._layoutCanvasSize();
          const minW = drag.regionKey === 'windCol' ? 48 : (drag.regionKey === 'skewT' ? 160 : 100);
          const minH = drag.regionKey === 'skewT' ? 180 : 60;
          this._customLayout[drag.regionKey] = this._clampLayoutRect(
            this._customLayout[drag.regionKey], minW, minH, w, h);
        }
        this.saveCustomLayout();
        this._scheduleLayoutRedraw();
      }
      this._layoutDrag = null;
      document.removeEventListener('mousemove', this._layoutMoveHandler);
      document.removeEventListener('mouseup', this._layoutUpHandler);
    },
    _layoutStartDrag : function(kind, regionKey, mode, targetEl, panelId, e) {
      if (!guiControls.soundingLayoutEdit) return;
      e.preventDefault();
      e.stopPropagation();
      const r = targetEl.getBoundingClientRect();
      const panelEl = panelId ? document.getElementById(panelId) : null;
      const dash = document.getElementById('soundingDashboard');
      const parent = (kind === 'region')
        ? dash
        : ((panelEl && panelEl.closest('.sounding-footer')) || dash);
      const parentRect = parent ? parent.getBoundingClientRect() : {left: 0, top: 0};
      this._layoutDrag = {
        kind,
        regionKey,
        mode,
        panelId,
        regionEl: targetEl,
        parentEl: parent,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: r.left - parentRect.left,
        origTop: r.top - parentRect.top,
        origW: r.width,
        origH: r.height,
      };
      if (!this._layoutMoveHandler) {
        this._layoutMoveHandler = (ev) => this._layoutOnPointerMove(ev);
        this._layoutUpHandler = () => this._layoutOnPointerUp();
      }
      document.addEventListener('mousemove', this._layoutMoveHandler);
      document.addEventListener('mouseup', this._layoutUpHandler);
    },
    _bindLayoutPanel : function(panelId, regionKey) {
      const el = document.getElementById(panelId);
      if (!el) return;
      if (!el.querySelector('.sounding-layout-resize-handle')) {
        const grip = document.createElement('div');
        grip.className = 'sounding-layout-resize-handle';
        grip.title = 'Resize';
        el.appendChild(grip);
        grip.addEventListener('mousedown', (e) => {
          this._layoutStartDrag('panel', regionKey, 'resize', el, panelId, e);
        });
      }
      const handle = el.querySelector('.sounding-layout-drag-handle') || el.querySelector('h4');
      if (handle && !handle._layoutBound) {
        handle._layoutBound = true;
        handle.addEventListener('mousedown', (e) => {
          if (e.target.closest('.sounding-layout-resize-handle')) return;
          this._layoutStartDrag('panel', regionKey, 'move', el, panelId, e);
        });
      }
    },
    initLayoutEditor : function() {
      if (this._layoutEditorReady) return;
      this.loadCustomLayout();
      const layer = document.getElementById('soundingLayoutLayer');
      if (layer && !layer.childElementCount) {
        for (const [id, label] of [['skewT', 'Skew-T'], ['hodo', 'Hodograph'], ['windCol', 'Wind profile']]) {
          const div = document.createElement('div');
          div.className = 'sounding-layout-region';
          div.dataset.region = id;
          div.dataset.label = label;
          const grip = document.createElement('div');
          grip.className = 'sounding-layout-resize-handle';
          div.appendChild(grip);
          div.addEventListener('mousedown', (e) => {
            if (!e.target.classList.contains('sounding-layout-resize-handle')) {
              this._layoutStartDrag('region', id, 'move', div, null, e);
            }
          });
          grip.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this._layoutStartDrag('region', id, 'resize', div, null, e);
          });
          layer.appendChild(div);
        }
      }
      this._bindLayoutPanel('soundingReadoutPanel', 'footerReadout');
      this._bindLayoutPanel('soundingParcelPanel', 'footerParcel');
      this._bindLayoutPanel('soundingControlsPanel', 'footerControls');
      this._bindLayoutPanel('soundingMetricsPanel', 'metrics');
      this._layoutEditorReady = true;
    },
    _exportCanvasScale : function() {
      const gc = this.graphCanvas;
      const r = gc.getBoundingClientRect();
      return {
        gcRect: r,
        scaleX: r.width > 0 ? gc.width / r.width : 1,
        scaleY: r.height > 0 ? gc.height / r.height : 1,
      };
    },
    _exportMapRect : function(domRect, gcRect, scaleX, scaleY) {
      return {
        x: (domRect.left - gcRect.left) * scaleX,
        y: (domRect.top - gcRect.top) * scaleY,
        w: domRect.width * scaleX,
        h: domRect.height * scaleY,
      };
    },
    _exportFillRoundRect : function(ctx, x, y, w, h, rad) {
      const r = Math.min(rad, w * 0.5, h * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },
    _exportDrawPanelChrome : function(ctx, box, scaleY) {
      this._exportFillRoundRect(ctx, box.x, box.y, box.w, box.h, 4 * scaleY);
      ctx.fillStyle = 'rgba(12, 14, 18, 0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();
    },
    _exportDrawReadoutCols : function(ctx, panelEl, box, scaleX, scaleY) {
      const padX = 8 * scaleX;
      const padTop = 22 * scaleY;
      const cols = panelEl.querySelectorAll('.sounding-readout-col');
      if (!cols.length) return;
      const colGap = 10 * scaleX;
      const colW = (box.w - padX * 2 - colGap * (cols.length - 1)) / cols.length;
      let cx = box.x + padX;
      const rowH = 11 * scaleY;
      const lblFont = `9px Segoe UI, Arial`;
      const valFont = `9px Consolas, monospace`;
      cols.forEach(col => {
        const lbls = col.querySelectorAll('.lbl');
        const vals = col.querySelectorAll('.val');
        let ry = box.y + padTop;
        for (let i = 0; i < lbls.length; i++) {
          const lbl = lbls[i];
          const val = vals[i];
          if (!lbl || !val) continue;
          ctx.font = lblFont;
          ctx.fillStyle = '#7a8fa0';
          const lblText = lbl.textContent;
          ctx.fillText(lblText, cx, ry);
          const lblW = ctx.measureText(lblText).width;
          ctx.font = valFont;
          if (val.classList.contains('temp')) ctx.fillStyle = '#ff5555';
          else if (val.classList.contains('dew')) ctx.fillStyle = '#66ccff';
          else ctx.fillStyle = '#e8eef2';
          ctx.fillText(val.textContent, cx + lblW + 5 * scaleX, ry);
          ry += rowH;
        }
        cx += colW + colGap;
      });
    },
    _exportDrawControls : function(ctx, panelEl, box, scaleX, scaleY) {
      const padX = 8 * scaleX;
      let y = box.y + 22 * scaleY;
      const rowH = 12 * scaleY;
      panelEl.querySelectorAll('.sounding-toggle-row').forEach(row => {
        const span = row.querySelector('span');
        const input = row.querySelector('input');
        const label = span ? span.textContent : '';
        ctx.font = '8px Segoe UI, Arial';
        ctx.fillStyle = '#c8d4e0';
        ctx.fillText(label, box.x + padX, y);
        const cbX = box.x + box.w - padX - 11 * scaleX;
        const cbY = y - 8 * scaleY;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.strokeRect(cbX, cbY, 10 * scaleX, 10 * scaleY);
        if (input && input.checked) {
          ctx.fillStyle = '#4a90e2';
          ctx.fillRect(cbX + 2 * scaleX, cbY + 2 * scaleY, 6 * scaleX, 6 * scaleY);
        }
        y += rowH;
      });
      const resetBtn = panelEl.querySelector('.sounding-layout-reset-btn');
      if (resetBtn) {
        const bx = box.x + padX;
        const by = box.y + box.h - 14 * scaleY;
        const bw = box.w - padX * 2;
        const bh = 12 * scaleY;
        this._exportFillRoundRect(ctx, bx, by, bw, bh, 3 * scaleY);
        ctx.fillStyle = 'rgba(40, 48, 58, 0.95)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.stroke();
        ctx.fillStyle = '#c8d4e0';
        ctx.font = '8px Segoe UI, Arial';
        ctx.fillText(resetBtn.textContent, bx + 6 * scaleX, by + 9 * scaleY);
      }
    },
    _exportDrawFooterPanel : function(ctx, panelEl, gcRect, scaleX, scaleY) {
      if (!panelEl || panelEl.offsetParent === null) return;
      const dom = panelEl.getBoundingClientRect();
      if (dom.width < 4 || dom.height < 4) return;
      const box = this._exportMapRect(dom, gcRect, scaleX, scaleY);
      ctx.save();
      this._exportDrawPanelChrome(ctx, box, scaleY);
      const h4 = panelEl.querySelector('h4');
      if (h4) {
        ctx.fillStyle = '#8fa8bc';
        ctx.font = `bold ${Math.round(9 * scaleY)}px Segoe UI, Arial`;
        ctx.fillText(h4.textContent.trim(), box.x + 8 * scaleX, box.y + 14 * scaleY);
      }
      if (panelEl.id === 'soundingControlsPanel') {
        this._exportDrawControls(ctx, panelEl, box, scaleX, scaleY);
      } else {
        this._exportDrawReadoutCols(ctx, panelEl, box, scaleX, scaleY);
      }
      ctx.restore();
    },
    _exportDrawFooterBar : function(ctx, gcRect, scaleX, scaleY) {
      const footer = document.querySelector('.sounding-footer');
      if (!footer) return;
      const dom = footer.getBoundingClientRect();
      const box = this._exportMapRect(dom, gcRect, scaleX, scaleY);
      ctx.save();
      ctx.fillStyle = 'rgba(8, 10, 14, 0.96)';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(box.x, box.y);
      ctx.lineTo(box.x + box.w, box.y);
      ctx.stroke();
      ctx.restore();
    },
    _exportDrawMetricsSectionTitle : function(ctx, box, scaleX, scaleY, y, title) {
      y += 4 * scaleY;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this._exportFillRoundRect(ctx, box.x + 6 * scaleX, y - 8 * scaleY, box.w - 12 * scaleX, 12 * scaleY, 2);
      ctx.fill();
      ctx.fillStyle = '#7a8fa0';
      ctx.font = `bold ${Math.round(9 * scaleY)}px Segoe UI, Arial`;
      ctx.fillText(title, box.x + 10 * scaleX, y);
      return y + 12 * scaleY;
    },
    _exportParseCssColor : function(el, fallback) {
      if (!el) return fallback || '#88aacc';
      const bg = el.style.background || el.style.backgroundColor;
      if (bg) return bg;
      return fallback || '#88aacc';
    },
    _exportDrawMetricsBar : function(ctx, el, box, scaleX, scaleY, y) {
      const nameEl = el.querySelector('.name');
      const pctEl = el.querySelector('.pct');
      const fillEl = el.querySelector('.fill');
      if (!nameEl || !pctEl) return y;
      const barH = 11 * scaleY;
      const trackH = 4 * scaleY;
      ctx.fillStyle = nameEl.style.color || '#7a8fa0';
      ctx.font = `${Math.round(9 * scaleY)}px Segoe UI, Arial`;
      ctx.fillText(nameEl.textContent, box.x + 8 * scaleX, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = pctEl.style.color || nameEl.style.color || '#7a8fa0';
      ctx.fillText(pctEl.textContent, box.x + box.w - 8 * scaleX, y);
      ctx.textAlign = 'left';
      y += 4 * scaleY;
      const trackX = box.x + 8 * scaleX;
      const trackW = box.w - 16 * scaleX;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(trackX, y, trackW, trackH);
      const pct = parseInt(pctEl.textContent, 10) || 0;
      ctx.fillStyle = this._exportParseCssColor(fillEl, '#88aacc');
      ctx.fillRect(trackX, y, trackW * Math.max(0, Math.min(1, pct / 100)), trackH);
      return y + barH;
    },
    _exportDrawAnalogMatchData : function(ctx, analog, score, box, scaleX, scaleY, y) {
      const pct = Math.max(0, Math.min(100, score || 0));
      const severity = this.computeAnalogSeverityScore(analog);
      const nameColor = this.severityScoreToColor(severity);
      const subColor = this._lerpColor(nameColor, '#7a8fa0', 0.35);
      const barH = 11 * scaleY;
      const trackH = 4 * scaleY;
      ctx.font = `600 ${Math.round(9 * scaleY)}px Segoe UI, Arial`;
      const name = analog.name || 'Analog';
      if (this._textColorNeedsGlow(nameColor)) {
        ctx.shadowColor = 'rgba(255,255,255,0.85)';
        ctx.shadowBlur = 4 * scaleY;
      }
      ctx.fillStyle = nameColor;
      ctx.fillText(name, box.x + 8 * scaleX, y);
      ctx.textAlign = 'right';
      ctx.fillText(pct + '%', box.x + box.w - 8 * scaleX, y);
      ctx.textAlign = 'left';
      ctx.shadowBlur = 0;
      y += 4 * scaleY;
      const trackX = box.x + 8 * scaleX;
      const trackW = box.w - 16 * scaleX;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(trackX, y, trackW, trackH);
      ctx.fillStyle = nameColor;
      ctx.fillRect(trackX, y, trackW * (pct / 100), trackH);
      y += barH - 2 * scaleY;
      const sub = this._analogMatchSubline(analog);
      if (sub) {
        ctx.fillStyle = subColor;
        ctx.font = `${Math.round(8 * scaleY)}px Segoe UI, Arial`;
        ctx.fillText(sub, box.x + 10 * scaleX, y);
        y += 10 * scaleY;
      }
      return y;
    },
    _exportDrawAnalogMatchDataCompact : function(ctx, analog, score, box, scaleX, scaleY, y, maxY) {
      if (y > maxY) return y;
      return this._exportDrawAnalogMatchData(ctx, analog, score, box, scaleX, scaleY, y);
    },
    _getSimilarAnalogsForExport : function(limit) {
      const cap = limit || 4;
      if (Array.isArray(this._lastSimilarAnalogsRendered) && this._lastSimilarAnalogsRendered.length) {
        return this._lastSimilarAnalogsRendered.slice(0, cap);
      }
      return this.getSimilarAnalogs(this._lastAnalogSnapshot, cap);
    },
    _exportEstimateMetricsPanelHeight : function(scaleY) {
      const rows = this._metricsPanelRowsBase || [];
      let lines = 2;
      for (const row of rows) {
        if (row.section) lines += 1.4;
        else if (row.miniBar) lines += 1.1;
        else lines += 1;
      }
      const snap = this._lastAnalogSnapshot;
      if (snap && Array.isArray(snap.hazards)) {
        lines += Math.min(6, snap.hazards.filter(h => (h.pct || 0) >= 10).length) * 1.1;
      }
      const similarN = this._getSimilarAnalogsForExport(4).length;
      const overlayN = (this._overlayAnalogIds || []).length;
      lines += similarN > 0 ? 1.4 + similarN * 2.2 : 0;
      lines += overlayN > 0 ? 1.4 + overlayN * 1.8 : 0;
      return lines * 11 * scaleY + 28 * scaleY;
    },
    _exportExpandMetricsPanelBox : function(box, gcRect, scaleX, scaleY) {
      const gc = this.graphCanvas;
      const neededH = this._exportEstimateMetricsPanelHeight(scaleY);
      let maxBottom = gc ? gc.height - 8 : box.y + neededH;
      const footer = document.querySelector('.sounding-footer');
      if (footer && gcRect) {
        const fbox = this._exportMapRect(footer.getBoundingClientRect(), gcRect, scaleX, scaleY);
        if (fbox.y > box.y + 40 * scaleY) maxBottom = fbox.y - 4 * scaleY;
      }
      box.h = Math.min(Math.max(box.h, neededH), maxBottom - box.y);
      return box;
    },
    _exportDrawMiniBarFromData : function(ctx, row, box, scaleX, scaleY, y) {
      const pct = Math.max(0, Math.min(100, row.pct || 0));
      const name = row.shortLabel || row.label || '';
      const barH = 11 * scaleY;
      const trackH = 4 * scaleY;
      ctx.fillStyle = '#7a8fa0';
      ctx.font = `${Math.round(9 * scaleY)}px Segoe UI, Arial`;
      ctx.fillText(name, box.x + 8 * scaleX, y);
      ctx.textAlign = 'right';
      ctx.fillText(pct + '%', box.x + box.w - 8 * scaleX, y);
      ctx.textAlign = 'left';
      y += 4 * scaleY;
      const trackX = box.x + 8 * scaleX;
      const trackW = box.w - 16 * scaleX;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(trackX, y, trackW, trackH);
      ctx.fillStyle = row.color || '#88aacc';
      ctx.fillRect(trackX, y, trackW * (pct / 100), trackH);
      return y + barH;
    },
    _exportDrawMetricsRowsFromData : function(ctx, rows, box, scaleX, scaleY, y, maxY) {
      if (!rows || !rows.length) return y;
      for (const row of rows) {
        if (y > maxY) break;
        if (row.section) {
          y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, row.section);
        } else if (row.miniBar) {
          y = this._exportDrawMiniBarFromData(ctx, row, box, scaleX, scaleY, y);
        } else if (row.label) {
          ctx.fillStyle = '#7a8fa0';
          ctx.font = `${Math.round(10 * scaleY)}px Consolas, monospace`;
          ctx.fillText(row.label, box.x + 8 * scaleX, y);
          ctx.fillStyle = row.color || '#e8eef2';
          ctx.textAlign = 'right';
          ctx.fillText(row.value != null ? String(row.value) : '—', box.x + box.w - 8 * scaleX, y);
          ctx.textAlign = 'left';
          y += 11 * scaleY;
        }
      }
      return y;
    },
    _exportDrawHazardBarsFromSnapshot : function(ctx, snap, box, scaleX, scaleY, y, maxY) {
      const hazards = (snap && snap.hazards) || [];
      const list = hazards.filter(h => (h.pct || 0) >= 10).slice(0, 6);
      if (!list.length) return y;
      for (const h of list) {
        if (y > maxY) break;
        const pct = Math.max(0, Math.min(100, h.pct || 0));
        const barH = 11 * scaleY;
        const trackH = 4 * scaleY;
        ctx.fillStyle = '#7a8fa0';
        ctx.font = `${Math.round(9 * scaleY)}px Segoe UI, Arial`;
        ctx.fillText(h.label || 'Hazard', box.x + 8 * scaleX, y);
        ctx.textAlign = 'right';
        ctx.fillText(pct + '%', box.x + box.w - 8 * scaleX, y);
        ctx.textAlign = 'left';
        y += 4 * scaleY;
        const trackX = box.x + 8 * scaleX;
        const trackW = box.w - 16 * scaleX;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(trackX, y, trackW, trackH);
        ctx.fillStyle = h.color || '#88aacc';
        ctx.fillRect(trackX, y, trackW * (pct / 100), trackH);
        y += barH;
      }
      return y;
    },
    _exportDrawSimilarAnalogsFromData : function(ctx, box, scaleX, scaleY, y, maxY) {
      const matches = this._getSimilarAnalogsForExport(4);
      if (!matches.length) {
        const src = this._analogSourceFilter || 'all';
        const srcLabel = src === 'builtin' ? 'real world' : (src === 'custom' ? 'custom' : '');
        y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, 'Similar Analogs');
        ctx.fillStyle = '#7a8fa0';
        ctx.font = `${Math.round(9 * scaleY)}px Segoe UI, Arial`;
        ctx.fillText(
          srcLabel ? ('No similar ' + srcLabel + ' analogs') : 'No similar analogs',
          box.x + 10 * scaleX,
          y
        );
        return y + 10 * scaleY;
      }
      y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, 'Similar Analogs');
      for (const { analog, score } of matches) {
        if (y > maxY) break;
        y = this._exportDrawAnalogMatchDataCompact(ctx, analog, score, box, scaleX, scaleY, y, maxY);
      }
      return y;
    },
    _exportDrawOverlayAnalogsSection : function(ctx, box, scaleX, scaleY, y, maxY, compact) {
      const ids = this._overlayAnalogIds || [];
      if (!ids.length) return y;
      y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, 'Skew-T Overlays');
      const snap = this._lastAnalogSnapshot;
      let colorIdx = 0;
      for (const id of ids) {
        if (y > maxY) break;
        const analog = this.findAnalogById(id);
        if (!analog) continue;
        const lineColor = this._analogOverlayColors[colorIdx % this._analogOverlayColors.length];
        const severity = this.computeAnalogSeverityScore(analog);
        const nameColor = this.severityScoreToColor(severity);
        const subColor = this._lerpColor(nameColor, '#7a8fa0', 0.35);
        colorIdx++;
        const swatchY = y - 7 * scaleY;
        ctx.fillStyle = lineColor;
        ctx.fillRect(box.x + 8 * scaleX, swatchY, 8 * scaleX, 8 * scaleY);
        ctx.fillStyle = nameColor;
        ctx.font = `600 ${Math.round(9 * scaleY)}px Segoe UI, Arial`;
        let line = analog.name || 'Analog';
        const sim = snap ? this.computeAnalogSimilarity(analog, snap) : null;
        if (sim != null) line += ' · ' + sim + '% match';
        ctx.fillText(line, box.x + 20 * scaleX, y);
        y += 10 * scaleY;
        const meta = this._analogMatchSubline(analog);
        if (meta) {
          ctx.fillStyle = subColor;
          ctx.font = `${Math.round(8 * scaleY)}px Segoe UI, Arial`;
          ctx.fillText(meta, box.x + 20 * scaleX, y);
          y += 10 * scaleY;
        }
      }
      return y;
    },
    _exportDrawMetricsPanel : function(ctx, panelEl, gcRect, scaleX, scaleY) {
      if (!panelEl || panelEl.style.display === 'none') return;
      const dom = panelEl.getBoundingClientRect();
      if (dom.width < 4 || dom.height < 4) return;
      const box = this._exportExpandMetricsPanelBox(
        this._exportMapRect(dom, gcRect, scaleX, scaleY),
        gcRect,
        scaleX,
        scaleY
      );
      const maxY = box.y + box.h - 4 * scaleY;
      ctx.save();
      this._exportDrawPanelChrome(ctx, box, scaleY);
      let y = box.y + 12 * scaleY;
      const timeLine = this._metricsTimeLine ||
        (panelEl.querySelector('.sounding-metrics-time') || {}).textContent || '';
      if (timeLine) {
        ctx.fillStyle = '#8899aa';
        ctx.font = `${Math.round(10 * scaleY)}px Consolas, monospace`;
        ctx.fillText(timeLine, box.x + 8 * scaleX, y);
        y += 14 * scaleY;
      }
      const rows = this._metricsPanelRowsBase;
      if (rows && rows.length) {
        y = this._exportDrawMetricsRowsFromData(ctx, rows, box, scaleX, scaleY, y, maxY);
      } else {
        const body = panelEl.querySelector('#soundingMetricsBody');
        if (body) {
          for (const el of body.children) {
            if (y > maxY) break;
            if (el.classList.contains('sounding-metrics-section')) {
              y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, el.textContent.trim());
            } else if (el.classList.contains('sounding-metrics-row')) {
              const lbl = el.querySelector('.lbl');
              const val = el.querySelector('.val');
              if (!lbl || !val) continue;
              ctx.fillStyle = '#7a8fa0';
              ctx.font = `${Math.round(10 * scaleY)}px Consolas, monospace`;
              ctx.fillText(lbl.textContent, box.x + 8 * scaleX, y);
              ctx.fillStyle = val.style.color || '#e8eef2';
              ctx.textAlign = 'right';
              ctx.fillText(val.textContent, box.x + box.w - 8 * scaleX, y);
              ctx.textAlign = 'left';
              y += 11 * scaleY;
            } else if (el.classList.contains('sounding-metrics-bar')) {
              y = this._exportDrawMetricsBar(ctx, el, box, scaleX, scaleY, y);
            }
          }
        }
      }
      const snap = this._lastAnalogSnapshot;
      if (snap && Array.isArray(snap.hazards) && snap.hazards.some(h => (h.pct || 0) >= 10)) {
        y = this._exportDrawMetricsSectionTitle(ctx, box, scaleX, scaleY, y, 'HAZARD PROBABILITIES');
        y = this._exportDrawHazardBarsFromSnapshot(ctx, snap, box, scaleX, scaleY, y, maxY);
      }
      y = this._exportDrawSimilarAnalogsFromData(ctx, box, scaleX, scaleY, y, maxY);
      y = this._exportDrawOverlayAnalogsSection(ctx, box, scaleX, scaleY, y, maxY, true);
      ctx.restore();
    },
    _exportDrawHeader : function(ctx, headerEl, gcRect, scaleX, scaleY) {
      if (!headerEl) return;
      const dom = headerEl.getBoundingClientRect();
      const box = this._exportMapRect(dom, gcRect, scaleX, scaleY);
      ctx.save();
      const grad = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
      grad.addColorStop(0, 'rgba(8, 10, 14, 0.92)');
      grad.addColorStop(1, 'rgba(8, 10, 14, 0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(box.x, box.y + box.h);
      ctx.lineTo(box.x + box.w, box.y + box.h);
      ctx.stroke();
      const station = headerEl.querySelector('.sounding-header-station');
      const valid = headerEl.querySelector('.sounding-header-valid');
      if (station) {
        ctx.fillStyle = '#c8d4e0';
        ctx.font = `600 ${Math.round(13 * scaleY)}px Segoe UI, Arial`;
        ctx.fillText(station.textContent, box.x + 16 * scaleX, box.y + 26 * scaleY);
      }
      if (valid) {
        ctx.fillStyle = '#ffcc44';
        ctx.font = `${Math.round(12 * scaleY)}px Segoe UI, Arial`;
        const tw = ctx.measureText(valid.textContent).width;
        ctx.fillText(valid.textContent, box.x + (box.w - tw) * 0.5, box.y + 26 * scaleY);
      }
      ctx.restore();
    },
    buildSoundingExportCanvas : function() {
      const gc = this.graphCanvas;
      if (!gc || gc.width < 1 || gc.height < 1) return null;
      const dash = document.getElementById('soundingDashboard');
      const out = document.createElement('canvas');
      out.width = gc.width;
      out.height = gc.height;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(gc, 0, 0);
      if (this._lastSkewTExportHelpers && this._overlayAnalogIds && this._overlayAnalogIds.length) {
        this.drawAnalogOverlays(ctx, this._lastSkewTExportHelpers);
      }
      if (dash && dash.classList.contains('visible') && guiControls.showGraph) {
        try {
          const {gcRect, scaleX, scaleY} = this._exportCanvasScale();
          this._exportDrawHeader(ctx, dash.querySelector('.sounding-header'), gcRect, scaleX, scaleY);
          this._exportDrawMetricsPanel(ctx, document.getElementById('soundingMetricsPanel'), gcRect, scaleX, scaleY);
          this._exportDrawFooterBar(ctx, gcRect, scaleX, scaleY);
          this._exportDrawFooterPanel(ctx, document.getElementById('soundingReadoutPanel'), gcRect, scaleX, scaleY);
          this._exportDrawFooterPanel(ctx, document.getElementById('soundingParcelPanel'), gcRect, scaleX, scaleY);
          this._exportDrawFooterPanel(ctx, document.getElementById('soundingControlsPanel'), gcRect, scaleX, scaleY);
        } catch (err) {
          console.warn('Sounding dashboard export overlay failed; graph canvas still exported.', err);
        }
      }
      return out;
    },
    exportSoundingPng : function() {
      const out = this.buildSoundingExportCanvas();
      return out ? out.toDataURL('image/png') : '';
    },
    downloadSoundingPng : function(filename) {
      let dataUrl = '';
      try {
        dataUrl = this.exportSoundingPng();
      } catch (err) {
        console.error('Sounding PNG export failed:', err);
        return false;
      }
      if (!dataUrl || !dataUrl.startsWith('data:image/png')) return false;
      const link = document.createElement('a');
      link.download = filename || 'sounding-column.png';
      link.href = dataUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    },
    renderMetricsPanel : function(rows, timeLine) {
      const body = document.getElementById('soundingMetricsBody');
      const timeEl = document.getElementById('soundingMetricsTime');
      if (!body) return;
      if (timeEl) {
        timeEl.textContent = timeLine || '';
      }
      let html = '';
      for (const row of rows || []) {
        if (row.analogSourceBar || row.analogMatch) continue;
        if (row.section) {
          html += '<div class="sounding-metrics-section">' + this._escapeHtml(row.section) + '</div>';
        } else if (row.miniBar) {
          const name = row.shortLabel || row.label;
          const pct = Math.max(0, Math.min(100, row.pct || 0));
          const color = row.color || '#88aacc';
          html += '<div class="sounding-metrics-bar"><span class="name">' + this._escapeHtml(name) +
            '</span><span class="pct">' + pct + '%</span><div class="track"><div class="fill" style="width:' +
            pct + '%;background:' + color + '"></div></div></div>';
        } else if (row.label) {
          const cls = row.highlight ? 'sounding-metrics-row highlight' : 'sounding-metrics-row';
          const valColor = row.color || '#e8eef2';
          html += '<div class="' + cls + '"><span class="lbl">' + this._escapeHtml(row.label) +
            '</span><span class="val" style="color:' + valColor + '">' +
            this._escapeHtml(row.value) + '</span></div>';
        }
      }
      body.innerHTML = html;
      this.renderMetricsSimilarSection(this._lastAnalogSnapshot);
    },
    SOUNDING_ANALOGS_STORAGE_KEY : 'soundingAnalogs_v1',
    SOUNDING_ANALOGS_USER_KEY : 'soundingAnalogsUser_v1',
    SOUNDING_ANALOGS_HIDDEN_KEY : 'soundingAnalogsHidden_v1',
    SOUNDING_ANALOGS_TAB_KEY : 'soundingMetricsTab_v1',
    SOUNDING_ANALOGS_SOURCE_KEY : 'soundingAnalogSourceFilter_v1',
    SOUNDING_ANALOGS_SKIP_DELETE_CONFIRM_KEY : 'soundingAnalogSkipDeleteConfirm_v1',
    _userAnalogs : [],
    _hiddenBuiltinIds : [],
    _analogSearch : '',
    _analogFilter : 'all',
    _analogSourceFilter : 'all',
    _skipAnalogDeleteConfirm : false,
    _metricsPanelRowsBase : null,
    _metricsTimeLine : '',
    _metricsSimilarReady : false,
    _similarAnalogsFingerprint : '',
    _lastSimilarAnalogsRendered : null,
    _analogsPanelFingerprint : '',
    _analogsListEventsReady : false,
    _lastSkewTExportHelpers : null,
    _metricsTab : 'metrics',
    _overlayAnalogIds : [],
    _lastAnalogSnapshot : null,
    _analogsUiReady : false,
    _analogOverlayColors : ['#FFD700', '#FF69B4', '#00FA9A', '#DA70D6', '#FFA500', '#7DF9FF'],
    getBuiltinAnalogs : function() {
      const presets = (typeof SOUNDING_ANALOG_PRESETS !== 'undefined' && Array.isArray(SOUNDING_ANALOG_PRESETS))
        ? SOUNDING_ANALOG_PRESETS : [];
      const hidden = new Set(this._hiddenBuiltinIds || []);
      return presets.filter(a => a && a.id && !hidden.has(a.id));
    },
    getUserAnalogs : function() {
      return (this._userAnalogs || []).filter(a => a && a.id);
    },
    getAllAnalogs : function() {
      return this.getBuiltinAnalogs().concat(this.getUserAnalogs());
    },
    findAnalogById : function(id) {
      return this.getAllAnalogs().find(a => a.id === id);
    },
    loadAnalogs : function() {
      try {
        const rawUser = localStorage.getItem(this.SOUNDING_ANALOGS_USER_KEY);
        const rawLegacy = localStorage.getItem(this.SOUNDING_ANALOGS_STORAGE_KEY);
        let user = rawUser ? JSON.parse(rawUser) : null;
        if (!Array.isArray(user) && rawLegacy) {
          const legacy = JSON.parse(rawLegacy);
          user = Array.isArray(legacy) ? legacy.filter(a => a && a.id && !a.builtin) : [];
        }
        this._userAnalogs = Array.isArray(user) ? user.filter(a => a && a.id && !a.builtin) : [];
      } catch (e) {
        this._userAnalogs = [];
      }
      try {
        const rawHidden = localStorage.getItem(this.SOUNDING_ANALOGS_HIDDEN_KEY);
        this._hiddenBuiltinIds = rawHidden ? JSON.parse(rawHidden) : [];
        if (!Array.isArray(this._hiddenBuiltinIds)) this._hiddenBuiltinIds = [];
      } catch (e) {
        this._hiddenBuiltinIds = [];
      }
      try {
        const tab = localStorage.getItem(this.SOUNDING_ANALOGS_TAB_KEY);
        if (tab === 'metrics' || tab === 'analogs') this._metricsTab = tab;
      } catch (e) { /* ignore */ }
      try {
        const src = localStorage.getItem(this.SOUNDING_ANALOGS_SOURCE_KEY);
        if (src === 'all' || src === 'builtin' || src === 'custom') this._analogSourceFilter = src;
      } catch (e) { /* ignore */ }
      try {
        this._skipAnalogDeleteConfirm = localStorage.getItem(this.SOUNDING_ANALOGS_SKIP_DELETE_CONFIRM_KEY) === '1';
      } catch (e) { /* ignore */ }
    },
    saveAnalogs : function() {
      try {
        localStorage.setItem(this.SOUNDING_ANALOGS_USER_KEY, JSON.stringify(this.getUserAnalogs()));
      } catch (e) { /* ignore quota */ }
    },
    saveHiddenBuiltins : function() {
      try {
        localStorage.setItem(this.SOUNDING_ANALOGS_HIDDEN_KEY, JSON.stringify(this._hiddenBuiltinIds || []));
      } catch (e) { /* ignore quota */ }
    },
    _newAnalogId : function() {
      return 'analog_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    },
    setMetricsTab : function(tab) {
      if (tab !== 'metrics' && tab !== 'analogs') return;
      this._metricsTab = tab;
      try {
        localStorage.setItem(this.SOUNDING_ANALOGS_TAB_KEY, tab);
      } catch (e) { /* ignore */ }
      const metricsBody = document.getElementById('soundingMetricsBody');
      const analogsBody = document.getElementById('soundingAnalogsBody');
      const timeEl = document.getElementById('soundingMetricsTime');
      document.querySelectorAll('.sounding-metrics-tab').forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      if (metricsBody) {
        metricsBody.hidden = tab !== 'metrics';
        metricsBody.style.display = tab === 'metrics' ? '' : 'none';
      }
      if (analogsBody) {
        analogsBody.hidden = tab !== 'analogs';
        analogsBody.style.display = tab === 'analogs' ? 'flex' : 'none';
      }
      if (timeEl) timeEl.style.display = tab === 'metrics' ? '' : 'none';
      const similarBlock = document.getElementById('soundingMetricsSimilarBlock');
      if (similarBlock) {
        similarBlock.style.display = tab === 'metrics' ? '' : 'none';
      }
      if (tab === 'analogs') {
        this._syncAnalogSourceFilterUi();
        this._analogsPanelFingerprint = '';
        this.renderAnalogsPanel(true);
      } else if (tab === 'metrics') {
        this._syncAnalogSourceFilterUi();
        this.renderMetricsSimilarSection(this._lastAnalogSnapshot);
      }
    },
    initAnalogsPanel : function() {
      if (this._analogsUiReady) return;
      this._analogsUiReady = true;
      this.loadAnalogs();
      document.querySelectorAll('.sounding-metrics-tab').forEach(btn => {
        btn.addEventListener('click', () => this.setMetricsTab(btn.dataset.tab));
      });
      const createBtn = document.getElementById('soundingAnalogCreateBtn');
      if (createBtn) {
        createBtn.addEventListener('click', () => this.createAnalogFromCurrent());
      }
      const importBtn = document.getElementById('soundingAnalogImportBtn');
      const importInput = document.getElementById('soundingAnalogImportInput');
      if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', () => {
          const file = importInput.files && importInput.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const n = this.importAnalogsFromText(String(reader.result || ''));
            importInput.value = '';
            if (n > 0) alert('Imported ' + n + ' analog(s).');
            else alert('No valid analogs found in file.');
          };
          reader.readAsText(file);
        });
      }
      const exportAllBtn = document.getElementById('soundingAnalogExportAllBtn');
      if (exportAllBtn) {
        exportAllBtn.addEventListener('click', () => this.exportAllAnalogs());
      }
      const skipDeleteConfirmEl = document.getElementById('soundingAnalogSkipDeleteConfirm');
      if (skipDeleteConfirmEl) {
        skipDeleteConfirmEl.checked = !!this._skipAnalogDeleteConfirm;
        skipDeleteConfirmEl.addEventListener('change', () => {
          this._skipAnalogDeleteConfirm = skipDeleteConfirmEl.checked;
          try {
            localStorage.setItem(
              this.SOUNDING_ANALOGS_SKIP_DELETE_CONFIRM_KEY,
              this._skipAnalogDeleteConfirm ? '1' : '0'
            );
          } catch (e) { /* ignore */ }
        });
      }
      const pasteBtn = document.getElementById('soundingAnalogPasteBtn');
      if (pasteBtn) {
        pasteBtn.addEventListener('click', async () => {
          let text = '';
          try {
            text = await navigator.clipboard.readText();
          } catch (e) { /* fall through to prompt */ }
          if (!text || !text.includes('WSE-ANALOG')) {
            text = prompt('Paste an analog share code (WSE-ANALOG:…):', text || '');
          }
          if (!text) return;
          const n = this.importAnalogsFromText(text);
          if (n > 0) alert('Imported ' + n + ' analog(s).');
          else alert('No valid analog found in that code.');
        });
      }
      const searchEl = document.getElementById('soundingAnalogSearch');
      if (searchEl) {
        searchEl.addEventListener('input', () => {
          this._analogSearch = searchEl.value || '';
          this.renderAnalogsPanel();
        });
      }
      const filterEl = document.getElementById('soundingAnalogFilters');
      if (filterEl) {
        filterEl.querySelectorAll('button[data-filter]').forEach(btn => {
          btn.addEventListener('click', () => {
            this._analogFilter = btn.dataset.filter || 'all';
            filterEl.querySelectorAll('button[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
            this.renderAnalogsPanel();
          });
        });
      }
      const sourceEl = document.getElementById('soundingAnalogSourceFilters');
      if (sourceEl) {
        sourceEl.querySelectorAll('button[data-source]').forEach(btn => {
          btn.addEventListener('click', () => this.setAnalogSourceFilter(btn.dataset.source));
        });
        this._syncAnalogSourceFilterUi();
      }
      this.initMetricsSimilarSection();
      this.initAnalogsListEvents();
      this.setMetricsTab(this._metricsTab);
    },
    initAnalogsListEvents : function() {
      if (this._analogsListEventsReady) return;
      const listEl = document.getElementById('soundingAnalogsList');
      if (!listEl) return;
      this._analogsListEventsReady = true;
      listEl.addEventListener('click', (e) => {
        const overlayBtn = e.target.closest('[data-analog-overlay]');
        if (overlayBtn) {
          e.preventDefault();
          this.toggleAnalogOverlay(overlayBtn.dataset.analogOverlay);
          return;
        }
        const shareBtn = e.target.closest('[data-analog-share]');
        if (shareBtn) {
          e.preventDefault();
          this.shareAnalog(shareBtn.dataset.analogShare);
          return;
        }
        const removeBtn = e.target.closest('[data-analog-remove]');
        if (removeBtn) {
          e.preventDefault();
          this.requestRemoveAnalog(removeBtn.dataset.analogRemove);
        }
      });
      listEl.addEventListener('change', (e) => {
        const input = e.target.closest('[data-analog-rename]');
        if (input && !input.readOnly) {
          this.renameAnalog(input.dataset.analogRename, input.value);
        }
      });
      listEl.addEventListener('focusout', (e) => {
        const input = e.target.closest('[data-analog-rename]');
        if (input && !input.readOnly) {
          this.renameAnalog(input.dataset.analogRename, input.value);
        }
      });
    },
    initMetricsSimilarSection : function() {
      if (this._metricsSimilarReady) return;
      const block = document.getElementById('soundingMetricsSimilarBlock');
      if (!block) return;
      this._metricsSimilarReady = true;
      block.addEventListener('click', (e) => {
        const srcBtn = e.target.closest('[data-analog-source]');
        if (srcBtn && block.contains(srcBtn)) {
          e.preventDefault();
          this.setAnalogSourceFilter(srcBtn.dataset.analogSource);
          return;
        }
        const pickEl = e.target.closest('[data-analog-pick]');
        if (pickEl) {
          const id = pickEl.dataset.analogPick;
          if (!id) return;
          if (!this._overlayAnalogIds.includes(id)) this.toggleAnalogOverlay(id);
          this.setMetricsTab('analogs');
        }
      });
      this._syncAnalogSourceFilterUi();
    },
    setAnalogSourceFilter : function(source) {
      if (source !== 'all' && source !== 'builtin' && source !== 'custom') return;
      this._analogSourceFilter = source;
      try {
        localStorage.setItem(this.SOUNDING_ANALOGS_SOURCE_KEY, source);
      } catch (e) { /* ignore */ }
      this._syncAnalogSourceFilterUi();
      this.renderAnalogsPanel();
      this.renderMetricsSimilarSection(this._lastAnalogSnapshot, true);
    },
    _syncAnalogSourceFilterUi : function() {
      const src = this._analogSourceFilter || 'all';
      document.querySelectorAll('#soundingAnalogSourceFilters button[data-source]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === src);
      });
      const metricsSrc = document.getElementById('soundingMetricsAnalogSource');
      if (metricsSrc) {
        metricsSrc.querySelectorAll('button[data-analog-source]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.analogSource === src);
        });
      }
    },
    _analogMatchesSource : function(analog) {
      const src = this._analogSourceFilter || 'all';
      if (src === 'builtin') return !!analog.builtin;
      if (src === 'custom') return !analog.builtin;
      return true;
    },
    _analogMatchesFilter : function(analog) {
      if (!this._analogMatchesSource(analog)) return false;
      const f = this._analogFilter || 'all';
      if (f === 'all') return true;
      const hazards = analog.hazards || [];
      const top = hazards.slice(0, 4).map(h => (h.label || '').toLowerCase());
      const name = (analog.name + ' ' + (analog.columnLabel || '')).toLowerCase();
      if (f === 'tornado') return top.some(l => l.includes('tornado')) || name.includes('tornado') || name.includes('ef');
      if (f === 'hail') return top.some(l => l.includes('hail')) || name.includes('hail');
      if (f === 'wind') return top.some(l => l.includes('wind')) || name.includes('derecho') || name.includes('haboob') || name.includes('microburst');
      if (f === 'flood') return top.some(l => l.includes('flood')) || name.includes('flood') || name.includes('harvey') || name.includes('training');
      return true;
    },
    _analogMatchesSearch : function(analog) {
      const q = (this._analogSearch || '').trim().toLowerCase();
      if (!q) return true;
      const hay = [
        analog.name, analog.columnLabel, analog.simTimeLabel, analog.obsTimeLabel,
        analog.convMode, analog.risk && analog.risk.label,
        ...(analog.hazards || []).map(h => h.label),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    },
    _buildAllHazardScores : function(ctx) {
      function hf(v, min, moderate, full) {
        if (v < min) return 0;
        if (v >= full) return 1;
        if (v <= moderate) return map_range_C(v, min, moderate, 0.08, 0.42);
        return map_range_C(v, moderate, full, 0.42, 1);
      }
      function hazardProbability(factors, cap) {
        if (factors.length === 0) return 0;
        if (factors.some(f => f <= 0)) return 0;
        const gm = Math.pow(factors.reduce((a, b) => a * b, 1), 1 / factors.length);
        return Math.min(cap, Math.round(Math.pow(gm, 1.55) * 100));
      }
      const moistF = hf(ctx.moistEnv, 0.45, 0.65, 0.88);
      const lapseN = Number.isFinite(ctx.lapse03) ? ctx.lapse03 : 0;
      const rows = [
        ['PDS Tornado', '#FF00FF', hazardProbability([
          hf(ctx.stp, 2.5, 5, 10), hf(ctx.vtp, 1.5, 3.5, 7), hf(ctx.srh3km, 200, 320, 480),
          hf(ctx.muCape, 2200, 3200, 5000), moistF,
        ], 52)],
        ['Tornado', '#FF0066', hazardProbability([
          hf(ctx.stp, 0.8, 2, 5), hf(ctx.vtp, 0.6, 1.8, 4), hf(ctx.srh3km, 100, 200, 380),
          hf(ctx.shear3km, 10, 16, 26), moistF,
        ], 48)],
        ['Supercell', '#FF4400', hazardProbability([
          hf(ctx.muCape, 900, 1600, 3200), hf(ctx.shear6km, 14, 20, 32),
          hf(ctx.srh3km, 80, 180, 320), moistF,
        ], 55)],
        ['Giant Hail', '#AA00FF', hazardProbability([
          hf(ctx.muCape, 1800, 2600, 4500), hf(lapseN, 7.8, 8.5, 9.8),
          hf(ctx.shear6km, 18, 24, 36), hf(ctx.mixedPhaseKm, 3.5, 5.5, 8), moistF,
        ], 50)],
        ['Large Hail', '#FF8800', hazardProbability([
          hf(ctx.muCape, 1100, 1800, 3200), hf(lapseN, 7.0, 7.8, 9.0),
          hf(ctx.estHailIn, 0.85, 1.25, 2.2), moistF,
        ], 45)],
        ['Hail', '#FFCC00', hazardProbability([
          hf(ctx.muCape, 550, 1000, 2200), hf(lapseN, 6.2, 7.0, 8.5),
          hf(ctx.mixedPhaseKm, 1.8, 3.5, 7), moistF,
        ], 42)],
        ['Destructive Winds', '#FF4400', hazardProbability([
          hf(ctx.dcape, 1100, 1700, 2800), hf(ctx.shear6km, 20, 28, 40),
          hf(ctx.drySlotStrength, 0.35, 0.55, 0.85),
        ], 48)],
        ['Damaging Winds', '#FF8800', hazardProbability([
          hf(ctx.dcape, 650, 1000, 1800), hf(ctx.shear6km, 16, 22, 34),
          hf(Math.max(ctx.dcape / 1200, ctx.drySlotStrength), 0.45, 0.7, 1.0),
        ], 40)],
        ['Flooding/Heavy Rain', '#0088FF', hazardProbability([
          hf(ctx.pwat_mm, 32, 42, 58), hf(ctx.muCape, 350, 800, 1800),
          hf(1 - map_range_C(ctx.shear6km, 6, 18, 0, 1), 0.35, 0.55, 0.85), moistF,
        ], 45)],
      ];
      if (ctx.muCape >= 200) {
        rows.push(['General Thunderstorm', '#AAAAAA', hazardProbability([
          hf(ctx.muCape, 200, 500, 1400), hf(ctx.pwat_mm, 12, 22, 40),
        ], 38)]);
      }
      return rows
        .map(([label, color, pct]) => ({label, color, pct}))
        .sort((a, b) => b.pct - a.pct);
    },
    _sampleSoundingProfile : function(envTempsC, envDewC, baseTextureValues, surfaceLevel, simResY, dz) {
      const levels = [];
      const step = Math.max(1, Math.round(300 / dz));
      for (let y = surfaceLevel; y < simResY; y += step) {
        levels.push({
          a: Math.round((y - surfaceLevel) * dz),
          t: Math.round(envTempsC[y] * 10) / 10,
          d: Math.round(envDewC[y] * 10) / 10,
          u: Math.round(rawVelocityTo_ms(baseTextureValues[4 * y]) * 10) / 10,
          v: Math.round(rawVelocityTo_ms(baseTextureValues[4 * y + 1]) * 10) / 10,
        });
      }
      return levels;
    },
    buildAnalogSuggestedName : function(stormTypesObj, hazards, risk, indices, convMode) {
      const types = (stormTypesObj && stormTypesObj.types) ? [...stormTypesObj.types] : [];
      types.sort((a, b) => (b.score || 0) - (a.score || 0));
      const hazList = hazards || [];
      const topHaz = hazList.find(h => (h.pct || 0) >= 12);
      const idx = indices || {};

      let stormPick = null;
      for (const t of types) {
        if ((t.score || 0) < 8) break;
        if (t.key === 'pulse') {
          const runner = types.find(x => x.key !== 'pulse' && (x.score || 0) >= 8);
          if (runner && (t.score || 0) - (runner.score || 0) < 12) continue;
        }
        stormPick = t;
        break;
      }

      const hazPriority = [
        'PDS Tornado', 'Tornado', 'Giant Hail', 'Large Hail', 'Destructive Winds',
        'Damaging Winds', 'Supercell', 'Hail', 'Flooding/Heavy Rain',
      ];
      let hazPick = null;
      for (const label of hazPriority) {
        const h = hazList.find(x => x.label === label && (x.pct || 0) >= 12);
        if (h) { hazPick = h; break; }
      }
      if (!hazPick && topHaz) hazPick = topHaz;

      let primary = '';
      if (hazPick && (hazPick.pct || 0) >= 18) {
        primary = hazPick.label;
      } else if (stormPick && (stormPick.score || 0) >= 12) {
        primary = stormPick.shortLabel || stormPick.label;
      } else if (hazPick) {
        primary = hazPick.label;
      } else if (stormPick) {
        primary = stormPick.shortLabel || stormPick.label;
      } else if (risk && risk.label && !['None', 'Marginal', 'Thunderstorm'].includes(risk.label)) {
        primary = risk.label + ' setup';
      } else if (convMode && convMode !== 'None') {
        primary = convMode + ' storms';
      } else {
        primary = 'Thunderstorm';
      }

      const tags = [];
      if (Number.isFinite(idx.stp) && idx.stp >= 3) tags.push('STP ' + idx.stp.toFixed(1));
      else if (Number.isFinite(idx.muCape) && idx.muCape >= 2000) tags.push(Math.round(idx.muCape) + ' MU CAPE');
      if (Number.isFinite(idx.estHailIn) && idx.estHailIn >= 1.5 && primary.indexOf('Hail') < 0) {
        tags.push(printHailSize(idx.estHailIn));
      }
      if (stormPick && stormPick.key !== 'pulse' && primary.indexOf(stormPick.shortLabel || '') < 0 &&
          (stormPick.score || 0) >= 15) {
        tags.push(stormPick.shortLabel || stormPick.label);
      }

      let name = primary;
      if (tags.length) name += ' · ' + tags.slice(0, 2).join(' · ');
      return name.slice(0, 64);
    },
    storeAnalogSnapshot : function(snapshot) {
      this._lastAnalogSnapshot = snapshot;
      const nameInput = document.getElementById('soundingAnalogNameInput');
      if (nameInput && snapshot && snapshot.suggestedName) {
        nameInput.placeholder = snapshot.suggestedName;
      }
    },
    createAnalogFromCurrent : function(name) {
      const snap = this._lastAnalogSnapshot;
      if (!snap) {
        alert('No sounding data available yet. Open the Skew-T graph and try again.');
        return null;
      }
      const nameInput = document.getElementById('soundingAnalogNameInput');
      const customName = name != null ? name : (nameInput ? nameInput.value : '');
      const resolvedName = String(customName || '').trim() ||
        snap.suggestedName ||
        ('Analog ' + (this.getUserAnalogs().length + 1));
      const analog = {
        id: this._newAnalogId(),
        name: resolvedName.trim(),
        createdAt: Date.now(),
        builtin: false,
        ...snap,
      };
      this._userAnalogs.unshift(analog);
      this.saveAnalogs();
      if (nameInput) nameInput.value = '';
      this.setMetricsTab('analogs');
      this.renderAnalogsPanel();
      return analog;
    },
    requestRemoveAnalog : function(id) {
      if (!id) return;
      if (this._skipAnalogDeleteConfirm) {
        this.removeAnalog(id);
        return;
      }
      const analog = this.findAnalogById(id);
      const msg = analog && analog.builtin
        ? 'Hide this library analog from the list?'
        : 'Remove this analog?';
      if (confirm(msg)) this.removeAnalog(id);
    },
    removeAnalog : function(id) {
      const analog = this.findAnalogById(id);
      if (!analog) return;
      if (analog.builtin) {
        if (!this._hiddenBuiltinIds.includes(id)) this._hiddenBuiltinIds.push(id);
        this.saveHiddenBuiltins();
      } else {
        this._userAnalogs = this._userAnalogs.filter(a => a.id !== id);
        this.saveAnalogs();
      }
      this._overlayAnalogIds = this._overlayAnalogIds.filter(oid => oid !== id);
      this.renderAnalogsPanel();
    },
    renameAnalog : function(id, name) {
      const analog = this._userAnalogs.find(a => a.id === id);
      if (!analog || analog.builtin) return;
      analog.name = String(name || '').trim() || analog.name;
      this.saveAnalogs();
    },
    toggleAnalogOverlay : function(id) {
      const idx = this._overlayAnalogIds.indexOf(id);
      if (idx >= 0) this._overlayAnalogIds.splice(idx, 1);
      else this._overlayAnalogIds.push(id);
      this._analogsPanelFingerprint = '';
      this._updateAnalogOverlayButton(id);
    },
    _updateAnalogOverlayButton : function(id) {
      const listEl = document.getElementById('soundingAnalogsList');
      if (!listEl || !id) return;
      const safeId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
      const card = listEl.querySelector('[data-analog-id="' + safeId + '"]');
      if (!card) return;
      const overlayOn = this._overlayAnalogIds.includes(id);
      card.classList.toggle('selected', overlayOn);
      const btn = card.querySelector('[data-analog-overlay]');
      if (btn) {
        btn.classList.toggle('active', overlayOn);
        btn.textContent = overlayOn ? 'Overlay on' : 'Overlay';
      }
    },
    _analogSharePayload : function(analog) {
      return {v: 1, type: 'wse-sounding-analog', analog};
    },
    _encodeAnalogShare : function(payload) {
      return 'WSE-ANALOG:' + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    },
    _decodeAnalogShare : function(text) {
      const raw = String(text || '').trim();
      let jsonStr = raw;
      if (raw.startsWith('WSE-ANALOG:')) {
        jsonStr = decodeURIComponent(escape(atob(raw.slice('WSE-ANALOG:'.length))));
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed && parsed.type === 'wse-sounding-analog' && parsed.analog) return parsed.analog;
      if (parsed && parsed.id && parsed.hazards) return parsed;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.analogs)) return parsed.analogs;
      return null;
    },
    _normalizeImportedAnalog : function(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const hazards = Array.isArray(raw.hazards) ? raw.hazards : [];
      if (!hazards.length && !raw.indices) return null;
      return {
        id: raw.id || this._newAnalogId(),
        name: String(raw.name || 'Imported Analog').trim() || 'Imported Analog',
        createdAt: raw.createdAt || Date.now(),
        columnLabel: raw.columnLabel || '—',
        simTimeLabel: raw.simTimeLabel || '—',
        obsTimeLabel: raw.obsTimeLabel || '',
        hazards,
        indices: raw.indices || {},
        stormTypes: raw.stormTypes || [],
        convMode: raw.convMode || '—',
        risk: raw.risk || {label: '—', color: '#888888'},
        profile: Array.isArray(raw.profile) ? raw.profile : [],
        notes: raw.notes || '',
      };
    },
    importAnalogsFromText : function(text) {
      let items = null;
      try {
        items = this._decodeAnalogShare(text);
      } catch (e) {
        return 0;
      }
      if (!items) return 0;
      const list = Array.isArray(items) ? items : [items];
      let added = 0;
      for (const item of list) {
        const analog = this._normalizeImportedAnalog(item);
        if (!analog) continue;
        analog.id = this._newAnalogId();
        analog.createdAt = Date.now();
        analog.builtin = false;
        this._userAnalogs.unshift(analog);
        added++;
      }
      if (added > 0) {
        this.saveAnalogs();
        this.setMetricsTab('analogs');
        this.renderAnalogsPanel();
      }
      return added;
    },
    shareAnalog : async function(id) {
      const analog = this.findAnalogById(id);
      if (!analog) return;
      const code = this._encodeAnalogShare(this._analogSharePayload(analog));
      try {
        await navigator.clipboard.writeText(code);
        alert('Analog share code copied to clipboard.');
      } catch (e) {
        prompt('Copy this analog share code:', code);
      }
    },
    exportAllAnalogs : function() {
      const user = this.getUserAnalogs();
      if (!user.length) {
        alert('No custom analogs to export. Library analogs stay built-in — share individual ones with Share.');
        return;
      }
      const payload = {v: 1, type: 'wse-sounding-analogs', analogs: user};
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sounding-analogs.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    _similarityVal : function(a, b, logScale) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      let av = a;
      let bv = b;
      if (logScale) {
        av = Math.log1p(Math.max(0, av));
        bv = Math.log1p(Math.max(0, bv));
      }
      const denom = Math.max(Math.abs(av), Math.abs(bv), 0.001);
      return 1 - Math.min(1, Math.abs(av - bv) / denom);
    },
    _hazardProfileSimilarity : function(analog, snap) {
      const aHaz = analog.hazards || [];
      const bHaz = snap.hazards || [];
      if (!aHaz.length || !bHaz.length) return null;
      const bMap = {};
      for (const h of bHaz) bMap[h.label] = h.pct || 0;
      let sum = 0;
      let n = 0;
      for (const h of aHaz) {
        if (!bMap.hasOwnProperty(h.label)) continue;
        const ap = (h.pct || 0) / 100;
        const bp = (bMap[h.label] || 0) / 100;
        sum += 1 - Math.min(1, Math.abs(ap - bp) / Math.max(ap, bp, 0.08));
        n++;
      }
      return n ? sum / n : null;
    },
    computeAnalogSimilarity : function(analog, snap) {
      if (!analog || !snap || !analog.indices || !snap.indices) return null;
      const ai = analog.indices;
      const bi = snap.indices;
      const parts = [
        [this._similarityVal(ai.muCape, bi.muCape, true), 1.25],
        [this._similarityVal(ai.stp, bi.stp, false), 1.5],
        [this._similarityVal(ai.srh3km, bi.srh3km, false), 1.35],
        [this._similarityVal(ai.shear6km, bi.shear6km, false), 1.1],
        [this._similarityVal(ai.dcape, bi.dcape, true), 1.0],
        [this._similarityVal(ai.pwat_mm, bi.pwat_mm, false), 1.0],
        [this._similarityVal(ai.estHailIn, bi.estHailIn, false), 0.85],
      ];
      let sum = 0;
      let wSum = 0;
      for (const [sim, w] of parts) {
        if (sim == null) continue;
        sum += sim * w;
        wSum += w;
      }
      const hazSim = this._hazardProfileSimilarity(analog, snap);
      if (hazSim != null) {
        sum += hazSim * 1.4;
        wSum += 1.4;
      }
      if (!wSum) return null;
      return Math.round((sum / wSum) * 100);
    },
    getAnalogRelevancyMinScore : function() {
      const v = guiControls.analogRelevancy;
      if (v == null || !Number.isFinite(v)) return 50;
      return Math.max(0, Math.min(100, Math.round(v)));
    },
    _HAZARD_DAMAGE_RANK : {
      'General Thunderstorm': 1,
      'Flooding/Heavy Rain': 2,
      'Hail': 3,
      'Damaging Winds': 4,
      'Large Hail': 5,
      'Supercell': 6,
      'Destructive Winds': 7,
      'Giant Hail': 8,
      'Tornado': 9,
      'PDS Tornado': 10,
    },
    _SEVERITY_TEXT_COLORS : ['#888888', '#4488ff', '#33cc66', '#dddd22', '#ff9900', '#ff3333', '#ff66cc', '#f5f5f5', '#1a1a1a'],
    _hexToRgb : function(hex) {
      const h = String(hex || '').replace('#', '');
      if (h.length === 3) {
        return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      }
      if (h.length >= 6) {
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      return [136, 136, 136];
    },
    _rgbToHex : function(r, g, b) {
      const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
      return '#' + c(r) + c(g) + c(b);
    },
    _lerpColor : function(c1, c2, t) {
      const a = this._hexToRgb(c1);
      const b = this._hexToRgb(c2);
      const f = Math.max(0, Math.min(1, t));
      return this._rgbToHex(
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f
      );
    },
    severityScoreToColor : function(score) {
      const colors = this._SEVERITY_TEXT_COLORS;
      const t = Math.max(0, Math.min(1, (score || 0) / 100)) * (colors.length - 1);
      const i = Math.floor(t);
      const f = t - i;
      if (i >= colors.length - 1) return colors[colors.length - 1];
      return this._lerpColor(colors[i], colors[i + 1], f);
    },
    _textColorNeedsGlow : function(hex) {
      const rgb = this._hexToRgb(hex);
      return (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) < 52;
    },
    _severityTextShadowCss : function(hex) {
      return this._textColorNeedsGlow(hex)
        ? 'text-shadow:0 0 2px rgba(255,255,255,0.95),0 0 5px rgba(255,255,255,0.55);'
        : '';
    },
    computeAnalogSeverityScore : function(analog) {
      if (!analog) return 0;
      let peak = 0;
      for (const h of (analog.hazards || [])) {
        const rank = this._HAZARD_DAMAGE_RANK[h.label] || 3;
        const pct = Math.max(0, Math.min(100, h.pct || 0));
        const score = (rank / 10) * (0.35 + 0.65 * pct / 100);
        peak = Math.max(peak, score);
      }
      const idx = analog.indices || {};
      if (Number.isFinite(idx.stp) && idx.stp > 0) {
        peak = Math.max(peak, Math.min(1, idx.stp / 12));
      }
      if (Number.isFinite(idx.estHailIn) && idx.estHailIn >= 1.5) {
        peak = Math.max(peak, 0.5 + Math.min(0.4, idx.estHailIn / 12));
      }
      const riskLabel = analog.risk && analog.risk.label;
      if (riskLabel === 'High') peak = Math.min(1, peak * 1.08 + 0.05);
      else if (riskLabel === 'Moderate') peak = Math.min(1, peak * 1.02);
      return Math.round(peak * 100);
    },
    getSimilarAnalogs : function(snap, limit, minScore) {
      if (!snap) return [];
      const cap = limit || 5;
      const min = minScore != null ? minScore : this.getAnalogRelevancyMinScore();
      return this.getAllAnalogs()
        .filter(a => this._analogMatchesSource(a))
        .map(analog => ({ analog, score: this.computeAnalogSimilarity(analog, snap) }))
        .filter(x => x.score != null && x.score >= min)
        .sort((a, b) => {
          const sevDiff = this.computeAnalogSeverityScore(b.analog) - this.computeAnalogSeverityScore(a.analog);
          if (sevDiff !== 0) return sevDiff;
          return b.score - a.score;
        })
        .slice(0, cap);
    },
    _fingerprintSimilarAnalogs : function(matches) {
      const src = this._analogSourceFilter || 'all';
      const min = this.getAnalogRelevancyMinScore();
      if (!matches || !matches.length) return src + '|min' + min + '|empty';
      return src + '|min' + min + '|' + matches.map(({ analog, score }) =>
        analog.id + ':' + Math.round(score / 5) * 5 + ':' + this.computeAnalogSeverityScore(analog)
      ).join(',');
    },
    _analogMatchSubline : function(analog) {
      const topH = (analog.hazards || []).find(h => (h.pct || 0) >= 15) || (analog.hazards || [])[0];
      const typeTag = analog.builtin ? 'Real world' : 'Custom';
      return typeTag + ' · ' + (analog.columnLabel || '') + ' · ' +
        (topH ? topH.label + ' ' + topH.pct + '%' : analog.simTimeLabel || '');
    },
    _parseEfFromAnalogName : function(name) {
      const m = String(name || '').match(/\bEF\s*-?\s*([0-5])\b/i);
      return m ? parseInt(m[1], 10) : null;
    },
    _estimateTornadoEf : function(analog) {
      const fromName = this._parseEfFromAnalogName(analog && analog.name);
      if (fromName != null) return fromName;
      const idx = (analog && analog.indices) || {};
      const stp = idx.stp;
      if (!Number.isFinite(stp)) return null;
      let ef = 0;
      if (stp < 0.5) ef = 0;
      else if (stp < 1.5) ef = 1;
      else if (stp < 3) ef = 2;
      else if (stp < 5) ef = 3;
      else if (stp < 8) ef = 4;
      else ef = 5;
      const srh = idx.srh3km;
      const cape = idx.muCape;
      if (stp >= 6 && Number.isFinite(srh) && srh >= 350 && Number.isFinite(cape) && cape >= 3500) ef = 5;
      else if (stp >= 4 && Number.isFinite(srh) && srh >= 300) ef = Math.max(ef, 4);
      return ef;
    },
    _formatTornadoEf : function(ef) {
      if (ef == null || !Number.isFinite(ef)) return null;
      const n = Math.max(0, Math.min(5, Math.round(ef)));
      const labels = ['EF0', 'EF1', 'EF2', 'EF3', 'EF4', 'EF5'];
      const desc = ['Weak', 'Moderate', 'Significant', 'Intense', 'Devastating', 'Incredible'];
      return labels[n] + ' (' + desc[n] + ')';
    },
    _estWindGustMs : function(idx) {
      if (!idx) return null;
      const dcape = idx.dcape;
      const shear = idx.shear6km;
      let gust = null;
      if (Number.isFinite(dcape) && dcape > 0) {
        gust = Math.sqrt(2 * dcape) * 0.55;
      }
      if (Number.isFinite(shear)) {
        const shearGust = shear * 0.42;
        gust = gust != null ? Math.max(gust, shearGust) : shearGust;
      }
      return gust;
    },
    _formatRainfallLevel : function(pwat_mm) {
      if (!Number.isFinite(pwat_mm)) return null;
      const mm = Math.round(pwat_mm);
      if (pwat_mm < 20) return 'Low · ' + mm + ' mm PWAT';
      if (pwat_mm < 32) return 'Moderate · ' + mm + ' mm PWAT';
      if (pwat_mm < 45) return 'Heavy · ' + mm + ' mm PWAT';
      if (pwat_mm < 55) return 'Very heavy · ' + mm + ' mm PWAT';
      return 'Extreme · ' + mm + ' mm PWAT · flash flood risk';
    },
    _activeAnalogHazards : function(analog, minPct) {
      const min = minPct != null ? minPct : 10;
      return (analog && analog.hazards || [])
        .filter(h => (h.pct || 0) >= min)
        .sort((a, b) => (b.pct || 0) - (a.pct || 0));
    },
    _hazardLabelMatches : function(label, keys) {
      const l = String(label || '').toLowerCase();
      return keys.some(k => l.includes(k));
    },
    getAnalogHazardDetails : function(analog) {
      if (!analog) return [];
      const hazards = this._activeAnalogHazards(analog, 10);
      const idx = analog.indices || {};
      const details = [];
      const seen = new Set();

      const push = (key, text) => {
        if (!text || seen.has(key)) return;
        seen.add(key);
        details.push(text);
      };

      const hasTornado = hazards.some(h => this._hazardLabelMatches(h.label, ['pds tornado', 'tornado']));
      const hasHail = hazards.some(h => this._hazardLabelMatches(h.label, ['hail']));
      const hasWind = hazards.some(h => this._hazardLabelMatches(h.label, ['destructive wind', 'damaging wind', 'wind']));
      const hasFlood = hazards.some(h => this._hazardLabelMatches(h.label, ['flood', 'rain']));
      const hasSupercell = hazards.some(h => this._hazardLabelMatches(h.label, ['supercell']));

      if (hasTornado) {
        const efStr = this._formatTornadoEf(this._estimateTornadoEf(analog));
        const parts = [];
        if (efStr) parts.push(efStr);
        if (Number.isFinite(idx.stp)) parts.push('STP ' + idx.stp.toFixed(1));
        if (Number.isFinite(idx.srh3km)) parts.push('SRH ' + Math.round(idx.srh3km));
        if (Number.isFinite(idx.tornadoPct) && idx.tornadoPct >= 12) {
          parts.push('tor prob ' + Math.round(idx.tornadoPct) + '%');
        }
        if (parts.length) push('tornado', 'Tornado: ' + parts.join(' · '));
      }

      if (hasHail && Number.isFinite(idx.estHailIn) && idx.estHailIn >= 0.05) {
        const parts = [printHailSize(idx.estHailIn) + ' est.'];
        if (Number.isFinite(idx.ship) && idx.ship >= 1) parts.push('SHIP ' + idx.ship.toFixed(1));
        if (Number.isFinite(idx.muCape) && idx.muCape >= 500) {
          parts.push('MLCAPE ' + Math.round(idx.muCape) + ' J/kg');
        }
        push('hail', 'Hail: ' + parts.join(' · '));
      }

      if (hasWind) {
        const gust = this._estWindGustMs(idx);
        const parts = [];
        if (gust != null) parts.push('~' + printVelocity(gust) + ' gust potential');
        if (Number.isFinite(idx.dcape)) parts.push('DCAPE ' + Math.round(idx.dcape) + ' J/kg');
        if (Number.isFinite(idx.shear6km)) parts.push('0–6 km shear ' + printShear(idx.shear6km));
        if (parts.length) push('wind', 'Wind: ' + parts.join(' · '));
      }

      if (hasFlood) {
        const rain = this._formatRainfallLevel(idx.pwat_mm);
        const parts = [];
        if (rain) parts.push(rain);
        if (Number.isFinite(idx.muCape) && idx.muCape >= 300) {
          parts.push('CAPE ' + Math.round(idx.muCape) + ' J/kg');
        }
        if (parts.length) push('flood', 'Rainfall: ' + parts.join(' · '));
      }

      if (hasSupercell && !seen.has('tornado')) {
        const parts = [];
        if (Number.isFinite(idx.muCape)) parts.push('MLCAPE ' + Math.round(idx.muCape) + ' J/kg');
        if (Number.isFinite(idx.srh3km)) parts.push('SRH ' + Math.round(idx.srh3km));
        if (Number.isFinite(idx.shear6km)) parts.push('shear ' + printShear(idx.shear6km));
        if (parts.length) push('supercell', 'Supercell: ' + parts.join(' · '));
      }

      if (!details.length && hazards.length) {
        const top = hazards[0];
        push('generic', top.label + ' ' + (top.pct || 0) + '%');
      }

      return details;
    },
    _formatAnalogHazardDetailsHtml : function(analog, color) {
      const details = this.getAnalogHazardDetails(analog);
      if (!details.length) return '';
      const c = color || '#8899aa';
      return '<div class="sounding-analog-hazard-details" style="color:' + c + '">' +
        details.map(d => '<span>' + this._escapeHtml(d) + '</span>').join('') + '</div>';
    },
    _renderSimilarAnalogMatchHtml : function(analog, score) {
      const pct = Math.max(0, Math.min(100, score || 0));
      const severity = this.computeAnalogSeverityScore(analog);
      const nameColor = this.severityScoreToColor(severity);
      const subColor = this._lerpColor(nameColor, '#7a8fa0', 0.35);
      const glow = this._severityTextShadowCss(nameColor);
      const sub = this._analogMatchSubline(analog);
      const detailsHtml = this._formatAnalogHazardDetailsHtml(analog, subColor);
      return '<div class="sounding-metrics-analog-match" data-analog-pick="' + this._escapeHtml(analog.id) +
        '" title="Click to overlay on Skew-T">' +
        '<div class="sounding-metrics-bar"><span class="name" style="color:' + nameColor + ';' + glow + '">' +
        this._escapeHtml(analog.name) + '</span><span class="pct" style="color:' + nameColor + ';' + glow + '">' + pct +
        '%</span><div class="track"><div class="fill" style="width:' + pct + '%;background:' + nameColor +
        '"></div></div></div>' +
        '<div class="sub" style="color:' + subColor + '">' + this._escapeHtml(sub) + '</div>' +
        detailsHtml + '</div>';
    },
    renderMetricsSimilarSection : function(snap, force) {
      const listEl = document.getElementById('soundingMetricsSimilarList');
      if (!listEl) return;
      const similarAnalogs = this.getSimilarAnalogs(snap, 12);
      const fingerprint = this._fingerprintSimilarAnalogs(similarAnalogs);
      if (!force && fingerprint === this._similarAnalogsFingerprint) return;
      const scrollTop = listEl.scrollTop;
      this._similarAnalogsFingerprint = fingerprint;
      this._lastSimilarAnalogsRendered = similarAnalogs;
      if (!similarAnalogs.length) {
        const srcLabel = this._analogSourceFilter === 'builtin' ? 'real world'
          : (this._analogSourceFilter === 'custom' ? 'custom' : '');
        listEl.innerHTML = '<div class="sounding-metrics-row"><span class="lbl">No matches</span><span class="val" style="color:#7a8fa0">' +
          this._escapeHtml(srcLabel ? ('No similar ' + srcLabel + ' analogs') : 'No similar analogs') +
          '</span></div>';
      } else {
        listEl.innerHTML = similarAnalogs.map(({ analog, score }) =>
          this._renderSimilarAnalogMatchHtml(analog, score)
        ).join('');
      }
      listEl.scrollTop = scrollTop;
      this._syncAnalogSourceFilterUi();
    },
    _formatAnalogHazardBars : function(hazards, maxRows) {
      const list = (hazards || []).filter(h => (h.pct || 0) >= 10).slice(0, maxRows || 5);
      if (!list.length) {
        return (hazards || []).slice(0, 3).map(h => this._formatOneHazardBar(h)).join('');
      }
      return list.map(h => this._formatOneHazardBar(h)).join('');
    },
    _formatOneHazardBar : function(h) {
      const pct = Math.max(0, Math.min(100, h.pct || 0));
      const dim = pct < 12 ? ' dim' : '';
      return '<div class="sounding-metrics-bar' + dim + '"><span class="name">' + this._escapeHtml(h.label) +
        '</span><span class="pct">' + pct + '%</span><div class="track"><div class="fill" style="width:' +
        pct + '%;background:' + (h.color || '#88aacc') + '"></div></div></div>';
    },
    _renderAnalogCard : function(analog, snap) {
      const overlayOn = this._overlayAnalogIds.includes(analog.id);
      const sim = this._escapeHtml(analog.simTimeLabel || '—');
      const col = this._escapeHtml(analog.columnLabel || '—');
      const simLine = col + ' · ' + sim;
      const hazardHtml = this._formatAnalogHazardBars(analog.hazards, 5);
      const severity = this.computeAnalogSeverityScore(analog);
      const detailColor = this._lerpColor(this.severityScoreToColor(severity), '#7a8fa0', 0.25);
      const detailsHtml = this._formatAnalogHazardDetailsHtml(analog, detailColor);
      const simPct = snap ? this.computeAnalogSimilarity(analog, snap) : null;
      const simBadge = simPct != null ? '<span>Match: ' + simPct + '%</span>' : '';
      const builtinCls = analog.builtin ? ' builtin' : '';
      const removeLabel = analog.builtin ? 'Hide' : 'Remove';
      return '<div class="sounding-analog-card' + builtinCls + (overlayOn ? ' selected' : '') + '" data-analog-id="' +
        this._escapeHtml(analog.id) + '">' +
        '<div class="sounding-analog-card-body">' +
        '<div class="sounding-analog-card-head"><input type="text" value="' + this._escapeHtml(analog.name) +
        '" data-analog-rename="' + this._escapeHtml(analog.id) + '" maxlength="64" ' +
        (analog.builtin ? 'readonly tabindex="-1"' : '') + '></div>' +
        '<div class="sounding-analog-sim">' + simLine + '</div>' +
        (detailsHtml || '') +
        (simBadge ? '<div class="sounding-analog-meta">' + simBadge + '</div>' : '') +
        '<div class="sounding-analog-hazards">' + hazardHtml + '</div>' +
        '<div class="sounding-analog-actions">' +
        '<button type="button" class="' + (overlayOn ? 'active' : '') + '" data-analog-overlay="' + this._escapeHtml(analog.id) + '">' +
        (overlayOn ? 'Overlay on' : 'Overlay') + '</button>' +
        '<button type="button" data-analog-share="' + this._escapeHtml(analog.id) + '">Share</button>' +
        '<button type="button" class="danger" data-analog-remove="' + this._escapeHtml(analog.id) + '">' + removeLabel + '</button>' +
        '</div></div></div>';
    },
    _fingerprintAnalogsPanel : function(builtins, users, snap) {
      const matchKey = (list) => list.map(a => {
        const sim = snap ? this.computeAnalogSimilarity(a, snap) : null;
        const bucket = sim != null ? Math.round(sim / 5) * 5 : -1;
        return a.id + ':' + bucket;
      }).join(';');
      return [
        this._analogSearch || '',
        this._analogFilter || 'all',
        this._analogSourceFilter || 'all',
        [...(this._overlayAnalogIds || [])].sort().join(','),
        builtins.map(a => a.id).join(';'),
        users.map(a => a.id + '|' + (a.name || '')).join(';'),
        matchKey(builtins),
        matchKey(users),
      ].join('||');
    },
    renderAnalogsPanel : function(force) {
      const listEl = document.getElementById('soundingAnalogsList');
      if (!listEl) return;
      const builtins = this.getBuiltinAnalogs().filter(a => this._analogMatchesSearch(a) && this._analogMatchesFilter(a));
      const users = this.getUserAnalogs().filter(a => this._analogMatchesSearch(a) && this._analogMatchesFilter(a));
      const snap = this._lastAnalogSnapshot;
      const src = this._analogSourceFilter || 'all';
      const showBuiltins = src === 'all' || src === 'builtin';
      const showUsers = src === 'all' || src === 'custom';
      const fingerprint = this._fingerprintAnalogsPanel(
        showBuiltins ? builtins : [],
        showUsers ? users : [],
        snap
      );
      if (!force && fingerprint === this._analogsPanelFingerprint) return;
      this._analogsPanelFingerprint = fingerprint;
      if (!builtins.length && !users.length) {
        const hint = src === 'builtin' ? 'real world' : (src === 'custom' ? 'custom' : '');
        listEl.innerHTML = '<div class="sounding-analogs-empty">No ' + (hint || '') +
          ' analogs match your search. Try another keyword, hazard filter, or source filter.</div>';
        return;
      }
      const scrollTop = listEl.scrollTop;
      let html = '';
      if (showBuiltins && builtins.length) {
        html += '<div class="sounding-analogs-section-title">Real world (' + builtins.length + ')</div>';
        for (const analog of builtins) html += this._renderAnalogCard(analog, snap);
      }
      if (showUsers && users.length) {
        html += '<div class="sounding-analogs-section-title">Custom (' + users.length + ')</div>';
        for (const analog of users) html += this._renderAnalogCard(analog, snap);
      }
      listEl.innerHTML = html;
      listEl.scrollTop = scrollTop;
    },
    drawAnalogOverlays : function(c, helpers) {
      if (!this._overlayAnalogIds.length) return;
      const {surfaceLevel, dz, plotTop, plotBottom, scrYFromSimY, T_to_Xpos, skewTLeft, skewTPlotRight} = helpers;
      let colorIdx = 0;
      for (const id of this._overlayAnalogIds) {
        const analog = this.findAnalogById(id);
        if (!analog || !analog.profile || !analog.profile.length) continue;
        const color = this._analogOverlayColors[colorIdx % this._analogOverlayColors.length];
        colorIdx++;
        c.save();
        c.setLineDash([5, 4]);
        c.lineWidth = 2;
        c.strokeStyle = color;
        c.beginPath();
        let started = false;
        for (const pt of analog.profile) {
          const simY = surfaceLevel + Math.round(pt.a / dz);
          const scrY = scrYFromSimY(simY);
          if (scrY < plotTop || scrY > plotBottom) continue;
          const x = T_to_Xpos(pt.t, scrY);
          if (x < skewTLeft || x > skewTPlotRight) continue;
          if (!started) { c.moveTo(x, scrY); started = true; }
          else c.lineTo(x, scrY);
        }
        if (started) c.stroke();
        c.strokeStyle = color + '99';
        c.beginPath();
        started = false;
        for (const pt of analog.profile) {
          const simY = surfaceLevel + Math.round(pt.a / dz);
          const scrY = scrYFromSimY(simY);
          if (scrY < plotTop || scrY > plotBottom) continue;
          const x = T_to_Xpos(pt.d, scrY);
          if (x < skewTLeft || x > skewTPlotRight) continue;
          if (!started) { c.moveTo(x, scrY); started = true; }
          else c.lineTo(x, scrY);
        }
        if (started) c.stroke();
        c.setLineDash([]);
        c.font = 'bold 9px Arial';
        c.fillStyle = color;
        c.fillText(analog.name, skewTLeft + 4, plotTop + 12 + colorIdx * 12);
        c.restore();
      }
    },
    updateSoundingDashboard : function(data) {
      const dashRoot = document.getElementById('soundingDashboard');
      const metricsPanel = document.getElementById('soundingMetricsPanel');
      if (data.layout && dashRoot) {
        const L = data.layout;
        dashRoot.style.setProperty('--sounding-dash-w', Math.ceil(L.railW) + 'px');
        dashRoot.style.setProperty('--sounding-footer-h', (L.footerH || 112) + 'px');
        dashRoot.style.setProperty('--sounding-footer-gap', (L.footerGap || 8) + 'px');
        dashRoot.style.setProperty('--footer-readout-w', Math.max(0, L.readoutW) + 'px');
        dashRoot.style.setProperty('--footer-parcel-w', Math.max(0, L.parcelW) + 'px');
        dashRoot.style.setProperty('--footer-controls-w', Math.max(0, L.controlsW) + 'px');
        if (L.readoutLeft != null) {
          dashRoot.style.setProperty('--footer-readout-left', Math.round(L.readoutLeft) + 'px');
        }
        if (L.parcelLeft != null) {
          dashRoot.style.setProperty('--footer-parcel-left', Math.round(L.parcelLeft) + 'px');
        }
        if (L.controlsLeft != null) {
          dashRoot.style.setProperty('--footer-controls-left', Math.round(L.controlsLeft) + 'px');
        }
        const panelMap = {
          footerReadout: 'soundingReadoutPanel',
          footerParcel: 'soundingParcelPanel',
          footerControls: 'soundingControlsPanel',
          metrics: 'soundingMetricsPanel',
        };
        if (L.panels) {
          for (const [key, rect] of Object.entries(L.panels)) {
            const el = document.getElementById(panelMap[key]);
            if (el && rect) this._applyPanelRect(el, rect);
          }
        }
        if (metricsPanel) {
          metricsPanel.style.display = 'flex';
          if (!L.panels || !L.panels.metrics) {
            metricsPanel.style.left = Math.round(L.metricsLeft) + 'px';
            metricsPanel.style.top = Math.round(L.metricsTop) + 'px';
            metricsPanel.style.width = Math.round(L.metricsWidth) + 'px';
            metricsPanel.style.height = Math.max(80, Math.round(L.metricsHeight)) + 'px';
          }
        }
      }
      if (data.metricsRows) {
        this.renderMetricsPanel(data.metricsRows, data.metricsTimeLine);
      }
      const station = document.getElementById('soundingStationLabel');
      const valid = document.getElementById('soundingValidLabel');
      if (station) {
        station.textContent = data.stationLabel || 'Simulation Sounding';
      }
      if (valid) {
        valid.textContent = 'VALID: ' + (data.validLabel || '—');
      }
      const fillGridCols = (elId, columns) => {
        const grid = document.getElementById(elId);
        if (!grid || !columns) return;
        grid.innerHTML = columns.map(col =>
          '<div class="sounding-readout-col">' + col.map(([lbl, val, cls]) =>
            '<span class="lbl">' + this._escapeHtml(lbl) + '</span><span class="val' +
            (cls ? ' ' + cls : '') + '">' + this._escapeHtml(val) + '</span>'
          ).join('') + '</div>'
        ).join('');
      };
      if (data.readoutCols) {
        fillGridCols('soundingReadoutGrid', data.readoutCols);
      }
      if (data.parcelCols) {
        fillGridCols('soundingParcelGrid', data.parcelCols);
      }
      const freezeBtnEl = document.getElementById('soundingFreezeBtn');
      if (freezeBtnEl) {
        freezeBtnEl.textContent = guiControls.graphFixedPosition ? 'Unlock' : 'Freeze';
      }
    },
    saveCurrentSounding : function() {
      // Read the current column data from the simulation
      const simXpos = guiControls.graphFixedX;
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      var baseTextureValues = new Float32Array(4 * sim_res_y);
      gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues);
      
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      var waterTextureValues = new Float32Array(4 * sim_res_y);
      gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);
      
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      var wallTextureValues = new Int32Array(4 * sim_res_y);
      gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA_INTEGER, gl.INT, wallTextureValues);
      
      // Extract sounding data
      const dz = guiControls.simHeight / sim_res_y;
      const soundingData = [];
      
      console.log('saveCurrentSounding: dryLapse =', dryLapse, 'simHeight =', guiControls.simHeight, 'sim_res_y =', sim_res_y);
      
      for (let y = 0; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue; // Skip non-fluid cells
        
        const potentialTemp = baseTextureValues[4 * y + 3];
        // Convert potential temperature (K) to real temperature (C)
        // realToPotentialT does: potential = real + (y/sim_res_y) * dryLapse
        // So to reverse: real = potential - (y/sim_res_y) * dryLapse
        const tempK = potentialTemp - (y / sim_res_y) * dryLapse;
        const temp = tempK - 273.15;
        const water = waterTextureValues[4 * y];
        const tdK = dewpoint(water);
        const td = KtoC(tdK);
        const rh = relativeHumd(CtoK(temp), water);
        
        // Calculate velocity from raw velocity
        const velRaw = Math.sqrt(Math.pow(baseTextureValues[4 * y], 2) + Math.pow(baseTextureValues[4 * y + 1], 2));
        const vel = rawVelocityTo_ms(velRaw) * 3.6; // Convert to km/h
        const angle = Math.atan2(baseTextureValues[4 * y + 1], baseTextureValues[4 * y]) * 180 / Math.PI;
        
        // Estimate pressure (simple barometric formula)
        const alt = y * dz;
        const p = 1013.25 * Math.pow(1 - 2.25577e-5 * alt, 5.25588);
        
        // Estimate wet bulb (simplified)
        const tw = temp - (100 - rh) / 5;
        
        soundingData.push({
          alt: alt,
          p: p,
          t: temp,
          tw: tw,
          td: td,
          rh: rh,
          vel: vel,
          angle: angle
        });
      }
      
      console.log('saveCurrentSounding: sample data at y=0:', soundingData[0], 'at y=100:', soundingData[100], 'at y=200:', soundingData[200]);
      
      // Create text file content
      let content = "# Sounding Data Export from Simulation\n";
      content += "# Alt(m), Pressure(hPa), Temp(C), WetBulb(C), DewPoint(C), RH(%), Velocity(km/h), Angle(deg)\n";
      
      soundingData.forEach(row => {
        content += `${row.alt.toFixed(1)}, ${row.p.toFixed(1)}, ${row.t.toFixed(1)}, ${row.tw.toFixed(1)}, ${row.td.toFixed(1)}, ${row.rh.toFixed(1)}, ${row.vel.toFixed(1)}, ${row.angle.toFixed(1)}\n`;
      });
      
      // Download the file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'simulation_sounding.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Sounding saved! You can load it from the main menu using the "Load Sounding" button (:');
    },
    draw : function(simXpos, simYpos) {
      // draw graph
      // mouse positions in sim coordinates

      const columnKey = simXpos + '|' + (even ? 1 : 0);
      const reuseColumn = this._columnCacheKey === columnKey
        && this._columnCacheFrame >= frameNum - 1
        && this._columnBaseValues
        && this._columnWaterValues
        && this._columnWallValues;
      let baseTextureValues;
      let waterTextureValues;
      let wallTextureValues;
      if (reuseColumn) {
        baseTextureValues = this._columnBaseValues;
        waterTextureValues = this._columnWaterValues;
        wallTextureValues = this._columnWallValues;
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        if (!this._columnBaseValues || this._columnBaseValues.length !== 4 * sim_res_y)
          this._columnBaseValues = new Float32Array(4 * sim_res_y);
        baseTextureValues = this._columnBaseValues;
        gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues);

        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        if (!this._columnWaterValues || this._columnWaterValues.length !== 4 * sim_res_y)
          this._columnWaterValues = new Float32Array(4 * sim_res_y);
        waterTextureValues = this._columnWaterValues;
        gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);

        gl.readBuffer(gl.COLOR_ATTACHMENT2);
        if (!this._columnWallValues || this._columnWallValues.length !== 4 * sim_res_y)
          this._columnWallValues = new Int32Array(4 * sim_res_y);
        wallTextureValues = this._columnWallValues;
        gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA_INTEGER, gl.INT, wallTextureValues);
        this._columnCacheKey = columnKey;
        this._columnCacheFrame = frameNum;
      }

      let surfaceLevel = 0;
      for (let y = 0; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] !== 0) {
          surfaceLevel = y;
          break;
        }
      }

      if (this._lastGraphX !== simXpos) {
        this._windDisplaySmooth = null;
        this._capeDisplaySmooth = null;
        this._lastGraphX = simXpos;
      }

      const SOUNDING_HEADER_H = 44;
      const SOUNDING_FOOTER_H = 112;
      const SOUNDING_AXIS_PAD = 26;
      const METRICS_PANEL_W = 268;
      let plotTop = SOUNDING_HEADER_H + 6;
      let plotBottom = this.graphCanvas.height - SOUNDING_FOOTER_H - SOUNDING_AXIS_PAD;
      let plotHeight = Math.max(200, plotBottom - plotTop);
      let graphBottem = plotBottom;
      const dz = guiControls.simHeight / sim_res_y;
      if (this._railContentRight > 0) {
        const targetW = Math.ceil(this._railContentRight + 6);
        if (Math.abs(this.graphCanvas.width - targetW) > 6) {
          this.graphCanvas.width = targetW;
          this.graphCanvas.style.width = targetW + 'px';
        }
      }
      const graphCanvasW = this.graphCanvas.width;
      const graphCanvasH = this.graphCanvas.height;

      const windBarbScale = 2.5;
      let infoBoxWidth = METRICS_PANEL_W;
      const WIND_COL_SLOT_W = 88;
      const RAIL_RIGHT_PAD = 6;
      const RAIL_INNER_GAP = 22;
      const WIND_COL_EXTRA_SHIFT = 20;
      let WIND_COL_W = WIND_COL_SLOT_W;
      let infoBoxX = graphCanvasW - RAIL_RIGHT_PAD - infoBoxWidth;
      let windColLeft = infoBoxX + infoBoxWidth + RAIL_INNER_GAP + WIND_COL_EXTRA_SHIFT;
      let windBarbX = windColLeft + 14;
      const railTop = plotTop;
      const hodoReadoutGap = 10;
      const hodoPanelPad = 5;
      const HODO_LEGEND_H = 16;
      const HODO_STATS_H = 36;
      const SKEW_META_W = (guiControls.soundingShowWindBarbs || guiControls.soundingShowThetaE) ? 54 : 6;
      let skewTLeft = guiControls.soundingShowHeights ? 68 : 52;
      let skewTPlotRight = 0;
      let hodographRadius = Math.min(68, Math.max(48, Math.round(plotHeight * 0.11)));
      let hodoPanelSize = (hodographRadius + hodoPanelPad) * 2;
      let hodoBlockBottom = plotTop + hodoPanelSize + HODO_LEGEND_H + HODO_STATS_H;
      let skewTWidth = Math.min(plotHeight - 8, Math.max(240, graphBottem - skewTLeft - 10));
      let skewTRight = skewTLeft + skewTWidth;
      let hodographCx = 0;
      let hodographCy = plotTop + hodographRadius + hodoPanelPad;
      let readoutBoxY = hodoBlockBottom + hodoReadoutGap;
      let railContentRight = graphCanvasW;

      const updateSoundingLayout = () => {
        const c = this._customLayout;
        if (c && c.skewT) {
          skewTLeft = c.skewT.left;
          skewTWidth = c.skewT.width;
          skewTRight = skewTLeft + skewTWidth;
          plotTop = c.skewT.top;
          plotBottom = c.skewT.top + c.skewT.height;
          plotHeight = c.skewT.height;
          graphBottem = plotBottom;
        } else {
          skewTWidth = Math.min(plotHeight - 8, Math.max(240, graphBottem - skewTLeft - 10));
          skewTRight = skewTLeft + skewTWidth;
        }
        skewTPlotRight = skewTRight - SKEW_META_W;

        if (c && c.hodo) {
          const r = c.hodo;
          infoBoxX = r.left;
          infoBoxWidth = r.width;
          const hodoPlotH = Math.max(40, r.height - HODO_LEGEND_H - HODO_STATS_H);
          hodographRadius = Math.max(24, Math.min(120, Math.round(hodoPlotH * 0.5 - hodoPanelPad)));
          hodoPanelSize = (hodographRadius + hodoPanelPad) * 2;
          hodographCx = r.left + r.width * 0.5;
          hodographCy = r.top + hodographRadius + hodoPanelPad;
          hodoBlockBottom = r.top + r.height;
          readoutBoxY = hodoBlockBottom + hodoReadoutGap;
        } else {
          infoBoxX = skewTRight + hodoReadoutGap;
          hodographCx = infoBoxX + infoBoxWidth * 0.5;
          hodographCy = plotTop + hodographRadius + hodoPanelPad;
          readoutBoxY = plotTop + hodoPanelSize + HODO_LEGEND_H + HODO_STATS_H + hodoReadoutGap;
        }

        if (c && c.metrics) {
          infoBoxX = c.metrics.left;
          readoutBoxY = c.metrics.top;
          infoBoxWidth = c.metrics.width;
        }

        if (c && c.windCol) {
          windColLeft = c.windCol.left;
          WIND_COL_W = Math.max(48, c.windCol.width - 36);
          windBarbX = c.windCol.left + Math.min(34, Math.max(14, c.windCol.width * 0.35));
          railContentRight = c.windCol.left + c.windCol.width + RAIL_RIGHT_PAD;
        } else {
          windColLeft = infoBoxX + infoBoxWidth + RAIL_INNER_GAP + WIND_COL_EXTRA_SHIFT;
          const windSpinePad = 12;
          const windLeftRoom = this._windDisplaySmooth
            ? Math.max(14, this._windDisplaySmooth.leftExtent)
            : 16;
          windBarbX = windColLeft + Math.max(windSpinePad, windLeftRoom * 0.55);
          railContentRight = windColLeft + WIND_COL_W + RAIL_RIGHT_PAD;
        }
      };
      updateSoundingLayout();

      let layoutState = {
        SOUNDING_HEADER_H,
        SOUNDING_FOOTER_H,
        SOUNDING_AXIS_PAD,
        METRICS_PANEL_W,
        SKEW_META_W,
        plotTop,
        plotBottom,
        plotHeight,
        graphBottem,
        skewTLeft,
        skewTRight,
        skewTWidth,
        skewTPlotRight,
        infoBoxX,
        infoBoxWidth,
        hodographCx,
        hodographCy,
        hodographRadius,
        hodoPanelSize,
        hodoBlockBottom,
        readoutBoxY,
        windColLeft,
        WIND_COL_W,
        WIND_COL_SLOT_W,
        windBarbX,
        railContentRight,
        hodoReadoutGap,
        RAIL_INNER_GAP,
        RAIL_RIGHT_PAD,
        WIND_COL_EXTRA_SHIFT,
        HODO_LEGEND_H,
        HODO_STATS_H,
        hodoPanelPad,
      };
      layoutState = this.applyCustomSoundingLayout(layoutState);
      plotTop = layoutState.plotTop;
      plotBottom = layoutState.plotBottom;
      plotHeight = layoutState.plotHeight;
      graphBottem = layoutState.graphBottem;
      skewTLeft = layoutState.skewTLeft;
      skewTRight = layoutState.skewTRight;
      skewTWidth = layoutState.skewTWidth;
      skewTPlotRight = layoutState.skewTPlotRight;
      infoBoxX = layoutState.infoBoxX;
      infoBoxWidth = layoutState.infoBoxWidth;
      hodographCx = layoutState.hodographCx;
      hodographCy = layoutState.hodographCy;
      hodographRadius = layoutState.hodographRadius;
      hodoPanelSize = layoutState.hodoPanelSize;
      hodoBlockBottom = layoutState.hodoBlockBottom;
      readoutBoxY = layoutState.readoutBoxY;
      windColLeft = layoutState.windColLeft;
      WIND_COL_W = layoutState.WIND_COL_W;
      windBarbX = layoutState.windBarbX;
      railContentRight = layoutState.railContentRight;
      this._lastLayoutState = layoutState;
      if (guiControls.soundingLayoutEdit) {
        this._ensureCustomLayoutSeeded(layoutState);
      }
      this.syncLayoutRegionOverlays(layoutState);

      function T_to_Xpos(T, y) {
        const yNorm = plotHeight > 0 ? (y - plotTop) / plotHeight : 0;
        const normX = T * 0.0115 + 0.9 - yNorm * 0.8;
        const plotW = Math.max(80, skewTPlotRight - skewTLeft);
        return skewTLeft + normX * plotW;
      }
      const scrYFromSimY = (y) => map_range(y, sim_res_y, 0, plotTop, plotBottom);
      const scrYToAltM = (scrY) => map_range(scrY, plotBottom, plotTop, 0, guiControls.simHeight);
      const altMToScrY = (altM) => map_range(altM, 0, guiControls.simHeight, plotBottom, plotTop);

      var c = this.ctx;

      function integrateSegment(B0, B1, dz) {
        if (B0 >= 0 && B1 >= 0)
          return {pos: (B0 + B1) * 0.5 * dz, neg: 0};
        if (B0 <= 0 && B1 <= 0)
          return {pos: 0, neg: (B0 + B1) * 0.5 * dz};
        const factor = Math.abs(B0) / (Math.abs(B0) + Math.abs(B1));
        const zcross = factor * dz;
        if (B0 < 0) {
          return {pos: B1 * (dz - zcross) * 0.5, neg: B0 * zcross * 0.5};
        } else {
          return {pos: B0 * zcross * 0.5, neg: B1 * (dz - zcross) * 0.5};
        }
      }

      function computeParcelProfile(surfaceTempC, surfaceTdC, startIndex) {
        const parcelTemps = new Float32Array(sim_res_y);
        const mixingWater = maxWater(CtoK(surfaceTdC));
        let prevTemp = surfaceTempC;
        let prevCloudWater = 0.0;
        const dz = guiControls.simHeight / sim_res_y;
        parcelTemps.fill(NaN);
        parcelTemps[startIndex] = surfaceTempC;

        for (let y = startIndex + 1; y < sim_res_y; y++) {
          const dT = -guiControls.dryLapseRate * dz / 1000.0;
          const nextDry = prevTemp + dT;
          const cloudWater = Math.max(mixingWater - maxWater(CtoK(nextDry)), 0.0);
          const dWt = (cloudWater - prevCloudWater) * guiControls.evapHeat;
          const deltaT = dT_saturated(dT, dWt);
          const T = prevTemp + deltaT;
          parcelTemps[y] = T;
          prevTemp = T;
          prevCloudWater = Math.max(mixingWater - maxWater(CtoK(T)), 0.0);
        }

        return parcelTemps;
      }

      function buoyAtAlt(buoy, alt, startIndex) {
        const y = alt / dz;
        let y0 = Math.floor(y);
        let y1 = y0 + 1;
        if (y1 >= sim_res_y) y1 = sim_res_y - 1;
        if (y0 < startIndex) y0 = startIndex;
        if (y1 < startIndex) y1 = startIndex;
        if (y0 === y1) {
          const b = buoy[y0];
          return isNaN(b) ? 0 : b;
        }
        const t = (y - y0) / (y1 - y0);
        const b0 = buoy[y0];
        const b1 = buoy[y1];
        if (isNaN(b0) && isNaN(b1)) return 0;
        if (isNaN(b0)) return b1;
        if (isNaN(b1)) return b0;
        return b0 + (b1 - b0) * t;
      }

      function integrateBuoyLayer(buoy, altBot, altTop, mode, startIndex) {
        const minAlt = startIndex * dz;
        altBot = Math.max(altBot, minAlt);
        if (isNaN(altBot) || isNaN(altTop) || altTop <= altBot) return 0;

        const steps = Math.max(1, Math.ceil((altTop - altBot) / dz));
        const stepDz = (altTop - altBot) / steps;
        let total = 0;
        for (let i = 0; i < steps; i++) {
          const a0 = altBot + i * stepDz;
          const a1 = altBot + (i + 1) * stepDz;
          const b0 = buoyAtAlt(buoy, a0, startIndex);
          const b1 = buoyAtAlt(buoy, a1, startIndex);
          const seg = integrateSegment(b0, b1, stepDz);
          total += mode === 'pos' ? Math.max(0, seg.pos) : Math.min(0, seg.neg);
        }
        return total;
      }

      function meanLayerParcel(envTempsC, envDewC, startIndex) {
        const dz = guiControls.simHeight / sim_res_y;
        const maxLevels = Math.max(1, Math.min(sim_res_y - startIndex, Math.round(1000 / dz)));
        let sumT = 0.0;
        let sumTd = 0.0;
        for (let y = startIndex; y < startIndex + maxLevels; y++) {
          sumT += envTempsC[y];
          sumTd += envDewC[y];
        }
        const meanT = sumT / maxLevels;
        const meanTd = sumTd / maxLevels;
        return computeParcelProfile(meanT, meanTd, startIndex);
      }

      // Compute sounding stability metrics for skew-T readout
      const envTempsC = new Float32Array(sim_res_y);
      const envDewC = new Float32Array(sim_res_y);
      for (let y = 0; y < sim_res_y; y++) {
        envTempsC[y] = KtoC(potentialToRealT(baseTextureValues[4 * y + 3], y));
        envDewC[y] = KtoC(dewpoint(waterTextureValues[4 * y]));
      }
      const columnIsFluid = new Array(sim_res_y);
      for (let y = 0; y < sim_res_y; y++) {
        columnIsFluid[y] = wallTextureValues[4 * y + 1] !== 0;
      }

      const sfcWallY = surfaceLevel > 0 ? surfaceLevel - 1 : 0;
      const sfcWallType = wallTextureValues[4 * sfcWallY];
      let sfcWaterTempC = null;
      let sfcWaterLabel = null;
      if (sfcWallType === 2 || sfcWallType === 8 || sfcWallType === 9) {
        sfcWaterTempC = KtoC(baseTextureValues[4 * sfcWallY + 3]);
        sfcWaterLabel = sfcWallType === 9 ? 'Ice Temp' : 'Water Temp';
      }

      const surfaceWindSpeed = rawVelocityTo_ms(Math.sqrt(
        Math.pow(baseTextureValues[4 * surfaceLevel], 2) + Math.pow(baseTextureValues[4 * surfaceLevel + 1], 2)
      ));

      const sfcAltM = surfaceLevel * dz;
      const parcelProfile = computeParcelProfile(envTempsC[surfaceLevel], envDewC[surfaceLevel], surfaceLevel);
      const soundingMetrics = computeCAPEForColumn(
        envTempsC, envDewC, parcelProfile, surfaceLevel, columnIsFluid, sim_res_y, dz, sfcAltM);
      const sbCape = soundingMetrics.cape;
      const meanParcelProfile = meanLayerParcel(envTempsC, envDewC, surfaceLevel);
      const meanLayerMetrics = computeCAPEForColumn(
        envTempsC, envDewC, meanParcelProfile, surfaceLevel, columnIsFluid, sim_res_y, dz, sfcAltM);

      // Most Unstable CAPE: max CAPE among parcels lifted from any level in the column
      let muCape = 0;
      let muCinh = soundingMetrics.cinh;
      let muLcl = soundingMetrics.lclAlt;
      let muLfc = soundingMetrics.lfcAlt;
      let muEl = soundingMetrics.elAlt;
      let muParcelLevel = surfaceLevel;
      for (let y = surfaceLevel; y < sim_res_y - 1; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const pp = computeParcelProfile(envTempsC[y], envDewC[y], y);
        const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, columnIsFluid, sim_res_y, dz, sfcAltM);
        if (m.cape > muCape) {
          muCape = m.cape;
          muCinh = m.cinh;
          muLcl = m.lclAlt;
          muLfc = m.lfcAlt;
          muEl = m.elAlt;
          muParcelLevel = y;
        }
      }
      if (muCape < sbCape) {
        muCape = sbCape;
        muCinh = soundingMetrics.cinh;
        muLcl = soundingMetrics.lclAlt;
        muLfc = soundingMetrics.lfcAlt;
        muEl = soundingMetrics.elAlt;
        muParcelLevel = surfaceLevel;
      }
      const muParcelAgl = (muParcelLevel - surfaceLevel) * dz;

      let elevatedCape = 0;
      const elevOriginMin = surfaceLevel + Math.round(1500 / dz);
      for (let y = elevOriginMin; y < sim_res_y - 1; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const pp = computeParcelProfile(envTempsC[y], envDewC[y], y);
        const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, columnIsFluid, sim_res_y, dz, sfcAltM);
        if (m.cape > elevatedCape) elevatedCape = m.cape;
      }

      // 3CAPE: max buoyancy integral in lowest 3 km AGL among parcels lifted from lowest 3 km
      let cape3km = 0;
      const max3kmLevel = surfaceLevel + Math.round(3000 / dz);
      for (let y = surfaceLevel; y < Math.min(max3kmLevel, sim_res_y); y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const pp = computeParcelProfile(envTempsC[y], envDewC[y], y);
        const m = computeCAPEForColumn(envTempsC, envDewC, pp, y, columnIsFluid, sim_res_y, dz, sfcAltM);
        if (m.cape3km > cape3km) {
          cape3km = m.cape3km;
        }
      }

      // Lifted Index: difference between parcel temp and env temp at 500mb (~5.5km)
      let liftedIndex = NaN;
      const y500mb = surfaceLevel + Math.round(5500 / dz);
      if (y500mb < sim_res_y && wallTextureValues[4 * y500mb + 1] !== 0) {
        const parcelTemp500 = parcelProfile[y500mb];
        const envTemp500 = envTempsC[y500mb];
        if (!isNaN(parcelTemp500)) {
          liftedIndex = envTemp500 - parcelTemp500; // Positive = stable, Negative = unstable
        }
      }

      // Freezing level: lowest altitude where environmental temperature crosses 0°C
      let freezingAlt = NaN;
      for (let y = surfaceLevel; y < sim_res_y - 1; y++) {
        if (wallTextureValues[4 * y + 1] === 0 || wallTextureValues[4 * (y + 1) + 1] === 0) continue;
        const t0 = envTempsC[y];
        const t1 = envTempsC[y + 1];
        if (t0 > 0 && t1 <= 0) {
          const ratio = t0 / (t0 - t1);
          freezingAlt = (y + ratio) * dz;
          break;
        }
      }
      if (isNaN(freezingAlt) && envTempsC[surfaceLevel] <= 0) {
        freezingAlt = surfaceLevel * dz;
      }

      // Wind shear at 0-3km, 0-6km, 0-8km (bulk shear = vector difference magnitude)
      function windSpeedAtY(y) {
        const i = Math.min(y, sim_res_y - 1) * 4;
        return rawVelocityTo_ms(Math.sqrt(
          Math.pow(baseTextureValues[i], 2) + Math.pow(baseTextureValues[i + 1], 2)
        ));
      }
      function windShearToAlt(altM) {
        const targetY = surfaceLevel + Math.round(altM / dz);
        if (targetY >= sim_res_y) return 0;
        // bulk shear: find max speed change in the layer
        const surfVx = rawVelocityTo_ms(baseTextureValues[surfaceLevel * 4]);
        const surfVy = rawVelocityTo_ms(baseTextureValues[surfaceLevel * 4 + 1]);
        const topVx  = rawVelocityTo_ms(baseTextureValues[targetY * 4]);
        const topVy  = rawVelocityTo_ms(baseTextureValues[targetY * 4 + 1]);
        return Math.sqrt(Math.pow(topVx - surfVx, 2) + Math.pow(topVy - surfVy, 2));
      }
      const shear3km = windShearToAlt(3000);
      const shear6km = windShearToAlt(6000);
      const shear8km = windShearToAlt(8000);

      // Hodograph profile + storm motion (parcel/storm speed 30 km/h along 0-6km mean wind)
      const STORM_MOTION_MS = 30 / 3.6;
      const hodoPoints = [];
      for (let y = surfaceLevel; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const altM = (y - surfaceLevel) * dz;
        hodoPoints.push({
          altM,
          u: rawVelocityTo_ms(baseTextureValues[4 * y]),
          v: rawVelocityTo_ms(baseTextureValues[4 * y + 1]),
        });
      }
      function windAtAltM(altM) {
        const yT = surfaceLevel + Math.round(altM / dz);
        if (yT >= sim_res_y || wallTextureValues[4 * yT + 1] === 0) return {u: 0, v: 0};
        return {
          u: rawVelocityTo_ms(baseTextureValues[4 * yT]),
          v: rawVelocityTo_ms(baseTextureValues[4 * yT + 1]),
        };
      }
      function altToHodographColor(altM) {
        if (altM < 500) return '#FF69B4';
        if (altM < 3000) return '#FF0000';
        if (altM < 6000) return '#00CC00';
        if (altM < 9000) return '#FFFF00';
        return '#00AAFF';
      }
      let stormU = STORM_MOTION_MS;
      let stormV = 0;
      {
        let sumU = 0, sumV = 0, n = 0;
        for (const p of hodoPoints) {
          if (p.altM <= 6000) { sumU += p.u; sumV += p.v; n++; }
        }
        if (n > 0) {
          const mU = sumU / n, mV = sumV / n;
          const mSpd = Math.hypot(mU, mV);
          if (mSpd > 0.01) {
            stormU = mU / mSpd * STORM_MOTION_MS;
            stormV = mV / mSpd * STORM_MOTION_MS;
          }
        }
      }
      // Storm-relative inflow: mean SR wind in 0.5-3 km layer
      let sriU = 0, sriV = 0, sriCount = 0;
      for (const p of hodoPoints) {
        if (p.altM >= 500 && p.altM <= 3000) {
          sriU += p.u - stormU;
          sriV += p.v - stormV;
          sriCount++;
        }
      }
      if (sriCount > 0) { sriU /= sriCount; sriV /= sriCount; }
      const sriMag = Math.hypot(sriU, sriV);
      const sfcSr = windAtAltM(0);
      const sr3km = windAtAltM(3000);

      function subsampleWindNodesByAlt(points, nodeCount) {
        if (points.length <= nodeCount || nodeCount < 2) return points.slice();
        const minAlt = points[0].altM;
        const maxAlt = points[points.length - 1].altM;
        if (maxAlt <= minAlt) return [points[0]];
        const out = [points[0]];
        let j = 0;
        for (let i = 1; i < nodeCount - 1; i++) {
          const targetAlt = minAlt + (maxAlt - minAlt) * i / (nodeCount - 1);
          while (j + 1 < points.length && points[j + 1].altM < targetAlt) j++;
          const p0 = points[j];
          const p1 = points[Math.min(j + 1, points.length - 1)];
          const t = p1.altM > p0.altM ? (targetAlt - p0.altM) / (p1.altM - p0.altM) : 0;
          const pt = {
            altM: targetAlt,
            u: p0.u + (p1.u - p0.u) * t,
            v: p0.v + (p1.v - p0.v) * t,
          };
          if ('scrY' in p0 && 'scrY' in p1) {
            pt.scrY = p0.scrY + (p1.scrY - p0.scrY) * t;
          }
          out.push(pt);
        }
        out.push(points[points.length - 1]);
        return out;
      }

      // Size wind column from profile extent so barbs/profile do not clip at canvas edge
      {
        let maxWindRight = 0;
        let maxWindLeft = 0;
        for (const p of hodoPoints) {
          maxWindRight = Math.max(maxWindRight, p.u, p.u - stormU);
          maxWindLeft = Math.max(maxWindLeft, -p.u, -(p.u - stormU));
        }
        maxWindRight = Math.max(maxWindRight, sfcSr.u, sr3km.u, sfcSr.u - stormU, sr3km.u - stormU, 0);
        maxWindLeft = Math.max(maxWindLeft, -sfcSr.u, -sr3km.u, -(sfcSr.u - stormU), -(sr3km.u - stormU), 0);
        const windColRightPad = 56;
        const windColLeftPad = 16;
        const targetRightExtent = maxWindRight * windBarbScale + windColRightPad;
        const targetLeftExtent = maxWindLeft * windBarbScale + windColLeftPad;

        if (!this._windDisplaySmooth) {
          this._windDisplaySmooth = {
            rightExtent: targetRightExtent,
            leftExtent: targetLeftExtent,
            stormU: stormU,
            stormV: stormV,
            hodoMaxWind: 15,
          };
        }
        const smooth = 0.12;
        const ws = this._windDisplaySmooth;
        ws.rightExtent += (targetRightExtent - ws.rightExtent) * smooth;
        ws.leftExtent += (targetLeftExtent - ws.leftExtent) * smooth;
        ws.stormU += (stormU - ws.stormU) * smooth;
        ws.stormV += (stormV - ws.stormV) * smooth;

        WIND_COL_W = Math.max(WIND_COL_SLOT_W, Math.ceil(ws.leftExtent + ws.rightExtent));
        updateSoundingLayout();
      }

      const displayStormU = this._windDisplaySmooth.stormU;
      const displayStormV = this._windDisplaySmooth.stormV;
      const hodo2DNodeCount = Math.max(2, Math.round(guiControls.hodograph2DNodes || guiControls.hodographNodes || 30));
      const hodoProfileNodeCount = Math.max(2, Math.round(guiControls.hodographProfileNodes || guiControls.hodographNodes || 30));
      const displayHodoPoints = subsampleWindNodesByAlt(hodoPoints, hodo2DNodeCount);

      // Storm-relative helicity (SRH) - 2D rotation potential for horizontal rolls
      function calculateSRH(altM) {
        const targetY = surfaceLevel + Math.round(altM / dz);
        if (targetY >= sim_res_y) return 0;
        
        // Use storm motion as mean wind in the layer (simplified for 2D)
        let sumU = 0, count = 0;
        for (let y = surfaceLevel; y < targetY; y++) {
          if (wallTextureValues[4 * y + 1] === 0) continue;
          sumU += baseTextureValues[y * 4]; // Only horizontal component
          count++;
        }
        if (count === 0) return 0;
        const stormU = sumU / count;
        
        // Calculate 2D SRH based on vertical wind shear (rotation potential in x-y plane)
        // This measures the potential for horizontal roll circulations
        let srh = 0;
        for (let y = surfaceLevel; y < targetY - 1; y++) {
          if (wallTextureValues[4 * y + 1] === 0 || wallTextureValues[4 * (y+1) + 1] === 0) continue;
          
          const u1 = baseTextureValues[y * 4];
          const u2 = baseTextureValues[(y+1) * 4];
          
          const stormRelU1 = u1 - stormU;
          const stormRelU2 = u2 - stormU;
          
          // Vertical wind shear: change in storm-relative wind with height
          const du_dz = (stormRelU2 - stormRelU1) / dz;
          
          // Integrate storm-relative wind times vertical shear
          // This represents the circulation potential in the x-y plane
          const avgU = (stormRelU1 + stormRelU2) / 2;
          srh += avgU * du_dz * dz;
        }
        return Math.abs(srh); // Return magnitude
      }
      const srh1km = calculateSRH(1000);
      const srh3km = calculateSRH(3000);

      // Precipitable Water (integrate water vapor from surface to top)
      let pwat_mm = 0;
      for (let y = surfaceLevel; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        pwat_mm += waterTextureValues[4 * y] * dz * 0.001; // g/m3 * m -> g/m2 -> mm
      }

      // Lapse rates: 0-3km and 3-6km
      function lapseRateLayer(altBot, altTop) {
        const yBot = surfaceLevel + Math.round(altBot / dz);
        const yTop = surfaceLevel + Math.round(altTop / dz);
        if (yTop >= sim_res_y || yBot >= sim_res_y) return NaN;
        return (envTempsC[yBot] - envTempsC[yTop]) / ((altTop - altBot) / 1000);
      }
      const lapse03 = lapseRateLayer(0, 3000);
      const lapse36 = lapseRateLayer(3000, 6000);
      const lapse75 = lapseRateLayer(2500, 5500);
      const shear1km = windShearToAlt(1000);
      const wblAlt = findWetBulbZeroAlt(envTempsC, envDewC, surfaceLevel, sim_res_y, dz, wallTextureValues);
      const bunkers = computeBunkersStormMotion(hodoPoints);
      const corfidi = computeCorfidiVectors(hodoPoints);
      const ehi = computeEHI(sbCape, srh3km, shear3km);
      const ship = computeSHIP(muCape, shear6km, lapse75, muCinh);
      const scp = computeSCP(muCape, shear6km, srh3km);
      const criticalAngle = computeCriticalAngle(hodoPoints, stormU, stormV);
      const sbCinh = soundingMetrics.cinh;
      const mlCapeVal = meanLayerMetrics.cape;
      const mlCinhVal = meanLayerMetrics.cinh;

      // Dry slot: mid-level RH minimum sandwiched between moister layers (from profile, not proxies)
      function analyzeDrySlot() {
        const rhProfile = [];
        for (let y = surfaceLevel; y < sim_res_y; y++) {
          if (wallTextureValues[4 * y + 1] === 0) continue;
          const altAgl = (y - surfaceLevel) * dz;
          const tK = CtoK(envTempsC[y]);
          const rh = relativeHumd(tK, waterTextureValues[4 * y]);
          rhProfile.push({
            altAgl,
            rh,
            dewDep: envTempsC[y] - envDewC[y],
          });
        }
        if (rhProfile.length < 6) {
          return { strength: 0, minRh: 100, baseAgl: 0, topAgl: 0, depthKm: 0, rhDeficit: 0 };
        }

        const midLayers = rhProfile.filter(p => p.altAgl >= 1500 && p.altAgl <= 9000);
        if (midLayers.length === 0) {
          return { strength: 0, minRh: 100, baseAgl: 0, topAgl: 0, depthKm: 0, rhDeficit: 0 };
        }

        let minRh = 100;
        let minPt = midLayers[0];
        for (const p of midLayers) {
          if (p.rh < minRh) { minRh = p.rh; minPt = p; }
        }

        const blLayers = rhProfile.filter(p => p.altAgl <= 1500);
        const blMeanRh = blLayers.reduce((s, p) => s + p.rh, 0) / blLayers.length;
        const belowLayers = rhProfile.filter(p => p.altAgl >= minPt.altAgl - 1000 && p.altAgl < minPt.altAgl);
        const aboveLayers = rhProfile.filter(p => p.altAgl > minPt.altAgl && p.altAgl <= minPt.altAgl + 2000);
        const belowMean = belowLayers.length ? belowLayers.reduce((s, p) => s + p.rh, 0) / belowLayers.length : blMeanRh;
        const aboveMean = aboveLayers.length ? aboveLayers.reduce((s, p) => s + p.rh, 0) / aboveLayers.length : minRh;
        const surroundMean = (blMeanRh + belowMean + aboveMean) / 3;
        const rhDeficit = Math.max(0, surroundMean - minRh);

        const dryThreshold = Math.min(55, minRh + 12);
        let baseAgl = minPt.altAgl;
        let topAgl = minPt.altAgl;
        for (const p of rhProfile) {
          if (p.altAgl >= 1000 && p.rh <= dryThreshold && p.dewDep >= 12) {
            baseAgl = Math.min(baseAgl, p.altAgl);
            topAgl = Math.max(topAgl, p.altAgl);
          }
        }

        const depthKm = Math.max(0, (topAgl - baseAgl) / 1000);
        const notchScore = map_range_C(rhDeficit, 8, 40, 0, 1);
        const drynessScore = map_range_C(minRh, 45, 12, 0.2, 1);
        const depthScore = map_range_C(depthKm, 0.4, 3.5, 0.2, 1);
        const dewDepScore = map_range_C(minPt.dewDep, 12, 32, 0.2, 1);
        const strength = notchScore * drynessScore * depthScore * dewDepScore;

        return { strength, minRh, baseAgl, topAgl, depthKm, rhDeficit };
      }
      const drySlot = analyzeDrySlot();
      const moistEnv = 1 - drySlot.strength * 0.55;

      // STP (Significant Tornado Parameter) - simplified
      // STP = (MLCAPE/1500) * (ESRH/150) * ((2000-MLLCL)/1000) * (MLCINH+200)/150
      // We approximate ESRH ~ 0-3km shear * 0.5 (no hodograph), LCL from ML parcel
      const mlLcl_m = meanLayerMetrics.lclAlt || 0;
      const mlCape = meanLayerMetrics.cape;
      const mlCinh = meanLayerMetrics.cinh;
      const esrh_approx = Math.max(0, shear3km * 50); // rough proxy, prevent negative
      const stpLcl = Math.max(0, (2000 - mlLcl_m) / 1000);
      const stpCinh = Math.min(1, (mlCinh + 200) / 150);
      const stp = (mlCape / 1500) * (esrh_approx / 150) * stpLcl * stpCinh * moistEnv;

      // VTP (Violent Tornado Parameter) - simplified
      // VTP = (MUCAPE/1500) * (0-6km shear/20m/s) * (0-3km lapse/6.5) * (PWAT/1.5in)
      const vtpLapse = isNaN(lapse03) ? 0 : Math.max(0, lapse03 / 6.5);
      const vtpShear = shear6km / 20;
      const vtpPwat = pwat_mm / 38; // 38mm ~ 1.5 inch
      const vtp = (muCape / 1500) * vtpShear * vtpLapse * vtpPwat * moistEnv;

      // Fire risk calculation based on temperature, humidity, wind, and soil moisture
      let fireRisk = {label: 'Low', color: '#00FF00'};
      const surfaceTemp = envTempsC[surfaceLevel];
      const surfaceRH = relativeHumd(CtoK(surfaceTemp), waterTextureValues[4 * surfaceLevel]);
      const surfaceWind = windSpeedAtY(surfaceLevel);
      const soilMoisture = waterTextureValues[4 * surfaceLevel + 2]; // if land
      
      // Calculate fire danger index (simplified)
      let fireIndex = 0;
      if (surfaceTemp > 25) fireIndex += (surfaceTemp - 25) * 2; // Temperature contribution
      if (surfaceRH < 30) fireIndex += (30 - surfaceRH) * 1.5; // Low humidity contribution
      if (surfaceWind > 5) fireIndex += (surfaceWind - 5) * 1; // Wind contribution
      if (soilMoisture < 10) fireIndex += (10 - soilMoisture) * 0.5; // Dry soil contribution
      
      if (fireIndex < 10) {
        fireRisk = {label: 'Low', color: '#00FF00'};
      } else if (fireIndex < 25) {
        fireRisk = {label: 'Moderate', color: '#FFFF00'};
      } else if (fireIndex < 45) {
        fireRisk = {label: 'High', color: '#FF8800'};
      } else if (fireIndex < 65) {
        fireRisk = {label: 'Very High', color: '#FF4400'};
      } else {
        fireRisk = {label: 'Extreme', color: '#FF0000'};
      }

      // Generated risk category (dry slot suppresses tornadic risk, not basic TS)
      function getRisk(cape, shear6, stp_val, dryStrength) {
        const stpAdj = stp_val * (1 - dryStrength * 0.45);
        if (cape < 100 || shear6 < 3) return {label: 'None', color: '#444444'};
        if (cape < 300 || shear6 < 5) return {label: 'Thunderstorm', color: '#00AAFF'};
        if (dryStrength >= 0.55 && stpAdj < 2.5) return {label: 'Slight', color: '#FFFF00'};
        if (stpAdj >= 10 || (cape >= 5000 && shear6 >= 40 && dryStrength < 0.45)) return {label: 'High', color: '#FF00FF'};
        if (stpAdj >= 6 || (cape >= 3500 && shear6 >= 30 && dryStrength < 0.5)) return {label: 'Moderate', color: '#FF4400'};
        if (stpAdj >= 3 || (cape >= 2500 && shear6 >= 22)) return {label: 'Enhanced', color: '#FF8800'};
        if (cape >= 500 && shear6 >= 10) return {label: 'Slight', color: '#FFFF00'};
        return {label: 'Marginal', color: '#00FF88'};
      }
      const risk = getRisk(muCape, shear6km, stp, drySlot.strength);

      const altStrAgl = (m) => {
        if (!Number.isFinite(m)) return 'N/A';
        const agl = m - sfcAltM;
        if (agl < -20) return 'Sfc';
        return printAltitude(Math.round(Math.max(0, agl)));
      };
      // Barometric pressure from altitude: ISA formula, default surface = 1013.25 hPa
      const altToHpa = (alt_m) => 1013.25 * Math.pow(1.0 - 2.25577e-5 * alt_m, 5.25588);

      // Pre-compute DCAPE for hazard scoring
      let dcape = 0;
      {
        const y4km = surfaceLevel + Math.round(4000 / dz);
        const y8km = Math.min(surfaceLevel + Math.round(8000 / dz), sim_res_y - 1);
        let minThetaE = Infinity, dcapeStartY = y4km;
        for (let y = y4km; y <= y8km; y++) {
          const tK  = CtoK(envTempsC[y]);
          const thetaE = tK + 2500 * Math.max(waterTextureValues[4*y], 0) / 1004;
          if (thetaE < minThetaE) { minThetaE = thetaE; dcapeStartY = y; }
        }
        const startTk = CtoK(envTempsC[dcapeStartY]);
        let parcelTk  = startTk;
        let prevBuoy2 = 0;
        for (let y = dcapeStartY - 1; y >= surfaceLevel; y--) {
          const envTk = CtoK(envTempsC[y]);
          parcelTk += 9.8 * dz / 1000.0;
          const buoy = 9.81 * (envTk - parcelTk) / parcelTk;
          if (buoy < 0) {
            const avgBuoy = (Math.abs(buoy) + Math.abs(prevBuoy2)) / 2;
            dcape += avgBuoy * dz;
          }
          prevBuoy2 = buoy;
        }
      }

      // Pre-compute hail + lightning estimates for readouts
      const mixedPhaseKm = (!isNaN(freezingAlt) && !isNaN(muEl))
        ? Math.max(0, (muEl - freezingAlt) / 1000) : 0;
      const updraftMs = Math.sqrt(2 * Math.max(0, muCape));
      let estHailIn = 0;
      if (muCape >= 400 && !isNaN(freezingAlt) && !isNaN(muEl) && mixedPhaseKm > 0.5) {
        estHailIn = 0.08;
        estHailIn += map_range_C(muCape, 400, 2000, 0, 0.75);
        estHailIn += map_range_C(muCape, 2000, 4500, 0, 1.25);
        if (!isNaN(lapse03)) estHailIn += map_range_C(lapse03, 6.0, 8.5, 0, 0.45);
        estHailIn += map_range_C(shear6km, 8, 24, 0, 0.55);
        estHailIn += map_range_C(mixedPhaseKm, 2, 8, 0, 0.65);
        estHailIn *= map_range_C(updraftMs, 12, 42, 0.45, 1.0);
        estHailIn *= moistEnv;
      }
      let lightningFlMin = 0;
      if (muCape >= 150 && !isNaN(muLfc) && mixedPhaseKm > 0.5) {
        const lScore = map_range_C(muCape, 150, 3500, 0, 1);
        const pScore = map_range_C(pwat_mm, 8, 45, 0, 1);
        const mScore = map_range_C(mixedPhaseKm, 1.5, 9, 0, 1);
        const uScore = map_range_C(updraftMs, 8, 40, 0, 1);
        const sScore = map_range_C(shear6km, 5, 18, 0.2, 1);
        const slotScore = 1 - drySlot.strength * 0.6;
        lightningFlMin = lScore * pScore * mScore * uScore * sScore * slotScore * 38.0;
      }

      const stormTypes = computeStormTypeComposites({
        sbCape, muCape, mlCape, cape3km,
        shear3km, shear6km, shear8km,
        srh3km, pwat_mm, dcape, stp,
        lapse03, sriMag,
        muParcelAgl, elevatedCape,
        sfcAltM, muLcl,
      }, drySlot.strength);

      // Pre-compute hazards so we can size the box dynamically
      const hazards = [];
      {
        // Factor: 0 below min, ramps to 1 at full; keeps weak environments from scoring high
        function hf(v, min, moderate, full) {
          if (v < min) return 0;
          if (v >= full) return 1;
          if (v <= moderate) return map_range_C(v, min, moderate, 0.08, 0.42);
          return map_range_C(v, moderate, full, 0.42, 1);
        }

        // All factors must contribute; geometric mean + power curve keeps scores realistic
        function hazardProbability(factors, cap) {
          if (factors.length === 0) return 0;
          if (factors.some(f => f <= 0)) return 0;
          const gm = Math.pow(factors.reduce((a, b) => a * b, 1), 1 / factors.length);
          const score = Math.pow(gm, 1.55) * 100;
          return Math.min(cap, Math.round(score));
        }

        const _add = (label, color, score) => {
          if (score >= 8) hazards.push({ label, color, pct: score });
        };

        const moistF = hf(moistEnv, 0.45, 0.65, 0.88);
        const lapseN = isNaN(lapse03) ? 0 : lapse03;

        _add('PDS Tornado', '#FF00FF', hazardProbability([
          hf(stp, 2.5, 5, 10),
          hf(vtp, 1.5, 3.5, 7),
          hf(srh3km, 200, 320, 480),
          hf(muCape, 2200, 3200, 5000),
          moistF,
        ], 52));

        _add('Tornado', '#FF0066', hazardProbability([
          hf(stp, 0.8, 2, 5),
          hf(vtp, 0.6, 1.8, 4),
          hf(srh3km, 100, 200, 380),
          hf(shear3km, 10, 16, 26),
          moistF,
        ], 48));

        _add('Supercell', '#FF4400', hazardProbability([
          hf(muCape, 900, 1600, 3200),
          hf(shear6km, 14, 20, 32),
          hf(srh3km, 80, 180, 320),
          moistF,
        ], 55));

        _add('Giant Hail', '#AA00FF', hazardProbability([
          hf(muCape, 1800, 2600, 4500),
          hf(lapseN, 7.8, 8.5, 9.8),
          hf(shear6km, 18, 24, 36),
          hf(mixedPhaseKm, 3.5, 5.5, 8),
          moistF,
        ], 50));

        _add('Large Hail', '#FF8800', hazardProbability([
          hf(muCape, 1100, 1800, 3200),
          hf(lapseN, 7.0, 7.8, 9.0),
          hf(estHailIn, 0.85, 1.25, 2.2),
          moistF,
        ], 45));

        _add('Hail', '#FFCC00', hazardProbability([
          hf(muCape, 550, 1000, 2200),
          hf(lapseN, 6.2, 7.0, 8.5),
          hf(mixedPhaseKm, 1.8, 3.5, 7),
          moistF,
        ], 42));

        _add('Destructive Winds', '#FF4400', hazardProbability([
          hf(dcape, 1100, 1700, 2800),
          hf(shear6km, 20, 28, 40),
          hf(drySlot.strength, 0.35, 0.55, 0.85),
        ], 48));

        _add('Damaging Winds', '#FF8800', hazardProbability([
          hf(dcape, 650, 1000, 1800),
          hf(shear6km, 16, 22, 34),
          hf(Math.max(dcape / 1200, drySlot.strength), 0.45, 0.7, 1.0),
        ], 40));

        _add('Flooding/Heavy Rain', '#0088FF', hazardProbability([
          hf(pwat_mm, 32, 42, 58),
          hf(muCape, 350, 800, 1800),
          hf(1 - map_range_C(shear6km, 6, 18, 0, 1), 0.35, 0.55, 0.85),
          moistF,
        ], 45));

        if (muCape >= 200) {
          _add('General Thunderstorm', '#AAAAAA', hazardProbability([
            hf(muCape, 200, 500, 1400),
            hf(pwat_mm, 12, 22, 40),
          ], 38));
        }

        hazards.sort((a, b) => b.pct - a.pct);
      }

      function capeForDisplay(prev, raw) {
        if (!Number.isFinite(raw)) return Number.isFinite(prev) ? prev : 0;
        const t = Math.max(0, raw);
        const p = Number.isFinite(prev) ? Math.max(0, prev) : t;
        if (t < 80 && p > 400) return Math.round(p * 0.97 + t * 0.03);
        if (t < p * 0.12 && p > 200) return Math.round(p + (t - p) * 0.06);
        if (t > p + 400) return Math.round(p + (t - p) * 0.55);
        const alpha = guiControls.graphFixedPosition ? 0.25 : 0.4;
        return Math.round(p + (t - p) * alpha);
      }
      if (!this._capeDisplaySmooth) {
        this._capeDisplaySmooth = {
          sb: sbCape, mu: muCape, ml: mlCape, c3: cape3km,
          colX: simXpos,
        };
      }
      const cs = this._capeDisplaySmooth;
      if (cs.colX !== simXpos) {
        cs.sb = sbCape;
        cs.mu = muCape;
        cs.ml = mlCape;
        cs.c3 = cape3km;
        cs.colX = simXpos;
      } else {
        cs.sb = capeForDisplay(cs.sb, sbCape);
        cs.mu = capeForDisplay(cs.mu, muCape);
        cs.ml = capeForDisplay(cs.ml, mlCape);
        cs.c3 = capeForDisplay(cs.c3, cape3km);
      }
      function displayCapeReadout(smoothed, raw) {
        if (!Number.isFinite(raw)) return smoothed;
        if (raw < 100 && smoothed > 350) return smoothed;
        return raw;
      }
      const dispSbCape = displayCapeReadout(cs.sb, sbCape);
      const dispMlCape = displayCapeReadout(cs.ml, mlCapeVal);
      const dispMuCape = displayCapeReadout(cs.mu, muCape);

      const capeColor = (v) => v > 2500 ? '#FF4400' : v > 1000 ? '#FFAA00' : '#E8EEF2';
      const domShort = stormTypes.dominantType
        ? (stormTypes.dominantType.shortLabel || stormTypes.dominantType.label) + ' ' + stormTypes.dominantType.score + '%'
        : '—';
      const topStormTypes = stormTypes.types.filter(st => st.score >= 8).slice(0, 2);
      const topHazards = hazards.slice(0, 3);
      const obsTimeLabel = formatSoundingObsTimeLabel();
      const timeLine = formatSoundingSimTimeLabel() + (obsTimeLabel ? '  ·  ' + obsTimeLabel : '');

      const tornadoPct = Math.min(48, Math.round(
        map_range_C(stp, 0.8, 5, 6, 40) *
        map_range_C(srh3km, 80, 280, 0.35, 1) *
        map_range_C(muCape, 800, 3200, 0.35, 1) *
        (1 - drySlot.strength * 0.4)
      ));

      const panelRows = [
        { section: 'PARCEL & INSTABILITY' },
        { label: 'SBCAPE', value: Math.round(dispSbCape) + ' J/kg', color: capeColor(dispSbCape) },
        { label: 'MLCAPE', value: Math.round(dispMlCape) + ' J/kg', color: capeColor(dispMlCape) },
        { label: 'MUCAPE', value: Math.round(dispMuCape) + ' J/kg', color: capeColor(dispMuCape) },
        { label: '3CAPE', value: Math.round(cape3km) + ' J/kg', color: '#E8EEF2' },
        { label: 'SBCINH', value: Number.isFinite(sbCinh) ? Math.round(sbCinh) + ' J/kg' : 'N/A', color: sbCinh < -50 ? '#66CCFF' : '#E8EEF2' },
        { label: 'DCAPE', value: Math.round(dcape) + ' J/kg', color: dcape > 1000 ? '#FF6644' : '#E8EEF2' },
        { label: 'LI', value: isNaN(liftedIndex) ? 'N/A' : liftedIndex.toFixed(1) + ' °C', color: liftedIndex < -4 ? '#66CCFF' : '#E8EEF2' },
        { section: 'LEVELS' },
        { label: 'LCL', value: altStrAgl(soundingMetrics.lclAlt), color: '#E8EEF2' },
        { label: 'LFC', value: altStrAgl(soundingMetrics.lfcAlt), color: '#E8EEF2' },
        { label: 'EL', value: altStrAgl(soundingMetrics.elAlt), color: '#E8EEF2' },
        { label: 'FZL', value: altStrAgl(freezingAlt), color: '#E8EEF2' },
        { label: 'WBL', value: altStrAgl(wblAlt), color: '#E8EEF2' },
        { section: 'SHEAR' },
        { label: '0-1 km', value: printShear(shear1km), color: '#E8EEF2' },
        { label: '0-3 km', value: printShear(shear3km), color: '#E8EEF2' },
        { label: '0-6 km', value: printShear(shear6km), color: '#E8EEF2' },
        { label: 'Bulk', value: printShear(shear6km), color: '#E8EEF2' },
        { section: 'STORM MOTION' },
        { label: 'Bunkers R', value: formatWindDirSpd(bunkers.right.u, bunkers.right.v), color: '#E8EEF2' },
        { label: 'Bunkers L', value: formatWindDirSpd(bunkers.left.u, bunkers.left.v), color: '#E8EEF2' },
        { label: 'Corfidi DS', value: formatWindDirSpd(corfidi.down.u, corfidi.down.v), color: '#E8EEF2' },
        { label: 'Corfidi US', value: formatWindDirSpd(corfidi.up.u, corfidi.up.v), color: '#E8EEF2' },
        { section: 'STORM MODE' },
        { label: 'Mode', value: stormTypes.convMode, color: stormTypes.convModeColor },
      ];
      const stormModeBars = stormTypes.types.filter(st => st.score >= 8).slice(0, 4);
      stormModeBars.forEach(st => panelRows.push({ miniBar: true, label: st.label, shortLabel: st.shortLabel, pct: st.score, color: st.color }));
      panelRows.push({ section: 'HAZARDS' });
      panelRows.push({ label: 'Hail Size', value: printHailSize(estHailIn), color: '#FF6644' });
      panelRows.push({ label: 'Lightning', value: formatLightningEstimate(lightningFlMin), color: '#E8EEF2' });
      const windHaz = hazards.find(h => h.label.includes('Wind'));
      if (windHaz) panelRows.push({ label: 'Damaging Winds', value: windHaz.pct + '%', color: windHaz.color });
      panelRows.push({ label: 'Tornado Risk', value: risk.label + ' (' + tornadoPct + '%)', color: risk.color, highlight: true });
      panelRows.push({ section: 'INDICES' });
      panelRows.push({ label: 'EHI', value: ehi.toFixed(1), color: ehi > 2 ? '#FF6644' : '#E8EEF2' });
      panelRows.push({ label: 'STP (fixed)', value: stp.toFixed(1), color: '#E8EEF2' });
      panelRows.push({ label: 'STP (eff.)', value: (stp * (1 - drySlot.strength * 0.35)).toFixed(1), color: '#E8EEF2' });
      panelRows.push({ label: 'SHIP', value: ship.toFixed(1), color: '#E8EEF2' });
      panelRows.push({ label: 'SCP', value: scp.toFixed(1), color: '#E8EEF2' });
      panelRows.push({ label: 'Eff. SRH', value: Math.round(srh3km) + ' m²/s²', color: '#E8EEF2' });
      panelRows.push({ label: '700-500 mb', value: printLapseRate(lapse75), color: '#E8EEF2' });
      panelRows.push({ section: 'OUTLOOK' });
      panelRows.push({ label: 'Risk', value: risk.label, color: risk.color });
      panelRows.push({ label: 'Fire', value: fireRisk.label, color: fireRisk.color });

      const allHazards = this._buildAllHazardScores({
        stp, vtp, srh3km, shear3km, shear6km, muCape, lapse03, mixedPhaseKm,
        estHailIn, dcape, drySlotStrength: drySlot.strength, pwat_mm, moistEnv,
      });
      const colXSnap = Math.floor(Math.abs(mod(simXpos, sim_res_x)));
      this.storeAnalogSnapshot({
        suggestedName: this.buildAnalogSuggestedName(
          stormTypes, allHazards, risk,
          { sbCape, muCape, stp, estHailIn }, stormTypes.convMode),
        columnLabel: 'Column ' + colXSnap,
        simTimeLabel: formatSoundingSimTimeLabel(),
        obsTimeLabel: formatSoundingObsTimeLabel() || '',
        hazards: allHazards,
        indices: {
          sbCape, muCape, mlCape, cape3km, sbCinh, dcape, stp, ship, scp, ehi,
          srh3km, shear1km, shear3km, shear6km, pwat_mm, estHailIn, tornadoPct,
          liftedIndex: Number.isFinite(liftedIndex) ? liftedIndex : null,
        },
        stormTypes: stormTypes.types.map(st => ({
          key: st.key, label: st.label, shortLabel: st.shortLabel, score: st.score, color: st.color,
        })),
        convMode: stormTypes.convMode,
        risk: {label: risk.label, color: risk.color},
        profile: this._sampleSoundingProfile(
          envTempsC, envDewC, baseTextureValues, surfaceLevel, sim_res_y, dz),
      });

      this._metricsPanelRowsBase = panelRows.slice();
      this._metricsTimeLine = timeLine;

      infoBoxWidth = METRICS_PANEL_W;
      this._panelWidth = infoBoxWidth;
      updateSoundingLayout();

      function traceSkewLine(stepFn, startY, endY) {
        c.beginPath();
        let first = true;
        const step = startY >= endY ? -3 : 3;
        for (let py = startY; step < 0 ? py >= endY : py <= endY; py += step) {
          const T = stepFn(py);
          if (T == null || !Number.isFinite(T)) continue;
          const x = T_to_Xpos(T, py);
          if (x < skewTLeft || x > skewTPlotRight) continue;
          if (first) {
            c.moveTo(x, py);
            first = false;
          } else {
            c.lineTo(x, py);
          }
        }
        if (!first) c.stroke();
      }

      function drawSkewTReferenceGrid() {
        const labelMaxX = skewTPlotRight - 8;
        c.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        c.lineWidth = 1;
        c.font = '10px Arial';
        c.fillStyle = 'rgba(255, 255, 255, 0.55)';
        for (const hpa of [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150]) {
          const altM = skewAltMFromHpa(hpa);
          if (altM > guiControls.simHeight + 200) continue;
          const py = altMToScrY(altM);
          if (py < plotTop + 4 || py > plotBottom - 2) continue;
          c.beginPath();
          c.moveTo(skewTLeft, py);
          c.lineTo(skewTPlotRight, py);
          c.stroke();
          if (hpa >= 200) {
            c.fillText(hpa + ' hPa', skewTLeft + 2, py - 11);
          }
        }
        if (guiControls.soundingShowMixingRatio) {
        c.setLineDash([5, 5]);
        c.strokeStyle = 'rgba(40, 120, 55, 0.55)';
        c.lineWidth = 1;
        c.font = '9px Arial';
        c.fillStyle = 'rgba(60, 150, 80, 0.75)';
        for (const wGkg of [1, 2, 3, 4, 6, 8, 10, 15, 20]) {
          traceSkewLine((py) => {
            const altM = scrYToAltM(py);
            const hpa = skewHpaFromAltM(altM);
            return skewTempFromMixingRatioGkg(wGkg, hpa);
          }, plotBottom, plotTop);
          const labelY = altMToScrY(skewAltMFromHpa(850));
          const labelT = skewTempFromMixingRatioGkg(wGkg, 850);
          const lx = T_to_Xpos(labelT, labelY);
          if (lx > skewTLeft + 8 && lx < labelMaxX - 16) {
            c.fillText(String(wGkg), lx + 2, labelY - 4);
          }
        }
        c.setLineDash([]);
        }
        c.strokeStyle = 'rgba(220, 60, 50, 0.45)';
        c.lineWidth = 1;
        for (let T0 = -30; T0 <= 50; T0 += 10) {
          traceSkewLine((py) => {
            const altM = scrYToAltM(py);
            return T0 - guiControls.dryLapseRate * altM / 1000.0;
          }, plotBottom, plotTop);
        }
        c.setLineDash([6, 4]);
        c.strokeStyle = 'rgba(50, 200, 80, 0.5)';
        for (const T0 of [30, 20, 10, 0, -10]) {
          let T = T0;
          let prevCw = 0;
          const mixW = maxWater(CtoK(T0));
          traceSkewLine((py) => {
            if (py >= plotBottom - 2) return T0;
            const prevY = Math.min(plotBottom, py + 3);
            const dAlt = scrYToAltM(py) - scrYToAltM(prevY);
            const dTdry = -guiControls.dryLapseRate * dAlt / 1000.0;
            const nextT = T + dTdry;
            const cw = Math.max(mixW - maxWater(CtoK(nextT)), 0);
            const dWt = (cw - prevCw) * guiControls.evapHeat;
            T = T + dT_saturated(dTdry, dWt);
            prevCw = Math.max(mixW - maxWater(CtoK(T)), 0);
            return T;
          }, plotBottom, plotTop);
        }
        c.setLineDash([]);
        c.strokeStyle = 'rgba(255, 140, 40, 0.55)';
        c.lineWidth = 1;
        c.fillStyle = 'rgba(255, 180, 100, 0.85)';
        for (let T = -40.0; T <= 40.0; T += 10.0) {
          c.beginPath();
          c.moveTo(T_to_Xpos(T, plotBottom), plotBottom);
          c.lineTo(T_to_Xpos(T, plotTop), plotTop);
          c.stroke();
          if (T >= -20.0) {
            const lx = T_to_Xpos(T, plotBottom) - 18;
            if (lx > skewTLeft + 4 && lx < labelMaxX - 24) {
              c.fillText(printTemp(Math.round(T)), lx, plotBottom + 14);
            }
          }
        }
        c.beginPath();
        c.strokeStyle = 'rgba(255, 140, 40, 0.85)';
        c.lineWidth = 2;
        c.moveTo(T_to_Xpos(0, plotBottom), plotBottom);
        c.lineTo(T_to_Xpos(0, plotTop), plotTop);
        c.stroke();
      }

      function drawSkewTHeightsAndMeta() {
        if (guiControls.soundingShowHeights) {
          c.font = '9px Arial';
          c.fillStyle = 'rgba(255, 160, 60, 0.9)';
          for (const hpa of [1000, 850, 700, 500, 300, 200]) {
            const altM = skewAltMFromHpa(hpa);
            if (altM > guiControls.simHeight + 200) continue;
            const py = altMToScrY(altM);
            if (py < plotTop + 8 || py > plotBottom - 4) continue;
            const agl = Math.round(altM - sfcAltM);
            c.fillText(Math.round(agl) + ' m', skewTLeft - 44, py + 3);
          }
        }
        const metaX = skewTPlotRight + 4;
        const barbStep = Math.max(3, Math.round(80 / dz));
        if (guiControls.soundingShowWindBarbs) {
          c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          c.fillStyle = 'rgba(255, 255, 255, 0.85)';
          c.lineWidth = 1.2;
          for (let y = surfaceLevel; y < sim_res_y; y += barbStep) {
            if (wallTextureValues[4 * y + 1] === 0) continue;
            const scrY = scrYFromSimY(y);
            const u = rawVelocityTo_ms(baseTextureValues[4 * y]);
            const v = rawVelocityTo_ms(baseTextureValues[4 * y + 1]);
            drawSkewWindBarb(c, skewTPlotRight + 2, scrY, u, v);
          }
        }
        if (guiControls.soundingShowThetaE) {
          c.font = '9px monospace';
          const teStep = Math.max(4, Math.round(120 / dz));
          for (let y = surfaceLevel; y < sim_res_y; y += teStep) {
            if (wallTextureValues[4 * y + 1] === 0) continue;
            const scrY = scrYFromSimY(y);
            const te = computeThetaEC(envTempsC[y], waterTextureValues[4 * y]) - 273.15;
            c.fillStyle = te > 340 ? '#FF66CC' : te > 320 ? '#FFAA44' : 'rgba(200, 160, 220, 0.85)';
            c.fillText(Math.round(te), metaX, scrY + 3);
          }
        }
      }

      c.clearRect(0, 0, this.graphCanvas.width, this.graphCanvas.height);
      c.fillStyle = 'rgba(10, 12, 16, 0.82)';
      c.fillRect(0, 0, this.graphCanvas.width, this.graphCanvas.height);
      c.fillStyle = 'rgba(8, 10, 14, 0.5)';
      c.fillRect(skewTLeft, plotTop, skewTRight - skewTLeft, plotHeight);

      drawSkewTReferenceGrid();

      let reachedAir = false;
      c.beginPath();
      for (let y = surfaceLevel; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const potentialTemp = baseTextureValues[4 * y + 3];
        const temp = KtoC(potentialToRealT(potentialTemp, y));
        const scrYpos = scrYFromSimY(y);
        if (!reachedAir) {
          reachedAir = true;
          if (simYpos < surfaceLevel) simYpos = surfaceLevel;
          c.moveTo(T_to_Xpos(temp, scrYpos), scrYpos);
        } else {
          c.lineTo(T_to_Xpos(temp, scrYpos), scrYpos);
        }
        if (y == simYpos) {
          c.strokeStyle = '#FFF';
          c.lineWidth = 1.0;
          c.strokeRect(T_to_Xpos(temp, scrYpos), scrYpos, 10, 1);
        }
      }
      for (let y = 0; y < surfaceLevel; y++) {
        if (wallTextureValues[4 * y + 2] !== 0) continue;
        if (wallTextureValues[4 * y + 0] === 2) continue;
        const soilMoisture_mm = waterTextureValues[4 * y + 2];
        if (soilMoisture_mm > 0.) {
          const scrYpos = scrYFromSimY(y);
          c.font = '11px Arial';
          c.fillStyle = 'white';
          c.fillText('💧' + printSoilMoisture(soilMoisture_mm), skewTLeft + 4, scrYpos + 14);
        }
      }
      c.lineWidth = 2.5;
      c.strokeStyle = '#FF3333';
      c.stroke();

      if (sfcWaterTempC !== null) {
        const sfcScrY = scrYFromSimY(surfaceLevel);
        const sfcX = T_to_Xpos(sfcWaterTempC, sfcScrY);
        c.beginPath();
        c.arc(sfcX, sfcScrY, 5, 0, Math.PI * 2);
        c.fillStyle = '#406cff';
        c.fill();
        c.strokeStyle = '#FFFFFF';
        c.lineWidth = 1.5;
        c.stroke();
        c.font = 'bold 11px Arial';
        c.fillStyle = '#406cff';
        const sfcIcon = sfcWallType === 9 ? '🧊 ' : '🌊 ';
        c.fillText(sfcIcon + (sfcWaterLabel || 'Water Temp') + ' ' + printTemp(sfcWaterTempC),
          skewTLeft + 4, sfcScrY + 14);
      }

      c.beginPath();
      for (let y = surfaceLevel; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const dewPoint = KtoC(dewpoint(waterTextureValues[4 * y]));
        let envTemp = KtoC(potentialToRealT(baseTextureValues[4 * y + 3], y));
        if (guiControls.realDewPoint) {
          dewPoint = Math.min(envTemp, dewPoint);
        }
        const scrYpos = scrYFromSimY(y);
        if (y === simYpos) {
          const velocity = rawVelocityTo_ms(Math.sqrt(
            Math.pow(baseTextureValues[4 * y], 2) + Math.pow(baseTextureValues[4 * y + 1], 2)
          ));
          c.fillText('' + printAltitude(map_range(y - 1, 0, sim_res_y, 0, guiControls.simHeight)), skewTLeft + 4, scrYpos + 5);
          c.fillText('' + printVelocity(velocity), windBarbX - 45, scrYpos + 20);
          c.strokeStyle = '#FFF';
          c.lineWidth = 1.0;
          c.strokeRect(T_to_Xpos(dewPoint, scrYpos) - 10, scrYpos, 10, 1);
          c.fillText('' + printTemp(dewPoint), T_to_Xpos(dewPoint, scrYpos) - 70, scrYpos + 5);
        }
        c.lineTo(T_to_Xpos(dewPoint, scrYpos), scrYpos);
      }
      c.lineWidth = 2.5;
      c.strokeStyle = '#66CCFF';
      c.stroke();

      if (guiControls.soundingShowParcels) {
        c.beginPath();
        let sfcParcelStarted = false;
        for (let y = surfaceLevel; y < sim_res_y; y++) {
          if (!columnIsFluid[y]) continue;
          const parcelT = parcelProfile[y];
          if (isNaN(parcelT)) continue;
          const scrY = scrYFromSimY(y);
          const x = T_to_Xpos(parcelT, scrY);
          if (!sfcParcelStarted) { c.moveTo(x, scrY); sfcParcelStarted = true; }
          else c.lineTo(x, scrY);
        }
        c.lineWidth = 2.5;
        c.strokeStyle = '#33DD55';
        if (sfcParcelStarted) c.stroke();
      }

      if (guiControls.soundingShowParcels) {
        c.beginPath();
        let mlStarted = false;
        for (let y = surfaceLevel; y < sim_res_y; y++) {
          if (!columnIsFluid[y]) continue;
          const parcelT = meanParcelProfile[y];
          if (isNaN(parcelT)) continue;
          const scrY = scrYFromSimY(y);
          const x = T_to_Xpos(parcelT, scrY);
          if (!mlStarted) { c.moveTo(x, scrY); mlStarted = true; }
          else c.lineTo(x, scrY);
        }
        c.setLineDash([6, 4]);
        c.lineWidth = 2;
        c.strokeStyle = '#33DD55';
        if (mlStarted) c.stroke();
        c.setLineDash([]);
      }

      drawSkewTHeightsAndMeta();

      const parcelTempAtAlt = (altM) => {
        const y = altM / dz;
        if (y <= surfaceLevel) return parcelProfile[surfaceLevel];
        if (y >= sim_res_y - 1) return parcelProfile[sim_res_y - 1];
        let y0 = Math.floor(y);
        let y1 = y0 + 1;
        for (let tries = 0; tries < 8 && (isNaN(parcelProfile[y0]) || isNaN(parcelProfile[y1])); tries++) {
          if (isNaN(parcelProfile[y0]) && y0 > surfaceLevel) y0--;
          if (isNaN(parcelProfile[y1]) && y1 < sim_res_y - 1) y1++;
        }
        const t0 = parcelProfile[y0];
        const t1 = parcelProfile[y1];
        if (isNaN(t0) && isNaN(t1)) return NaN;
        if (isNaN(t0)) return t1;
        if (isNaN(t1)) return t0;
        return t0 + (t1 - t0) * (y - y0);
      };

      const markerLabelSlots = [];
      const drawMarker = (altitude, label, color, tempOverride) => {
        if (!Number.isFinite(altitude)) return;
        const minAlt = surfaceLevel * dz;
        const maxAlt = (sim_res_y - 1) * dz;
        const altM = Math.max(minAlt, Math.min(maxAlt, altitude));
        const yIndex = altM / dz;
        const markerScrY = scrYFromSimY(yIndex);
        if (markerScrY < plotTop - 4 || markerScrY > plotBottom + 4) return;
        const markerTemp = tempOverride !== undefined ? tempOverride : parcelTempAtAlt(altM);
        if (!Number.isFinite(markerTemp)) return;
        const xPos = T_to_Xpos(markerTemp, markerScrY);
        let labelY = markerScrY + 4;
        for (const slot of markerLabelSlots) {
          if (Math.abs(slot.scrY - markerScrY) < 11 && Math.abs(slot.labelY - labelY) < 11) {
            labelY = slot.labelY + 12;
          }
        }
        markerLabelSlots.push({scrY: markerScrY, labelY});
        c.beginPath();
        c.moveTo(xPos - 15, markerScrY);
        c.lineTo(xPos + 15, markerScrY);
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.stroke();
        c.fillStyle = color;
        c.font = 'bold 11px Arial';
        c.fillText(label, xPos - 50, labelY);
      };
      drawMarker(soundingMetrics.lclAlt, 'LCL', '#FF66FF');
      drawMarker(soundingMetrics.lfcAlt, 'LFC', '#FFDD00');
      drawMarker(soundingMetrics.elAlt, 'EL', '#FF44FF');
      drawMarker(freezingAlt, 'FZL', '#66CCFF', 0);

      // Fixed 2D hodograph + wind column (right of metrics panel)
      const surfaceScrY = scrYFromSimY(surfaceLevel);
      const topScrY = plotTop + 8;
      const topAltM = (sim_res_y - 1 - surfaceLevel) * dz;

      let maxHodoWind = STORM_MOTION_MS;
      for (const p of hodoPoints) {
        maxHodoWind = Math.max(maxHodoWind, Math.abs(p.u), Math.abs(p.v));
      }
      maxHodoWind = Math.max(maxHodoWind, Math.hypot(stormU, stormV), 1);
      {
        const ws = this._windDisplaySmooth;
        ws.hodoMaxWind += (maxHodoWind - ws.hodoMaxWind) * 0.12;
        maxHodoWind = ws.hodoMaxWind;
      }
      const hodoScale = hodographRadius / maxHodoWind;

      function toHodoPx(u, v) {
        let x = hodographCx + u * hodoScale;
        let y = hodographCy - v * hodoScale;
        const dx = x - hodographCx;
        const dy = y - hodographCy;
        const dist = Math.hypot(dx, dy);
        const maxR = hodographRadius - 3;
        if (dist > maxR && dist > 0) {
          x = hodographCx + dx / dist * maxR;
          y = hodographCy + dy / dist * maxR;
        }
        return {x, y};
      }

      const legendEntries = [
        ['0-0.5km', '#FF69B4'],
        ['0.5-3km', '#FF0000'],
        ['3-6km', '#00CC00'],
        ['6-9km', '#FFFF00'],
        ['9km+', '#00AAFF'],
      ];

      const hodoClipRight = windColLeft - 4;
      c.save();
      c.beginPath();
      c.rect(0, 0, hodoClipRight, graphCanvasH);
      c.clip();

      // Fixed hodograph panel background
      c.fillStyle = 'rgba(0, 0, 0, 0.35)';
      c.fillRect(
        hodographCx - hodographRadius - hodoPanelPad,
        hodographCy - hodographRadius - hodoPanelPad,
        hodoPanelSize,
        hodoPanelSize
      );
      c.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      c.lineWidth = 1;
      c.strokeRect(
        hodographCx - hodographRadius - hodoPanelPad,
        hodographCy - hodographRadius - hodoPanelPad,
        hodoPanelSize,
        hodoPanelSize
      );

      // Hodograph grid
      c.beginPath();
      c.arc(hodographCx, hodographCy, hodographRadius, 0, Math.PI * 2);
      c.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.moveTo(hodographCx - hodographRadius, hodographCy);
      c.lineTo(hodographCx + hodographRadius, hodographCy);
      c.moveTo(hodographCx, hodographCy - hodographRadius);
      c.lineTo(hodographCx, hodographCy + hodographRadius);
      c.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      c.stroke();

      c.font = 'bold 10px Arial';
      c.fillStyle = '#CCCCCC';
      c.fillText('Hodograph', hodographCx - 28, hodographCy - hodographRadius - hodoPanelPad + 12);

      // Storm motion marker (30 km/h along 0-6 km mean wind)
      const smPx = toHodoPx(stormU, stormV);
      c.beginPath();
      c.arc(smPx.x, smPx.y, 4, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255, 255, 255, 0.9)';
      c.fill();
      c.font = '9px Arial';
      c.fillStyle = '#CCCCCC';
      c.fillText('SM', smPx.x + 6, smPx.y - 5);

      // Altitude-colored 2D hodograph
      if (displayHodoPoints.length >= 2) {
        for (let i = 1; i < displayHodoPoints.length; i++) {
          const p0 = displayHodoPoints[i - 1];
          const p1 = displayHodoPoints[i];
          const midAlt = (p0.altM + p1.altM) * 0.5;
          const a = toHodoPx(p0.u, p0.v);
          const b = toHodoPx(p1.u, p1.v);
          c.beginPath();
          c.moveTo(a.x, a.y);
          c.lineTo(b.x, b.y);
          c.strokeStyle = altToHodographColor(midAlt);
          c.lineWidth = 3;
          c.stroke();
        }
        const topPt = displayHodoPoints[displayHodoPoints.length - 1];
        const topPx = toHodoPx(topPt.u, topPt.v);
        c.fillStyle = altToHodographColor(topPt.altM);
        c.beginPath();
        c.arc(topPx.x, topPx.y, 4, 0, Math.PI * 2);
        c.fill();
      }

      // SRI on 2D hodograph
      const sfcPx = toHodoPx(sfcSr.u, sfcSr.v);
      const km3Px = toHodoPx(sr3km.u, sr3km.v);
      c.beginPath();
      c.moveTo(smPx.x, smPx.y);
      c.lineTo(sfcPx.x, sfcPx.y);
      c.moveTo(smPx.x, smPx.y);
      c.lineTo(km3Px.x, km3Px.y);
      c.strokeStyle = '#000000';
      c.lineWidth = 2.5;
      c.stroke();

      c.font = '8px Arial';
      const legendY = hodographCy + hodographRadius + hodoPanelPad + 4;
      const legendStep = Math.floor(hodoPanelSize / legendEntries.length);
      legendEntries.forEach(([label, color], i) => {
        const lx = hodographCx - hodographRadius + i * legendStep;
        c.fillStyle = color;
        c.fillRect(lx, legendY, 10, 3);
        c.fillStyle = '#999999';
        c.fillText(label, lx, legendY + 5);
      });

      const hodoKmLabels = [
        [0, 'SFC'],
        [1000, '1 km'],
        [3000, '3 km'],
        [6000, '6 km'],
        [9000, '9 km'],
      ];
      c.font = '8px Arial';
      for (const [altKm, lbl] of hodoKmLabels) {
        const pt = windAtAltFromHodo(displayHodoPoints.length ? displayHodoPoints : hodoPoints, altKm);
        const px = toHodoPx(pt.u, pt.v);
        c.fillStyle = altToHodographColor(altKm);
        c.fillText(lbl, px.x + 5, px.y - 3);
      }
      const stormDir = Math.round((Math.atan2(-displayStormU, -displayStormV) * 180 / Math.PI + 360) % 360);
      const stormSpdKt = Math.round(msToKnots(Math.hypot(displayStormU, displayStormV)));
      c.fillStyle = '#AAB8C8';
      c.font = '9px monospace';
      const hodoStatsY = Math.min(legendY + 14, readoutBoxY - 28);
      c.font = '8px monospace';
      c.fillStyle = '#AAB8C8';
      c.fillText(
        'CA ' + criticalAngle + '°  ·  ' + stormDir + '°/' + stormSpdKt + ' kt',
        hodographCx - hodographRadius,
        hodoStatsY
      );

      c.restore();

      // Wind column: barbs + vertical profile trace (hodograph-like, same colors)
      const profilePoints = [];
      for (let y = surfaceLevel; y < sim_res_y; y++) {
        if (wallTextureValues[4 * y + 1] === 0) continue;
        const scrYpos = scrYFromSimY(y);
        const u = rawVelocityTo_ms(baseTextureValues[4 * y]);
        const v = rawVelocityTo_ms(baseTextureValues[4 * y + 1]);
        profilePoints.push({
          scrY: scrYpos,
          altM: (y - surfaceLevel) * dz,
          u, v,
        });
      }

      const displayProfilePoints = subsampleWindNodesByAlt(profilePoints, hodoProfileNodeCount);

      // Grey wind barbs behind profile trace (always full resolution)
      c.beginPath();
      for (const pt of profilePoints) {
        const barbX = windBarbX + pt.u * windBarbScale;
        c.moveTo(windBarbX, pt.scrY);
        c.lineTo(barbX, pt.scrY);
      }
      c.lineWidth = 2.0;
      c.strokeStyle = '#666666';
      c.stroke();

      // Vertical profile trace overlaid on wind vectors (storm-relative u offset)
      if (displayProfilePoints.length >= 2) {
        for (let i = 1; i < displayProfilePoints.length; i++) {
          const p0 = displayProfilePoints[i - 1];
          const p1 = displayProfilePoints[i];
          const midAlt = (p0.altM + p1.altM) * 0.5;
          const x0 = windBarbX + (p0.u - displayStormU) * windBarbScale;
          const x1 = windBarbX + (p1.u - displayStormU) * windBarbScale;
          c.beginPath();
          c.moveTo(x0, p0.scrY);
          c.lineTo(x1, p1.scrY);
          c.strokeStyle = altToHodographColor(midAlt);
          c.lineWidth = 3;
          c.stroke();
        }
      }

      // SRI on vertical profile trace
      const y3kmIdx = surfaceLevel + Math.round(3000 / dz);
      const sfcProfileY = surfaceScrY;
      const sfcProfileX = windBarbX + (sfcSr.u - displayStormU) * windBarbScale;
      const km3ProfileY = scrYFromSimY(Math.min(y3kmIdx, sim_res_y - 1));
      const km3ProfileX = windBarbX + (sr3km.u - displayStormU) * windBarbScale;
      const sriVertexX = Math.max(sfcProfileX, km3ProfileX) + 18;
      const sriVertexY = (sfcProfileY + km3ProfileY) * 0.5;
      c.beginPath();
      c.moveTo(sfcProfileX, sfcProfileY);
      c.lineTo(sriVertexX, sriVertexY);
      c.lineTo(km3ProfileX, km3ProfileY);
      c.strokeStyle = '#000000';
      c.lineWidth = 2.5;
      c.stroke();
      c.fillStyle = '#000000';
      c.font = 'bold 9px Arial';
      c.fillText('SRI', sriVertexX + 4, sriVertexY - 4);

      // Wind column labels
      c.fillStyle = '#FFFF00';
      c.font = 'bold 11px Arial';
      c.fillText(printAltitude(Math.round(topAltM)), windBarbX - 28, topScrY + 4);
      c.fillStyle = '#888888';
      c.font = '9px Arial';
      c.fillText('Profile', windBarbX - 22, topScrY + 16);

      this.saveButtonBounds = null;
      this.unlockButtonBounds = null;

      this._lastSkewTExportHelpers = {
        surfaceLevel,
        dz,
        plotTop,
        plotBottom,
        scrYFromSimY,
        T_to_Xpos,
        skewTLeft,
        skewTPlotRight,
      };
      this.drawAnalogOverlays(c, this._lastSkewTExportHelpers);

      let hoverY = Math.min(Math.max(simYpos, surfaceLevel), sim_res_y - 1);
      if (wallTextureValues[4 * hoverY + 1] === 0) {
        for (let dy = 1; dy < 40 && hoverY + dy < sim_res_y; dy++) {
          if (wallTextureValues[4 * (hoverY + dy) + 1] !== 0) {
            hoverY += dy;
            break;
          }
        }
        for (let dy = 1; dy < 40 && hoverY - dy >= surfaceLevel; dy++) {
          if (wallTextureValues[4 * (hoverY - dy) + 1] !== 0) {
            hoverY -= dy;
            break;
          }
        }
      }
      let readoutCols = [
        [['Pressure', '—', ''], ['Height', '—', '']],
        [['Temp', '—', 'temp'], ['Dewpoint', '—', 'dew'], ['θe', '—', '']],
        [['Wind Dir', '—', ''], ['Wind Spd', '—', ''], ['RH', '—', '']],
      ];
      if (wallTextureValues[4 * hoverY + 1] !== 0) {
        const hpa = altToHpa((hoverY - surfaceLevel) * dz + sfcAltM);
        const altAgl = (hoverY - surfaceLevel) * dz;
        const tC = envTempsC[hoverY];
        const tdC = envDewC[hoverY];
        const rh = relativeHumd(CtoK(tC), waterTextureValues[4 * hoverY]);
        const te = computeThetaEC(tC, waterTextureValues[4 * hoverY]) - 273.15;
        const wU = rawVelocityTo_ms(baseTextureValues[4 * hoverY]);
        const wV = rawVelocityTo_ms(baseTextureValues[4 * hoverY + 1]);
        const wDir = Math.round((Math.atan2(-wU, -wV) * 180 / Math.PI + 360) % 360);
        readoutCols = [
          [['Pressure', Math.round(hpa) + ' hPa', ''], ['Height', printAltitude(Math.round(altAgl)), '']],
          [['Temp', printTemp(tC), 'temp'], ['Dewpoint', printTemp(tdC), 'dew'], ['θe', te.toFixed(1) + ' °C', '']],
          [['Wind Dir', wDir + '°', ''], ['Wind Spd', printVelocity(Math.hypot(wU, wV)), ''],
            ['RH', Math.round(rh) + '%', '']],
        ];
      }
      const sfcThetaE = computeThetaEC(envTempsC[surfaceLevel], waterTextureValues[4 * surfaceLevel]) - 273.15;
      const parcelSfcRow = [
        ['Temp', printTemp(envTempsC[surfaceLevel]), 'temp'],
        ['Dewpoint', printTemp(envDewC[surfaceLevel]), 'dew'],
        ['θe', sfcThetaE.toFixed(1) + ' °C', ''],
      ];
      if (sfcWaterTempC !== null) {
        parcelSfcRow.push([sfcWaterLabel || 'Water Temp', printTemp(sfcWaterTempC), 'water-temp']);
      }
      const parcelCols = [
        [parcelSfcRow],
        [['LCL', altStrAgl(soundingMetrics.lclAlt), ''],
          ['LFC', altStrAgl(soundingMetrics.lfcAlt), ''],
          ['EL', altStrAgl(soundingMetrics.elAlt), '']],
        [['CAPE', Math.round(dispSbCape) + ' J/kg', ''],
          ['CINH', Number.isFinite(sbCinh) ? Math.round(sbCinh) + ' J/kg' : 'N/A', '']],
      ];
      const colX = Math.floor(Math.abs(mod(simXpos, sim_res_x)));
      const dashLayout = this.buildDashboardLayout(layoutState, graphCanvasH);
      this.updateSoundingDashboard({
        stationLabel: 'Column ' + colX + ' · ' + printDistance(map_range(colX, 0, sim_res_y, 0, guiControls.simHeight)),
        validLabel: (formatSoundingObsTimeLabel() || 'Simulation') + ' · ' + formatSoundingSimTimeLabel(),
        metricsTimeLine: timeLine,
        metricsRows: panelRows,
        readoutCols,
        parcelCols,
        layout: dashLayout,
      });

      this._railContentRight = railContentRight;
    }, // end of draw()
  };
  soundingGraph.init();

  await loadingBar.set(6, 'Setting up eventlisteners');
  // END OF GRAPH


  sim_aspect = sim_res_x / sim_res_y;

  var canvas_aspect;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  canvas_aspect = canvas.width / canvas.height;
  updateNukeOverlaySize();

  var mouseXinSim, mouseYinSim;
  var prevMouseXinSim, prevMouseYinSim;

  window.addEventListener('resize', function() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas_aspect = canvas.width / canvas.height;

    soundingGraph.resizeCanvas();

    // Render output framebuffers need to match canvas resolution
    hdrRenderScaleState = 1.0;
    createBloomFBOs(); // recreate bloom framebuffers
    createHdrFBO();    // recreate hdr framebuffer

    // Recreate radar cache texture at new screen size
    if (typeof radarTexture !== 'undefined' && radarTexture) {
      gl.bindTexture(gl.TEXTURE_2D, radarTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    updateNukeOverlaySize();
  });

  function updateNukeOverlaySize()
  {
    if (!nukeOverlayCanvas || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    nukeOverlayCanvas.width = canvas.width;
    nukeOverlayCanvas.height = canvas.height;
    nukeOverlayCanvas.style.width = rect.width + 'px';
    nukeOverlayCanvas.style.height = rect.height + 'px';
    nukeOverlayCanvas.style.left = rect.left + 'px';
    nukeOverlayCanvas.style.top = rect.top + 'px';
  }

  function drawNukeOverlay()
  {
    if (!nukeOverlayCtx || !nukeOverlayCanvas) return;
    nukeOverlayCtx.clearRect(0, 0, nukeOverlayCanvas.width, nukeOverlayCanvas.height);

    if (nukes && nukes.length > 0) {
      for (let i = 0; i < nukes.length; i++) {
        const nuke = nukes[i];
        if (nuke.isExploded()) continue;
        const sx = simToScreenX(nuke.getX());
        const sy = simToScreenY(nuke.getY());
        if (sx < -40 || sx > canvas.width + 40 || sy < -40 || sy > canvas.height + 40) continue;

        nukeOverlayCtx.save();
        nukeOverlayCtx.translate(sx, sy);
        nukeOverlayCtx.strokeStyle = 'rgba(255, 190, 0, 0.95)';
        nukeOverlayCtx.fillStyle = 'rgba(255, 100, 10, 0.95)';
        nukeOverlayCtx.lineWidth = 2;
        nukeOverlayCtx.beginPath();
        nukeOverlayCtx.moveTo(0, -10);
        nukeOverlayCtx.lineTo(-8, 10);
        nukeOverlayCtx.lineTo(8, 10);
        nukeOverlayCtx.closePath();
        nukeOverlayCtx.fill();
        nukeOverlayCtx.stroke();

        nukeOverlayCtx.beginPath();
        nukeOverlayCtx.moveTo(-5, 10);
        nukeOverlayCtx.lineTo(0, 18);
        nukeOverlayCtx.lineTo(5, 10);
        nukeOverlayCtx.strokeStyle = 'rgba(255, 255, 100, 0.85)';
        nukeOverlayCtx.lineWidth = 3;
        nukeOverlayCtx.stroke();
        nukeOverlayCtx.restore();
      }
    }

    if (displayAirmassGenerators && airmassGenerators && airmassGenerators.length > 0) {
      for (let i = 0; i < airmassGenerators.length; i++)
        airmassGenerators[i].drawRadiusOverlay(nukeOverlayCtx);
    }
  }

  function logSample()
  {
    // mouse position in sim coordinates
    var simXpos = Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
    var simYpos = Math.min(Math.max(Math.floor(mouseYinSim * sim_res_y), 0), sim_res_y - 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);                                         // basetexture
    var baseTextureValues = new Float32Array(4);
    gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues); // read single cell at mouse position

    // gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
    var waterTextureValues = new Float32Array(4);
    gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);

    gl.readBuffer(gl.COLOR_ATTACHMENT2); // walltexture
    var wallTextureValues = new Int8Array(4);
    gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues);

    gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); // lighttexture_1
    var lightTextureValues = new Float32Array(4);
    gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues);

    gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    var precipitationFeedbackTextureValues = new Float32Array(4);
    gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipitationFeedbackTextureValues);

    console.log(' ');
    console.log(' ');
    console.log('Sample at:      X: ' + simXpos + ' (' + simXpos * cellHeight / 1000 + ' km)', '  Y: ' + simYpos + ' (' + simYpos * cellHeight / 1000 + ' km)');
    console.log('BASE-----------------------------------------');
    console.log('[0] X-vel:', baseTextureValues[0]);
    console.log('[1] Y-vel:', baseTextureValues[1]);
    console.log('[2] Press:', baseTextureValues[2]);
    console.log('[3] Temp :', baseTextureValues[3].toFixed(2) + ' K   ', KtoC(baseTextureValues[3]).toFixed(2) + ' °C   ', KtoC(potentialToRealT(baseTextureValues[3], simYpos)).toFixed(2) + ' °C');

    console.log('WATER-----------------------------------------');
    console.log('[0] Water:     ', waterTextureValues[0]);
    console.log('[1] Cloudwater:', waterTextureValues[1]);
    console.log('[2] Soil Moisture / Precipitation:', waterTextureValues[2]);
    console.log('[3] Smoke/snow:', waterTextureValues[3]);

    console.log('WALL-----------------------------------------');
    console.log('[0] walltype :         ', wallTextureValues[0]);
    console.log('[1] distance:          ', wallTextureValues[1]);
    console.log('[2] Vertical distance :', wallTextureValues[2]);
    console.log('[3] Vegetation:        ', wallTextureValues[3]);

    console.log('LIGHT-----------------------------------------');
    console.log('[0] Sunlight:  ', lightTextureValues[0].toFixed(2), 'W/m²');
    console.log('[1] IR Heating:', (lightTextureValues[1] / 0.000002).toFixed(2), 'W/m²  (includes sunlight absorbed by smoke)'); // net effect of ir
    console.log('[2] IR down:   ', lightTextureValues[2].toFixed(2), 'W/m²', KtoC(IR_temp(lightTextureValues[2])).toFixed(2) + ' °C');
    console.log('[3] IR up:     ', lightTextureValues[3].toFixed(2), 'W/m²', KtoC(IR_temp(lightTextureValues[3])).toFixed(2) + ' °C');
    console.log('Net IR up:     ', (lightTextureValues[3] - lightTextureValues[2]).toFixed(2), 'W/m²');

    console.log('PRECIPITATION FEEDBACK-------------------------');
    console.log('[0] Mass:  ', precipitationFeedbackTextureValues[0]);
    console.log('[1] Heat:', precipitationFeedbackTextureValues[1]); // net effect of ir
    console.log('[2] Vapor:   ', precipitationFeedbackTextureValues[2]);
    console.log('[3] Snow deposition:     ', precipitationFeedbackTextureValues[3]);
  }


  var middleMousePressed = false;
  var leftMousePressed = false;
  var prevMouseX = 0;
  var prevMouseY = 0;
  var mouseX = 0;
  var mouseY = 0;
  var ctrlPressed = false;
  var rightCtrlPressed = false;
  var bPressed = false;
  var lastDrawInputType = -1;
  var leftPressed = false;
  var downPressed = false;
  var rightPressed = false;
  var upPressed = false;
  var plusPressed = false;
  var minusPressed = false;
  var zPressed = false;

  // ========================= Keybind System =========================
  const KEYBIND_STORAGE_KEY = 'weatherSandboxKeybinds_v1';
  let keybindBindings = {};
  let keybindCodeToDown = new Map();
  let keybindCodeToUp = new Map();
  let keybindEditorCapturing = false;
  let keybindEditorCaptureActionId = null;
  let refreshKeybindEditorList = null;

  const KEYBIND_DEFINITIONS = [
    { id: 'pause', name: 'Toggle pause', category: 'Simulation', defaultCode: 'Space',
      onDown() { guiControls.paused = !guiControls.paused; handlePause(); } },
    { id: 'showDrops', name: 'Toggle precipitation drops', category: 'Simulation', defaultCode: 'KeyD',
      onDown() { guiControls.showDrops = !guiControls.showDrops; } },
    { id: 'brushResizeHold', name: 'Hold to resize brush with scroll', category: 'Tools', defaultCode: 'KeyB',
      onDown() {
        bPressed = true;
        if (new Date().getTime() - lastBpressTime < 300 && guiControls.tool != 'TOOL_NONE')
          guiControls.wholeWidth = !guiControls.wholeWidth;
      },
      onUp() { bPressed = false; lastBpressTime = new Date().getTime(); } },
    { id: 'toggleCamFollow', name: 'Toggle camera follow (airplane)', category: 'Airplane', defaultCode: null,
      onDown() { airplane.toggleCamFollow(); } },
    { id: 'displayTempChange', name: 'Temperature change display', category: 'Display', defaultCode: 'KeyJ',
      onDown() { guiControls.displayMode = 'DISP_TEMPERATURE_CHANGE'; } },
    { id: 'resetView', name: 'Reset camera view', category: 'Camera', defaultCode: 'KeyV',
      onDown() { cam.center(); } },
    { id: 'toggleGraph', name: 'Toggle sounding graph', category: 'Graph & UI', defaultCode: 'KeyG',
      onDown() {
        guiControls.showGraph = !guiControls.showGraph;
        if (guiControls.showGraph)
          guiControls.graphFixedPosition = false;
        else
          guiControls.graphFixedPosition = false;
        hideOrShowGraph();
      } },
    { id: 'toggleVectorField', name: 'Toggle vector field overlay', category: 'Display', defaultCode: 'Tab',
      preventDefault: true,
      onDown() { guiControls.enableVectorField = !guiControls.enableVectorField; } },
    { id: 'toggleRadarOverlay', name: 'Toggle radar on realistic view', category: 'Radar', defaultCode: 'KeyS',
      onDown() { guiControls.radarOverlay = !guiControls.radarOverlay; } },
    { id: 'displayRisk', name: 'Risk display mode', category: 'Display', defaultCode: 'KeyZ',
      onDown() { guiControls.displayMode = 'DISP_RISK'; },
      onUp() { zPressed = false; } },
    { id: 'logDroplets', name: 'Log droplets / toggle follow', category: 'Simulation', defaultCode: 'KeyX',
      onDown() { logDropletsAndToggleFollow(); } },
    { id: 'airplaneOrDirection', name: 'Airplane mode / change direction', category: 'Airplane', defaultCode: 'KeyA',
      onDown(e) {
        if (airplaneMode)
          airplane.changeDirection();
        else if (!SETUP_MODE)
          airplane.enableAirplaneMode(e.getModifierState('CapsLock'));
      } },
    { id: 'airplaneAutopilot', name: 'Airplane autopilot (Caps Lock state)', category: 'Airplane', defaultCode: 'CapsLock',
      onDown(e) { if (airplaneMode) airplane.setAutopilot(e.getModifierState('CapsLock')); } },
    { id: 'toggleGear', name: 'Toggle landing gear', category: 'Airplane', defaultCode: 'ShiftLeft',
      onDown() { airplane.toggleGear(); } },
    { id: 'cycleRadarBack', name: 'Cycle radar products backward', category: 'Radar', defaultCode: 'Slash',
      preventDefault: true,
      onDown() { cycleRadarProducts(-1); } },
    { id: 'cycleRadarForward', name: 'Cycle radar products forward', category: 'Radar', defaultCode: 'Enter',
      preventDefault: true,
      onDown() { cycleRadarProducts(1); } },
    { id: 'displayHumidity', name: 'Humidity display', category: 'Display', defaultCode: 'KeyC',
      onDown() { guiControls.displayMode = 'DISP_HUMD'; } },
    { id: 'displayTemperature', name: 'Temperature display', category: 'Display', defaultCode: 'Digit1',
      onDown() { guiControls.displayMode = 'DISP_TEMPERATURE'; } },
    { id: 'displayWater', name: 'Water vapor display', category: 'Display', defaultCode: 'Digit2',
      onDown() { guiControls.displayMode = 'DISP_WATER'; } },
    { id: 'displayReal', name: 'Realistic display', category: 'Display', defaultCode: 'Digit3',
      onDown() { guiControls.displayMode = 'DISP_REAL'; } },
    { id: 'displayHoriVel', name: 'Horizontal velocity display', category: 'Display', defaultCode: 'Digit4',
      onDown() { guiControls.displayMode = 'DISP_HORIVEL'; } },
    { id: 'displayVertVel', name: 'Vertical velocity display', category: 'Display', defaultCode: 'Digit5',
      onDown() { guiControls.displayMode = 'DISP_VERTVEL'; } },
    { id: 'displayIrHeating', name: 'IR heating display', category: 'Display', defaultCode: 'Digit6',
      onDown() { guiControls.displayMode = 'DISP_IRHEATING'; } },
    { id: 'displayIrDown', name: 'IR downwelling display', category: 'Display', defaultCode: 'Digit7',
      onDown() { guiControls.displayMode = 'DISP_IRDOWNTEMP'; } },
    { id: 'displayIrUp', name: 'IR upwelling display', category: 'Display', defaultCode: 'Digit8',
      onDown() { guiControls.displayMode = 'DISP_IRUPTEMP'; } },
    { id: 'displayPrecipMass', name: 'Precipitation mass feedback display', category: 'Display', defaultCode: 'Digit9',
      onDown() { guiControls.displayMode = 'DISP_PRECIPFEEDBACK_MASS'; } },
    { id: 'displayPrecipHeat', name: 'Precipitation heat feedback display', category: 'Display', defaultCode: 'Digit0',
      onDown() { guiControls.displayMode = 'DISP_PRECIPFEEDBACK_HEAT'; } },
    { id: 'displayPressure', name: 'Pressure display', category: 'Display', defaultCode: 'Backquote',
      onDown() { guiControls.displayMode = 'DISP_PRESSURE'; } },
    { id: 'displayAirQuality', name: 'Air quality display', category: 'Display', defaultCode: 'KeyK',
      onDown() { guiControls.displayMode = 'DISP_AIRQUALITY'; } },
    { id: 'displayCharge', name: 'Charge display', category: 'Display', defaultCode: 'Backspace',
      onDown() { guiControls.displayMode = 'DISP_CHARGE'; } },
    { id: 'panLeft', name: 'Pan camera left', category: 'Camera', defaultCode: 'ArrowLeft',
      onDown() { leftPressed = true; }, onUp() { leftPressed = false; } },
    { id: 'panUp', name: 'Pan camera up / airplane up', category: 'Camera', defaultCode: 'ArrowUp',
      onDown() { if (!upPressed) airplane.onUpPressed(); upPressed = true; },
      onUp() { upPressed = false; } },
    { id: 'panRight', name: 'Pan camera right', category: 'Camera', defaultCode: 'ArrowRight',
      onDown() { rightPressed = true; }, onUp() { rightPressed = false; } },
    { id: 'panDown', name: 'Pan camera down / airplane down', category: 'Camera', defaultCode: 'ArrowDown',
      onDown() { if (!downPressed) airplane.onDownPressed(); downPressed = true; },
      onUp() { downPressed = false; } },
    { id: 'zoomIn', name: 'Zoom in', category: 'Camera', defaultCode: 'Equal', preventDefault: true,
      onDown() { plusPressed = true; }, onUp() { plusPressed = false; } },
    { id: 'zoomOut', name: 'Zoom out', category: 'Camera', defaultCode: 'Minus', preventDefault: true,
      onDown() { minusPressed = true; }, onUp() { minusPressed = false; } },
    { id: 'clearTool', name: 'Clear tool / exit airplane mode', category: 'Tools', defaultCode: 'Escape',
      onDown() {
        if (guiControls.tool == 'TOOL_NONE' && airplaneMode && confirm('Exit airplane mode?'))
          airplane.disableAirplaneMode();
        else {
          guiControls.tool = 'TOOL_NONE';
          guiControls.wholeWidth = false;
        }
      } },
    { id: 'toolTemperature', name: 'Tool: temperature', category: 'Tools', defaultCode: 'KeyQ',
      onDown() { guiControls.tool = 'TOOL_TEMPERATURE'; } },
    { id: 'toolWater', name: 'Tool: water', category: 'Tools', defaultCode: 'KeyW',
      onDown() { guiControls.tool = 'TOOL_WATER'; } },
    { id: 'toolWallLand', name: 'Tool: land wall', category: 'Tools', defaultCode: 'KeyE',
      onDown() { guiControls.tool = 'TOOL_WALL_LAND'; } },
    { id: 'toolWallFresh', name: 'Tool: fresh water / lake', category: 'Tools', defaultCode: 'KeyR',
      onDown() { guiControls.tool = 'TOOL_WALL_FRESH'; } },
    { id: 'toolWallSea', name: 'Tool: salt water / ocean', category: 'Tools',
      onDown() { guiControls.tool = 'TOOL_WALL_SEA'; } },
    { id: 'toolWallIceSheet', name: 'Tool: ice sheet', category: 'Tools',
      onDown() { guiControls.tool = 'TOOL_WALL_ICE_SHEET'; } },
    { id: 'toolWallIceCap', name: 'Tool: ice cap / glacier', category: 'Tools',
      onDown() { guiControls.tool = 'TOOL_WALL_ICE_CAP'; } },
    { id: 'toolWallFire', name: 'Tool: fire wall', category: 'Tools', defaultCode: 'KeyT',
      onDown() { guiControls.tool = 'TOOL_WALL_FIRE'; } },
    { id: 'toolSmoke', name: 'Tool: smoke', category: 'Tools', defaultCode: 'KeyY',
      onDown() { guiControls.tool = 'TOOL_SMOKE'; } },
    { id: 'toolWallMoist', name: 'Tool: moist wall', category: 'Tools', defaultCode: 'KeyU',
      onDown() { guiControls.tool = 'TOOL_WALL_MOIST'; } },
    { id: 'toolVegetation', name: 'Tool: vegetation', category: 'Tools', defaultCode: 'KeyI',
      onDown() { guiControls.tool = 'TOOL_VEGETATION'; } },
    { id: 'toolWallSnow', name: 'Tool: snow wall', category: 'Tools', defaultCode: 'KeyO',
      onDown() { guiControls.tool = 'TOOL_WALL_SNOW'; } },
    { id: 'toolWind', name: 'Tool: wind', category: 'Tools', defaultCode: 'KeyP',
      onDown() { guiControls.tool = 'TOOL_WIND'; } },
    { id: 'toolCharge', name: 'Tool: charge', category: 'Tools', defaultCode: 'Semicolon',
      onDown() { guiControls.tool = 'TOOL_CHARGE'; } },
    { id: 'toggleInvertTool', name: 'Toggle invert tool (charge direction)', category: 'Tools', defaultCode: 'Quote',
      onDown() { guiControls.invertTool = !guiControls.invertTool; } },
    { id: 'toolWallUrban', name: 'Tool: urban wall', category: 'Tools', defaultCode: 'BracketLeft',
      onDown() { guiControls.tool = 'TOOL_WALL_URBAN'; } },
    { id: 'toolWallSuburban', name: 'Tool: suburban wall', category: 'Tools', defaultCode: 'KeyH',
      onDown() { guiControls.tool = 'TOOL_WALL_SUBURBAN'; } },
    { id: 'toolWallRunway', name: 'Tool: runway wall', category: 'Tools', defaultCode: 'BracketRight',
      onDown() { guiControls.tool = 'TOOL_WALL_RUNWAY'; } },
    { id: 'toolWallIndustrial', name: 'Tool: industrial wall', category: 'Tools', defaultCode: 'Backslash',
      onDown() { guiControls.tool = 'TOOL_WALL_INDUSTRIAL'; } },
    { id: 'periodAction', name: 'Radar display / airplane brakes', category: 'Airplane', defaultCode: 'Period',
      onDown() {
        if (airplaneMode)
          airplane.setBrakes(true);
        else
          guiControls.displayMode = 'DISP_RADAR';
      },
      onUp() { airplane.setBrakes(false); } },
    { id: 'toolStation', name: 'Tool: weather station', category: 'Tools', defaultCode: 'KeyM',
      onDown() {
        guiControls.tool = 'TOOL_STATION';
        displayWeatherStations = true;
        for (let i = 0; i < weatherStations.length; i++)
          weatherStations[i].setHidden(false);
      } },
    { id: 'toolMarker', name: 'Tool: marker', category: 'Tools', defaultCode: 'KeyN',
      onDown() { guiControls.tool = 'TOOL_MARKER'; } },
    { id: 'reloadSimulation', name: 'Reload simulation', category: 'Simulation', defaultCode: 'KeyL',
      onDown() {
        if (new Date() - lastSaveTime > 120000)
          if (!confirm('Are you sure you want to reload without saving?'))
            return;
        if (initialRainDrops) {
          setupPrecipitationBuffers();
          setupTextures();
          gl.bindVertexArray(fluidVao);
        }
      } },
    { id: 'iterPerFrameUp', name: 'Increase iterations per frame', category: 'Performance', defaultCode: 'PageUp',
      onDown() { adjIterPerFrame(1); guiControls.auto_IterPerFrame = false; } },
    { id: 'iterPerFrameDown', name: 'Decrease iterations per frame', category: 'Performance', defaultCode: 'PageDown',
      onDown() { adjIterPerFrame(-1); guiControls.auto_IterPerFrame = false; } },
    { id: 'iterPerFrameAuto', name: 'Auto iterations per frame', category: 'Performance', defaultCode: 'End',
      onDown() { guiControls.auto_IterPerFrame = true; } },
    { id: 'iterPerFrameReset', name: 'Reset iterations per frame to 1', category: 'Performance', defaultCode: 'Home',
      onDown() { guiControls.auto_IterPerFrame = false; guiControls.IterPerFrame = 1; } },
    { id: 'toggleGui', name: 'Show / hide settings GUI', category: 'Graph & UI', defaultCode: 'KeyH',
      onDown() {
        if (typeof dat !== 'undefined' && dat.GUI && dat.GUI.toggleHide)
          dat.GUI.toggleHide();
      } },
    { id: 'toggleReadoutCursor', name: 'Toggle cursor readout', category: 'Graph & UI', defaultCode: null,
      onDown() { guiControls.readoutCursor = !guiControls.readoutCursor; } },
    { id: 'toggleSoundingFreeze', name: 'Toggle freeze sounding graph', category: 'Graph & UI', defaultCode: 'KeyF',
      onDown() { toggleSoundingFreeze(); } },
    { id: 'graphUnfreeze', name: 'Unfreeze sounding graph (follow cursor)', category: 'Graph & UI', defaultCode: null,
      onDown() { guiControls.graphFixedPosition = false; } },
    { id: 'openAllRadarMenus', name: 'Open all radar menus', category: 'Radar', defaultCode: null,
      onDown() {
        for (let i = 0; i < radars.length; i++) {
          if (radars[i].getMenuDiv && radars[i].getMenuDiv().style.display === 'none')
            radars[i].toggleMenu();
        }
      } },
    { id: 'airplaneToggleEngine', name: 'Toggle airplane engine', category: 'Airplane', defaultCode: null,
      onDown() { airplane.toggleEngine(); } },
    { id: 'toolRadar', name: 'Tool: radar tower', category: 'Tools', defaultCode: null,
      onDown() { guiControls.tool = 'TOOL_RADAR'; } },
    { id: 'toolAirmass', name: 'Tool: airmass generator', category: 'Tools', defaultCode: null,
      onDown() { guiControls.tool = 'TOOL_AIRMASS'; } },
    { id: 'toolNuke', name: 'Tool: nuke', category: 'Tools', defaultCode: null,
      onDown() { guiControls.tool = 'TOOL_NUKE'; } },
    { id: 'displayPrecipVapor', name: 'Precipitation vapor feedback display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_PRECIPFEEDBACK_VAPOR'; } },
    { id: 'displayPrecipRain', name: 'Rain deposition display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_PRECIPFEEDBACK_RAIN'; } },
    { id: 'displayPrecipSnow', name: 'Snow deposition display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_PRECIPFEEDBACK_SNOW'; } },
    { id: 'displaySoilMoisture', name: 'Soil moisture display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_SOIL_MOISTURE'; } },
    { id: 'displayCurl', name: 'Curl display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_CURL'; } },
    { id: 'displayRadarComposite', name: 'Composite radar display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_RADAR_COMPOSITE'; } },
    { id: 'displayRadarWorld', name: 'World radar display', category: 'Display', defaultCode: null,
      onDown() { guiControls.displayMode = 'DISP_RADAR_WORLD'; } },
  ];

  for (const cfg of SOUNDING_VIEW_CONFIGS) {
    KEYBIND_DEFINITIONS.push({
      id: 'sounding_' + cfg.mode,
      name: 'Sounding: ' + cfg.label,
      category: 'Sounding Views',
      defaultCode: null,
      onDown() { guiControls.displayMode = cfg.mode; },
    });
  }

  for (const cfg of DROPLET_VIEW_CONFIGS) {
    KEYBIND_DEFINITIONS.push({
      id: 'dropletView_' + cfg.mode,
      name: cfg.label + ' display',
      category: 'Display',
      defaultCode: null,
      onDown() { guiControls.displayMode = cfg.mode; },
    });
  }

  function formatKeybindCode(code)
  {
    if (!code)
      return '(none)';
    if (code.startsWith('Digit'))
      return code.slice(5);
    if (code.startsWith('Key'))
      return code.slice(3);
    const labels = {
      Space: 'Space', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc', Backspace: 'Backspace',
      Backquote: '`', Slash: '/', Backslash: '\\', Period: '.', Comma: ',',
      Semicolon: ';', Quote: '\'',
      BracketLeft: '[', BracketRight: ']', Equal: '+ / =', Minus: '-',
      ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
      ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
      CapsLock: 'Caps Lock', PageUp: 'Page Up', PageDown: 'Page Down', Home: 'Home', End: 'End',
    };
    return labels[code] || code;
  }

  function getKeybindDefinition(id)
  {
    return KEYBIND_DEFINITIONS.find(d => d.id === id);
  }

  function loadKeybindBindings()
  {
    let saved = null;
    try {
      const raw = localStorage.getItem(KEYBIND_STORAGE_KEY);
      if (raw)
        saved = JSON.parse(raw);
    } catch (e) {
      console.warn('Could not load keybinds:', e);
    }
    keybindBindings = {};
    for (const def of KEYBIND_DEFINITIONS) {
      const val = saved && Object.prototype.hasOwnProperty.call(saved, def.id)
        ? saved[def.id]
        : def.defaultCode;
      keybindBindings[def.id] = val || null;
    }
    rebuildKeybindMaps();
  }

  function saveKeybindBindings()
  {
    try {
      localStorage.setItem(KEYBIND_STORAGE_KEY, JSON.stringify(keybindBindings));
    } catch (e) {
      console.warn('Could not save keybinds:', e);
    }
  }

  function rebuildKeybindMaps()
  {
    keybindCodeToDown = new Map();
    keybindCodeToUp = new Map();
    for (const def of KEYBIND_DEFINITIONS) {
      const code = keybindBindings[def.id];
      if (!code)
        continue;
      if (def.onDown) {
        if (!keybindCodeToDown.has(code))
          keybindCodeToDown.set(code, []);
        keybindCodeToDown.get(code).push(def);
      }
      if (def.onUp) {
        if (!keybindCodeToUp.has(code))
          keybindCodeToUp.set(code, []);
        keybindCodeToUp.get(code).push(def);
      }
    }
  }

  function setKeybindForAction(actionId, code)
  {
    if (!getKeybindDefinition(actionId))
      return;
    keybindBindings[actionId] = code || null;
    rebuildKeybindMaps();
    saveKeybindBindings();
  }

  function resetKeybindsToDefaults()
  {
    for (const def of KEYBIND_DEFINITIONS)
      keybindBindings[def.id] = def.defaultCode || null;
    rebuildKeybindMaps();
    saveKeybindBindings();
  }

  function getKeybindConflicts()
  {
    const codeToIds = new Map();
    for (const def of KEYBIND_DEFINITIONS) {
      const code = keybindBindings[def.id];
      if (!code)
        continue;
      if (!codeToIds.has(code))
        codeToIds.set(code, []);
      codeToIds.get(code).push(def.id);
    }
    const conflicts = [];
    for (const [code, ids] of codeToIds) {
      if (ids.length > 1)
        conflicts.push({ code, ids });
    }
    return conflicts;
  }

  function resolveKeybindDefs(map, code)
  {
    let defs = map.get(code);
    if (!defs && code === 'NumpadAdd')
      defs = map.get('Equal');
    if (!defs && code === 'NumpadSubtract')
      defs = map.get('Minus');
    if (!defs && code === 'NumpadEnter')
      defs = map.get('Enter');
    if (!defs && code === 'NumpadDivide')
      defs = map.get('Slash');
    return defs;
  }

  function handleKeybindKeydown(event)
  {
    const defs = resolveKeybindDefs(keybindCodeToDown, event.code);
    if (!defs)
      return;
    for (const def of defs) {
      if (def.preventDefault)
        event.preventDefault();
      def.onDown(event);
    }
  }

  function handleKeybindKeyup(event)
  {
    const defs = resolveKeybindDefs(keybindCodeToUp, event.code);
    if (!defs)
      return;
    for (const def of defs) {
      if (def.preventDefault)
        event.preventDefault();
      def.onUp(event);
    }
  }

  loadKeybindBindings();
  // ========================= End Keybind System =========================


  // EVENT LISTENERS

  addEventListener('beforeunload', (event) => {
    if (new Date() - lastSaveTime > 120000) { // more than 120 seconds
      event.preventDefault();
      // custom message not showing for some reason
      confirm('Are you sure you want to quit without saving?');
      event.returnValue = 0; // Google Chrome requires returnValue to be set.
    }
  });

  window.addEventListener('wheel', function(event) {
    var delta = 0.1;
    if (event.deltaY > 0)
      delta *= -1;
    if (typeof lastWheel == 'undefined')
      lastWheel = 0; // init static variable
    const now = new Date().getTime();

    if (bPressed) {
      guiControls.brushSize *= 1.0 + delta * 1.0;
      if (guiControls.brushSize < 1)
        guiControls.brushSize = 1;
      else if (guiControls.brushSize > 200)
        guiControls.brushSize = 200;
    } else {
      if (now - lastWheel > 20) {
        // change zoom
        lastWheel = now;

        cam.zoomAtMousePos(delta);
      }
    }
  });

  window.addEventListener('mousemove', function(event) {
    var rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;

    if (!((guiControls.tool == 'TOOL_WALL_FRESH' || guiControls.tool == 'TOOL_WALL_SEA') && leftMousePressed)) // lock y pos while drawing water
      mouseY = event.clientY - rect.top;

    if (middleMousePressed) {
      cam.changeViewXpos(((mouseX - prevMouseX) / cam.curZoom / canvas.width) * 2.0);
      cam.changeViewYpos(-((mouseY - prevMouseY) / cam.curZoom / canvas.width) * 2.0);
      prevMouseX = mouseX;
      prevMouseY = mouseY;
    }

    if (guiControls.readoutCursor && !SETUP_MODE) {
      updateCursorReadout(event);
    }
  });

  canvas.addEventListener('mousedown', function(e) { mouseDownEvent(e); });
  graphCanvas.addEventListener('mousedown', function(e) { mouseDownEvent(e); });

  function updateCursorReadout(event)
  {
    if (!guiControls.readoutCursor || SETUP_MODE) return;

    let simXpos = clamp(Math.floor(mouseXinSim * sim_res_x), 0, sim_res_x - 1);
    let simYpos = clamp(Math.floor(mouseYinSim * sim_res_y), 0, sim_res_y - 1);

    let readoutText = '';
    let unit = '';

    switch (guiControls.displayMode) {
      case 'DISP_TEMPERATURE':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let T = potentialToRealT(baseTextureValues[3], simYpos);
        readoutText = KtoC(T).toFixed(1);
        unit = '°C';
        break;

      case 'DISP_WATER':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        var waterTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);
        let dp = KtoC(dewpoint(waterTextureValues[0]));
        let rh = relativeHumd(KtoC(potentialToRealT(waterTextureValues[3], simYpos)), waterTextureValues[0]);
        rh = Math.max(0, Math.min(rh, 100)); // Safety clamp to ensure RH is between 0 and 100%
        readoutText = `DP: ${dp.toFixed(1)}°C\nRH: ${rh.toFixed(1)}%`;
        unit = '';
        break;

      case 'DISP_HUMD':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        var waterTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let rh_cursor = relativeHumd(KtoC(potentialToRealT(baseTextureValues[3], simYpos)), waterTextureValues[0]);
        rh_cursor = Math.max(0, Math.min(rh_cursor, 100)); // Safety clamp
        readoutText = rh_cursor.toFixed(1);
        unit = '% RH';
        break;

      case 'DISP_HORIVEL':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let hVel = rawVelocityTo_ms(Math.sqrt(Math.pow(baseTextureValues[0], 2) + Math.pow(baseTextureValues[1], 2)));
        readoutText = hVel.toFixed(1);
        unit = 'm/s';
        break;

      case 'DISP_VERTVEL':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let vVel = rawVelocityTo_ms(baseTextureValues[2]);
        readoutText = vVel.toFixed(1);
        unit = 'm/s';
        break;

      case 'DISP_IRHEATING':
        gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var lightTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues);
        let irHeat = lightTextureValues[2] - lightTextureValues[3];
        readoutText = irHeat.toFixed(2);
        unit = 'K/day';
        break;

      case 'DISP_IRDOWNTEMP':
        gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var lightTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues);
        let irDown = lightTextureValues[2];
        readoutText = KtoC(irDown).toFixed(1);
        unit = '°C';
        break;

      case 'DISP_IRUPTEMP':
        gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var lightTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, lightTextureValues);
        let irUp = lightTextureValues[3];
        readoutText = KtoC(irUp).toFixed(1);
        unit = '°C';
        break;

      case 'DISP_TEMPERATURE_CHANGE':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let tempChange = baseTextureValues[3] * 100.0;
        readoutText = tempChange.toFixed(2);
        unit = '°C/10min';
        break;

      case 'DISP_PRECIPFEEDBACK_MASS':
        gl.bindFramebuffer(gl.FRAMEBUFFER, precipFeedbackFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var precipValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipValues);
        readoutText = precipValues[0].toFixed(3);
        unit = 'kg/m²';
        break;

      case 'DISP_PRECIPFEEDBACK_HEAT':
        gl.bindFramebuffer(gl.FRAMEBUFFER, precipFeedbackFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        var precipValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipValues);
        readoutText = precipValues[0].toFixed(2);
        unit = 'K/h';
        break;

      case 'DISP_PRECIPFEEDBACK_VAPOR':
        gl.bindFramebuffer(gl.FRAMEBUFFER, precipFeedbackFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT2);
        var precipValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipValues);
        readoutText = precipValues[0].toFixed(3);
        unit = 'kg/m²/h';
        break;

      case 'DISP_PRECIPFEEDBACK_RAIN':
        gl.bindFramebuffer(gl.FRAMEBUFFER, precipFeedbackFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT3);
        var precipValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipValues);
        readoutText = precipValues[0].toFixed(3);
        unit = 'mm/h';
        break;

      case 'DISP_PRECIPFEEDBACK_SNOW':
        gl.bindFramebuffer(gl.FRAMEBUFFER, precipFeedbackFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT4);
        var precipValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, precipValues);
        readoutText = precipValues[0].toFixed(3);
        unit = 'mm/h';
        break;

      case 'DISP_SOILMOISTURE':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        var waterTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);
        readoutText = waterTextureValues[1].toFixed(3);
        unit = 'm³/m³';
        break;

      case 'DISP_CURL':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        var baseTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, baseTextureValues);
        let curl = baseTextureValues[3] * 10000.0;
        readoutText = curl.toFixed(2);
        unit = 's⁻¹';
        break;

      case 'DISP_AIRQUALITY':
        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        var waterTextureValues = new Float32Array(4);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, waterTextureValues);
        let airQuality = waterTextureValues[3] * 300.0;
        readoutText = airQuality.toFixed(1);
        unit = 'µg/m³';
        break;

      case 'DISP_RADAR':
        readoutText = 'Radar Imagery';
        unit = '';
        break;

      case 'DISP_RADAR_COMPOSITE':
        readoutText = 'Composite Radar';
        unit = '';
        break;

      case 'DISP_RADAR_WORLD':
        readoutText = 'World Radar';
        unit = '';
        break;

      case 'DISP_RISK':
        readoutText = 'Convective Risk';
        unit = '';
        break;

      case 'DISP_HAIL_SIZE':
      case 'DISP_DROPLET_SIZE': {
        const dv = getDropletSizeViewConfig(guiControls.displayMode);
        const sizeRead = new Float32Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, dropletSizeFrameBuff);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(simXpos, simYpos, 1, 1, gl.RGBA, gl.FLOAT, sizeRead);
        const sizeMm = dv.channel === 0 ? sizeRead[0] : sizeRead[1];
        readoutText = sizeMm >= 0.05 ? sizeMm.toFixed(2) : '0';
        unit = dv.unit;
        break;
      }

      default:
        if (isSoundingDisplayMode(guiControls.displayMode)) {
          const viewCfg = getSoundingViewConfig(guiControls.displayMode);
          const colX = Math.floor(mod(mouseXinSim * sim_res_x, sim_res_x));
          let metricVal = null;
          for (const d of soundingOverlayData) {
            if (colX >= d.sx && colX < d.sx + d.step) {
              metricVal = d.metrics[viewCfg.key];
              break;
            }
          }
          if (metricVal !== null && !isNaN(metricVal)) {
            const absVal = Math.abs(metricVal);
            if (absVal >= 100) readoutText = metricVal.toFixed(0);
            else if (absVal >= 10) readoutText = metricVal.toFixed(1);
            else readoutText = metricVal.toFixed(2);
          } else {
            readoutText = '--';
          }
          unit = viewCfg.unit;
        } else {
          readoutText = '';
          unit = '';
        }
    }

    if (readoutText) {
      let readoutEl = document.getElementById('cursorReadout');
      if (!readoutEl) {
        readoutEl = document.createElement('div');
        readoutEl.id = 'cursorReadout';
        readoutEl.style.position = 'absolute';
        readoutEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        readoutEl.style.color = 'white';
        readoutEl.style.padding = '5px 10px';
        readoutEl.style.borderRadius = '4px';
        readoutEl.style.pointerEvents = 'none';
        readoutEl.style.fontSize = '12px';
        readoutEl.style.zIndex = '1000';
        readoutEl.style.whiteSpace = 'pre';
        document.body.appendChild(readoutEl);
      }
      readoutEl.textContent = readoutText + (unit ? ' ' + unit : '');
      readoutEl.style.left = (event.clientX + 15) + 'px';
      readoutEl.style.top = (event.clientY + 15) + 'px';
    }
  }


  function findSimYposAboveSurfaceAtMouseX() // find the lowest location that is not underground
  {
    let simXpos = clamp(Math.floor(mouseXinSim * sim_res_x), 0, sim_res_x - 1);
    let simYpos = clamp(Math.floor(mouseYinSim * sim_res_y), 0, sim_res_y - 1);
    // console.log(simYpos)

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2); // walltexture

    var wallTextureValues = new Int8Array(4 * sim_res_y);
    gl.readPixels(simXpos, 0, 1, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues); // read a vertical culumn of cells

    if (wallTextureValues[simYpos * 4 + 1] > 0) {                                         // place at mouse position of cell is not wall
      return simYpos;
    } else {
      for (let curSimYpos = simYpos; curSimYpos < sim_res_y; curSimYpos++) { // find first cell above that is not wall
        if (wallTextureValues[curSimYpos * 4 + 1] > 0) {                     // surface reached
          return curSimYpos;
        }
      }
    }
  }

  function mouseDownEvent(e)
  {
    // event.preventDefault(); // caused problems with dat.gui
    // console.log('mousedown');
    if (e.button == 0) { // left
      leftMousePressed = true;
      if (SETUP_MODE) {
        startSimulation();
      } else if (guiControls.tool == 'TOOL_STATION') {
        let simXpos = Math.floor(mouseXinSim * sim_res_x);
        let simYpos = findSimYposAboveSurfaceAtMouseX();

        if (simXpos >= 0 && simXpos < sim_res_x)
          weatherStations.push(new Weatherstation(simXpos, simYpos)); // add weather station
      } else if (guiControls.tool == 'TOOL_RADAR') {
        let simXpos = Math.floor(mouseXinSim * sim_res_x);
        let simYpos = findSimYposAboveSurfaceAtMouseX();

        if (simXpos >= 0 && simXpos < sim_res_x) {
          let newRadar = new Radar(simXpos, simYpos);
          // Only init cache FBO if GL context is ready (simulation is running)
          if (typeof gl !== 'undefined') {
            newRadar.initCacheFBO();
          }
          radars.push(newRadar); // add radar
          refreshRadarOverlaySourceDropdown();
        }
      } else if (guiControls.tool == 'TOOL_AIRMASS') {
        let simXpos = Math.floor(mouseXinSim * sim_res_x);
        let simYpos = findSimYposAboveSurfaceAtMouseX();

        if (simXpos >= 0 && simXpos < sim_res_x && simYpos !== undefined)
          airmassGenerators.push(new AirmassGenerator(simXpos, simYpos));
      } else if (guiControls.tool == 'TOOL_MARKER') {
        let simXpos = Math.floor(mouseXinSim * sim_res_x);
        let simYpos = findSimYposAboveSurfaceAtMouseX();

        if (simXpos >= 0 && simXpos < sim_res_x)
          markers.push(new Marker(simXpos, simYpos)); // add marker
      } else if (guiControls.tool == 'TOOL_NUKE') {
        let simXpos = Math.floor(mouseXinSim * sim_res_x);
        let cursorYpos = Math.floor(mouseYinSim * sim_res_y);
        let surfaceYpos = findSimYposAboveSurfaceAtMouseX();
        let startYpos;

        if (surfaceYpos !== undefined) {
          startYpos = Math.min(cursorYpos, surfaceYpos - 5);
          startYpos = Math.max(0, startYpos);
        } else {
          startYpos = Math.max(0, cursorYpos);
        }

        if (simXpos >= 0 && simXpos < sim_res_x)
          nukes.push(new Nuke(simXpos, startYpos)); // add nuke
      }
    } else if (e.button == 1) {
      // middle mouse button
      middleMousePressed = true;
      prevMouseX = mouseX;
      prevMouseY = mouseY;
    }
  }


  window.addEventListener('mouseup', function(event) {
    if (event.button == 0) {
      leftMousePressed = false;
    } else if (event.button == 1) {
      // middle mouse button
      middleMousePressed = false;
    }
  });


  var wasTwoFingerTouchBefore = false;

  var previousTouches;


  canvas.addEventListener('touchstart', function(event) { event.preventDefault(); }, {passive : false});

  canvas.addEventListener('touchend', function(event) {
    event.preventDefault();
    if (event.touches.length == 0) { // all fingers released
      leftMousePressed = false;
      //   }else if(event.touches.length == 1){
      wasTwoFingerTouchBefore = false;
      previousTouches = null;

      if (SETUP_MODE) {
        startSimulation();
      }
    }
  }, {passive : false});

  canvas.addEventListener('touchmove', function(event) {
    event.preventDefault();

    if (event.touches.length == 1) { // single finger

      // console.log(event.touches[0]);
      if (!wasTwoFingerTouchBefore) {
        leftMousePressed = true; // treat just like holding left mouse button
        mouseX = event.touches[0].clientX;
        mouseY = event.touches[0].clientY;
      }
    } else {
      leftMousePressed = false;

      if (event.touches.length == 2 && previousTouches && previousTouches.length == 2) // 2 finger zoom
      {
        mouseX = (event.touches[0].clientX + event.touches[1].clientX) / 2.0;          // position inbetween two fingers
        mouseY = (event.touches[0].clientY + event.touches[1].clientY) / 2.0;

        let prevXsep = previousTouches[0].clientX - previousTouches[1].clientX;
        let prevYsep = previousTouches[0].clientY - previousTouches[1].clientY;
        let prevSep = Math.sqrt(prevXsep * prevXsep + prevYsep * prevYsep);

        let curXsep = event.touches[0].clientX - event.touches[1].clientX;
        let curYsep = event.touches[0].clientY - event.touches[1].clientY;
        let curSep = Math.sqrt(curXsep * curXsep + curYsep * curYsep);

        cam.zoomAtMousePos((curSep / prevSep) - 1.0);

        if (wasTwoFingerTouchBefore) {
          cam.changeViewYpos(((mouseX - prevMouseX) / cam.curZoom / canvas.width) * 2.0);
          cam.changeViewYpos(((mouseY - prevMouseY) / cam.curZoom / canvas.width) * 2.0);
        }
        wasTwoFingerTouchBefore = true;
        prevMouseX = mouseX;
        prevMouseY = mouseY;
      }
    }

    previousTouches = event.touches;
  }, {passive : false});


  var lastBpressTime;

  var smoothedFrameMs = 18;
  var realisticVisualQuality = 1.0;
  var sunlightVisualQuality = 1.0;
  var smoothedAmbientPressure = 0;
  var ambientBlurPassState = 2;
  var ambientLevelCapState = 6;
  var realtimeLastWallClockMs = 0;
  var realtimeIterAccumulator = 0;

  function getFramePressure()
  {
    // 0 = comfortable, 1 = heavy frame pressure. Gradual — not a hard on/off switch.
    if (guiControls.performanceAutoScaling === false)
      return 0;
    return clamp((smoothedFrameMs - TARGET_FRAME_MS) / 36.0, 0, 1);
  }

  function useLiteVisualsMode()
  {
    return getFramePressure() > 0.42;
  }

  function getTargetHdrRenderScale()
  {
    if (guiControls.performanceAutoScaling === false)
      return 1.0;
    const pixels = canvas.width * canvas.height;
    let scale = 1.0;
    if (pixels > 1920 * 1080)
      scale = 0.75;
    if (pixels > 2560 * 1440)
      scale = 0.625;
    const pressure = getSmoothedFramePressure();
    if (pressure > 0.30)
      scale = Math.min(scale, 0.75);
    if (pressure > 0.50)
      scale = Math.min(scale, 0.5);
    if (useLiteVisualsMode())
      scale = Math.min(scale, 0.5);
    return scale;
  }

  function updateHdrRenderScaleIfNeeded()
  {
    const target = getTargetHdrRenderScale();
    if (target < hdrRenderScaleState - 0.01) {
      hdrRenderScaleState = target;
      createBloomFBOs();
      createHdrFBO();
    } else if (target > hdrRenderScaleState + 0.124 && getSmoothedFramePressure() < 0.22) {
      hdrRenderScaleState = target;
      createBloomFBOs();
      createHdrFBO();
    }
  }

  function needsAmbientLightBlur()
  {
    if (guiControls.paused)
      return false;
    const visualAge = getLightningVisualAge();
    return visualAge >= 0 && proceduralLightningState.strikes.length > 0;
  }

  function shouldRunPrecipitationThisIteration(iterIndex)
  {
    if (!guiControls.enablePrecipitation)
      return false;
    if (!useLiteVisualsMode())
      return true;
    return iterIndex === 0 || (frameNum % 2 === 0);
  }

  function shouldDrawRadarOverlayThisFrame()
  {
    if (!guiControls.radarOverlay)
      return false;
    if (!useLiteVisualsMode())
      return true;
    return frameNum % 2 === 0;
  }

  function getSmoothedFramePressure()
  {
    const p = getFramePressure();
    smoothedAmbientPressure = smoothedAmbientPressure * 0.92 + p * 0.08;
    return smoothedAmbientPressure;
  }

  // Sunlight shadow kernel — scales with GPU quality and smoothed frame pressure
  function getSunlightVisualQuality()
  {
    let quality = clamp(guiControls.gpuEffectQuality || 1.0, 0.72, 1.2);
    if (guiControls.performanceAutoScaling !== false)
      quality *= 1.0 - getSmoothedFramePressure() * 0.42;
    return clamp(quality, 0.48, 1.2);
  }

  function getRealisticVisualQuality()
  {
    let quality = guiControls.gpuEffectQuality || 1.0;
    const framePressure = getFramePressure();
    if (guiControls.adaptiveLightningQuality !== false)
      quality *= 1.0 - framePressure * 0.55;
    return clamp(quality, 0.35, 1.2);
  }

  function getAmbientBlurPasses()
  {
    const pressure = getSmoothedFramePressure();
    if (pressure > 0.32)
      ambientBlurPassState = 1;
    else if (pressure < 0.16)
      ambientBlurPassState = 2;
    return ambientBlurPassState;
  }

  function getAmbientLevelCount()
  {
    // Cap at 6 mip levels — levels beyond 6 are tiny (< 10 px) and contribute
    // negligible light while each extra level costs a downsample + upsample pass.
    const pressure = getSmoothedFramePressure();
    if (pressure > 0.58)
      ambientLevelCapState = 4;
    else if (pressure < 0.48)
      ambientLevelCapState = pressure > 0.26 ? 5 : 6;
    return Math.min(ambientLightFBOs.length, ambientLevelCapState);
  }

  function getBloomLevelCount()
  {
    if (!guiControls.enableBloom)
      return 0;
    const pressure = getFramePressure();
    const pixels = canvas.width * canvas.height;
    let cap = 7;
    if (pixels > 1920 * 1080)
      cap = 6;
    if (pixels > 2560 * 1440)
      cap = 5;
    if (pressure > 0.55)
      cap = Math.min(cap, 5);
    else if (pressure > 0.22)
      cap = Math.min(cap, 6);
    if (useLiteVisualsMode())
      cap = Math.min(cap, 4);
    return Math.min(bloomFBOs.length, cap);
  }

  function updateFrameTimeStats(frameMs)
  {
    // Faster EMA (0.80 vs old 0.88) so the auto-iter controller reacts in ~5 frames instead of ~8
    smoothedFrameMs = smoothedFrameMs * 0.80 + frameMs * 0.20;
  }

  function handlePause()
  {
    if (guiControls.paused) {
      if (soundSystem)
        soundSystem.mute();
      lightningIconsPauseClockMs = performance.now();
      if (proceduralLightningState.strikes.length > 0 && proceduralLightningState.builtEventId >= 0)
        proceduralLightningState.frozenVisualAge = getLightningVisualAge();
    } else {
      if (lightningIconsPauseClockMs > 0) {
        const pauseDelta = performance.now() - lightningIconsPauseClockMs;
        for (let i = 0; i < radarLightningStrikes.length; i++)
          radarLightningStrikes[i].expireAt += pauseDelta;
        lightningIconsPauseClockMs = 0;
      }
      if (proceduralLightningState.frozenVisualAge != null && proceduralLightningState.frozenVisualAge >= 0) {
        const t = proceduralLightningState.frozenVisualAge / getLightningFlashDuration();
        proceduralLightningState.flashStartMs = performance.now() - t * getLightningVisualFlashMs();
        proceduralLightningState.frozenVisualAge = null;
      }
      if (guiControls.realtimeMode)
        realtimeLastWallClockMs = performance.now();
    }
  }

  function changeFullscreenResolution()
  {
    const resolution = guiControls.fullscreenResolution;
    
    if (resolution === 'Default') {
      // Exit fullscreen and restore original window size
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      return;
    }

    // Parse resolution string (e.g., "1920x1080")
    const [width, height] = resolution.split('x').map(Number);
    
    // Request fullscreen with the specified resolution
    const canvas = document.getElementById('mainCanvas');
    
    if (!document.fullscreenElement) {
      canvas.requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          // Try to set the resolution using Screen Orientation API
          if (screen.orientation && screen.orientation.lock) {
            // Get available refresh rates for the resolution
            const isLandscape = width > height;
            const orientation = isLandscape ? 'landscape-primary' : 'portrait-primary';
            
            // Try to lock orientation (this may prompt user permission)
            screen.orientation.lock(orientation).catch(() => {
              console.log('Could not lock screen orientation');
            });
          }
          
          // Resize the canvas to the desired resolution
          canvas.width = width;
          canvas.height = height;
          
          // Update canvas aspect ratio
          canvas_aspect = canvas.width / canvas.height;
          
          // Recreate framebuffers at new resolution
          hdrRenderScaleState = 1.0;
          createBloomFBOs();
          createHdrFBO();
          
          // Recreate radar cache texture at new screen size
          if (typeof radarTexture !== 'undefined' && radarTexture) {
            gl.bindTexture(gl.TEXTURE_2D, radarTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          }
          updateNukeOverlaySize();

          // Ensure dat.GUI menu remains visible
          if (datGui) {
            datGui.show();
          }
        })
        .catch(err => {
          console.error('Error entering fullscreen:', err);
          alert('Could not enter fullscreen mode. Please check your browser permissions.');
        });
    } else {
      // Already in fullscreen, just resize
      canvas.width = width;
      canvas.height = height;
      canvas_aspect = canvas.width / canvas.height;
      hdrRenderScaleState = 1.0;
      createBloomFBOs();
      createHdrFBO();
      if (typeof radarTexture !== 'undefined' && radarTexture) {
        gl.bindTexture(gl.TEXTURE_2D, radarTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      updateNukeOverlaySize();

      // Ensure dat.GUI menu remains visible
      if (datGui) {
        datGui.show();
      }
    }
  }

  function isTypingInFormField()
  {
    if (keybindEditorCapturing)
      return false;
    const el = document.activeElement;
    if (!el)
      return false;
    if (el.closest && el.closest('#keybindPanel')) {
      if (el.tagName === 'INPUT' && el.id === 'kbe-search')
        return true;
      return false;
    }
    if (el.closest && el.closest('#skyPanel')) {
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number'))
        return true;
      return false;
    }
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
      return true;
    if (el.isContentEditable)
      return true;
    return el.closest && !!el.closest('.dg');
  }

  function startKeybindCapture(actionId)
  {
    keybindEditorCapturing = true;
    keybindEditorCaptureActionId = actionId;
    if (document.activeElement && typeof document.activeElement.blur === 'function')
      document.activeElement.blur();
    if (typeof refreshKeybindEditorList === 'function')
      refreshKeybindEditorList();
  }

  function disableDatGuiBuiltinKeybinds()
  {
    if (typeof dat !== 'undefined' && dat.GUI && dat.GUI._keydownHandler)
      window.removeEventListener('keydown', dat.GUI._keydownHandler, false);
  }

  document.addEventListener('keydown', (event) => {
    if (keybindEditorCapturing) {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        keybindEditorCapturing = false;
        keybindEditorCaptureActionId = null;
        if (typeof refreshKeybindEditorList === 'function')
          refreshKeybindEditorList();
        return;
      }
      if (event.code === 'Delete') {
        if (keybindEditorCaptureActionId)
          setKeybindForAction(keybindEditorCaptureActionId, null);
        keybindEditorCapturing = false;
        keybindEditorCaptureActionId = null;
        if (typeof refreshKeybindEditorList === 'function')
          refreshKeybindEditorList();
        return;
      }
      if (event.code === 'ControlLeft' || event.code === 'ControlRight' ||
          event.code === 'ShiftLeft' || event.code === 'ShiftRight' ||
          event.code === 'AltLeft' || event.code === 'AltRight')
        return;
      if (keybindEditorCaptureActionId) {
        setKeybindForAction(keybindEditorCaptureActionId, event.code);
        keybindEditorCapturing = false;
        keybindEditorCaptureActionId = null;
        if (typeof refreshKeybindEditorList === 'function')
          refreshKeybindEditorList();
      }
      return;
    }

    if (isTypingInFormField())
      return;

    if (event.code == 'ControlLeft') {
      ctrlPressed = true;
      return;
    }
    if (event.code == 'ControlRight') {
      rightCtrlPressed = true;
      return;
    }

    handleKeybindKeydown(event);
  });

  document.addEventListener('keyup', (event) => {
    if (keybindEditorCapturing)
      return;

    if (event.code == 'ControlLeft') {
      ctrlPressed = false;
      return;
    }
    if (event.code == 'ControlRight') {
      rightCtrlPressed = false;
      return;
    }

    handleKeybindKeyup(event);
  });

  await loadingBar.set(9, 'Setting up WebGL');

  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_float_blend');
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('OES_texture_half_float_linear');
  const parallelShaderCompileExt = gl.getExtension('KHR_parallel_shader_compile');

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  // gl.disable(gl.BLEND);
  // gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // load shaders
  var commonSource = await loadSourceFile('shaders/common.glsl');
  var commonDisplaySource = await loadSourceFile('shaders/commonDisplay.glsl');
  var lightningV2Source = await loadSourceFile('shaders/fragment/lightningV2.glsl');
  var dropletSizeSource = await loadSourceFile('shaders/dropletSize.glsl');

  const simVertexShader = await loadShader('simShader.vert');
  const dispVertexShader = await loadShader('dispShader.vert');
  const realDispVertexShader = await loadShader('realDispShader.vert');
  const precipDisplayVertexShader = await loadShader('precipDisplayShader.vert');
  const postProcessingVertexShader = await loadShader('postProcessingShader.vert');

  const pressureShader = await loadShader('pressureShader.frag');
  const velocityShader = await loadShader('velocityShader.frag');
  const advectionShader = await loadShader('advectionShader.frag');
  const curlShader = await loadShader('curlShader.frag');
  const capeShader = await loadShader('capeShader.frag');
  const chargeShader = await loadShader('chargeShader.frag');
  const lightningSummaryShader = await loadShader('lightningSummaryShader.frag');
  const lightningDebugShader = await loadShader('lightningDebugShader.frag');
  const chargeDisplayShader = await loadShader('chargeDisplayShader.frag');
  const dropletSizeAccumVertexShader = await loadShader('dropletSizeAccumShader.vert');
  const dropletSizeAccumShader = await loadShader('dropletSizeAccumShader.frag');
  const dropletSizeDisplayShader = await loadShader('dropletSizeDisplayShader.frag');
  const vorticityShader = await loadShader('vorticityShader.frag');
  const boundaryShader = await loadShader('boundaryShader.frag');

  const lightingShader = await loadShader('lightingShader.frag');

  const lightningLocationShader = await loadShader('lightningLocationShader.frag');

  const setupShader = await loadShader('setupShader.frag');

  const temperatureDisplayShader = await loadShader('temperatureDisplayShader.frag');
  const temperatureChangeDisplayShader = await loadShader('temperatureChangeDisplayShader.frag');
  const airQualityDisplayShader = await loadShader('airQualityDisplayShader.frag');
  const humidityDisplayShader = await loadShader('humidityDisplayShader.frag');
  const precipDisplayShader = await loadShader('precipDisplayShader.frag');
  const universalDisplayShader = await loadShader('universalDisplayShader.frag');
  const skyBackgroundDisplayShader = await loadShader('skyBackgroundDisplayShader.frag');
  const realisticDisplayShader = await loadShader('realisticDisplayShader.frag');
  const IRtempDisplayShader = await loadShader('IRtempDisplayShader.frag');

  const postProcessingShader = await loadShader('postProcessingShader.frag');
  const isolateBrightPartsShader = await loadShader('isolateBrightPartsShader.frag');
  const bloomBlurShader = await loadShader('bloomBlurShader.frag');

  // Link GPU programs — realistic display is linked last (largest shader; linking it with
  // every other compiled shader still resident can freeze or crash the browser at ~99%).
  await loadingBar.set(80, 'Linking GPU programs');

  const pressureProgram = createProgram(simVertexShader, pressureShader);
  const velocityProgram = createProgram(simVertexShader, velocityShader);
  const advectionProgram = createProgram(simVertexShader, advectionShader);
  const curlProgram = createProgram(simVertexShader, curlShader);
  const capeProgram = createProgram(simVertexShader, capeShader);
  const chargeProgram = createProgram(simVertexShader, chargeShader);
  const lightningSummaryProgram = createProgram(simVertexShader, lightningSummaryShader);
  const lightningDebugProgram = createProgram(dispVertexShader, lightningDebugShader);
  const vorticityProgram = createProgram(simVertexShader, vorticityShader);
  const boundaryProgram = createProgram(simVertexShader, boundaryShader);
  const lightingProgram = createProgram(simVertexShader, lightingShader);
  const lightningLocationProgram = createProgram(simVertexShader, lightningLocationShader);
  const setupProgram = createProgram(simVertexShader, setupShader);
  gl.deleteShader(simVertexShader);

  const chargeDisplayProgram = createProgram(dispVertexShader, chargeDisplayShader);
  const dropletSizeAccumProgram = createProgram(dropletSizeAccumVertexShader, dropletSizeAccumShader);
  gl.deleteShader(dropletSizeAccumVertexShader);
  const dropletSizeDisplayProgram = createProgram(dispVertexShader, dropletSizeDisplayShader);
  const temperatureDisplayProgram = createProgram(dispVertexShader, temperatureDisplayShader);
  const temperatureChangeDisplayProgram = createProgram(dispVertexShader, temperatureChangeDisplayShader);
  const airQualityDisplayProgram = createProgram(dispVertexShader, airQualityDisplayShader);
  const humidityDisplayProgram = createProgram(dispVertexShader, humidityDisplayShader);
  const precipDisplayProgram = createProgram(precipDisplayVertexShader, precipDisplayShader);
  gl.deleteShader(precipDisplayVertexShader);
  const universalDisplayProgram = createProgram(dispVertexShader, universalDisplayShader);
  const skyBackgroundDisplayProgram = createProgram(realDispVertexShader, skyBackgroundDisplayShader);
  const IRtempDisplayProgram = createProgram(dispVertexShader, IRtempDisplayShader);
  gl.deleteShader(dispVertexShader);

  postProcessingProgram = createProgram(postProcessingVertexShader, postProcessingShader);
  postProc_exposure_loc = gl.getUniformLocation(postProcessingProgram, 'exposure');
  postProc_saturation_loc = gl.getUniformLocation(postProcessingProgram, 'saturation');
  postProc_contrast_loc = gl.getUniformLocation(postProcessingProgram, 'contrast');
  postProc_bloomStrength_loc = gl.getUniformLocation(postProcessingProgram, 'bloomStrength');
  const isolateBrightPartsProgram = createProgram(postProcessingVertexShader, isolateBrightPartsShader);
  const bloomBlurProgram = createProgram(postProcessingVertexShader, bloomBlurShader);

  await loadingBar.set(84, 'Linking realistic display shader');
  let realisticDisplayProgram;
  try {
    realisticDisplayProgram = await linkProgramAsync(realDispVertexShader, realisticDisplayShader, null, 'realistic display');
  } catch (e) {
    if (gl.isContextLost && gl.isContextLost()) {
      await loadingBar.showError('WebGL context lost while linking shaders.\nRefresh the page — if this keeps happening, your GPU may not handle the full lightning shader.');
      throw e;
    }
    console.warn('Realistic display link failed with Lightning V2:', e.message, '— retrying without procedural lightning');
    gl.deleteShader(realisticDisplayShader);
    await linkProgramYield();
    if (gl.isContextLost && gl.isContextLost()) {
      await loadingBar.showError('WebGL context lost while linking shaders.\nRefresh the page (Ctrl+F5) and try again.');
      throw e;
    }
    await loadingBar.set(84, 'Linking realistic display (fallback)...');
    const realisticDisplayShaderNoLt = await loadShader('realisticDisplayShader.frag', { skipLightningV2: true });
    try {
      realisticDisplayProgram = await linkProgramAsync(realDispVertexShader, realisticDisplayShaderNoLt, null, 'realistic display (no lightning V2)');
      lightningV2InRealisticShader = false;
      console.warn('Loaded without Lightning V2 in realistic display — legacy lightning still works.');
    } catch (e2) {
      await loadingBar.showError('ERROR linking realistic display shader:\n' + e2.message);
      throw e2;
    }
  }
  gl.deleteShader(realDispVertexShader);

  await loadingBar.set(86, 'Setting up textures');

  // // quad that fills the screen, so fragment shader is run for every pixel //
  // X, Y,  U, V  (x4)

  // Don't ask me why, but the * 1.0000001 is nesesary to get exactly round half
  // ( x.5 ) fragcoordinates in the fragmentshaders I figured this out
  // experimentally. It took me days! Without it the linear interpolation would
  // get fucked up because of the tiny offsets
  const fluidQuadVertices = [
    // X, Y,  U, V
    1.0,
    -1.0,
    sim_res_x * 1.0000001,
    0.0,
    -1.0,
    -1.0,
    0.0,
    0.0,
    1.0,
    1.0,
    sim_res_x * 1.0000001,
    sim_res_y * 1.0000001,
    -1.0,
    1.0,
    0.0,
    sim_res_y * 1.0000001,
  ];

  var fluidVao = gl.createVertexArray(); // vertex array object to store
  // bufferData and vertexAttribPointer
  gl.bindVertexArray(fluidVao);
  var fluidVertexBufferObject = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fluidVertexBufferObject);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fluidQuadVertices), gl.STATIC_DRAW);
  var positionAttribLocation = gl.getAttribLocation(velocityProgram,
                                                    'vertPosition'); // 0 these positions are the same for every program,
  // since they all use the same vertex shader
  var texCoordAttribLocation = gl.getAttribLocation(velocityProgram, 'vertTexCoord'); // 1
  gl.enableVertexAttribArray(positionAttribLocation);
  gl.enableVertexAttribArray(texCoordAttribLocation);
  gl.vertexAttribPointer(
    positionAttribLocation,             // Attribute location
    2,                                  // Number of elements per attribute
    gl.FLOAT,                           // Type of elements
    gl.FALSE,
    4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    0                                   // Offset from the beginning of a single vertex to this attribute
  );
  gl.vertexAttribPointer(
    texCoordAttribLocation,             // Attribute location
    2,                                  // Number of elements per attribute
    gl.FLOAT,                           // Type of elements
    gl.FALSE,
    4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    2 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
    // single vertex to this attribute
  );

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);


  const postProcessingQuadVertices = [
    1.0,  // X
    -1.0, // Y
    1.0,  // U
    0.0,  // V
    -1.0,
    -1.0,
    0.0,
    0.0,
    1.0,
    1.0,
    1.0,
    1.0,
    -1.0,
    1.0,
    0.0,
    1.0,
  ];

  var postProcessingVao = gl.createVertexArray(); // vertex array object to store
  // bufferData and vertexAttribPointer
  gl.bindVertexArray(postProcessingVao);
  var postProcessingVertexBufferObject = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, postProcessingVertexBufferObject);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(postProcessingQuadVertices), gl.STATIC_DRAW);
  positionAttribLocation = gl.getAttribLocation(postProcessingProgram,
                                                'vertPosition'); // 0 these positions are the same for every program,
  // since they all use the same vertex shader
  texCoordAttribLocation = gl.getAttribLocation(postProcessingProgram, 'vertTexCoord'); // 1
  gl.enableVertexAttribArray(positionAttribLocation);
  gl.enableVertexAttribArray(texCoordAttribLocation);
  gl.vertexAttribPointer(
    positionAttribLocation,             // Attribute location
    2,                                  // Number of elements per attribute
    gl.FLOAT,                           // Type of elements
    gl.FALSE,
    4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    0                                   // Offset from the beginning of a single vertex to this attribute
  );
  gl.vertexAttribPointer(
    texCoordAttribLocation,             // Attribute location
    2,                                  // Number of elements per attribute
    gl.FLOAT,                           // Type of elements
    gl.FALSE,
    4 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
    2 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
    // single vertex to this attribute
  );

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);


  // Precipitation setup

  const precipitationVertexShader = await loadShader('precipitationShader.vert');
  const precipitationShader = await loadShader('precipitationShader.frag');
  const precipitationProgram = createProgram(precipitationVertexShader, precipitationShader, [ 'position_out', 'mass_out', 'density_out' ]);

  // Radar display setup
  const radarVertexShader = await loadShader('dispShader.vert');
  const radarFragmentShader = await loadShader('radarDisplayShader.frag');
  let radarDisplayProgram; try { radarDisplayProgram = createProgram(radarVertexShader, radarFragmentShader, []); } catch(e) { loadingBar.showError("Radar link error: " + e.message); throw e; }

  const compositeRadarFragmentShader = await loadShader('compositeRadarDisplayShader.frag');
  let compositeRadarDisplayProgram; try { compositeRadarDisplayProgram = createProgram(radarVertexShader, compositeRadarFragmentShader, []); } catch(e) { loadingBar.showError("Composite radar link error: " + e.message); throw e; }


  const passthroughFragmentShader = await loadShader('passthroughShader.frag');
  let passthroughProgram; try { passthroughProgram = createProgram(postProcessingVertexShader, passthroughFragmentShader, []); } catch(e) { loadingBar.showError("Passthrough link error: " + e.message); throw e; }
  gl.deleteShader(postProcessingVertexShader);

  gl.useProgram(precipitationProgram);

  const dropPositionAttribLocation = 0;
  const massAttribLocation = 1;
  const densityAttribLocation = 2;

  var even = true; // used to switch between precipitation buffers

  const precipitationVao_0 = gl.createVertexArray();
  const precipVertexBuffer_0 = gl.createBuffer();
  const precipitationTF_0 = gl.createTransformFeedback();
  const precipitationVao_1 = gl.createVertexArray();
  const precipVertexBuffer_1 = gl.createBuffer();
  const precipitationTF_1 = gl.createTransformFeedback();


  var rainDrops;

  function initRainDrops()
  {
    rainDrops = [];
    // generate inactive droplets with random values to be used as seeds for random spawning
    for (var i = 0; i < NUM_DROPLETS; i++) {
      // seperate push for each element is fastest
      rainDrops.push(Math.random());         // X
      rainDrops.push(Math.random());         // Y
      rainDrops.push(-10.0 + Math.random()); // water negative to disable
      rainDrops.push(Math.random());         // ice
      rainDrops.push(Math.random());         // density
    }
  }

  function setupPrecipitationBuffers()
  {
    gl.bindVertexArray(precipitationVao_0);

    gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rainDrops), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttribLocation);
    gl.enableVertexAttribArray(massAttribLocation);
    gl.enableVertexAttribArray(densityAttribLocation);
    gl.vertexAttribPointer(
      dropPositionAttribLocation,         // Attribute location
      2,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      0                                   // Offset from the beginning of a single vertex to this attribute
    );
    gl.vertexAttribPointer(
      massAttribLocation,                 // Attribute location
      2,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      2 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
      // single vertex to this attribute
    );
    gl.vertexAttribPointer(
      densityAttribLocation,              // Attribute location
      1,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      4 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
      // single vertex to this attribute
    );

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, precipitationTF_0);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0,
                      precipVertexBuffer_0); // this binds the default (id = 0)
    // TRANSFORM_FEEBACK buffer
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

    // var precipitationVao_1 = gl.createVertexArray();
    gl.bindVertexArray(precipitationVao_1);

    gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_1);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rainDrops), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionAttribLocation);
    gl.enableVertexAttribArray(massAttribLocation);
    gl.enableVertexAttribArray(densityAttribLocation);
    gl.vertexAttribPointer(
      dropPositionAttribLocation,         // Attribute location
      2,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      0                                   // Offset from the beginning of a single vertex to this attribute
    );
    gl.vertexAttribPointer(
      massAttribLocation,                 // Attribute location
      2,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      2 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
      // single vertex to this attribute
    );
    gl.vertexAttribPointer(
      densityAttribLocation,              // Attribute location
      1,                                  // Number of elements per attribute
      gl.FLOAT,                           // Type of elements
      gl.FALSE,
      5 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
      4 * Float32Array.BYTES_PER_ELEMENT  // Offset from the beginning of a
      // single vertex to this attribute
    );

    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, precipitationTF_1);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0,
                      precipVertexBuffer_1); // this binds the default (id = 0)
    // TRANSFORM_FEEBACK buffer
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);

    gl.bindBuffer(gl.ARRAY_BUFFER, null); // buffers are bound via VAO's
    gl.bindVertexArray(fluidVao);         // set screenfilling rect again
  }


  const valsPerDroplet = 5;

  function logDropletsAndToggleFollow()
  {
    if (dropletFollowID >= 0) { // disable follow droplet
      dropletFollowID = -1;
      let dropletInfoCanvas = document.getElementById('dropletInfoCanvas');
      dropletInfoCanvas.style.display = 'none';
      return;
    }

    // log data of all the droplets within the brush
    let tempDroplets = new Float32Array(valsPerDroplet * NUM_DROPLETS);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, even ? precipVertexBuffer_0 : precipVertexBuffer_1); // x, y, water, ice, density
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tempDroplets);

    console.log(' ');
    console.log(' ');
    console.log('DROPLETS:-----------------------------------------');
    console.log(' ');

    let numInBrush = 0;
    let duplicates = 0;

    for (let n = 0; n < NUM_DROPLETS; n++) {
      let i = n * valsPerDroplet;
      let X = tempDroplets[i + 0];
      let Y = tempDroplets[i + 1];
      let x = (X + 1.0) / 2.0;
      let y = (Y + 1.0) / 2.0;
      let water = tempDroplets[i + 2];
      let ice = tempDroplets[i + 3];
      let density = tempDroplets[i + 4];

      let dx = (mouseXinSim - x) * sim_aspect;
      let dy = mouseYinSim - y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < guiControls.brushSize / 2.0 / sim_res_y && water >= 0) { // if droplet is within the brush and active
        console.log('n:', n);
        console.log('x:', x);
        console.log('y:', y);
        console.log('water:', water);
        console.log('Ice:', ice);
        console.log('Density:', density);
        const w = computeDropletWidths(water, ice, density);
        console.log('Width H:', w.horizStr);
        console.log('Width V:', w.vertStr);
        console.log(' ');
        numInBrush++;


        if (numInBrush == 1) { // first droplet found
          dropletFollowID = n;
          dropletInfoCanvas.style.display = 'block';
        }
      }
      /*
        // check for duplicates. Very slow!
        if (n < NUM_DROPLETS - 1) {
          for (let d = n + 1; d < NUM_DROPLETS; d++) {
            let j = d * valsPerDroplet;
            if (X == tempDroplets[j + 0] && Y == tempDroplets[j + 1]) {
              duplicates++;
              break;
            }
          }
        }
      */
    }
    console.log(NUM_DROPLETS, 'total droplets. ', numInBrush, 'droplets logged. ', duplicates, ' duplicates found');


    // dropletFollowMode = true;
  }


  function readDropletData(n)
  {
    let i = n * valsPerDroplet;
    let byteOffset = i * 4; // Convert to byte offset

    let dropletData = new Float32Array(valsPerDroplet);
    gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, even ? precipVertexBuffer_0 : precipVertexBuffer_1);
    gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, byteOffset, dropletData, 0, valsPerDroplet);

    dropletData[0] = (dropletData[0] + 1.0) / 2.0;
    dropletData[1] = (dropletData[1] + 1.0) / 2.0;

    // let x = dropletData[0];
    // let y = dropletData[1];
    // let water = dropletData[2];
    // let ice = dropletData[3];
    // let density = dropletData[4];

    // console.log('Droplet ', n);
    // console.log('x:', x);
    // console.log('y:', y);
    // console.log('water:', water);
    // console.log('Ice:', ice);
    // console.log('Density:', density);
    // console.log(' ');

    return dropletData;
  }


  if (initialRainDrops) {
    rainDrops = initialRainDrops;
  } else {
    initRainDrops();
  }

  setupPrecipitationBuffers();


  /*

  TEXTURE DESCRIPTIONS

  base texture: RGBA32F
  [0] = Horizontal velocity                              -1.0 to 1.0
  [1] = Vertical   velocity                              -1.0 to 1.0
  [2] = Pressure                                          >= 0
  [3] = Temperature in air, indicator in wall

  water texture: RGBA32F
  [0] = total water                                        >= 0
  [1] = cloud water                                        >= 0
  [2] = precipitation in air, moisture in surface          >= 0
  [3] = smoke/dust in air, snow in surface                 >= 0 for smoke/dust
  0 to 100 for snow

  wall texture: RGBA8I
  [0] walltype
  [1] manhattan distance to nearest wall                   0 to 127
  [2] height above/below ground. Surface = 0               -127 to 127
  [3] vegetation                                           0 to 127     grass from 0 to 50, trees from 50 to 127

  lighting texture: RGBA32F
  [0] sunlight                                             0 to 1.0
  [1] net heating effect of IR + sun absorbed by smoke
  [2] IR coming down                                       >= 0
  [3] IR going  up                                         >= 0

  */

  const baseTexture_0 = gl.createTexture();
  const baseTexture_1 = gl.createTexture();
  const waterTexture_0 = gl.createTexture();
  const waterTexture_1 = gl.createTexture();
  const wallTexture_0 = gl.createTexture();
  const wallTexture_1 = gl.createTexture();

  window.baseTexture_0 = baseTexture_0;
  window.baseTexture_1 = baseTexture_1;
  window.waterTexture_0 = waterTexture_0;
  window.waterTexture_1 = waterTexture_1;
  window.wallTexture_0 = wallTexture_0;
  window.wallTexture_1 = wallTexture_1;

  const curlTexture = gl.createTexture();
  const capeTexture = gl.createTexture();
  // Charge texture: RG32F — R=air charge, G=ground/surface charge (bipolar, ±1.0 = ±100 MV)
  const chargeTexture_0 = gl.createTexture();
  const chargeTexture_1 = gl.createTexture();
  const dropletSizeTexture = gl.createTexture();
  const vortForceTexture = gl.createTexture();

  const lightTexture_0 = gl.createTexture();
  const lightTexture_1 = gl.createTexture();
  let latestLightTexture = lightTexture_0;
  const precipitationFeedbackTexture = gl.createTexture();
  const precipitationDepositionTexture = gl.createTexture();
  const lightningDataTexture = gl.createTexture();
  const radarTexture = gl.createTexture();

  // Cache textures for radar display (to freeze all input textures)
  const cachedBaseTexture = gl.createTexture();
  const cachedWaterTexture = gl.createTexture();
  const cachedWallTexture = gl.createTexture();
  const cachedPrecipFeedbackTexture = gl.createTexture();
  const cachedPrecipDepositionTexture = gl.createTexture();

  // Static texures:
  const noiseTexture = gl.createTexture();
  const A380Texture = gl.createTexture();
  const A380_R_Texture = gl.createTexture();
  const A380GearTexture = gl.createTexture();
  const surfaceTextureMap = gl.createTexture();
  const colorScalesTexture = gl.createTexture();

  const lightningTextures = [];
  const numLightningTextures = 12;
  const lightningTextureTypes = ['CG', 'CG', 'POSITIVE', 'POSITIVE', 'CC', 'CC', 'SPIDER', 'SPIDER', 'ANVIL', 'ANVIL', 'IC', 'IC'];

  const temperatureChangeHistoryTextures = [
    gl.createTexture(),
    gl.createTexture(),
    gl.createTexture(),
    gl.createTexture(),
    gl.createTexture(),
    gl.createTexture(),
  ];
  let temperatureChangeHistoryIndex = 0;

  frameBuff_0 = gl.createFramebuffer(); // global for weather stations
  const frameBuff_1 = gl.createFramebuffer();

  const curlFrameBuff = gl.createFramebuffer();
  const capeFrameBuff = gl.createFramebuffer();
  const chargeFrameBuff_0 = gl.createFramebuffer();
  const chargeFrameBuff_1 = gl.createFramebuffer();
  const dropletSizeFrameBuff = gl.createFramebuffer();
  const vortForceFrameBuff = gl.createFramebuffer();

  lightFrameBuff_0 = gl.createFramebuffer();
  const lightFrameBuff_1 = gl.createFramebuffer();
  const precipitationFeedbackFrameBuff = gl.createFramebuffer();
  const lightningDataFrameBuff = gl.createFramebuffer();
  const radarFrameBuff = gl.createFramebuffer();
  window.frameBuff_1 = frameBuff_1;

  // Set up Textures
  async function setupTextures()
  {
    gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialWaterTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialWaterTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8I, sim_res_x, sim_res_y, 0, gl.RGBA_INTEGER, gl.BYTE, initialWallTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    //  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);


    gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8I, sim_res_x, sim_res_y, 0, gl.RGBA_INTEGER, gl.BYTE, initialWallTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    for (let i = 0; i < temperatureChangeHistoryTextures.length; i++) {
      gl.bindTexture(gl.TEXTURE_2D, temperatureChangeHistoryTextures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, initialBaseTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    lastSaveTime = new Date();
  }

  setupTextures();

  createAmbientLightFBOs();

  // Initialize radar cache FBOs
  radars.forEach(radar => radar.initCacheFBO());
  finalizeLoadedRadars();
  finalizeLoadedAirmassGenerators();

  // Set up Framebuffers


  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, waterTexture_0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, wallTexture_0, 0);


  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTexture_1, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, waterTexture_1, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, wallTexture_1, 0);


  gl.bindTexture(gl.TEXTURE_2D, curlTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sim_res_x, sim_res_y, 0, gl.RED, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, curlFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, curlTexture,
                          0); // attach the texture as the first color attachment

  gl.bindTexture(gl.TEXTURE_2D, capeTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sim_res_x, sim_res_y, 0, gl.RED, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, capeFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, capeTexture,
                          0); // attach the texture as the first color attachment

  // Charge textures: RG32F ping-ponged (R=air charge, G=ground charge), bipolar ±1.0
  gl.bindTexture(gl.TEXTURE_2D, chargeTexture_0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, chargeFrameBuff_0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, chargeTexture_0, 0);

  gl.bindTexture(gl.TEXTURE_2D, chargeTexture_1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, chargeFrameBuff_1);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, chargeTexture_1, 0);

  gl.bindTexture(gl.TEXTURE_2D, dropletSizeTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dropletSizeFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dropletSizeTexture, 0);

  lightningCacheW = Math.max(1, Math.ceil(sim_res_x / LIGHTNING_CACHE_SCALE));
  lightningCacheH = Math.max(1, Math.ceil(sim_res_y / LIGHTNING_CACHE_SCALE));
  if (!lightningSummaryTexture)
    lightningSummaryTexture = gl.createTexture();
  if (!lightningSummaryFrameBuff)
    lightningSummaryFrameBuff = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, lightningSummaryTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, lightningCacheW, lightningCacheH, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindFramebuffer(gl.FRAMEBUFFER, lightningSummaryFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightningSummaryTexture, 0);
  lightningSummaryBuffer = new Float32Array(lightningCacheW * lightningCacheH * 4);
  lightningFieldCacheFrame = -1;
  lightningFieldCache = null;

  gl.bindTexture(gl.TEXTURE_2D, vortForceTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, vortForceFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, vortForceTexture, 0);

  gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT,
                null);                                               // HALF_FLOAT before, but problems with acuracy
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,
                   gl.CLAMP_TO_EDGE); // prevent light from shining trough at bottem or top

  gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightTexture_0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emittedLightFBO.texture, 0);


  gl.bindTexture(gl.TEXTURE_2D, lightTexture_1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);    // LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // prevent light from shining trough at bottem or top

  gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_1);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightTexture_1, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, emittedLightFBO.texture, 0);


  gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindTexture(gl.TEXTURE_2D, precipitationDepositionTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, precipitationFeedbackTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, precipitationDepositionTexture, 0);

  gl.bindTexture(gl.TEXTURE_2D, lightningDataTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, lightningDataFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, lightningDataTexture, 0);

  gl.bindTexture(gl.TEXTURE_2D, radarTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, radarFrameBuff);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, radarTexture, 0);

  // Initialize cache textures for radar display (frozen sim snapshots)
  gl.bindTexture(gl.TEXTURE_2D, cachedBaseTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindTexture(gl.TEXTURE_2D, cachedWaterTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindTexture(gl.TEXTURE_2D, cachedWallTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8I, sim_res_x, sim_res_y, 0, gl.RGBA_INTEGER, gl.BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindTexture(gl.TEXTURE_2D, cachedPrecipFeedbackTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, sim_res_x, sim_res_y, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindTexture(gl.TEXTURE_2D, cachedPrecipDepositionTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, sim_res_x, sim_res_y, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // load images
  imgElement = await loadImage('resources/img/noise_texture.jpg');

  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);

  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // gl.texParameteri(
  //     gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,
  //     gl.REPEAT);  // default, so no need to set
  // gl.texParameteri(
  //     gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,
  //     gl.REPEAT);  // default, so no need to set

  imgElement = await loadImage('resources/img/A380.png');

  gl.bindTexture(gl.TEXTURE_2D, A380Texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // LINEAR_MIPMAP_LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);            // CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);            // REPEAT
                                                                                   // NEAREST_MIPMAP_LINEAR create weird effects

  imgElement = await loadImage('resources/img/A380_R.png');

  gl.bindTexture(gl.TEXTURE_2D, A380_R_Texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // LINEAR_MIPMAP_LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);            // CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);            // REPEAT

  imgElement = await loadImage('resources/img/A380_gear.png');

  gl.bindTexture(gl.TEXTURE_2D, A380GearTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // LINEAR_MIPMAP_LINEAR
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);            // CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);            // REPEAT

  imgElement = await loadImage('resources/img/surfaceTextureMap.png');

  gl.bindTexture(gl.TEXTURE_2D, surfaceTextureMap);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, imgElement.width, imgElement.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
  // gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);        // horizontal
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // vertical


  function generateLightningTexture(i, imgData)
  {
    lightningTextures[i] = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, lightningTextures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, imgData.width, imgData.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, imgData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  }

  for (let i = 0; i < numLightningTextures; i++) {
    const lightningGeneratorWorker = new Worker('./lightningGenerator.js');
    const texIndex = i;
    lightningGeneratorWorker.onmessage = (imgElement) => {
      generateLightningTexture(texIndex, imgElement.data);
    };
    lightningGeneratorWorker.postMessage({
      width: 2500, height: 5000,
      type: lightningTextureTypes[texIndex] || 'CG',
    });
  }


  // ========================= Sky Editor System =========================
  const SKY_STORAGE_KEY = 'weatherSandboxSky_v1';
  const SKY_SETTINGS_DEFAULTS = {
    horizonLine : 0.028,
    dayHue : 0.6,
    daySatLow : 0.7,
    daySatHigh : 1.0,
    dayValLow : 1.0,
    dayValHigh : 0.05,
    dayValPow : 5.0,
    twilightTop : [ 0.42, 0.06, 0.10 ],
    twilightUpper : [ 0.78, 0.14, 0.06 ],
    twilightMid : [ 0.98, 0.38, 0.08 ],
    twilightLow : [ 1.0, 0.62, 0.18 ],
    twilightHorizon : [ 1.0, 0.88, 0.52 ],
    horizonDeepRed : [ 1.0, 0.14, 0.03 ],
    horizonBurntOrange : [ 1.0, 0.42, 0.08 ],
    horizonGold : [ 1.0, 0.78, 0.28 ],
    horizonPaleGold : [ 1.0, 0.94, 0.72 ],
    crepuscularColor : [ 1.0, 0.55, 0.18 ],
    crepuscularStrength : 0.22,
    sunHorizAmplitude : 0.44,
    sunVertScale : 0.94,
    hazeMixStrength : 0.55,
    hazeBoostStrength : 0.45,
  };
  let skySettings = JSON.parse(JSON.stringify(SKY_SETTINGS_DEFAULTS));
  let refreshSkyEditor = null;

  function cloneSkySettings(src)
  {
    return JSON.parse(JSON.stringify(src));
  }

  function loadSkySettings()
  {
    try {
      const raw = localStorage.getItem(SKY_STORAGE_KEY);
      if (!raw)
        return;
      const parsed = JSON.parse(raw);
      skySettings = Object.assign(cloneSkySettings(SKY_SETTINGS_DEFAULTS), parsed);
    } catch (e) {
      skySettings = cloneSkySettings(SKY_SETTINGS_DEFAULTS);
    }
  }

  function saveSkySettings()
  {
    try {
      localStorage.setItem(SKY_STORAGE_KEY, JSON.stringify(skySettings));
    } catch (e) { /* ignore quota errors */ }
  }

  function resetSkySettingsToDefaults()
  {
    skySettings = cloneSkySettings(SKY_SETTINGS_DEFAULTS);
    saveSkySettings();
    uploadSkyUniforms();
    if (typeof refreshSkyEditor === 'function')
      refreshSkyEditor();
  }

  function skyVec3ToHex(v)
  {
    const r = Math.round(Math.max(0, Math.min(1, v[0])) * 255);
    const g = Math.round(Math.max(0, Math.min(1, v[1])) * 255);
    const b = Math.round(Math.max(0, Math.min(1, v[2])) * 255);
    return '#' + [ r, g, b ].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  function skyHexToVec3(hex)
  {
    const h = hex.replace('#', '');
    if (h.length !== 6)
      return [ 1, 1, 1 ];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  function uploadSkyUniforms()
  {
    if (!skyBackgroundDisplayProgram || !ulocsReady)
      return;
    gl.useProgram(skyBackgroundDisplayProgram);
    if (uloc_sky_horizonLine) gl.uniform1f(uloc_sky_horizonLine, skySettings.horizonLine);
    if (uloc_sky_dayHue) gl.uniform1f(uloc_sky_dayHue, skySettings.dayHue);
    if (uloc_sky_daySatLow) gl.uniform1f(uloc_sky_daySatLow, skySettings.daySatLow);
    if (uloc_sky_daySatHigh) gl.uniform1f(uloc_sky_daySatHigh, skySettings.daySatHigh);
    if (uloc_sky_dayValLow) gl.uniform1f(uloc_sky_dayValLow, skySettings.dayValLow);
    if (uloc_sky_dayValHigh) gl.uniform1f(uloc_sky_dayValHigh, skySettings.dayValHigh);
    if (uloc_sky_dayValPow) gl.uniform1f(uloc_sky_dayValPow, skySettings.dayValPow);
    if (uloc_sky_twilightTop) gl.uniform3fv(uloc_sky_twilightTop, skySettings.twilightTop);
    if (uloc_sky_twilightUpper) gl.uniform3fv(uloc_sky_twilightUpper, skySettings.twilightUpper);
    if (uloc_sky_twilightMid) gl.uniform3fv(uloc_sky_twilightMid, skySettings.twilightMid);
    if (uloc_sky_twilightLow) gl.uniform3fv(uloc_sky_twilightLow, skySettings.twilightLow);
    if (uloc_sky_twilightHorizon) gl.uniform3fv(uloc_sky_twilightHorizon, skySettings.twilightHorizon);
    if (uloc_sky_horizonDeepRed) gl.uniform3fv(uloc_sky_horizonDeepRed, skySettings.horizonDeepRed);
    if (uloc_sky_horizonBurntOrange) gl.uniform3fv(uloc_sky_horizonBurntOrange, skySettings.horizonBurntOrange);
    if (uloc_sky_horizonGold) gl.uniform3fv(uloc_sky_horizonGold, skySettings.horizonGold);
    if (uloc_sky_horizonPaleGold) gl.uniform3fv(uloc_sky_horizonPaleGold, skySettings.horizonPaleGold);
    if (uloc_sky_crepuscularColor) gl.uniform3fv(uloc_sky_crepuscularColor, skySettings.crepuscularColor);
    if (uloc_sky_crepuscularStrength) gl.uniform1f(uloc_sky_crepuscularStrength, skySettings.crepuscularStrength);
    if (uloc_sky_sunHorizAmplitude) gl.uniform1f(uloc_sky_sunHorizAmplitude, skySettings.sunHorizAmplitude);
    if (uloc_sky_sunVertScale) gl.uniform1f(uloc_sky_sunVertScale, skySettings.sunVertScale);
    if (uloc_sky_hazeMixStrength) gl.uniform1f(uloc_sky_hazeMixStrength, skySettings.hazeMixStrength);
    if (uloc_sky_hazeBoostStrength) gl.uniform1f(uloc_sky_hazeBoostStrength, skySettings.hazeBoostStrength);
    if (uloc_sky_starVisibility) gl.uniform1f(uloc_sky_starVisibility, guiControls.starVisibility);
    if (uloc_sky_starLightEmitStrength) gl.uniform1f(uloc_sky_starLightEmitStrength, guiControls.starLightEmitStrength);
    if (uloc_sky_starDensity) gl.uniform1f(uloc_sky_starDensity, guiControls.starDensity);
    if (uloc_sky_minShadowLight) gl.uniform1f(uloc_sky_minShadowLight, guiControls.minShadowLight);
    if (uloc_sky_timeOfDay) gl.uniform1f(uloc_sky_timeOfDay, guiControls.timeOfDay);
    if (uloc_sky_month) gl.uniform1f(uloc_sky_month, guiControls.month);
  }

  loadSkySettings();


  // ========================= Color Scale System =========================
  const COLOR_SCALE_CONFIGS = [
    { id: 'temperature',      name: 'Temperature',      col: 0,  stops: 131, interpolate: false },
    { id: 'airQuality',       name: 'Air Quality',      col: 1,  stops: 27, interpolate: false },
    { id: 'irDown',           name: 'IR Down Temp',     col: 2,  stops: 30, interpolate: false },
    { id: 'irUp',             name: 'IR Up Temp',       col: 3,  stops: 30, interpolate: false },
    { id: 'universal',        name: 'Universal',        col: 4,  stops: 33, interpolate: false },
    { id: 'waterVapor',       name: 'Water Vapor',      col: 5,  stops: 33, interpolate: true },
    { id: 'horizontalVelocity', name: 'Horizontal Velocity', col: 6,  stops: 33, interpolate: false },
    { id: 'verticalVelocity',   name: 'Vertical Velocity',   col: 7,  stops: 33, interpolate: false },
    { id: 'irHeating',        name: 'IR Heating/Cooling', col: 8,  stops: 33, interpolate: false },
    { id: 'precipMass',       name: 'Precip Mass',      col: 9,  stops: 33, interpolate: false },
    { id: 'precipHeat',       name: 'Precip Heat',      col: 10, stops: 33, interpolate: false },
    { id: 'precipVapor',      name: 'Precip Vapor',     col: 11, stops: 33, interpolate: false },
    { id: 'precipRain',       name: 'Rain Deposition',  col: 12, stops: 33, interpolate: false },
    { id: 'precipSnow',       name: 'Snow Deposition',  col: 13, stops: 33, interpolate: false },
    { id: 'soilMoisture',     name: 'Soil Moisture',    col: 14, stops: 33, interpolate: false },
    { id: 'curl',             name: 'Curl',             col: 15, stops: 33, interpolate: false },
    { id: 'temperatureChange',name: 'Temperature Change',col:16, stops: 33, interpolate: false },
    { id: 'cape',             name: 'CAPE',             col:17, stops: 72, interpolate: false },
    { id: 'radarReflectivity', name: 'Radar Reflectivity', col:18, stops: 36, interpolate: false },
    { id: 'radarVelocity',     name: 'Radar Velocity',     col: 19, stops: 33, interpolate: false },
    { id: 'radarCorrelation',  name: 'Radar Correlation',  col:20, stops: 22, interpolate: false },
    { id: 'radarEchoTops',     name: 'Radar Echo Tops',    col:21, stops: 32, interpolate: false },
    { id: 'pressure',          name: 'Pressure',           col:22, stops: 33, interpolate: false },
    { id: 'charge',            name: 'Charge',             col:23, stops: 33, interpolate: false },
    { id: 'relativeHumidity',  name: 'Relative Humidity',  col:24, stops: 33, interpolate: true },
    { id: 'humidityCloud',     name: 'Humidity Cloud',     col:60, stops: 33, interpolate: true },
    { id: 'cinh',             name: 'CINH',               col:25, stops: 33, interpolate: false },
    { id: 'liftedIndex',      name: 'Lifted Index',       col:26, stops: 33, interpolate: false },
    { id: 'pwat',             name: 'Precip Water',       col:27, stops: 33, interpolate: false },
    { id: 'drySlot',          name: 'Dry Slot',           col:28, stops: 33, interpolate: false },
    { id: 'lcl',              name: 'LCL',                col:29, stops: 33, interpolate: false },
    { id: 'lfc',              name: 'LFC',                col:30, stops: 33, interpolate: false },
    { id: 'el',               name: 'EL',                 col:31, stops: 33, interpolate: false },
    { id: 'fzl',              name: 'Freezing Level',     col:32, stops: 33, interpolate: false },
    { id: 'srh1km',           name: '0-1km SRH',          col:33, stops: 33, interpolate: false },
    { id: 'srh3km',           name: '0-3km SRH',          col:34, stops: 33, interpolate: false },
    { id: 'shear3km',         name: '0-3km Shear',        col:35, stops: 33, interpolate: false },
    { id: 'shear6km',         name: '0-6km Shear',        col:36, stops: 33, interpolate: false },
    { id: 'shear8km',         name: '0-8km Shear',        col:37, stops: 33, interpolate: false },
    { id: 'sri',              name: 'SRI',                col:38, stops: 33, interpolate: false },
    { id: 'lapse03',          name: 'Lapse 0-3km',        col:39, stops: 33, interpolate: false },
    { id: 'lapse36',          name: 'Lapse 3-6km',        col:40, stops: 33, interpolate: false },
    { id: 'stp',              name: 'STP',                col:41, stops: 33, interpolate: false },
    { id: 'vtp',              name: 'VTP',                col:42, stops: 33, interpolate: false },
    { id: 'dcape',            name: 'DCAPE',              col:43, stops: 33, interpolate: false },
    { id: 'hail',             name: 'Est. Hail',          col:44, stops: 33, interpolate: false },
    { id: 'lightning',        name: 'Lightning',          col:45, stops: 33, interpolate: false },
    { id: 'sfcPres',          name: 'Sfc Pressure',       col:46, stops: 33, interpolate: false },
    { id: 'lightningHotspots', name: 'Lightning Hotspots', col:47, stops: 33, interpolate: false },
    { id: 'hazardProb',        name: 'Hazard Probability', col:48, stops: 33, interpolate: false },
    { id: 'fireRisk',          name: 'Fire Risk',          col:49, stops: 33, interpolate: false },
    { id: 'radarZdr',          name: 'Radar ZDR',          col:50, stops: 33, interpolate: false },
    { id: 'radarKdp',          name: 'Radar KDP',          col:51, stops: 33, interpolate: false },
    { id: 'radarHca',          name: 'Radar HCA',          col:52, stops: 8,  interpolate: false },
    { id: 'radarTds',          name: 'Radar TDS',          col:53, stops: 33, interpolate: false },
    { id: 'radarMeso',         name: 'Radar Mesocyclone',  col:54, stops: 33, interpolate: false },
    { id: 'radarQpe',          name: 'Radar QPE',          col:55, stops: 33, interpolate: false },
    { id: 'radarVil',          name: 'Radar VIL',          col:56, stops: 33, interpolate: false },
    { id: 'radarAccum',        name: 'Radar Accumulation', col:57, stops: 33, interpolate: false },
    { id: 'hailSize',          name: 'Hail Size',          col:58, stops: 33, interpolate: true },
    { id: 'dropletSize',       name: 'Droplet Size',       col:59, stops: 33, interpolate: true },
  ];

  const DEFAULT_IR_PALETTE = [
    [255,178,255],[255,128,255],[255, 77,255],[204,  0,204],[166,  0,153],
    [128,  0,128],[ 89,  0,153],[  0,  0,178],[  0,  0,255],[  0, 77,255],
    [  0,112,255],[  0,158,255],[  0,204,255],[  0,255,255],[  0,128,  0],
    [  0,156,  0],[  0,184,  0],[  0,217,  0],[  0,255,  0],[128,255,  0],
    [204,255,  0],[255,255,  0],[255,204,  0],[255,153,  0],[255,102,  0],
    [255,  0,  0],[217,  0,  0],[184,  0,  0],[156,  0,  0],[133,  0,  0]
  ];

  let colorScaleData = {};
  let colorScaleValues = {};

  function initColorScaleData(img) {
    const offC = document.createElement('canvas');
    offC.width = img.width; offC.height = img.height;
    const ctx2d = offC.getContext('2d');
    ctx2d.drawImage(img, 0, 0);
    function readCol(col, n) {
      const arr = [];
      for (let i = 0; i < n; i++) {
        const px = ctx2d.getImageData(col, i, 1, 1).data;
        arr.push([px[0], px[1], px[2]]);
      }
      return arr;
    }
    colorScaleData.temperature = readCol(0, 131);
    colorScaleValues.temperature = Array.from({length: 131}, (_, i) => -71 + i);
    colorScaleData.airQuality  = readCol(1, 27);
    colorScaleValues.airQuality = Array.from({length: 27}, (_, i) => i);
    colorScaleData.irDown      = DEFAULT_IR_PALETTE.map(c => [...c]);
    colorScaleValues.irDown = Array.from({length: DEFAULT_IR_PALETTE.length}, (_, i) => i);
    colorScaleData.irUp        = DEFAULT_IR_PALETTE.map(c => [...c]);
    colorScaleValues.irUp = Array.from({length: DEFAULT_IR_PALETTE.length}, (_, i) => i);
    const univ = [];
    for (let i = 0; i <= 32; i++) {
      if      (i <  16) univ.push([Math.round(i / 16 * 255), Math.round(i / 16 * 255), 255]);
      else if (i == 16) univ.push([255, 255, 255]);
      else              univ.push([255, Math.round((32 - i) / 16 * 255), Math.round((32 - i) / 16 * 255)]);
    }
    colorScaleData.universal = univ;
    colorScaleValues.universal = Array.from({length: 33}, (_, i) => i);
    const cloneScale = s => s.map(c => [...c]);
    const cloneValues = n => Array.from({length: n}, (_, i) => i);
    colorScaleData.horizontalVelocity = cloneScale(univ);
    colorScaleValues.horizontalVelocity = cloneValues(33);
    colorScaleData.verticalVelocity = cloneScale(univ);
    colorScaleValues.verticalVelocity = cloneValues(33);
    colorScaleData.irHeating = cloneScale(univ);
    colorScaleValues.irHeating = cloneValues(33);
    colorScaleData.precipMass = cloneScale(univ);
    colorScaleValues.precipMass = cloneValues(33);
    colorScaleData.precipHeat = cloneScale(univ);
    colorScaleValues.precipHeat = cloneValues(33);
    colorScaleData.precipVapor = cloneScale(univ);
    colorScaleValues.precipVapor = cloneValues(33);
    colorScaleData.precipRain = cloneScale(univ);
    colorScaleValues.precipRain = cloneValues(33);
    colorScaleData.precipSnow = cloneScale(univ);
    colorScaleValues.precipSnow = cloneValues(33);
    colorScaleData.soilMoisture = cloneScale(univ);
    colorScaleValues.soilMoisture = cloneValues(33);
    colorScaleData.curl = cloneScale(univ);
    colorScaleValues.curl = cloneValues(33);

    // Water vapor: idx 0 = dry (black) → idx 32 = saturated (white/cyan)
    // Used with unipolar mapping: val = water * 0.06, idx = clamp(val,0,1)*32
    const wv = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32; // 0=dry, 1=saturated
      if (t < 0.25) {
        const f = t / 0.25;
        wv.push([0, 0, Math.round(f * 120)]);           // black → dark blue
      } else if (t < 0.55) {
        const f = (t - 0.25) / 0.30;
        wv.push([0, Math.round(f * 60), Math.round(120 + f * 110)]);  // dark blue → medium blue
      } else if (t < 0.80) {
        const f = (t - 0.55) / 0.25;
        wv.push([0, Math.round(60 + f * 170), Math.round(230 + f * 25)]);  // medium blue → cyan
      } else {
        const f = (t - 0.80) / 0.20;
        wv.push([Math.round(f * 255), 230, 255]);       // cyan → white
      }
    }
    colorScaleData.waterVapor = wv;
    colorScaleValues.waterVapor = Array.from({length: 33}, (_, i) => i);

    const tempChange = [];
    for (let i = 0; i <= 32; i++) {
      const t = (i / 32) * 2.0 - 1.0;
      if (t < 0.0) {
        const f = 1.0 + t;
        tempChange.push([Math.round(f * 255), Math.round(f * 255), 255]);
      } else {
        const f = 1.0 - t;
        tempChange.push([255, Math.round(f * 255), Math.round(f * 255)]);
      }
    }
    colorScaleData.temperatureChange = tempChange;
    colorScaleValues.temperatureChange = Array.from({length: 33}, (_, i) => i);

    // CAPE color scale: 0-10000 J/Kg mapped to 72 stops
    // Colors: White -> Pale light blue -> Dark desat blue -> Lime Green -> Yellow -> Red -> Dark red -> Pink -> Dark Grey -> Bright sat light blue
    const cape = [];
    const capeStops = [
      { idx: 0,   val: 0,    col: [10,  10,  20]  },    // Near black (no CAPE)
      { idx: 1,   val: 100,  col: [20,  40,  80]  },    // Dark blue
      { idx: 4,   val: 500,  col: [0,   100, 200] },    // Blue
      { idx: 6,   val: 750,  col: [50,  205, 50]  },    // Lime Green
      { idx: 7,   val: 1000, col: [255, 255, 0]   },    // Yellow
      { idx: 18,  val: 2500, col: [255, 0,   0]   },    // Red
      { idx: 22,  val: 3000, col: [139, 0,   0]   },    // Dark red
      { idx: 29,  val: 4000, col: [255, 105, 180] },    // Pink
      { idx: 36,  val: 5000, col: [80,  80,  80]  },    // Dark Grey
      { idx: 71,  val: 10000,col: [0,   191, 255] },    // DeepSkyBlue
    ];
    for (let i = 0; i < 72; i++) {
      // Find which segment this stop belongs to
      let segStart = capeStops[0], segEnd = capeStops[capeStops.length - 1];
      for (let j = 0; j < capeStops.length - 1; j++) {
        if (i >= capeStops[j].idx && i <= capeStops[j + 1].idx) {
          segStart = capeStops[j];
          segEnd = capeStops[j + 1];
          break;
        }
      }
      // Interpolate
      const t = segStart.idx === segEnd.idx ? 0 : (i - segStart.idx) / (segEnd.idx - segStart.idx);
      const r = Math.round(segStart.col[0] + t * (segEnd.col[0] - segStart.col[0]));
      const g = Math.round(segStart.col[1] + t * (segEnd.col[1] - segStart.col[1]));
      const b = Math.round(segStart.col[2] + t * (segEnd.col[2] - segStart.col[2]));
      cape.push([r, g, b]);
    }
    colorScaleData.cape = cape;
    // Initialize CAPE values based on the capeStops definition
    colorScaleValues.cape = [];
    for (let i = 0; i < 72; i++) {
      // Find which segment this index belongs to and interpolate the value
      let segStart = capeStops[0], segEnd = capeStops[capeStops.length - 1];
      for (let j = 0; j < capeStops.length - 1; j++) {
        if (i >= capeStops[j].idx && i <= capeStops[j + 1].idx) {
          segStart = capeStops[j];
          segEnd = capeStops[j + 1];
          break;
        }
      }
      const t = segStart.idx === segEnd.idx ? 0 : (i - segStart.idx) / (segEnd.idx - segStart.idx);
      const value = segStart.val + t * (segEnd.val - segStart.val);
      colorScaleValues.cape.push(value);
    }

    // Radar reflectivity: 36 stops with integer dBZ values (0-87 dBZ, 3 dBZ/stop)
    colorScaleData.radarReflectivity = [
      [  4,  4,  4],  //  0 dBZ  ND
      [  2,120,120],  //  3 dBZ  (gradient)
      [  0,236,236],  //  6 dBZ  light cyan
      [  1,198,241],  //  9 dBZ  (gradient)
      [  1,160,246],  // 12 dBZ  sky blue
      [  1, 80,246],  // 15 dBZ  (gradient)
      [  0,  0,246],  // 18 dBZ  blue
      [  0,128,  0],  // 21 dBZ  (gradient - jump to green family)
      [  0,255,  0],  // 24 dBZ  green
      [  0,228,  0],  // 27 dBZ  (gradient)
      [  0,200,  0],  // 30 dBZ  medium green
      [  0,172,  0],  // 33 dBZ  (gradient)
      [  0,144,  0],  // 36 dBZ  dark green
      [128,200,  0],  // 39 dBZ  (gradient)
      [255,255,  0],  // 42 dBZ  yellow
      [243,224,  0],  // 45 dBZ  (gradient)
      [231,192,  0],  // 48 dBZ  dark yellow
      [243,168,  0],  // 51 dBZ  (gradient)
      [255,144,  0],  // 54 dBZ  orange
      [255, 72,  0],  // 57 dBZ  (gradient)
      [255,  0,  0],  // 60 dBZ  red
      [235,  0,  0],  // 63 dBZ  (gradient)
      [214,  0,  0],  // 66 dBZ  dark red
      [203,  0,  0],  // 69 dBZ  (gradient)
      [192,  0,  0],  // 72 dBZ  darker red
      [224,  0,128],  // 75 dBZ  (gradient)
      [255,  0,255],  // 78 dBZ  magenta
      [204, 43,228],  // 81 dBZ  (gradient)
      [153, 85,201],  // 84 dBZ  purple
      [194,160,218],  // 87 dBZ  light grey
      [245,245,245],  // 90 dBZ  (gradient)
      [255,255,255],  // 93 dBZ  white
      [255,255,255],  // 96 dBZ
      [255,255,255],  // 99 dBZ
      [255,255,255],  // 102 dBZ
      [255,255,255],  // 105 dBZ
    ];
    colorScaleValues.radarReflectivity = Array.from({length: 36}, (_, i) => i * 3); // 0-105 dBZ in 3 dBZ steps

    // Radar velocity: 33 stops with gradients (odd number so center is at index 16)
    colorScaleData.radarVelocity = [
      [ 49,  0,196],  // strong inbound
      [ 25,  0,221],  // (gradient)
      [  0,  0,246],
      [  0, 72,246],  // (gradient)
      [  0,144,246],
      [  0,190,241],  // (gradient)
      [  0,236,236],
      [  0,246,118],  // (gradient)
      [  0,255,  0],
      [  0,228,  0],  // (gradient)
      [  0,200,  0],
      [  0,172,  0],  // (gradient)
      [  0,144,  0],
      [  0,117,  0],  // (gradient)
      [  0, 90,  0],
      [ 64, 96, 64],  // (gradient to grey)
      [128,128,128],  // zero / no data (center at index 16)
      [128,128,128],  // duplicate zero for exact center at t=0.5
      [136, 64, 64],  // (gradient)
      [144,  0,  0],
      [172,  0,  0],  // (gradient)
      [200,  0,  0],
      [228,  0,  0],  // (gradient)
      [255,  0,  0],
      [246, 77,  0],  // (gradient)
      [236,154,  0],
      [241,177,  0],  // (gradient)
      [246,200,  0],
      [251,228,  0],  // (gradient)
      [255,255,255],
      [255,128,255],  // (gradient)
      [255,  0,255],
      [255,  0,255],  // strong outbound
    ];
    colorScaleValues.radarVelocity = Array.from({length: 33}, (_, i) => i);

    // Radar CC / rhoHV — NWS-style 0.2–1.0 (low=blue/grey, high=dark maroon)
    colorScaleData.radarCorrelation = [
      [ 45, 45, 45],   // 0.20
      [ 30, 30, 90],   // 0.24
      [  0,  0,110],   // 0.28
      [  0,  0,170],   // 0.32
      [  0,  0,230],   // 0.36
      [  0, 70,255],   // 0.40
      [  0,130,255],   // 0.44
      [  0,190,255],   // 0.48
      [  0,240,220],   // 0.52
      [  0,255,150],   // 0.56
      [  0,230, 70],   // 0.60
      [ 90,255,  0],   // 0.64
      [170,255,  0],   // 0.68
      [255,255,  0],   // 0.72
      [255,220,  0],   // 0.76
      [255,175,  0],   // 0.80
      [255,130,  0],   // 0.84
      [255, 85,  0],   // 0.88
      [255, 35,  0],   // 0.92
      [255,  0,  0],   // 0.96
      [190,  0, 35],   // 0.98
      [125,  0, 45],   // 1.00
    ];
    colorScaleValues.radarCorrelation = Array.from({length: 22}, (_, i) => 0.2 + (i / 21) * 0.8);

    // Radar echo tops: doubled to 32 stops (0-60 kft)
    colorScaleData.radarEchoTops = [
      [  0,  0,  0],  //  0 kft
      [  0,  0, 50],  // (gradient)
      [  0,  0,100],  //  4 kft
      [  0,  0,150],  // (gradient)
      [  0,  0,200],  //  8 kft
      [  0, 30,228],  // (gradient)
      [  0, 60,255],  // 12 kft
      [  0,110,255],  // (gradient)
      [  0,160,255],  // 16 kft
      [  0,208,228],  // (gradient)
      [  0,255,200],  // 20 kft
      [  0,255,150],  // (gradient)
      [  0,255,100],  // 24 kft
      [  0,255, 50],  // (gradient)
      [  0,255,  0],  // 28 kft
      [ 50,255,  0],  // (gradient)
      [100,255,  0],  // 32 kft
      [150,255,  0],  // (gradient)
      [200,255,  0],  // 36 kft
      [228,255,  0],  // (gradient)
      [255,255,  0],  // 40 kft
      [255,218,  0],  // (gradient)
      [255,180,  0],  // 44 kft
      [255,140,  0],  // (gradient)
      [255,100,  0],  // 48 kft
      [255, 65,  0],  // (gradient)
      [255, 30,  0],  // 52 kft
      [228, 15, 40],  // (gradient)
      [200,  0, 80],  // 56 kft
      [170,  0,130],  // (gradient)
      [140,  0,180],  // 60 kft
      [140,  0,180],
    ];
    colorScaleValues.radarEchoTops = Array.from({length: 32}, (_, i) => i * 2); // 0-60 kft in ~2 kft steps

    buildPalette('radarZdr', 33, -1, 5, [
      {t: 0, c: [40, 40, 100]}, {t: 0.35, c: [0, 180, 255]}, {t: 0.55, c: [0, 255, 120]},
      {t: 0.75, c: [255, 255, 0]}, {t: 1, c: [255, 80, 0]},
    ]);
    buildPalette('radarKdp', 33, 0, 8, [
      {t: 0, c: [20, 40, 80]}, {t: 0.4, c: [0, 160, 120]}, {t: 0.7, c: [255, 220, 0]}, {t: 1, c: [255, 0, 80]},
    ]);
    colorScaleData.radarHca = [
      [60, 60, 60], [0, 120, 255], [180, 220, 255], [255, 200, 0],
      [255, 80, 0], [120, 255, 80], [255, 0, 255], [255, 40, 40],
    ];
    colorScaleValues.radarHca = [0, 1, 2, 3, 4, 5, 6, 7];
    buildPalette('radarTds', 33, 0, 1, [
      {t: 0, c: [30, 30, 60]}, {t: 0.35, c: [180, 0, 180]}, {t: 0.65, c: [255, 80, 0]}, {t: 1, c: [255, 255, 100]},
    ]);
    buildPalette('radarMeso', 33, 0, 1, [
      {t: 0, c: [25, 25, 70]}, {t: 0.4, c: [0, 200, 100]}, {t: 0.7, c: [255, 255, 0]}, {t: 1, c: [255, 0, 0]},
    ]);
    buildPalette('radarQpe', 33, 0, 100, [
      {t: 0, c: [20, 50, 30]}, {t: 0.25, c: [0, 160, 80]}, {t: 0.55, c: [255, 255, 0]},
      {t: 0.8, c: [255, 100, 0]}, {t: 1, c: [200, 0, 120]},
    ]);
    buildPalette('radarVil', 33, 0, 80, [
      {t: 0, c: [30, 30, 80]}, {t: 0.4, c: [0, 200, 255]}, {t: 0.7, c: [255, 220, 0]}, {t: 1, c: [255, 0, 0]},
    ]);
    buildPalette('radarAccum', 33, 0, 75, [
      {t: 0, c: [40, 60, 40]}, {t: 0.2, c: [0, 140, 80]}, {t: 0.5, c: [255, 255, 0]},
      {t: 0.75, c: [255, 120, 0]}, {t: 1, c: [180, 0, 80]},
    ]);

    // Pressure: blue (low) → white (neutral) → red (high), bipolar 33 stops
    const pressureScale = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32; // 0=low, 0.5=neutral, 1=high
      if (t < 0.5) {
        const f = t / 0.5;
        pressureScale.push([Math.round(f * 255), Math.round(f * 255), 255]); // blue → white
      } else {
        const f = (t - 0.5) / 0.5;
        pressureScale.push([255, Math.round((1 - f) * 255), Math.round((1 - f) * 255)]); // white → red
      }
    }
    colorScaleData.pressure = pressureScale;
    colorScaleValues.pressure = Array.from({length: 33}, (_, i) => i);

    // Charge: deep blue (strong negative) → cyan → white (neutral) → yellow → deep red (strong positive)
    // Bipolar 33 stops. Negative = blue family, positive = red/orange family.
    const chargeScale = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32; // 0=max negative, 0.5=neutral, 1=max positive
      if (t < 0.5) {
        // Negative side: deep blue → cyan → white
        const f = t / 0.5; // 0→1 as charge goes from max-neg to neutral
        if (f < 0.5) {
          // deep blue → cyan
          const g = f / 0.5;
          chargeScale.push([0, Math.round(g * 220), 255]);
        } else {
          // cyan → white
          const g = (f - 0.5) / 0.5;
          chargeScale.push([Math.round(g * 255), 220 + Math.round(g * 35), 255]);
        }
      } else {
        // Positive side: white → yellow → deep red
        const f = (t - 0.5) / 0.5; // 0→1 as charge goes from neutral to max-pos
        if (f < 0.5) {
          // white → yellow/orange
          const g = f / 0.5;
          chargeScale.push([255, Math.round(255 - g * 100), Math.round(255 - g * 255)]);
        } else {
          // orange → deep red
          const g = (f - 0.5) / 0.5;
          chargeScale.push([255, Math.round(155 - g * 155), 0]);
        }
      }
    }
    colorScaleData.charge = chargeScale;
    colorScaleValues.charge = Array.from({length: 33}, (_, i) => i);

    // Relative Humidity + clouds: columns 2–3 from ColorScales.png (master layout)
    const rhKeys = readCol(2, 11);
    const rhStops = 33;
    colorScaleData.relativeHumidity = [];
    colorScaleValues.relativeHumidity = [];
    for (let i = 0; i < rhStops; i++) {
      const pct = (i / (rhStops - 1)) * 99;
      colorScaleValues.relativeHumidity.push(pct);
      const t = i / (rhStops - 1);
      const pos = t * (rhKeys.length - 1);
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, rhKeys.length - 1);
      const lt = pos - i0;
      const c0 = rhKeys[i0];
      const c1 = rhKeys[i1];
      colorScaleData.relativeHumidity.push([
        Math.round(c0[0] + (c1[0] - c0[0]) * lt),
        Math.round(c0[1] + (c1[1] - c0[1]) * lt),
        Math.round(c0[2] + (c1[2] - c0[2]) * lt),
      ]);
    }
    const cloudKeys = readCol(3, 16);
    const cloudStops = 33;
    colorScaleData.humidityCloud = [];
    colorScaleValues.humidityCloud = [];
    for (let i = 0; i < cloudStops; i++) {
      const dens = (i / (cloudStops - 1)) * 10;
      colorScaleValues.humidityCloud.push(dens);
      const t = i / (cloudStops - 1);
      const pos = t * (cloudKeys.length - 1);
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, cloudKeys.length - 1);
      const lt = pos - i0;
      const c0 = cloudKeys[i0];
      const c1 = cloudKeys[i1];
      colorScaleData.humidityCloud.push([
        Math.round(c0[0] + (c1[0] - c0[0]) * lt),
        Math.round(c0[1] + (c1[1] - c0[1]) * lt),
        Math.round(c0[2] + (c1[2] - c0[2]) * lt),
      ]);
    }

    function lerpRgb(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    }
    function buildPalette(id, n, minVal, maxVal, keys) {
      const colors = [];
      const values = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        values.push(minVal + t * (maxVal - minVal));
        let c0 = keys[0].c, c1 = keys[keys.length - 1].c;
        for (let k = 0; k < keys.length - 1; k++) {
          if (t >= keys[k].t && t <= keys[k + 1].t) {
            c0 = keys[k].c;
            c1 = keys[k + 1].c;
            const lt = (t - keys[k].t) / (keys[k + 1].t - keys[k].t || 1);
            colors.push(lerpRgb(c0, c1, lt));
            break;
          }
        }
        if (colors.length <= i)
          colors.push(lerpRgb(keys[0].c, keys[keys.length - 1].c, t));
      }
      colorScaleData[id] = colors;
      colorScaleValues[id] = values;
    }
    const n33 = 33;
    buildPalette('cinh', n33, -250, 0, [
      {t: 0, c: [180, 0, 0]}, {t: 0.5, c: [255, 200, 0]}, {t: 1, c: [40, 80, 180]},
    ]);
    buildPalette('liftedIndex', n33, -6, 6, [
      {t: 0, c: [0, 180, 0]}, {t: 0.5, c: [255, 255, 255]}, {t: 1, c: [200, 0, 0]},
    ]);
    buildPalette('pwat', n33, 0, 80, [
      {t: 0, c: [160, 120, 60]}, {t: 0.4, c: [0, 140, 80]}, {t: 1, c: [0, 80, 220]},
    ]);
    buildPalette('drySlot', n33, 0, 1, [
      {t: 0, c: [30, 60, 120]}, {t: 0.5, c: [180, 140, 80]}, {t: 1, c: [220, 80, 20]},
    ]);
    buildPalette('lcl', n33, 0, 4000, [
      {t: 0, c: [0, 160, 0]}, {t: 0.5, c: [255, 255, 0]}, {t: 1, c: [200, 0, 0]},
    ]);
    buildPalette('lfc', n33, 0, 12000, [
      {t: 0, c: [20, 80, 180]}, {t: 0.5, c: [0, 200, 100]}, {t: 1, c: [255, 220, 0]},
    ]);
    buildPalette('el', n33, 0, 16000, [
      {t: 0, c: [40, 40, 100]}, {t: 0.5, c: [120, 0, 180]}, {t: 1, c: [255, 100, 0]},
    ]);
    buildPalette('fzl', n33, 0, 6000, [
      {t: 0, c: [180, 220, 255]}, {t: 0.5, c: [100, 180, 255]}, {t: 1, c: [20, 60, 160]},
    ]);
    buildPalette('srh1km', n33, 0, 350, [
      {t: 0, c: [60, 60, 60]}, {t: 0.4, c: [255, 255, 0]}, {t: 1, c: [255, 0, 0]},
    ]);
    buildPalette('srh3km', n33, 0, 600, [
      {t: 0, c: [60, 60, 60]}, {t: 0.4, c: [255, 200, 0]}, {t: 1, c: [200, 0, 200]},
    ]);
    buildPalette('shear3km', n33, 0, 40, [
      {t: 0, c: [0, 100, 0]}, {t: 0.5, c: [255, 255, 0]}, {t: 1, c: [255, 0, 0]},
    ]);
    buildPalette('shear6km', n33, 0, 60, [
      {t: 0, c: [0, 80, 160]}, {t: 0.5, c: [255, 200, 0]}, {t: 1, c: [200, 0, 80]},
    ]);
    buildPalette('shear8km', n33, 0, 70, [
      {t: 0, c: [40, 40, 120]}, {t: 0.5, c: [200, 100, 255]}, {t: 1, c: [255, 60, 0]},
    ]);
    buildPalette('sri', n33, 0, 25, [
      {t: 0, c: [80, 80, 120]}, {t: 0.5, c: [255, 200, 0]}, {t: 1, c: [255, 40, 40]},
    ]);
    buildPalette('lapse03', n33, 4, 10, [
      {t: 0, c: [0, 100, 200]}, {t: 0.5, c: [255, 255, 0]}, {t: 1, c: [200, 0, 0]},
    ]);
    buildPalette('lapse36', n33, 4, 10, [
      {t: 0, c: [80, 0, 160]}, {t: 0.5, c: [0, 200, 100]}, {t: 1, c: [255, 120, 0]},
    ]);
    buildPalette('stp', n33, 0, 10, [
      {t: 0, c: [30, 30, 60]}, {t: 0.3, c: [255, 255, 0]}, {t: 0.7, c: [255, 100, 0]}, {t: 1, c: [255, 0, 255]},
    ]);
    buildPalette('vtp', n33, 0, 12, [
      {t: 0, c: [20, 40, 80]}, {t: 0.5, c: [255, 80, 0]}, {t: 1, c: [255, 0, 200]},
    ]);
    buildPalette('dcape', n33, 0, 3000, [
      {t: 0, c: [20, 40, 80]}, {t: 0.5, c: [255, 200, 0]}, {t: 1, c: [200, 0, 0]},
    ]);
    buildPalette('hail', n33, 0, 4, [
      {t: 0, c: [40, 80, 40]}, {t: 0.4, c: [255, 255, 0]}, {t: 0.7, c: [255, 100, 0]}, {t: 1, c: [200, 0, 200]},
    ]);
    buildPalette('lightning', n33, 0, 6, [
      {t: 0, c: [20, 20, 50]}, {t: 0.3, c: [255, 200, 0]}, {t: 1, c: [255, 255, 100]},
    ]);
    buildPalette('sfcPres', n33, 900, 1050, [
      {t: 0, c: [200, 0, 0]}, {t: 0.5, c: [255, 255, 255]}, {t: 1, c: [0, 80, 200]},
    ]);
    buildPalette('lightningHotspots', n33, 0, 10, [
      {t: 0, c: [8, 8, 28]},
      {t: 0.15, c: [30, 20, 80]},
      {t: 0.35, c: [120, 40, 180]},
      {t: 0.55, c: [255, 120, 0]},
      {t: 0.75, c: [255, 230, 80]},
      {t: 1, c: [255, 255, 255]},
    ]);
    buildPalette('hazardProb', n33, 0, 100, [
      {t: 0, c: [20, 40, 20]},
      {t: 0.15, c: [0, 160, 0]},
      {t: 0.35, c: [255, 255, 0]},
      {t: 0.55, c: [255, 136, 0]},
      {t: 0.75, c: [255, 0, 0]},
      {t: 1, c: [255, 0, 255]},
    ]);
    buildPalette('fireRisk', n33, 0, 80, [
      {t: 0, c: [0, 180, 0]},
      {t: 0.2, c: [180, 255, 0]},
      {t: 0.45, c: [255, 255, 0]},
      {t: 0.65, c: [255, 136, 0]},
      {t: 0.85, c: [255, 68, 0]},
      {t: 1, c: [255, 0, 0]},
    ]);
    buildPalette('hailSize', n33, 0, 100, [
      {t: 0, c: [8, 12, 28]},
      {t: 0.2, c: [0, 120, 220]},
      {t: 0.45, c: [0, 220, 120]},
      {t: 0.65, c: [255, 255, 0]},
      {t: 0.85, c: [255, 120, 0]},
      {t: 1, c: [255, 40, 40]},
    ]);
    buildPalette('dropletSize', n33, 0, 100, [
      {t: 0, c: [6, 10, 24]},
      {t: 0.25, c: [0, 80, 200]},
      {t: 0.5, c: [0, 200, 255]},
      {t: 0.75, c: [120, 255, 180]},
      {t: 1, c: [255, 255, 255]},
    ]);
  }

  function uploadColorScaleTexture() {
    // radarReflectivity is initialized in initColorScaleData, not here
    const TEX_W = COLOR_SCALE_CONFIGS.length;
    const TEX_H = Math.max(...COLOR_SCALE_CONFIGS.map(cfg => cfg.stops), 131);
    const offC = document.createElement('canvas');
    offC.width = TEX_W; offC.height = TEX_H;
    const ctx2d = offC.getContext('2d');
    COLOR_SCALE_CONFIGS.forEach(cfg => {
      const stops = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      // If interpolation is enabled for this scale, interpolate across full texture height based on value range
      if (cfg.interpolate) {
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const valueRange = maxValue - minValue || 1;
        for (let row = 0; row < TEX_H; row++) {
          const t = row / (TEX_H - 1);
          const targetValue = minValue + t * valueRange;
          
          // Find the two stops to interpolate between based on targetValue
          let idxFloor = 0;
          let idxCeil = stops.length - 1;
          for (let i = 0; i < values.length - 1; i++) {
            if (targetValue >= values[i] && targetValue <= values[i + 1]) {
              idxFloor = i;
              idxCeil = i + 1;
              break;
            }
          }
          
          const localT = valueRange > 0 ? (targetValue - values[idxFloor]) / (values[idxCeil] - values[idxFloor] || 1) : 0;
          const c1 = stops[idxFloor];
          const c2 = stops[idxCeil];
          const r = Math.round(c1[0] + localT * (c2[0] - c1[0]));
          const g = Math.round(c1[1] + localT * (c2[1] - c1[1]));
          const b = Math.round(c1[2] + localT * (c2[2] - c1[2]));
          ctx2d.fillStyle = `rgb(${r},${g},${b})`;
          ctx2d.fillRect(cfg.col, row, 1, 1);
        }
      } else {
        // Original behavior: place colors at their index positions
        for (let row = 0; row < stops.length; row++) {
          const [r, g, b] = stops[row];
          ctx2d.fillStyle = `rgb(${r},${g},${b})`;
          ctx2d.fillRect(cfg.col, row, 1, 1);
        }
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offC);
    // Use LINEAR filtering for scales with interpolation enabled, NEAREST otherwise
    const anyInterpolate = COLOR_SCALE_CONFIGS.some(cfg => cfg.interpolate);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, anyInterpolate ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, anyInterpolate ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  sampleSoundingColorScale = function(scaleId, value, minVal, maxVal) {
    const stops = colorScaleData[scaleId];
    if (!stops || !stops.length) return [10, 10, 20];
    const range = maxVal - minVal || 1;
    const normalized = Math.max(0, Math.min(1, (value - minVal) / range));
    const idx = Math.round(normalized * (stops.length - 1));
    return stops[idx];
  };

  function buildColorScaleEditor() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #colorScalePanel{display:none;position:fixed;top:50px;right:420px;width:520px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10000;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .cse-hdr{display:flex;align-items:center;gap:8px;padding:11px 15px;
        background:linear-gradient(135deg,#191930,#0e0e22);
        border-bottom:1px solid #252540;cursor:move;user-select:none;flex-shrink:0;}
      .cse-hdr span{font-size:14px;font-weight:700;flex:1;}
      .cse-close{background:rgba(255,255,255,0.07);border:none;color:#777;cursor:pointer;
        font-size:12px;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;}
      .cse-close:hover{background:rgba(220,60,60,0.35);color:#fff;}
      .cse-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .cse-body::-webkit-scrollbar{width:4px;}
      .cse-body::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .cse-tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px;}
      .cse-tab{padding:5px 11px;border:1px solid #252540;border-radius:20px;
        background:#13131f;color:#5a6070;cursor:pointer;font-size:11px;
        font-weight:600;transition:all 0.15s;}
      .cse-tab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .cse-tab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .cse-grad{height:32px;border-radius:6px;margin-bottom:12px;border:1px solid #252540;}
      .cse-stops{display:flex;flex-direction:column;gap:2px;margin-bottom:12px;
        max-height:240px;overflow-y:auto;
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .cse-stops::-webkit-scrollbar{width:4px;}
      .cse-stops::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .cse-stop{display:flex;align-items:center;gap:6px;padding:3px 6px;
        border-radius:5px;cursor:pointer;border:1px solid transparent;}
      .cse-stop:hover{background:#191930;}
      .cse-stop.selected{background:#121c40;border-color:#2a3a80;}
      .cse-stop-idx{width:22px;font-size:10px;color:#3a3a60;text-align:right;
        flex-shrink:0;font-weight:600;}
      .cse-stop input[type=color]{width:38px;height:24px;border:1px solid #252540;
        border-radius:4px;padding:1px;cursor:pointer;flex-shrink:0;background:#0d0d18;}
      .cse-stop-val{flex:1;height:24px;border:1px solid #252540;border-radius:4px;
        background:#0d0d18;color:#c0c0d0;font-size:11px;text-align:right;
        padding:2px 7px;min-width:0;box-sizing:border-box;}
      .cse-stop-val:focus{outline:none;border-color:#3050c0;}
      .cse-stop-btns{display:flex;gap:3px;flex-shrink:0;}
      .cse-btn-sm{padding:2px 8px;border:1px solid #252540;border-radius:4px;
        background:#181828;color:#666;cursor:pointer;font-size:10px;
        font-weight:600;transition:all 0.12s;}
      .cse-btn-sm:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .cse-btn-sm.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .cse-controls{display:flex;gap:6px;margin-bottom:8px;}
      .cse-ctrl-btn{flex:1;padding:7px 4px;border:1px solid #252540;border-radius:5px;
        background:#181828;color:#777;cursor:pointer;font-size:11px;font-weight:600;
        transition:all 0.12s;text-align:center;}
      .cse-ctrl-btn:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .cse-ctrl-btn.add{background:#1a4030;border-color:#2a6040;color:#70c090;}
      .cse-ctrl-btn.add:hover{background:#1e5038;color:#90e0b0;}
      .cse-ctrl-btn.remove{background:#401828;border-color:#602030;color:#c06070;}
      .cse-ctrl-btn.remove:hover{background:#501830;color:#e08090;}
      .cse-ctrl-btn.copy{background:#182840;border-color:#203860;color:#6090c0;}
      .cse-ctrl-btn.copy:hover{background:#203050;color:#80b0e0;}
      .cse-ctrl-btn.paste{background:#282040;border-color:#382860;color:#8070c0;}
      .cse-ctrl-btn.paste:hover{background:#302850;color:#a090e0;}
      .cse-offset-row{display:flex;gap:4px;margin-bottom:8px;align-items:center;}
      .cse-offset-lbl{font-size:10px;color:#4a5060;text-transform:uppercase;
        letter-spacing:1px;font-weight:600;flex-shrink:0;margin-right:2px;}
      .cse-offset-btn{flex:1;padding:5px 2px;border:1px solid #252540;border-radius:4px;
        background:#181828;color:#666;cursor:pointer;font-size:10px;font-weight:700;
        text-align:center;transition:all 0.12s;}
      .cse-offset-btn:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .cse-offset-btn.neg{color:#c06070;}
      .cse-offset-btn.neg:hover{background:#401828;color:#e08090;border-color:#602030;}
      .cse-divider{border-top:1px solid #1c1c30;margin:10px -15px 12px;}
      .cse-opt-row{display:flex;align-items:center;margin-bottom:10px;padding:8px 10px;
        background:#0e0e1a;border:1px solid #1e1e38;border-radius:6px;}
      .cse-opt-lbl{display:flex;align-items:center;gap:8px;color:#888;font-size:12px;cursor:pointer;}
      .cse-opt-lbl input[type=checkbox]{width:15px;height:15px;cursor:pointer;accent-color:#4a90e2;}
      .cse-io-lbl{font-size:10px;color:#4a5060;text-transform:uppercase;
        letter-spacing:1.2px;font-weight:600;margin-bottom:6px;}
      .cse-format-row{display:flex;gap:8px;margin-bottom:8px;align-items:center;}
      .cse-format-sel{flex:1;padding:6px 9px;border:1px solid #252540;border-radius:5px;
        background:#0b0b17;color:#c0c0d0;font-size:11px;outline:none;}
      .cse-json{width:100%;height:110px;background:#080812;color:#b0c0b0;
        border:1px solid #252540;border-radius:5px;padding:7px;font-size:11px;
        resize:vertical;box-sizing:border-box;font-family:monospace;}
      .cse-json:focus{outline:none;border-color:#3050c0;}
      .cse-btns{display:flex;gap:8px;margin-top:8px;}
      .cse-btn{flex:1;padding:8px;border:none;border-radius:5px;cursor:pointer;
        font-size:12px;font-weight:700;color:#fff;transition:filter 0.12s;}
      .cse-btn:hover{filter:brightness(1.2);}
      .cse-btn-imp{background:#1a5030;} .cse-btn-exp{background:#182040;}
    `;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'colorScalePanel';
    panel.innerHTML = `
      <div class="cse-hdr"><span>🎨 Color Scale Editor</span>
        <button class="cse-close" title="Close">✕</button></div>
      <div class="cse-body">
        <div class="cse-tabs" id="cse-tabs"></div>
        <div class="cse-grad" id="cse-grad"></div>
        <div class="cse-controls">
          <button class="cse-ctrl-btn add" id="cse-add">+ Add</button>
          <button class="cse-ctrl-btn remove" id="cse-remove">− Remove</button>
          <button class="cse-ctrl-btn copy" id="cse-copy">Copy</button>
          <button class="cse-ctrl-btn paste" id="cse-paste">Paste</button>
          <button class="cse-ctrl-btn" id="cse-update">↺ Apply</button>
        </div>
        <div class="cse-offset-row">
          <span class="cse-offset-lbl">Offset:</span>
          <button class="cse-offset-btn neg" id="cse-sub50">−50</button>
          <button class="cse-offset-btn neg" id="cse-sub20">−20</button>
          <button class="cse-offset-btn neg" id="cse-sub10">−10</button>
          <button class="cse-offset-btn neg" id="cse-sub5">−5</button>
          <button class="cse-offset-btn" id="cse-add5">+5</button>
          <button class="cse-offset-btn" id="cse-add10">+10</button>
          <button class="cse-offset-btn" id="cse-add20">+20</button>
          <button class="cse-offset-btn" id="cse-add50">+50</button>
        </div>
        <div class="cse-opt-row">
          <label class="cse-opt-lbl">
            <input type="checkbox" id="cse-interpolate"> Smooth interpolation
          </label>
        </div>
        <div class="cse-offset-row" style="margin-top:8px;">
          <span class="cse-offset-lbl">View:</span>
          <button class="cse-offset-btn" id="cse-view-rh" style="flex:2;">Relative Humidity</button>
          <button class="cse-offset-btn" id="cse-view-water">Water Vapor</button>
          <button class="cse-offset-btn" id="cse-view-temp">Temperature</button>
          <button class="cse-offset-btn" id="cse-view-cape">CAPE</button>
          <button class="cse-offset-btn" id="cse-view-lt-hotspots">Lt Hotspots</button>
          <button class="cse-offset-btn" id="cse-view-hail-size">Hail Size</button>
          <button class="cse-offset-btn" id="cse-view-droplet-size">Droplet Size</button>
        </div>
        <div class="cse-stops" id="cse-stops"></div>
        <div class="cse-divider"></div>
        <div class="cse-io-lbl">Import / Export</div>
        <div class="cse-format-row">
          <span class="cse-io-lbl" style="margin-bottom:0;white-space:nowrap">Format:</span>
          <select class="cse-format-sel" id="cse-format">
            <option value="json">JSON hex array</option>
            <option value="windy">Windy format</option>
            <option value="radarscope">RadarScope format</option>
            <option value="wxtools">wxtools.org / GR2 format</option>
          </select>
        </div>
        <textarea class="cse-json" id="cse-json"></textarea>
        <div class="cse-btns">
          <button class="cse-btn cse-btn-imp" id="cse-import">↓ Import</button>
          <button class="cse-btn cse-btn-exp" id="cse-export">⎘ Copy to Clipboard</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('.cse-close').onclick = () => { panel.style.display = 'none'; };

    // Drag support for CSE panel
    {
      let cseDragX = 0, cseDragY = 0, cseDragging = false;
      const cseHdr = panel.querySelector('.cse-hdr');
      cseHdr.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('cse-close')) return;
        cseDragging = true;
        const r = panel.getBoundingClientRect();
        cseDragX = e.clientX - r.left;
        cseDragY = e.clientY - r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!cseDragging) return;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = (e.clientX - cseDragX) + 'px';
        panel.style.top  = (e.clientY - cseDragY) + 'px';
      });
      document.addEventListener('mouseup', () => { cseDragging = false; });
    }

    let activeId = 'temperature';
    const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    const hex2rgb = h => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
      return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : [0,0,0];
    };

    // Conversion functions for different formats
    function toJsonFormat(colors) {
      return JSON.stringify(colors.map(c => rgb2hex(...c)));
    }

    function toWindyFormat(colors, values) {
      // Windy format: [[value, [r,g,b]], [value, [r,g,b]], ...]
      return JSON.stringify(colors.map((c, i) => [values[i], c]));
    }

    function toRadarScopeFormat(colors, values) {
      // RadarScope format: SolidColor: value r g b (one per line)
      return colors.map((c, i) => `SolidColor: ${values[i]} ${c[0]} ${c[1]} ${c[2]}`).join('\n');
    }

    function fromJsonFormat(text) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Expected array of hex colors');
      return parsed.map(h => hex2rgb(h));
    }

    function fromWindyFormat(text) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Expected Windy format array');
      // Windy format: [[value, [r,g,b]], [value, [r,g,b]], ...]
      // Return both colors and values
      const colors = [];
      const values = [];
      parsed.forEach(entry => {
        if (!Array.isArray(entry) || entry.length < 2) {
          throw new Error('Invalid Windy format entry');
        }
        const value = entry[0];
        const color = entry[1];
        if (!Array.isArray(color) || color.length < 3) {
          throw new Error('Invalid color in Windy format');
        }
        values.push(value);
        colors.push([color[0], color[1], color[2]]);
      });
      return { colors, values };
    }

    function fromRadarScopeFormat(text) {
      const lines = text.trim().split('\n');
      const colors = [];
      const values = [];
      for (const line of lines) {
        const match = line.match(/SolidColor:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i);
        if (match) {
          values.push(parseFloat(match[1]));
          colors.push([parseInt(match[2]), parseInt(match[3]), parseInt(match[4])]);
        }
      }
      if (colors.length === 0) throw new Error('No valid RadarScope color entries found');
      return { colors, values };
    }

    function fromWxtoolsFormat(text) {
      const lines = text.trim().split('\n');
      const colors = [];
      const values = [];
      for (const line of lines) {
        // Match both "Color: value r g b" and "Color4: value r g b a" formats
        const match = line.match(/Color4?:\s*(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)/i);
        if (match) {
          values.push(parseFloat(match[1]));
          colors.push([parseInt(match[2]), parseInt(match[3]), parseInt(match[4])]);
        }
      }
      if (colors.length === 0) throw new Error('No valid wxtools color entries found');
      return { colors, values };
    }

    function toWxtoolsFormat(colors, values) {
      // wxtools format: Color: value r g b (one per line)
      return colors.map((c, i) => `Color:  ${values[i]} ${c[0]} ${c[1]} ${c[2]}`).join('\n');
    }

    function refreshGrad(cfg) {
      const colors = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal || 1;
      document.getElementById('cse-grad').style.background =
        'linear-gradient(to right,' + colors.map((c,i) =>
          `rgb(${c[0]},${c[1]},${c[2]}) ${(((values[i] - minVal) / range) * 100).toFixed(1)}%`).join(',') + ')';
    }
    function refreshJson(cfg) {
      const format = document.getElementById('cse-format').value;
      const colors = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      let output;
      switch (format) {
        case 'windy':
          output = toWindyFormat(colors, values);
          break;
        case 'radarscope':
          output = toRadarScopeFormat(colors, values);
          break;
        case 'wxtools':
          output = toWxtoolsFormat(colors, values);
          break;
        default:
          output = toJsonFormat(colors);
      }
      document.getElementById('cse-json').value = output;
    }
    let selectedStopIndex = -1;
    let copiedColor = null;

    function renderStops(cfg) {
      const container = document.getElementById('cse-stops');
      container.innerHTML = '';
      const colors = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      colors.forEach((color, i) => {
        const item = document.createElement('div');
        item.className = 'cse-stop' + (i === selectedStopIndex ? ' selected' : '');
        item.onclick = () => { selectedStopIndex = i; renderStops(cfg); };

        // Index badge
        const idx = document.createElement('span');
        idx.className = 'cse-stop-idx';
        idx.textContent = i;

        // Color picker
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = rgb2hex(...color);
        picker.title = 'Stop ' + i + ' color';
        picker.addEventListener('input', (e) => {
          e.stopPropagation();
          colorScaleData[cfg.id][i] = hex2rgb(picker.value);
          refreshGrad(cfg);
          refreshJson(cfg);
          uploadColorScaleTexture();
        });
        picker.addEventListener('click', (e) => e.stopPropagation());
        picker.addEventListener('mousedown', (e) => e.stopPropagation());

        // Value input
        const valInput = document.createElement('input');
        valInput.type = 'number';
        valInput.className = 'cse-stop-val';
        valInput.value = values[i];
        valInput.step = '0.1';
        valInput.title = 'Value for stop ' + i;
        valInput.addEventListener('input', (e) => {
          e.stopPropagation();
          colorScaleValues[cfg.id][i] = parseFloat(valInput.value) || 0;
          refreshGrad(cfg);
          refreshJson(cfg);
          uploadColorScaleTexture();
        });
        valInput.addEventListener('click', (e) => e.stopPropagation());
        valInput.addEventListener('mousedown', (e) => e.stopPropagation());

        // Action buttons
        const btns = document.createElement('div');
        btns.className = 'cse-stop-btns';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'cse-btn-sm';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = (e) => {
          e.stopPropagation();
          copiedColor = [...color];
          copyBtn.textContent = '✓';
          setTimeout(() => copyBtn.textContent = 'Copy', 1000);
        };

        const pasteBtn = document.createElement('button');
        pasteBtn.className = 'cse-btn-sm';
        pasteBtn.textContent = 'Paste';
        pasteBtn.onclick = (e) => {
          e.stopPropagation();
          if (copiedColor) {
            colorScaleData[cfg.id][i] = [...copiedColor];
            picker.value = rgb2hex(...copiedColor);
            refreshGrad(cfg);
            refreshJson(cfg);
            uploadColorScaleTexture();
          }
        };

        const selBtn = document.createElement('button');
        selBtn.className = 'cse-btn-sm' + (i === selectedStopIndex ? ' active' : '');
        selBtn.textContent = 'Sel';
        selBtn.onclick = (e) => {
          e.stopPropagation();
          selectedStopIndex = i;
          renderStops(cfg);
        };

        btns.appendChild(copyBtn);
        btns.appendChild(pasteBtn);
        btns.appendChild(selBtn);

        item.appendChild(idx);
        item.appendChild(picker);
        item.appendChild(valInput);
        item.appendChild(btns);
        container.appendChild(item);
      });
    }
    function showScale(cfgId) {
      activeId = cfgId;
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === cfgId);
      document.querySelectorAll('.cse-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.id === cfgId));
      refreshGrad(cfg);
      renderStops(cfg);
      refreshJson(cfg);
      // Update interpolation checkbox state
      document.getElementById('cse-interpolate').checked = cfg.interpolate || false;
    }

    const tabContainer = document.getElementById('cse-tabs');
    COLOR_SCALE_CONFIGS.forEach(cfg => {
      const tab = document.createElement('button');
      tab.className = 'cse-tab';
      tab.textContent = cfg.name;
      tab.dataset.id = cfg.id;
      tab.onclick = () => {
        showScale(cfg.id);
        if (isSoundingDisplayMode(guiControls.displayMode)) {
          const sv = SOUNDING_VIEW_CONFIGS.find(v => v.scaleId === cfg.id);
          if (sv) guiControls.displayMode = sv.mode;
        }
        const dv = DROPLET_VIEW_CONFIGS.find(v => v.scaleId === cfg.id);
        if (dv) guiControls.displayMode = dv.mode;
      };
      tabContainer.appendChild(tab);
    });

    document.getElementById('cse-import').onclick = () => {
      try {
        const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
        const format = document.getElementById('cse-format').value;
        const text = document.getElementById('cse-json').value;
        let colors, values;
        switch (format) {
          case 'windy':
            const windyResult = fromWindyFormat(text);
            colors = windyResult.colors;
            values = windyResult.values;
            break;
          case 'radarscope':
            const radarResult = fromRadarScopeFormat(text);
            colors = radarResult.colors;
            values = radarResult.values;
            break;
          case 'wxtools':
            const wxtoolsResult = fromWxtoolsFormat(text);
            colors = wxtoolsResult.colors;
            values = wxtoolsResult.values;
            break;
          default:
            colors = fromJsonFormat(text);
            values = Array.from({length: colors.length}, (_, i) => i);
        }
        if (!Array.isArray(colors)) throw new Error('Expected array of colors');
        colorScaleData[activeId] = colors.slice(0, cfg.stops);
        colorScaleValues[activeId] = values.slice(0, cfg.stops);
        uploadColorScaleTexture();
        showScale(activeId);
      } catch(e) { alert('Import error: ' + e.message); }
    };
    document.getElementById('cse-format').onchange = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      refreshJson(cfg);
    };

    document.getElementById('cse-interpolate').onchange = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      cfg.interpolate = document.getElementById('cse-interpolate').checked;
      uploadColorScaleTexture();
    };

    // View mode buttons
    document.getElementById('cse-view-rh').onclick = () => {
      guiControls.displayMode = 'DISP_HUMD';
    };
    document.getElementById('cse-view-water').onclick = () => {
      guiControls.displayMode = 'DISP_WATER';
    };
    document.getElementById('cse-view-temp').onclick = () => {
      guiControls.displayMode = 'DISP_TEMPERATURE';
    };
    document.getElementById('cse-view-cape').onclick = () => {
      guiControls.displayMode = 'DISP_CAPE';
      showScale('cape');
    };
    document.getElementById('cse-view-lt-hotspots').onclick = () => {
      guiControls.displayMode = 'DISP_LIGHTNING_HOTSPOTS';
      showScale('lightningHotspots');
    };
    document.getElementById('cse-view-hail-size').onclick = () => {
      guiControls.displayMode = 'DISP_HAIL_SIZE';
      showScale('hailSize');
    };
    document.getElementById('cse-view-droplet-size').onclick = () => {
      guiControls.displayMode = 'DISP_DROPLET_SIZE';
      showScale('dropletSize');
    };

    document.getElementById('cse-add').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const colors = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      const insertIndex = selectedStopIndex >= 0 ? selectedStopIndex + 1 : colors.length;
      const prevColor = colors[insertIndex - 1] || [128, 128, 128];
      const prevValue = values[insertIndex - 1] || 0;
      const nextColor = colors[insertIndex] || prevColor;
      const nextValue = values[insertIndex] || prevValue + 1;
      const newColor = [
        Math.round((prevColor[0] + nextColor[0]) / 2),
        Math.round((prevColor[1] + nextColor[1]) / 2),
        Math.round((prevColor[2] + nextColor[2]) / 2)
      ];
      const newValue = (prevValue + nextValue) / 2;
      colors.splice(insertIndex, 0, newColor);
      values.splice(insertIndex, 0, newValue);
      selectedStopIndex = insertIndex;
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-remove').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const colors = colorScaleData[cfg.id];
      const values = colorScaleValues[cfg.id];
      if (selectedStopIndex >= 0 && colors.length > 2) {
        colors.splice(selectedStopIndex, 1);
        values.splice(selectedStopIndex, 1);
        selectedStopIndex = Math.min(selectedStopIndex, colors.length - 1);
        renderStops(cfg);
        refreshGrad(cfg);
        refreshJson(cfg);
        uploadColorScaleTexture();
      }
    };

    document.getElementById('cse-copy').onclick = () => {
      if (selectedStopIndex >= 0) {
        const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
        copiedColor = [...colorScaleData[cfg.id][selectedStopIndex]];
        const btn = document.getElementById('cse-copy');
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = 'Copy Color', 1500);
      }
    };

    document.getElementById('cse-paste').onclick = () => {
      if (selectedStopIndex >= 0 && copiedColor) {
        const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
        colorScaleData[cfg.id][selectedStopIndex] = [...copiedColor];
        renderStops(cfg);
        refreshGrad(cfg);
        refreshJson(cfg);
        uploadColorScaleTexture();
      }
    };

    document.getElementById('cse-update').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      uploadColorScaleTexture();
      refreshJson(cfg);
    };

    document.getElementById('cse-add5').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] += 5;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-add10').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] += 10;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-add20').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] += 20;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-add50').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] += 50;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-sub5').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] -= 5;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-sub10').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] -= 10;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-sub20').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] -= 20;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };

    document.getElementById('cse-sub50').onclick = () => {
      const cfg = COLOR_SCALE_CONFIGS.find(c => c.id === activeId);
      const values = colorScaleValues[cfg.id];
      for (let i = 0; i < values.length; i++) {
        values[i] -= 50;
      }
      renderStops(cfg);
      refreshGrad(cfg);
      refreshJson(cfg);
      uploadColorScaleTexture();
    };
    document.getElementById('cse-export').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('cse-json').value)
        .then(() => {
          const btn = document.getElementById('cse-export');
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        });
    };

    showScale('temperature');
  }

  function buildKeybindEditor()
  {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #keybindPanel{display:none;position:fixed;top:50px;right:420px;width:480px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10000;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .kbe-hdr{display:flex;align-items:center;gap:8px;padding:11px 15px;
        background:linear-gradient(135deg,#191930,#0e0e22);
        border-bottom:1px solid #252540;cursor:move;user-select:none;flex-shrink:0;}
      .kbe-hdr span{font-size:14px;font-weight:700;flex:1;}
      .kbe-close{background:rgba(255,255,255,0.07);border:none;color:#777;cursor:pointer;
        font-size:12px;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;}
      .kbe-close:hover{background:rgba(220,60,60,0.35);color:#fff;}
      .kbe-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .kbe-body::-webkit-scrollbar{width:4px;}
      .kbe-body::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .kbe-tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:10px;}
      .kbe-tab{padding:5px 11px;border:1px solid #252540;border-radius:20px;
        background:#13131f;color:#5a6070;cursor:pointer;font-size:11px;
        font-weight:600;transition:all 0.15s;}
      .kbe-tab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .kbe-tab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .kbe-search{width:100%;box-sizing:border-box;padding:7px 10px;margin-bottom:10px;
        border:1px solid #252540;border-radius:6px;background:#0b0b17;color:#c0c0d0;font-size:12px;}
      .kbe-search:focus{outline:none;border-color:#3050c0;}
      .kbe-warn{padding:8px 10px;margin-bottom:10px;border-radius:6px;font-size:11px;
        background:#281820;border:1px solid #503030;color:#e0a0a0;display:none;}
      .kbe-list{display:flex;flex-direction:column;gap:3px;max-height:calc(92vh - 220px);
        overflow-y:auto;scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .kbe-list::-webkit-scrollbar{width:4px;}
      .kbe-list::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .kbe-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;
        border:1px solid transparent;background:#0e0e1a;}
      .kbe-row:hover{border-color:#252540;background:#12122a;}
      .kbe-row.capturing{border-color:#3050c0;background:#121c40;}
      .kbe-row.conflict{border-color:#604030;background:#1a1418;}
      .kbe-name{flex:1;font-size:12px;color:#bbb;min-width:0;}
      .kbe-key{min-width:88px;padding:4px 10px;text-align:center;font-size:11px;font-weight:700;
        border:1px solid #252540;border-radius:5px;background:#181828;color:#a0c0ff;
        font-family:Consolas,monospace;}
      .kbe-key.unbound{color:#555;background:#101018;}
      .kbe-btns{display:flex;gap:4px;flex-shrink:0;}
      .kbe-btn-sm{padding:4px 9px;border:1px solid #252540;border-radius:4px;
        background:#181828;color:#777;cursor:pointer;font-size:10px;font-weight:600;}
      .kbe-btn-sm:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .kbe-btn-sm.clear{color:#c06070;}
      .kbe-btn-sm.clear:hover{background:#401828;color:#e08090;border-color:#602030;}
      .kbe-footer{display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #1c1c30;}
      .kbe-footer-btn{flex:1;padding:8px;border:none;border-radius:5px;cursor:pointer;
        font-size:12px;font-weight:700;color:#fff;}
      .kbe-footer-btn.reset{background:#401828;}
      .kbe-footer-btn.reset:hover{filter:brightness(1.15);}
      .kbe-hint{font-size:10px;color:#4a5060;margin-bottom:8px;line-height:1.4;}
    `;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'keybindPanel';
    panel.innerHTML = `
      <div class="kbe-hdr"><span>⌨ Keybind Editor</span>
        <button class="kbe-close" title="Close">✕</button></div>
      <div class="kbe-body">
        <div class="kbe-hint">Click <strong>Change</strong>, then press a key. <strong>Esc</strong> cancels. <strong>Delete</strong> clears while assigning, or use <strong>Clear</strong>.</div>
        <input type="text" class="kbe-search" id="kbe-search" placeholder="Search actions…">
        <div class="kbe-warn" id="kbe-warn"></div>
        <div class="kbe-tabs" id="kbe-tabs"></div>
        <div class="kbe-list" id="kbe-list"></div>
        <div class="kbe-footer">
          <button class="kbe-footer-btn reset" id="kbe-reset-all">Reset all to defaults</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('.kbe-close').onclick = () => {
      keybindEditorCapturing = false;
      keybindEditorCaptureActionId = null;
      panel.style.display = 'none';
    };

    {
      let kbeDragX = 0, kbeDragY = 0, kbeDragging = false;
      const kbeHdr = panel.querySelector('.kbe-hdr');
      kbeHdr.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('kbe-close')) return;
        kbeDragging = true;
        const r = panel.getBoundingClientRect();
        kbeDragX = e.clientX - r.left;
        kbeDragY = e.clientY - r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!kbeDragging) return;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = (e.clientX - kbeDragX) + 'px';
        panel.style.top  = (e.clientY - kbeDragY) + 'px';
      });
      document.addEventListener('mouseup', () => { kbeDragging = false; });
    }

    const categories = ['All', ...new Set(KEYBIND_DEFINITIONS.map(d => d.category))];
    let activeCategory = 'All';
    const tabsEl = panel.querySelector('#kbe-tabs');
    const listEl = panel.querySelector('#kbe-list');
    const warnEl = panel.querySelector('#kbe-warn');
    const searchEl = panel.querySelector('#kbe-search');

    function renderTabs()
    {
      tabsEl.innerHTML = '';
      for (const cat of categories) {
        const btn = document.createElement('button');
        btn.className = 'kbe-tab' + (cat === activeCategory ? ' active' : '');
        btn.textContent = cat;
        btn.onclick = () => {
          activeCategory = cat;
          renderTabs();
          refreshKeybindEditorList();
        };
        tabsEl.appendChild(btn);
      }
    }

    function codesWithConflicts()
    {
      const conflictCodes = new Set();
      for (const c of getKeybindConflicts())
        conflictCodes.add(c.code);
      return conflictCodes;
    }

    refreshKeybindEditorList = function()
    {
      const query = (searchEl.value || '').trim().toLowerCase();
      const conflictCodes = codesWithConflicts();
      const conflicts = getKeybindConflicts();
      if (conflicts.length > 0) {
        warnEl.style.display = 'block';
        warnEl.textContent = 'Duplicate keys: ' + conflicts.map(c =>
          formatKeybindCode(c.code) + ' (' + c.ids.map(id => getKeybindDefinition(id).name).join(', ') + ')'
        ).join('; ');
      } else {
        warnEl.style.display = 'none';
      }

      listEl.innerHTML = '';
      const defs = KEYBIND_DEFINITIONS.filter(def => {
        if (activeCategory !== 'All' && def.category !== activeCategory)
          return false;
        if (query && !def.name.toLowerCase().includes(query) && !def.category.toLowerCase().includes(query))
          return false;
        return true;
      });

      for (const def of defs) {
        const code = keybindBindings[def.id];
        const row = document.createElement('div');
        row.className = 'kbe-row';
        if (keybindEditorCaptureActionId === def.id)
          row.classList.add('capturing');
        if (code && conflictCodes.has(code))
          row.classList.add('conflict');

        const nameEl = document.createElement('span');
        nameEl.className = 'kbe-name';
        nameEl.textContent = def.name;

        const keyEl = document.createElement('span');
        keyEl.className = 'kbe-key' + (code ? '' : ' unbound');
        keyEl.textContent = keybindEditorCaptureActionId === def.id
          ? 'Press a key…'
          : formatKeybindCode(code);

        const btns = document.createElement('div');
        btns.className = 'kbe-btns';

        const changeBtn = document.createElement('button');
        changeBtn.className = 'kbe-btn-sm';
        changeBtn.textContent = 'Change';
        changeBtn.onmousedown = (e) => { e.preventDefault(); };
        changeBtn.onclick = () => { startKeybindCapture(def.id); };

        const clearBtn = document.createElement('button');
        clearBtn.className = 'kbe-btn-sm clear';
        clearBtn.textContent = 'Clear';
        clearBtn.onclick = () => {
          setKeybindForAction(def.id, null);
          refreshKeybindEditorList();
        };

        btns.appendChild(changeBtn);
        btns.appendChild(clearBtn);
        row.appendChild(nameEl);
        row.appendChild(keyEl);
        row.appendChild(btns);
        listEl.appendChild(row);
      }
    };

    searchEl.addEventListener('input', () => refreshKeybindEditorList());
    panel.querySelector('#kbe-reset-all').onclick = () => {
      if (confirm('Reset all keybinds to defaults?'))
        resetKeybindsToDefaults();
      refreshKeybindEditorList();
    };

    renderTabs();
    refreshKeybindEditorList();
  }

  function buildSkyEditor()
  {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      #skyPanel{display:none;position:fixed;top:50px;right:420px;width:500px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10000;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .ske-hdr{display:flex;align-items:center;gap:8px;padding:11px 15px;
        background:linear-gradient(135deg,#191930,#0e0e22);
        border-bottom:1px solid #252540;cursor:move;user-select:none;flex-shrink:0;}
      .ske-hdr span{font-size:14px;font-weight:700;flex:1;}
      .ske-close{background:rgba(255,255,255,0.07);border:none;color:#777;cursor:pointer;
        font-size:12px;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;}
      .ske-close:hover{background:rgba(220,60,60,0.35);color:#fff;}
      .ske-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .ske-body::-webkit-scrollbar{width:4px;}
      .ske-body::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .ske-tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px;}
      .ske-tab{padding:5px 11px;border:1px solid #252540;border-radius:20px;
        background:#13131f;color:#5a6070;cursor:pointer;font-size:11px;
        font-weight:600;transition:all 0.15s;}
      .ske-tab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .ske-tab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .ske-section{display:none;}
      .ske-section.active{display:block;}
      .ske-grad{height:28px;border-radius:6px;margin-bottom:10px;border:1px solid #252540;}
      .ske-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .ske-lbl{flex:1;font-size:11px;color:#888;min-width:0;}
      .ske-lbl small{display:block;color:#555;font-size:10px;margin-top:1px;}
      .ske-inp{width:72px;height:26px;border:1px solid #252540;border-radius:4px;
        background:#0b0b17;color:#c0c0d0;font-size:11px;text-align:right;padding:2px 6px;
        box-sizing:border-box;flex-shrink:0;}
      .ske-inp:focus{outline:none;border-color:#3050c0;}
      .ske-inp[type=color]{width:42px;height:26px;padding:1px;cursor:pointer;}
      .ske-chk{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#888;cursor:pointer;}
      .ske-chk input{width:15px;height:15px;accent-color:#4a90e2;cursor:pointer;}
      .ske-divider{border-top:1px solid #1c1c30;margin:10px 0;}
      .ske-io-lbl{font-size:10px;color:#4a5060;text-transform:uppercase;
        letter-spacing:1.2px;font-weight:600;margin-bottom:6px;}
      .ske-io-area{width:100%;box-sizing:border-box;height:72px;border:1px solid #252540;
        border-radius:6px;background:#0b0b17;color:#888;font-size:10px;padding:8px;
        font-family:Consolas,monospace;resize:vertical;margin-bottom:8px;}
      .ske-footer{display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #1c1c30;}
      .ske-footer-btn{flex:1;padding:8px;border:none;border-radius:5px;cursor:pointer;
        font-size:11px;font-weight:700;color:#fff;}
      .ske-footer-btn.reset{background:#401828;}
      .ske-footer-btn.reset:hover{filter:brightness(1.15);}
      .ske-footer-btn.io{background:#182840;}
      .ske-footer-btn.io:hover{filter:brightness(1.15);}
    `;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'skyPanel';
    panel.innerHTML = `
      <div class="ske-hdr"><span>☁ Sky Editor</span>
        <button class="ske-close" title="Close">✕</button></div>
      <div class="ske-body">
        <div class="ske-tabs" id="ske-tabs"></div>
        <div class="ske-grad" id="ske-preview"></div>
        <div class="ske-section active" id="ske-sec-time"></div>
        <div class="ske-section" id="ske-sec-day"></div>
        <div class="ske-section" id="ske-sec-twilight"></div>
        <div class="ske-section" id="ske-sec-horizon"></div>
        <div class="ske-section" id="ske-sec-stars"></div>
        <div class="ske-section" id="ske-sec-effects"></div>
        <div class="ske-divider"></div>
        <div class="ske-io-lbl">Import / Export JSON</div>
        <textarea class="ske-io-area" id="ske-io" placeholder="Paste sky settings JSON here…"></textarea>
        <div class="ske-footer">
          <button class="ske-footer-btn io" id="ske-export">Export</button>
          <button class="ske-footer-btn io" id="ske-import">Import</button>
          <button class="ske-footer-btn reset" id="ske-reset">Reset defaults</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('.ske-close').onclick = () => { panel.style.display = 'none'; };

    {
      let skeDragX = 0, skeDragY = 0, skeDragging = false;
      const skeHdr = panel.querySelector('.ske-hdr');
      skeHdr.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('ske-close')) return;
        skeDragging = true;
        const r = panel.getBoundingClientRect();
        skeDragX = e.clientX - r.left;
        skeDragY = e.clientY - r.top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!skeDragging) return;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = (e.clientX - skeDragX) + 'px';
        panel.style.top  = (e.clientY - skeDragY) + 'px';
      });
      document.addEventListener('mouseup', () => { skeDragging = false; });
    }

    const tabs = [
      { id: 'time', label: 'Time & Sun' },
      { id: 'day', label: 'Day Sky' },
      { id: 'twilight', label: 'Twilight' },
      { id: 'horizon', label: 'Horizon' },
      { id: 'stars', label: 'Stars' },
      { id: 'effects', label: 'Effects' },
    ];
    let activeTab = 'time';
    const tabsEl = panel.querySelector('#ske-tabs');
    const previewEl = panel.querySelector('#ske-preview');
    const skySyncFns = [];

    function updatePreview()
    {
      const stops = [
        skySettings.twilightHorizon,
        skySettings.twilightLow,
        skySettings.twilightMid,
        skySettings.twilightUpper,
        skySettings.twilightTop,
      ];
      const pct = 100 / (stops.length - 1);
      const parts = stops.map((c, i) => skyVec3ToHex(c) + ' ' + (i * pct) + '%');
      previewEl.style.background = 'linear-gradient(to top, ' + parts.join(', ') + ')';
    }

    function commitSkyChange()
    {
      saveSkySettings();
      uploadSkyUniforms();
      updatePreview();
    }

    function addSlider(sectionEl, label, hint, getVal, setVal, min, max, step)
    {
      const row = document.createElement('div');
      row.className = 'ske-row';
      const lbl = document.createElement('div');
      lbl.className = 'ske-lbl';
      lbl.innerHTML = label + (hint ? '<small>' + hint + '</small>' : '');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ske-inp';
      inp.min = min;
      inp.max = max;
      inp.step = step;
      inp.value = getVal();
      inp.onchange = () => {
        setVal(parseFloat(inp.value));
        commitSkyChange();
      };
      row.appendChild(lbl);
      row.appendChild(inp);
      sectionEl.appendChild(row);
      skySyncFns.push(() => { inp.value = getVal(); });
      return inp;
    }

    function addGuiSlider(sectionEl, label, hint, guiKey, min, max, step, onExtra)
    {
      return addSlider(sectionEl, label, hint,
        () => guiControls[guiKey],
        (v) => {
          guiControls[guiKey] = v;
          if (typeof onExtra === 'function') onExtra();
        },
        min, max, step);
    }

    function addColorPicker(sectionEl, label, vecKey)
    {
      const row = document.createElement('div');
      row.className = 'ske-row';
      const lbl = document.createElement('div');
      lbl.className = 'ske-lbl';
      lbl.textContent = label;
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.className = 'ske-inp';
      inp.value = skyVec3ToHex(skySettings[vecKey]);
      inp.oninput = () => {
        skySettings[vecKey] = skyHexToVec3(inp.value);
        commitSkyChange();
      };
      row.appendChild(lbl);
      row.appendChild(inp);
      sectionEl.appendChild(row);
      skySyncFns.push(() => { inp.value = skyVec3ToHex(skySettings[vecKey]); });
      return inp;
    }

    const secTime = panel.querySelector('#ske-sec-time');
    addGuiSlider(secTime, 'Time of day (hours)', '0–24, noon = 12', 'timeOfDay', 0, 23.96, 0.01, () => {
      if (typeof onUpdateTimeOfDaySlider === 'function') onUpdateTimeOfDaySlider();
    });
    addGuiSlider(secTime, 'Sun angle (°)', 'Zenith angle; 90 = overhead', 'sunAngle', 0, 180, 0.1, () => {
      if (typeof updateSunlight === 'function') updateSunlight();
    });
    addGuiSlider(secTime, 'Month', 'Affects moon phase', 'month', 1, 12, 0.01);
    addGuiSlider(secTime, 'Latitude (°)', 'Day/night cycle latitude', 'latitude', -90, 90, 0.1);
    addGuiSlider(secTime, 'Sun intensity', 'Radiation strength', 'sunIntensity', 0, 3, 0.01, () => {
      if (typeof updateSunlight === 'function') updateSunlight();
    });
    addSlider(secTime, 'Sun horizontal amplitude', 'East–west travel range', () => skySettings.sunHorizAmplitude,
      (v) => { skySettings.sunHorizAmplitude = v; }, 0, 0.8, 0.01);
    addSlider(secTime, 'Sun vertical scale', 'Height above horizon', () => skySettings.sunVertScale,
      (v) => { skySettings.sunVertScale = v; }, 0, 1.5, 0.01);

    const dayNightChk = document.createElement('label');
    dayNightChk.className = 'ske-chk';
    dayNightChk.innerHTML = '<input type="checkbox"> Day / night cycle';
    dayNightChk.querySelector('input').checked = guiControls.dayNightCycle;
    dayNightChk.querySelector('input').onchange = (e) => {
      guiControls.dayNightCycle = e.target.checked;
    };
    secTime.appendChild(dayNightChk);

    const realtimeChk = document.createElement('label');
    realtimeChk.className = 'ske-chk';
    realtimeChk.innerHTML = '<input type="checkbox"> Realtime (1:1 wall clock)';
    realtimeChk.querySelector('input').checked = guiControls.realtimeMode;
    realtimeChk.querySelector('input').onchange = (e) => {
      guiControls.realtimeMode = e.target.checked;
      if (guiControls.realtimeMode)
        enableRealtimeMode();
      else
        resetRealtimeClockState();
    };
    secTime.appendChild(realtimeChk);

    const accelChk = document.createElement('label');
    accelChk.className = 'ske-chk';
    accelChk.innerHTML = '<input type="checkbox"> Accelerate night';
    accelChk.querySelector('input').checked = guiControls.accelerateNight;
    accelChk.querySelector('input').onchange = (e) => {
      guiControls.accelerateNight = e.target.checked;
    };
    secTime.appendChild(accelChk);

    const secDay = panel.querySelector('#ske-sec-day');
    addSlider(secDay, 'Day sky hue', 'HSV hue (0–1)', () => skySettings.dayHue,
      (v) => { skySettings.dayHue = v; }, 0, 1, 0.01);
    addSlider(secDay, 'Saturation (horizon)', 'Lower Y = horizon', () => skySettings.daySatLow,
      (v) => { skySettings.daySatLow = v; }, 0, 1, 0.01);
    addSlider(secDay, 'Saturation (zenith)', 'Higher Y = top', () => skySettings.daySatHigh,
      (v) => { skySettings.daySatHigh = v; }, 0, 1, 0.01);
    addSlider(secDay, 'Brightness (horizon)', 'Value at bottom', () => skySettings.dayValLow,
      (v) => { skySettings.dayValLow = v; }, 0, 1, 0.01);
    addSlider(secDay, 'Brightness (zenith)', 'Value at top', () => skySettings.dayValHigh,
      (v) => { skySettings.dayValHigh = v; }, 0, 1, 0.01);
    addSlider(secDay, 'Brightness curve power', 'Steepness of gradient', () => skySettings.dayValPow,
      (v) => { skySettings.dayValPow = v; }, 0.5, 10, 0.1);

    const secTwilight = panel.querySelector('#ske-sec-twilight');
    addColorPicker(secTwilight, 'Horizon band', 'twilightHorizon');
    addColorPicker(secTwilight, 'Low sky', 'twilightLow');
    addColorPicker(secTwilight, 'Mid sky', 'twilightMid');
    addColorPicker(secTwilight, 'Upper sky', 'twilightUpper');
    addColorPicker(secTwilight, 'Zenith', 'twilightTop');

    const secHorizon = panel.querySelector('#ske-sec-horizon');
    addSlider(secHorizon, 'Horizon line Y', 'Normalized screen height', () => skySettings.horizonLine,
      (v) => { skySettings.horizonLine = v; }, 0, 0.15, 0.001);
    addColorPicker(secHorizon, 'Deep red', 'horizonDeepRed');
    addColorPicker(secHorizon, 'Burnt orange', 'horizonBurntOrange');
    addColorPicker(secHorizon, 'Gold', 'horizonGold');
    addColorPicker(secHorizon, 'Pale gold', 'horizonPaleGold');
    addSlider(secHorizon, 'Haze mix strength', '', () => skySettings.hazeMixStrength,
      (v) => { skySettings.hazeMixStrength = v; }, 0, 1, 0.01);
    addSlider(secHorizon, 'Haze glow strength', '', () => skySettings.hazeBoostStrength,
      (v) => { skySettings.hazeBoostStrength = v; }, 0, 1, 0.01);

    const secStars = panel.querySelector('#ske-sec-stars');
    addGuiSlider(secStars, 'Star visibility', '', 'starVisibility', 0, 1, 0.01, () => commitSkyChange());
    addGuiSlider(secStars, 'Star light emit', '', 'starLightEmitStrength', 0, 0.5, 0.01, () => commitSkyChange());
    addGuiSlider(secStars, 'Star density', '', 'starDensity', 0, 1, 0.01, () => commitSkyChange());

    const secEffects = panel.querySelector('#ske-sec-effects');
    addColorPicker(secEffects, 'Crepuscular ray color', 'crepuscularColor');
    addSlider(secEffects, 'Crepuscular strength', '', () => skySettings.crepuscularStrength,
      (v) => { skySettings.crepuscularStrength = v; }, 0, 1, 0.01);
    addGuiSlider(secEffects, 'Min shadow light', '0 = darkest shadows', 'minShadowLight', 0, 0.2, 0.001, () => {
      if (!guiControls.autoMinShadowLight) {
        gl.useProgram(realisticDisplayProgram);
        gl.uniform1f(uloc_realistic_minShadowLight, guiControls.minShadowLight);
        commitSkyChange();
      }
    });
    const autoShadowChk = document.createElement('label');
    autoShadowChk.className = 'ske-chk';
    autoShadowChk.innerHTML = '<input type="checkbox"> Auto shadow light';
    autoShadowChk.querySelector('input').checked = guiControls.autoMinShadowLight;
    autoShadowChk.querySelector('input').onchange = (e) => {
      guiControls.autoMinShadowLight = e.target.checked;
    };
    secEffects.appendChild(autoShadowChk);

    function renderTabs()
    {
      tabsEl.innerHTML = '';
      for (const tab of tabs) {
        const btn = document.createElement('button');
        btn.className = 'ske-tab' + (tab.id === activeTab ? ' active' : '');
        btn.textContent = tab.label;
        btn.onclick = () => {
          activeTab = tab.id;
          renderTabs();
          for (const t of tabs) {
            const sec = panel.querySelector('#ske-sec-' + t.id);
            if (sec) sec.classList.toggle('active', t.id === activeTab);
          }
        };
        tabsEl.appendChild(btn);
      }
    }

    refreshSkyEditor = function()
    {
      for (const fn of skySyncFns)
        fn();
      dayNightChk.querySelector('input').checked = guiControls.dayNightCycle;
      realtimeChk.querySelector('input').checked = guiControls.realtimeMode;
      accelChk.querySelector('input').checked = guiControls.accelerateNight;
      autoShadowChk.querySelector('input').checked = guiControls.autoMinShadowLight;
      updatePreview();
    };

    panel.querySelector('#ske-export').onclick = () => {
      const payload = Object.assign({}, skySettings, {
        timeOfDay : guiControls.timeOfDay,
        sunAngle : guiControls.sunAngle,
        month : guiControls.month,
        latitude : guiControls.latitude,
        sunIntensity : guiControls.sunIntensity,
        dayNightCycle : guiControls.dayNightCycle,
        realtimeMode : guiControls.realtimeMode,
        accelerateNight : guiControls.accelerateNight,
        starVisibility : guiControls.starVisibility,
        starLightEmitStrength : guiControls.starLightEmitStrength,
        starDensity : guiControls.starDensity,
        minShadowLight : guiControls.minShadowLight,
        autoMinShadowLight : guiControls.autoMinShadowLight,
      });
      panel.querySelector('#ske-io').value = JSON.stringify(payload, null, 2);
    };

    panel.querySelector('#ske-import').onclick = () => {
      try {
        const parsed = JSON.parse(panel.querySelector('#ske-io').value);
        skySettings = Object.assign(cloneSkySettings(SKY_SETTINGS_DEFAULTS), parsed);
        const guiKeys = [ 'timeOfDay', 'sunAngle', 'month', 'latitude', 'sunIntensity',
          'dayNightCycle', 'realtimeMode', 'accelerateNight', 'starVisibility',
          'starLightEmitStrength', 'starDensity', 'minShadowLight', 'autoMinShadowLight' ];
        for (const k of guiKeys) {
          if (parsed[k] !== undefined)
            guiControls[k] = parsed[k];
        }
        saveSkySettings();
        uploadSkyUniforms();
        if (typeof updateSunlight === 'function') updateSunlight();
        if (typeof onUpdateTimeOfDaySlider === 'function') onUpdateTimeOfDaySlider();
        refreshSkyEditor();
      } catch (e) {
        alert('Invalid sky settings JSON: ' + e.message);
      }
    };

    panel.querySelector('#ske-reset').onclick = () => {
      if (confirm('Reset all sky settings to defaults?'))
        resetSkySettingsToDefaults();
    };

    renderTabs();
    updatePreview();
  }

  // ========================= End Color Scale System =========================

  imgElement = await loadImage('resources/img/ColorScales.png');
  initColorScaleData(imgElement);
  uploadColorScaleTexture();


  await loadingBar.set(90, 'Setting up FBO`s');

  createHdrFBO();

  createBloomFBOs();

  var texelSizeX = 1.0 / sim_res_x;
  var texelSizeY = 1.0 / sim_res_y;

  dryLapse = (guiControls.simHeight * guiControls.dryLapseRate) / 1000.0; // total lapse rate from bottem to top of atmosphere


  // generate sounding data for forcing in sim

  realWorldSounding_T = new Float32Array(504);   // sim_res_y + 1
  realWorldSounding_W = new Float32Array(504);   // sim_res_y + 1
  realWorldSounding_Vel = new Float32Array(504); // sim_res_y + 1
  if (soundingData && soundingData.length > 10) {
    console.log('mainScript: Initializing with sounding data. customSoundingLoaded =', customSoundingLoaded);
    console.log('mainScript: soundingData sample:', soundingData[0], soundingData[Math.floor(soundingData.length/2)], soundingData[soundingData.length-1]);
    var soundingForSim = rawSoundingToSimSounding(soundingData, guiControls.simHeight, sim_res_y + 1);

    for (var y = 0; y < sim_res_y + 1; y++) {

      let soundingSample = soundingForSim[y];

      realWorldSounding_T[y] = realToPotentialT(CtoK(soundingSample.t), y); // initial temperature profile
      realWorldSounding_W[y] = maxWater(CtoK(soundingSample.td), y);        // initial temperature profile
      realWorldSounding_Vel[y] = soundingSample.vel;
    }
    console.log('mainScript: Initialized sounding arrays. realWorldSounding_T[0]:', realWorldSounding_T[0], 'realWorldSounding_T[100]:', realWorldSounding_T[100]);
  } else {
    console.log('No valid sounding loaded! Using default profile.');
    // Initialize with default atmospheric profile to prevent infinite cooling
    // Use warmer temperatures to match typical simulation conditions
    for (var y = 0; y < sim_res_y + 1; y++) {
      let altitude = y / (sim_res_y + 1) * guiControls.simHeight;
      var realTemp = Math.max(map_range(altitude, 0, 12000, 25.0, -50.0), -50);
      var td = realTemp - 5; // Dew point 5°C colder
      
      realWorldSounding_T[y] = realToPotentialT(CtoK(realTemp), y);
      realWorldSounding_W[y] = maxWater(CtoK(td), y);
      realWorldSounding_Vel[y] = 0.01; // Minimal wind
    }
  }

  // generate Initial temperature profile

  var initial_T = new Float32Array(504); // sim_res_y + 1

  for (var y = 0; y < sim_res_y + 1; y++) {
    let altitude = y / (sim_res_y + 1) * guiControls.simHeight;
    var realTemp = Math.max(map_range(altitude, 0, 12000, 15.0, -70.0), -60);

    initial_T[y] = realToPotentialT(CtoK(realTemp), y); // initial temperature profile
  }

  cellHeight = guiControls.simHeight / sim_res_y; // in meters

  // Set constant uniforms
  gl.useProgram(setupProgram);
  const uloc_setup_seed = gl.getUniformLocation(setupProgram, 'seed');
  const uloc_setup_heightMult = gl.getUniformLocation(setupProgram, 'heightMult');
  gl.uniform2f(gl.getUniformLocation(setupProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform2f(gl.getUniformLocation(setupProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform1f(gl.getUniformLocation(setupProgram, 'dryLapse'), dryLapse);
  gl.uniform1f(gl.getUniformLocation(setupProgram, 'simHeight'), guiControls.simHeight);

  gl.uniform4fv(gl.getUniformLocation(setupProgram, 'initial_Tv'), initial_T);

  gl.useProgram(advectionProgram);
  gl.uniform1i(gl.getUniformLocation(advectionProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(advectionProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(advectionProgram, 'wallTex'), 2);
  gl.uniform2f(gl.getUniformLocation(advectionProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform2f(gl.getUniformLocation(advectionProgram, 'resolution'), sim_res_x, sim_res_y);
  // gl.uniform1fv(
  // gl.getUniformLocation(advectionProgram, 'initial_T'), initial_T);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'initial_Tv'), initial_T);
  gl.uniform1f(gl.getUniformLocation(advectionProgram, 'dryLapse'), dryLapse);
  gl.uniform1f(gl.getUniformLocation(advectionProgram, 'waterTemperature'),
               CtoK(guiControls.waterTemperature)); // can be changed by GUI input

  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Tv'), realWorldSounding_T);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Wv'), realWorldSounding_W);
  gl.uniform4fv(gl.getUniformLocation(advectionProgram, 'realWorldSounding_Velv'), realWorldSounding_Vel);

  gl.useProgram(pressureProgram);
  gl.uniform1i(gl.getUniformLocation(pressureProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(pressureProgram, 'wallTex'), 1);
  gl.uniform2f(gl.getUniformLocation(pressureProgram, 'texelSize'), texelSizeX, texelSizeY);

  gl.useProgram(velocityProgram);
  gl.uniform1i(gl.getUniformLocation(velocityProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(velocityProgram, 'wallTex'), 1);
  gl.uniform2f(gl.getUniformLocation(velocityProgram, 'texelSize'), texelSizeX, texelSizeY);

  // gl.uniform1fv(gl.getUniformLocation(velocityProgram, 'initial_T'), initial_T);
  gl.uniform4fv(gl.getUniformLocation(velocityProgram, 'initial_Tv'), initial_T);

  gl.useProgram(vorticityProgram);
  gl.uniform2f(gl.getUniformLocation(vorticityProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(vorticityProgram, 'curlTex'), 0);

  gl.useProgram(boundaryProgram);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'vortForceTex'), 2);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'wallTex'), 3);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'lightTex'), 4);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'precipFeedbackTex'), 5);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'precipDepositionTex'), 6);
  gl.uniform2f(gl.getUniformLocation(boundaryProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(boundaryProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'vorticity'),
               guiControls.vorticity);              // can be changed by GUI input
  gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'waterTemperature'),
               CtoK(guiControls.waterTemperature)); // can be changed by GUI input
  gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'dryLapse'), dryLapse);
  // gl.uniform1fv(gl.getUniformLocation(boundaryProgram, 'initial_T'), initial_T);
  gl.uniform4fv(gl.getUniformLocation(boundaryProgram, 'initial_Tv'), initial_T);
  gl.uniform1i(gl.getUniformLocation(boundaryProgram, 'allowCaves'), guiControls.allowCaves ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'meltingHeat'), guiControls.meltingHeat);
  gl.uniform1f(gl.getUniformLocation(boundaryProgram, 'dynamicWaterTemperature'), guiControls.dynamicWaterTemperature ? 1.0 : 0.0);

  gl.useProgram(curlProgram);
  gl.uniform2f(gl.getUniformLocation(curlProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(curlProgram, 'baseTex'), 0);

  gl.useProgram(capeProgram);
  gl.uniform2f(gl.getUniformLocation(capeProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(capeProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(capeProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(capeProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(capeProgram, 'wallTex'), 2);
  gl.uniform1f(gl.getUniformLocation(capeProgram, 'dryLapse'), dryLapse);
  gl.uniform1f(gl.getUniformLocation(capeProgram, 'simHeight'), guiControls.simHeight);
  gl.uniform1f(gl.getUniformLocation(capeProgram, 'evapHeat'), guiControls.evapHeat);

  gl.useProgram(chargeProgram);
  gl.uniform2f(gl.getUniformLocation(chargeProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(chargeProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(chargeProgram, 'baseTex'),   0);
  gl.uniform1i(gl.getUniformLocation(chargeProgram, 'waterTex'),  1);
  gl.uniform1i(gl.getUniformLocation(chargeProgram, 'wallTex'),   2);
  gl.uniform1i(gl.getUniformLocation(chargeProgram, 'chargeTex'), 3);
  gl.uniform1f(gl.getUniformLocation(chargeProgram, 'dryLapse'),  dryLapse);
  uloc_charge_generationRate = gl.getUniformLocation(chargeProgram, 'chargeGenerationRate');
  uloc_charge_minCloudDensity = gl.getUniformLocation(chargeProgram, 'chargeMinCloudDensity');
  uloc_charge_stormCoreThreshold = gl.getUniformLocation(chargeProgram, 'chargeStormCoreThreshold');
  uloc_charge_transportStrength = gl.getUniformLocation(chargeProgram, 'chargeTransportStrength');
  uloc_charge_dissipationRate = gl.getUniformLocation(chargeProgram, 'chargeDissipationRate');
  setChargeGenerationUniforms();
  const uloc_charge_ltDischargeCount = gl.getUniformLocation(chargeProgram, 'ltDischargeCount');
  const uloc_charge_ltDischarge      = gl.getUniformLocation(chargeProgram, 'ltDischarge');
  const uloc_charge_ltDischargeMeta  = gl.getUniformLocation(chargeProgram, 'ltDischargeMeta');
  const uloc_charge_userInputValues  = gl.getUniformLocation(chargeProgram, 'userInputValues');
  const uloc_charge_userInputType    = gl.getUniformLocation(chargeProgram, 'userInputType');
  const uloc_charge_invertTool       = gl.getUniformLocation(chargeProgram, 'invertTool');
  const uloc_charge_wrapHorizontally = gl.getUniformLocation(chargeProgram, 'wrapHorizontally');

  gl.useProgram(lightningSummaryProgram);
  gl.uniform2f(gl.getUniformLocation(lightningSummaryProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform2f(gl.getUniformLocation(lightningSummaryProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform1f(gl.getUniformLocation(lightningSummaryProgram, 'dryLapse'), dryLapse);
  gl.uniform1i(gl.getUniformLocation(lightningSummaryProgram, 'chargeTex'), 0);
  gl.uniform1i(gl.getUniformLocation(lightningSummaryProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(lightningSummaryProgram, 'baseTex'), 2);
  gl.uniform1i(gl.getUniformLocation(lightningSummaryProgram, 'wallTex'), 3);

  gl.useProgram(chargeDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(chargeDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(chargeDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform2f(gl.getUniformLocation(chargeDisplayProgram, 'aspectRatios'), sim_aspect, canvas_aspect);
  gl.uniform1f(gl.getUniformLocation(chargeDisplayProgram, 'Xmult'), horizontalDisplayMult);
  gl.uniform1i(gl.getUniformLocation(chargeDisplayProgram, 'chargeTex'),      0);
  gl.uniform1i(gl.getUniformLocation(chargeDisplayProgram, 'wallTex'),        2);
  gl.uniform1i(gl.getUniformLocation(chargeDisplayProgram, 'colorScalesTex'), 9);
  gl.uniform1i(gl.getUniformLocation(chargeDisplayProgram, 'colorScaleColumn'), 23);
  gl.uniform1i(gl.getUniformLocation(chargeDisplayProgram, 'colorScaleStops'),  33);

  gl.useProgram(dropletSizeDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(dropletSizeDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(dropletSizeDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform2f(gl.getUniformLocation(dropletSizeDisplayProgram, 'aspectRatios'), sim_aspect, canvas_aspect);
  gl.uniform1f(gl.getUniformLocation(dropletSizeDisplayProgram, 'Xmult'), horizontalDisplayMult);
  gl.uniform1i(gl.getUniformLocation(dropletSizeDisplayProgram, 'dropletSizeTex'), 0);
  gl.uniform1i(gl.getUniformLocation(dropletSizeDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(dropletSizeDisplayProgram, 'colorScalesTex'), 9);
  const uloc_dropletDisp_sizeChannel = gl.getUniformLocation(dropletSizeDisplayProgram, 'sizeChannel');
  const uloc_dropletDisp_colorScaleColumn = gl.getUniformLocation(dropletSizeDisplayProgram, 'colorScaleColumn');
  const uloc_dropletDisp_colorScaleStops = gl.getUniformLocation(dropletSizeDisplayProgram, 'colorScaleStops');
  const uloc_dropletDisp_valueMin = gl.getUniformLocation(dropletSizeDisplayProgram, 'valueMin');
  const uloc_dropletDisp_valueMax = gl.getUniformLocation(dropletSizeDisplayProgram, 'valueMax');
  const uloc_dropletDisp_view = gl.getUniformLocation(dropletSizeDisplayProgram, 'view');
  const uloc_dropletDisp_cursor = gl.getUniformLocation(dropletSizeDisplayProgram, 'cursor');

  gl.useProgram(lightingProgram);
  gl.uniform2f(gl.getUniformLocation(lightingProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(lightingProgram, 'texelSize'), texelSizeX, texelSizeY);

  gl.uniform1i(gl.getUniformLocation(lightingProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(lightingProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(lightingProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(lightingProgram, 'lightTex'), 3);
  gl.uniform1f(gl.getUniformLocation(lightingProgram, 'dryLapse'), dryLapse);

  // Display programs:
  gl.useProgram(temperatureDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(temperatureDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(temperatureDisplayProgram, 'colorScalesTex'), 9);
  gl.uniform1f(gl.getUniformLocation(temperatureDisplayProgram, 'dryLapse'), dryLapse);

  gl.useProgram(temperatureChangeDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(temperatureChangeDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(temperatureChangeDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(temperatureChangeDisplayProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(temperatureChangeDisplayProgram, 'prevBaseTex'), 1);
  gl.uniform1i(gl.getUniformLocation(temperatureChangeDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(temperatureChangeDisplayProgram, 'colorScalesTex'), 9);
  gl.uniform1f(gl.getUniformLocation(temperatureChangeDisplayProgram, 'dryLapse'), dryLapse);

  gl.useProgram(airQualityDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(airQualityDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(airQualityDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(airQualityDisplayProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(airQualityDisplayProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(airQualityDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(airQualityDisplayProgram, 'colorScalesTex'), 9);
  gl.uniform1f(gl.getUniformLocation(airQualityDisplayProgram, 'dryLapse'), dryLapse);

  gl.useProgram(humidityDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(humidityDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(humidityDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(humidityDisplayProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(humidityDisplayProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(humidityDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(humidityDisplayProgram, 'colorScalesTex'), 9);
  gl.uniform1f(gl.getUniformLocation(humidityDisplayProgram, 'dryLapse'), dryLapse);

  gl.useProgram(precipDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(precipDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, 'waterTex'), 0);
  gl.uniform1i(gl.getUniformLocation(precipDisplayProgram, 'wallTex'), 2);

  gl.useProgram(skyBackgroundDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'simHeight'), guiControls.simHeight);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'minShadowLight'), minShadowLight);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'sunAngle'), (90 - guiControls.sunAngle) * degToRad);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'timeOfDay'), guiControls.timeOfDay);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'month'), guiControls.month);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'starVisibility'), guiControls.starVisibility);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'starLightEmitStrength'), guiControls.starLightEmitStrength);
  gl.uniform1f(gl.getUniformLocation(skyBackgroundDisplayProgram, 'starDensity'), guiControls.starDensity);
  gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, 'lightTex'), 3);
  gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, 'ambientLightTex'), 9);
  gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, 'precipFeedbackTex'), 7);
  gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, 'planeTex'), 8);
  gl.uniform1i(gl.getUniformLocation(skyBackgroundDisplayProgram, 'planeGearTex'), 10);

  gl.useProgram(universalDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(universalDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, 'anyTex'), 0);
  gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, 'colorScalesTex'), 9);

  gl.useProgram(realisticDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(realisticDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, 'minShadowLight'), minShadowLight);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'lightTex'), 3);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'noiseTex'), 4);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'surfaceTextureMap'), 5);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'curlTex'), 6);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'lightningTex'), 7);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'lightningDataTex'), 8);
  gl.uniform1i(gl.getUniformLocation(realisticDisplayProgram, 'ambientLightTex'), 9);
  gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, 'dryLapse'), dryLapse);
  gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, 'cellHeight'), cellHeight);
  gl.uniform1f(gl.getUniformLocation(realisticDisplayProgram, 'visualQuality'), 1.0);

  gl.useProgram(lightningLocationProgram);
  gl.uniform1i(gl.getUniformLocation(lightningLocationProgram, 'precipFeedbackTex'), 0);
  gl.uniform2f(gl.getUniformLocation(lightningLocationProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(lightningLocationProgram, 'texelSize'), texelSizeX, texelSizeY);

  gl.useProgram(precipitationProgram);
  gl.uniform1i(gl.getUniformLocation(precipitationProgram, 'baseTex'), 0);
  gl.uniform1i(gl.getUniformLocation(precipitationProgram, 'waterTex'), 1);
  gl.uniform1i(gl.getUniformLocation(precipitationProgram, 'lightningDataTex'), 2);
  gl.uniform2f(gl.getUniformLocation(precipitationProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(precipitationProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1f(gl.getUniformLocation(precipitationProgram, 'dryLapse'), dryLapse);
  gl.useProgram(IRtempDisplayProgram);
  gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, 'resolution'), sim_res_x, sim_res_y);
  gl.uniform2f(gl.getUniformLocation(IRtempDisplayProgram, 'texelSize'), texelSizeX, texelSizeY);
  gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, 'lightTex'), 0);
  gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, 'wallTex'), 2);
  gl.uniform1i(gl.getUniformLocation(IRtempDisplayProgram, 'colorScalesTex'), 9);

  gl.useProgram(postProcessingProgram);
  gl.uniform1i(gl.getUniformLocation(postProcessingProgram, 'hdrTex'), 0);
  gl.uniform1i(gl.getUniformLocation(postProcessingProgram, 'bloomTex'), 1);


  gl.useProgram(isolateBrightPartsProgram);
  gl.uniform1i(gl.getUniformLocation(isolateBrightPartsProgram, 'hdrTex'), 0);

  // console.time('Set uniforms');
  setGuiUniforms(); // all uniforms changed by gui
  // console.timeEnd('Set uniforms')

  buildColorScaleEditor();
  buildKeybindEditor();
  buildSkyEditor();

  gl.bindVertexArray(fluidVao);

  // if no save file was loaded
  // Use setup shader to set initial conditions
  if (initialWallTex == null) {
    gl.viewport(0, 0, sim_res_x, sim_res_y);
    gl.useProgram(setupProgram);
    // Render to both framebuffers
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }


  if (!SETUP_MODE) {
    startSimulation();
  }

  if (guiControls.sound) {
    soundSystem = new SoundSystem();
  }

  await loadingBar.set(95, 'Loading sounds'); // loading complete
  await loadingBar.remove();
  if (typeof stopMenuBackgroundSlideshow === 'function') {
    stopMenuBackgroundSlideshow();
  }

  var srcVAO;
  var destVAO;
  var destTF;

  // preload uniform locations - avoids expensive driver roundtrips every frame
  var uniformLocation_boundaryProgram_iterNum = gl.getUniformLocation(boundaryProgram, 'iterNum');
  var ulocsReady = false; // flag so updateSunlight skips GPU calls before cache is built

  // updateSunlight uniforms
  const uloc_boundary_sunAngle         = gl.getUniformLocation(boundaryProgram,            'sunAngle');
  const uloc_boundary_sunAzimuth       = gl.getUniformLocation(boundaryProgram,            'sunAzimuth');
  const uloc_lighting_sunIntensity     = gl.getUniformLocation(lightingProgram,             'sunIntensity');
  const uloc_lighting_sunAngle         = gl.getUniformLocation(lightingProgram,             'sunAngle');
  const uloc_lighting_sunAzimuth       = gl.getUniformLocation(lightingProgram,             'sunAzimuth');
  const uloc_realistic_sunAngle        = gl.getUniformLocation(realisticDisplayProgram,     'sunAngle');
  const uloc_realistic_sunAzimuth      = gl.getUniformLocation(realisticDisplayProgram,     'sunAzimuth');
  const uloc_realistic_minShadowLight  = gl.getUniformLocation(realisticDisplayProgram,     'minShadowLight');
  const uloc_sky_minShadowLight        = gl.getUniformLocation(skyBackgroundDisplayProgram, 'minShadowLight');
  const uloc_sky_sunAngle              = gl.getUniformLocation(skyBackgroundDisplayProgram, 'sunAngle');
  const uloc_sky_timeOfDay             = gl.getUniformLocation(skyBackgroundDisplayProgram, 'timeOfDay');
  const uloc_sky_month                 = gl.getUniformLocation(skyBackgroundDisplayProgram, 'month');
  const uloc_sky_starDensity           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'starDensity');
  const uloc_sky_starVisibility        = gl.getUniformLocation(skyBackgroundDisplayProgram, 'starVisibility');
  const uloc_sky_starLightEmitStrength = gl.getUniformLocation(skyBackgroundDisplayProgram, 'starLightEmitStrength');
  const uloc_sky_horizonLine           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHorizonLine');
  const uloc_sky_dayHue                = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDayHue');
  const uloc_sky_daySatLow             = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDaySatLow');
  const uloc_sky_daySatHigh            = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDaySatHigh');
  const uloc_sky_dayValLow             = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDayValLow');
  const uloc_sky_dayValHigh            = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDayValHigh');
  const uloc_sky_dayValPow             = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyDayValPow');
  const uloc_sky_twilightTop           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyTwilightTop');
  const uloc_sky_twilightUpper         = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyTwilightUpper');
  const uloc_sky_twilightMid           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyTwilightMid');
  const uloc_sky_twilightLow           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyTwilightLow');
  const uloc_sky_twilightHorizon       = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyTwilightHorizon');
  const uloc_sky_horizonDeepRed        = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHorizonDeepRed');
  const uloc_sky_horizonBurntOrange    = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHorizonBurntOrange');
  const uloc_sky_horizonGold           = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHorizonGold');
  const uloc_sky_horizonPaleGold       = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHorizonPaleGold');
  const uloc_sky_crepuscularColor      = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyCrepuscularColor');
  const uloc_sky_crepuscularStrength   = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyCrepuscularStrength');
  const uloc_sky_sunHorizAmplitude     = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skySunHorizAmplitude');
  const uloc_sky_sunVertScale          = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skySunVertScale');
  const uloc_sky_hazeMixStrength       = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHazeMixStrength');
  const uloc_sky_hazeBoostStrength     = gl.getUniformLocation(skyBackgroundDisplayProgram, 'skyHazeBoostStrength');

  // per-frame lighting
  const uloc_lighting_IR_rate          = gl.getUniformLocation(lightingProgram,             'IR_rate');

  // per-frame user input
  const uloc_adv_userInputValues       = gl.getUniformLocation(advectionProgram, 'userInputValues');
  const uloc_adv_userInputMove         = gl.getUniformLocation(advectionProgram, 'userInputMove');
  const uloc_adv_wrapHorizontally      = gl.getUniformLocation(advectionProgram, 'wrapHorizontally');
  const uloc_adv_userInputType         = gl.getUniformLocation(advectionProgram, 'userInputType');
  const uloc_adv_iterNum               = gl.getUniformLocation(advectionProgram, 'iterNum');

  // per-frame precipitation
  const uloc_precip_iterNum            = gl.getUniformLocation(precipitationProgram,     'iterNum');
  const uloc_precip_inactiveDroplets   = gl.getUniformLocation(precipitationProgram,     'inactiveDroplets');
  const uloc_precip_enableLegacyParticleLightning = gl.getUniformLocation(precipitationProgram, 'enableLegacyParticleLightning');
  const uloc_lightningLocation_iterNum = gl.getUniformLocation(lightningLocationProgram, 'iterNum');

  // bloom blur
  const uloc_bloom_bloomTexture        = gl.getUniformLocation(bloomBlurProgram, 'bloomTexture');
  const uloc_bloom_texelSize           = gl.getUniformLocation(bloomBlurProgram, 'texelSize');

  // passthrough
  const uloc_passthrough_texture       = gl.getUniformLocation(passthroughProgram, 'tex');

  // skyBackground per-frame
  const uloc_sky_aspectRatios          = gl.getUniformLocation(skyBackgroundDisplayProgram, 'aspectRatios');
  const uloc_sky_view                  = gl.getUniformLocation(skyBackgroundDisplayProgram, 'view');
  const uloc_sky_Xmult                 = gl.getUniformLocation(skyBackgroundDisplayProgram, 'Xmult');
  const uloc_sky_iterNum               = gl.getUniformLocation(skyBackgroundDisplayProgram, 'iterNum');

  // realistic display per-frame
  const uloc_real_aspectRatios         = gl.getUniformLocation(realisticDisplayProgram, 'aspectRatios');
  const uloc_real_view                 = gl.getUniformLocation(realisticDisplayProgram, 'view');
  const uloc_real_cursor               = gl.getUniformLocation(realisticDisplayProgram, 'cursor');
  const uloc_real_Xmult                = gl.getUniformLocation(realisticDisplayProgram, 'Xmult');
  const uloc_real_iterNum              = gl.getUniformLocation(realisticDisplayProgram, 'iterNum');
  const uloc_real_displayVectorField   = gl.getUniformLocation(realisticDisplayProgram, 'displayVectorField');
  const uloc_real_visualQuality        = gl.getUniformLocation(realisticDisplayProgram, 'visualQuality');
  const uloc_real_ltEventAge           = gl.getUniformLocation(realisticDisplayProgram, 'ltEventAge');
  const uloc_real_ltNumStrikes         = gl.getUniformLocation(realisticDisplayProgram, 'ltNumStrikes');
  const uloc_real_ltStrikePos          = gl.getUniformLocation(realisticDisplayProgram, 'ltStrikePos[0]');
  const uloc_real_ltStrikeDest         = gl.getUniformLocation(realisticDisplayProgram, 'ltStrikeDest[0]');
  const uloc_real_ltStrikeMeta         = gl.getUniformLocation(realisticDisplayProgram, 'ltStrikeMeta[0]');
  const uloc_real_ltStrikeRoute        = gl.getUniformLocation(realisticDisplayProgram, 'ltStrikeRoute[0]');
  const uloc_real_ltBrightness         = gl.getUniformLocation(realisticDisplayProgram, 'ltBrightness');
  const uloc_real_ltContrast           = gl.getUniformLocation(realisticDisplayProgram, 'ltContrast');
  const uloc_real_ltChannelThickness   = gl.getUniformLocation(realisticDisplayProgram, 'ltChannelThickness');
  const uloc_real_ltBranchDensity      = gl.getUniformLocation(realisticDisplayProgram, 'ltBranchDensity');
  const uloc_real_ltBranchLength       = gl.getUniformLocation(realisticDisplayProgram, 'ltBranchLength');
  const uloc_real_ltFlashDuration      = gl.getUniformLocation(realisticDisplayProgram, 'ltFlashDuration');
  const uloc_real_ltGlowDuration       = gl.getUniformLocation(realisticDisplayProgram, 'ltGlowDuration');
  const uloc_real_ltGlowStrength       = gl.getUniformLocation(realisticDisplayProgram, 'ltGlowStrength');
  const uloc_real_ltAtmosIllum         = gl.getUniformLocation(realisticDisplayProgram, 'ltAtmosIllum');
  const uloc_real_ltCloudIllum         = gl.getUniformLocation(realisticDisplayProgram, 'ltCloudIllum');
  const uloc_real_ltRainIllum          = gl.getUniformLocation(realisticDisplayProgram, 'ltRainIllum');
  const uloc_real_ltTerrainIllum       = gl.getUniformLocation(realisticDisplayProgram, 'ltTerrainIllum');
  const uloc_real_ltNightFlash         = gl.getUniformLocation(realisticDisplayProgram, 'ltNightFlash');
  const uloc_real_ltDayFlash           = gl.getUniformLocation(realisticDisplayProgram, 'ltDayFlash');
  const uloc_real_ltLODLevel           = gl.getUniformLocation(realisticDisplayProgram, 'ltLODLevel');
  const uloc_real_ltEnableAtmos        = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableAtmos');
  const uloc_real_ltEnableCloudIllum   = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableCloudIllum');
  const uloc_real_ltEnableRainIllum    = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableRainIllum');
  const uloc_real_ltEnableTerrainIllum = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableTerrainIllum');
  const uloc_real_ltEnableChannelGlow  = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableChannelGlow');
  const uloc_real_ltEnableVolumetric   = gl.getUniformLocation(realisticDisplayProgram, 'ltEnableVolumetric');
  const uloc_real_ltIcChannelVis       = gl.getUniformLocation(realisticDisplayProgram, 'ltIcChannelVis');
  const uloc_real_ltCcChannelVis       = gl.getUniformLocation(realisticDisplayProgram, 'ltCcChannelVis');
  const uloc_real_ltSpiderChannelVis   = gl.getUniformLocation(realisticDisplayProgram, 'ltSpiderChannelVis');
  const uloc_real_ltAnvilChannelVis    = gl.getUniformLocation(realisticDisplayProgram, 'ltAnvilChannelVis');
  const uloc_real_ltCloudBranchDensity = gl.getUniformLocation(realisticDisplayProgram, 'ltCloudBranchDensity');
  const uloc_real_ltCloudBranchLength  = gl.getUniformLocation(realisticDisplayProgram, 'ltCloudBranchLength');
  const uloc_real_ltCloudChannelOpacity = gl.getUniformLocation(realisticDisplayProgram, 'ltCloudChannelOpacity');
  const uloc_real_ltCloudObscuration   = gl.getUniformLocation(realisticDisplayProgram, 'ltCloudObscuration');
  const uloc_real_ltChannelIllumRatio  = gl.getUniformLocation(realisticDisplayProgram, 'ltChannelIllumRatio');
  const uloc_real_ltStrobeFlicker      = gl.getUniformLocation(realisticDisplayProgram, 'ltStrobeFlicker');

  // precipDisplay per-frame
  const uloc_precipDisp_aspectRatios   = gl.getUniformLocation(precipDisplayProgram, 'aspectRatios');
  const uloc_precipDisp_view           = gl.getUniformLocation(precipDisplayProgram, 'view');

  // radarDisplay per-frame
  const uloc_radar_aspectRatios        = gl.getUniformLocation(radarDisplayProgram, 'aspectRatios');
  const uloc_radar_view                = gl.getUniformLocation(radarDisplayProgram, 'view');
  const uloc_radar_Xmult               = gl.getUniformLocation(radarDisplayProgram, 'Xmult');
  const uloc_radar_resolution          = gl.getUniformLocation(radarDisplayProgram, 'resolution');
  const uloc_radar_texelSize           = gl.getUniformLocation(radarDisplayProgram, 'texelSize');
  const uloc_radar_opacity             = gl.getUniformLocation(radarDisplayProgram, 'opacity');
  const uloc_radar_dbzOpacityEnabled   = gl.getUniformLocation(radarDisplayProgram, 'dbzOpacityEnabled');
  const uloc_radar_dbzOpacityStrength  = gl.getUniformLocation(radarDisplayProgram, 'dbzOpacityStrength');
  const uloc_radar_colorScaleColumn    = gl.getUniformLocation(radarDisplayProgram, 'colorScaleColumn');
  const uloc_radar_colorScaleStops     = gl.getUniformLocation(radarDisplayProgram, 'colorScaleStops');
  const uloc_radar_radarPos            = gl.getUniformLocation(radarDisplayProgram, 'radarPos');
  const uloc_radar_radarRange          = gl.getUniformLocation(radarDisplayProgram, 'radarRange');
  const uloc_radar_radarResolution     = gl.getUniformLocation(radarDisplayProgram, 'radarResolution');
  const uloc_radar_productType         = gl.getUniformLocation(radarDisplayProgram, 'productType');
  const uloc_radar_sensitivity         = gl.getUniformLocation(radarDisplayProgram, 'sensitivity');
  const uloc_radar_cappiHeightFrac     = gl.getUniformLocation(radarDisplayProgram, 'cappiHeightFrac');
  const uloc_radar_useAccumTexture     = gl.getUniformLocation(radarDisplayProgram, 'useAccumTexture');
  const uloc_radar_accumChannel        = gl.getUniformLocation(radarDisplayProgram, 'accumChannel');
  const uloc_radar_radarAccumTexture   = gl.getUniformLocation(radarDisplayProgram, 'radarAccumTexture');

  // temperature display per-frame
  const uloc_temp_aspectRatios         = gl.getUniformLocation(temperatureDisplayProgram, 'aspectRatios');
  const uloc_temp_view                 = gl.getUniformLocation(temperatureDisplayProgram, 'view');
  const uloc_temp_cursor               = gl.getUniformLocation(temperatureDisplayProgram, 'cursor');
  const uloc_temp_Xmult                = gl.getUniformLocation(temperatureDisplayProgram, 'Xmult');
  const uloc_temp_displayVectorField   = gl.getUniformLocation(temperatureDisplayProgram, 'displayVectorField');
  const uloc_temp_surfacePressure      = gl.getUniformLocation(temperatureDisplayProgram, 'surfacePressure');

  // temperatureChange display per-frame
  const uloc_tempChg_aspectRatios      = gl.getUniformLocation(temperatureChangeDisplayProgram, 'aspectRatios');
  const uloc_tempChg_view              = gl.getUniformLocation(temperatureChangeDisplayProgram, 'view');
  const uloc_tempChg_cursor            = gl.getUniformLocation(temperatureChangeDisplayProgram, 'cursor');
  const uloc_tempChg_Xmult             = gl.getUniformLocation(temperatureChangeDisplayProgram, 'Xmult');
  const uloc_tempChg_tempUnit          = gl.getUniformLocation(temperatureChangeDisplayProgram, 'tempUnit');
  const uloc_tempChg_displayVectorField= gl.getUniformLocation(temperatureChangeDisplayProgram, 'displayVectorField');

  // airQuality display per-frame
  const uloc_airQ_aspectRatios         = gl.getUniformLocation(airQualityDisplayProgram, 'aspectRatios');
  const uloc_airQ_view                 = gl.getUniformLocation(airQualityDisplayProgram, 'view');
  const uloc_airQ_cursor               = gl.getUniformLocation(airQualityDisplayProgram, 'cursor');
  const uloc_airQ_Xmult                = gl.getUniformLocation(airQualityDisplayProgram, 'Xmult');

  // humidity display per-frame
  const uloc_humd_aspectRatios         = gl.getUniformLocation(humidityDisplayProgram, 'aspectRatios');
  const uloc_humd_view                 = gl.getUniformLocation(humidityDisplayProgram, 'view');
  const uloc_humd_cursor               = gl.getUniformLocation(humidityDisplayProgram, 'cursor');
  const uloc_humd_Xmult                = gl.getUniformLocation(humidityDisplayProgram, 'Xmult');
  const uloc_humd_displayVectorField   = gl.getUniformLocation(humidityDisplayProgram, 'displayVectorField');
  const uloc_humd_colorScaleColumn     = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleColumn');
  const uloc_humd_colorScaleCloudColumn = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleCloudColumn');
  const uloc_humd_colorScaleRhMin      = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleRhMin');
  const uloc_humd_colorScaleRhMax      = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleRhMax');
  const uloc_humd_colorScaleRhOffset   = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleRhOffset');
  const uloc_humd_colorScaleCloudMin   = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleCloudMin');
  const uloc_humd_colorScaleCloudMax   = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleCloudMax');
  const uloc_humd_colorScaleCloudOffset = gl.getUniformLocation(humidityDisplayProgram, 'colorScaleCloudOffset');

  function setHumidityColorScaleUniforms() {
    const rhVals = colorScaleValues.relativeHumidity;
    const cloudVals = colorScaleValues.humidityCloud;
    if (!rhVals?.length || !cloudVals?.length) return;
    gl.uniform1i(uloc_humd_colorScaleColumn, 24);
    gl.uniform1i(uloc_humd_colorScaleCloudColumn, 60);
    gl.uniform1f(uloc_humd_colorScaleRhMin, rhVals[0]);
    gl.uniform1f(uloc_humd_colorScaleRhMax, rhVals[rhVals.length - 1]);
    gl.uniform1f(uloc_humd_colorScaleRhOffset, 0);
    gl.uniform1f(uloc_humd_colorScaleCloudMin, cloudVals[0]);
    gl.uniform1f(uloc_humd_colorScaleCloudMax, cloudVals[cloudVals.length - 1]);
    gl.uniform1f(uloc_humd_colorScaleCloudOffset, 0);
  }

  // IR temp display per-frame
  const uloc_IR_aspectRatios           = gl.getUniformLocation(IRtempDisplayProgram, 'aspectRatios');
  const uloc_IR_view                   = gl.getUniformLocation(IRtempDisplayProgram, 'view');
  const uloc_IR_cursor                 = gl.getUniformLocation(IRtempDisplayProgram, 'cursor');
  const uloc_IR_upOrDown               = gl.getUniformLocation(IRtempDisplayProgram, 'upOrDown');
  const uloc_IR_Xmult                  = gl.getUniformLocation(IRtempDisplayProgram, 'Xmult');

  // universal display per-frame
  const uloc_univ_aspectRatios         = gl.getUniformLocation(universalDisplayProgram, 'aspectRatios');
  const uloc_univ_view                 = gl.getUniformLocation(universalDisplayProgram, 'view');
  const uloc_univ_cursor               = gl.getUniformLocation(universalDisplayProgram, 'cursor');
  const uloc_univ_Xmult                = gl.getUniformLocation(universalDisplayProgram, 'Xmult');
  const uloc_univ_colorScaleColumn     = gl.getUniformLocation(universalDisplayProgram, 'colorScaleColumn');
  const uloc_univ_useUnipolarScale     = gl.getUniformLocation(universalDisplayProgram, 'useUnipolarScale');
  const uloc_univ_quantityIndex        = gl.getUniformLocation(universalDisplayProgram, 'quantityIndex');
  const uloc_univ_dispMultiplier       = gl.getUniformLocation(universalDisplayProgram, 'dispMultiplier');
  const uloc_univ_colorScaleStops      = gl.getUniformLocation(universalDisplayProgram, 'colorScaleStops');

  // airplane per-frame
  const uloc_sky_planeDirectionAndGearPos = gl.getUniformLocation(skyBackgroundDisplayProgram, 'planeDirectionAndGearPos');
  const uloc_sky_planePos                 = gl.getUniformLocation(skyBackgroundDisplayProgram, 'planePos');
  const uloc_adv_airplaneValues           = gl.getUniformLocation(advectionProgram,            'airplaneValues');

  // radar texture slot uniforms
  const uloc_radar_baseTexture         = gl.getUniformLocation(radarDisplayProgram, 'baseTexture');
  const uloc_radar_waterTexture        = gl.getUniformLocation(radarDisplayProgram, 'waterTexture');
  const uloc_radar_wallTexture         = gl.getUniformLocation(radarDisplayProgram, 'wallTexture');
  const uloc_radar_colorScalesTex      = gl.getUniformLocation(radarDisplayProgram, 'colorScalesTex');
  const uloc_radar_precipFeedbackTex   = gl.getUniformLocation(radarDisplayProgram, 'precipFeedbackTexture');
  const uloc_radar_precipDepositionTex = gl.getUniformLocation(radarDisplayProgram, 'precipDepositionTexture');

  const MAX_COMPOSITE_RADARS = 32;
  const uloc_comp_aspectRatios        = gl.getUniformLocation(compositeRadarDisplayProgram, 'aspectRatios');
  const uloc_comp_view                = gl.getUniformLocation(compositeRadarDisplayProgram, 'view');
  const uloc_comp_Xmult               = gl.getUniformLocation(compositeRadarDisplayProgram, 'Xmult');
  const uloc_comp_resolution          = gl.getUniformLocation(compositeRadarDisplayProgram, 'resolution');
  const uloc_comp_texelSize           = gl.getUniformLocation(compositeRadarDisplayProgram, 'texelSize');
  const uloc_comp_opacity             = gl.getUniformLocation(compositeRadarDisplayProgram, 'opacity');
  const uloc_comp_dbzOpacityEnabled   = gl.getUniformLocation(compositeRadarDisplayProgram, 'dbzOpacityEnabled');
  const uloc_comp_dbzOpacityStrength  = gl.getUniformLocation(compositeRadarDisplayProgram, 'dbzOpacityStrength');
  const uloc_comp_colorScaleColumn    = gl.getUniformLocation(compositeRadarDisplayProgram, 'colorScaleColumn');
  const uloc_comp_colorScaleStops     = gl.getUniformLocation(compositeRadarDisplayProgram, 'colorScaleStops');
  const uloc_comp_radarCount          = gl.getUniformLocation(compositeRadarDisplayProgram, 'radarCount');
  const uloc_comp_radarPositions      = gl.getUniformLocation(compositeRadarDisplayProgram, 'radarPositions');
  const uloc_comp_radarRanges         = gl.getUniformLocation(compositeRadarDisplayProgram, 'radarRanges');
  const uloc_comp_radarResolutions    = gl.getUniformLocation(compositeRadarDisplayProgram, 'radarResolutions');
  const uloc_comp_radarSensitivities  = gl.getUniformLocation(compositeRadarDisplayProgram, 'radarSensitivities');
  const uloc_comp_baseTexture         = gl.getUniformLocation(compositeRadarDisplayProgram, 'baseTexture');
  const uloc_comp_waterTexture        = gl.getUniformLocation(compositeRadarDisplayProgram, 'waterTexture');
  const uloc_comp_wallTexture         = gl.getUniformLocation(compositeRadarDisplayProgram, 'wallTexture');
  const uloc_comp_colorScalesTex      = gl.getUniformLocation(compositeRadarDisplayProgram, 'colorScalesTex');
  const uloc_comp_precipFeedbackTex   = gl.getUniformLocation(compositeRadarDisplayProgram, 'precipFeedbackTexture');
  const uloc_comp_precipDepositionTex = gl.getUniformLocation(compositeRadarDisplayProgram, 'precipDepositionTexture');

  // temperatureChange texture slot uniforms
  const uloc_tempChg_baseTex           = gl.getUniformLocation(temperatureChangeDisplayProgram, 'baseTex');
  const uloc_tempChg_prevBaseTex       = gl.getUniformLocation(temperatureChangeDisplayProgram, 'prevBaseTex');
  const uloc_tempChg_wallTex           = gl.getUniformLocation(temperatureChangeDisplayProgram, 'wallTex');
  const uloc_tempChg_colorScalesTex    = gl.getUniformLocation(temperatureChangeDisplayProgram, 'colorScalesTex');
  const uloc_tempChg_colorScaleColumn  = gl.getUniformLocation(temperatureChangeDisplayProgram, 'colorScaleColumn');
  ulocsReady = true; // all uniform locations cached, updateSunlight can now use them
  uploadSkyUniforms();


  for (i = 0; i < weatherStations.length; i++) { // initial measurement at weather stations
    weatherStations[i].measure();
  }

  setInterval(calcFps, 1000); // log fps
  requestAnimationFrame(draw);

  function onUpdateTimeOfDaySlider()
  {
    let minutes = (guiControls.timeOfDay % 1) * 60;
    simDateTime.setHours(guiControls.timeOfDay, minutes);
    updateSunlight();
  }

  function onUpdateMonthSlider()
  {
    let month = guiControls.month - 0.96;
    let date = (month % 1) * 30;
    simDateTime.setMonth(month, date);
    updateSunlight();
  }

  function updateSunlight(deltaT_hours)
  {
    if (deltaT_hours != 'MANUAL_ANGLE') {
      if (deltaT_hours != null) {                                                   // increment time
        simDateTime = new Date(simDateTime.getTime() + deltaT_hours * 3600 * 1000); // convert hours to ms and add to current date
        guiControls.timeOfDay = simDateTime.getHours() + simDateTime.getMinutes() / 60. + simDateTime.getSeconds() / 3600.;
        guiControls.month = simDateTime.getMonth() + 1 + simDateTime.getDate() / 30.5 + simDateTime.getHours() / 720.;
      } else {
        for (i = 0; i < weatherStations.length; i++) {
          weatherStations[i].clearChart();
        }
      }

      // More accurate solar position calculation
      let dayOfYear = Math.floor((guiControls.month - 1) * 30.44 + 1); // Approximate day of year
      
      // Solar declination (more accurate formula)
      let declination = 23.45 * Math.sin(degToRad * (360 / 365 * (dayOfYear - 81)));
      
      // Hour angle from time of day (solar noon at 12:00)
      let hourAngle = (guiControls.timeOfDay - 12) * 15; // degrees, 15 degrees per hour
      
      // Convert to radians
      let declinationRad = declination * degToRad;
      let latitudeRad = guiControls.latitude * degToRad;
      let hourAngleRad = hourAngle * degToRad;
      
      // Calculate solar elevation angle
      let sinElevation = Math.sin(latitudeRad) * Math.sin(declinationRad) + 
                         Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
      let elevationRad = Math.asin(sinElevation);
      
      // Convert to degrees (0 = horizon, 90 = directly overhead)
      guiControls.sunAngle = elevationRad * radToDeg;
    }
    let solarZenithAngleDeg = (90 - guiControls.sunAngle);
    let solarZenithAngle = solarZenithAngleDeg * degToRad; // Solar zenith angle centered around 0. (0 = vertical)
    let sunAzimuth = (guiControls.timeOfDay - 12.0) * 15.0 * degToRad; // hour angle: east morning, west evening
    // Calculations visualized: https://www.desmos.com/calculator/kzr76zj5hq
    if (Math.abs(solarZenithAngle) < 85.0 * degToRad) {
      sunIsUp = true;
    } else {
      sunIsUp = false;
    }
    //          console.log(solarZenithAngle, sunIsUp);
    //  let sunIntensity = guiControls.sunIntensity *
    // Math.pow(Math.max(Math.sin((90.0 - Math.abs(guiControls.sunAngle)) *
    // degToRad) - 0.1, 0.0) * 1.111, 0.4);
    let sunIntensity = guiControls.sunIntensity * Math.pow(Math.max(Math.sin(guiControls.sunAngle * degToRad), 0.0), 0.1) * 1300.0; // max 1300 w/m2 at 12 km
    // console.log('sunIntensity: ', sunIntensity);

    // minShadowLight = clamp(((90 + 10) - Math.abs(solarZenithAngleDeg)) * 0.006, 0.005, 0.040); // decrease until the sun goes 10 deg below the horizon

    if (guiControls.autoMinShadowLight) {
      minShadowLight = map_range_C(Math.abs(solarZenithAngleDeg), 100.0, 85.0, 0.005, 0.040); // decrease until the sun goes 10 deg below the horizon
    } else {
      minShadowLight = guiControls.minShadowLight;
    }

    if (ulocsReady) {
      gl.useProgram(boundaryProgram);
      gl.uniform1f(uloc_boundary_sunAngle, solarZenithAngle);
      gl.uniform1f(uloc_boundary_sunAzimuth, sunAzimuth);
      gl.useProgram(lightingProgram);
      gl.uniform1f(uloc_lighting_sunIntensity, sunIntensity);
      gl.uniform1f(uloc_lighting_sunAngle, solarZenithAngle);
      gl.uniform1f(uloc_lighting_sunAzimuth, sunAzimuth);
      gl.useProgram(realisticDisplayProgram);
      gl.uniform1f(uloc_realistic_sunAngle, solarZenithAngle);
      gl.uniform1f(uloc_realistic_sunAzimuth, sunAzimuth);
      gl.uniform1f(uloc_realistic_minShadowLight, minShadowLight);
      gl.useProgram(skyBackgroundDisplayProgram);
      gl.uniform1f(uloc_sky_minShadowLight, minShadowLight);
      gl.uniform1f(uloc_sky_sunAngle, solarZenithAngle);
      gl.uniform1f(uloc_sky_timeOfDay, guiControls.timeOfDay);
      gl.uniform1f(uloc_sky_month, guiControls.month);
    }

    if (guiControls.dayNightCycle)
      clockEl.innerHTML = dateTimeStr(); // update clock
    else
      clockEl.innerHTML = '';
  }

  function isRadarDisplayMode(mode)
  {
    return mode === 'DISP_RADAR' || mode === 'DISP_RADAR_COMPOSITE' || mode === 'DISP_RADAR_WORLD';
  }

  function shouldUpdateRadarDisplayCache()
  {
    let updateFreq = Math.max(1, Math.round(guiControls.radarUpdateFrequency || 1));
    if (lastRadarCacheIterNum === -1)
      return true;
    return (iterNum - lastRadarCacheIterNum) >= updateFreq;
  }

  function updateRadarDisplayCache()
  {
    if (!shouldUpdateRadarDisplayCache())
      return;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D, cachedBaseTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindTexture(gl.TEXTURE_2D, cachedWaterTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.bindTexture(gl.TEXTURE_2D, cachedWallTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, precipitationFeedbackFrameBuff);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindTexture(gl.TEXTURE_2D, cachedPrecipFeedbackTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindTexture(gl.TEXTURE_2D, cachedPrecipDepositionTexture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);

    lastRadarCacheIterNum = iterNum;
    updateRadarAccumTextureFromCache();
  }

  function bindRadarCachedSimTextures(baseLoc, waterLoc, wallLoc, precipFbLoc, precipDepLoc)
  {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cachedBaseTexture);
    gl.uniform1i(baseLoc, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, cachedWaterTexture);
    gl.uniform1i(waterLoc, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, cachedWallTexture);
    gl.uniform1i(wallLoc, 2);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, cachedPrecipFeedbackTexture);
    gl.uniform1i(precipFbLoc, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, cachedPrecipDepositionTexture);
    gl.uniform1i(precipDepLoc, 5);
  }

  function uploadCompositeRadarArrays()
  {
    const positions = new Float32Array(MAX_COMPOSITE_RADARS * 2);
    const ranges = new Float32Array(MAX_COMPOSITE_RADARS);
    const resolutions = new Float32Array(MAX_COMPOSITE_RADARS);
    const sensitivities = new Float32Array(MAX_COMPOSITE_RADARS);
    const count = Math.min(radars.length, MAX_COMPOSITE_RADARS);
    for (let i = 0; i < count; i++) {
      positions[i * 2] = radars[i].getXpos();
      positions[i * 2 + 1] = radars[i].getYpos();
      ranges[i] = radars[i].getRange();
      resolutions[i] = radars[i].getResolution();
      sensitivities[i] = radars[i].getSensitivity();
    }
    gl.uniform1i(uloc_comp_radarCount, count);
    gl.uniform2fv(uloc_comp_radarPositions, positions);
    gl.uniform1fv(uloc_comp_radarRanges, ranges);
    gl.uniform1fv(uloc_comp_radarResolutions, resolutions);
    gl.uniform1fv(uloc_comp_radarSensitivities, sensitivities);
  }

  function getRadarProductType(radar)
  {
    return getRadarProductTypeFromId(radar.getProduct());
  }

  function setRadarProductColorScaleUniforms(productId)
  {
    const meta = getRadarProductMeta(productId);
    const scale = RADAR_COLOR_SCALE_LOOKUP[meta.colorScale] || RADAR_COLOR_SCALE_LOOKUP.radarReflectivity;
    gl.uniform1i(uloc_radar_colorScaleColumn, scale.col);
    gl.uniform1i(uloc_radar_colorScaleStops, scale.stops);
  }

  function getRadarForOverlaySource()
  {
    const match = /^radar_(\d+)$/.exec(guiControls.radarOverlaySource || '');
    if (!match)
      return null;
    return radars[parseInt(match[1], 10)] || null;
  }

  function getBrushCursorType(inputType)
  {
    let cursorType = 1.0;
    if (guiControls.wholeWidth) {
      cursorType = 2.0;
    } else if (SETUP_MODE || (inputType <= 0 && !bPressed && (guiControls.tool == 'TOOL_NONE' || guiControls.tool == 'TOOL_STATION' || guiControls.tool == 'TOOL_RADAR' || guiControls.tool == 'TOOL_AIRMASS' || guiControls.tool == 'TOOL_MARKER'))) {
      cursorType = 0;
    }
    if (inputType === 0)
      cursorType += 0.55;
    return cursorType;
  }

  function setupRadarDisplayProgramCommonUniforms()
  {
    gl.uniform2f(uloc_radar_aspectRatios, sim_aspect, canvas_aspect);
    gl.uniform3f(uloc_radar_view, cam.curXpos, cam.curYpos, cam.curZoom);
    gl.uniform1f(uloc_radar_Xmult, horizontalDisplayMult);
    gl.uniform2f(uloc_radar_resolution, sim_res_x, sim_res_y);
    gl.uniform2f(uloc_radar_texelSize, 1.0 / sim_res_x, 1.0 / sim_res_y);
    gl.uniform1f(uloc_radar_opacity, guiControls.radarOpacity);
    gl.uniform1i(uloc_radar_dbzOpacityEnabled, guiControls.dbzOpacityEnabled);
    gl.uniform1f(uloc_radar_dbzOpacityStrength, guiControls.dbzOpacityStrength);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
    gl.uniform1i(uloc_radar_colorScalesTex, 3);
    bindRadarCachedSimTextures(uloc_radar_baseTexture, uloc_radar_waterTexture, uloc_radar_wallTexture,
                               uloc_radar_precipFeedbackTex, uloc_radar_precipDepositionTex);
  }

  function drawRadarProductAtSite(site, productId)
  {
    const productType = getRadarProductTypeFromId(productId);
    setRadarProductColorScaleUniforms(productId);
    gl.uniform2f(uloc_radar_radarPos, site.x, site.y);
    gl.uniform1f(uloc_radar_radarRange, site.range);
    gl.uniform1f(uloc_radar_radarResolution, site.resolution);
    gl.uniform1f(uloc_radar_sensitivity, site.sensitivity);
    gl.uniform1i(uloc_radar_productType, productType);
    gl.uniform1f(uloc_radar_cappiHeightFrac, guiControls.radarCappiHeight);
    const needsAccum = productId.startsWith('accumulation');
    gl.uniform1i(uloc_radar_useAccumTexture, needsAccum && radarAccumTexture ? 1 : 0);
    gl.uniform1i(uloc_radar_accumChannel, getRadarAccumChannel(productId));
    if (needsAccum && radarAccumTexture) {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, radarAccumTexture);
      gl.uniform1i(uloc_radar_radarAccumTexture, 6);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function drawWorldRadar()
  {
    const productId = guiControls.worldRadarProduct || 'reflectivity';
    gl.useProgram(radarDisplayProgram);
    setupRadarDisplayProgramCommonUniforms();
    drawRadarProductAtSite(getWorldRadarSite(), productId);
  }

  function drawSingleRadar(radar)
  {
    drawRadarProductAtSite({
      x: radar.getXpos(),
      y: radar.getYpos(),
      range: radar.getRange(),
      resolution: radar.getResolution(),
      sensitivity: radar.getSensitivity(),
    }, radar.getProduct());
  }

  function drawCompositeRadarOnce()
  {
    gl.useProgram(compositeRadarDisplayProgram);
    gl.uniform2f(uloc_comp_aspectRatios, sim_aspect, canvas_aspect);
    gl.uniform3f(uloc_comp_view, cam.curXpos, cam.curYpos, cam.curZoom);
    gl.uniform1f(uloc_comp_Xmult, horizontalDisplayMult);
    gl.uniform2f(uloc_comp_resolution, sim_res_x, sim_res_y);
    gl.uniform2f(uloc_comp_texelSize, 1.0 / sim_res_x, 1.0 / sim_res_y);
    gl.uniform1f(uloc_comp_opacity, guiControls.radarOpacity);
    gl.uniform1i(uloc_comp_dbzOpacityEnabled, guiControls.dbzOpacityEnabled);
    gl.uniform1f(uloc_comp_dbzOpacityStrength, guiControls.dbzOpacityStrength);
    gl.uniform1i(uloc_comp_colorScaleColumn, 18);
    gl.uniform1i(uloc_comp_colorScaleStops, 36);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
    gl.uniform1i(uloc_comp_colorScalesTex, 3);
    bindRadarCachedSimTextures(uloc_comp_baseTexture, uloc_comp_waterTexture, uloc_comp_wallTexture,
                               uloc_comp_precipFeedbackTex, uloc_comp_precipDepositionTex);
    uploadCompositeRadarArrays();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function getRadarLightningIconDurationMs()
  {
    return Math.max(500, guiControls.radarLightningIconDuration * 1000);
  }

  function shaderRand(n)
  {
    return Math.sin(n) * 43758.5453123 - Math.floor(Math.sin(n) * 43758.5453123);
  }

  function posMod(a, b)
  {
    return ((a % b) + b) % b;
  }

  function isForcedLightningActive()
  {
    return proceduralLightningState.channelId === 'forced'
      && proceduralLightningState.eventAge >= 0
      && proceduralLightningState.eventAge < getLightningFlashDuration();
  }

  function isProceduralLightningEnabled()
  {
    if (isForcedLightningActive() || forcedLightningQueue.length > 0)
      return true;
    if (guiControls.lightningV2Enabled === false)
      return false;
    if (typeof LightningV2 !== 'undefined') {
      return LightningV2.getChannels(guiControls, 0.5).length > 0
        || guiControls.enableCloudLightning || guiControls.enableCloudGroundLightning
        || guiControls.enableStrobeLightning || guiControls.enableCloudFlash;
    }
    return guiControls.enableCloudLightning || guiControls.enableCloudGroundLightning
      || guiControls.enableStrobeLightning || guiControls.enableCloudFlash;
  }

  function getLightningIterScale()
  {
    return Math.max(1, guiControls.IterPerFrame || 1);
  }

  function getLightningFlashDuration()
  {
    const base = Math.max(6, Math.round(11 * (guiControls.flashDuration || 1.0)));
    return base * getLightningIterScale();
  }

  function getEffectiveLtFlashDuration()
  {
    return (guiControls.flashDuration || 1.0) * getLightningIterScale();
  }

  const LIGHTNING_VISUAL_FLASH_MS_BASE = 480;

  function getLightningVisualFlashMs()
  {
    return LIGHTNING_VISUAL_FLASH_MS_BASE * (guiControls.flashDuration || 1.0);
  }

  // Smooth wall-clock age for rendering — iteration age jumps by IterPerFrame and strobes shadows
  function getLightningVisualAge()
  {
    const st = proceduralLightningState;
    if (st.strikes.length === 0 || st.builtEventId < 0)
      return -1;
    if (guiControls.paused && st.frozenVisualAge != null)
      return st.frozenVisualAge;
    if (!st.flashStartMs || st.flashStartMs <= 0)
      return st.eventAge >= 0 ? st.eventAge : -1;
    const t = (performance.now() - st.flashStartMs) / getLightningVisualFlashMs();
    if (t >= 1.0)
      return -1;
    return t * getLightningFlashDuration();
  }

  function getCurrentLightTexture()
  {
    return latestLightTexture || lightTexture_0;
  }

  function resetLightningFrameCpuCache()
  {
    if (lightningFrameCpuCache.frame === frameNum)
      return;
    lightningFrameCpuCache.frame = frameNum;
    lightningFrameCpuCache.stormActivity = null;
    lightningFrameCpuCache.activeChannels = null;
    lightningFrameCpuCache.strikeChannels = null;
    lightningFrameCpuCache.channelStrikeChances = new Map();
    lightningFrameCpuCache.chargeValidByKey = new Map();
    lightningFrameCpuCache.originPickByKey = new Map();
  }

  function clearLightningDataTexture()
  {
    gl.bindFramebuffer(gl.FRAMEBUFFER, lightningDataFrameBuff);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sim_res_x, sim_res_y);
  }

  function isLightningCpuReady()
  {
    return !SETUP_MODE && simRuntimeFrames >= LIGHTNING_WARMUP_FRAMES;
  }

  function getStartupIterationCap()
  {
    if (SETUP_MODE || simRuntimeFrames >= 60)
      return null;
    if (simRuntimeFrames < 20)
      return 2;
    if (simRuntimeFrames < 45)
      return 5;
    return null;
  }

  function estimateStormActivity()
  {
    if (!lightningFieldCache) return 0.4;
    let sum = 0;
    const step = Math.max(1, Math.floor(lightningFieldCache.cacheW / 8));
    for (let y = 0; y < lightningFieldCache.cacheH; y += step) {
      for (let x = 0; x < lightningFieldCache.cacheW; x += step) {
        const i = (y * lightningFieldCache.cacheW + x) * 4;
        sum += Math.abs(lightningFieldCache.data[i]) + lightningFieldCache.data[i + 2] * 0.5;
      }
    }
    const cells = Math.ceil(lightningFieldCache.cacheW / step) * Math.ceil(lightningFieldCache.cacheH / step);
    return clamp(sum / Math.max(cells, 1) * 2.5, 0.1, 1.0);
  }

  function getCachedStormActivity()
  {
    resetLightningFrameCpuCache();
    if (lightningFrameCpuCache.stormActivity != null)
      return lightningFrameCpuCache.stormActivity;
    const profile = getStormElectricalProfile();
    lightningFrameCpuCache.stormActivity = profile
      ? profile.stormActivity
      : estimateStormActivity();
    return lightningFrameCpuCache.stormActivity;
  }

  function getCachedChannelStrikeChance(channel)
  {
    resetLightningFrameCpuCache();
    const cached = lightningFrameCpuCache.channelStrikeChances.get(channel.id);
    if (cached != null)
      return cached;
    const burstMult = lightningBurstState.phase === 'burst' ? lightningBurstState.burstIntensity : 0.30;
    const chance = typeof LightningV2 !== 'undefined'
      ? LightningV2.strikeChance(channel.freq(), burstMult, guiControls.lightningClusteringStrength)
      : lightningStrikeChance(channel.freq());
    lightningFrameCpuCache.channelStrikeChances.set(channel.id, chance);
    return chance;
  }

  function getCachedActiveLightningChannels()
  {
    resetLightningFrameCpuCache();
    if (lightningFrameCpuCache.activeChannels)
      return lightningFrameCpuCache.activeChannels;
    const stormActivity = getCachedStormActivity();
    const profile = getStormElectricalProfile();
    let channels;
    if (typeof LightningV2 !== 'undefined')
      channels = LightningV2.getChannels(guiControls, stormActivity, profile);
    else
      channels = [
        { id: 'cc', salt: 911, freq: () => guiControls.cloudLightningFrequency },
        { id: 'flash', salt: 1511, freq: () => guiControls.cloudFlashFrequency },
        { id: 'strobe', salt: 1913, freq: () => guiControls.strobeLightningFrequency },
        { id: 'cg', salt: 2917, freq: () => guiControls.cloudGroundLightningFrequency },
      ];
    lightningFrameCpuCache.activeChannels = channels.filter(ch => {
      if (ch.id === 'strobe' && guiControls.enableStrobeLightning === false)
        return false;
      return ch.freq() > 0;
    });
    return lightningFrameCpuCache.activeChannels;
  }

  function getCachedLightningStrikeChannels()
  {
    resetLightningFrameCpuCache();
    if (lightningFrameCpuCache.strikeChannels)
      return lightningFrameCpuCache.strikeChannels;
    const channels = getCachedActiveLightningChannels();
    lightningFrameCpuCache.strikeChannels = channels.filter(ch => getCachedChannelStrikeChance(ch) > 0);
    return lightningFrameCpuCache.strikeChannels;
  }

  function updateDropletSizeTexture()
  {
    if (!guiControls.enablePrecipitation || NUM_DROPLETS < 1)
      return;

    const srcVAO = even ? precipitationVao_0 : precipitationVao_1;

    gl.useProgram(dropletSizeAccumProgram);
    gl.bindVertexArray(srcVAO);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dropletSizeFrameBuff);
    gl.viewport(0, 0, sim_res_x, sim_res_y);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);

    gl.bindVertexArray(fluidVao);
  }

  function refreshLightningFieldCache()
  {
    if (!isLightningCpuReady() || !isProceduralLightningEnabled())
      return;
    // Throttle: rebuild every 3–5 frames depending on load. Lightning spawning is measured
    // in simulation-seconds so occasional staleness is imperceptible.
    const cacheThrottle = useLiteVisualsMode() ? 5 : 3;
    if (lightningFieldCacheFrame >= frameNum - (cacheThrottle - 1) && lightningFieldCache)
      return;
    if (!lightningSummaryBuffer || lightningCacheW < 1)
      return;

    lightningFieldCacheFrame = frameNum;

    gl.useProgram(lightningSummaryProgram);
    gl.bindVertexArray(fluidVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, lightningSummaryFrameBuff);
    gl.viewport(0, 0, lightningCacheW, lightningCacheH);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, even ? chargeTexture_0 : chargeTexture_1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.readPixels(0, 0, lightningCacheW, lightningCacheH, gl.RGBA, gl.FLOAT, lightningSummaryBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sim_res_x, sim_res_y);

    lightningFieldCache = {
      data: lightningSummaryBuffer,
      cacheW: lightningCacheW,
      cacheH: lightningCacheH,
      scale: LIGHTNING_CACHE_SCALE
    };
  }

  function readChargeCached(simX, simY)
  {
    if (!lightningFieldCache)
      return 0;
    const px = Math.max(0, Math.min(lightningFieldCache.cacheW - 1, Math.floor(simX / lightningFieldCache.scale)));
    const py = Math.max(0, Math.min(lightningFieldCache.cacheH - 1, Math.floor(simY / lightningFieldCache.scale)));
    return lightningFieldCache.data[(py * lightningFieldCache.cacheW + px) * 4];
  }

  function readCloudCached(simX, simY)
  {
    if (!lightningFieldCache)
      return 0;
    const px = Math.max(0, Math.min(lightningFieldCache.cacheW - 1, Math.floor(simX / lightningFieldCache.scale)));
    const py = Math.max(0, Math.min(lightningFieldCache.cacheH - 1, Math.floor(simY / lightningFieldCache.scale)));
    return lightningFieldCache.data[(py * lightningFieldCache.cacheW + px) * 4 + 1];
  }

  function readPotentialCached(simX, simY)
  {
    if (!lightningFieldCache) return 0;
    const px = Math.max(0, Math.min(lightningFieldCache.cacheW - 1, Math.floor(simX / lightningFieldCache.scale)));
    const py = Math.max(0, Math.min(lightningFieldCache.cacheH - 1, Math.floor(simY / lightningFieldCache.scale)));
    return lightningFieldCache.data[(py * lightningFieldCache.cacheW + px) * 4 + 2];
  }

  function readConductivityCached(simX, simY)
  {
    if (!lightningFieldCache) return 0;
    const px = Math.max(0, Math.min(lightningFieldCache.cacheW - 1, Math.floor(simX / lightningFieldCache.scale)));
    const py = Math.max(0, Math.min(lightningFieldCache.cacheH - 1, Math.floor(simY / lightningFieldCache.scale)));
    return lightningFieldCache.data[(py * lightningFieldCache.cacheW + px) * 4 + 3];
  }

  function readSurfaceChargeCached(simX, simY)
  {
    if (!lightningFieldCache) return 0;
    const px = Math.max(0, Math.min(lightningFieldCache.cacheW - 1, Math.floor(simX / lightningFieldCache.scale)));
    const py = Math.max(0, Math.min(lightningFieldCache.cacheH - 1, Math.floor(simY / lightningFieldCache.scale)));
    return lightningFieldCache.data[(py * lightningFieldCache.cacheW + px) * 4];
  }

  function getStormElectricalProfile()
  {
    refreshLightningFieldCache();
    if (lightningStormProfileFrame === frameNum && lightningStormProfile)
      return lightningStormProfile;
    lightningStormProfileFrame = frameNum;
    if (typeof LightningV2 !== 'undefined' && lightningFieldCache)
      lightningStormProfile = LightningV2.analyzeStormElectricalProfile(
        lightningFieldCache, sim_res_x, sim_res_y);
    else
      lightningStormProfile = null;
    return lightningStormProfile;
  }

  function chargeThresholdForType(ltType)
  {
    let t = guiControls.cloudLightningThreshold;
    if (ltType >= 5)
      t = guiControls.cloudGroundLightningThreshold;
    else if (ltType === 4)
      t = guiControls.strobeLightningThreshold;
    else if (ltType === 3)
      t = guiControls.cloudFlashThreshold;
    return 0.10 + t * 0.35;
  }

  function channelCloudThreshold(channel)
  {
    if (channel.id === 'cg')
      return guiControls.cloudGroundLightningThreshold;
    if (channel.id === 'strobe')
      return guiControls.strobeLightningThreshold;
    if (channel.id === 'flash')
      return guiControls.cloudFlashThreshold;
    return guiControls.cloudLightningThreshold;
  }

  function channelChargeThreshold(channel)
  {
    return 0.10 + channelCloudThreshold(channel) * 0.35;
  }

  function lightningStrikeChance(freq)
  {
    if (freq <= 0)
      return 0;
    const norm = freq / 100.0;
    return Math.min(0.72, norm * norm * 0.50 + norm * 0.38 + 0.003);
  }

  function getLightningChannels()
  {
    return getCachedActiveLightningChannels();
  }

  function getActiveLightningChannels()
  {
    return getCachedActiveLightningChannels();
  }

  function findActiveLightningEventJS(frameIter)
  {
    if (!lightningFieldCache)
      return { eventAge: -1, eventId: 0, channel: null };

    const channels = getCachedLightningStrikeChannels();
    if (channels.length === 0)
      return { eventAge: -1, eventId: 0, channel: null };

    // Only detect strikes on the current iteration — lookback re-triggers the same event and causes rapid flicker
    const startIter = frameIter;
    if (startIter === proceduralLightningState.lastCompletedEventId)
      return { eventAge: -1, eventId: 0, channel: null };

    const hits = [];
    if (typeof LightningV2 !== 'undefined') {
      const stormActivity = getCachedStormActivity();
      const readiness = LightningV2.computeStormChargeReadiness(
        lightningFieldCache, sim_res_x, sim_res_y);
      const channel = LightningV2.rollLightningSpawn(
        channels,
        ch => getCachedChannelStrikeChance(ch),
        stormActivity,
        readiness,
        startIter,
        (eventId, ch) => isStrikeStartChargeValidForChannel(eventId, ch),
        guiControls.globalLightningMultiplier);
      if (channel)
        return { eventAge: 0, eventId: startIter, channel };
      return { eventAge: -1, eventId: 0, channel: null };
    }
    for (const ch of channels) {
      const strikeChance = getCachedChannelStrikeChance(ch);
      if (strikeChance <= 0)
        continue;
      if (shaderRand(startIter * 1.37 + ch.salt) >= strikeChance)
        continue;
      if (!isStrikeStartChargeValidForChannel(startIter, ch))
        continue;
      hits.push(ch);
    }
    if (hits.length > 0) {
      const pick = hits[Math.floor(shaderRand(startIter * 7.31 + 613.0) * hits.length)];
      return { eventAge: 0, eventId: startIter, channel: pick };
    }
    return { eventAge: -1, eventId: 0, channel: null };
  }

  function isStrikeStartChargeValidForChannel(eventId, channel)
  {
    resetLightningFrameCpuCache();
    const cacheKey = eventId + ':' + channel.id;
    if (lightningFrameCpuCache.chargeValidByKey.has(cacheKey))
      return lightningFrameCpuCache.chargeValidByKey.get(cacheKey);

    for (let s = 0; s < 4; s++) {
      const pick = pickLightningOriginCached(eventId, s, 4, channel.id);
      if (typeof LightningV2 !== 'undefined' && lightningFieldCache
          && LightningV2.isOriginEligibleForStrike(
            lightningFieldCache, pick, guiControls, channel.id, null, sim_res_x, sim_res_y)) {
        lightningFrameCpuCache.chargeValidByKey.set(cacheKey, true);
        return true;
      }
    }
    lightningFrameCpuCache.chargeValidByKey.set(cacheKey, false);
    return false;
  }

  function assignLtTypeForChannel(channel, origin, eventId, slot)
  {
    if (typeof LightningV2 !== 'undefined') {
      const surfaceCond = readConductivityCached(origin.originX, sim_res_y * 0.03);
      const surfaceCloud = readCloudCached(origin.originX, sim_res_y * 0.05);
      const isDry = surfaceCond < 0.22 && surfaceCloud < 0.08 && origin.originY > sim_res_y * 0.22;
      return LightningV2.selectTypeForChannel(
        channel.id,
        { charge: origin.chargeVal, potential: origin.potential || 0 },
        eventId, slot, guiControls, isDry);
    }
    const chargeVal = origin.chargeVal;
    const chargeMag = Math.abs(chargeVal);
    const r = shaderRand(eventId * 3.17 + channel.salt + slot * 41.0);
    if (channel.id === 'cc') return r > 0.42 ? 2 : 1;
    if (channel.id === 'flash') return 3;
    if (channel.id === 'strobe') return 4;
    if (channel.id === 'cg') return chargeMag >= 0.38 && r > 0.38 ? 6 : 5;
    return 3;
  }

  function readCloudAtSimPixel(simX, simY)
  {
    if (lightningFieldCache)
      return readCloudCached(simX, simY);
    const px = Math.max(0, Math.min(sim_res_x - 1, Math.floor(simX)));
    const py = Math.max(0, Math.min(sim_res_y - 1, Math.floor(simY)));
    const data = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, data);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data[1];
  }

  function cloudGateFromDensity(originCloud)
  {
    return clamp(1.0 - 1.0 / (1.0 + originCloud * 13.0), 0.0, 1.0);
  }

  function selectLightningTypeJS(chargeVal, cloudGate)
  {
    const chargeMag = Math.abs(chargeVal);
    const chargeNeg = Math.max(-chargeVal, 0);
    if (cloudGate < 0.15 || chargeMag < 0.20) return 0;
    if (chargeNeg >= 0.12 && chargeMag >= 0.28) {
      if (chargeMag >= 0.42 || chargeNeg >= 0.30) return 6;
      return 5;
    }
    if (chargeMag >= 0.52) return 4;
    if (chargeMag >= 0.38) return 3;
    if (chargeMag < 0.35) return 1;
    return 2;
  }

  function lightningStrikeSeedJS(eventId, strikeSlot, originX, originY)
  {
    const h1 = shaderRand(eventId * 12.9898 + strikeSlot * 78.233 + 911.7);
    const h2 = shaderRand(originX * 0.017 + originY * 0.013 + eventId * 0.031 + strikeSlot * 503.7);
    const h3 = shaderRand(h1 * 9100.3 + h2 * 5321.1 + strikeSlot * 91.17);
    // Keep in float32-safe range — never scale by eventId directly
    return 500 + h1 * 5500 + h2 * 5500 + h3 * 3500 + strikeSlot * 317;
  }

  function pickLightningOriginCached(eventId, strikeSlot, numStrikeSlots, channelId)
  {
    resetLightningFrameCpuCache();
    const cacheKey = eventId + ':' + strikeSlot + ':' + numStrikeSlots + ':' + channelId;
    if (lightningFrameCpuCache.originPickByKey.has(cacheKey))
      return lightningFrameCpuCache.originPickByKey.get(cacheKey);

    let pick;
    if (typeof LightningV2 !== 'undefined' && lightningFieldCache) {
      const raw = LightningV2.pickOriginFromPotential(
        lightningFieldCache, eventId, strikeSlot, numStrikeSlots, sim_res_x, sim_res_y, channelId, guiControls);
      pick = {
        originX: raw.x,
        originY: raw.y,
        cloudGate: LightningV2.cloudGate(raw.cloud),
        chargeVal: raw.charge,
        potential: raw.potential,
        cloud: raw.cloud,
        eligible: raw.x >= 0 && raw.y >= 0 && LightningV2.isOriginEligibleForStrike(
          lightningFieldCache, raw, guiControls, channelId, null, sim_res_x, sim_res_y),
      };
    } else {
      pick = {
        originX: sim_res_x * 0.5,
        originY: sim_res_y * 0.35,
        cloudGate: 0.5,
        chargeVal: 0.3,
        potential: 0.3,
      };
    }
    lightningFrameCpuCache.originPickByKey.set(cacheKey, pick);
    return pick;
  }

  function evaluateProceduralStrikeCached(pick, channel, eventId, slot)
  {
    if (pick.originX < 0 || pick.originY < 0)
      return null;
    if (typeof LightningV2 !== 'undefined' && lightningFieldCache) {
      if (!LightningV2.isOriginEligibleForStrike(
          lightningFieldCache, pick, guiControls, channel.id, null, sim_res_x, sim_res_y))
        return null;
    } else {
      const originMag = Math.abs(pick.chargeVal);
      const potential = pick.potential || 0;
      if (pick.cloudGate < 0.28 || originMag < 0.24)
        return null;
    }
    const originMag = Math.abs(pick.chargeVal);
    const potential = pick.potential || readPotentialCached(pick.originX, pick.originY);
    const ltType = assignLtTypeForChannel(channel, pick, eventId, slot);
    if (!ltType)
      return null;
    if (typeof LightningV2 !== 'undefined'
        && !LightningV2.isOriginEligibleForStrike(
          lightningFieldCache, pick, guiControls, channel.id, ltType, sim_res_x, sim_res_y))
      return null;
    return { ltType, chargeVal: pick.chargeVal, originMag: Math.max(originMag, potential * 0.5), cloudGate: pick.cloudGate };
  }

  function computeCloudFlashSize(originMag, eventId, slot)
  {
    const r = shaderRand(eventId * 5.13 + slot * 97.0 + 311.0);
    const chargeHeadroom = clamp((originMag - 0.12) / 0.65, 0, 1);
    return 0.28 + chargeHeadroom * 0.52 + r * 0.55;
  }

  function dischargeMultiplierForType(ltType)
  {
    if (ltType === 11)
      return guiControls.cloudLightningDischarge * 0.65;
    if (ltType >= 5 && ltType <= 10)
      return guiControls.cloudGroundLightningDischarge;
    if (ltType === 4)
      return guiControls.strobeLightningDischarge;
    if (ltType === 3)
      return guiControls.cloudFlashDischarge;
    return guiControls.cloudLightningDischarge;
  }

  function dischargeAmountForStrike(ltType, originMag, flashSize = 1)
  {
    let amount = originMag * 0.68 + 0.10;
    if (ltType === 11)
      amount *= 0.55;
    else if (ltType >= 5 && ltType <= 10)
      amount *= 1.20;
    else if (ltType === 3)
      amount *= 0.50 + flashSize * 0.72;
    else if (ltType === 4)
      amount *= 0.90;
    else
      amount *= 0.82;
    amount *= dischargeMultiplierForType(ltType);
    return Math.min(amount, 0.92);
  }

  function dischargeRadiusForStrike(ltType, flashSize = 1)
  {
    if (ltType === 11)
      return 8 + flashSize * 6;
    if (ltType === 6)
      return 24;
    if (ltType >= 5 && ltType <= 10)
      return 18;
    if (ltType >= 7 && ltType <= 8)
      return 20;
    if (ltType === 3 || ltType === 1)
      return 5 + flashSize * 22;
    if (ltType === 4)
      return 11;
    return 14;
  }

  function queueChargeDischargeForStrike(strike)
  {
    if (chargeDischargesThisIter.length >= 4)
      return;
    const flashSize = strike.flashSize || 1;
    chargeDischargesThisIter.push({
      u: strike.originX / sim_res_x,
      v: strike.originY / sim_res_y,
      amount: dischargeAmountForStrike(strike.ltType, strike.originMag, flashSize),
      radius: dischargeRadiusForStrike(strike.ltType, flashSize),
      ltType: strike.ltType
    });
  }

  const chargeDischargeUniformData = new Float32Array(16);
  const chargeDischargeUniformMeta = new Float32Array(16);

  function uploadChargeDischargeUniforms()
  {
    const count = Math.min(chargeDischargesThisIter.length, 4);
    gl.uniform1i(uloc_charge_ltDischargeCount, count);
    const disArr = chargeDischargeUniformData;
    const metaArr = chargeDischargeUniformMeta;
    disArr.fill(0);
    metaArr.fill(0);
    for (let i = 0; i < count; i++) {
      const d = chargeDischargesThisIter[i];
      disArr[i * 4] = d.u;
      disArr[i * 4 + 1] = d.v;
      disArr[i * 4 + 2] = d.amount;
      disArr[i * 4 + 3] = d.radius;
      metaArr[i * 4] = d.ltType;
    }
    gl.uniform4fv(uloc_charge_ltDischarge, disArr);
    gl.uniform4fv(uloc_charge_ltDischargeMeta, metaArr);
  }

  function channelIdForLtType(ltType)
  {
    if (ltType === 7) return 'spider';
    if (ltType === 8) return 'anvil';
    if (ltType === 5 || ltType === 6) return 'cg';
    if (ltType === 4) return 'strobe';
    if (ltType === 3) return 'sheet';
    if (ltType === 2) return 'cc';
    if (ltType === 9) return 'upward';
    if (ltType === 10) return 'bftb';
    if (ltType === 11) return 'dry';
    return 'intracloud';
  }

  function getViewCenterLightningPick(ltType)
  {
    const normX = screenToSimX(canvas.width * 0.5);
    const normY = screenToSimY(canvas.height * 0.5);
    let originY = clamp(normY, 0.12, 0.82);
    if (ltType === 7 || ltType === 8) originY = clamp(normY + 0.18, 0.42, 0.88);
    else if (ltType >= 5 && ltType <= 6) originY = clamp(normY + 0.08, 0.22, 0.72);
    return {
      originX: clamp(Math.floor(normX * sim_res_x), 0, sim_res_x - 1),
      originY: clamp(Math.floor(originY * sim_res_y), 0, sim_res_y - 1),
      cloudGate: 0.65,
      chargeVal: ltType === 6 ? 0.52 : -0.42,
      potential: 0.55,
    };
  }

  function getForcedLightningPick(ltType, eventId)
  {
    refreshLightningFieldCache();
    const channelId = channelIdForLtType(ltType);
    if (typeof LightningV2 !== 'undefined' && lightningFieldCache) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const pick = LightningV2.pickOriginFromPotential(
          lightningFieldCache, eventId + attempt * 17, attempt, 8, sim_res_x, sim_res_y, channelId, guiControls);
        if (pick.x < 0 || pick.y < 0)
          continue;
        if (!LightningV2.isOriginEligibleForStrike(
            lightningFieldCache, pick, guiControls, channelId, ltType, sim_res_x, sim_res_y))
          continue;
        return {
          originX: pick.x,
          originY: pick.y,
          cloudGate: LightningV2.cloudGate(pick.cloud),
          chargeVal: pick.charge,
          potential: pick.potential,
          cloud: pick.cloud,
        };
      }
    }
    return {
      originX: -1,
      originY: -1,
      cloudGate: 0,
      chargeVal: 0,
      potential: 0,
      cloud: 0,
    };
  }

  function packStrikeRouteForStrike(strike)
  {
    if (strike.viaMidpoint && strike.midX != null && strike.midY != null) {
      return [
        strike.midX / sim_res_x,
        strike.midY / sim_res_y,
        1.0,
        0.0,
      ];
    }
    const r = strike.routePoints;
    if (r && r.length >= 3) {
      const i1 = Math.max(1, Math.floor(r.length * 0.33));
      const i2 = Math.max(i1 + 1, Math.floor(r.length * 0.66));
      return [
        r[i1].x / sim_res_x, r[i1].y / sim_res_y,
        r[i2].x / sim_res_x, r[i2].y / sim_res_y,
      ];
    }
    const ox = strike.originX;
    const oy = strike.originY;
    const dx = strike.destX;
    const dy = strike.destY;
    return [
      (ox + (dx - ox) * 0.33) / sim_res_x,
      (oy + (dy - oy) * 0.33) / sim_res_y,
      (ox + (dx - ox) * 0.66) / sim_res_x,
      (oy + (dy - oy) * 0.66) / sim_res_y,
    ];
  }

  function cloudChannelVisibilityForType(ltType)
  {
    if (ltType === 1) return guiControls.intracloudChannelVisibility ?? 1;
    if (ltType === 2) return guiControls.cloudToCloudChannelVisibility ?? 1;
    if (ltType === 7) return guiControls.spiderChannelVisibility ?? 1;
    if (ltType === 8) return guiControls.anvilChannelVisibility ?? 1;
    return 1;
  }

  function buildStrikeFromPick(pick, ltType, eventId, slot, opts)
  {
    opts = opts || {};
    const originMag = Math.max(
      Math.abs(pick.chargeVal || 0),
      (pick.potential || readPotentialCached(pick.originX, pick.originY)) * 0.45);
    const seed = lightningStrikeSeedJS(eventId, slot, pick.originX, pick.originY);
    let flashSize = ltType === 3 || ltType === 1 || ltType === 2
      ? computeCloudFlashSize(originMag, eventId, slot) : 1.0;
    let numReturnStrokes = typeof LightningV2 !== 'undefined'
      ? LightningV2.numReturnStrokesForType(ltType, originMag, seed, guiControls) : 1;
    if (opts.strobeBurst)
      numReturnStrokes = Math.min(guiControls.maxReturnStrokes || 4,
        Math.max(numReturnStrokes, 2 + Math.floor(shaderRand(seed + 883) * 2)));
    const brightness = typeof LightningV2 !== 'undefined'
      ? LightningV2.brightnessForType(ltType, originMag, guiControls, opts) : originMag;
    const illumRadius = typeof LightningV2 !== 'undefined'
      ? LightningV2.illuminationRadiusForType(ltType, guiControls) : 1.0;
    let groundStrike = typeof LightningV2 !== 'undefined'
      ? LightningV2.isGroundStrike(ltType) : ltType >= 5 && ltType <= 6;
    let destX = pick.originX;
    let destY = pick.originY;
    let routePoints = null;
    let boltBranches = null;
    let boltPathLengthNorm = 0;
    let boltBranchCount = 0;
    let boltVisibilityMult = 1;
    let flashInFront = false;
    let flashOnly = false;
    let midX = null;
    let midY = null;
    let viaMidpoint = false;
    let precipOnly = typeof LightningV2 !== 'undefined'
      ? LightningV2.rollPrecipOnlyStrike(seed, ltType, guiControls) : false;
    if (precipOnly)
      flashInFront = false;
    const profile = getStormElectricalProfile();

    if (typeof LightningV2 !== 'undefined' && lightningFieldCache
        && LightningV2.isFlashOnlyType(ltType, opts.strobeBurst)) {
      const flash = LightningV2.buildFlashPlacement(
        ltType, pick, lightningFieldCache, eventId, slot, sim_res_x, sim_res_y, seed, guiControls, opts);
      destX = flash.destX;
      destY = flash.destY;
      routePoints = flash.routePoints;
      boltBranches = flash.branches;
      boltPathLengthNorm = 0;
      boltBranchCount = 0;
      boltVisibilityMult = flash.visibilityMult;
      flashSize = flash.flashSize;
      flashInFront = flash.flashInFront;
      flashOnly = true;
      groundStrike = false;
      midX = flash.midX;
      midY = flash.midY;
      viaMidpoint = flash.viaMidpoint;
    } else if (typeof LightningV2 !== 'undefined' && lightningFieldCache) {
      const boltOpts = opts.dryBurst && ltType === 7 ? { smallSpider: true } : opts;
      const bolt = LightningV2.buildBoltGeometry(
        ltType, pick, lightningFieldCache, profile, eventId, slot, sim_res_x, sim_res_y, guiControls, boltOpts);
      if (bolt) {
        destX = bolt.destX;
        destY = bolt.destY;
        routePoints = bolt.routePoints;
        midX = bolt.midX;
        midY = bolt.midY;
        viaMidpoint = bolt.viaMidpoint;
        boltBranches = bolt.branches;
        boltPathLengthNorm = bolt.pathLengthNorm;
        boltBranchCount = bolt.branchCount;
        boltVisibilityMult = bolt.visibilityMult;
        flashSize = Math.max(flashSize, bolt.flashSize || flashSize);
      }
      groundStrike = LightningV2.isGroundStrike(ltType);
    }

    const texIndex = typeof LightningV2 !== 'undefined'
      ? LightningV2.boltTextureIndexForType(ltType, seed) : 0;
    let pathLengthNorm = boltPathLengthNorm;
    let branchCount = boltBranchCount;
    let visibilityMult = boltVisibilityMult;
    if (pathLengthNorm <= 0 && routePoints && routePoints.length > 1 && typeof LightningV2 !== 'undefined')
      pathLengthNorm = LightningV2.pathLengthNorm(routePoints, sim_res_x, sim_res_y);
    if (branchCount <= 0 && routePoints)
      branchCount = ltType === 7 ? 4 : ltType === 8 ? 3 : ltType === 2 ? 4 : ltType === 1 ? 3 : 3;
    if (visibilityMult >= 0.99) {
      const cloudAtOrigin = readCloudAtSimPixel(pick.originX, pick.originY);
      const pierce = guiControls.cloudObscurationStrength ?? 0.55;
      visibilityMult = clamp(0.88 + cloudAtOrigin * 0.12 * pierce, 0.88, 1.2);
    }

    const originX = routePoints && routePoints.length > 0 ? routePoints[0].x : pick.originX;
    const originY = routePoints && routePoints.length > 0 ? routePoints[0].y : pick.originY;

    return {
      originX,
      originY,
      destX, destY,
      midX,
      midY,
      viaMidpoint,
      ltType,
      chargeVal: pick.chargeVal,
      seed,
      originMag,
      cloudGate: pick.cloudGate || 0.5,
      numReturnStrokes,
      numFlashes: numReturnStrokes,
      flashSize,
      brightness,
      illumRadius,
      groundStrike,
      texIndex,
      eventRecordId: ++lightningEventIdCounter,
      routePoints,
      branches: boltBranches,
      pathLengthNorm,
      branchCount,
      visibilityMult,
      flashInFront,
      flashOnly,
      precipOnly,
    };
  }

  function activateForcedLightningStrike(strike)
  {
    const eventId = iterNum;
    const forcedChannel = { id: 'forced', salt: 0, freq: () => 1 };
    proceduralLightningState.trackedEventId = eventId;
    proceduralLightningState.trackedChannel = forcedChannel;
    proceduralLightningState.eventId = eventId;
    proceduralLightningState.eventAge = 0;
    proceduralLightningState.builtEventId = eventId;
    proceduralLightningState.channelId = 'forced';
    proceduralLightningState.strikes = [strike];
    proceduralLightningState.flashStartMs = performance.now();
    proceduralLightningState.frozenVisualAge = null;

    queueChargeDischargeForStrike(strike);
    const eventKey = 'lt-forced-' + eventId + '-t' + strike.ltType;
    registerRadarIconForStrike(strike, eventKey);
    if (guiControls.enableThunder !== false)
      playThunderForStrike(eventKey, (strike.groundStrike ? strike.destX : strike.originX) / sim_res_x,
        (strike.groundStrike ? strike.destY : strike.originY) / sim_res_y,
        thunderIntensityForType(strike.ltType, strike.originMag));
    if (typeof LightningV2 !== 'undefined') {
      const rec = LightningV2.createEventRecord(strike, eventId, iterNum);
      lightningEventLog.push(rec);
      const maxEv = guiControls.maxActiveLightningEvents || 24;
      if (lightningEventLog.length > maxEv)
        lightningEventLog.splice(0, lightningEventLog.length - maxEv);
    }
  }

  function activateForcedDryBurst(eventId)
  {
    const channel = { id: 'dry', salt: 6311, freq: () => guiControls.dryLightningFrequency || 1 };
    proceduralLightningState.trackedEventId = eventId;
    proceduralLightningState.trackedChannel = channel;
    proceduralLightningState.eventId = eventId;
    proceduralLightningState.eventAge = 0;
    proceduralLightningState.builtEventId = eventId;
    proceduralLightningState.channelId = 'dry';
    proceduralLightningState.strikes = buildProceduralStrikesForEvent(eventId, channel);
    proceduralLightningState.flashStartMs = performance.now();
    proceduralLightningState.frozenVisualAge = null;
    for (let s = 0; s < proceduralLightningState.strikes.length; s++) {
      const st = proceduralLightningState.strikes[s];
      queueChargeDischargeForStrike(st);
      const eventKey = 'lt-dry-' + eventId + '-s' + s;
      registerRadarIconForStrike(st, eventKey);
      if (guiControls.enableThunder !== false)
        playThunderForStrike(eventKey, st.originX / sim_res_x, st.originY / sim_res_y,
          thunderIntensityForType(st.ltType, st.originMag) * 0.32);
      if (typeof LightningV2 !== 'undefined') {
        const rec = LightningV2.createEventRecord(st, eventId, iterNum);
        lightningEventLog.push(rec);
      }
    }
    const maxEv = guiControls.maxActiveLightningEvents || 24;
    if (lightningEventLog.length > maxEv)
      lightningEventLog.splice(0, lightningEventLog.length - maxEv);
  }

  function activateForcedStrobeBurst(eventId)
  {
    const channel = { id: 'strobe', salt: 1913, freq: () => guiControls.strobeLightningFrequency || 1 };
    proceduralLightningState.trackedEventId = eventId;
    proceduralLightningState.trackedChannel = channel;
    proceduralLightningState.eventId = eventId;
    proceduralLightningState.eventAge = 0;
    proceduralLightningState.builtEventId = eventId;
    proceduralLightningState.channelId = 'strobe';
    proceduralLightningState.strikes = buildProceduralStrikesForEvent(eventId, channel);
    proceduralLightningState.flashStartMs = performance.now();
    proceduralLightningState.frozenVisualAge = null;
    for (let s = 0; s < proceduralLightningState.strikes.length; s++) {
      const st = proceduralLightningState.strikes[s];
      queueChargeDischargeForStrike(st);
      const eventKey = 'lt-strobe-' + eventId + '-s' + s;
      registerRadarIconForStrike(st, eventKey);
      if (guiControls.enableThunder !== false)
        playThunderForStrike(eventKey, st.originX / sim_res_x, st.originY / sim_res_y,
          thunderIntensityForType(st.ltType, st.originMag) * 0.45);
      if (typeof LightningV2 !== 'undefined') {
        const rec = LightningV2.createEventRecord(st, eventId, iterNum);
        lightningEventLog.push(rec);
      }
    }
    const maxEv = guiControls.maxActiveLightningEvents || 24;
    if (lightningEventLog.length > maxEv)
      lightningEventLog.splice(0, lightningEventLog.length - maxEv);
  }

  function forceSpawnLightningType(ltType)
  {
    if (typeof LightningV2 === 'undefined')
      return;
    const eventId = iterNum + ltType * 131;
    if (ltType === 4) {
      activateForcedStrobeBurst(eventId);
      return;
    }
    if (ltType === 11) {
      activateForcedDryBurst(eventId);
      return;
    }
    const pick = getForcedLightningPick(ltType, eventId);
    if (pick.originX < 0 || pick.originY < 0)
      return;
    const strike = buildStrikeFromPick(pick, ltType, eventId, 0);
    activateForcedLightningStrike(strike);
  }

  function forceSpawnAllLightningTypes()
  {
    if (typeof LightningV2 === 'undefined')
      return;
    forcedLightningQueue = LightningV2.SPAWNABLE_LT_TYPES.slice();
  }

  function processForcedLightningQueue()
  {
    if (forcedLightningQueue.length === 0)
      return;
    const flashActive = proceduralLightningState.eventAge >= 0
      && proceduralLightningState.eventAge < getLightningFlashDuration() - 1;
    if (flashActive)
      return;
    forceSpawnLightningType(forcedLightningQueue.shift());
  }

  function buildProceduralStrikesForEvent(eventId, channel)
  {
    const freq = channel.freq();
    const maxBolts = guiControls.maxActiveBolts || 8;
    const isStrobe = typeof LightningV2 !== 'undefined' && LightningV2.isStrobeChannel(channel.id);
    const isDry = typeof LightningV2 !== 'undefined' && LightningV2.isDryChannel(channel.id);
    const dryMode = isDry && typeof LightningV2 !== 'undefined'
      ? LightningV2.dryBurstMode(eventId) : null;
    const mult = clamp(guiControls.globalLightningMultiplier ?? 1, 0, 100);
    const strikeCap = Math.min(maxBolts, 4 + Math.floor(mult * 0.06));
    let numStrikes = isStrobe && typeof LightningV2 !== 'undefined'
      ? LightningV2.strobeBurstStrikeCount(eventId, channel, maxBolts, guiControls)
      : isDry && typeof LightningV2 !== 'undefined'
        ? LightningV2.dryBurstStrikeCount(eventId, channel, maxBolts, guiControls, dryMode)
        : 1 + Math.floor(shaderRand(eventId * 29 + 401 + channel.salt)
          * Math.min(Math.max(freq * 0.04 + 0.5, 1), strikeCap));
    if (!isStrobe && !isDry && lightningBurstState.phase === 'burst')
      numStrikes = Math.min(maxBolts, numStrikes + Math.floor(lightningBurstState.burstIntensity * 2));
    numStrikes = Math.min(numStrikes, maxBolts);
    const strikes = [];
    let anchorPick = null;
    for (let s = 0; s < numStrikes; s++) {
      let pick;
      if ((isStrobe || isDry) && s > 0 && anchorPick && typeof LightningV2 !== 'undefined') {
        pick = LightningV2.jitterPickNearAnchor(
          anchorPick, eventId, s, sim_res_x, sim_res_y, lightningFieldCache, guiControls, channel.id);
      } else {
        pick = pickLightningOriginCached(eventId, s, numStrikes, channel.id);
      }
      if (pick.originX < 0 || pick.originY < 0)
        continue;
      if (typeof LightningV2 !== 'undefined' && lightningFieldCache) {
        if (!LightningV2.isOriginEligibleForStrike(
            lightningFieldCache, pick, guiControls, channel.id, null, sim_res_x, sim_res_y))
          continue;
      } else {
        const gate = pick.cloudGate ?? 0.5;
        if (gate < 0.28 || Math.abs(pick.chargeVal || 0) < 0.24)
          continue;
      }
      let ltType;
      if (isDry && typeof LightningV2 !== 'undefined')
        ltType = LightningV2.selectTypeForDryBurst(eventId, s, dryMode, numStrikes, pick.chargeVal, guiControls);
      else if (isStrobe && typeof LightningV2 !== 'undefined')
        ltType = LightningV2.selectTypeForStrobeBurst(eventId, s, pick.chargeVal, guiControls);
      else {
        const strike = evaluateProceduralStrikeCached(pick, channel, eventId, s);
        if (!strike)
          continue;
        ltType = strike.ltType;
      }
      if (!ltType)
        continue;
      if (typeof LightningV2 !== 'undefined' && lightningFieldCache
          && !LightningV2.isOriginEligibleForStrike(
            lightningFieldCache, pick, guiControls, channel.id, ltType, sim_res_x, sim_res_y))
        continue;
      if ((isStrobe || isDry) && !anchorPick)
        anchorPick = pick;
      const strike = buildStrikeFromPick(pick, ltType, eventId, s, {
        strobeBurst: isStrobe,
        dryBurst: isDry,
      });
      if (isStrobe)
        strike.strobeBurst = true;
      if (isDry)
        strike.dryBurst = true;
      strikes.push(strike);
    }
    return strikes;
  }

  function updateProceduralLightningState()
  {
    if (isForcedLightningActive())
      return;
    if (!isProceduralLightningEnabled()) {
      proceduralLightningState.eventAge = -1;
      proceduralLightningState.strikes = [];
      proceduralLightningState.builtEventId = -1;
      proceduralLightningState.channelId = null;
      proceduralLightningState.trackedEventId = -1;
      proceduralLightningState.trackedChannel = null;
      proceduralLightningState.lastCompletedEventId = -1;
      return;
    }

    const flashDur = getLightningFlashDuration();

    // Hold the current strike set for the full flash window — prevents mid-flash swaps and pop-off
    if (proceduralLightningState.builtEventId >= 0) {
      const holdAge = iterNum - proceduralLightningState.builtEventId;
      if (holdAge >= 0 && holdAge < flashDur) {
        proceduralLightningState.eventAge = holdAge;
        proceduralLightningState.eventId = proceduralLightningState.builtEventId;
        return;
      }
      if (holdAge >= flashDur) {
        proceduralLightningState.lastCompletedEventId = proceduralLightningState.builtEventId;
        proceduralLightningState.strikes = [];
        proceduralLightningState.builtEventId = -1;
        proceduralLightningState.trackedEventId = -1;
        proceduralLightningState.trackedChannel = null;
        proceduralLightningState.eventAge = -1;
        proceduralLightningState.eventId = -1;
        proceduralLightningState.channelId = null;
        proceduralLightningState.flashStartMs = 0;
        proceduralLightningState.frozenVisualAge = null;
      }
    }

    if (getCachedLightningStrikeChannels().length === 0) {
      proceduralLightningState.eventAge = -1;
      proceduralLightningState.eventId = -1;
      proceduralLightningState.channelId = null;
      proceduralLightningState.strikes = [];
      proceduralLightningState.builtEventId = -1;
      return;
    }

    const active = findActiveLightningEventJS(iterNum);
    proceduralLightningState.eventAge = active.eventAge;
    proceduralLightningState.eventId = active.eventId;
    proceduralLightningState.channelId = active.channel ? active.channel.id : null;

    if (active.eventAge < 0 || !active.channel) {
      proceduralLightningState.strikes = [];
      proceduralLightningState.builtEventId = -1;
      return;
    }

    proceduralLightningState.trackedEventId = active.eventId;
    proceduralLightningState.trackedChannel = active.channel;

    if (proceduralLightningState.builtEventId !== active.eventId
        || proceduralLightningState.channelId !== active.channel.id) {
      proceduralLightningState.builtEventId = active.eventId;
      proceduralLightningState.strikes = buildProceduralStrikesForEvent(active.eventId, active.channel);
      proceduralLightningState.flashStartMs = performance.now();
      proceduralLightningState.frozenVisualAge = null;

      for (let s = 0; s < proceduralLightningState.strikes.length; s++) {
        const st = proceduralLightningState.strikes[s];
        queueChargeDischargeForStrike(st);
        const eventKey = 'lt-' + active.eventId + '-s' + s;
        registerRadarIconForStrike(st, eventKey);
        if (guiControls.enableThunder !== false) {
          const thunderMult = active.channel.id === 'strobe' ? 0.45
            : active.channel.id === 'dry' ? 0.32 : 1.0;
          playThunderForStrike(eventKey, (st.groundStrike ? st.destX : st.originX) / sim_res_x,
            (st.groundStrike ? st.destY : st.originY) / sim_res_y,
            thunderIntensityForType(st.ltType, st.originMag) * thunderMult);
        }
        if (typeof LightningV2 !== 'undefined') {
          const rec = LightningV2.createEventRecord(st, active.eventId, iterNum);
          lightningEventLog.push(rec);
          const maxEv = guiControls.maxActiveLightningEvents || 24;
          if (lightningEventLog.length > maxEv)
            lightningEventLog.splice(0, lightningEventLog.length - maxEv);
        }
      }
    }
  }

  // Cache key for static lightning settings uniforms — avoids ~25 gl.uniform calls per frame
  // when settings haven't changed.
  var _ltStaticUniformsKey = null;
  var _ltStaticUniformsLod = -1;

  function uploadProceduralLightningUniforms()
  {
    if (!lightningV2InRealisticShader || !uloc_real_ltNumStrikes)
      return;
    const st = proceduralLightningState;
    const maxShader = typeof LightningV2 !== 'undefined' ? LightningV2.MAX_SHADER_STRIKES : 8;
    const visualAge = getLightningVisualAge();
    const count = visualAge >= 0 ? Math.min(st.strikes.length, maxShader) : 0;
    gl.uniform1f(uloc_real_ltEventAge, visualAge);
    gl.uniform1i(uloc_real_ltNumStrikes, count);

    procLightningPosArr.fill(0);
    procLightningDestArr.fill(0);
    procLightningMetaArr.fill(0);
    procLightningRouteArr.fill(0);
    for (let i = 0; i < count; i++) {
      const s = st.strikes[i];
      procLightningPosArr[i * 4] = s.originX / sim_res_x;
      procLightningPosArr[i * 4 + 1] = s.originY / sim_res_y;
      procLightningPosArr[i * 4 + 2] = s.ltType;
      procLightningPosArr[i * 4 + 3] = s.seed;
      procLightningDestArr[i * 4] = s.destX / sim_res_x;
      procLightningDestArr[i * 4 + 1] = s.destY / sim_res_y;
      procLightningDestArr[i * 4 + 2] = s.originMag;
      procLightningDestArr[i * 4 + 3] = s.numReturnStrokes || s.numFlashes || 1;
      procLightningMetaArr[i * 4] = s.flashOnly
        ? (s.flashSize || 0.3) : (s.pathLengthNorm || s.flashSize || 0.1);
      procLightningMetaArr[i * 4 + 1] = typeof LightningV2 !== 'undefined'
        ? LightningV2.encodeStrikeMetaY(s)
        : (s.flashOnly ? (s.flashInFront ? 1.0 : 0.0) : ((s.branchCount || 0) / 8.0));
      procLightningMetaArr[i * 4 + 2] = s.visibilityMult ?? 1.0;
      procLightningMetaArr[i * 4 + 3] = s.brightness || s.originMag;
      const route = packStrikeRouteForStrike(s);
      procLightningRouteArr[i * 4] = route[0];
      procLightningRouteArr[i * 4 + 1] = route[1];
      procLightningRouteArr[i * 4 + 2] = route[2];
      procLightningRouteArr[i * 4 + 3] = route[3];
    }
    gl.uniform4fv(uloc_real_ltStrikePos, procLightningPosArr);
    gl.uniform4fv(uloc_real_ltStrikeDest, procLightningDestArr);
    gl.uniform4fv(uloc_real_ltStrikeMeta, procLightningMetaArr);
    if (uloc_real_ltStrikeRoute)
      gl.uniform4fv(uloc_real_ltStrikeRoute, procLightningRouteArr);

    // Static settings uniforms: only re-upload when the value key changes.
    // These ~25 gl.uniform calls were happening every frame even with no lightning active.
    const zoomNorm = clamp(cam.curZoom / sim_res_x / (guiControls.lightningLODDistance || 1), 0, 1);
    let lod = guiControls.dynamicLOD ? clamp(zoomNorm * 2.5, 0, 1) : 1.0;
    let gpuQuality = realisticVisualQuality;
    if (guiControls.adaptiveLightningQuality !== false) {
      const frameLod = clamp(1.0 - (smoothedFrameMs - TARGET_FRAME_MS) / 38.0, 0.35, 1.0);
      lod *= frameLod;
    }
    const lodVal = lod * gpuQuality;

    // Build a fast key from settings that change infrequently.
    const newKey = (guiControls.lightningBrightness || 1) + '|' + (guiControls.lightningContrast || 1) + '|' +
      (guiControls.channelThickness || 1) + '|' + (guiControls.branchDensity || 1) + '|' +
      (guiControls.branchLength || 1) + '|' + (guiControls.flashDuration || 1) + 'x' + getLightningIterScale() + '|' +
      (guiControls.channelGlowDuration || 1) + '|' + (guiControls.glowStrength || 1) + '|' +
      (guiControls.atmosphericIlluminationStrength || 1) + '|' + (guiControls.cloudIlluminationStrength || 1) + '|' +
      (guiControls.rainShaftIlluminationStrength || 1) + '|' + (guiControls.terrainIlluminationStrength || 1) + '|' +
      (guiControls.nighttimeFlashStrength || 1) + '|' + (guiControls.daytimeFlashStrength || 0.45) + '|' +
      (guiControls.ltEnableAtmosphericLighting !== false ? 1 : 0) + '|' +
      (guiControls.ltEnableCloudIllumination !== false ? 1 : 0) + '|' +
      (guiControls.ltEnableRainShaftIllumination !== false ? 1 : 0) + '|' +
      (guiControls.ltEnableTerrainIllumination !== false ? 1 : 0) + '|' +
      (guiControls.ltEnablePersistentChannelGlow !== false ? 1 : 0) + '|' +
      (guiControls.ltEnableVolumetricCloudFlashing !== false ? 1 : 0) + '|' +
      (guiControls.cloudLightningBranchDensity ?? 1.35) + '|' + (guiControls.cloudLightningBranchLength ?? 0.45) + '|' +
      (guiControls.cloudObscurationStrength ?? 0.55) + '|' + (guiControls.channelIllumRatio ?? 0.5) + '|' +
      (st.channelId === 'strobe' ? 1 : 0) + '|' +
      (guiControls.intracloudChannelVisibility ?? 1) + '|' + (guiControls.cloudToCloudChannelVisibility ?? 1) + '|' +
      (guiControls.spiderChannelVisibility ?? 1) + '|' + (guiControls.anvilChannelVisibility ?? 1) + '|' +
      (guiControls.cloudLightningOpacity ?? 1);

    if (newKey !== _ltStaticUniformsKey || Math.abs(lodVal - _ltStaticUniformsLod) > 0.005) {
      _ltStaticUniformsKey = newKey;
      _ltStaticUniformsLod = lodVal;
      gl.uniform1f(uloc_real_ltBrightness, guiControls.lightningBrightness || 1);
      gl.uniform1f(uloc_real_ltContrast, guiControls.lightningContrast || 1);
      gl.uniform1f(uloc_real_ltChannelThickness, guiControls.channelThickness || 1);
      gl.uniform1f(uloc_real_ltBranchDensity, guiControls.branchDensity || 1);
      gl.uniform1f(uloc_real_ltBranchLength, guiControls.branchLength || 1);
      gl.uniform1f(uloc_real_ltFlashDuration, getEffectiveLtFlashDuration());
      gl.uniform1f(uloc_real_ltGlowDuration, guiControls.channelGlowDuration || 1);
      gl.uniform1f(uloc_real_ltGlowStrength, guiControls.glowStrength || 1);
      gl.uniform1f(uloc_real_ltAtmosIllum, guiControls.atmosphericIlluminationStrength || 1);
      gl.uniform1f(uloc_real_ltCloudIllum, guiControls.cloudIlluminationStrength || 1);
      gl.uniform1f(uloc_real_ltRainIllum, guiControls.rainShaftIlluminationStrength || 1);
      gl.uniform1f(uloc_real_ltTerrainIllum, guiControls.terrainIlluminationStrength || 1);
      gl.uniform1f(uloc_real_ltNightFlash, guiControls.nighttimeFlashStrength || 1);
      gl.uniform1f(uloc_real_ltDayFlash, guiControls.daytimeFlashStrength || 0.45);
      gl.uniform1f(uloc_real_ltLODLevel, lodVal);
      if (uloc_real_ltIcChannelVis)
        gl.uniform1f(uloc_real_ltIcChannelVis, guiControls.intracloudChannelVisibility ?? 1);
      if (uloc_real_ltCcChannelVis)
        gl.uniform1f(uloc_real_ltCcChannelVis, guiControls.cloudToCloudChannelVisibility ?? 1);
      if (uloc_real_ltSpiderChannelVis)
        gl.uniform1f(uloc_real_ltSpiderChannelVis, guiControls.spiderChannelVisibility ?? 1);
      if (uloc_real_ltAnvilChannelVis)
        gl.uniform1f(uloc_real_ltAnvilChannelVis, guiControls.anvilChannelVisibility ?? 1);
      if (uloc_real_ltCloudChannelOpacity)
        gl.uniform1f(uloc_real_ltCloudChannelOpacity, guiControls.cloudLightningOpacity ?? 1);
      gl.uniform1i(uloc_real_ltEnableAtmos, guiControls.ltEnableAtmosphericLighting !== false ? 1 : 0);
      gl.uniform1i(uloc_real_ltEnableCloudIllum, guiControls.ltEnableCloudIllumination !== false ? 1 : 0);
      gl.uniform1i(uloc_real_ltEnableRainIllum, guiControls.ltEnableRainShaftIllumination !== false ? 1 : 0);
      gl.uniform1i(uloc_real_ltEnableTerrainIllum, guiControls.ltEnableTerrainIllumination !== false ? 1 : 0);
      gl.uniform1i(uloc_real_ltEnableChannelGlow, guiControls.ltEnablePersistentChannelGlow !== false ? 1 : 0);
      gl.uniform1i(uloc_real_ltEnableVolumetric, guiControls.ltEnableVolumetricCloudFlashing !== false ? 1 : 0);
      if (uloc_real_ltCloudBranchDensity)
        gl.uniform1f(uloc_real_ltCloudBranchDensity, guiControls.cloudLightningBranchDensity ?? 1.35);
      if (uloc_real_ltCloudBranchLength)
        gl.uniform1f(uloc_real_ltCloudBranchLength, guiControls.cloudLightningBranchLength ?? 0.45);
      if (uloc_real_ltCloudObscuration)
        gl.uniform1f(uloc_real_ltCloudObscuration, guiControls.cloudObscurationStrength ?? 0.55);
      if (uloc_real_ltChannelIllumRatio)
        gl.uniform1f(uloc_real_ltChannelIllumRatio, guiControls.channelIllumRatio ?? 0.5);
      if (uloc_real_ltStrobeFlicker)
        gl.uniform1f(uloc_real_ltStrobeFlicker, st.channelId === 'strobe' ? 1.0 : 0.0);
    }
  }

  function thunderIntensityForType(ltType, originMag)
  {
    const mag = Number.isFinite(originMag) ? clamp(originMag, 0.0, 1.5) : 0.3;
    let intensity;
    if (ltType >= 6) intensity = 0.85 + mag * 0.55;
    else if (ltType >= 5) intensity = 0.65 + mag * 0.45;
    else if (ltType === 4) intensity = 0.32 + mag * 0.25;
    else if (ltType === 3 || ltType === 1) intensity = 0.16 + mag * 0.12;
    else if (ltType === 2) intensity = 0.42 + mag * 0.28;
    else if (ltType >= 7 && ltType <= 8) intensity = 0.55 + mag * 0.35;
    else if (ltType === 11) intensity = 0.12 + mag * 0.08;
    else intensity = 0.32 + mag * 0.20;
    const thunderVol = guiControls.thunderVolume ?? 1.0;
    const bass = guiControls.thunderBassStrength ?? 1.0;
    return clamp(intensity * thunderVol * bass * 0.85, 0.0, 2.0);
  }

  function playThunderForStrike(eventKey, normX, normY, intensity)
  {
    if (guiControls.enableThunder === false || !guiControls.soundThunderEnabled
        || !soundSystem || registeredThunderEvents.has(eventKey))
      return;
    registeredThunderEvents.add(eventKey);
    if (registeredThunderEvents.size > 500)
      registeredThunderEvents.clear();
    soundSystem.soundThunder(normX, normY, intensity);
  }

  function radarIconSimPositionForStrike(strike)
  {
    const cloudTop = sim_res_y * 0.88;
    const cloudBot = sim_res_y * 0.07;
    const clampX = (x) => clamp(x, 0, sim_res_x - 1);
    const clampCloudY = (y) => clamp(y, cloudBot, cloudTop);
    if (strike.flashOnly || strike.ltType === 1 || strike.ltType === 2 || strike.ltType === 3) {
      return {
        simX: clampX((strike.originX + strike.destX) * 0.5),
        simY: clampCloudY((strike.originY + strike.destY) * 0.5),
      };
    }
    if (strike.ltType === 7 || strike.ltType === 8) {
      return {
        simX: clampX((strike.originX + strike.destX) * 0.5),
        simY: clampCloudY((strike.originY + strike.destY) * 0.5),
      };
    }
    return {
      simX: clampX(strike.originX),
      simY: clampCloudY(strike.originY),
    };
  }

  function registerRadarLightningStrike(eventKey, simX, simY, ltType)
  {
    if (!guiControls.radarLightningIcons || registeredLightningEvents.has(eventKey))
      return;
    if (typeof LightningV2 !== 'undefined') {
      if (!LightningV2.isSimInCloudLayer(simX, simY, sim_res_x, sim_res_y, false))
        return;
      const clamped = LightningV2.clampLightningSimPos(simX, simY, sim_res_x, sim_res_y, false);
      simX = clamped.x;
      simY = clamped.y;
      refreshLightningFieldCache();
      if (lightningFieldCache && ltType) {
        const charge = readChargeCached(simX, simY);
        const cloud = readCloudCached(simX, simY);
        const channelId = channelIdForLtType(ltType);
        const thresholds = LightningV2.getSpawnThresholds(guiControls, channelId);
        if (cloud < thresholds.minRawCloud * 0.92)
          return;
        if (!LightningV2.isChargeValidForLtType(charge, ltType, guiControls, channelId))
          return;
        if (Math.abs(charge) * LightningV2.cloudGate(cloud) < thresholds.minChargeMag * thresholds.minCloudGate * 0.88)
          return;
      }
    }
    registeredLightningEvents.add(eventKey);
    radarLightningStrikes.push({
      simX,
      simY,
      expireAt: performance.now() + getRadarLightningIconDurationMs()
    });
    if (registeredLightningEvents.size > 500)
      registeredLightningEvents.clear();
  }

  function registerRadarIconForStrike(strike, eventKey)
  {
    if (!guiControls.radarLightningIcons)
      return;
    const pos = radarIconSimPositionForStrike(strike);
    registerRadarLightningStrike(eventKey, pos.simX, pos.simY, strike.ltType);
  }

  function detectParticleLightningStrike()
  {
    if (!guiControls.enablePrecipitation)
      return;
    if (!guiControls.soundThunderEnabled && !guiControls.radarLightningIcons)
      return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, lightningDataFrameBuff);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, particleLightningReadBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const data = particleLightningReadBuffer;
    const startIter = data[2];
    // Only react to a strike written this exact iteration (ignore stale texture data)
    if (Math.floor(startIter + 0.5) !== iterNum)
      return;
    const simX = clamp(data[0] * sim_res_x, 0, sim_res_x - 1);
    const simY = clamp(data[1] * sim_res_y, sim_res_y * 0.07, sim_res_y * 0.88);
    refreshLightningFieldCache();
    const cloud = readCloudCached(simX, simY);
    const charge = readChargeCached(simX, simY);
    const cloudGate = cloudGateFromDensity(cloud);
    if (typeof LightningV2 !== 'undefined') {
      const thresholds = LightningV2.getSpawnThresholds(guiControls, 'intracloud');
      if (cloud < thresholds.minRawCloud * 0.92)
        return;
      if (cloudGate < thresholds.minCloudGate * 0.92)
        return;
      if (Math.abs(charge) < thresholds.minChargeMag * 0.92)
        return;
      if (Math.abs(charge) * cloudGate < thresholds.minChargeMag * thresholds.minCloudGate * 0.88)
        return;
      if (!LightningV2.isChargeValidForLtType(charge, 1, guiControls, 'intracloud'))
        return;
    } else {
      if (cloudGate < guiControls.cloudLightningThreshold * 0.65)
        return;
      if (cloud < (guiControls.chargeMinCloudDensity ?? 0.32) * 0.82)
        return;
      if (Math.abs(charge) < 0.22)
        return;
    }
    const eventKey = 'particle-' + Math.floor(startIter);
    if (guiControls.radarLightningIcons)
      registerRadarLightningStrike(eventKey, simX, simY, 1);
    const intensity = Math.max(data[3], 1.2);
    playThunderForStrike(eventKey, data[0], data[1], intensity);
  }

  function shouldShowRadarLightningOverlay()
  {
    return isRadarDisplayMode(guiControls.displayMode)
      || (guiControls.displayMode === 'DISP_REAL' && guiControls.radarOverlay);
  }

  function drawRadarLightningIcon(ctx, x, y, size, alpha)
  {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(size / 12, size / 12);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(4, -2);
    ctx.lineTo(1, -2);
    ctx.lineTo(5, 10);
    ctx.lineTo(-1, 0);
    ctx.lineTo(2, 0);
    ctx.closePath();
    ctx.fillStyle = '#FFE066';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function isLightningDebugActive()
  {
    return guiControls.debugShowChargeField || guiControls.debugShowChargeGradient
      || guiControls.debugShowLightningPotential || guiControls.debugShowConductivityMap
      || guiControls.debugShowStrikeOrigins || guiControls.debugShowStrikeDestinations
      || guiControls.debugShowLightningTypeLabels || guiControls.debugShowElectricalBurstRegions
      || guiControls.debugShowActiveLightningEvents || guiControls.debugShowThunderRadius
      || guiControls.debugShowPerformanceMetrics || guiControls.debugShowSurfaceCharge
      || guiControls.debugShowChargeOrganization || guiControls.debugShowSpiderRoutes
      || guiControls.debugShowAnvilRoutes       || guiControls.debugShowCloudPaths
      || guiControls.debugShowLightningProbability
      || guiControls.debugShowChannelVisibilityMask
      || guiControls.debugShowCloudObscurationMask
      || guiControls.debugShowGeneratedCloudPath
      || guiControls.debugShowRenderedCloudPath
      || guiControls.debugShowBoltGeometryStats
      || guiControls.debugShowBoltDiagnostics;
  }

  function drawLightningFieldHeatmap(ctx, channelIndex, colorFn, alpha)
  {
    if (!lightningFieldCache) return;
    refreshLightningFieldCache();
    const cache = lightningFieldCache;
    for (let py = 0; py < cache.cacheH; py++) {
      for (let px = 0; px < cache.cacheW; px++) {
        const val = cache.data[(py * cache.cacheW + px) * 4 + channelIndex];
        if (val < 0.02) continue;
        const simX = (px + 0.5) * cache.scale;
        const simY = (py + 0.5) * cache.scale;
        const sx = simToScreenX(simX);
        const sy = simToScreenY(simY);
        const size = Math.max(2, cache.scale * cam.curZoom * 0.85);
        ctx.fillStyle = colorFn(val, py * cache.scale < sim_res_y * 0.04);
        ctx.globalAlpha = alpha * clamp(val, 0, 1);
        ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLightningDebugOverlay()
  {
    if (!isLightningDebugActive()) {
      if (lightningDebugCanvas)
        lightningDebugCanvas.style.display = 'none';
      return;
    }

    if (!lightningDebugCanvas) {
      lightningDebugCanvas = document.createElement('canvas');
      lightningDebugCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:3;';
      document.body.appendChild(lightningDebugCanvas);
    }
    if (lightningDebugCanvas.width !== canvas.width || lightningDebugCanvas.height !== canvas.height) {
      lightningDebugCanvas.width = canvas.width;
      lightningDebugCanvas.height = canvas.height;
    }
    lightningDebugCanvas.style.display = 'block';
    const ctx = lightningDebugCanvas.getContext('2d');
    ctx.clearRect(0, 0, lightningDebugCanvas.width, lightningDebugCanvas.height);
    refreshLightningFieldCache();

    if (guiControls.debugShowChargeField)
      drawLightningFieldHeatmap(ctx, 0, (v) => v > 0 ? 'rgb(80,140,255)' : 'rgb(255,90,70)', 0.45);
    if (guiControls.debugShowLightningPotential)
      drawLightningFieldHeatmap(ctx, 2, (v) => 'rgb(120,80,255)', 0.5);
    if (guiControls.debugShowChargeGradient)
      drawLightningFieldHeatmap(ctx, 3, (v) => 'rgb(180,220,255)', 0.4);
    if (guiControls.debugShowConductivityMap)
      drawLightningFieldHeatmap(ctx, 3, (v, isGround) => isGround ? 'rgb(40,200,90)' : 'rgb(60,120,80)', 0.55);
    if (guiControls.debugShowSurfaceCharge)
      drawLightningFieldHeatmap(ctx, 0, (v, isGround) => isGround
        ? (v > 0 ? 'rgb(255,200,80)' : 'rgb(80,160,255)') : 'rgba(0,0,0,0)', 0.65);
    if (guiControls.debugShowChargeOrganization)
      drawLightningFieldHeatmap(ctx, 2, (v) => 'rgb(200,120,255)', 0.35);
    if (guiControls.debugShowLightningProbability)
      drawLightningFieldHeatmap(ctx, 2, (v) => 'rgb(255,180,60)', 0.42);

    const profile = getStormElectricalProfile();
    if (profile && (guiControls.debugShowChargeOrganization || guiControls.debugShowActiveLightningEvents)) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(8, 8, 180, 18);
      ctx.fillStyle = '#cef';
      ctx.font = '11px monospace';
      ctx.fillText('Storm: ' + profile.type + '  act=' + profile.stormActivity.toFixed(2), 14, 20);
    }

    if (guiControls.debugShowStrikeOrigins || guiControls.debugShowStrikeDestinations
        || guiControls.debugShowSpiderRoutes || guiControls.debugShowAnvilRoutes
        || guiControls.debugShowCloudPaths) {
      const strikes = proceduralLightningState.strikes || [];
      for (const st of strikes) {
        if (guiControls.debugShowStrikeOrigins) {
          const sx = simToScreenX(st.originX);
          const sy = simToScreenY(st.originY);
          ctx.beginPath();
          ctx.arc(sx, sy, 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(100, 180, 255, 0.85)';
          ctx.fill();
        }
        const isCloudBolt = st.ltType >= 1 && st.ltType <= 3 || st.ltType === 7 || st.ltType === 8
          || st.ltType === 9 || st.ltType === 10;
        const showRoute = (st.ltType === 7 && guiControls.debugShowSpiderRoutes)
          || (st.ltType === 8 && guiControls.debugShowAnvilRoutes)
          || ((st.ltType === 1 || st.ltType === 2) && guiControls.debugShowCloudPaths)
          || (guiControls.debugShowGeneratedCloudPath && isCloudBolt)
          || guiControls.debugShowBoltDiagnostics;
        if (st.flashOnly && guiControls.debugShowBoltDiagnostics) {
          const mx = (st.originX + st.destX) * 0.5;
          const my = (st.originY + st.destY) * 0.5;
          const sx = simToScreenX(mx);
          const sy = simToScreenY(my);
          ctx.beginPath();
          ctx.arc(sx, sy, st.flashInFront ? 14 : 10, 0, Math.PI * 2);
          ctx.strokeStyle = st.flashInFront ? 'rgba(255, 255, 180, 0.9)' : 'rgba(180, 200, 255, 0.75)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (showRoute && st.routePoints && st.routePoints.length > 1 && !st.flashOnly) {
          ctx.strokeStyle = st.ltType === 7 ? 'rgba(180, 120, 255, 0.85)'
            : st.ltType === 8 ? 'rgba(140, 200, 255, 0.8)' : 'rgba(100, 220, 255, 0.65)';
          ctx.lineWidth = st.ltType === 7 ? 2.5 : 1.8;
          ctx.setLineDash(guiControls.debugShowGeneratedCloudPath ? [6, 4] : []);
          ctx.beginPath();
          ctx.moveTo(simToScreenX(st.routePoints[0].x), simToScreenY(st.routePoints[0].y));
          for (let ri = 1; ri < st.routePoints.length; ri++)
            ctx.lineTo(simToScreenX(st.routePoints[ri].x), simToScreenY(st.routePoints[ri].y));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (guiControls.debugShowRenderedCloudPath && isCloudBolt && st.routePoints && st.routePoints.length > 1) {
          const r = packStrikeRouteForStrike(st);
          const knots = [
            { x: st.originX, y: st.originY },
            { x: r[0] * sim_res_x, y: r[1] * sim_res_y },
            { x: r[2] * sim_res_x, y: r[3] * sim_res_y },
            { x: st.destX, y: st.destY },
          ];
          ctx.strokeStyle = 'rgba(255, 255, 80, 0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(simToScreenX(knots[0].x), simToScreenY(knots[0].y));
          for (let ki = 1; ki < knots.length; ki++)
            ctx.lineTo(simToScreenX(knots[ki].x), simToScreenY(knots[ki].y));
          ctx.stroke();
        }
        if (st.branches && st.branches.length > 0 && guiControls.debugShowGeneratedCloudPath) {
          ctx.strokeStyle = 'rgba(255, 160, 255, 0.55)';
          ctx.lineWidth = 1;
          for (const br of st.branches) {
            ctx.beginPath();
            ctx.moveTo(simToScreenX(br.x), simToScreenY(br.y));
            ctx.lineTo(simToScreenX(br.ex), simToScreenY(br.ey));
            ctx.stroke();
          }
        }
        if ((guiControls.debugShowBoltGeometryStats || guiControls.debugShowBoltDiagnostics)
            && (isCloudBolt || st.flashOnly)) {
          const sx = simToScreenX(st.originX);
          const sy = simToScreenY(st.originY);
          const pts = st.routePoints ? st.routePoints.length : 0;
          const stats = st.flashOnly
            ? 'FLASH ' + (st.flashInFront ? 'front' : 'behind')
              + (st.precipOnly ? ' precip' : '') + ' sz=' + (st.flashSize || 0).toFixed(2)
            : 'pts=' + pts + ' br=' + (st.branchCount || 0)
              + ' len=' + (st.pathLengthNorm || 0).toFixed(2)
              + ' vis=' + (st.visibilityMult ?? 1).toFixed(2);
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(sx + 6, sy - 22, 160, 16);
          ctx.fillStyle = '#ff8';
          ctx.font = '10px monospace';
          ctx.fillText(stats, sx + 10, sy - 10);
        }
        if (guiControls.debugShowStrikeDestinations && (st.groundStrike || showRoute)) {
          const dx = simToScreenX(st.destX);
          const dy = simToScreenY(st.destY);
          ctx.beginPath();
          ctx.arc(dx, dy, 5, 0, Math.PI * 2);
          ctx.fillStyle = st.groundStrike ? 'rgba(255, 220, 80, 0.9)' : 'rgba(160, 220, 255, 0.85)';
          ctx.fill();
          if (!showRoute) {
            const ox = simToScreenX(st.originX);
            const oy = simToScreenY(st.originY);
            ctx.strokeStyle = 'rgba(255, 255, 120, 0.4)';
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(dx, dy);
            ctx.stroke();
          }
        }
        if (guiControls.debugShowLightningTypeLabels && typeof LightningV2 !== 'undefined') {
          const label = LightningV2.LT_NAMES[st.ltType] || ('Type ' + st.ltType);
          ctx.fillStyle = '#fff';
          ctx.font = '11px sans-serif';
          ctx.fillText(label, simToScreenX(st.originX) + 8, simToScreenY(st.originY) - 8);
        }
        if (guiControls.debugShowChannelVisibilityMask || guiControls.debugShowCloudObscurationMask) {
          const mx = (st.originX + st.destX) * 0.5;
          const my = (st.originY + st.destY) * 0.5;
          const sx = simToScreenX(mx);
          const sy = simToScreenY(my);
          const cloud = readCloudAtSimPixel(mx, my);
          if (guiControls.debugShowChannelVisibilityMask) {
            const vis = cloudChannelVisibilityForType(st.ltType);
            ctx.beginPath();
            ctx.arc(sx, sy, 16, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(80, 255, 140, ' + (clamp(vis, 0, 2) * 0.28) + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(120, 255, 180, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          if (guiControls.debugShowCloudObscurationMask) {
            const obs = clamp(cloud * 13.6, 0, 2.5);
            const obsT = clamp((obs - 0.12) / 0.88, 0, 1);
            const obsFade = obsT * obsT * (3 - 2 * obsT);
            const pierce = 0.72 + obsFade * (guiControls.cloudObscurationStrength ?? 0.55) * 0.55;
            ctx.beginPath();
            ctx.arc(sx, sy, 11, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 200, 80, ' + (pierce * 0.35) + ')';
            ctx.fill();
          }
        }
      }
    }

    if (guiControls.debugShowElectricalBurstRegions && lightningBurstState.phase === 'burst') {
      ctx.fillStyle = 'rgba(180, 100, 255, 0.12)';
      ctx.fillRect(0, 0, lightningDebugCanvas.width, lightningDebugCanvas.height);
      ctx.fillStyle = '#e8c8ff';
      ctx.font = '12px sans-serif';
      ctx.fillText('Electrical burst active', 12, 22);
    }

    if (guiControls.debugShowActiveLightningEvents) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(8, lightningDebugCanvas.height - 80, 220, 72);
      ctx.fillStyle = '#aef';
      ctx.font = '11px monospace';
      ctx.fillText('Active events: ' + lightningEventLog.length, 14, lightningDebugCanvas.height - 62);
      const last = lightningEventLog[lightningEventLog.length - 1];
      if (last && typeof LightningV2 !== 'undefined')
        ctx.fillText((LightningV2.LT_NAMES[last.ltType] || 'Strike') + ' @ ' + Math.floor(last.time), 14, lightningDebugCanvas.height - 46);
      ctx.fillText('Burst: ' + lightningBurstState.phase, 14, lightningDebugCanvas.height - 30);
    }

    if (guiControls.debugShowBoltDiagnostics) {
      const strikes = proceduralLightningState.strikes || [];
      const panelH = 36 + strikes.length * 54;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillRect(8, 8, 360, panelH);
      ctx.fillStyle = '#bdf';
      ctx.font = 'bold 12px monospace';
      const burstLabel = proceduralLightningState.channelId === 'strobe'
        ? 'Lightning V2.6 Strobe Burst'
        : proceduralLightningState.channelId === 'dry'
          ? 'Lightning V2.6 Dry Burst' : 'Lightning V2.6 Bolt Diagnostics';
      ctx.fillText(burstLabel, 14, 24);
      ctx.font = '10px monospace';
      ctx.fillStyle = '#9ef';
      ctx.fillText('Rendered bolts: ' + strikes.length + '  Event age: '
        + (proceduralLightningState.eventAge >= 0 ? proceduralLightningState.eventAge.toFixed(1) : '—'), 14, 38);
      let y = 52;
      for (let si = 0; si < strikes.length; si++) {
        const st = strikes[si];
        const typeName = typeof LightningV2 !== 'undefined'
          ? (LightningV2.LT_NAMES[st.ltType] || ('Type ' + st.ltType)) : ('Type ' + st.ltType);
        ctx.fillStyle = '#fff';
        ctx.fillText('#' + si + ' ' + typeName, 14, y);
        y += 12;
        ctx.fillStyle = '#ccc';
        ctx.fillText('  O(' + st.originX + ',' + st.originY + ') D(' + st.destX + ',' + st.destY + ')', 14, y);
        y += 12;
        const pts = st.routePoints ? st.routePoints.length : 0;
        const br = st.branches ? st.branches.length : (st.branchCount || 0);
        ctx.fillText('  pathPts=' + pts + ' branches=' + br + ' rendered='
          + (st.flashOnly ? 'flash' : '1') + (st.precipOnly ? ' precip' : '')
          + ' tex=' + (st.texIndex ?? 0), 14, y);
        y += 12;
        const depth = st.precipOnly ? 'precip-only'
          : st.flashOnly ? (st.flashInFront ? 'in-front' : 'behind') : 'bolt';
        ctx.fillText('  len=' + (st.pathLengthNorm || 0).toFixed(3) + ' depth=' + depth
          + ' bright=' + (st.brightness || 0).toFixed(2), 14, y);
        y += 18;
      }
    }

    if (guiControls.debugShowPerformanceMetrics) {
      ctx.fillStyle = '#8f8';
      ctx.font = '11px monospace';
      ctx.fillText('Bolts: ' + (proceduralLightningState.strikes?.length || 0)
        + '  LOD: ' + (guiControls.dynamicLOD ? 'on' : 'off'), 12, 40);
    }
  }

  function drawRadarLightningOverlay()
  {
    if (!shouldShowRadarLightningOverlay() || !guiControls.radarLightningIcons) {
      if (radarLightningCanvas)
        radarLightningCanvas.style.display = 'none';
      return;
    }

    if (!radarLightningCanvas) {
      radarLightningCanvas = document.createElement('canvas');
      radarLightningCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2;';
      document.body.appendChild(radarLightningCanvas);
    }
    if (radarLightningCanvas.width !== canvas.width || radarLightningCanvas.height !== canvas.height) {
      radarLightningCanvas.width = canvas.width;
      radarLightningCanvas.height = canvas.height;
    }
    radarLightningCanvas.style.display = 'block';

    const now = guiControls.paused && lightningIconsPauseClockMs > 0
      ? lightningIconsPauseClockMs
      : performance.now();
    if (!guiControls.paused)
      radarLightningStrikes = radarLightningStrikes.filter(strike => strike.expireAt > now);

    const ctx = radarLightningCanvas.getContext('2d');
    ctx.clearRect(0, 0, radarLightningCanvas.width, radarLightningCanvas.height);

    for (const strike of radarLightningStrikes) {
      if (typeof LightningV2 !== 'undefined'
          && !LightningV2.isSimInCloudLayer(strike.simX, strike.simY, sim_res_x, sim_res_y, false))
        continue;
      const sx = simToScreenX(strike.simX);
      const sy = simToScreenY(strike.simY);
      if (sx < -30 || sx > canvas.width + 30 || sy < -30 || sy > canvas.height + 30)
        continue;
      if (sx < 0 || sx > canvas.width || sy < 0 || sy > canvas.height)
        continue;
      const fadeMs = Math.max(200, getRadarLightningIconDurationMs() * 0.16);
      const fade = guiControls.paused
        ? 1.0
        : Math.min(1, (strike.expireAt - now) / fadeMs);
      drawRadarLightningIcon(ctx, sx, sy, 16, fade);
    }
  }

  function resetRealtimeClockState()
  {
    realtimeLastWallClockMs = 0;
    realtimeIterAccumulator = 0;
  }

  function enableRealtimeMode()
  {
    simDateTime = new Date();
    guiControls.timeOfDay = simDateTime.getHours() + simDateTime.getMinutes() / 60. + simDateTime.getSeconds() / 3600.;
    guiControls.month = simDateTime.getMonth() + 1 + simDateTime.getDate() / 30.5 + simDateTime.getHours() / 720.;
    updateSunlight();
    resetRealtimeClockState();
    realtimeLastWallClockMs = performance.now();
  }

  function getRealtimeIterationsThisFrame()
  {
    const now = performance.now();
    if (realtimeLastWallClockMs <= 0) {
      realtimeLastWallClockMs = now;
      return 0;
    }

    const deltaMs = now - realtimeLastWallClockMs;
    realtimeLastWallClockMs = now;
    if (deltaMs <= 0)
      return 0;

    realtimeIterAccumulator += Math.min(deltaMs, REALTIME_MAX_CATCHUP_MS) * REALTIME_ITERS_PER_MS;
    const iters = Math.floor(realtimeIterAccumulator);
    realtimeIterAccumulator -= iters;
    return iters;
  }

  function tickProceduralLightningForIteration(iterationIndex, numIterations)
  {
    if (!isProceduralLightningEnabled())
      return;

    chargeDischargesThisIter.length = 0;

    if (!isLightningCpuReady())
      return;

    if (typeof LightningV2 !== 'undefined' && iterationIndex === 0) {
      LightningV2.updateBurstState(lightningBurstState, iterNum, guiControls, getCachedStormActivity());
      // Burst phase affects strike odds — rebuild the per-frame channel caches.
      lightningFrameCpuCache.strikeChannels = null;
      lightningFrameCpuCache.channelStrikeChances = new Map();
    }

    if (typeof LightningV2 !== 'undefined' && iterationIndex === 0)
      processForcedLightningQueue();

    updateProceduralLightningState();
  }

  function applyUserBrushPass()
  {
    gl.viewport(0, 0, sim_res_x, sim_res_y);
    gl.useProgram(boundaryProgram);
    gl.uniform1f(uniformLocation_boundaryProgram_iterNum, iterNum);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, vortForceTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, precipitationDepositionTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(advectionProgram);
    gl.uniform1f(uloc_adv_iterNum, iterNum);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function draw()
  { // Runs for every frame
    const frameDrawStart = performance.now();
    var inputType = -1;
    let camPanSpeed = guiControls.camSpeed;

    if (rightCtrlPressed) {
      camPanSpeed *= 0.2;
    }

    if (!airplaneMode) {
      if (upPressed) {
        // ^
        cam.changeViewYpos(-camPanSpeed / cam.curZoom);
      }
      if (downPressed) {
        // v
        cam.changeViewYpos(camPanSpeed / cam.curZoom);
      }
    }
    if (leftPressed) {
      // <
      cam.changeViewXpos(camPanSpeed / cam.curZoom);
    }
    if (rightPressed) {
      // >
      cam.changeViewXpos(-camPanSpeed / cam.curZoom);
    }
    if (plusPressed) {
      // +
      cam.changeViewZoom(camPanSpeed);
    }
    if (minusPressed) {
      // -
      cam.changeViewZoom(-camPanSpeed);
    }

    cam.move();

    prevMouseXinSim = mouseXinSim;
    prevMouseYinSim = mouseYinSim;

    mouseXinSim = screenToSimX(mouseX);
    mouseYinSim = screenToSimY(mouseY);

    if (SETUP_MODE) {
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, sim_res_x, sim_res_y);
      gl.useProgram(setupProgram);
      gl.uniform1f(uloc_setup_seed, mouseXinSim);
      gl.uniform1f(uloc_setup_heightMult, ((canvas.height - mouseY) / canvas.height) * 2.0);
      // Render to both framebuffers
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
      gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
      gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      // NOT SETUP MODE:

      // gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);
      gl.useProgram(advectionProgram);

      var inputType = -1;
      var brushPosXinSim = -2.0;
      var brushIntensity = 0.0;
      if (leftMousePressed) {
        if (guiControls.tool == 'TOOL_NONE')
          inputType = 0; // only flashlight on
        else if (guiControls.tool == 'TOOL_TEMPERATURE')
          inputType = 1;
        else if (guiControls.tool == 'TOOL_WATER')
          inputType = 2;
        else if (guiControls.tool == 'TOOL_SMOKE')
          inputType = 3;
        else if (guiControls.tool == 'TOOL_WIND')
          inputType = 4;
        else if (guiControls.tool == 'TOOL_WALL')
          inputType = 10;
        else if (guiControls.tool == 'TOOL_WALL_LAND')
          inputType = 11;
        else if (guiControls.tool == 'TOOL_WALL_FRESH')
          inputType = 12;
        else if (guiControls.tool == 'TOOL_WALL_SEA')
          inputType = 24;
        else if (guiControls.tool == 'TOOL_WALL_ICE_SHEET')
          inputType = 25;
        else if (guiControls.tool == 'TOOL_WALL_ICE_CAP')
          inputType = 26;
        else if (guiControls.tool == 'TOOL_WALL_FIRE')
          inputType = 13;
        else if (guiControls.tool == 'TOOL_WALL_URBAN')
          inputType = 14;
        else if (guiControls.tool == 'TOOL_WALL_SUBURBAN')
          inputType = 17;
        else if (guiControls.tool == 'TOOL_WALL_RUNWAY')
          inputType = 15;
        else if (guiControls.tool == 'TOOL_WALL_INDUSTRIAL')
          inputType = 16;

        // Surface environment modifiers
        else if (guiControls.tool == 'TOOL_WALL_MOIST')
          inputType = 20;
        else if (guiControls.tool == 'TOOL_WALL_SNOW')
          inputType = 21;
        else if (guiControls.tool == 'TOOL_VEGETATION')
          inputType = 22;
        else if (guiControls.tool == 'TOOL_CHARGE')
          inputType = 23;

        var intensity = guiControls.brushIntensity;

        if (ctrlPressed) {
          intensity *= -1;
        }

        var posXinSim;

        if (guiControls.wholeWidth)
          posXinSim = -1.0;
        else if (guiControls.wrapHorizontally)
          posXinSim = mod(mouseXinSim, 1.0); // wrap mouse position around borders
        else
          posXinSim = clamp(mouseXinSim, 0.0, 1.0);


        brushPosXinSim = posXinSim;
        brushIntensity = intensity;

        let moveX = mouseXinSim - prevMouseXinSim;
        let moveY = mouseYinSim - prevMouseYinSim;

        gl.uniform4f(uloc_adv_userInputValues, posXinSim, mouseYinSim, intensity, guiControls.brushSize * 0.5);
        gl.uniform2f(uloc_adv_userInputMove, moveX, moveY);
        gl.uniform1i(uloc_adv_wrapHorizontally, guiControls.wrapHorizontally);
      }
        gl.uniform1i(uloc_adv_userInputType, inputType);


      // guiControls.IterPerFrame = 1.0 / timePerIteration * 3600 / 60.0;


      if (!guiControls.paused) { // Simulation part

        let nightAccelerationActive = !airplaneMode && !guiControls.slowMotion && !guiControls.realtimeMode
          && guiControls.dayNightCycle && guiControls.accelerateNight && guiControls.sunAngle < 0.;

        if (guiControls.dayNightCycle) {
          if (airplaneMode || guiControls.slowMotion) {
            updateSunlight(1.0 / 3600.0 / 60); // increase solar time at real speed: 1/60 seconds per frame
          } else if (!guiControls.realtimeMode) {
            updateSunlight(timePerIteration * guiControls.IterPerFrame * (nightAccelerationActive ? 10.0 : 1.0));
          }
        }

        gl.useProgram(lightingProgram);
        gl.uniform1f(uloc_lighting_IR_rate, guiControls.IR_rate * (nightAccelerationActive ? 10.0 : 1.0));

        gl.viewport(0, 0, sim_res_x, sim_res_y);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);

        if (!airplaneMode || airplane.hasCrashed() || frameNum % 17 == 0) { // update every 17 frames because 60 * 0.288 secs per iteration = 17.28
          let numIterations;
          if (guiControls.realtimeMode)
            numIterations = getRealtimeIterationsThisFrame();
          else {
            numIterations = guiControls.IterPerFrame;
            if (airplaneMode || guiControls.slowMotion)
              numIterations = 1;
          }

          const startupCap = getStartupIterationCap();
          if (startupCap != null)
            numIterations = Math.min(numIterations, startupCap);

          refreshLightningFieldCache();
          resetLightningFrameCpuCache();
          if (isProceduralLightningEnabled() && isLightningCpuReady())
            clearLightningDataTexture();
          let particleLightningCheckPending = guiControls.enablePrecipitation
            && !isProceduralLightningEnabled()
            && (guiControls.soundThunderEnabled || guiControls.radarLightningIcons);

          for (var i = 0; i < numIterations; i++) { // Simulation loop
            // calc and apply velocity
            gl.useProgram(velocityProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
            gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.NONE, gl.COLOR_ATTACHMENT2 ]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // calc curl
            if (!guiControls.skipCurlCalculation) {
              gl.useProgram(curlProgram);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.bindFramebuffer(gl.FRAMEBUFFER, curlFrameBuff);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            // calc CAPE
            if (!guiControls.skipCAPECalculation) {
              gl.useProgram(capeProgram);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
              gl.bindFramebuffer(gl.FRAMEBUFFER, capeFrameBuff);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            const chargeToolPainting = guiControls.tool == 'TOOL_CHARGE' && leftMousePressed && inputType === 23;
            const runChargePass = chargeToolPainting
              || (isLightningCpuReady() && isProceduralLightningEnabled() && !guiControls.skipChargeCalculation);

            if (i === numIterations - 1)
              tickProceduralLightningForIteration(i, numIterations);

            // calc atmospheric charge (drives physics-based lightning)
            if (runChargePass) {
              gl.useProgram(chargeProgram);
              gl.uniform4f(uloc_charge_userInputValues, brushPosXinSim, mouseYinSim, brushIntensity, guiControls.brushSize * 0.5);
              gl.uniform1i(uloc_charge_userInputType, inputType);
              gl.uniform1i(uloc_charge_invertTool, guiControls.invertTool ? 1 : 0);
              gl.uniform1i(uloc_charge_wrapHorizontally, guiControls.wrapHorizontally);
              uploadChargeDischargeUniforms();
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, even ? chargeTexture_0 : chargeTexture_1);
              gl.bindFramebuffer(gl.FRAMEBUFFER, even ? chargeFrameBuff_1 : chargeFrameBuff_0);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            // calculate vorticity
            if (!guiControls.skipCurlCalculation) {
              gl.useProgram(vorticityProgram);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, curlTexture);
              gl.bindFramebuffer(gl.FRAMEBUFFER, vortForceFrameBuff);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            // apply vorticity, boundary conditions and user input
            gl.useProgram(boundaryProgram);
            gl.uniform1f(uniformLocation_boundaryProgram_iterNum, iterNum);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, vortForceTexture);
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
            gl.activeTexture(gl.TEXTURE4);
            gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
            gl.activeTexture(gl.TEXTURE5);
            gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, precipitationDepositionTexture);


            gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
            gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            // calc and apply advection (always run when painting so tools work)
            if (!guiControls.skipAdvection || (leftMousePressed && inputType > 0)) {
              gl.useProgram(advectionProgram);
              gl.uniform1f(uloc_adv_iterNum, iterNum);
              gl.uniform1i(uloc_adv_wrapHorizontally, guiControls.wrapHorizontally);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_0);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, wallTexture_0);
              gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

              applyAirmassGeneratorsCpu();

              // calc and apply pressure (divergence correction)
              gl.useProgram(pressureProgram);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
              gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.NONE, gl.COLOR_ATTACHMENT2 ]);
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            // capture current temperature state for the temperature-change display
            const tempHistoryStride = Math.max(1, Math.round(guiControls.temperatureChangeIterations));
            if (!guiControls.disableTempChangeHistory && iterNum % tempHistoryStride === 0) {
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frameBuff_1);
              gl.readBuffer(gl.COLOR_ATTACHMENT0);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, temperatureChangeHistoryTextures[temperatureChangeHistoryIndex]);
              gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, sim_res_x, sim_res_y);
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
              temperatureChangeHistoryIndex = (temperatureChangeHistoryIndex + 1) % temperatureChangeHistoryTextures.length;
            }

            // calc light
            if (!guiControls.skipLightingCalculation) {
              gl.useProgram(lightingProgram);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
              gl.activeTexture(gl.TEXTURE3);

              const writeLightTex = even ? lightTexture_1 : lightTexture_0;

              if (even) {
                gl.bindTexture(gl.TEXTURE_2D, lightTexture_0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_1);

                srcVAO = precipitationVao_0;
                destTF = precipitationTF_1;
                destVAO = precipitationVao_1;
              } else {
                gl.bindTexture(gl.TEXTURE_2D, lightTexture_1);
                gl.bindFramebuffer(gl.FRAMEBUFFER, lightFrameBuff_0);

                srcVAO = precipitationVao_1;
                destTF = precipitationTF_0;
                destVAO = precipitationVao_0;
              }

              gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ]); // calc light
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
              latestLightTexture = writeLightTex;
              even = !even;
            }


            gl.bindFramebuffer(gl.FRAMEBUFFER, precipitationFeedbackFrameBuff);
            gl.clear(gl.COLOR_BUFFER_BIT);         // clear precipitation feedback

            if (shouldRunPrecipitationThisIteration(i)) { // move precipitation, HUGE PERFORMANCE BOTTLENECK!

              gl.useProgram(precipitationProgram);
              gl.uniform1f(uloc_precip_iterNum, iterNum);
              if (uloc_precip_enableLegacyParticleLightning)
                gl.uniform1f(uloc_precip_enableLegacyParticleLightning,
                  isProceduralLightningEnabled() ? 0.0 : 1.0);
              gl.enable(gl.BLEND);
              gl.blendFunc(gl.ONE, gl.ONE); // add everything together
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, lightningDataTexture);

              gl.bindVertexArray(srcVAO);
              gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, destTF);
              gl.beginTransformFeedback(gl.POINTS);
              gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ]);
              gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
              gl.endTransformFeedback();

              // sample to count number of inactive droplets
              if (iterNum % 600 == 0) {
                gl.readBuffer(gl.COLOR_ATTACHMENT0);
                if (!window._inactiveDropletScratch) window._inactiveDropletScratch = new Float32Array(4);
                gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, window._inactiveDropletScratch);
                guiControls.inactiveDroplets = window._inactiveDropletScratch[0];
                // gl.useProgram(precipitationProgram); // already set
                gl.uniform1f(uloc_precip_inactiveDroplets, window._inactiveDropletScratch[0]);
              }

              gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
              gl.disable(gl.BLEND);
              gl.bindVertexArray(fluidVao); // set screenfilling rect again

              if (particleLightningCheckPending && i === 0) {
                gl.useProgram(lightningLocationProgram);
                gl.uniform1f(uloc_lightningLocation_iterNum, iterNum);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
                gl.bindFramebuffer(gl.FRAMEBUFFER, lightningDataFrameBuff);
                gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                detectParticleLightningStrike();
              }

            }

            if (displayWeatherStations && iterNum % (guiControls.reducedWeatherStationUpdates ? 416 : 208) == 0) { // ~every 60 in game seconds:  0.00008 *3600 * 208 = 59.9, reduced = every 120 seconds
              for (i = 0; i < weatherStations.length; i++) {
                weatherStations[i].measure();
              }
            }
            if (!airplaneMode) {
              iterNum++;
            }
          }

          if (guiControls.dayNightCycle && guiControls.realtimeMode && numIterations > 0
              && !airplaneMode && !guiControls.slowMotion) {
            updateSunlight(timePerIteration * numIterations);
          }
        } else if (leftMousePressed && inputType > 0) {
          applyUserBrushPass();
        }

        if (airplaneMode) {
          if (isLightningCpuReady()) {
            refreshLightningFieldCache();
            updateProceduralLightningState();
          }
          iterNum++;
          airplane.takeUserInput();
          airplane.move();
        }

        // Update nukes
        for (let i = nukes.length - 1; i >= 0; i--) {
          nukes[i].move();
          if (nukes[i].isExploded()) {
            nukes.splice(i, 1);
          }
        }

        for (let i = 0; i < airmassGenerators.length; i++)
          airmassGenerators[i].step();

      } // end of simulation part

      if (guiControls.showGraph) {
        const graphX = guiControls.graphFixedPosition ? guiControls.graphFixedX : Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
        const graphY = guiControls.graphFixedPosition ? guiControls.graphFixedY : Math.floor(mouseYinSim * sim_res_y);
        soundingGraph.draw(graphX, graphY);
      }

    } // END OF NOT SETUP MODE


    lastDrawInputType = inputType;
    let cursorType = getBrushCursorType(inputType);

    gl.useProgram(postProcessingProgram);

    if (postProc_exposure_loc !== null) {
      if (cursorType != 0 && !sunIsUp)
        gl.uniform1f(postProc_exposure_loc, 2.0);
      else
        gl.uniform1f(postProc_exposure_loc, guiControls.exposure);
    }

    // Follow droplet
    if (dropletFollowID >= 0) {
      let dropletInfo = readDropletData(dropletFollowID);
      cam.setPosition(-dropletInfo[0] * 2.0 + 1.0, -dropletInfo[1] * 2.0 * (sim_res_y / sim_res_x) + (sim_res_y / sim_res_x));

      let dropletInfoCanvas = document.getElementById('dropletInfoCanvas');
      let ctx = dropletInfoCanvas.getContext('2d');

      ctx.clearRect(0, 0, dropletInfoCanvas.width, dropletInfoCanvas.height);
      ctx.fillStyle = '#00000055';
      ctx.fillRect(0, 0, dropletInfoCanvas.width, dropletInfoCanvas.height);

      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 2, 2);

      ctx.font = '15px Arial';
      ctx.fillStyle = '#00AAFF';
      ctx.fillText('Water: ' + dropletInfo[2].toFixed(2), 0, 15);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Ice     : ' + dropletInfo[3].toFixed(2), 0, 30);
      ctx.fillStyle = '#00FF00';
      ctx.fillText('Dens : ' + dropletInfo[4].toFixed(2), 0, 45);
      const widths = computeDropletWidths(dropletInfo[2], dropletInfo[3], dropletInfo[4]);
      ctx.fillStyle = '#FFAA44';
      ctx.fillText('Width H: ' + widths.horizStr, 0, 60);
      ctx.fillText('Width V: ' + widths.vertStr, 0, 75);
    }

    if (airplaneMode) {
      airplane.display();
    }

    if (guiControls.enablePrecipitation && isDropletSizeDisplayMode(guiControls.displayMode))
      updateDropletSizeTexture();

    // render to canvas
    gl.useProgram(realisticDisplayProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);        // background color
    gl.clear(gl.COLOR_BUFFER_BIT);


    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);

    if (guiControls.displayMode == 'DISP_REAL') {

      updateHdrRenderScaleIfNeeded();
      getSmoothedFramePressure();
      realisticVisualQuality = getRealisticVisualQuality();
      sunlightVisualQuality = getSunlightVisualQuality();
      const hdrW = hdrFBO.width;
      const hdrH = hdrFBO.height;

      { // Ambient light from emitted sources (lightning bloom) — skip while paused to preserve last frame
        if (!guiControls.paused && needsAmbientLightBlur()) {
        gl.bindVertexArray(postProcessingVao);

        gl.bindFramebuffer(gl.FRAMEBUFFER, ambientLightFBOs[0].frameBuffer);
        gl.viewport(0, 0, ambientLightFBOs[0].width, ambientLightFBOs[0].height);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        let prevFBO = emittedLightFBO; // the previous FBO

        gl.useProgram(bloomBlurProgram);
        gl.uniform1i(uloc_bloom_bloomTexture, 0);

        const ambientBlurPasses = getAmbientBlurPasses();
        const ambientLevels = getAmbientLevelCount();
        for (let blurTimes = 0; blurTimes < ambientBlurPasses; blurTimes++) {

          // downsample
          for (let i = 1; i < ambientLevels; i++) {
            let destFBO = ambientLightFBOs[i];
            gl.uniform2f(uloc_bloom_texelSize, prevFBO.texelSizeX, prevFBO.texelSizeY);

            gl.viewport(0, 0, destFBO.width, destFBO.height);

            // bind texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, prevFBO.texture);

            gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO.frameBuffer);
            // gl.drawBuffers([ gl.BACK ]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to destFBO

            prevFBO = destFBO;
          }

          // upsample and add
          gl.blendFunc(gl.ONE, gl.ONE); // add to the existing texture in the framebuffer
          gl.enable(gl.BLEND);

          for (let i = ambientLevels - 2; i >= 0; i--) {
            let destFBO = ambientLightFBOs[i];

            gl.uniform2f(uloc_bloom_texelSize, prevFBO.texelSizeX, prevFBO.texelSizeY);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, prevFBO.texture);

            gl.viewport(0, 0, destFBO.width, destFBO.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO.frameBuffer);
            // gl.drawBuffers([ gl.BACK ]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to destFBO

            prevFBO = destFBO;
          }
          gl.disable(gl.BLEND);
        }
        gl.bindVertexArray(fluidVao);
        } else if (!guiControls.paused) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, ambientLightFBOs[0].frameBuffer);
          gl.viewport(0, 0, ambientLightFBOs[0].width, ambientLightFBOs[0].height);
          gl.clearColor(0.0, 0.0, 0.0, 1.0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);


      gl.bindFramebuffer(gl.FRAMEBUFFER, hdrFBO.frameBuffer); // render to hdr framebuffer
      gl.viewport(0, 0, hdrW, hdrH);
      gl.clearColor(0.0, 0.0, 0.0, 1.0); // background color
      gl.clear(gl.COLOR_BUFFER_BIT);


      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, getCurrentLightTexture());
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, surfaceTextureMap);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, curlTexture);
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);


      // draw background
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, airplane.directionIsLeft ? A380Texture : A380_R_Texture); // A380Texture
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, ambientLightFBOs[0].texture);
      gl.activeTexture(gl.TEXTURE10);
      gl.bindTexture(gl.TEXTURE_2D, A380GearTexture);

      gl.useProgram(skyBackgroundDisplayProgram);
      gl.uniform2f(uloc_sky_aspectRatios, sim_aspect, canvas_aspect);
      gl.uniform3f(uloc_sky_view, cam.curXpos, cam.curYpos, cam.curZoom);
      gl.uniform1f(uloc_sky_Xmult, horizontalDisplayMult);
      gl.uniform1f(uloc_sky_iterNum, iterNum);
      uploadSkyUniforms();

      gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to hdrFramebuffer

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);


      // draw clouds and terrain
      gl.useProgram(realisticDisplayProgram);
      gl.uniform2f(uloc_real_aspectRatios, sim_aspect, canvas_aspect);
      gl.uniform3f(uloc_real_view, cam.curXpos, cam.curYpos, cam.curZoom);
      gl.uniform4f(uloc_real_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
      gl.uniform1f(uloc_real_Xmult, horizontalDisplayMult);
      gl.uniform1f(uloc_real_iterNum, iterNum);
      if (uloc_real_visualQuality !== null)
        gl.uniform1f(uloc_real_visualQuality, Math.min(sunlightVisualQuality, realisticVisualQuality));

      // Don't display vectors when zoomed out because you would just see noise
      if (cam.curZoom / sim_res_x > 0.003) {
        gl.uniform1f(uloc_real_displayVectorField, guiControls.enableVectorField ? 1.0 : 0.0);
      } else {
        gl.uniform1f(uloc_real_displayVectorField, 0.0);
      }

      let lightningTexNum = Math.floor(iterNum / 400) % 4;
      if (proceduralLightningState.strikes.length > 0 && proceduralLightningState.strikes[0].texIndex != null)
        lightningTexNum = proceduralLightningState.strikes[0].texIndex % 4;
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, lightningTextures[lightningTexNum]);
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, lightningDataTexture);
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, ambientLightFBOs[0].texture);

      uploadProceduralLightningUniforms();
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to hdr framebuffer

      gl.disable(gl.BLEND);

      // Post processing:

      gl.bindVertexArray(postProcessingVao);


      const bloomLevels = getBloomLevelCount();
      if (bloomLevels <= 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBOs[0].frameBuffer);
        gl.viewport(0, 0, hdrW, hdrH);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.useProgram(isolateBrightPartsProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, hdrFBO.texture);
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBOs[0].frameBuffer); // brightPartsFrameBuffer
        gl.viewport(0, 0, hdrW, hdrH);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.drawBuffers([ gl.COLOR_ATTACHMENT0 ]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // BLOOM
      if (bloomLevels > 1) {
        let prevFBO = bloomFBOs[0]; // the previous FBO

        gl.useProgram(bloomBlurProgram);
        gl.uniform1i(uloc_bloom_bloomTexture, 0);

        // downsample
        for (let i = 1; i < bloomLevels; i++) {
          let destFBO = bloomFBOs[i];
          gl.uniform2f(uloc_bloom_texelSize, prevFBO.texelSizeX, prevFBO.texelSizeY);

          gl.viewport(0, 0, destFBO.width, destFBO.height);

          // bind texture
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, prevFBO.texture);

          gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO.frameBuffer);
          // gl.drawBuffers([ gl.BACK ]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to destFBO

          prevFBO = destFBO;
        }

        // upsample and add
        gl.blendFunc(gl.ONE, gl.ONE); // add to the existing texture in the framebuffer
        gl.enable(gl.BLEND);

        for (let i = bloomLevels - 2; i >= 0; i--) {
          let destFBO = bloomFBOs[i];

          gl.uniform2f(uloc_bloom_texelSize, prevFBO.texelSizeX, prevFBO.texelSizeY);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, prevFBO.texture);

          gl.viewport(0, 0, destFBO.width, destFBO.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, destFBO.frameBuffer);
          // gl.drawBuffers([ gl.BACK ]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to destFBO

          prevFBO = destFBO;
        }

        gl.disable(gl.BLEND);
      }

      gl.useProgram(postProcessingProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, hdrFBO.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomFBOs[0].texture);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      if (postProc_exposure_loc !== null) {
        if (SETUP_MODE) {
          gl.uniform1f(postProc_exposure_loc, 50.0);
        } else {
          gl.uniform1f(postProc_exposure_loc, guiControls.exposure);
        }
        gl.uniform1f(postProc_saturation_loc, guiControls.saturation);
        gl.uniform1f(postProc_contrast_loc, guiControls.contrast);
        if (postProc_bloomStrength_loc !== null)
          gl.uniform1f(postProc_bloomStrength_loc, guiControls.bloomStrength ?? 1.0);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is canvas
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.0, 0.0, 0.0, 1.0);        // background color
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.drawBuffers([ gl.BACK ]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas

      gl.bindVertexArray(fluidVao);

      if (guiControls.showDrops && !useLiteVisualsMode()) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        // draw drops over clouds
        // draw precipitation
        gl.useProgram(precipDisplayProgram);
        gl.uniform2f(uloc_precipDisp_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_precipDisp_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.bindVertexArray(destVAO);
        gl.drawArrays(gl.POINTS, 0, NUM_DROPLETS);
        gl.bindVertexArray(fluidVao); // set screenfilling rect again
        gl.disable(gl.BLEND);
      }

      // Radar overlay on realistic view
      if (shouldDrawRadarOverlayThisFrame()) {
        const overlaySource = guiControls.radarOverlaySource || 'composite';
        const overlayWorld = overlaySource === 'world';
        const overlayComposite = overlaySource === 'composite';
        const overlayRadar = (!overlayWorld && !overlayComposite) ? getRadarForOverlaySource() : null;
        const showOverlay = overlayWorld
          || (overlayComposite && radars.length > 0)
          || overlayRadar;
        if (showOverlay) {
          updateRadarDisplayCache();

          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          if (overlayWorld) {
            gl.useProgram(radarDisplayProgram);
            setupRadarDisplayProgramCommonUniforms();
            drawWorldRadar();
          } else if (overlayComposite) {
            drawCompositeRadarOnce();
          } else {
            gl.useProgram(radarDisplayProgram);
            setupRadarDisplayProgramCommonUniforms();
            drawSingleRadar(overlayRadar);
          }

          gl.disable(gl.BLEND);
          gl.bindVertexArray(fluidVao);
        }
      }


    } else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);

      if (guiControls.displayMode == 'DISP_TEMPERATURE') {
        gl.useProgram(temperatureDisplayProgram);
        gl.uniform2f(uloc_temp_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_temp_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_temp_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1f(uloc_temp_Xmult, horizontalDisplayMult);
        gl.uniform1f(uloc_temp_surfacePressure, guiControls.surfacePressure);

        // Don't display vectors when zoomed out because you would just see
        // noise
        if (cam.curZoom / sim_res_x > 0.003) {
          gl.uniform1f(uloc_temp_displayVectorField, guiControls.enableVectorField ? 1.0 : 0.0);
        } else {
          gl.uniform1f(uloc_temp_displayVectorField, 0.0);
        }

      } else if (guiControls.displayMode == 'DISP_TEMPERATURE_CHANGE') {
        gl.useProgram(temperatureChangeDisplayProgram);
        gl.uniform2f(uloc_tempChg_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_tempChg_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_tempChg_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1f(uloc_tempChg_Xmult, horizontalDisplayMult);
        gl.uniform1i(uloc_tempChg_baseTex, 0);
        gl.uniform1i(uloc_tempChg_prevBaseTex, 1);
        gl.uniform1i(uloc_tempChg_wallTex, 2);
        gl.uniform1i(uloc_tempChg_colorScalesTex, 9);
        gl.uniform1i(uloc_tempChg_colorScaleColumn, 16);
        let tempUnitCode = 0;
        if (guiControls.tempUnit == 'TEMP_UNIT_F') tempUnitCode = 1;
        else if (guiControls.tempUnit == 'TEMP_UNIT_K') tempUnitCode = 2;
        gl.uniform1i(uloc_tempChg_tempUnit, tempUnitCode);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTexture_1);
        gl.activeTexture(gl.TEXTURE1);
        const historyOffset = Math.min(Math.max(Math.round(guiControls.temperatureChangeIterations), 1), temperatureChangeHistoryTextures.length - 1);
        const historyIndex = (temperatureChangeHistoryIndex - historyOffset + temperatureChangeHistoryTextures.length) % temperatureChangeHistoryTextures.length;
        gl.bindTexture(gl.TEXTURE_2D, temperatureChangeHistoryTextures[historyIndex]);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);

        if (cam.curZoom / sim_res_x > 0.003) {
          gl.uniform1f(uloc_tempChg_displayVectorField, guiControls.enableVectorField ? 1.0 : 0.0);
        } else {
          gl.uniform1f(uloc_tempChg_displayVectorField, 0.0);
        }
      } else if (guiControls.displayMode == 'DISP_AIRQUALITY') {
        gl.useProgram(airQualityDisplayProgram);
        gl.uniform2f(uloc_airQ_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_airQ_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_airQ_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1f(uloc_airQ_Xmult, horizontalDisplayMult);

      } else if (guiControls.displayMode == 'DISP_HUMD') {
        gl.useProgram(humidityDisplayProgram);
        gl.uniform2f(uloc_humd_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_humd_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_humd_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1f(uloc_humd_Xmult, horizontalDisplayMult);
        setHumidityColorScaleUniforms();
        if (cam.curZoom / sim_res_x > 0.003) {
          gl.uniform1f(uloc_humd_displayVectorField, guiControls.enableVectorField ? 1.0 : 0.0);
        } else {
          gl.uniform1f(uloc_humd_displayVectorField, 0.0);
        }

      } else if (guiControls.displayMode == 'DISP_IRDOWNTEMP') {
        gl.useProgram(IRtempDisplayProgram);
        gl.uniform2f(uloc_IR_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_IR_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_IR_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1i(uloc_IR_upOrDown, 0);
        gl.uniform1f(uloc_IR_Xmult, horizontalDisplayMult);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, getCurrentLightTexture());
      } else if (guiControls.displayMode == 'DISP_IRUPTEMP') {
        gl.useProgram(IRtempDisplayProgram);
        gl.uniform2f(uloc_IR_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_IR_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_IR_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1i(uloc_IR_upOrDown, 1);
        gl.uniform1f(uloc_IR_Xmult, horizontalDisplayMult);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, getCurrentLightTexture());
      } else {
        gl.useProgram(universalDisplayProgram);
        gl.uniform2f(uloc_univ_aspectRatios, sim_aspect, canvas_aspect);
        gl.uniform3f(uloc_univ_view, cam.curXpos, cam.curYpos, cam.curZoom);
        gl.uniform4f(uloc_univ_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
        gl.uniform1f(uloc_univ_Xmult, horizontalDisplayMult);
        gl.activeTexture(gl.TEXTURE9);
        gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
        gl.uniform1i(gl.getUniformLocation(universalDisplayProgram, 'colorScalesTex'), 9);
        gl.uniform1i(uloc_univ_colorScaleColumn, 4);
        gl.uniform1i(uloc_univ_useUnipolarScale, 0);

        let colorScaleStops = 33;
        switch (guiControls.displayMode) {
        case 'DISP_HORIVEL':
          gl.uniform1i(uloc_univ_quantityIndex, 0);
          gl.uniform1f(uloc_univ_dispMultiplier, 10.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 6);
          colorScaleStops = 33;
          break;
        case 'DISP_VERTVEL':
          gl.uniform1i(uloc_univ_quantityIndex, 1);
          gl.uniform1f(uloc_univ_dispMultiplier, 10.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 7);
          colorScaleStops = 33;
          break;
        case 'DISP_WATER':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, waterTexture_1);
          gl.uniform1i(uloc_univ_quantityIndex, 0);
          gl.uniform1f(uloc_univ_dispMultiplier, 0.06);
          gl.uniform1i(uloc_univ_colorScaleColumn, 5);
          gl.uniform1i(uloc_univ_useUnipolarScale, 1);
          colorScaleStops = 33;
          break;
        case 'DISP_IRHEATING':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, getCurrentLightTexture());
          gl.uniform1i(uloc_univ_quantityIndex, 1);
          gl.uniform1f(uloc_univ_dispMultiplier, 50000.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 8);
          gl.uniform1i(uloc_univ_useUnipolarScale, 0);
          colorScaleStops = 33;
          break;
        case 'DISP_PRECIPFEEDBACK_MASS':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 0);
          gl.uniform1f(uloc_univ_dispMultiplier, 0.06);
          gl.uniform1i(uloc_univ_colorScaleColumn, 9);
          gl.uniform1i(uloc_univ_useUnipolarScale, 1);
          colorScaleStops = 33;
          break;
        case 'DISP_PRECIPFEEDBACK_HEAT':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 1);
          gl.uniform1f(uloc_univ_dispMultiplier, 500.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 10);
          gl.uniform1i(uloc_univ_useUnipolarScale, 0);
          colorScaleStops = 33;
          break;
        case 'DISP_PRECIPFEEDBACK_VAPOR':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, precipitationFeedbackTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 2);
          gl.uniform1f(uloc_univ_dispMultiplier, 500.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 11);
          gl.uniform1i(uloc_univ_useUnipolarScale, 0);
          colorScaleStops = 33;
          break;
        case 'DISP_PRECIPFEEDBACK_RAIN':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, precipitationDepositionTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 0);
          gl.uniform1f(uloc_univ_dispMultiplier, 1.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 12);
          gl.uniform1i(uloc_univ_useUnipolarScale, 1);
          colorScaleStops = 33;
          break;
        case 'DISP_PRECIPFEEDBACK_SNOW':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, precipitationDepositionTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 1);
          gl.uniform1f(uloc_univ_dispMultiplier, 1.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 13);
          gl.uniform1i(uloc_univ_useUnipolarScale, 1);
          colorScaleStops = 33;
          break;
        case 'DISP_SOIL_MOISTURE':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, waterTexture_0);
          gl.uniform1i(uloc_univ_quantityIndex, 2);
          gl.uniform1f(uloc_univ_dispMultiplier, 0.02);
          gl.uniform1i(uloc_univ_colorScaleColumn, 14);
          gl.uniform1i(uloc_univ_useUnipolarScale, 1);
          colorScaleStops = 33;
          break;
        case 'DISP_PRESSURE':
          // base[PRESSURE] is dimensionless fluid pressure, now clamped to ±1.0
          // multiplier of 1.0 maps ±1.0 to ±1.0 for the full bipolar color scale (blue to red)
          gl.uniform1i(uloc_univ_quantityIndex, 2);
          gl.uniform1f(uloc_univ_dispMultiplier, 1.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 22);
          gl.uniform1i(uloc_univ_useUnipolarScale, 0);
          colorScaleStops = 33;
          break;
        case 'DISP_CURL':
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, curlTexture);
          gl.uniform1i(uloc_univ_quantityIndex, 0);
          gl.uniform1f(uloc_univ_dispMultiplier, 7.0);
          gl.uniform1i(uloc_univ_colorScaleColumn, 15);
          gl.uniform1i(uloc_univ_useUnipolarScale, 0);
          colorScaleStops = 33;
          break;
        case 'DISP_RADAR':
        case 'DISP_RADAR_COMPOSITE':
        case 'DISP_RADAR_WORLD':
          break;
        case 'DISP_CAPE':
        case 'DISP_MU_CAPE':
        case 'DISP_ML_CAPE':
        case 'DISP_3_CAPE':
        case 'DISP_CINH':
        case 'DISP_LI':
        case 'DISP_PWAT':
        case 'DISP_DRY_SLOT':
        case 'DISP_LCL':
        case 'DISP_LFC':
        case 'DISP_EL':
        case 'DISP_FZL':
        case 'DISP_SRH_1KM':
        case 'DISP_SRH_3KM':
        case 'DISP_SHEAR_3KM':
        case 'DISP_SHEAR_6KM':
        case 'DISP_SHEAR_8KM':
        case 'DISP_SRI':
        case 'DISP_LAPSE_03':
        case 'DISP_LAPSE_36':
        case 'DISP_STP':
        case 'DISP_VTP':
        case 'DISP_DCAPE':
        case 'DISP_HAIL':
        case 'DISP_LIGHTNING':
        case 'DISP_LIGHTNING_HOTSPOTS':
        case 'DISP_SFC_PRES':
        case 'DISP_HAZ_PDS_TORNADO':
        case 'DISP_HAZ_TORNADO':
        case 'DISP_HAZ_SUPERCELL':
        case 'DISP_HAZ_GIANT_HAIL':
        case 'DISP_HAZ_LARGE_HAIL':
        case 'DISP_HAZ_HAIL':
        case 'DISP_HAZ_DEST_WINDS':
        case 'DISP_HAZ_DMG_WINDS':
        case 'DISP_HAZ_FLOODING':
        case 'DISP_HAZ_GENERAL_TS':
        case 'DISP_FIRE_RISK':
          break;
        case 'DISP_CHARGE':
          // Charge view uses its own dedicated display shader (not universalDisplayProgram)
          // so we break out early after drawing
          {
            gl.useProgram(chargeDisplayProgram);
            gl.uniform3f(gl.getUniformLocation(chargeDisplayProgram, 'view'), cam.curXpos, cam.curYpos, cam.curZoom);
            gl.uniform4f(gl.getUniformLocation(chargeDisplayProgram, 'cursor'), mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
            gl.uniform1f(gl.getUniformLocation(chargeDisplayProgram, 'Xmult'), horizontalDisplayMult);
            gl.uniform2f(gl.getUniformLocation(chargeDisplayProgram, 'aspectRatios'), sim_aspect, canvas_aspect);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, even ? chargeTexture_1 : chargeTexture_0);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
            gl.activeTexture(gl.TEXTURE9);
            gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          break;
        case 'DISP_HAIL_SIZE':
        case 'DISP_DROPLET_SIZE':
          {
            const dv = getDropletSizeViewConfig(guiControls.displayMode);
            const scaleCfg = COLOR_SCALE_CONFIGS.find(c => c.id === dv.scaleId);
            const scaleVals = colorScaleValues[dv.scaleId];
            gl.useProgram(dropletSizeDisplayProgram);
            gl.uniform3f(uloc_dropletDisp_view, cam.curXpos, cam.curYpos, cam.curZoom);
            gl.uniform4f(uloc_dropletDisp_cursor, mouseXinSim, mouseYinSim, guiControls.brushSize * 0.5, cursorType);
            gl.uniform1f(gl.getUniformLocation(dropletSizeDisplayProgram, 'Xmult'), horizontalDisplayMult);
            gl.uniform2f(gl.getUniformLocation(dropletSizeDisplayProgram, 'aspectRatios'), sim_aspect, canvas_aspect);
            gl.uniform1i(uloc_dropletDisp_sizeChannel, dv.channel);
            gl.uniform1i(uloc_dropletDisp_colorScaleColumn, scaleCfg.col);
            gl.uniform1i(uloc_dropletDisp_colorScaleStops, scaleCfg.stops);
            gl.uniform1f(uloc_dropletDisp_valueMin, scaleVals[0]);
            gl.uniform1f(uloc_dropletDisp_valueMax, scaleVals[scaleVals.length - 1]);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, dropletSizeTexture);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, wallTexture_1);
            gl.activeTexture(gl.TEXTURE9);
            gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
          break;
        case 'DISP_RISK':
          break;
        }
        gl.uniform1i(uloc_univ_colorScaleStops, colorScaleStops);
      }

      if (!isRadarDisplayMode(guiControls.displayMode) && guiControls.displayMode != 'DISP_RISK'
          && !isSoundingDisplayMode(guiControls.displayMode) && guiControls.displayMode != 'DISP_CHARGE'
          && !isDropletSizeDisplayMode(guiControls.displayMode)) {
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // draw to canvas
      }

      // Radar display modes: render every frame with cached precipitation textures
      if (isRadarDisplayMode(guiControls.displayMode)) {
        if (radarOverlayCanvas) {
          radarOverlayCanvas.style.display = 'none';
        }

        updateRadarDisplayCache();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindVertexArray(fluidVao);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        if (guiControls.displayMode === 'DISP_RADAR_WORLD') {
          drawWorldRadar();
        } else if (guiControls.displayMode === 'DISP_RADAR_COMPOSITE') {
          gl.useProgram(compositeRadarDisplayProgram);

          gl.uniform2f(uloc_comp_aspectRatios, sim_aspect, canvas_aspect);
          gl.uniform3f(uloc_comp_view, cam.curXpos, cam.curYpos, cam.curZoom);
          gl.uniform1f(uloc_comp_Xmult, horizontalDisplayMult);
          gl.uniform2f(uloc_comp_resolution, sim_res_x, sim_res_y);
          gl.uniform2f(uloc_comp_texelSize, 1.0 / sim_res_x, 1.0 / sim_res_y);
          gl.uniform1f(uloc_comp_opacity, guiControls.radarOpacity);
          gl.uniform1i(uloc_comp_dbzOpacityEnabled, guiControls.dbzOpacityEnabled);
          gl.uniform1f(uloc_comp_dbzOpacityStrength, guiControls.dbzOpacityStrength);
          gl.uniform1i(uloc_comp_colorScaleColumn, 18);
          gl.uniform1i(uloc_comp_colorScaleStops, 36);

          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
          gl.uniform1i(uloc_comp_colorScalesTex, 3);
          bindRadarCachedSimTextures(uloc_comp_baseTexture, uloc_comp_waterTexture, uloc_comp_wallTexture,
                                     uloc_comp_precipFeedbackTex, uloc_comp_precipDepositionTex);

          uploadCompositeRadarArrays();
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        } else {
          gl.useProgram(radarDisplayProgram);

          gl.uniform2f(uloc_radar_aspectRatios, sim_aspect, canvas_aspect);
          gl.uniform3f(uloc_radar_view, cam.curXpos, cam.curYpos, cam.curZoom);
          gl.uniform1f(uloc_radar_Xmult, horizontalDisplayMult);
          gl.uniform2f(uloc_radar_resolution, sim_res_x, sim_res_y);
          gl.uniform2f(uloc_radar_texelSize, 1.0 / sim_res_x, 1.0 / sim_res_y);
          gl.uniform1f(uloc_radar_opacity, guiControls.radarOpacity);
          gl.uniform1i(uloc_radar_dbzOpacityEnabled, guiControls.dbzOpacityEnabled);
          gl.uniform1f(uloc_radar_dbzOpacityStrength, guiControls.dbzOpacityStrength);

          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, colorScalesTexture);
          gl.uniform1i(uloc_radar_colorScalesTex, 3);
          bindRadarCachedSimTextures(uloc_radar_baseTexture, uloc_radar_waterTexture, uloc_radar_wallTexture,
                                     uloc_radar_precipFeedbackTex, uloc_radar_precipDepositionTex);

          gl.useProgram(radarDisplayProgram);
          setupRadarDisplayProgramCommonUniforms();
          for (let r = 0; r < radars.length; r++) {
            let radar = radars[r];
            if (!radar.getEnabled()) continue;
            drawSingleRadar(radar);
          }
        }

        gl.disable(gl.BLEND);

        gl.bindVertexArray(fluidVao);
      }

      // Risk display: draw per-column risk as colored canvas overlay
      if (guiControls.displayMode === 'DISP_RISK') {
        if (!riskCanvas) {
          riskCanvas = document.createElement('canvas');
          riskCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1;';
          document.body.appendChild(riskCanvas);
        }
        if (riskCanvas.width !== canvas.width || riskCanvas.height !== canvas.height) {
          riskCanvas.width = canvas.width;
          riskCanvas.height = canvas.height;
        }
        riskCanvas.style.display = 'block';

        // Recompute risk data on frequency interval
        if (iterNum % guiControls.riskUpdateFrequency === 0) {
          riskData = [];
          const step = Math.max(1, Math.round(sim_res_x / 200));
          const dzR  = guiControls.simHeight / sim_res_y;
          const dT   = -9.8 * dzR / 1000.0;

          gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          const baseAll = new Float32Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseAll);
          gl.readBuffer(gl.COLOR_ATTACHMENT1);
          const waterAll = new Float32Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterAll);
          gl.readBuffer(gl.COLOR_ATTACHMENT2);
          const wallAll = new Int8Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallAll);

          function getRisk(muCape, shear6, stp) {
            if (muCape < 100 || shear6 < 3)                   return null;
            if (muCape < 300 || shear6 < 5)                   return 'rgba(0,170,255,0.55)';
            if (stp >= 4 || (muCape >= 3000 && shear6 >= 25)) return 'rgba(255,0,255,0.65)';
            if (stp >= 2 || (muCape >= 2000 && shear6 >= 20)) return 'rgba(255,68,0,0.65)';
            if (stp >= 1 || (muCape >= 1500 && shear6 >= 15)) return 'rgba(255,136,0,0.65)';
            if (muCape >= 500 && shear6 >= 10)                return 'rgba(255,255,0,0.55)';
            return 'rgba(0,255,136,0.50)';
          }

          for (let sx = 0; sx < sim_res_x; sx += step) {
            const b  = (y, c) => baseAll[ (y * sim_res_x + sx) * 4 + c];
            const w  = (y, c) => waterAll[(y * sim_res_x + sx) * 4 + c];
            let sfcY = -1;
            for (let y = 0; y < sim_res_y; y++) {
              if (wallAll[(y * sim_res_x + sx) * 4 + 1] !== 0) { sfcY = y; break; }
            }
            if (sfcY < 0) continue;
            const maxMUlevel = Math.min(sfcY + Math.round(3000 / dzR), sim_res_y - 1);
            let muCape = 0;
            for (let startY = sfcY; startY <= maxMUlevel; startY++) {
              if (wallAll[(startY * sim_res_x + sx) * 4 + 1] === 0) continue;
              const startTempC = b(startY,3) - ((startY/sim_res_y)*guiControls.simHeight*guiControls.dryLapseRate)/1000.0 - 273.15;
              const mixW = maxWater(CtoK(KtoC(dewpoint(Math.max(w(startY,0), 0)))));
              let prevT = startTempC, prevCW = 0, parcelCape = 0;
              for (let y = startY + 1; y < sim_res_y; y++) {
                const envTk = CtoK(b(y,3) - ((y/sim_res_y)*guiControls.simHeight*guiControls.dryLapseRate)/1000.0 - 273.15);
                const cw = Math.max(mixW - maxWater(CtoK(prevT + dT)), 0);
                const dWt = (cw - prevCW) * guiControls.evapHeat;
                const mult = dT / (dT - dWt) || 1;
                prevT = prevT + dT * mult;
                prevCW = Math.max(mixW - maxWater(CtoK(prevT)), 0);
                if (9.81 * (CtoK(prevT) - envTk) / envTk > 0)
                  parcelCape += 9.81 * (CtoK(prevT) - envTk) / envTk * dzR;
              }
              if (parcelCape > muCape) muCape = parcelCape;
            }
            if (muCape < 100) continue;
            const mlLevels = Math.max(1, Math.min(sim_res_y - sfcY, Math.round(1000 / dzR)));
            let sumT = 0, sumTd = 0;
            for (let y = sfcY; y < sfcY + mlLevels; y++) {
              sumT  += b(y,3) - ((y/sim_res_y)*guiControls.simHeight*guiControls.dryLapseRate)/1000.0 - 273.15;
              sumTd += KtoC(dewpoint(Math.max(w(y,0), 0)));
            }
            const mlMixW = maxWater(CtoK(sumTd / mlLevels));
            let mlPrevT = sumT/mlLevels, mlPrevCW = 0, mlCape = 0, mlCinh = 0;
            for (let y = sfcY + 1; y < sim_res_y; y++) {
              const envTk = CtoK(b(y,3) - ((y/sim_res_y)*guiControls.simHeight*guiControls.dryLapseRate)/1000.0 - 273.15);
              const cw = Math.max(mlMixW - maxWater(CtoK(mlPrevT + dT)), 0);
              const dWt = (cw - mlPrevCW) * guiControls.evapHeat;
              const mult = dT / (dT - dWt) || 1;
              mlPrevT = mlPrevT + dT * mult;
              mlPrevCW = Math.max(mlMixW - maxWater(CtoK(mlPrevT)), 0);
              const buoy = 9.81 * (CtoK(mlPrevT) - envTk) / envTk;
              if (buoy > 0) mlCape += buoy * dzR;
              else if (y * dzR < 10000) mlCinh += buoy * dzR;
            }
            const sfcTempC = b(sfcY,3) - ((sfcY/sim_res_y)*guiControls.simHeight*guiControls.dryLapseRate)/1000.0 - 273.15;
            const mlLcl = Math.max(0, (sfcTempC - KtoC(dewpoint(Math.max(w(sfcY,0),0)))) / 8.0 * 1000.0);
            const t3y = Math.min(sfcY + Math.round(3000/dzR), sim_res_y-1);
            const t6y = Math.min(sfcY + Math.round(6000/dzR), sim_res_y-1);
            const shear3 = Math.hypot(rawVelocityTo_ms(b(t3y,0))-rawVelocityTo_ms(b(sfcY,0)), rawVelocityTo_ms(b(t3y,1))-rawVelocityTo_ms(b(sfcY,1)));
            const shear6 = Math.hypot(rawVelocityTo_ms(b(t6y,0))-rawVelocityTo_ms(b(sfcY,0)), rawVelocityTo_ms(b(t6y,1))-rawVelocityTo_ms(b(sfcY,1)));
            const stp = (mlCape/1500) * (shear3*50/150) * Math.max(0,(2000-mlLcl)/1000) * Math.min(1,(mlCinh+200)/150);
            const color = getRisk(muCape, shear6, stp);
            if (color) riskData.push({sx, sfcY, step, color});
          }
        }

        // Redraw every frame from stored data (positions update with camera)
        const rc = riskCanvas.getContext('2d');
        rc.clearRect(0, 0, riskCanvas.width, riskCanvas.height);
        const screenTop = simToScreenY(sim_res_y - 1);
        const screenBot = simToScreenY(0);
        rc.fillStyle = 'rgba(80,80,80,0.5)';
        for (const d of riskData) {
          const x0 = simToScreenX(d.sx - 0.5), x1 = simToScreenX(d.sx + d.step - 0.5);
          rc.fillRect(x0, simToScreenY(d.sfcY), x1 - x0, screenBot - simToScreenY(d.sfcY));
        }
        for (const d of riskData) {
          rc.fillStyle = d.color;
          rc.fillRect(simToScreenX(d.sx - 0.5), screenTop,
                      simToScreenX(d.sx + d.step - 0.5) - simToScreenX(d.sx - 0.5),
                      simToScreenY(d.sfcY) - screenTop);
        }
        const legend = [
          {label:'High',color:'#FF00FF'},{label:'Moderate',color:'#FF4400'},
          {label:'Enhanced',color:'#FF8800'},{label:'Slight',color:'#FFFF00'},
          {label:'Marginal',color:'#00FF88'},{label:'Thunderstorm',color:'#00AAFF'},
        ];
        rc.font = 'bold 13px monospace'; rc.textBaseline = 'middle';
        let ly = 20;
        legend.forEach(e => {
          rc.fillStyle = e.color; rc.fillRect(10, ly-7, 16, 14);
          rc.fillStyle = 'white'; rc.fillText(e.label, 32, ly); ly += 20;
        });
      }

      // Sounding readout map views (skew-T metrics per column)
      if (isSoundingDisplayMode(guiControls.displayMode)) {
        const viewCfg = getSoundingViewConfig(guiControls.displayMode);
        if (!soundingOverlayCanvas) {
          soundingOverlayCanvas = document.createElement('canvas');
          soundingOverlayCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1;';
          document.body.appendChild(soundingOverlayCanvas);
        }
        if (soundingOverlayCanvas.width !== canvas.width || soundingOverlayCanvas.height !== canvas.height) {
          soundingOverlayCanvas.width = canvas.width;
          soundingOverlayCanvas.height = canvas.height;
        }
        soundingOverlayCanvas.style.display = 'block';

        if (iterNum % guiControls.riskUpdateFrequency === 0 || soundingOverlayData.length === 0) {
          soundingOverlayData = [];
          const step = Math.max(1, Math.round(sim_res_x / 200));
          const dz = guiControls.simHeight / sim_res_y;

          gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          const baseAll = new Float32Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseAll);
          gl.readBuffer(gl.COLOR_ATTACHMENT1);
          const waterAll = new Float32Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterAll);
          gl.readBuffer(gl.COLOR_ATTACHMENT2);
          const wallAll = new Int8Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallAll);

          gl.bindFramebuffer(gl.FRAMEBUFFER, even ? chargeFrameBuff_0 : chargeFrameBuff_1);
          const chargeAll = new Float32Array(4 * sim_res_x * sim_res_y);
          gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, chargeAll);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);

          const envTempsC = new Float32Array(sim_res_y);
          const envDewC = new Float32Array(sim_res_y);
          const isFluid = new Array(sim_res_y);
          const vxRaw = new Float32Array(sim_res_y);
          const vyRaw = new Float32Array(sim_res_y);
          const waterArr = new Float32Array(sim_res_y);
          const chargeCol = new Float32Array(sim_res_y);
          const cloudWaterCol = new Float32Array(sim_res_y);

          for (let sx = 0; sx < sim_res_x; sx += step) {
            for (let y = 0; y < sim_res_y; y++) {
              const idx = (y * sim_res_x + sx) * 4;
              isFluid[y] = wallAll[idx + 1] !== 0;
              if (!isFluid[y]) continue;
              envTempsC[y] = KtoC(potentialToRealT(baseAll[idx + 3], y));
              envDewC[y] = KtoC(dewpoint(waterAll[idx]));
              vxRaw[y] = baseAll[idx];
              vyRaw[y] = baseAll[idx + 1];
              waterArr[y] = waterAll[idx];
              chargeCol[y] = chargeAll[idx];
              cloudWaterCol[y] = waterAll[idx + 1];
            }

            const metrics = computeColumnSoundingMetrics(
              envTempsC, envDewC, isFluid, vxRaw, vyRaw, waterArr, sim_res_y, dz);
            if (!metrics) continue;

            const soilMoistureSfc = waterAll[(metrics.surfaceLevel * sim_res_x + sx) * 4 + 2];
            const hazardMetrics = computeColumnHazardsAndFire(
              metrics, envTempsC, waterArr, soilMoistureSfc, vxRaw, vyRaw);
            Object.assign(metrics, hazardMetrics);

            const hotspot = computeColumnLightningHotspot(
              chargeCol, cloudWaterCol, isFluid, sim_res_y, metrics.lightningFlMin);
            Object.assign(metrics, hotspot);

            soundingOverlayData.push({ sx, sfcY: metrics.surfaceLevel, step, metrics });
          }
        }

        const cc = soundingOverlayCanvas.getContext('2d');
        cc.clearRect(0, 0, soundingOverlayCanvas.width, soundingOverlayCanvas.height);
        const screenTop = simToScreenY(sim_res_y - 1);
        const screenBot = simToScreenY(0);

        for (const d of soundingOverlayData) {
          const x0 = simToScreenX(d.sx - 0.5);
          const x1 = simToScreenX(d.sx + d.step - 0.5);
          cc.fillStyle = 'rgba(40,40,40,0.85)';
          cc.fillRect(x0, simToScreenY(d.sfcY), x1 - x0, screenBot - simToScreenY(d.sfcY));
        }

        for (const d of soundingOverlayData) {
          const metricVal = d.metrics[viewCfg.key];
          const rgb = sampleSoundingColorScale
            ? sampleSoundingColorScale(viewCfg.scaleId, metricVal, viewCfg.min, viewCfg.max)
            : [10, 10, 20];
          cc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          const colorBottomY = (viewCfg.mode === 'DISP_LIGHTNING_HOTSPOTS')
            ? (d.metrics.hotspotY ?? d.sfcY)
            : d.sfcY;
          cc.fillRect(simToScreenX(d.sx - 0.5), screenTop,
                      simToScreenX(d.sx + d.step - 0.5) - simToScreenX(d.sx - 0.5),
                      simToScreenY(colorBottomY) - screenTop);
        }

        const scaleStops = colorScaleData[viewCfg.scaleId];
        if (scaleStops && scaleStops.length > 1) {
          const legendX = 10, legendY = 20, legendW = 18, legendH = 140;
          const grad = cc.createLinearGradient(legendX, legendY, legendX, legendY + legendH);
          for (let i = 0; i < scaleStops.length; i++) {
            const [r, g, b] = scaleStops[i];
            grad.addColorStop(i / (scaleStops.length - 1), `rgb(${r},${g},${b})`);
          }
          cc.fillStyle = grad;
          cc.fillRect(legendX, legendY, legendW, legendH);
          cc.strokeStyle = 'rgba(255,255,255,0.4)';
          cc.strokeRect(legendX, legendY, legendW, legendH);
          cc.font = 'bold 11px monospace';
          cc.fillStyle = 'white';
          cc.textAlign = 'left';
          cc.textBaseline = 'middle';
          cc.fillText(String(viewCfg.max), legendX + legendW + 6, legendY);
          cc.fillText(String((viewCfg.min + viewCfg.max) / 2), legendX + legendW + 6, legendY + legendH * 0.5);
          cc.fillText(String(viewCfg.min), legendX + legendW + 6, legendY + legendH);
          if (viewCfg.unit)
            cc.fillText(viewCfg.unit, legendX, legendY + legendH + 14);
          cc.font = 'bold 13px monospace';
          cc.fillText(viewCfg.label, legendX, legendY - 10);
        }
      }

  } // end of display mode else block

  // Always hide risk canvas when not in DISP_RISK
  if (guiControls.displayMode !== 'DISP_RISK' && guiControls.displayMode !== 'DISP_PRESSURE' && riskCanvas) {
    riskCanvas.style.display = 'none';
  }

  if (!isSoundingDisplayMode(guiControls.displayMode) && soundingOverlayCanvas) {
    soundingOverlayCanvas.style.display = 'none';
  }

  // Draw H/L pressure labels when in pressure display mode
  if (guiControls.displayMode === 'DISP_PRESSURE') {
    if (!riskCanvas) {
      riskCanvas = document.createElement('canvas');
      riskCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1;';
      document.body.appendChild(riskCanvas);
    }
    if (riskCanvas.width !== canvas.width || riskCanvas.height !== canvas.height) {
      riskCanvas.width = canvas.width;
      riskCanvas.height = canvas.height;
    }
    riskCanvas.style.display = 'block';

    if (iterNum % 30 === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      const wallRow = new Int8Array(4 * sim_res_x);
      let sfcRow = 1;
      for (let y = 1; y < sim_res_y; y++) {
        gl.readPixels(0, y, sim_res_x, 1, gl.RGBA_INTEGER, gl.BYTE, wallRow);
        let allAir = true;
        for (let x = 0; x < sim_res_x; x++) {
          if (wallRow[x * 4 + 1] === 0) { allAir = false; break; }
        }
        if (allAir) { sfcRow = y; break; }
      }
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const pressRow = new Float32Array(4 * sim_res_x);
      gl.readPixels(0, Math.min(sfcRow + 2, sim_res_y - 1), sim_res_x, 1, gl.RGBA, gl.FLOAT, pressRow);

      const minSep = Math.max(8, Math.floor(sim_res_x / 20));
      riskData = [];
      for (let x = 0; x < sim_res_x; x++) {
        const p = pressRow[x * 4 + 2];
        if (Math.abs(p) < 0.002) continue;
        let isMax = true, isMin = true;
        for (let dx = -minSep; dx <= minSep; dx++) {
          if (dx === 0) continue;
          const np = pressRow[((x + dx + sim_res_x) % sim_res_x) * 4 + 2];
          if (np >= p) isMax = false;
          if (np <= p) isMin = false;
        }
        if (isMax) riskData.push({x, sfcY: sfcRow + 2, type: 'H'});
        if (isMin) riskData.push({x, sfcY: sfcRow + 2, type: 'L'});
      }
    }

    const rc = riskCanvas.getContext('2d');
    rc.clearRect(0, 0, riskCanvas.width, riskCanvas.height);
    rc.font = 'bold 22px monospace';
    rc.textAlign = 'center';
    rc.textBaseline = 'middle';
    for (const lbl of riskData) {
      const sx = simToScreenX(lbl.x);
      const sy = simToScreenY(lbl.sfcY + 3);
      rc.fillStyle = lbl.type === 'H' ? '#FF4444' : '#4488FF';
      rc.strokeStyle = '#000000';
      rc.lineWidth = 3;
      rc.strokeText(lbl.type, sx, sy);
      rc.fillText(lbl.type, sx, sy);
    }
  }

  // Draw H/L pressure labels when in pressure display mode
  if (guiControls.displayMode === 'DISP_PRESSURE') {
    if (!riskCanvas) {
      riskCanvas = document.createElement('canvas');
      riskCanvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:1;';
      document.body.appendChild(riskCanvas);
    }
    if (riskCanvas.width !== canvas.width || riskCanvas.height !== canvas.height) {
      riskCanvas.width = canvas.width;
      riskCanvas.height = canvas.height;
    }
    riskCanvas.style.display = 'block';

    if (iterNum % 30 === 0) { // update every 30 iterations
      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      const wallRow = new Int8Array(4 * sim_res_x);
      // find surface row (first non-wall row from bottom)
      let sfcRow = 1;
      for (let y = 1; y < sim_res_y; y++) {
        gl.readPixels(0, y, sim_res_x, 1, gl.RGBA_INTEGER, gl.BYTE, wallRow);
        let allAir = true;
        for (let x = 0; x < sim_res_x; x++) {
          if (wallRow[x * 4 + 1] === 0) { allAir = false; break; }
        }
        if (allAir) { sfcRow = y; break; }
      }
      // read pressure at surface+1
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      const pressRow = new Float32Array(4 * sim_res_x);
      gl.readPixels(0, sfcRow + 1, sim_res_x, 1, gl.RGBA, gl.FLOAT, pressRow);

      // find local maxima (H) and minima (L) with minimum separation
      const minSep = Math.max(10, Math.floor(sim_res_x / 20));
      const hlLabels = [];
      for (let x = minSep; x < sim_res_x - minSep; x++) {
        const p = pressRow[x * 4 + 2];
        let isMax = true, isMin = true;
        for (let dx = -minSep; dx <= minSep; dx++) {
          if (dx === 0) continue;
          const nx = (x + dx + sim_res_x) % sim_res_x;
          const np = pressRow[nx * 4 + 2];
          if (np >= p) isMax = false;
          if (np <= p) isMin = false;
        }
        if (isMax && Math.abs(p) > 0.002) hlLabels.push({x, type: 'H', p});
        if (isMin && Math.abs(p) > 0.002) hlLabels.push({x, type: 'L', p});
      }

      const rc = riskCanvas.getContext('2d');
      rc.clearRect(0, 0, riskCanvas.width, riskCanvas.height);
      rc.font = 'bold 22px monospace';
      rc.textAlign = 'center';
      rc.textBaseline = 'middle';
      for (const lbl of hlLabels) {
        const sx = simToScreenX(lbl.x);
        const sy = simToScreenY(sfcRow + 4);
        rc.fillStyle = lbl.type === 'H' ? '#FF4444' : '#4488FF';
        rc.strokeStyle = '#000';
        rc.lineWidth = 3;
        rc.strokeText(lbl.type, sx, sy);
        rc.fillText(lbl.type, sx, sy);
      }
    }
  }

  if (!isRadarDisplayMode(guiControls.displayMode) && radarOverlayCanvas) {
    radarOverlayCanvas.style.display = 'none';
  }

  drawLightningDebugOverlay();
  drawRadarLightningOverlay();

  if (displayWeatherStations) {
    for (i = 0; i < weatherStations.length; i++) {
      const sx = simToScreenX(weatherStations[i].getXpos());
      const sy = simToScreenY(weatherStations[i].getYpos());
      if (sx > -200 && sx < canvas.width + 200 && sy > -200 && sy < canvas.height + 200)
        weatherStations[i].updateCanvas();
    }
  }

  if (displayRadars) {
    for (i = 0; i < radars.length; i++) {
      const sx = simToScreenX(radars[i].getXpos());
      const sy = simToScreenY(radars[i].getYpos());
      if (sx > -200 && sx < canvas.width + 200 && sy > -200 && sy < canvas.height + 200)
        radars[i].updateCanvas();
    }
  }

  // Update markers
  for (i = 0; i < markers.length; i++) {
    const sx = simToScreenX(markers[i].getXpos());
    const sy = simToScreenY(markers[i].getYpos());
    if (sx > -200 && sx < canvas.width + 200 && sy > -200 && sy < canvas.height + 200)
      markers[i].updateCanvas();
  }

  if (displayAirmassGenerators) {
    for (i = 0; i < airmassGenerators.length; i++) {
      const sx = simToScreenX(airmassGenerators[i].getXpos());
      const sy = simToScreenY(airmassGenerators[i].getYpos());
      if (sx > -400 && sx < canvas.width + 400 && sy > -400 && sy < canvas.height + 400)
        airmassGenerators[i].updateCanvas();
    }
  }

drawNukeOverlay();
    updateFrameTimeStats(performance.now() - frameDrawStart);

    // Auto-adjust iterations per frame every frame using smoothedFrameMs instead of
    // waiting for the 1-second FPS counter. This reacts in ~5 frames rather than ~60.
    if (!guiControls.paused && guiControls.auto_IterPerFrame
        && !airplaneMode && !guiControls.slowMotion && !guiControls.realtimeMode) {
      // Target: keep smoothedFrameMs close to TARGET_FRAME_MS (28 ms = ~35 fps headroom).
      // Reduce aggressively if over budget, grow slowly when comfortable.
      const msOverBudget = smoothedFrameMs - TARGET_FRAME_MS;
      if (msOverBudget > 2) {
        adjIterPerFrame(msOverBudget > 8 ? -2 : -1);
      } else if (msOverBudget < -5 && frameNum % 10 === 0) {
        adjIterPerFrame(1);
      }
    }

    if (!SETUP_MODE && !guiControls.paused)
      simRuntimeFrames++;

    frameNum++;
  requestAnimationFrame(draw);
} // end of draw() outer

  //////////////////////////////////////////////////////// functions:

  function hideOrShowGraph()
  {
    const dash = document.getElementById('soundingDashboard');
    const metricsPanel = document.getElementById('soundingMetricsPanel');
    if (guiControls.showGraph) {
      soundingGraph.graphCanvas.style.display = 'block';
      if (dash) {
        dash.classList.add('visible');
        dash.setAttribute('aria-hidden', 'false');
      }
      if (metricsPanel) metricsPanel.style.display = 'flex';
      soundingGraph.initSoundingDashboard();
    } else {
      soundingGraph.graphCanvas.style.display = 'none';
      if (dash) {
        dash.classList.remove('visible');
        dash.setAttribute('aria-hidden', 'true');
      }
      if (metricsPanel) metricsPanel.style.display = 'none';
    }
  }

  function toggleSoundingFreeze()
  {
    if (!guiControls.showGraph) return;
    if (guiControls.graphFixedPosition) {
      guiControls.graphFixedPosition = false;
    } else {
      guiControls.graphFixedPosition = true;
      guiControls.graphFixedX = Math.floor(Math.abs(mod(mouseXinSim * sim_res_x, sim_res_x)));
      guiControls.graphFixedY = Math.floor(mouseYinSim * sim_res_y);
    }
    const freezeBtnEl = document.getElementById('soundingFreezeBtn');
    if (freezeBtnEl) {
      freezeBtnEl.textContent = guiControls.graphFixedPosition ? 'Unlock' : 'Freeze';
    }
  }

  function pad(num, size)
  {
    num = num.toString();
    while (num.length < size)
      num = '0' + num;
    return num;
  }

  function dateTimeStr()
  {
    var timeStr;
    if (guiControls.twelveHourClock) { // 12 hour clock for Americans
      timeStr = simDateTime.toLocaleString('en-US', {hour12 : true, hour : 'numeric', minute : 'numeric'});
    } else {                           // 24 hour clock
      timeStr = simDateTime.toLocaleString('nl-NL', {hour12 : false, hour : 'numeric', minute : 'numeric'});
    }

    const monthStr = simDateTime.toLocaleString('en-us', {month : 'short', day : 'numeric'});
    return timeStr + '&nbsp; ' + monthStr;
  }


  async function prepareDownload()
  {
    let prevIterPerFrame = guiControls.IterPerFrame;
    var newFileName = prompt('Please enter a file name. Can not include \'.\'', saveFileName);

    if (newFileName != null) {
      if (newFileName != '' && !newFileName.includes('.')) {
        saveFileName = newFileName;

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        let baseTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
        gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, baseTextureValues);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        let waterTextureValues = new Float32Array(4 * sim_res_x * sim_res_y);
        gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);
        gl.readBuffer(gl.COLOR_ATTACHMENT2);
        let wallTextureValues = new Int8Array(4 * sim_res_x * sim_res_y);
        gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallTextureValues);

        let precipBufferValues = new ArrayBuffer(rainDrops.length * Float32Array.BYTES_PER_ELEMENT);
        gl.bindBuffer(gl.ARRAY_BUFFER, precipVertexBuffer_0);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(precipBufferValues));
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // unbind again


        let weatherStationsPositions = new Int16Array(weatherStations.length * 2);
        for (i = 0; i < weatherStations.length; i++) {
          weatherStationsPositions[i * 2] = weatherStations[i].getXpos();
          weatherStationsPositions[i * 2 + 1] = weatherStations[i].getYpos();
        }

        let radarsPositions = new Int16Array(radars.length * 2);
        let radarsSettings = [];
        for (i = 0; i < radars.length; i++) {
          radarsPositions[i * 2] = radars[i].getXpos();
          radarsPositions[i * 2 + 1] = radars[i].getYpos();
          radarsSettings.push(radars[i].getSettings());
        }

        let airmassPositions = new Int16Array(airmassGenerators.length * 2);
        let airmassSettings = [];
        for (i = 0; i < airmassGenerators.length; i++) {
          airmassPositions[i * 2] = airmassGenerators[i].getXpos();
          airmassPositions[i * 2 + 1] = airmassGenerators[i].getYpos();
          airmassSettings.push(airmassGenerators[i].getSettings());
        }


        const guiControlsForSave = Object.assign({}, guiControls);
        const embeddedRadars = buildSavedRadarTowersForGuiControls();
        if (embeddedRadars)
          guiControlsForSave.__savedRadarTowers = embeddedRadars;
        const embeddedAirmass = buildSavedAirmassGeneratorsForGuiControls();
        if (embeddedAirmass)
          guiControlsForSave.__savedAirmassGenerators = embeddedAirmass;

        let strGuiControls = JSON.stringify(guiControlsForSave);
        let strRadarSettings = JSON.stringify(radarsSettings);
        let strAirmassSettings = JSON.stringify(airmassSettings);

        let saveDataArray = [
          Uint16Array.of(sim_res_x), Uint16Array.of(sim_res_y), baseTextureValues, waterTextureValues, wallTextureValues, Uint32Array.of(rainDrops.length / 5), precipBufferValues, Uint16Array.of(weatherStations.length),
          weatherStationsPositions, Uint16Array.of(radars.length), radarsPositions, Uint16Array.of(airmassGenerators.length), airmassPositions,
          Uint32Array.of(strGuiControls.length), strGuiControls,
          Uint32Array.of(strRadarSettings.length), strRadarSettings,
          Uint32Array.of(strAirmassSettings.length), strAirmassSettings
        ];
        let blob = new Blob(saveDataArray);        // combine everything into a single blob
        let arrBuff = await blob.arrayBuffer();    // turn into array for pako
        let arr = new Uint8Array(arrBuff);
        let compressed = window.pako.deflate(arr); // compress
        let compressedBlob = new Blob([ Uint32Array.of(saveFileVersionID), compressed ], {
          type : 'application/x-binary',
        }); // turn back into blob and add version id in front
        download(saveFileName + '.weathersandbox', compressedBlob);
      } else {
        alert('You didn\'t enter a valid file name!');
      }
    }
    guiControls.IterPerFrame = prevIterPerFrame;
    lastSaveTime = new Date(); // reset timer
  }

  function createProgram(vertexShader, fragmentShader, transform_feedback_varyings)
  {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    if (transform_feedback_varyings != null)
      gl.transformFeedbackVaryings(program, transform_feedback_varyings, gl.INTERLEAVED_ATTRIBS);

    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.detachShader(program, fragmentShader);
      gl.deleteShader(fragmentShader);
      return program;
    }

    const infoLog = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    console.error('Program link error:', infoLog);
    throw new Error('Program link error: ' + infoLog);
  }

  function linkProgramYield() { return new Promise((resolve) => { setTimeout(resolve, 0); }); }

  async function linkProgramAsync(vertexShader, fragmentShader, transform_feedback_varyings, label)
  {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    if (transform_feedback_varyings != null)
      gl.transformFeedbackVaryings(program, transform_feedback_varyings, gl.INTERLEAVED_ATTRIBS);

    gl.linkProgram(program);

    if (parallelShaderCompileExt) {
      let waitCount = 0;
      const maxWaits = 12000;
      while (!gl.getProgramParameter(program, parallelShaderCompileExt.COMPLETION_STATUS_KHR)) {
        await linkProgramYield();
        if (++waitCount >= maxWaits) {
          console.warn('Parallel shader link wait timed out for "' + label + '", checking link status anyway');
          break;
        }
      }
    } else {
      await linkProgramYield();
    }

    if (gl.isContextLost && gl.isContextLost()) {
      gl.deleteProgram(program);
      const ctxMsg = 'WebGL context was lost during shader link ("' + label + '"). The realistic display shader may be too complex for your GPU — try refreshing the page or lowering resolution.';
      console.error(ctxMsg);
      throw new Error(ctxMsg);
    }

    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.detachShader(program, fragmentShader);
      gl.deleteShader(fragmentShader);
      return program;
    }

    const fragLog = gl.getShaderInfoLog(fragmentShader);
    const vertLog = gl.getShaderInfoLog(vertexShader);
    const infoLog = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    const detail = [infoLog, fragLog && ('fragment: ' + fragLog), vertLog && ('vertex: ' + vertLog)]
      .filter(Boolean).join('\n');
    console.error('Program link error (' + label + '):', detail);
    throw new Error('Program link error (' + label + '): ' + (detail || '(no driver message — context may have been lost)'));
  }

  async function loadSourceFile(fileName)
  {
    try {
      const response = await fetch(fileName);
      if (!response.ok) {
        if (response.status === 404)
          throw new Error('File not found: ' + fileName);
        throw new Error('File loading error: ' + response.status + ' ' + response.statusText + ' for ' + fileName);
      }
      return await response.text();
    } catch (error) {
      await loadingBar.showError('ERROR loading shader files! If you just opened index.html, try again using a local server!');
      console.error('Shader source load failed:', fileName, error);
      throw error;
    }
  }

  var lightningV2InRealisticShader = true;

  async function loadShader(nameIn, opts)
  {
    const re = /(?:\.([^.]+))?$/;

    let extension = re.exec(nameIn)[1]; // extract file extension

    let shaderType;
    let type;

    if (extension == 'vert') {
      type = 'vertex';
      shaderType = gl.VERTEX_SHADER;
    } else if (extension == 'frag') {
      type = 'fragment';
      shaderType = gl.FRAGMENT_SHADER;
    } else {
      throw 'Invalid shadertype: ' + extension;
    }

    let filename = 'shaders/' + type + '/' + nameIn;

    var shaderSource = await loadSourceFile(filename);
    if (shaderSource.includes('#include "common.glsl"')) {
      shaderSource = shaderSource.replace('#include "common.glsl"', commonSource);
    }

    if (shaderSource.includes('#include "commonDisplay.glsl"')) {
      shaderSource = shaderSource.replace('#include "commonDisplay.glsl"', commonDisplaySource);
    }

    if (shaderSource.includes('#include "dropletSize.glsl"')) {
      shaderSource = shaderSource.replace('#include "dropletSize.glsl"', dropletSizeSource);
    }

    if (opts && opts.skipLightningV2) {
      shaderSource = shaderSource.replace(/#include "lightningV2.glsl"\r?\n?/, '');
      shaderSource = shaderSource.replace(
        /  if \(ltNumStrikes > 0 && ltEventAge >= 0\.0\) \{\r?\n    vec3 ltBolts;\r?\n    vec3 ltIllum;\r?\n    ltAccumulateBoltsAndIllum\(uv, aspectRatios\[0\], cloudwater, precip, nightFactor, ltBolts, ltIllum\);\r?\n    emittedLight \+= ltBolts \* ltCloudPierce;\r?\n    onLight \+= ltIllum;\r?\n  \}\r?\n/,
        '  // Lightning V2 disabled (GPU shader link fallback)\n'
      );
    } else if (shaderSource.includes('#include "lightningV2.glsl"')) {
      shaderSource = shaderSource.replace('#include "lightningV2.glsl"', lightningV2Source);
    }

    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    // console.time('compileShader');
    gl.compileShader(shader);
    // console.timeEnd('compileShader')

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const infoLog = gl.getShaderInfoLog(shader);
      await loadingBar.showError('ERROR compiling shader: ' + nameIn + '\n' + infoLog);
      console.error('Shader compile error:', nameIn, infoLog);
      gl.deleteShader(shader);
      throw new Error(filename + ' COMPILATION ' + infoLog);
    }

    await loadingBar.add(3, 'Loading shader: ' + nameIn);
    return shader;
  }

  function adjIterPerFrame(adj) { guiControls.IterPerFrame = Math.round(clamp(guiControls.IterPerFrame + adj, 1, 50)); }

  function isPageHidden() { return document.hidden || document.msHidden || document.webkitHidden || document.mozHidden; }

  function calcFps()
  {
    if (!isPageHidden()) {
      FPS = frameNum - lastFrameNum;
      lastFrameNum = frameNum;

      if (!guiControls.paused) {
        console.log(FPS + ' FPS   ' + guiControls.IterPerFrame + ' Iterations / frame      ' + FPS * guiControls.IterPerFrame + ' Iterations / second');
      }
      // calculate total amounts of water and smoke for verification of fluid simulation
      /*
            gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
            gl.readBuffer(gl.COLOR_ATTACHMENT1); // watertexture
            var waterTextureValues = new Float32Array(sim_res_x * sim_res_y * 4);
            gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA, gl.FLOAT, waterTextureValues);

            let totalWaterVapor = 0.0;
            let totalCloudWater = 0.0;
            let totalSmoke = 0.0;

            for (let x = 0; x < sim_res_x; x++) {
              for (let y = 0; y < sim_res_y; y++) {
                let cellInd = (x + y * sim_res_x) * 4;
                let vapor = waterTextureValues[cellInd + 0];
                if (vapor < 1000.0) { // ignore wall
                  totalCloudWater += waterTextureValues[cellInd + 1];
                  totalWaterVapor += vapor;

                  totalSmoke += waterTextureValues[cellInd + 3];
                }
              }
            }

            let totalWater = totalWaterVapor + totalCloudWater;
            console.log('Water  Vapor  Cloud  Smoke\n', Math.round(totalWater), Math.round(totalWaterVapor), Math.round(totalCloudWater), Math.round(totalSmoke));
            */
    }
  }
} // end of mainscript
