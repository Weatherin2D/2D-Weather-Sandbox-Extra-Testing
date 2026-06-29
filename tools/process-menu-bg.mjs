import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MENU_BG_DIR = path.resolve('resources/img/menu-bg');
const SATURATION_FACTOR = 2.4;

const NEW_SOURCES = [
  'c__Users_tajan_AppData_Roaming_Cursor_User_workspaceStorage_360b45011cf3851d8f33fe44ac538bdd_images_image-8a268fc5-efea-433f-b3bf-e5293b400ace.png',
  'c__Users_tajan_AppData_Roaming_Cursor_User_workspaceStorage_360b45011cf3851d8f33fe44ac538bdd_images_image-13950779-c962-4062-9ecc-090cded9f62d.png',
  'c__Users_tajan_AppData_Roaming_Cursor_User_workspaceStorage_360b45011cf3851d8f33fe44ac538bdd_images_image-ef21e3c1-4eb1-4331-bc42-a6fc4b567fde.png'
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function saturatePixel(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const boostedS = clamp(s * SATURATION_FACTOR, 0, 1);
  return hslToRgb(h, boostedS, l);
}

async function processImage(inputPath, satPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const satData = Buffer.alloc(data.length);
  const channels = info.channels;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = channels === 4 ? data[i + 3] : 255;

    const [sr, sg, sb] = saturatePixel(r, g, b);
    satData[i] = sr;
    satData[i + 1] = sg;
    satData[i + 2] = sb;
    if (channels === 4) satData[i + 3] = a;
  }

  await sharp(satData, {
    raw: {
      width: info.width,
      height: info.height,
      channels
    }
  }).png().toFile(satPath);
}

const assetsDir = path.resolve(
  'C:/Users/tajan/.cursor/projects/c-Users-tajan-OneDrive-Desktop-2D-Weather-Sandbox-Extra-main/assets'
);

for (let i = 0; i < NEW_SOURCES.length; i++) {
  const num = String(i + 8).padStart(2, '0');
  const src = path.join(assetsDir, NEW_SOURCES[i]);
  const dest = path.join(MENU_BG_DIR, `menu-bg-${num}.png`);
  fs.copyFileSync(src, dest);
  console.log(`Copied source menu-bg-${num}.png`);
}

const sourceFiles = fs.readdirSync(MENU_BG_DIR)
  .filter((name) => /^menu-bg-\d{2}\.png$/.test(name))
  .sort();

for (const name of sourceFiles) {
  const base = name.replace(/\.png$/, '');
  const inputPath = path.join(MENU_BG_DIR, name);
  const satPath = path.join(MENU_BG_DIR, `${base}-sat.png`);
  await processImage(inputPath, satPath);
  console.log(`Processed ${base} -> ${base}-sat.png`);
}

console.log(`Done. ${sourceFiles.length} sources -> ${sourceFiles.length} slideshow images.`);
