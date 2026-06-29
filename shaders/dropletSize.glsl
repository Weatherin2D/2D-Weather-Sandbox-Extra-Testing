// Shared droplet width (mm) and phase classification for size views.

float dropletHorizWidthMm(vec2 mass, float density)
{
  float water = max(mass.x, 0.0);
  float ice = max(mass.y, 0.0);
  float totalMass = water + ice;
  if (totalMass < 0.001)
    return 0.0;

  float radius = pow(totalMass, 1.0 / 3.0);
  float baseDiam = radius * 2.0 * 8.0;
  float liquidFrac = water / totalMass;
  float oblate = liquidFrac * 0.38
    + (density >= 0.82 ? 0.12 : 0.0)
    + (density < 0.45 ? 0.08 : 0.0);
  float aspect = 1.0 + clamp(oblate, 0.0, 0.55);
  return baseDiam * aspect;
}

bool isHailParticle(vec2 mass, float density)
{
  return mass.y > 0.0 && density >= 0.82;
}
