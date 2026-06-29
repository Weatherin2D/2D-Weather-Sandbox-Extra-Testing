function boltLuminance(lineWidth, tier) {
  const w = Math.max(lineWidth, 0.4);
  if (tier === 'glow') return Math.min(255, Math.pow(w, 1.35) * 7);
  if (tier === 'core') return Math.min(255, Math.pow(w, 1.15) * 18);
  return Math.min(255, Math.pow(w, 1.55) * 13);
}

function strokeBoltLayer(ctx, lineWidth, tier, glowBlur) {
  const lum = boltLuminance(lineWidth, tier);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (glowBlur > 0) {
    ctx.shadowBlur = glowBlur;
    ctx.shadowColor = `rgb(${lum}, ${lum}, ${Math.min(255, lum + 6)})`;
  }
  ctx.strokeStyle = `rgb(${lum}, ${lum}, ${Math.min(255, lum + 8)})`;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function flushBoltPath(ctx, lineWidth, opts) {
  const withCore = !opts || opts.core !== false;
  strokeBoltLayer(ctx, lineWidth * 3.4, 'glow', lineWidth * 2.2);
  strokeBoltLayer(ctx, lineWidth, 'body', lineWidth * 0.75);
  if (withCore)
    strokeBoltLayer(ctx, Math.max(lineWidth * 0.22, 1.0), 'core', 0);
}

onmessage = (event) => {
  const msg = event.data;
  // console.log(msg);
  let imgElement;

  // Generate different lightning types based on requested type
  const boltType = msg.type || 'CG';

  switch(boltType) {
    case 'IC':
      imgElement = generateIntracloudBolt(msg.width, msg.height);
      break;
    case 'CC':
      imgElement = generateCloudToCloudBolt(msg.width, msg.height);
      break;
    case 'SPIDER':
      imgElement = generateSpiderLightning(msg.width, msg.height);
      break;
    case 'ANVIL':
      imgElement = generateAnvilCrawler(msg.width, msg.height);
      break;
    case 'POSITIVE':
      imgElement = generatePositiveCGBolt(msg.width, msg.height);
      break;
    case 'SPRITE':
      imgElement = generateSpritePattern(msg.width, msg.height);
      break;
    case 'CG':
    default:
      imgElement = generateLightningBolt(msg.width, msg.height);
      break;
  }

  postMessage(imgElement);
};


function generateLightningBolt(width, height)
{
  const lightningCanvas = new OffscreenCanvas(width, height);
  const ctx = lightningCanvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();

  let startX = width / 2.0;
  let startY = 0;
  let angle = Math.PI / 6.;
  let lineWidth = 10.0;
  const targetAngle = 0.0;

  ctx.moveTo(startX, startY);
  ctx.lineWidth = lineWidth;

  while (startY < height) {

    const step = 0.85 + Math.random() * 0.35;
    const nextX = startX + Math.sin(angle) * step;
    const nextY = startY + Math.cos(angle) * step;

    angle += (Math.random() - 0.5) * 1.65;
    angle -= (angle - targetAngle) * 0.07;

    ctx.lineTo(nextX, nextY);

    startX = nextX;
    startY = nextY;

    if (Math.random() < 0.022 * (1. - nextY / height)) {
      flushBoltPath(ctx, lineWidth);
      drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 2.8, lineWidth * 0.55 * (0.45 + Math.random() * 0.55));
      ctx.beginPath();
      ctx.moveTo(nextX, nextY);
      ctx.lineWidth = lineWidth;
    }

    if (startY >= height - 1) {
      ctx.lineTo(startX, height);
      break;
    }
  }
  flushBoltPath(ctx, lineWidth);

  return ctx.getImageData(0, 0, width, height);

  function drawBranch(startX, startY, targetAngle, line_width)
  {
    let angle = targetAngle;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = line_width;

    while (startY < height) {

      const nextX = startX + Math.sin(angle) * 0.9;
      const nextY = startY + Math.cos(angle) * 0.9;

      angle += (Math.random() - 0.5) * 0.95;
      angle -= (angle - targetAngle) * 0.08;

      ctx.lineTo(nextX, nextY);

      startX = nextX;
      startY = nextY;

      if (Math.random() < 0.022) {
        flushBoltPath(ctx, line_width, { core: line_width > 1.5 });
        line_width -= 0.22;

        if (line_width < 0.12)
          return;

        if (Math.random() < 0.14)
          drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 1.8, line_width);

        ctx.beginPath();
        ctx.moveTo(nextX, nextY);
        ctx.lineWidth = line_width;
      }

      if (startY >= height - 1) {
        ctx.lineTo(startX, height);
        break;
      }
    }
    flushBoltPath(ctx, line_width, { core: line_width > 1.2 });
  }
}

// Compact jagged intracloud channel (short vertical reach, branches)
function generateIntracloudBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  function flushPath(lineWidth, withCore) {
    flushBoltPath(ctx, lineWidth, { core: withCore !== false });
  }

  const startX = width * 0.5;
  const startY = height * 0.28;
  const endY = height * 0.72;
  let x = startX;
  let y = startY;
  let angle = (Math.random() - 0.5) * 0.6;
  let lineWidth = 8.0;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineWidth = lineWidth;

  while (y < endY) {
    const nextX = x + Math.sin(angle) * 1.5;
    const nextY = y + Math.cos(angle) * 1.25;
    angle += (Math.random() - 0.5) * 1.35;
    angle *= 0.86;
    ctx.lineTo(nextX, nextY);
    x = nextX;
    y = nextY;

    if (Math.random() < 0.032) {
      flushPath(lineWidth);
      let bx = x;
      let by = y;
      const bAng = angle + (Math.random() - 0.5) * 1.8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const branchW = lineWidth * 0.58;
      for (let i = 0; i < 22; i++) {
        bx += Math.sin(bAng + (Math.random() - 0.5) * 0.9) * 1.15;
        by += Math.cos(bAng + (Math.random() - 0.5) * 0.9) * 0.95;
        ctx.lineTo(bx, by);
      }
      flushPath(branchW, false);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = lineWidth;
    }
  }

  flushPath(lineWidth);
  return ctx.getImageData(0, 0, width, height);
}

// Generate horizontal cloud-to-cloud lightning bolt
function generateCloudToCloudBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  function flushPath(lineWidth, withCore) {
    flushBoltPath(ctx, lineWidth, { core: withCore !== false });
  }

  const centerY = height * 0.5;
  let startX = width * 0.1;
  const endX = width * 0.9;

  ctx.beginPath();
  ctx.moveTo(startX, centerY);

  let currentX = startX;
  let currentY = centerY;
  let lineWidth = 8.5;
  ctx.lineWidth = lineWidth;

  while (currentX < endX) {
    const stepX = 2 + Math.random() * 3;
    const zigzagY = (Math.random() - 0.5) * 22;

    currentX += stepX;
    currentY += zigzagY * 0.32;
    currentY = centerY + (currentY - centerY) * 0.68;

    ctx.lineTo(currentX, currentY);

    if (Math.random() < 0.025) {
      flushPath(lineWidth);
      drawCCBranch(ctx, currentX, currentY, lineWidth * 0.62, height, flushPath);
      ctx.beginPath();
      ctx.moveTo(currentX, currentY);
      ctx.lineWidth = lineWidth;
    }
  }

  flushPath(lineWidth);

  return ctx.getImageData(0, 0, width, height);

  function drawCCBranch(ctx, startX, startY, lineWidth, height, flushPath) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = lineWidth;

    let x = startX;
    let y = startY;
    const direction = Math.random() > 0.5 ? 1 : -1;

    while (Math.abs(y - startY) < height * 0.16 && x > 0 && x < width) {
      y += direction * (1 + Math.random());
      x += (Math.random() - 0.5) * 2.2;
      ctx.lineTo(x, y);

      if (Math.random() < 0.035) {
        flushPath(lineWidth, false);
        lineWidth -= 0.45;
        if (lineWidth < 0.5) return;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = lineWidth;
      }
    }

    flushPath(lineWidth, false);
  }
}

// Generate spider lightning - flat horizontal crawling pattern
function generateSpiderLightning(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  function flushPath(lineWidth, withCore) {
    flushBoltPath(ctx, lineWidth, { core: withCore !== false });
  }

  const numTendrils = 8;
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  // Draw multiple tendrils spreading outward
  for (let t = 0; t < numTendrils; t++) {
    const angle = (t / (numTendrils - 1) - 0.5) * Math.PI * 0.8; // Spread across horizontal arc
    const length = width * (0.3 + Math.random() * 0.3);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);

    let x = centerX;
    let y = centerY;
    let lineWidth = 6.0;
    ctx.lineWidth = lineWidth;

    const steps = 100;
    for (let i = 0; i < steps; i++) {
      const progress = i / steps;
      const distance = length * progress;

      // Calculate base position along tendril
      const baseX = centerX + Math.cos(angle) * distance;
      const baseY = centerY + Math.sin(angle) * distance * 0.1; // Very flat - minimal vertical

      // Add noise for crawling effect
      const noiseX = (Math.random() - 0.5) * 3;
      const noiseY = (Math.random() - 0.5) * 1; // Very narrow vertical spread

      x = baseX + noiseX;
      y = baseY + noiseY;

      ctx.lineTo(x, y);

      // Gradual fade
      if (i % 12 === 0) {
        flushPath(lineWidth, false);
        lineWidth *= 0.88;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = lineWidth;
      }
    }

    flushPath(lineWidth, false);
  }

  return ctx.getImageData(0, 0, width, height);
}

// Thicker positive cloud-to-ground bolt
function generatePositiveCGBolt(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  let startX = width / 2.0;
  let startY = 0;
  let angle = Math.PI / 5.;
  let lineWidth = 15.0;
  const targetAngle = 0.0;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineWidth = lineWidth;

  while (startY < height) {
    const nextX = startX + Math.sin(angle) * 1.25;
    const nextY = startY + Math.cos(angle) * 1.25;
    angle += (Math.random() - 0.5) * 1.75;
    angle -= (angle - targetAngle) * 0.06;
    ctx.lineTo(nextX, nextY);
    startX = nextX;
    startY = nextY;

    if (Math.random() < 0.024 * (1. - nextY / height)) {
      flushBoltPath(ctx, lineWidth);
      drawBranch(nextX, nextY, targetAngle + (Math.random() - 0.5) * 2.2, lineWidth * 0.58);
      ctx.beginPath();
      ctx.moveTo(nextX, nextY);
      ctx.lineWidth = lineWidth;
    }
    if (startY >= height - 1) {
      ctx.lineTo(startX, height);
      break;
    }
  }
  flushBoltPath(ctx, lineWidth);
  return ctx.getImageData(0, 0, width, height);

  function drawBranch(startX, startY, targetAngle, line_width) {
    let angle = targetAngle;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = line_width;
    while (startY < height) {
      const nextX = startX + Math.sin(angle);
      const nextY = startY + Math.cos(angle);
      angle += (Math.random() - 0.5) * 0.85;
      angle -= (angle - targetAngle) * 0.08;
      ctx.lineTo(nextX, nextY);
      startX = nextX;
      startY = nextY;
      if (Math.random() < 0.024) {
        flushBoltPath(ctx, line_width, { core: line_width > 1.8 });
        line_width -= 0.28;
        if (line_width < 0.18) return;
        ctx.beginPath();
        ctx.moveTo(nextX, nextY);
        ctx.lineWidth = line_width;
      }
      if (startY >= height - 1) break;
    }
    flushBoltPath(ctx, line_width, { core: line_width > 1.5 });
  }
}

// Large horizontal anvil crawler discharge
function generateAnvilCrawler(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  function flushPath(lineWidth, withCore) {
    flushBoltPath(ctx, lineWidth, { core: withCore !== false });
  }

  const centerY = height * 0.42;
  const numChannels = 3 + Math.floor(Math.random() * 3);

  for (let ch = 0; ch < numChannels; ch++) {
    const yOff = (ch - numChannels / 2) * height * 0.04;
    let startX = width * (0.05 + Math.random() * 0.1);
    let currentX = startX;
    let currentY = centerY + yOff;
    let lineWidth = 5.0 + Math.random() * 3.0;

    ctx.beginPath();
    ctx.moveTo(currentX, currentY);
    ctx.lineWidth = lineWidth;

    while (currentX < width * 0.92) {
      const stepX = 3 + Math.random() * 5;
      currentX += stepX;
      currentY += (Math.random() - 0.5) * 8;
      currentY = centerY + yOff + (currentY - centerY - yOff) * 0.6;
      ctx.lineTo(currentX, currentY);

      if (Math.random() < 0.045) {
        flushPath(lineWidth, false);
        let bx = currentX;
        let by = currentY;
        const dir = Math.random() > 0.5 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        for (let j = 0; j < 22; j++) {
          by += dir * (1 + Math.random());
          bx += (Math.random() - 0.5) * 3.2;
          ctx.lineTo(bx, by);
        }
        flushPath(lineWidth * 0.52, false);
        ctx.beginPath();
        ctx.moveTo(currentX, currentY);
        ctx.lineWidth = lineWidth;
      }
    }
    flushPath(lineWidth, false);
  }

  return ctx.getImageData(0, 0, width, height);
}

// Generate sprite pattern - reddish glow above storm
function generateSpritePattern(width, height)
{
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.6; // Slightly below center

  // Create radial gradient for sprite glow
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY * 0.5, width * 0.4);

  // Sprite colors: reddish-orange with tendrils
  gradient.addColorStop(0, 'rgba(255, 60, 20, 0.9)');     // Bright center
  gradient.addColorStop(0.2, 'rgba(255, 80, 30, 0.6)');   // Inner glow
  gradient.addColorStop(0.5, 'rgba(255, 100, 40, 0.3)');  // Middle
  gradient.addColorStop(1, 'rgba(255, 120, 50, 0)');     // Fade out

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add vertical tendrils reaching upward
  ctx.strokeStyle = 'rgba(255, 70, 25, 0.7)';
  ctx.lineWidth = 2;

  const numTendrils = 12;
  for (let i = 0; i < numTendrils; i++) {
    const x = centerX + (i - numTendrils/2) * (width * 0.03);
    const tendrilHeight = height * (0.2 + Math.random() * 0.3);

    ctx.beginPath();
    ctx.moveTo(x, centerY);

    let currentX = x;
    let currentY = centerY;

    for (let j = 0; j < 50; j++) {
      currentY -= tendrilHeight / 50;
      currentX += (Math.random() - 0.5) * 2;
      ctx.lineTo(currentX, currentY);
    }

    ctx.stroke();
  }

  // Add halo ring
  ctx.strokeStyle = 'rgba(255, 90, 35, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, width * 0.12, height * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();

  return ctx.getImageData(0, 0, width, height);
}