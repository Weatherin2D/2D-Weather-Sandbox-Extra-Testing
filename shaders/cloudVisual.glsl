// Rendering-only cloud appearance helpers.
// Reads simulation cloud/moisture data — never writes back to simulation textures.

// Multi-scale procedural detail from cached noise (display-only).
float cloudVisualFBM(vec2 worldPos, float time, float quality)
{
  vec2 uv = worldPos * vec2(0.0036, 0.0041) + vec2(time * 0.00065, time * 0.00048);
  float n0 = texture(noiseTex, uv * 0.12 + 0.17).r;
  float n1 = texture(noiseTex, uv * 0.42 + 3.71).r;
  float n2 = quality >= 0.55 ? texture(noiseTex, uv * 1.35 + 7.19).r : n1;
  float n3 = quality >= 0.70 ? texture(noiseTex, uv * 2.85 + 11.43).r : n2;
  return n0 * 0.46 + n1 * 0.30 + n2 * 0.16 + n3 * 0.08;
}

// Read-only screen-space density gradient for fake volumetric shading.
vec3 cloudVisualDensityGradient(vec2 cloudUV, float quality)
{
  vec2 px = texelSize * mix(1.0, 1.35, quality);
  float c = texture(waterTex, cloudUV)[CLOUD];
  float l = texture(waterTex, cloudUV - vec2(px.x, 0.0))[CLOUD];
  float r = texture(waterTex, cloudUV + vec2(px.x, 0.0))[CLOUD];
  float d = texture(waterTex, cloudUV - vec2(0.0, px.y))[CLOUD];
  float u = texture(waterTex, cloudUV + vec2(0.0, px.y))[CLOUD];
  return vec3(r - l, u - d, c);
}

struct CloudVisualShading {
  float visualWeight;
  float opacity;
  vec3 albedo;
  float edgeGlow;
  float rayBreak;
};

// Transform existing cloudwater into photographic-style appearance (read-only input).
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
  float cloudWeight = max(cloudwater * 13.6 * max(densScale, 0.01), 0.0);

  float fbm = cloudVisualFBM(worldPos, iterNum, q);
  float densityPresence = smoothstep(0.012, 0.38, cloudwater);
  // Procedural breakup modulates visual density only — cloudwater unchanged.
  float detailMod = mix(0.68, 1.38, fbm);
  detailMod = mix(detailMod, mix(0.82, 1.22, fbm), densityPresence);
  float visualWeight = cloudWeight * detailMod;
  outShade.visualWeight = visualWeight;

  float precipWeight = clamp(precip * 0.8 * max(densScale, 0.01), 0.0, 8.0);
  float totalDensity = visualWeight + precipWeight;
  float opacity = clamp(1.0 - (1.0 / (1.0 + totalDensity)), 0.0, 1.0);
  opacity = pow(opacity, 1.0 / clamp(soft, 0.15, 2.5));
  outShade.opacity = opacity;

  vec3 grad = cloudVisualDensityGradient(cloudUV, q);
  float gradMag = length(grad.xy);
  float vertGrowth = grad.y; // upward increase → convective tower read from sim data

  // Fake surface normal from density gradient (2D volume illusion).
  float gradScale = mix(5.5, 11.0, densityPresence);
  vec3 normal = normalize(vec3(-grad.x * gradScale, -grad.y * gradScale * 1.35, 1.0));
  vec3 sunDir = normalize(vec3(0.22, 0.88, 0.42));
  float ndotl = clamp(dot(normal, sunDir), 0.0, 1.0);

  float convection = smoothstep(0.006, 0.065, vertGrowth) * smoothstep(0.04, 0.55, cloudwater);
  float towerBoost = 1.0 + convection * 0.55;

  float litPow = pow(clamp(lit, 0.0, 1.5), mix(0.62, 0.88, cloudLightResponse));
  float sunFacing = mix(0.35, 1.0, ndotl) * mix(0.55, 1.35, cloudLightResponse);
  sunFacing *= mix(0.45, 1.0, litPow);

  // Edge silver-lining where density falls off toward sun.
  float edgeMask = smoothstep(0.004, 0.045, gradMag) * (1.0 - opacity * 0.35);
  float rim = pow(ndotl, 2.8) * edgeMask * litPow;
  outShade.edgeGlow = rim * dayMask;

  // Thick interior / storm core in shadow — blue-gray charcoal, not pure black.
  float thickMask = smoothstep(0.38, 0.92, opacity);
  float inShadow = (1.0 - smoothstep(0.05, 0.24, lit)) * thickMask;
  float stormCore = inShadow * smoothstep(0.25, 0.88, opacity) * smoothstep(0.08, 0.45, cloudwater);

  // Cloud base: darker, cooler where density rises below (sim vertical structure).
  float baseShadow = smoothstep(-0.035, 0.012, vertGrowth) * smoothstep(0.03, 0.35, cloudwater);

  vec3 sunlitTop = vec3(0.97, 0.94, 0.86) * brightTint;
  vec3 midTone = vec3(0.80, 0.83, 0.88) * brightTint;
  vec3 shadowTone = vec3(0.28, 0.32, 0.40) * darkTint;
  vec3 stormTone = vec3(0.14, 0.16, 0.22) * mix(vec3(1.0), darkTint, 0.65);
  vec3 baseTone = vec3(0.38, 0.41, 0.46) * darkTint;

  vec3 albedo = mix(midTone, sunlitTop, sunFacing * towerBoost);
  albedo = mix(albedo, shadowTone, inShadow * cloudShadowStrength);
  albedo = mix(albedo, stormTone, stormCore * 0.72);
  albedo = mix(albedo, baseTone, baseShadow * 0.55 * dayMask);

  // Internal self-shadow from visual thickness.
  float selfShadow = smoothstep(0.18, 0.82, opacity) * (1.0 - litPow * 0.85);
  albedo *= mix(1.0, 0.62, selfShadow * thickMask * 0.55);

  // Convective towers: brighter sun-facing tops, darker loaded cores.
  albedo = mix(albedo, sunlitTop * 1.08, convection * ndotl * litPow * 0.42);
  albedo = mix(albedo, stormTone, convection * inShadow * 0.38);

  // Silver lining on sun-facing edges.
  albedo += vec3(0.92, 0.88, 0.78) * rim * 0.38 * brightTint;

  // Atmospheric perspective: higher / thinner clouds → softer, less contrast.
  float alt = clamp(cloudUV.y, 0.0, 1.0);
  float atmosDist = smoothstep(0.08, 0.92, alt);
  float atmosAmt = atmosDist * (1.0 - opacity * 0.35) * dayMask;
  vec3 atmosTint = vec3(0.72, 0.78, 0.90);
  albedo = mix(albedo, albedo * 0.82 + atmosTint * 0.18, atmosAmt * 0.42);
  float atmosLum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo = mix(vec3(atmosLum), albedo, mix(1.0, 0.78, atmosAmt * 0.35));

  outShade.albedo = max(albedo, 0.0);

  // Crepuscular break: thin gaps at cloud edges where sun punches through.
  float breakMask = edgeMask * litPow * (1.0 - smoothstep(0.55, 0.95, opacity));
  outShade.rayBreak = breakMask * dayMask;

  return outShade;
}
