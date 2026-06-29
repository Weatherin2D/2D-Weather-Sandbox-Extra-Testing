import fs from 'fs';
import { PNG } from 'pngjs';

const path = process.argv[2];
const png = PNG.sync.read(fs.readFileSync(path));
for (const row of [0, 50, 70, 71, 80, 100, 130]) {
  const i = (png.width * row) * 4;
  console.log('row', row, png.data[i], png.data[i + 1], png.data[i + 2]);
}
