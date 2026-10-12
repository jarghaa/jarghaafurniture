'use strict';
/**
 * Runner for the furniture photo pipeline. Config lives in tools/prep.js.
 *
 *   node tools/run-prep.js [id ...]
 *
 * Pipeline per photo:
 *   1. honour EXIF orientation
 *   2. projective (keystone) correction onto a true rectangle
 *   3. tone / colour grade
 *   4. optional vignette to settle the background
 *   5. letterbox onto a deep-emerald soft extension of the photo, with a
 *      hairline gold rule where the frame does not fill the card
 *   6. output: full-resolution master + 1400x1200 product card
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { warpQuads, loadRaw } = require('./lib/image');
const { PHOTOS, CARD, BRAND } = require('./prep');

const OUT = path.join(__dirname, '..', 'out');
const SITE = path.join(__dirname, '..', 'images', 'products');

async function correct(cfg) {
  const { data, W, H, C } = await loadRaw(cfg.src, '#ffffff');
  const [pw, ph] = cfg.piece;
  const m = cfg.margins;
  const cw = Math.round(pw * (1 + m.l + m.r));
  const ch = Math.round(ph * (1 + m.t + m.b));
  const dst = [
    [pw * m.l, ph * m.t],
    [pw * (1 + m.l), ph * m.t],
    [pw * (1 + m.l), ph * (1 + m.t)],
    [pw * m.l, ph * (1 + m.t)],
  ];
  const warped = warpQuads(data, W, H, C, dst, cfg.quad, cw, ch, [255, 255, 255]);
  return { buf: warped, W: cw, H: ch };
}

function grade(input, cfg) {
  const g = cfg.grade;
  let s = input;
  if (g.median) s = s.median(g.median);
  if (g.wb) s = s.recomb([[g.wb[0], 0, 0], [0, g.wb[1], 0], [0, 0, g.wb[2]]]);
  if (g.linear) s = s.linear(g.linear[0], g.linear[1]);
  if (g.gamma && g.gamma !== 1) s = s.gamma(g.gamma);
  if (g.clahe) s = s.clahe(g.clahe);
  if (g.modulate) s = s.modulate(g.modulate);
  return s;
}

/** Multiply a white-centre radial gradient over the image to settle the edges. */
async function vignette(buf, W, H, v) {
  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><radialGradient id="v" cx="50%" cy="50%" r="${v.r || 0.75}">` +
    `<stop offset="45%" stop-color="#ffffff"/>` +
    `<stop offset="100%" stop-color="${v.edge || '#8f8f8f'}"/>` +
    `</radialGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#v)"/></svg>`);
  return sharp(buf).composite([{ input: svg, blend: 'multiply' }]).png().toBuffer();
}

/** Deep-emerald tint over the blurred extension, plus an optional gold rule. */
function overlaySvg(W, H, box) {
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect width="100%" height="100%" fill="${BRAND.emeraldDeep}" fill-opacity="0.52"/>`;
  if (box) {
    const { left, top, w, h, bandX, bandY } = box;
    const g = BRAND.gold;
    const line = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${g}" stroke-opacity="0.65" stroke-width="1"/>`;
    if (bandX) { s += line(left, 0, left, H); s += line(left + w, 0, left + w, H); }
    if (bandY) { s += line(0, top, W, top); s += line(0, top + h, W, top + h); }
  }
  return Buffer.from(s + '</svg>');
}

async function build(cfg) {
  const { buf, W, H } = await correct(cfg);
  const rawIn = sharp(buf, { raw: { width: W, height: H, channels: 3 } });

  let master = await grade(rawIn, cfg).png().toBuffer();
  if (cfg.vignette) master = await vignette(master, W, H, cfg.vignette);

  await sharp(master)
    .jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true })
    .withMetadata({ density: 72 })
    .toFile(path.join(OUT, `${cfg.id}-master.jpg`));

  const targetW = cfg.cardWidth || CARD.width;
  const targetH = Math.round(targetW / CARD.aspect);
  const scale = Math.min(targetW / W, targetH / H);
  const fitW = Math.max(1, Math.round(W * scale));
  const fitH = Math.max(1, Math.round(H * scale));
  const left = Math.round((targetW - fitW) / 2);
  const top = Math.round((targetH - fitH) / 2);
  const bandX = targetW - fitW > 6;
  const bandY = targetH - fitH > 6;

  const fg = await sharp(master).resize(fitW, fitH, { fit: 'fill' }).png().toBuffer();
  const bg = await sharp(master)
    .resize(targetW, targetH, { fit: 'cover' })
    .blur(52)
    .modulate({ brightness: 0.60, saturation: 0.55 })
    .composite([{ input: overlaySvg(targetW, targetH, { left, top, w: fitW, h: fitH, bandX, bandY }) }])
    .png().toBuffer();

  const composed = await sharp(bg)
    .composite([{ input: fg, left, top }])
    .sharpen(cfg.grade.sharpen)
    .toBuffer();

  fs.mkdirSync(SITE, { recursive: true });
  const jpg = path.join(SITE, `${cfg.id}.jpg`);
  const webp = path.join(SITE, `${cfg.id}.webp`);
  await sharp(composed).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .withMetadata({ density: 72 }).toFile(jpg);
  await sharp(composed).webp({ quality: 88, effort: 5 }).toFile(webp);
  await sharp(composed).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
    .withMetadata({ density: 72 }).toFile(path.join(OUT, `${cfg.id}.jpg`));

  const st = fs.statSync(jpg);
  console.log(`${cfg.id.padEnd(28)} master ${W}x${H} -> card ${targetW}x${targetH} ` +
    `(photo ${fitW}x${fitH}) jpg ${(st.size / 1024).toFixed(0)}kB webp ` +
    `${(fs.statSync(webp).size / 1024).toFixed(0)}kB`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const want = process.argv.slice(2);
  for (const cfg of PHOTOS) {
    if (want.length && !want.includes(cfg.id)) continue;
    await build(cfg);
  }
})();
