// Rendering-only cloud appearance helpers.
// Reads simulation cloud/moisture data — never writes back to simulation textures.
//
// Design: opacity gets photographic silhouette detail; albedo stays a neutral
// reflectance that the existing finalLight pass in main() lights correctly.
// Requires uniforms from the including display shader:
//   noiseTex, waterTex, texelSize, resolution, visualQuality, iterNum,
//   cloudShadowStrength, sunAngle, sunAzimuth, view

// Multi-octave FBM from baked noiseTex. LOD-gated for performance.
float cloudVisualFBM(vec2 worldPos, float time, float quality)
{
  vec2 uv = worldPos * vec2(0.0028, 0.0032) + vec2(time * 0.00045, time * 0.00032);
  float n0 = texture(noiseTex, uv * 0.10 + 0.21).r;
  float n1 = texture(noiseTex, uv * 0.38 + 4.13).r;
  float n2 = quality >= 0.55 ? texture(noiseTex, uv * 1.10 + 8.47).r : n1;
  float n3 = quality >= 0.70 ? texture(noiseTex, uv * 2.40 + 12.9).r : n2;
  float n4 = quality >= 0.85 ? texture(noiseTex, uv * 5.10 + 21.3).r : n3;
  return n0 * 0.42 + n1 * 0.28 + n2 * 0.16 + n3 * 0.09 + n4 * 0.05;
}

// Ridged FBM for cauliflower / billow lobes (1 - |2n-1| style).
float cloudVisualRidge(vec2 worldPos, float time, float quality)
{
  float n = cloudVisualFBM(worldPos * 1.35 + 9.1, time * 0.9, quality);
  return 1.0 - abs(n * 2.0 - 1.0);
}

// High-frequency edge/wisp breakup (small scale only).
float cloudVisualMicroNoise(vec2 worldPos, float time, float quality)
{
  if (quality < 0.45)
    return 0.5;
  vec2 uv = worldPos * vec2(0.014, 0.016) + vec2(time * 0.0012, -time * 0.0010);
  float n = texture(noiseTex, uv * 3.8 + 19.7).r;
  if (quality >= 0.65)
    n = n * 0.55 + texture(noiseTex, uv * 8.5 + 31.2).r * 0.45;
  if (quality >= 0.85)
    n = n * 0.70 + texture(noiseTex, uv * 16.0 + 44.1).r * 0.30;
  return n;
}

// Domain-warped sample: large noise displaces UV before medium detail (render-only).
vec2 cloudVisualWarp(vec2 worldPos, float time, float quality)
{
  float wx = cloudVisualFBM(worldPos * 0.55 + 3.7, time * 0.7, quality);
  float wy = cloudVisualFBM(worldPos * 0.55 + 11.2, time * 0.65, quality);
  float amp = mix(8.0, 22.0, clamp(quality, 0.0, 1.0));
  return worldPos + vec2(wx - 0.5, wy - 0.5) * amp;
}

// Wide-kernel smooth density gradient — avoids per-cell stair-steps.
vec2 cloudVisualSmoothGradient(vec2 cloudUV, float quality)
{
  if (quality < 0.35)
    return vec2(0.0);

  vec2 px = texelSize * mix(2.0, 3.8, quality);
  float l = smoothCloudWater(waterTex, cloudUV - vec2(px.x, 0.0), resolution);
  float r = smoothCloudWater(waterTex, cloudUV + vec2(px.x, 0.0), resolution);
  float d = smoothCloudWater(waterTex, cloudUV - vec2(0.0, px.y), resolution);
  float u = smoothCloudWater(waterTex, cloudUV + vec2(0.0, px.y), resolution);
  return vec2(r - l, u - d);
}

// Screen-space self-shadow: march toward the sun through read-only cloud water.
// Returns 0 (fully lit) .. 1 (deep interior occlusion). Never writes sim data.
float cloudVisualSelfShadow(vec2 cloudUV, vec2 sunDir2D, float localDensity, float quality)
{
  if (quality < 0.40 || localDensity < 0.015)
    return 0.0;

  vec2 dir = sunDir2D;
  float dirLen = length(dir);
  if (dirLen < 1e-5)
    return 0.0;
  dir /= dirLen;

  int taps = quality >= 0.70 ? 5 : (quality >= 0.50 ? 4 : 3);
  float stepPx = mix(1.6, 2.8, clamp(quality, 0.0, 1.0));
  vec2 stepUV = dir * texelSize * stepPx;

  float opticalDepth = 0.0;
  vec2 p = cloudUV;
  for (int i = 1; i <= 5; i++) {
    if (i > taps)
      break;
    p += stepUV;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0)
      break;
    float d = smoothCloudWater(waterTex, p, resolution);
    float w = max(d - 0.03, 0.0) * (1.0 - float(i - 1) * 0.10);
    opticalDepth += w;
  }

  float shadow = 1.0 - exp(-opticalDepth * 3.6);
  return clamp(shadow * smoothstep(0.03, 0.30, localDensity), 0.0, 1.0);
}

struct CloudVisualShading {
  float visualWeight;
  float opacity;
  vec3 albedo;
  float edgeGlow;
  float rayBreak;
  float internalShadow;
  float baseShade;
  float topHighlight;
};

CloudVisualShading shadeRealisticCloud(
  float cloudwater,
  float precip,
  float lit,
  float dayMask,
  float localSunAng,
  vec2 cloudUV,
  vec2 worldPos,
  float densScale,
  float soft,
  vec3 brightTint,
  vec3 darkTint,
  vec2 verticalCloudGrad)
{
  CloudVisualShading outShade;
  outShade.edgeGlow = 0.0;
  outShade.rayBreak = 0.0;
  outShade.internalShadow = 0.0;
  outShade.baseShade = 0.0;
  outShade.topHighlight = 0.0;

  float q = clamp(visualQuality, 0.0, 1.0);
  float ds = max(densScale, 0.01);

  // Hermite-smoothed density for shape work (read-only).
  float smoothD = smoothCloudWater(waterTex, cloudUV, resolution);
  float presence = smoothstep(0.006, 0.18, max(smoothD, cloudwater));

  // --- Multi-scale procedural detail (render-only; never feeds back into sim) ---
  vec2 warped = cloudVisualWarp(worldPos, iterNum, q);
  float fbmLarge = cloudVisualFBM(warped, iterNum, q);
  float fbmMed = cloudVisualFBM(warped * 1.85 + 17.3, iterNum * 0.82, q);
  float fbmRidge = cloudVisualRidge(warped * 1.15 + 5.5, iterNum * 0.75, q);
  float fbmSmall = cloudVisualMicroNoise(warped, iterNum, q);

  // Large silhouette + medium lobes + ridged cauliflower + fine breakup.
  float shapeDetail = fbmLarge * 0.38 + fbmMed * 0.28 + fbmRidge * 0.22 + fbmSmall * 0.12;

  // Stronger boundary erosion/dilation for irregular cumulus silhouettes.
  float edgeBreak = (shapeDetail - 0.48) * 0.34 * presence;
  // Extra lobe push from ridged noise near edges of presence.
  float lobePush = (fbmRidge - 0.45) * 0.14 * presence * (1.0 - smoothstep(0.55, 0.95, presence));
  float visualDensity = max(mix(cloudwater, smoothD, 0.68) + edgeBreak + lobePush, 0.0);

  // Interior texture: stronger mottling inside the body (albedo/opacity path only).
  float interiorAmt = smoothstep(0.06, 0.50, visualDensity) * (1.0 - smoothstep(0.72, 0.98, visualDensity));
  float interiorTex = ((fbmMed - 0.5) * 0.12 + (fbmRidge - 0.5) * 0.08) * interiorAmt * presence;
  visualDensity = max(visualDensity + interiorTex, 0.0);

  float cloudWeight = max(visualDensity * 13.6 * ds, 0.0);
  outShade.visualWeight = cloudWeight;

  float opacity = clamp(1.0 - (1.0 / (1.0 + cloudWeight)), 0.0, 1.0);
  opacity = pow(opacity, 1.0 / clamp(soft, 0.15, 2.5));
  // Stronger edge/wisp breakup — makes soft blobs read as structured clouds.
  float edgePresence = presence * (1.0 - smoothstep(0.40, 0.92, opacity));
  float wispBreak = (fbmSmall - 0.5) * 0.22 * edgePresence
    + (fbmRidge - 0.5) * 0.10 * edgePresence;
  opacity = clamp(opacity + wispBreak, 0.0, 1.0);
  outShade.opacity = opacity;

  // Neutral cloud reflectance — meant to be lit by finalLight in main().
  // Slightly lower dense albedo so interiors can go charcoal-blue under shadow.
  vec3 baseAlbedo = vec3(1.0 / (visualDensity * 0.0055 + 1.0)) * brightTint;

  // Interior albedo grain (photographic mottling).
  float mottling = ((fbmMed - 0.5) * 0.14 + (fbmSmall - 0.5) * 0.06) * interiorAmt * dayMask;
  baseAlbedo *= (1.0 + mottling);

  float thickMask = smoothstep(0.25, 0.82, opacity);
  float litSmooth = smoothstep(0.03, 0.22, lit);

  // Primary shadow from the existing sunlight field.
  float inShadow = (1.0 - litSmooth) * thickMask;
  vec3 albedo = mix(baseAlbedo, baseAlbedo * darkTint, inShadow * cloudShadowStrength);

  // Self-shadow / light attenuation through dense interiors.
  vec2 sunDir2D = sunlightDirection(sunAngle, sunAzimuth);
  float selfShadow = cloudVisualSelfShadow(cloudUV, sunDir2D, visualDensity, q);
  outShade.internalShadow = selfShadow;
  float selfAmt = selfShadow * thickMask * mix(0.42, 0.82, cloudShadowStrength);
  albedo = mix(albedo, albedo * mix(darkTint, vec3(0.38, 0.44, 0.58), 0.50), selfAmt);

  // Storm core: deep blue-gray / charcoal — never pure black.
  float stormCore = max(inShadow, selfShadow * 0.90) * smoothstep(0.10, 0.58, visualDensity) * thickMask;
  vec3 stormTint = mix(darkTint, vec3(0.36, 0.42, 0.55), 0.48);
  albedo = mix(albedo, baseAlbedo * stormTint, stormCore * 0.55);

  // --- Cloud base / convective tower / anvil from sim vertical structure ---
  vec2 grad = cloudVisualSmoothGradient(cloudUV, q);
  float vertGrad = verticalCloudGrad.y;
  if (abs(vertGrad) < 1e-6)
    vertGrad = grad.y;

  // Base darkening: cooler, darker bases.
  float baseShade = smoothstep(0.0, -0.035, -vertGrad) * smoothstep(0.04, 0.38, visualDensity) * thickMask;
  float lowInColumn = 1.0 - smoothstep(0.12, 0.52, cloudUV.y);
  baseShade *= mix(0.40, 1.0, lowInColumn);
  outShade.baseShade = baseShade;
  vec3 baseCool = vec3(0.44, 0.50, 0.64);
  albedo = mix(albedo, albedo * mix(darkTint, baseCool, 0.60), baseShade * 0.65);

  // Tower brightening: sunlit convective tops.
  float tower = smoothstep(0.006, 0.048, vertGrad)
    * smoothstep(0.05, 0.45, visualDensity)
    * litSmooth * dayMask;
  // Ridged noise boosts cauliflower brightness on towers.
  tower *= mix(0.75, 1.25, fbmRidge);
  outShade.topHighlight = tower;
  albedo = mix(albedo, baseAlbedo * vec3(1.12, 1.08, 0.98), tower * 0.48);

  // Anvil hint: dense cloud aloft with precip → flatter, cooler upper deck.
  float anvil = smoothstep(0.18, 0.52, visualDensity)
    * smoothstep(0.02, 0.22, precip)
    * smoothstep(0.32, 0.72, cloudUV.y)
    * dayMask;
  float anvilLum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(albedo, mix(vec3(anvilLum), albedo * vec3(0.90, 0.93, 1.02), 0.50), anvil * 0.40);

  // Edge volumetric accents (silver lining, convection, god-ray breaks).
  float gradMag = length(grad);
  float atEdge = smoothstep(0.004, 0.032, gradMag) * (1.0 - opacity * 0.40);
  // Noise-modulated edge so rims aren't uniform.
  atEdge *= mix(0.70, 1.30, fbmSmall);

  float absSun = abs(localSunAng);
  float sunsetWarm = clamp(map_range(absSun, 70.0 * deg2rad, 92.0 * deg2rad, 0.0, 1.0), 0.0, 1.0);
  sunsetWarm *= (1.0 - clamp(map_range(absSun, 92.0 * deg2rad, 100.0 * deg2rad, 0.0, 1.0), 0.0, 1.0));
  vec3 rimTint = mix(vec3(0.28, 0.26, 0.20), vec3(0.48, 0.32, 0.14), sunsetWarm);

  if (atEdge > 0.0005 && presence > 0.015) {
    vec3 sunDir3 = normalize(vec3(sunDir2D.x, sunDir2D.y, 0.50));
    vec3 normal = normalize(vec3(-grad.x * 3.6, -grad.y * 3.6, 1.0));
    float ndotl = clamp(dot(normal, sunDir3), 0.0, 1.0);

    // Stronger silver lining at sun-facing rims.
    float rim = atEdge * pow(ndotl, 1.8) * litSmooth * dayMask;
    albedo += rimTint * rim * brightTint * 1.35;
    outShade.edgeGlow = rim;

    float convection = smoothstep(0.006, 0.042, vertGrad)
      * smoothstep(0.05, 0.40, visualDensity) * atEdge;
    albedo = mix(albedo, baseAlbedo * vec3(1.10, 1.06, 0.96), convection * litSmooth * 0.40);

    outShade.rayBreak = atEdge * litSmooth * (1.0 - smoothstep(0.35, 0.85, opacity)) * dayMask
      * mix(0.55, 0.90, sunsetWarm);
  }

  // Atmospheric perspective: high clouds softer/bluer; zoomed-out views desaturate.
  float zoomNorm = clamp(view[2] / max(resolution.x, 1.0), 0.0, 1.0);
  float farView = 1.0 - smoothstep(0.0015, 0.012, zoomNorm);
  float atmosAmt = smoothstep(0.12, 0.88, cloudUV.y) * (1.0 - opacity * 0.35) * dayMask * 0.34;
  atmosAmt = clamp(atmosAmt + farView * 0.26 * (1.0 - opacity * 0.25), 0.0, 0.68);
  vec3 atmosTint = vec3(0.70, 0.76, 0.88);
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float satKeep = mix(0.82, 0.58, farView);
  albedo = mix(albedo, mix(vec3(lum), albedo, satKeep) + atmosTint * 0.10, atmosAmt);

  outShade.albedo = clamp(albedo, 0.0, 1.45);
  return outShade;
}
