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
  return n0 * 0.50 + n1 * 0.30 + n2 * 0.14 + n3 * 0.06;
}

// High-frequency edge/wisp breakup (small scale only).
float cloudVisualMicroNoise(vec2 worldPos, float time, float quality)
{
  if (quality < 0.55)
    return 0.5;
  vec2 uv = worldPos * vec2(0.011, 0.013) + vec2(time * 0.0011, -time * 0.0009);
  float n = texture(noiseTex, uv * 3.4 + 19.7).r;
  if (quality >= 0.70)
    n = n * 0.65 + texture(noiseTex, uv * 7.2 + 31.2).r * 0.35;
  return n;
}

// Wide-kernel smooth density gradient — avoids per-cell stair-steps.
vec2 cloudVisualSmoothGradient(vec2 cloudUV, float quality)
{
  if (quality < 0.40)
    return vec2(0.0);

  vec2 px = texelSize * mix(2.5, 4.0, quality);
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
  if (quality < 0.45 || localDensity < 0.02)
    return 0.0;

  vec2 dir = sunDir2D;
  float dirLen = length(dir);
  if (dirLen < 1e-5)
    return 0.0;
  dir /= dirLen;

  // Step toward the sun (into incoming light) so denser material above/beside darkens interiors.
  int taps = quality >= 0.70 ? 5 : 3;
  float stepPx = mix(1.8, 2.6, clamp(quality, 0.0, 1.0));
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
    // Weight nearer samples more; thin wisps contribute little.
    float w = max(d - 0.04, 0.0) * (1.0 - float(i - 1) * 0.12);
    opticalDepth += w;
  }

  float shadow = 1.0 - exp(-opticalDepth * 2.8);
  return clamp(shadow * smoothstep(0.04, 0.35, localDensity), 0.0, 1.0);
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
  float presence = smoothstep(0.008, 0.22, max(smoothD, cloudwater));

  // --- Multi-scale procedural detail (render-only; never feeds back into sim) ---
  // Large: silhouette irregularity
  float fbmLarge = cloudVisualFBM(worldPos, iterNum, q);
  // Medium: lobe / internal structure
  float fbmMed = cloudVisualFBM(worldPos * 1.65 + 17.3, iterNum * 0.82, q);
  // Small: edge breakup
  float fbmSmall = cloudVisualMicroNoise(worldPos, iterNum, q);

  float shapeDetail = fbmLarge * 0.52 + fbmMed * 0.36 + fbmSmall * 0.12;

  // Soft boundary erosion/dilation for cumulus lobes (not harsh thresholding).
  float edgeBreak = (shapeDetail - 0.5) * 0.18 * presence;
  float visualDensity = max(mix(cloudwater, smoothD, 0.72) + edgeBreak, 0.0);

  // Interior texture: modulate density slightly inside the body (albedo path only).
  float interiorAmt = smoothstep(0.08, 0.55, visualDensity) * (1.0 - smoothstep(0.75, 0.98, visualDensity));
  float interiorTex = (fbmMed - 0.5) * 0.07 * interiorAmt * presence;
  visualDensity = max(visualDensity + interiorTex, 0.0);

  float cloudWeight = max(visualDensity * 13.6 * ds, 0.0);
  outShade.visualWeight = cloudWeight;

  float opacity = clamp(1.0 - (1.0 / (1.0 + cloudWeight)), 0.0, 1.0);
  opacity = pow(opacity, 1.0 / clamp(soft, 0.15, 2.5));
  // Small-scale opacity breakup on thin edges / wisps only.
  float wispBreak = (fbmSmall - 0.5) * 0.12 * presence * (1.0 - smoothstep(0.35, 0.85, opacity));
  opacity = clamp(opacity + wispBreak, 0.0, 1.0);
  outShade.opacity = opacity;

  // Neutral cloud reflectance — meant to be lit by finalLight in main().
  vec3 baseAlbedo = vec3(1.0 / (visualDensity * 0.0042 + 1.0)) * brightTint;

  // Subtle interior albedo grain (photographic mottling, not cartoon blobs).
  float mottling = (fbmMed - 0.5) * 0.08 * interiorAmt * dayMask;
  baseAlbedo *= (1.0 + mottling);

  float thickMask = smoothstep(0.30, 0.85, opacity);
  float litSmooth = smoothstep(0.03, 0.22, lit);

  // Primary shadow from the existing sunlight field (smooth, no horizontal banding).
  float inShadow = (1.0 - litSmooth) * thickMask;
  vec3 albedo = mix(baseAlbedo, baseAlbedo * darkTint, inShadow * cloudShadowStrength);

  // Self-shadow / light attenuation through dense interiors (render-only march).
  vec2 sunDir2D = sunlightDirection(sunAngle, sunAzimuth);
  float selfShadow = cloudVisualSelfShadow(cloudUV, sunDir2D, visualDensity, q);
  outShade.internalShadow = selfShadow;
  float selfAmt = selfShadow * thickMask * mix(0.35, 0.72, cloudShadowStrength);
  albedo = mix(albedo, albedo * mix(darkTint, vec3(0.42, 0.48, 0.62), 0.45), selfAmt);

  // Storm core: deep blue-gray in dense shadow — moderate, not crushed black.
  float stormCore = max(inShadow, selfShadow * 0.85) * smoothstep(0.12, 0.65, visualDensity) * thickMask;
  vec3 stormTint = mix(darkTint, vec3(0.42, 0.48, 0.60), 0.40);
  albedo = mix(albedo, baseAlbedo * stormTint, stormCore * 0.45);

  // --- Cloud base / convective tower / anvil from sim vertical structure ---
  // Prefer caller-provided vertical gradient; fall back to smooth kernel.
  vec2 grad = cloudVisualSmoothGradient(cloudUV, q);
  float vertGrad = verticalCloudGrad.y;
  if (abs(vertGrad) < 1e-6)
    vertGrad = grad.y;

  // Base darkening: density decreases downward (cool, darker bases).
  float baseShade = smoothstep(0.0, -0.04, -vertGrad) * smoothstep(0.05, 0.40, visualDensity) * thickMask;
  // Prefer lower portion of the cloud column (sim UV y is height).
  float lowInColumn = 1.0 - smoothstep(0.15, 0.55, cloudUV.y);
  baseShade *= mix(0.35, 1.0, lowInColumn);
  outShade.baseShade = baseShade;
  vec3 baseCool = vec3(0.48, 0.54, 0.68);
  albedo = mix(albedo, albedo * mix(darkTint, baseCool, 0.55), baseShade * 0.55);

  // Tower brightening: density grows upward → sunlit convective tops.
  float tower = smoothstep(0.008, 0.050, vertGrad)
    * smoothstep(0.06, 0.48, visualDensity)
    * litSmooth * dayMask;
  outShade.topHighlight = tower;
  albedo = mix(albedo, baseAlbedo * vec3(1.08, 1.05, 0.98), tower * 0.38);

  // Anvil hint: dense cloud aloft with precip shaft → flatter, cooler upper deck.
  float anvil = smoothstep(0.20, 0.55, visualDensity)
    * smoothstep(0.02, 0.25, precip)
    * smoothstep(0.35, 0.75, cloudUV.y)
    * dayMask;
  float anvilLum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(albedo, mix(vec3(anvilLum), albedo * vec3(0.92, 0.94, 1.02), 0.55), anvil * 0.35);

  // Edge volumetric accents (silver lining, localized convection, god-ray breaks).
  float gradMag = length(grad);
  float atEdge = smoothstep(0.006, 0.035, gradMag) * (1.0 - opacity * 0.45);

  // Sunset warmth on rims from local solar zenith.
  float absSun = abs(localSunAng);
  float sunsetWarm = clamp(map_range(absSun, 70.0 * deg2rad, 92.0 * deg2rad, 0.0, 1.0), 0.0, 1.0);
  sunsetWarm *= (1.0 - clamp(map_range(absSun, 92.0 * deg2rad, 100.0 * deg2rad, 0.0, 1.0), 0.0, 1.0));
  vec3 rimTint = mix(vec3(0.22, 0.20, 0.16), vec3(0.42, 0.28, 0.14), sunsetWarm);

  if (atEdge > 0.001 && presence > 0.02) {
    // 3D-ish normal from density gradient; sun from real sim sun direction.
    vec3 sunDir3 = normalize(vec3(sunDir2D.x, sunDir2D.y, 0.55));
    vec3 normal = normalize(vec3(-grad.x * 3.2, -grad.y * 3.2, 1.0));
    float ndotl = clamp(dot(normal, sunDir3), 0.0, 1.0);

    // Silver lining at sun-facing cloud rims.
    float rim = atEdge * pow(ndotl, 2.2) * litSmooth * dayMask;
    albedo += rimTint * rim * brightTint;
    outShade.edgeGlow = rim;

    // Extra convective accent on edges with upward growth.
    float convection = smoothstep(0.008, 0.045, vertGrad)
      * smoothstep(0.06, 0.42, visualDensity) * atEdge;
    albedo = mix(albedo, baseAlbedo * vec3(1.06, 1.04, 0.97), convection * litSmooth * 0.32);

    // God-ray break at thin sunlit gaps.
    outShade.rayBreak = atEdge * litSmooth * (1.0 - smoothstep(0.40, 0.88, opacity)) * dayMask
      * mix(0.45, 0.75, sunsetWarm);
  }

  // Atmospheric perspective: high clouds softer/bluer; zoomed-out views desaturate.
  float zoomNorm = clamp(view[2] / max(resolution.x, 1.0), 0.0, 1.0);
  float farView = 1.0 - smoothstep(0.0015, 0.012, zoomNorm);
  float atmosAmt = smoothstep(0.12, 0.88, cloudUV.y) * (1.0 - opacity * 0.35) * dayMask * 0.38;
  atmosAmt = clamp(atmosAmt + farView * 0.28 * (1.0 - opacity * 0.25), 0.0, 0.72);
  vec3 atmosTint = vec3(0.70, 0.76, 0.88);
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  float satKeep = mix(0.80, 0.55, farView);
  albedo = mix(albedo, mix(vec3(lum), albedo, satKeep) + atmosTint * 0.12, atmosAmt);

  outShade.albedo = clamp(albedo, 0.0, 1.40);
  return outShade;
}
