'use strict';
/**
 * Core image helpers for the furniture photo retouch pipeline.
 *
 * libvips/sharp only exposes affine transforms, which cannot fix keystone
 * distortion (a wardrobe photographed slightly off-axis renders as a
 * trapezoid). So the projective (homography) warp is implemented here over
 * the raw pixel buffer.
 */
const sharp = require('sharp');

sharp.cache(false);
sharp.concurrency(1);

/* ---------------------------- linear algebra ---------------------------- */

/** Gaussian elimination with partial pivoting on an n x (n+1) augmented matrix. */
function solveLinear(m, n) {
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    }
    if (Math.abs(m[piv][col]) < 1e-12) throw new Error('singular transform');
    if (piv !== col) { const t = m[piv]; m[piv] = m[col]; m[col] = t; }
    const d = m[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Homography that maps dstQuad (4 [x,y] points) onto srcQuad.
 * Both quads are ordered TL, TR, BR, BL.
 */
function homographyQuads(dstQuad, srcQuad) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dstQuad[i];
    const [x, y] = srcQuad[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  const h = solveLinear(A, 8);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function applyH(h, u, v) {
  const w = h[6] * u + h[7] * v + h[8];
  return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}

/* ------------------------------- sampling ------------------------------- */

function sampleBilinear(buf, W, H, C, x, y, out, o) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = Math.min(Math.max(xi, 0), W - 1);
  const x1 = Math.min(Math.max(xi + 1, 0), W - 1);
  const y0 = Math.min(Math.max(yi, 0), H - 1);
  const y1 = Math.min(Math.max(yi + 1, 0), H - 1);
  const i00 = (y0 * W + x0) * C, i10 = (y0 * W + x1) * C;
  const i01 = (y1 * W + x0) * C, i11 = (y1 * W + x1) * C;
  const w00 = (1 - xf) * (1 - yf), w10 = xf * (1 - yf);
  const w01 = (1 - xf) * yf, w11 = xf * yf;
  for (let c = 0; c < C; c++) {
    out[o + c] = buf[i00 + c] * w00 + buf[i10 + c] * w10 +
      buf[i01 + c] * w01 + buf[i11 + c] * w11;
  }
}

/**
 * Projective warp. Maps dstQuad (in output pixel space) onto srcQuad
 * (in source pixel space).
 */
function warpQuads(buf, W, H, C, dstQuad, srcQuad, outW, outH, fill) {
  const h = homographyQuads(dstQuad, srcQuad);
  const out = Buffer.alloc(outW * outH * C);
  const bg = fill || [0, 0, 0];
  const px = new Float64Array(C);
  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const o = (v * outW + u) * C;
      const [sx, sy] = applyH(h, u + 0.5, v + 0.5);
      if (sx < -0.5 || sy < -0.5 || sx > W - 0.5 || sy > H - 0.5) {
        for (let c = 0; c < C; c++) out[o + c] = bg[c % bg.length];
        continue;
      }
      sampleBilinear(buf, W, H, C, sx - 0.5, sy - 0.5, px, 0);
      for (let c = 0; c < C; c++) out[o + c] = Math.round(px[c]);
    }
  }
  return out;
}

/** Load an image EXIF-rotated, flattened onto a background, as raw sRGB. */
async function loadRaw(file, background) {
  const { data, info } = await sharp(file, { failOn: 'none' })
    .rotate()
    .flatten({ background: background || '#ffffff' })
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}

module.exports = { homographyQuads, applyH, warpQuads, sampleBilinear, loadRaw, solveLinear };
