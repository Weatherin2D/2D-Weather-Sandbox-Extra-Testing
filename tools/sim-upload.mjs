import fs from 'fs';
import { PNG } from 'pngjs';

const png = PNG.sync.read(fs.readFileSync('resources/img/ColorScales.png'));

function readCol(col, n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const idx = (png.width * i + col) * 4;
    arr.push([png.data[idx], png.data[idx + 1], png.data[idx + 2]]);
  }
  return arr;
}

const temperature = readCol(0, 131);
for (const row of [0, 50, 70, 71, 80, 100, 130]) {
  console.log('temp stop', row, temperature[row]);
}

// simulate upload column 0
const TEX_H = 131;
const col0 = new Array(TEX_H).fill(null).map((_, row) => temperature[row]);
for (const row of [71, 80, 100, 130]) {
  console.log('upload row', row, col0[row]);
}
