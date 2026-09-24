/**
 * Contextual help overlays for simulation tools and dat.GUI settings.
 */
const ControlHelp = (function() {
  'use strict';

  const TOOL_HELP = {
    TOOL_NONE: {
      title: 'Flashlight',
      body: 'Default view mode. Click and drag to pan the camera. Scroll to zoom. No painting — use this to explore the simulation without changing the atmosphere.',
      keys: 'Esc',
    },
    TOOL_TEMPERATURE: {
      title: 'Temperature',
      body: 'Paint warmer or cooler air. Click and drag on the simulation. Higher brush intensity changes temperature faster. Use the invert option to cool instead of heat.',
      keys: 'Q',
    },
    TOOL_WATER: {
      title: 'Water Vapor / Cloud',
      body: 'Add or remove moisture and cloud water in the air (dew point / vapor). Essential for building clouds, fog, and storms. Works in fluid cells only — not on land (use Floodwater for standing water). Combine with the temperature tool to trigger convection.',
      keys: 'W',
    },
    TOOL_PRECIP: {
      title: 'Precipitation',
      body: 'Paint falling precipitation: adds precip mass in the air and spawns rain/snow droplets under the brush. Hold Ctrl (or invert) to remove precip mass and droplets. Works in fluid cells only — not inside solid terrain.',
      keys: '',
    },
    TOOL_WALL_LAND: {
      title: 'Land',
      body: 'Draw dry land terrain. Surface type affects evaporation, vegetation, and how the ground heats under sunlight.',
      keys: 'E',
    },
    TOOL_WALL_FRESH: {
      title: 'Fresh Water / Lake',
      body: 'Paint lakes and rivers. Fresh water evaporates and can modify local humidity and lake-breeze circulations.',
      keys: 'R',
    },
    TOOL_WALL_SEA: {
      title: 'Salt Water / Ocean',
      body: 'Paint ocean surfaces. Oceans provide a large moisture source and stabilize coastal temperatures.',
      keys: 'T',
    },
    TOOL_WALL_ICE_SHEET: {
      title: 'Ice Sheet',
      body: 'Place flat ice sheets. High albedo — reflects sunlight and keeps the surface cold.',
      keys: 'Y',
    },
    TOOL_WALL_ICE_CAP: {
      title: 'Ice Cap / Glacier',
      body: 'Draw sloped glacial ice. Useful for mountain snowpack and cold elevated terrain.',
      keys: 'U',
    },
    TOOL_WALL_URBAN: {
      title: 'Urban',
      body: 'Dense city surfaces with building facades. Heats quickly during the day and can enhance local convection and storms. Building detail stays visible at all zoom levels.',
      keys: '1',
    },
    TOOL_WALL_SUBURBAN: {
      title: 'Suburban',
      body: 'Lighter built-up areas with house silhouettes between city and countryside. Moderate heat retention and evaporation. Houses stay visible when zoomed out.',
      keys: '2',
    },
    TOOL_WALL_AMERICAN_SUBURBAN: {
      title: 'American Suburban',
      body: 'Cookie-cutter American suburban houses from a texture strip. Behaves like Urban for heating, smog, and vegetation limits, with a lower house skyline. Hold Ctrl to remove.',
      keys: '',
    },
    TOOL_WALL_RUNWAY: {
      title: 'Runway',
      body: 'Flat paved surfaces. Very low vegetation and distinct heating characteristics.',
      keys: '3',
    },
    TOOL_WALL_INDUSTRIAL: {
      title: 'Industrial',
      body: 'Industrial zones with building facades and distinct surface properties. Can act as localized heat sources. Facade detail stays visible at all zoom levels.',
      keys: '4',
    },
    TOOL_WALL_FIRE: {
      title: 'Fire',
      body: 'Ignite vegetation where grass or forest exists. Fire spreads with wind, produces smoke, and releases heat.',
      keys: 'I',
    },
    TOOL_SMOKE: {
      title: 'Smoke',
      body: 'Paint warm tan wildfire smoke. Same physics as fire plumes — absorbs sunlight, warms air, and reduces visibility. Fires also emit this smoke.',
      keys: 'Y',
    },
    TOOL_DUST: {
      title: 'Dust',
      body: 'Add airborne dust or smog (brown haze). Absorbs sunlight, warms the air, and reduces visibility. Separate from cream/tan fire smoke.',
      keys: 'O',
    },
    TOOL_WALL_MOIST: {
      title: 'Soil Moisture',
      body: 'Wet or dry the soil under vegetation. Affects evaporation, vegetation health, and surface coloring.',
      keys: 'P',
    },
    TOOL_FLOOD: {
      title: 'Floodwater',
      body: 'Add standing flood height on land (separate from soil moisture). Soil only gains moisture as floodwater soaks in or evaporates. Hold Ctrl (or invert) to remove flood height only — soil moisture is left unchanged. Paint on the land surface only.',
      keys: '',
    },
    TOOL_VEG_GRASS: {
      title: 'Grass / Shrub',
      body: 'Paint grassy vegetation. Increases evaporation and can fuel fire spread. Color varies with soil moisture.',
      keys: 'A',
    },
    TOOL_VEG_FOREST: {
      title: 'Forest',
      body: 'Paint conifer forest canopy. Stronger evaporation and fuel for larger fires than grass. Tree sprites stay visible at all zoom levels in the realistic view.',
      keys: '',
    },
    TOOL_VEG_FOREST2: {
      title: 'Forest 2',
      body: 'Paint deciduous forest canopy. Same growth, fire, and snow behavior as Forest, with a different tree look. Natural grass→forest growth can also become Forest 2 (see Vegetation → Natural Forest Type). Painting Forest over Forest 2 converts it back to conifers.',
      keys: '',
    },
    TOOL_WALL_SNOW: {
      title: 'Snow',
      body: 'Add snow cover on terrain. High albedo cools the surface and affects precipitation behavior.',
      keys: 'D',
    },
    TOOL_WIND: {
      title: 'Wind',
      body: 'Push air horizontally by dragging. Creates shear, convergence, and can organize storms. Whole-width mode applies wind across the full domain width.',
      keys: 'F',
    },
    TOOL_CHARGE: {
      title: 'Charge',
      body: 'Manually add atmospheric electrical charge in clouds. Use invert to remove charge. Drives lightning when storms are mature.',
      keys: 'G',
    },
    TOOL_STATION: {
      title: 'Weather Station',
      body: 'Click to place a weather station. Shows live conditions (including diagnostic MSLP) and history plots. Double-click a station to open its time-height meteogram.',
      keys: 'H (then click) · Double-click for meteogram',
    },
    TOOL_BALLOON: {
      title: 'Weather Balloon',
      body: 'Click to launch a sounding balloon. Ascends through the atmosphere and feeds skew-T and hodograph data.',
      keys: 'J (then click)',
    },
    TOOL_RADAR: {
      title: 'Radar Tower',
      body: 'Place a Doppler radar tower. Open its menu to change product, range, and sensitivity. Supports reflectivity, velocity, and more.',
      keys: 'K (then click)',
    },
    TOOL_AIRMASS: {
      title: 'Airmass Generator',
      body: 'Place a device that continuously modifies temperature and moisture in a region. Useful for feeding storms or testing boundaries.',
      keys: 'L (then click)',
    },
    TOOL_SYNOPTIC_LOW: {
      title: 'Synoptic Low',
      body: 'Place a low-pressure forcing that draws wind inward. Also lowers diagnostic MSLP near the center (Sounding: MSLP / stations). Click an existing L/H marker with this tool to remove it.',
      keys: 'Tool menu → Synoptic Low',
    },
    TOOL_SYNOPTIC_HIGH: {
      title: 'Synoptic High',
      body: 'Place a high-pressure forcing that pushes wind outward. Also raises diagnostic MSLP near the center. Pair with Coriolis for more persistent domain-scale flow.',
      keys: 'Tool menu → Synoptic High',
    },
    TOOL_DRYLINE: {
      title: 'Dryline',
      body: 'Place a vertical moisture boundary. Dry air on one side, moist on the other, with heating contrast and low-level convergence. Click the marker with this tool to remove it.',
      keys: 'Tool menu → Dryline',
    },
    TOOL_SEA_BREEZE: {
      title: 'Sea / Lake Breeze',
      body: 'Place near a coast. Daytime onshore flow with return aloft; overnight land breeze. Pair with Auto Sea Breeze for domain-wide coasts.',
      keys: 'Tool menu → Sea / Lake Breeze',
    },
    TOOL_MARKER: {
      title: 'Marker',
      body: 'Drop a map marker for reference. Does not affect the simulation physics.',
      keys: 'M (then click)',
    },
    TOOL_AIRPORT: {
      title: 'Airport',
      body: 'Place an airport on land. Paints real runway tiles plus urban terminal/tower and industrial hangar on the surface. A small marker stays for selection/settings. Click again with this tool to remove the marker (terrain remains). Pair with Flight Route for traffic.',
      keys: 'Tool menu → Airport',
    },
    TOOL_FLIGHT_ROUTE: {
      title: 'Flight Route',
      body: 'Click origin airport, click the sky to place numbered path nodes, then click destination. Click the dashed path to insert more nodes, drag handles to reshape, right-click a node to delete. Route menu sets flights/min and lists every node.',
      keys: 'Tool menu → Flight Route',
    },
    TOOL_NUKE: {
      title: 'Nuke',
      body: 'Detonate a nuclear-scale heat and smoke burst. Adjust blast radius, temperature, and smoke in the Nukes settings folder.',
      keys: 'N (then click)',
    },
  };

  const SETTING_HELP = {
    vorticity: 'Rotational stirring in the fluid. Higher values add turbulent eddies; lower values look smoother.',
    dragMultiplier: 'Air resistance on wind. Higher drag calms strong flows more quickly.',
    wind: 'Background horizontal wind applied across the domain.',
    globalDrying: 'Slowly removes moisture everywhere below the altitude limits.',
    globalHeating: 'Uniform heating or cooling applied below the altitude limits.',
    soundingForcing: 'Nudges the atmosphere toward the sounding profile on the right side of the map.',
    globalEffectsStartAlt: 'Lowest altitude (meters) where global drying/heating applies.',
    globalEffectsEndAlt: 'Highest altitude (meters) where global drying/heating applies.',
    tool: 'Active painting or placement tool. Also switch with keyboard shortcuts (see key column in Controls).',
    brushSize: 'Diameter of the tool brush in simulation cells.',
    wholeWidth: 'Apply the tool across the entire width of the map at the current height.',
    brushIntensity: 'Strength of each paint stroke. Higher values change fields faster.',
    invertTool: 'Reverses the tool effect — e.g. cool instead of heat, remove instead of add.',
    allowCaves: 'Allow terrain to have overhangs and enclosed air pockets underground.',
    airTrafficEnabled: 'Enable NPC planes flying between airports on flight routes.',
    airTrafficMaxPlanes: 'Maximum number of AI aircraft allowed in the simulation at once.',
    airTrafficFreqMult: 'Global multiplier on airport departure rates.',
    airTrafficShowRoutes: 'Draw dashed flight-route corridors between airports.',
    displayAirports: 'Show airport icons on the map.',
    openUserInteraction: 'Open the searchable User Interaction menu — browse tools by category, create custom scripted tools, and import/export them.',
    openCustomToolCreator: 'Open the Custom Tool Creator directly — make brush, place, or terrain tools with scripts, textures, and parameters.',
    openShaderMenu: 'Open the Shader Menu — preset look packs, clouds/rain tinting, sky editor, custom sky/sun textures, and advanced GLSL overrides for the realistic view.',
    openSkyEditor: 'Opens the Shader Menu on the Sky tab (sky colours, sun path, stars, twilight).',
    timeOfDay: 'Time in hours (0–24). Noon is 12:00. Drives sun position when day/night cycle is on.',
    dayNightCycle: 'Automatically advance time and move the sun. Turn off to set sun angle manually.',
    accelerateNight: 'Speed through nighttime faster than daytime for shorter nights.',
    latitude: 'Latitude for the solar path. Affects day length and sun height through the year.',
    month: 'Month of the year (1–12). Changes solar declination and day/night balance.',
    sunAngle: 'Sun elevation in degrees (manual mode). 90° is directly overhead.',
    sunIntensity: 'Strength of incoming solar radiation. 1.0 is roughly realistic clear-sky flux.',
    greenhouseGases: 'Trace greenhouse gas absorption of outgoing longwave radiation.',
    waterGreenHouseEffect: 'Water-vapor greenhouse effect strength in the radiation model.',
    IR_rate: 'Multiplier on infrared radiative transfer speed.',
    waterTemperature: 'Default temperature of lakes and oceans in °C.',
    enableGlacierFormation: 'When on, deep cold snow on land can compact into glacier / ice-cap terrain.',
    enableGlacierMelting: 'When on, land glaciers can thin and melt back into snowy land when warm.',
    maxSnowAccumulationCm: 'Maximum snow depth that can build up on land tiles from snowfall (centimeters).',
    maxSoilMoisture: 'Maximum soil moisture the ground can hold (mm). Higher allows more storage and more land evaporation from wet soils.',
    dynamicWaterTemperature: 'Let water bodies heat and cool from sunlight and air contact.',
    landEvaporation: 'Moisture added to the air from vegetated land.',
    waterEvaporation: 'Moisture added from open water surfaces.',
    evapHeat: 'Cooling of the surface when evaporation occurs.',
    meltingHeat: 'Energy absorbed when snow or ice melts.',
    condensationRate: 'How quickly excess vapor condenses into cloud water.',
    cloudEvaporationRate: 'How quickly cloud water evaporates when the air is undersaturated. Lower = softer cloud edges.',
    waterWeight: 'Weight of cloud water on dynamics — higher values make clouds sink more.',
    aboveZeroThreshold: 'Cloud water needed to spawn rain above 0°C.',
    subZeroThreshold: 'Cloud water needed to spawn snow below 0°C.',
    spawnChance: 'Probability per step that precipitation particles spawn.',
    snowDensity: 'Density of snow particles relative to rain.',
    fallSpeed: 'Terminal fall speed scale for precipitation particles.',
    displayMode: 'Visualization mode — realistic view, raw fields, radar products, sounding maps (including forecast composites: initiation, storm mode, EHI/SCP), and more.',
    soundingOverlayBarWidth: 'Columns per color bar on Risk and Sounding map views. 1 = one bar per column; 0.5 = two bars per column. Fine settings update progressively across frames so the sim stays responsive.',
    riskUpdateFrequency: 'How often (in sim iterations) Risk and Sounding map overlays start a fresh scan. Lower = more frequent updates.',
    exposure: 'HDR exposure for the realistic view. Raise to brighten dark scenes.',
    camSpeed: 'Camera pan speed when using smooth camera controls.',
    wrapHorizontally: 'Wrap the view horizontally so the map tiles side to side when zoomed out.',
    SmoothCam: 'Smooth interpolated camera movement instead of instant jumps.',
    showGraph: 'Show the skew-T / sounding graph at the cursor or fixed position.',
    showDrops: 'Draw individual precipitation particles over the realistic view.',
    enableRainbows: 'Show rainbows in rain when the sun is out (realistic view).',
    smoothClouds: 'Smooth cloud edges with Hermite interpolation (original softer look). Turn off for a small performance gain.',
    saturation: 'Color saturation in post-processing.',
    contrast: 'Image contrast in post-processing.',
    starVisibility: 'Brightness of stars at night in the realistic view.',
    autoMinShadowLight: 'Automatically lift shadow brightness near twilight so night scenes are not pure black.',
    minShadowLight: 'Minimum shadow fill light (0 = darkest shadows).',
    enablePrecipitation: 'Master switch for rain, snow, and hail particle simulation.',
    IterPerFrame: 'Physics iterations per rendered frame. Higher = faster simulation time, lower FPS.',
    auto_IterPerFrame: 'Automatically tune iterations per frame to hold a target frame rate. When FPS has headroom, prioritizes raising iters so the simulation runs faster.',
    sound: 'Enable environmental wind and storm audio.',
    enableBloom: 'HDR bloom on bright clouds and lightning.',
    performanceAutoScaling: 'Reduce visual quality and stride expensive physics under load to keep the frame rate stable. More aggressive at high resolutions.',
    highResPerformanceMode: 'Aggressive high-resolution mode: fewer droplets, stricter iteration caps, and heavier pass throttling.',
    showDebugOverlay: 'Minecraft-style F3 debug HUD — FPS, frame time, resolution, camera, quality, and sim stats. Toggle with F3.',
    applyPerformancePreset: 'One-click aggressive speed settings for high resolutions (reduced precip, skip CAPE, lightning Performance tier, auto scaling). Curl/vorticity stay on for turbulent flow.',
    enableVectorField: 'Overlay wind arrows in the realistic view.',
    displayWeatherStations: 'Show or hide placed weather station markers and their charts.',
    displayRadars: 'Show or hide placed radar markers and range rings.',
    displayAirmassGenerators: 'Show or hide placed airmass generator markers.',
    displayWeatherBalloons: 'Show or hide weather balloon markers and ascent paths.',
    realDewPoint: 'On the sounding graph, show dew point from vapor only (exclude cloud water).',
    skipLightingCalculation: 'Skip the radiation/lighting pass for a large performance gain. Shadows and radiative heating/cooling freeze.',
    skipCurlCalculation: 'Skip vorticity calculation — faster but less turbulent flow. Leave off for realistic swirling clouds (legacy behavior).',
    skipCAPECalculation: 'Skip CAPE calculation — faster storm thermodynamics.',
    skipAdvection: 'Skip fluid advection — atmosphere stops flowing (tools still work).',
    skipChargeCalculation: 'Skip automatic charge buildup — lightning needs manual charge tool.',
    reducedPrecipitation: 'Halve precipitation particle count (and lower the safety cap) for a large GPU boost.',
    reducedWeatherStationUpdates: 'Update weather stations half as often to cut readPixels cost.',
    disableTempChangeHistory: 'Disable temperature-history texture copies used by some tools.',
    showControlHelp: 'Show the help panel describing the active tool and hovered settings.',
    paused: 'Pause the simulation. Brush tools still work while paused so you can edit the atmosphere.',
    resetAtmosphereKeepTerrain: 'Clear wind, temperature, moisture, charge, and precip particles while keeping terrain and instruments.',
    generateProceduralTerrain: 'Replace terrain with a seeded heightmap (sea, land, mountains, optional lakes). Atmosphere is reseeded above new ground.',
    loadScenarioPack: 'Load a preset event day (terrain + dryline/sea-breeze/synoptic placeables + time-of-day).',
    coriolisStrength: 'Weak sideways deflection of horizontal wind (f-plane). 0 = off. Helps jets and fronts persist.',
    enableSynopticSystems: 'Apply placed High/Low pressure forcings each advection step.',
    displaySynopticSystems: 'Show High/Low placeable markers and radius overlays.',
    enableDrylines: 'Apply placed dryline moisture/heating boundaries each advection step.',
    displayDrylines: 'Show dryline markers and influence overlays.',
    enableSeaBreezes: 'Apply placed sea/lake breeze circulations (day onshore / night offshore).',
    displaySeaBreezes: 'Show sea-breeze markers and radius overlays.',
    enableAutoSeaBreeze: 'Automatically drive breezes at land–water coasts across the domain.',
    autoSeaBreezeStrength: 'Strength of automatic coastline sea/land breeze forcing.',
    stormSurgeStrength: 'How strongly onshore wind piles ocean water onto low coasts (0 = off, 1 = default, 2 = extreme). Floods coastal land as standing water.',
    stormSurgeWindThreshold: 'Onshore wind strength needed before storm surge starts. Higher = only strong storms surge.',
    stormSurgeMaxCells: 'Maximum surge runup height in terrain cells when wind is extreme.',
    stormSurgeInlandReach: 'How far inland (in cells) surge can push from the ocean and via flooded neighbors.',
    enableFlooding: 'Allow frequent rain and runoff events to create standing floodwater on land.',
    enableStormSurge: 'Allow strong onshore winds to push ocean water onto low coasts as storm surge.',
    floodRainThreshold: 'Minimum rain intensity that counts as a flooding rain event. Ponding builds from how often rain clears this, not from rainfall totals.',
    floodPondRate: 'Standing floodwater (mm) added each raining iteration once soil is wet enough. Frequency-based — not proportional to rainfall amount.',
    displayMeteogram: 'Show the time-height meteogram for the active weather station (or double-click a station). Includes surface wind/MSLP/precip and a convective strip (CAPE, CIN, SRH, precip). After Forecast Now, the meteogram is filled from forecast keyframes.',
    surfacePressure: 'Sea-level baseline (hPa) for diagnostic MSLP and hydrostatic CAPE surface pressure. Fluid solver pressure is unchanged.',
    pressureThermalScale: 'How strongly warm/cool columns shift displayed MSLP (hPa per °C). Warm air lowers MSLP.',
    pressureDynamicScale: 'How strongly near-surface fluid pressure maps into displayed MSLP (hPa per unit).',
    pressureSynopticScale: 'MSLP anomaly amplitude (hPa) at a Synoptic Low/High center when strength = 1.',
    useHydrostaticCapePressure: 'Use column-integrated hydrostatic P(z) for CAPE/skew-T instead of altitude-only ISA. Fluid PRESSURE solver is unchanged.',
    recordIntervalSimSec: 'While recording, save a full-state keyframe every N simulation seconds (not every iteration).',
    replayMaxKeyframes: 'Ring-buffer cap for live recording keyframes. Older frames drop when the limit is hit.',
    replayPlaybackSpeed: 'How fast Play advances between keyframes in the replay/forecast scrubber.',
    forecastLeadHours: 'How far ahead Forecast Now free-runs the model before opening the forecast viewer.',
    startReplayRecording: 'Start capturing full simulation state keyframes (grids, precip, light, charge).',
    stopReplayRecording: 'Stop recording, download a .wsreplay file, and enter scrubbing mode.',
    loadReplayFile: 'Load a .wsreplay or .wsforecast file and scrub with free camera.',
    exportReplaySession: 'Download the current replay/forecast session without stopping recording.',
    exitReplayMode: 'Leave replay/forecast view. Forecast exit restores the initial-condition snapshot.',
    runForecastNow: 'Snapshot the current state, free-run to the forecast lead time, then scrub valid-time products. Exit restores the IC.',
    floodVizStrength: 'Legacy alias for Floodwater Opacity (0–1).',
    floodWaterOpacity: 'Opacity of standing floodwater in the realistic view. 0 = hidden, 1 = fully opaque blue ponding.',
    fogHazeStrength: 'Near-surface fog and haze in the realistic view where air is moist and cool. 0 = off.',
    stormTrackOverlay: 'Draw fading trails of storm cores (precip / CAPE local maxima) over any display mode.',
    outflowOverlay: 'Highlight cold-pool / gust-front edges where near-surface air is cool and divergent. Works over any display mode.',
    radarOverlay: 'Draw radar data on top of the realistic view.',
    radarOpacity: 'Opacity of the radar overlay.',
    nukeBlastRadius: 'Radius of the thermal blast in cells.',
    nukeTemperature: 'Peak temperature added by a nuke detonation.',
    lightningRenderStyle: 'Classic particle-based bolts with prebaked textures (same as the original sandbox).',
    globalLightningMultiplier: 'Lightning rate scale. 1 = realistic 1×, 100 = extremely unrealistic nearly continuous lightning.',
    cloudToGroundFrequency: 'Relative amount of cloud-to-ground strikes (with Frequency scale).',
    intracloudFrequency: 'Relative amount of in-cloud strikes (with Frequency scale).',
    spiderLightningFrequency: 'Relative amount of spider / cloud-channel lightning (with Frequency scale).',
    lightningBrightness: 'Brightness of lightning bolt rendering.',
    flashDuration: 'How long lightning flashes illuminate the scene.',
    chargeGenerationRate: 'How quickly storms build electrical charge naturally.',
    gpuEffectQuality: 'Quality of GPU lightning and shadow smoothing effects. Also scales with zoom distance.',
    atmosphericLightingResolution: 'Resolution scale for lightning scene illumination (1 = full, 0.5 = half). Auto-halves further when zoomed out.',
    realtimeMode: '1:1 with real time — one in-game hour equals one real hour (physics and clock).',
    airplaneMode: 'Fly an aircraft through the clouds in first-person style.',
    slowMotion: 'Force one simulation step per frame for a slower, more watchable pace (not true 1:1 Realtime Mode).',
    lightningIllumTexture: 'Pre-render lightning scene illumination to textures for stable flashes. Bolts stay procedural.',
    lightningIllumBlurStrength: 'Softens lightning flash lighting in the scene. 0 = sharp; higher = smoother, more stable illumination.',
  };

  const FOLDER_HELP = {
    Fluid: 'Core atmosphere dynamics — wind stirring, drag, and global nudging.',
    'User Interaction': 'Tools for painting the atmosphere and terrain, plus brush options. Open User Interaction for search, categories, and custom scripted tools.',
    Radiation: 'Sun, time of day, and greenhouse-gas radiation settings.',
    Water: 'Evaporation, condensation, and water body temperatures.',
    Precipitation: 'Rain, snow, and hail formation thresholds and behavior.',
    Radar: 'On-map radar overlay, world radar, and lightning icons.',
    Lightning: 'Lightning appearance, frequency, and storm electrification.',
    Display: 'Visual modes, camera, color grading, overlays, and units.',
    Camera: 'Pan speed, horizontal wrapping, and smooth camera motion.',
    Appearance: 'Exposure, color grading, clouds, droplets, floodwater opacity, and shadow lighting.',
    Stars: 'Night-sky star visibility, density, and light contribution.',
    Overlays: 'All on-screen overlay toggles — soundings, risk bars, synoptic markers, storm tracks, stations, radars, meteogram, fog/haze, vector field, and help.',
    Units: 'Clock format and measurement units for distance, speed, and temperature.',
    Advanced: 'Performance toggles, precipitation, replay/forecast, and simulation speed.',
    Simulation: 'Coriolis, synoptic systems, iteration speed, and sounding mode.',
    'Audio & Effects': 'Sound and bloom post-processing.',
    Performance: 'Speed and quality tradeoffs — presets, skip toggles, and resource limits.',
    'Resolution & Debug': 'Fullscreen resolution and debug overlay.',
    Nukes: 'Parameters for the nuke placement tool.',
    'Skew-T': 'Weather balloon ascent and sounding graph options.',
  };

  let panelEl = null;
  let titleEl = null;
  let bodyEl = null;
  let keysEl = null;
  let controls = null;
  let enabled = true;
  let hoverKey = null;
  let lastTool = null;

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.id = 'controlHelpPanel';
    panelEl.innerHTML =
      '<div class="chp-inner">' +
        '<div class="chp-title"></div>' +
        '<div class="chp-body"></div>' +
        '<div class="chp-keys"></div>' +
      '</div>';
    document.body.appendChild(panelEl);
    titleEl = panelEl.querySelector('.chp-title');
    bodyEl = panelEl.querySelector('.chp-body');
    keysEl = panelEl.querySelector('.chp-keys');

    if (!document.getElementById('controlHelpStyles')) {
      const style = document.createElement('style');
      style.id = 'controlHelpStyles';
      style.textContent =
        '#controlHelpPanel{position:fixed;left:12px;bottom:12px;max-width:min(420px,calc(100vw - 440px));' +
        'z-index:950;pointer-events:none;opacity:0;transform:translateY(8px);' +
        'transition:opacity .2s ease,transform .2s ease;font-family:Arial,sans-serif;}' +
        '#controlHelpPanel.visible{opacity:1;transform:translateY(0);}' +
        '#controlHelpPanel .chp-inner{background:rgba(12,14,22,.88);border:1px solid rgba(74,144,226,.35);' +
        'border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.45);backdrop-filter:blur(8px);}' +
        '#controlHelpPanel .chp-title{font-size:13px;font-weight:600;color:#7eb8ff;margin-bottom:4px;letter-spacing:.02em;}' +
        '#controlHelpPanel .chp-body{font-size:12px;line-height:1.45;color:#d8dde8;}' +
        '#controlHelpPanel .chp-keys{margin-top:6px;font-size:11px;color:#8a93a8;}' +
        '#controlHelpPanel .chp-keys strong{color:#a8c4e8;font-weight:600;}' +
        '.dg .cr.ch-help-hover{background:rgba(74,144,226,.12)!important;}' +
        '.intro-hints-option{margin-top:14px;font-size:14px;}' +
        '.intro-hints-option label{cursor:pointer;display:inline-flex;align-items:center;gap:8px;color:#d8dde8;}' +
        '.intro-hints-option input{width:16px;height:16px;cursor:pointer;}' +
        '@media(max-width:900px){#controlHelpPanel{max-width:calc(100vw - 24px);left:12px;right:12px;}}';
      document.head.appendChild(style);
    }
  }

  function setContent(title, body, keys) {
    ensurePanel();
    titleEl.textContent = title || '';
    bodyEl.textContent = body || '';
    if (keys) {
      keysEl.innerHTML = 'Shortcut: <strong>' + keys + '</strong>';
      keysEl.style.display = '';
    } else {
      keysEl.textContent = '';
      keysEl.style.display = 'none';
    }
  }

  function refreshVisibility() {
    ensurePanel();
    const show = enabled && controls && controls.showControlHelp !== false;
    const hasContent = titleEl.textContent.length > 0;
    panelEl.classList.toggle('visible', show && hasContent);
  }

  function showTool(tool) {
    if (!enabled || !controls || controls.showControlHelp === false) {
      refreshVisibility();
      return;
    }
    if (hoverKey) return;
    let info = TOOL_HELP[tool];
    if (!info && tool && String(tool).startsWith('CUSTOM_') &&
        typeof UserInteraction !== 'undefined' && UserInteraction.registry) {
      const def = UserInteraction.registry.getTool(tool);
      if (def) {
        info = {
          title: def.name,
          body: 'Custom ' + (def.mode || 'brush') +
            ' tool. Effects come from your script expressions and parameters. Open User Interaction to edit.',
          keys: '',
        };
      }
    }
    if (!info) {
      setContent('', '', '');
      refreshVisibility();
      return;
    }
    setContent(info.title, info.body, info.keys || '');
    refreshVisibility();
  }

  function showSetting(property, label) {
    if (!enabled || !controls || controls.showControlHelp === false) return;
    const body = SETTING_HELP[property];
    if (!body) return;
    hoverKey = property;
    setContent(label || property, body, '');
    refreshVisibility();
  }

  function clearHover() {
    hoverKey = null;
    if (controls && controls.tool)
      showTool(controls.tool);
    else
      refreshVisibility();
  }

  function onRowEnter(row, property, label) {
    row.classList.add('ch-help-hover');
    showSetting(property, label);
  }

  function onRowLeave(row) {
    row.classList.remove('ch-help-hover');
    clearHover();
  }

  function attachRow(row, property, label) {
    if (!row || row.dataset.chHelpBound) return;
    row.dataset.chHelpBound = '1';
    row.addEventListener('mouseenter', function() { onRowEnter(row, property, label); });
    row.addEventListener('mouseleave', function() { onRowLeave(row); });
  }

  function walkFolder(folder) {
    if (!folder) return;
    const folderName = folder.name;
    if (folder.domElement) {
      const titleBtn = folder.domElement.querySelector('.title');
      if (titleBtn && !titleBtn.dataset.chHelpBound) {
        titleBtn.dataset.chHelpBound = '1';
        const fHelp = FOLDER_HELP[folderName];
        if (fHelp) {
          titleBtn.addEventListener('mouseenter', function() {
            if (!enabled || !controls || controls.showControlHelp === false) return;
            hoverKey = 'folder:' + folderName;
            setContent(folderName, fHelp, '');
            refreshVisibility();
          });
          titleBtn.addEventListener('mouseleave', clearHover);
        }
      }
    }
    if (folder.__controllers) {
      for (const c of folder.__controllers) {
        if (!c || !c.property || typeof controls[c.property] === 'function') continue;
        const row = c.domElement;
        // dat.GUI's controller.name(str) is a setter only — calling name() with no
        // args writes the string "undefined" into every control label.
        const nameEl = row && row.querySelector('.property-name');
        const label = (nameEl && nameEl.textContent.trim()) || c.property;
        attachRow(row, c.property, label);
      }
    }
    if (folder.__folders) {
      const subs = Array.isArray(folder.__folders) ? folder.__folders : Object.values(folder.__folders);
      for (const sub of subs) walkFolder(sub);
    }
  }

  const SKY_HELP = {
    'Time of day (hours)': 'Clock hour (0–24). Drives sun position when the day/night cycle is enabled.',
    'Sun angle (°)': 'Manual sun elevation. 90° is overhead; lower values mean a lower sun.',
    'Month': 'Calendar month — shifts day length and solar declination.',
    'Latitude (°)': 'Observer latitude for the solar path and day/night balance.',
    'Sun intensity': 'Scales incoming solar radiation strength.',
    'Min shadow light': 'Minimum fill light in shadows. 0 is darkest.',
    'Star visibility': 'How bright stars appear at night.',
    'Star light emit': 'How much light stars add to the night sky.',
    'Star density': 'How many stars are visible.',
  };

  const COLOR_SCALE_TAB_HELP = {
    'RH': 'Relative humidity color scale used in moisture display modes.',
    'Temp': 'Temperature color scale for thermal display modes.',
    'CAPE': 'Convective available potential energy colors on risk overlays.',
    'Hail': 'Hail size or intensity color scale.',
    'Wind': 'Wind speed color scale for velocity displays.',
    'Precip': 'Precipitation intensity color scale.',
    'IR': 'Infrared temperature or heating color scale.',
    'Soil': 'Soil moisture color scale.',
    'Risk': 'Convective risk overlay color scale.',
  };

  const COLOR_SCALE_ACTION_HELP = {
    '+ Add': 'Insert a new color stop into the active scale.',
    '− Remove': 'Delete the selected color stop.',
    'Copy': 'Copy the current scale JSON to the import/export box.',
    'Paste': 'Apply scale colors from the JSON in the import/export box.',
    '↺ Apply': 'Apply manual JSON edits from the text area.',
    '↓ Import': 'Load scale colors from the JSON text area.',
    '⎘ Copy to Clipboard': 'Copy the active scale definition to the clipboard.',
    'Interpolate stops': 'Smoothly blend colors between stops instead of hard steps.',
    'Smooth this view': 'Blend colors continuously between stops for this scale, like Relative Humidity. Unchecked keeps hard color bands.',
  };

  const KEYBIND_HELP = {
    panel: 'Remap keyboard shortcuts for tools, camera, and simulation controls. Click Change, then press the desired key.',
    change: 'Start listening for a new key assignment.',
    clear: 'Remove the binding for the selected action.',
    reset: 'Restore all keybinds to defaults.',
  };

  const ENTITY_HELP = {
    'radar-product': 'Radar product to display — reflectivity, velocity, correlation coefficient, and more.',
    'radar-range': 'Maximum range of the radar beam in simulation cells.',
    'radar-resolution': 'Gate size — smaller values give sharper but noisier data.',
    'radar-sensitivity': 'Gain applied to weak returns. Raise to see light precipitation.',
    'radar-overlay': 'Draw this radar on the realistic view while the menu is open.',
    'station-name': 'Label shown above the weather station icon.',
    'balloon-ascent': 'How fast the balloon rises through the atmosphere.',
    'airmass-temp': 'Temperature offset this generator applies to nearby air.',
    'airmass-moisture': 'Moisture added or removed by the airmass generator.',
    'marker-label': 'Optional text label for the map marker.',
  };

  const PANEL_INTRO = {
    '#skyPanel': {
      title: 'Sky Editor',
      body: 'Fine-tune sky colors, twilight bands, stars, and sun appearance. Changes apply live to the realistic view.',
    },
    '#colorScalePanel': {
      title: 'Color Scale Editor',
      body: 'Edit the color ramps used by display modes and overlays. Select a scale tab, adjust stops, and use Smooth this view to interpolate like Relative Humidity.',
    },
    '#keybindPanel': {
      title: 'Keybind Editor',
      body: KEYBIND_HELP.panel,
    },
    '#userInteractionPanel': {
      title: 'User Interaction',
      body: 'Browse and select tools by category or search. Create custom brush, place, or terrain tools (Base vs Overlay) with optional facade textures, expression scripts, and parameters. Import and export as JSON (textures included).',
    },
    '#uieCreatorPanel': {
      title: 'Custom Tool Creator',
      body: 'Modes: Brush, Place, or Terrain. Terrain tools pick Base (replaces surface like land/ocean/ice) or Overlay (paints on land like urban). Download the facade template, edit it, upload a PNG (max 8 textured tools), and tune freezing temp / snow / moisture / heat / friction. Advanced script section is optional.',
    },
  };

  let panelIntroEl = null;

  const SHOW_CONTROL_HELP_KEY = 'wse_showControlHelp';

  function loadShowControlHelpPreference() {
    try {
      const raw = localStorage.getItem(SHOW_CONTROL_HELP_KEY);
      if (raw === '0' || raw === 'false') return false;
      if (raw === '1' || raw === 'true') return true;
    } catch (e) { /* ignore quota */ }
    return true;
  }

  function saveShowControlHelpPreference(on) {
    try {
      localStorage.setItem(SHOW_CONTROL_HELP_KEY, on ? '1' : '0');
    } catch (e) { /* ignore quota */ }
  }

  function syncIntroHelpToggle(on) {
    const el = document.getElementById('introShowHints');
    if (el) el.checked = !!on;
  }

  function applyShowControlHelp(on) {
    const enabledHelp = !!on;
    saveShowControlHelpPreference(enabledHelp);
    syncIntroHelpToggle(enabledHelp);
    if (controls)
      controls.showControlHelp = enabledHelp;
    setEnabled(enabledHelp);
    refreshVisibility();
  }

  function initIntroHelpToggle() {
    const el = document.getElementById('introShowHints');
    if (!el || el.dataset.chHelpBound) return;
    el.dataset.chHelpBound = '1';
    el.checked = loadShowControlHelpPreference();
    el.addEventListener('change', function() {
      applyShowControlHelp(el.checked);
    });
  }

  function attachElement(el, title, body, keys) {
    if (!el || el.dataset.chHelpBound) return;
    el.dataset.chHelpBound = '1';
    el.addEventListener('mouseenter', function() {
      if (!enabled || !controls || controls.showControlHelp === false) return;
      hoverKey = 'el:' + title;
      setContent(title, body, keys || '');
      refreshVisibility();
    });
    el.addEventListener('mouseleave', function() {
      if (hoverKey === 'el:' + title) clearHover();
    });
  }

  function attachBySelector(selector, getHelp) {
    document.querySelectorAll(selector).forEach((el) => {
      const info = getHelp(el);
      if (info) attachElement(el, info.title, info.body, info.keys);
    });
  }

  function attachPanelIntro(panelSelector) {
    const intro = PANEL_INTRO[panelSelector];
    const panel = document.querySelector(panelSelector);
    if (!intro || !panel) return;
    const hdr = panel.querySelector('[class*="-hdr"], .cse-hdr, .kbe-hdr, .ske-hdr, .uie-hdr');
    if (hdr) attachElement(hdr, intro.title, intro.body);
  }

  function attachUserInteractionEditor() {
    attachPanelIntro('#userInteractionPanel');
    attachPanelIntro('#uieCreatorPanel');
  }

  function attachSkyEditor() {
    attachPanelIntro('#skyPanel');
    document.querySelectorAll('#skyPanel .ske-row').forEach((row) => {
      const lbl = row.querySelector('.ske-lbl');
      if (!lbl) return;
      const title = lbl.childNodes[0] && lbl.childNodes[0].textContent
        ? lbl.childNodes[0].textContent.trim() : lbl.textContent.trim();
      const body = SKY_HELP[title] || lbl.querySelector('small')?.textContent;
      if (body) attachElement(row, title, body);
    });
    document.querySelectorAll('#skyPanel .ske-chk').forEach((chk) => {
      const title = chk.textContent.trim();
      if (SKY_HELP[title]) attachElement(chk, title, SKY_HELP[title]);
    });
  }

  function attachColorScaleEditor() {
    attachPanelIntro('#colorScalePanel');
    document.querySelectorAll('#colorScalePanel .cse-tab').forEach((tab) => {
      const name = tab.textContent.trim();
      const body = COLOR_SCALE_TAB_HELP[name] || 'Color stops for the ' + name + ' display scale.';
      attachElement(tab, name + ' scale', body);
    });
    document.querySelectorAll('#colorScalePanel .cse-ctrl-btn, #colorScalePanel .cse-btn').forEach((btn) => {
      const label = btn.textContent.trim();
      const body = COLOR_SCALE_ACTION_HELP[label];
      if (body) attachElement(btn, label, body);
    });
    const interp = document.querySelector('#colorScalePanel .cse-opt-lbl');
    if (interp) attachElement(interp, 'Smooth this view', COLOR_SCALE_ACTION_HELP['Smooth this view']);
  }

  function attachKeybindEditor() {
    attachPanelIntro('#keybindPanel');
    const hint = document.querySelector('#keybindPanel .kbe-hint');
    if (hint) attachElement(hint, 'Keybind help', KEYBIND_HELP.panel);
  }

  function attachEntityMenu(menuEl, entityType) {
    if (!menuEl) return;
    menuEl.querySelectorAll('[data-ch-help]').forEach((el) => {
      const key = el.getAttribute('data-ch-help');
      const body = ENTITY_HELP[key];
      if (!body) return;
      const title = el.getAttribute('data-ch-title') || key;
      attachElement(el, title, body);
    });
  }

  const SOUNDING_SECTION_HELP = {
    'PARCEL & INSTABILITY': 'Energy available for updrafts — CAPE, inhibition, and parcel buoyancy metrics.',
    'LEVELS': 'Heights of key levels: cloud base (LCL), free convection (LFC), equilibrium (EL), and freezing.',
    'SHEAR': 'Wind change with height — critical for storm organization and supercells.',
    'STORM MOTION': 'Estimated storm motion vectors (Bunkers left/right, Corfidi up/downshear).',
    'STORM MODE': 'Best-fit storm type scores from the current sounding (pulse, multicell, supercell, etc.).',
    'HAZARDS': 'Estimated severe weather hazards for this atmospheric column.',
    'INDICES': 'Composite severe weather indices (STP, SCP, EHI, SHIP, etc.).',
    'OUTLOOK': 'Overall convective and fire risk summary.',
    'Similar Analogs': 'Real-world or custom soundings that most closely match the current profile.',
    'BALLOON SOUNDING': 'Observed profile from an active weather balloon at this column.',
  };

  const SOUNDING_METRIC_HELP = {
    'SBCAPE': 'Surface-based CAPE — buoyancy if a surface parcel is lifted. Higher values favor stronger updrafts.',
    'MLCAPE': 'Mixed-layer CAPE using the lowest ~100 hPa. Often more representative than surface-based.',
    'MUCAPE': 'Most-unstable CAPE from the level with the highest instability in the column.',
    '3CAPE': 'CAPE in the lowest 3 km — helpful for low-topped convection.',
    'SBCINH': 'Surface convective inhibition. Negative values mean the parcel must be forced upward.',
    'DCAPE': 'Downdraft CAPE — potential for cold, damaging downdrafts and microbursts.',
    'LI': 'Lifted Index. Negative values indicate instability; below −4 is strongly unstable.',
    'LCL': 'Lifting Condensation Level — cloud base height of a lifted parcel.',
    'LFC': 'Level of Free Convection — where a lifted parcel becomes warmer than the environment.',
    'EL': 'Equilibrium Level — top of the buoyant updraft.',
    'FZL': 'Freezing level altitude in the column.',
    'WBL': 'Wet-bulb zero level — where wet-bulb temperature reaches 0°C.',
    '0-1 km': 'Vertical wind shear in the lowest 1 km. Important for tornado potential with SRH.',
    '0-3 km': 'Deep-layer shear in the lowest 3 km — organizes multicells and supercells.',
    '0-6 km': 'Bulk shear through the troposphere — drives storm mode and longevity.',
    'Bulk': 'Bulk wind difference (here 0–6 km) — classic supercell shear metric.',
    'Bunkers R': 'Bunkers storm motion — right-moving supercell vector.',
    'Bunkers L': 'Bunkers storm motion — left-moving supercell vector.',
    'Corfidi DS': 'Corfidi downshear propagation vector for mesoscale convective systems.',
    'Corfidi US': 'Corfidi upshear propagation vector.',
    'Mode': 'Dominant predicted storm mode from sounding indices.',
    'Hail Size': 'Estimated maximum hail size from thermodynamics and moisture.',
    'Lightning': 'Estimated lightning flash rate based on storm electrification proxies.',
    'Damaging Winds': 'Probability of severe straight-line winds.',
    'Tornado Risk': 'Tornado hazard probability and categorical risk label.',
    'EHI': 'Energy-Helicity Index — combines CAPE and helicity for supercell tornado potential.',
    'STP (fixed)': 'Significant Tornado Parameter using fixed-layer ingredients.',
    'STP (eff.)': 'STP adjusted for local effective-layer shear and CAPE.',
    'SHIP': 'Significant Hail Parameter — large hail potential.',
    'SCP': 'Supercell Composite Parameter.',
    'Eff. SRH': 'Effective storm-relative helicity in the inflow layer.',
    '700-500 mb': 'Lapse rate between 700 and 500 mb — steep lapse aids hail growth.',
    'Risk': 'Overall convective outlook risk category.',
    'Fire': 'Wildfire weather risk from heat, dryness, and wind.',
    'Pulse TS': 'Short-lived pulse thunderstorm mode likelihood.',
    'Multicell': 'Classic multicell thunderstorm likelihood.',
    'LP Supercell': 'Low-precipitation supercell mode score.',
    'Classic SC': 'Classic supercell mode score.',
    'HP Supercell': 'High-precipitation supercell mode score.',
    'Squall Line': 'Quasi-linear convective system / squall line score.',
    'Derecho': 'Derecho or widespread damaging wind event score.',
  };

  const SOUNDING_CONTROL_HELP = {
    'soundingSaveBtn': { title: 'Save sounding', body: 'Freeze the current column and save it as a snapshot for later comparison or export.' },
    'soundingFreezeBtn': { title: 'Freeze column', body: 'Lock the skew-T to the current atmospheric column so it stops updating as the sim runs.' },
    'soundingShareImageBtn': { title: 'Share image', body: 'Export the skew-T dashboard as a PNG image.' },
    'soundingMetrics-tab-metrics': { title: 'Metrics tab', body: 'Thermodynamic and severe weather indices computed from the sampled column.' },
    'soundingMetrics-tab-analogs': { title: 'Analogs tab', body: 'Browse, create, and import sounding analogs to compare with the live profile.' },
    'soundingAnalogCreateBtn': { title: 'Create analog', body: 'Save the current sounding as a reusable analog in your library.' },
    'soundingAnalogImportBtn': { title: 'Import analog', body: 'Load an analog sounding from a JSON file.' },
    'soundingAnalogPasteBtn': { title: 'Paste analog', body: 'Paste analog JSON from the clipboard.' },
    'soundingAnalogExportAllBtn': { title: 'Export all analogs', body: 'Download your full custom analog library.' },
    'soundingAnalogSearch': { title: 'Search analogs', body: 'Filter the analog library by name, event, or hazard keywords.' },
    'togWindBarbs': { title: 'Wind barbs', body: 'Show wind direction and speed barbs on the skew-T.' },
    'togParcels': { title: 'Parcel paths', body: 'Draw lifted parcel traces (surface, mixed-layer, most-unstable).' },
    'togMixing': { title: 'Mixing ratio', body: 'Show lines of constant mixing ratio on the diagram.' },
    'togHeights': { title: 'Heights', body: 'Label pressure heights on the skew-T axes.' },
    'togThetaE': { title: 'θe column', body: 'Show equivalent potential temperature column alongside the sounding.' },
    'togLayoutEdit': { title: 'Customize layout', body: 'Drag and resize skew-T dashboard panels. Use Reset layout to restore defaults.' },
    'soundingLayoutResetBtn': { title: 'Reset layout', body: 'Restore the default skew-T dashboard panel positions and sizes.' },
    'soundingReadoutPanel': { title: 'Skew-T readout', body: 'Values at the cursor position on the diagram — temperature, dew point, wind, height.' },
    'soundingParcelPanel': { title: 'Parcel info', body: 'Surface parcel temperature, dew point, and lifted parcel diagnostics.' },
    'soundingControlsPanel': { title: 'Skew-T controls', body: 'Toggle overlays and customize the sounding dashboard layout.' },
  };

  const MULTIPLAYER_HELP = {
    'mpIntroText': { title: 'Multiplayer co-op', body: 'One player hosts the simulation; others join to paint and place tools in real time. Still work-in-progress — may be laggy, glitchy, or unplayable.' },
    'mpPlayerName': { title: 'Your name', body: 'Display name shown to other players in the room.' },
    'mpRoomCode': { title: 'Room code', body: 'Enter the 6-letter code from the host to join an existing game.' },
    'mpPlayOnlineBtn': { title: 'Open in browser', body: 'Open the GitHub Pages version of the game in your browser.' },
    'mpHostBtn': { title: 'Host game', body: 'Start a multiplayer room. You run the simulation; peers can paint and place objects per your permissions. Still work-in-progress.' },
    'mpJoinBtn': { title: 'Join game', body: 'Connect to a host using the room code. Requires the online or local server version.' },
    'mpLeaveBtn': { title: 'Leave', body: 'Disconnect from the current multiplayer session.' },
    'mpTestBtn': { title: 'Test connection', body: 'Verify that the relay server is reachable before hosting or joining.' },
    'mpCopyInviteLinkBtn': { title: 'Copy invite link', body: 'Copy a URL that opens the game and fills in the room code automatically.' },
    'mpCopyJoinInstructionsBtn': { title: 'Copy join instructions', body: 'Copy plain-text steps for friends to join your room.' },
    'mpRelayUrl': { title: 'Custom relay URL', body: 'Optional WebSocket relay address. Leave blank to use the same server as this page.' },
    'mpHudRoom': { title: 'Room HUD', body: 'Quick view of the active room code while playing.' },
    'mpHudRole': { title: 'Your role', body: 'Whether you are the host (runs simulation) or a peer (joins tools only).' },
    'mpHudPerms': { title: 'Permissions', body: 'What you are allowed to do in this session (paint, place, pause, settings).' },
    'mpHostMenuBtn': { title: 'Host menu', body: 'Open host controls to manage players and room settings during a session.' },
    'mpAdminRoomCode': { title: 'Host room code', body: 'Share this code so late joiners can enter the same simulation.' },
    'mpCopyCodeBtn': { title: 'Copy code', body: 'Copy the room code to the clipboard.' },
    'mpRerollCodeBtn': { title: 'New code', body: 'Generate a new room code (existing players may need to rejoin).' },
    'mpAdminPlayerList': { title: 'Player list', body: 'Connected peers and permission toggles for the host.' },
  };

  const WEATHER_STATION_HELP = {
    icon: {
      title: 'Weather station',
      body: 'Live conditions at this point. Left-click toggles the history chart (day/night cycle on). Right-click toggles solar/IR flux on the chart. Use the station tool + click to remove.',
    },
    chart: {
      title: 'Station history chart',
      body: 'Time series of temperature, dew point, wind, and more. Click legend items to show or hide datasets. Stores up to 24 hours while the day/night cycle runs.',
    },
    'Temperature': 'Air temperature at the station over time.',
    'Dew Point': 'Dew point temperature — moisture content of the air.',
    'Wind Speed': 'Wind speed measured at the station.',
    'Air Quality': 'Smoke/dust air quality index proxy.',
    'Precipitation': 'Soil moisture proxy when the station is over land.',
    'Snow Height': 'Snow depth on the ground at the station.',
    'Water Temperature': 'Lake or sea surface temperature when the station is over water.',
  };

  function attachById(id, fallbackTitle, fallbackBody) {
    const el = document.getElementById(id);
    if (!el) return;
    const mapEntry = SOUNDING_CONTROL_HELP[id] || MULTIPLAYER_HELP[id];
    const title = mapEntry ? mapEntry.title : (fallbackTitle || id);
    const body = mapEntry ? mapEntry.body : fallbackBody;
    if (body) attachElement(el, title, body);
  }

  function attachSoundingMetrics() {
    document.querySelectorAll('#soundingMetricsBody .sounding-metrics-section').forEach((el) => {
      const title = el.textContent.trim();
      const body = SOUNDING_SECTION_HELP[title];
      if (body) attachElement(el, title, body);
    });
    document.querySelectorAll('#soundingMetricsBody .sounding-metrics-row').forEach((row) => {
      const lbl = row.querySelector('.lbl');
      if (!lbl) return;
      const title = lbl.textContent.trim();
      const body = SOUNDING_METRIC_HELP[title];
      if (body) attachElement(row, title, body);
    });
    document.querySelectorAll('#soundingMetricsBody .sounding-metrics-bar, #soundingMetricsSimilarList .sounding-metrics-bar').forEach((bar) => {
      const nameEl = bar.querySelector('.name');
      if (!nameEl) return;
      const title = nameEl.textContent.trim();
      const body = SOUNDING_METRIC_HELP[title] || SOUNDING_METRIC_HELP[title.replace(' SC', ' Supercell')];
      if (body) attachElement(bar, title, body);
    });
    document.querySelectorAll('#soundingMetricsSimilarBlock .sounding-metrics-section').forEach((el) => {
      const title = el.textContent.trim();
      const body = SOUNDING_SECTION_HELP[title];
      if (body) attachElement(el, title, body);
    });
  }

  function attachSoundingDashboard() {
    const dash = document.getElementById('soundingDashboard');
    if (!dash) return;
    const hdr = dash.querySelector('.sounding-header');
    if (hdr) {
      attachElement(hdr, 'Sounding dashboard',
        'Skew-T diagram with thermodynamic metrics, hazard scores, and analog matching for the sampled column.');
    }
    Object.keys(SOUNDING_CONTROL_HELP).forEach((id) => attachById(id));
    document.querySelectorAll('.sounding-metrics-tab').forEach((tab) => {
      const key = 'soundingMetrics-tab-' + tab.dataset.tab;
      const info = SOUNDING_CONTROL_HELP[key];
      if (info) attachElement(tab, info.title, info.body);
    });
    document.querySelectorAll('#soundingMetricsAnalogSource button').forEach((btn) => {
      const src = btn.dataset.analogSource || btn.textContent.trim().toLowerCase();
      attachElement(btn, 'Analog source: ' + btn.textContent.trim(),
        src === 'builtin' ? 'Show only real-world historical analog soundings.'
          : src === 'custom' ? 'Show only user-created analog soundings.'
            : 'Show all matching analog soundings.');
    });
    document.querySelectorAll('#soundingAnalogSourceFilters button, #soundingAnalogFilters button').forEach((btn) => {
      attachElement(btn, 'Filter: ' + btn.textContent.trim(),
        'Narrow the analog library list by source type or hazard category.');
    });
    attachSoundingMetrics();
  }

  function attachMultiplayerPanels() {
    const introPanel = document.getElementById('multiplayerPanel');
    if (introPanel) {
      attachElement(introPanel.querySelector('h2'), 'Multiplayer co-op', MULTIPLAYER_HELP.mpIntroText.body);
    }
    Object.keys(MULTIPLAYER_HELP).forEach((id) => {
      if (id === 'mpIntroText') return;
      attachById(id);
    });
    const hud = document.getElementById('multiplayerHud');
    if (hud) {
      attachElement(hud, 'Session HUD', 'Live multiplayer status while the simulation is running.');
    }
    const admin = document.getElementById('multiplayerAdminPanel');
    if (admin) {
      attachElement(admin, 'Host controls', 'Manage room code, connected players, and peer permissions.');
    }
  }

  function registerWeatherStationChart(chartCanvas, iconCanvas) {
    if (iconCanvas) {
      attachElement(iconCanvas, WEATHER_STATION_HELP.icon.title, WEATHER_STATION_HELP.icon.body);
    }
    if (chartCanvas) {
      attachElement(chartCanvas, WEATHER_STATION_HELP.chart.title, WEATHER_STATION_HELP.chart.body);
    }
  }

  function attachCustomPanels() {
    attachSkyEditor();
    attachColorScaleEditor();
    attachKeybindEditor();
    attachUserInteractionEditor();
    attachSoundingDashboard();
    attachMultiplayerPanels();
  }

  function registerEntityMenu(menuEl) {
    attachEntityMenu(menuEl);
  }

  function attachDatGui(datGui) {
    if (!datGui) return;
    walkFolder(datGui);
    refreshVisibility();
  }

  function init(guiControlsRef) {
    controls = guiControlsRef;
    ensurePanel();
    // Prefer the value from guiControls (includes save-file restores); fall back to localStorage.
    const showHelp = (controls && controls.showControlHelp !== undefined)
      ? !!controls.showControlHelp
      : loadShowControlHelpPreference();
    applyShowControlHelp(showHelp);
    if (controls.tool)
      lastTool = controls.tool;
    showTool(controls.tool || 'TOOL_NONE');
  }

  function onToolChanged(tool) {
    lastTool = tool;
    if (!hoverKey)
      showTool(tool);
  }

  function setEnabled(on) {
    enabled = on;
    if (!on) {
      ensurePanel();
      panelEl.classList.remove('visible');
    } else if (!hoverKey) {
      showTool(lastTool || (controls && controls.tool) || 'TOOL_NONE');
    }
    refreshVisibility();
  }

  return {
    TOOL_HELP,
    SETTING_HELP,
    init,
    attachDatGui,
    attachCustomPanels,
    attachSoundingDashboard,
    attachSoundingMetrics,
    attachMultiplayerPanels,
    registerWeatherStationChart,
    registerEntityMenu,
    attachElement,
    onToolChanged,
    setEnabled,
    refresh: refreshVisibility,
    loadShowControlHelpPreference,
    applyShowControlHelp,
    initIntroHelpToggle,
  };
})();

if (typeof window !== 'undefined') {
  window.ControlHelp = ControlHelp;
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function() { ControlHelp.initIntroHelpToggle(); });
  else
    ControlHelp.initIntroHelpToggle();
}
