// Rendering-only cloud appearance helpers.
// Reads simulation cloud/moisture data — never writes back to simulation textures.
//
// Design: opacity gets photographic silhouette detail; albedo stays a neutral
// reflectance that the existing finalLight pass in main() lights correctly.

float cloudVisualFBM(vec2 worldPos, float time, float quality)
{
  vec2 uv = worldPos * vec2(0.0028, 0.0032) + vec2(time * 0.00045, time * 0.00032);
  float n0 = texture(noiseTex, uv * 0.10 + 0.21).r;
  float n1 = texture(noiseTex, uv * 0.38 + 4.13).r;
  float n2 = quality >= 0.55 ? texture(noiseTex, uv * 1.10 + 8.47).r : n1;
  float n3 = quality >= 0.70 ? texture(noiseTex, uv * 2.40 + 12.9).r : n2;
  return n0 * 0.50 + n1 * 0.30 + n2 * 0.14 + n3 * 0.06;
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

struct CloudVisualShading {
  float visualWeight;
  float opacity;
  vec3 albedo;
  float edgeGlow;
  float rayBreak;
};

CloudVisualShading shadeRealisticCloud(
  float cloudwater,
  float precip,
  float lit,
  float dayMask,
  vec2 cloudUV,
  vec2 worldPos,
  float densScale,
  float soft,
  vec3 brightTint,
  vec3 darkTint)
{
  CloudVisualShading outShade;
  outShade.edgeGlow = 0.0;
  outShade.rayBreak = 0.0;

  float q = clamp(visualQuality, 0.0, 1.0);
  float ds = max(densScale, 0.01);

  // Hermite-smoothed density for shape work (read-only).
  float smoothD = smoothCloudWater(waterTex, cloudUV, resolution);
  float presence = smoothstep(0.008, 0.22, max(smoothD, cloudwater));

  // Multi-scale procedural silhouette — modulates visual density only.
  float fbmA = cloudVisualFBM(worldPos, iterNum, q);
  float fbmB = cloudVisualFBM(worldPos * 1.65 + 17.3, iterNum * 0.82, q);
  float shapeDetail = fbmA * 0.58 + fbmB * 0.42;

  // Soft boundary erosion/dilation for cumulus lobes (not harsh thresholding).
  float edgeBreak = (shapeDetail - 0.5) * 0.11 * presence;
  float visualDensity = max(mix(cloudwater, smoothD, 0.72) + edgeBreak, 0.0);

  float cloudWeight = max(visualDensity * 13.6 * ds, 0.0);
  outShade.visualWeight = cloudWeight;

  float opacity = clamp(1.0 - (1.0 / (1.0 + cloudWeight)), 0.0, 1.0);
  opacity = pow(opacity, 1.0 / clamp(soft, 0.15, 2.5));
  outShade.opacity = opacity;

  // Neutral cloud reflectance — meant to be lit by finalLight in main().
  vec3 baseAlbedo = vec3(1.0 / (visualDensity * 0.0042 + 1.0)) * brightTint;

  float thickMask = smoothstep(0.30, 0.85, opacity);
  float litSmooth = smoothstep(0.03, 0.22, lit);

  // Primary shadow from the existing sunlight field (smooth, no horizontal banding).
  float inShadow = (1.0 - litSmooth) * thickMask;
  vec3 albedo = mix(baseAlbedo, baseAlbedo * darkTint, inShadow * cloudShadowStrength);

  // Storm core: deep blue-gray in dense shadow — moderate, not crushed black.
  float stormCore = inShadow * smoothstep(0.12, 0.65, visualDensity) * thickMask;
  vec3 stormTint = mix(darkTint, vec3(0.50, 0.56, 0.68), 0.35);
  albedo = mix(albedo, baseAlbedo * stormTint, stormCore * 0.40);

  // Edge-only volumetric accents (avoids horizontal banding in uniform cloud layers).
  vec2 grad = cloudVisualSmoothGradient(cloudUV, q);
  float gradMag = length(grad);
  float atEdge = smoothstep(0.006, 0.035, gradMag) * (1.0 - opacity * 0.45);

  if (atEdge > 0.001 && presence > 0.02) {
    vec3 sunDir = normalize(vec3(0.22, 0.88, 0.42));
    vec3 normal = normalize(vec3(-grad.x * 3.2, -grad.y * 3.2, 1.0));
    float ndotl = clamp(dot(normal, sunDir), 0.0, 1.0);

    // Silver lining at sun-facing cloud rims.
    float rim = atEdge * pow(ndotl, 2.2) * litSmooth * dayMask;
    albedo += vec3(0.22, 0.20, 0.16) * rim * brightTint;
    outShade.edgeGlow = rim;

    // Convective tower brightening where sim density grows upward (localized to edges).
    float vertGrowth = grad.y;
    float convection = smoothstep(0.008, 0.045, vertGrowth)
      * smoothstep(0.06, 0.42, visualDensity) * atEdge;
    albedo = mix(albedo, baseAlbedo * vec3(1.05, 1.03, 0.97), convection * litSmooth * 0.30);

    // God-ray break at thin sunlit gaps.
    outShade.rayBreak = atEdge * litSmooth * (1.0 - smoothstep(0.45, 0.90, opacity)) * dayMask * 0.55;
  }

  // Atmospheric perspective: distant / high clouds softer and bluer.
  float atmosAmt = smoothstep(0.12, 0.88, cloudUV.y) * (1.0 - opacity * 0.35) * dayMask * 0.38;
  vec3 atmosTint = vec3(0.70, 0.76, 0.88);
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(albedo, mix(vec3(lum), albedo, 0.80) + atmosTint * 0.12, atmosAmt);

  outShade.albedo = clamp(albedo, 0.0, 1.35);
  return outShade;
}
