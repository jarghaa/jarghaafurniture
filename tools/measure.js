'use strict';
/**
 * Locates a warm-wood piece in a (rotated) photo by following the longest
 * contiguous warm run per scan line, then least-squares fits the four edges and
 * prints the quad in ORIGINAL pixels.
 *
 *   node tools/measure.js <image> [--x0 0.03 --x1 0.97 --y0 0.08 --y1 0.95]
 */
const sharp = require('sharp');
const WIDTH = 1000;

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function wood(r, g, b) { return (r - b) > 28 && r > 55 && lum(r, g, b) < 215; }

function fit(pts) {
  let m = 0, c = 0, use = pts.slice();
  for (let pass = 0; pass < 4; pass++) {
    const n = use.length; if (!n) break;
    let si = 0, sd = 0, sii = 0, sid = 0;
    for (const [i, d] of use) { si += i; sd += d; sii += i * i; sid += i * d; }
    const den = n * sii - si * si;
    m = den === 0 ? 0 : (n * sid - si * sd) / den;
    c = (sd - m * si) / n;
    if (pass < 3) {
      const res = pts.map((p) => Math.abs(p[1] - (m * p[0] + c)));
      const cut = Math.max(res.slice().sort((a, b) => a - b)[Math.floor(res.length * 0.7)], 1);
      use = pts.filter((p, i) => res[i] <= cut);
      if (use.length < 4) use = pts.slice();
    }
  }
  return { m, c };
}

(async () => {
  const argv = process.argv.slice(2);
  const file = argv[0];
  const get = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : Number(argv[i + 1]); };
  const x0 = get('--x0', 0.03), x1 = get('--x1', 0.97);
  const y0 = get('--y0', 0.08), y1 = get('--y1', 0.95);

  const meta = await sharp(file, { failOn: 'none' }).metadata();
  const rotW = (meta.orientation || 1) >= 5 ? meta.height : meta.width;
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate().resize({ width: WIDTH }).toColorspace('srgb')
    .raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const S = rotW / W;

  const L = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += C) L[i] = lum(data[p], data[p + 1], data[p + 2]);

  /** longest contiguous run satisfying test in [a,b] along one scan line */
  function longestRun(a, b, test) {
    let best = null, cur = -1;
    for (let i = a; i < b; i++) {
      if (test(i)) { if (cur < 0) cur = i; if (!best || i - cur > best[1] - best[0]) best = [cur, i]; }
      else cur = -1;
    }
    return best;
  }

  const rowPts = [], colPts = [];
  const ax = Math.round(x0 * W), bx = Math.round(x1 * W);
  const ay = Math.round(y0 * H), by = Math.round(y1 * H);
  const minRunX = Math.round((bx - ax) * 0.35);
  const minRunY = Math.round((by - ay) * 0.35);

  for (let y = ay; y < by; y += Math.max(1, Math.round(H / 30))) {
    const px = (i) => { const o = (y * W + i) * C; return wood(data[o], data[o + 1], data[o + 2]); };
    const r = longestRun(ax, bx, px);
    if (r && (r[1] - r[0]) >= minRunX) {
      rowPts.push([y, r[0]]); rowPts.push([y, r[1]]);
    }
  }
  for (let x = ax; x < bx; x += Math.max(1, Math.round(W / 30))) {
    const py = (j) => { const o = (j * W + x) * C; return wood(data[o], data[o + 1], data[o + 2]); };
    const r = longestRun(ay, by, py);
    if (r && (r[1] - r[0]) >= minRunY) {
      colPts.push([x, r[0]]); colPts.push([x, r[1]]);
    }
  }

  const leftPts = rowPts.filter((_, i) => i % 2 === 0);
  const rightPts = rowPts.filter((_, i) => i % 2 === 1);
  const topPts = colPts.filter((_, i) => i % 2 === 0);
  const botPts = colPts.filter((_, i) => i % 2 === 1);
  const lL = fit(leftPts), lR = fit(rightPts), fT = fit(topPts), fB = fit(botPts);

  const ix = (lv, hv) => {
    const y = (hv.m * lv.c + hv.c) / (1 - lv.m * hv.m);
    return [lv.m * y + lv.c, y];
  };
  const q = [ix(lL, fT), ix(lR, fT), ix(lR, fB), ix(lL, fB)]
    .map(([x, y]) => [Math.round(x * S), Math.round(y * S)]);

  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tiltL = Math.atan((q[3][0] - q[0][0]) / (q[3][1] - q[0][1])) * 180 / Math.PI;
  const tiltR = Math.atan((q[2][0] - q[1][0]) / (q[2][1] - q[1][1])) * 180 / Math.PI;
  const tiltT = Math.atan((q[1][1] - q[0][1]) / (q[1][0] - q[0][0])) * 180 / Math.PI;

  console.log(`# ${file}  at ${W}x${H}, scale ${S.toFixed(3)}  (${leftPts.length} L, ${rightPts.length} R, ${topPts.length} T, ${botPts.length} B pts)`);
  console.log('  QUAD = ' + JSON.stringify(q));
  console.log(`  topW=${d(q[0], q[1]).toFixed(0)} botW=${d(q[3], q[2]).toFixed(0)} leftH=${d(q[0], q[3]).toFixed(0)} rightH=${d(q[1], q[2]).toFixed(0)}`);
  console.log(`  tilts  L=${tiltL.toFixed(1)}deg R=${tiltR.toFixed(1)}deg top=${tiltT.toFixed(1)}deg`);
})();
