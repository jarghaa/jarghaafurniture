'use strict';
/**
 * Edge analysis helper: reports where the furniture boundary sits so the
 * perspective-correction quads can be derived from measurements rather than
 * guesswork.
 *
 *   node tools/analyze.js <image> <mode>
 *
 * mode = dark  -> piece is much darker than its surroundings (image 1)
 *        wood  -> piece is a warm wood tone on a neutral wall (images 3, 4)
 */
const sharp = require('sharp');

const WIDTH = 1000;

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function maskFn(mode) {
  if (mode === 'dark') {
    return (r, g, b) => lum(r, g, b) < 105;
  }
  // warm wood: red channel leads and there is a real red/blue spread
  return (r, g, b) => (r - b) > 34 && r > 60 && lum(r, g, b) < 205 && (r - b) > 0.16 * r;
}

(async () => {
  const [file, mode] = process.argv.slice(2);
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: WIDTH, withoutEnlargement: false, fit: 'inside' })
    .toColorspace('srgb')
    .raw().toBuffer({ resolveWithObject: true });

  const W = info.width, H = info.height, C = info.channels;
  const test = maskFn(mode || 'dark');

  const rows = [];
  for (let y = 0; y < H; y++) {
    let lo = -1, hi = -1, count = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      if (test(data[i], data[i + 1], data[i + 2])) {
        if (lo < 0) lo = x;
        hi = x; count++;
      }
    }
    rows.push({ y, lo, hi, count });
  }
  const cols = [];
  for (let x = 0; x < W; x++) {
    let lo = -1, hi = -1, count = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * C;
      if (test(data[i], data[i + 1], data[i + 2])) {
        if (lo < 0) lo = y;
        hi = y; count++;
      }
    }
    cols.push({ x, lo, hi, count });
  }

  const total = W * H;
  const step = Math.max(1, Math.round(H / 30));
  console.log(`# ${file}  analysed at ${W}x${H}  mode=${mode}`);
  console.log('## row profile  (y, leftEdge, rightEdge, filledPixels)');
  for (let y = 0; y < H; y += step) {
    const r = rows[y];
    console.log(`${y}\t${r.lo}\t${r.hi}\t${r.count}`);
  }
  console.log('## column profile (x, topEdge, bottomEdge, filledPixels)');
  const cstep = Math.max(1, Math.round(W / 30));
  for (let x = 0; x < W; x += cstep) {
    const c = cols[x];
    console.log(`${x}\t${c.lo}\t${c.hi}\t${c.count}`);
  }

  // widest row = good seed for the piece's horizontal extent
  let best = rows[0];
  for (const r of rows) if (r.count > best.count) best = r;
  console.log(`## densest row y=${best.y} lo=${best.lo} hi=${best.hi} (${((best.count / total) * 100).toFixed(1)}% of frame)`);
  let tall = cols[0];
  for (const c of cols) if (c.count > tall.count) tall = c;
  console.log(`## tallest column x=${tall.x} top=${tall.lo} bottom=${tall.hi}`);
})();
