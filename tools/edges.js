'use strict';
/**
 * Boundary tracer for furniture photos.
 *
 * For each scan line across the piece it finds the strongest *step* edge
 * (windowed mean difference, which is far more robust than a 2px derivative),
 * then least-squares fits the four boundary lines and reports the quad in
 * ORIGINAL image pixel coordinates.
 *
 *   node tools/edges.js <image> '<jsonOptions>'
 *
 * Options
 *   piece : 'dark' | 'light'   tone of the piece versus its background
 *   xRange, yRange : [0..1]    search windows as frame fractions
 *   rows, cols     : number of scan lines
 *   window         : edge detector half-width as a fraction of the frame (0.02)
 */
const sharp = require('sharp');

const ANW = 1200;

function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

/** Least squares fit of dependent = m * independent + c, with outlier passes. */
function fitLine(pts) {
  let use = pts.slice();
  let m = 0, c = 0;
  for (let pass = 0; pass < 4; pass++) {
    let si = 0, sd = 0, sii = 0, sid = 0;
    const n = use.length;
    for (const [i, d] of use) { si += i; sd += d; sii += i * i; sid += i * d; }
    const den = n * sii - si * si;
    m = den === 0 ? 0 : (n * sid - si * sd) / den;
    c = (sd - m * si) / n;
    if (pass < 3) {
      const res = pts.map(p => Math.abs(p[1] - (m * p[0] + c)));
      const sorted = res.slice().sort((a, b) => a - b);
      const cut = Math.max(sorted[Math.floor(sorted.length * 0.7)], 1);
      use = pts.filter((p, i) => res[i] <= cut);
      if (use.length < 4) use = pts.slice();
    }
  }
  return { m, c };
}

(async () => {
  const file = process.argv[2];
  const opt = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  const piece = opt.piece || 'dark';
  const dark = piece === 'dark';

  const meta = await sharp(file, { failOn: 'none' }).metadata();
  const rotW = (meta.orientation || 1) >= 5 ? meta.height : meta.width;

  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate().resize({ width: ANW }).toColorspace('srgb')
    .raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const S = rotW / W;

  const L = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += C) L[i] = lum(data[p], data[p + 1], data[p + 2]);

  const xr = opt.xRange || [0, 1], yr = opt.yRange || [0, 1];
  const x0 = Math.round(xr[0] * W), x1 = Math.round(xr[1] * W);
  const y0 = Math.round(yr[0] * H), y1 = Math.round(yr[1] * H);
  const hw = Math.max(2, Math.round((opt.window || 0.02) * Math.max(W, H)));

  /** prefix sums for O(1) windowed means along a sampled profile */
  function prefix(vals) {
    const p = new Float64Array(vals.length + 1);
    for (let i = 0; i < vals.length; i++) p[i + 1] = p[i] + vals[i];
    return p;
  }
  const mean = (p, a, b) => {
    const lo = Math.max(0, a), hi = Math.min(p.length - 1, b);
    if (hi <= lo) return null;
    return (p[hi] - p[lo]) / (hi - lo);
  };

  /**
   * Scan one line. `get(i)` returns luminance at offset i along the scan.
   * `sign` = +1 when outside is brighter than inside (dark piece, left/top),
   *        = -1 when inside is brighter than outside (dark piece, right/bottom).
   */
  function findEdge(len, get, sign, lo, hi) {
    const vals = new Float64Array(len);
    for (let i = 0; i < len; i++) vals[i] = get(i);
    const p = prefix(vals);
    let bestP = -1, best = -Infinity;
    for (let i = lo; i < hi; i++) {
      const before = mean(p, i - hw, i);
      const after = mean(p, i, i + hw);
      if (before === null || after === null) continue;
      const d = before - after;
      const s = sign === 0 ? Math.abs(d) : sign * d;
      if (s > best) { best = s; bestP = i; }
    }
    return bestP < 0 ? null : { pos: bestP, score: best };
  }

  // Resolve a per-edge polarity option into a detector sign.
  //   'dark'  outside is brighter  -> left/top: +1, right/bottom: -1
  //   'light' inside is brighter   -> left/top: -1, right/bottom: +1
  //   'abs'   strongest step either way
  function signFor(edge, spec) {
    const s = spec || (dark ? 'dark' : 'light');
    if (s === 'abs') return 0;
    const outsideBrighter = s === 'dark';
    const isStart = edge === 'left' || edge === 'top';
    return outsideBrighter === isStart ? 1 : -1;
  }

  // vertical boundaries ----------------------------------------------------
  const nRows = opt.rows || 18;
  const leftPts = [], rightPts = [];
  const lrL = opt.leftRange || xr, lrR = opt.rightRange || xr;
  const lx0 = Math.round(lrL[0] * W), lx1 = Math.round(lrL[1] * W);
  const rx0 = Math.round(lrR[0] * W), rx1 = Math.round(lrR[1] * W);
  const sL = signFor('left', opt.signLeft);
  const sR = signFor('right', opt.signRight);
  for (let k = 1; k <= nRows; k++) {
    const y = Math.round(y0 + ((y1 - y0) * k) / (nRows + 1));
    const eL = findEdge(lx1 - lx0, i => L[y * W + lx0 + i], sL, hw, lx1 - lx0 - hw);
    const eR = findEdge(rx1 - rx0, i => L[y * W + rx0 + i], sR, hw, rx1 - rx0 - hw);
    if (eL) leftPts.push([y, lx0 + eL.pos]);
    if (eR) rightPts.push([y, rx0 + eR.pos]);
  }

  // horizontal boundaries --------------------------------------------------
  const nCols = opt.cols || 18;
  const topPts = [], botPts = [];
  const trT = opt.topRange || yr, trB = opt.bottomRange || yr;
  const ty0 = Math.round(trT[0] * H), ty1 = Math.round(trT[1] * H);
  const by0 = Math.round(trB[0] * H), by1 = Math.round(trB[1] * H);
  const sT = signFor('top', opt.signTop);
  const sB = signFor('bottom', opt.signBottom);
  for (let k = 1; k <= nCols; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / (nCols + 1));
    const eT = findEdge(ty1 - ty0, i => L[(ty0 + i) * W + x], sT, hw, ty1 - ty0 - hw);
    const eB = findEdge(by1 - by0, i => L[(by0 + i) * W + x], sB, hw, by1 - by0 - hw);
    if (eT) topPts.push([x, ty0 + eT.pos]);
    if (eB) botPts.push([x, by0 + eB.pos]);
  }

  const lL = fitLine(leftPts), lR = fitLine(rightPts);
  const fT = fitLine(topPts), fB = fitLine(botPts);

  const ix = (lv, hv) => {
    const { m: m1, c: c1 } = lv, { m: m2, c: c2 } = hv;
    const y = (m2 * c1 + c2) / (1 - m1 * m2);
    return [m1 * y + c1, y];
  };

  const q = [ix(lL, fT), ix(lR, fT), ix(lR, fB), ix(lL, fB)]
    .map(([x, y]) => [Math.round(x * S), Math.round(y * S)]);

  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const topW = dist(q[0], q[1]), botW = dist(q[3], q[2]);
  const lH = dist(q[0], q[3]), rH = dist(q[1], q[2]);
  const tiltL = Math.atan((q[3][0] - q[0][0]) / (q[3][1] - q[0][1])) * 180 / Math.PI;
  const tiltR = Math.atan((q[2][0] - q[1][0]) / (q[2][1] - q[1][1])) * 180 / Math.PI;

  console.log(`# ${file}  analysed at ${W}x${H}, scale ${S.toFixed(3)}, piece=${piece}`);
  console.log(`  left  x = ${lL.m.toFixed(5)} y + ${lL.c.toFixed(2)}   (${leftPts.length} pts)`);
  console.log(`  right x = ${lR.m.toFixed(5)} y + ${lR.c.toFixed(2)}   (${rightPts.length} pts)`);
  console.log(`  top   y = ${fT.m.toFixed(5)} x + ${fT.c.toFixed(2)}   (${topPts.length} pts)`);
  console.log(`  bot   y = ${fB.m.toFixed(5)} x + ${fB.c.toFixed(2)}   (${botPts.length} pts)`);
  console.log('  QUAD(TL,TR,BR,BL) = ' + JSON.stringify(q));
  console.log(`  topW=${topW.toFixed(0)} botW=${botW.toFixed(0)} leftH=${lH.toFixed(0)} rightH=${rH.toFixed(0)}`);
  console.log(`  keystone=${(((topW - botW) / ((topW + botW) / 2)) * 100).toFixed(2)}%` +
    `  verticalTilt L=${tiltL.toFixed(2)}deg R=${tiltR.toFixed(2)}deg`);
})();
