'use strict';
/**
 * Studio compositor for the Jarghaa Furniture product photography.
 *
 *   node tools/studio.js [--quick] [id ...]
 *
 * For every photo configured in tools/prep.js this:
 *   1. honours EXIF orientation,
 *   2. removes the keystone (leaning) distortion with a projective warp so the
 *      piece reads as a true rectangle - the "shot from a proper angle" pass,
 *   3. grades exposure / white balance / colour, lifts local contrast so panel
 *      detail reads, and sharpens,
 *   4. REBUILDS THE BACKGROUND: the busy room or workshop behind the piece is
 *      replaced with a clean, seamless studio sweep (warm ivory to stone) with a
 *      soft light behind the piece and a contact shadow on the floor,
 *   5. renders several views from the single correction so the page can show the
 *      piece straight-on and in closer detail:
 *        <id>.jpg / .webp        1400x1200 (7:6)   product-grid card
 *        <id>-square.jpg         1200x1200 (1:1)   grid / social
 *        <id>-wide.jpg           1600x900  (16:9)  banner / slider
 *        <id>-detail.jpg         1200x1200 (1:1)   close "detail" view
 *        <id>-full.jpg           long edge 2000    master, studio sweep
 *        <id>-700.jpg / .webp    700x600           slider hero
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { warpQuads, loadRaw } = require('./lib/image');
const { PHOTOS, CARD } = require('./prep');

const OUT = path.join(__dirname, '..', 'out');
const SITE = path.join(__dirname, '..', 'images', 'products');
const QUICK = process.argv.includes('--quick');

/* ------------------------------ studio sweep ----------------------------- */
/** Seamless backdrop: warm ivory at the top falling to stone, light behind piece. */
function backdropSvg(W, H, light) {
  const { cx = 0.5, cy = 0.42, r = 0.62 } = light || {};
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#f6f2ec"/>` +
    `<stop offset="0.55" stop-color="#eee8df"/>` +
    `<stop offset="1" stop-color="#cfc7ba"/>` +
    `</linearGradient>` +
    `<radialGradient id="l" cx="${cx * 100}%" cy="${cy * 100}%" r="${r * 100}%">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>` +
    `<stop offset="60%" stop-color="#ffffff" stop-opacity="0.18"/>` +
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<rect width="100%" height="100%" fill="url(#l)"/>` +
    `</svg>`);
}

/** Soft contact shadow as a blurred rounded bar. */
async function shadowPng(w, h) {
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(h, w) / 2}" ` +
    `fill="#2b241c"/></svg>`);
  return sharp(svg).blur(Math.max(6, Math.round(h * 0.42))).png().toBuffer();
}

/** Blurred rounded-rect alpha mask that feathers the piece border into the sweep. */
async function featherPng(w, h, radius, fade) {
  const r = Math.max(2, Math.round(radius));
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  return sharp(svg).blur(Math.max(1, Math.round(fade))).png().toBuffer();
}

/* ------------------------------- correction ------------------------------ */
async function correct(cfg, maxEdge) {
  const { data, W, H, C } = await loadRaw(cfg.src, '#ffffff');
  const [pw, ph] = cfg.piece;
  const m = cfg.margins || { l: 0, r: 0, t: 0, b: 0 };
  const cap = maxEdge || 1e9;
  const s = Math.min(1, cap / Math.max(pw, ph));
  const cw = Math.round(pw * (1 + m.l + m.r) * s);
  const ch = Math.round(ph * (1 + m.t + m.b) * s);
  const dst = [
    [pw * m.l * s, ph * m.t * s],
    [pw * (1 + m.l) * s, ph * m.t * s],
    [pw * (1 + m.l) * s, ph * (1 + m.t) * s],
    [pw * m.l * s, ph * (1 + m.t) * s],
  ];
  const buf = warpQuads(data, W, H, C, dst, cfg.quad, cw, ch, [255, 255, 255]);
  return { buf, W: cw, H: ch };
}

function grade(input, cfg) {
  const g = cfg.grade || {};
  let s = input;
  if (g.median) s = s.median(g.median);
  if (g.wb) s = s.recomb([[g.wb[0], 0, 0], [0, g.wb[1], 0], [0, 0, g.wb[2]]]);
  if (g.linear) s = s.linear(g.linear[0], g.linear[1]);
  if (g.gamma && g.gamma !== 1) s = s.gamma(g.gamma);
  if (g.clahe) s = s.clahe(g.clahe);
  if (g.modulate) s = s.modulate(g.modulate);
  return s;
}

/* -------------------------------- compositing ---------------------------- */
/** Place the (graded) piece on the studio sweep at width W, height H. */
async function composeOnStudio(master, W, H, opts) {
  const padTop = opts.padTop, padSide = opts.padSide, padBottom = opts.padBottom;
  const availW = W - padSide * 2;
  const availH = H - padTop - padBottom;
  const meta = await sharp(master).metadata();
  const scale = Math.min(availW / meta.width, availH / meta.height);
  const fw = Math.max(1, Math.round(meta.width * scale));
  const fh = Math.max(1, Math.round(meta.height * scale));
  const left = Math.round((W - fw) / 2);
  const top = padTop + Math.round((availH - fh) / 2);

  const bg = await sharp(backdropSvg(W, H, opts.light)).png().toBuffer();

  const shW = Math.round(fw * 1.02);
  const shH = Math.max(10, Math.round(fh * 0.055));
  const shadow = await shadowPng(shW, shH);
  const shLeft = Math.round(left + (fw - shW) / 2);
  const shTop = Math.min(H - shH, Math.round(top + fh - shH * 0.62));

  const pieceTiny = await sharp(master).resize(fw, fh, { fit: 'fill' }).png().toBuffer();
  const feather = await featherPng(fw, fh, Math.round(Math.min(fw, fh) * 0.025),
    Math.max(2, Math.round(Math.min(fw, fh) * 0.004)));
  const pieceAlpha = await sharp(pieceTiny)
    .composite([{ input: feather, blend: 'dest-in' }])
    .png().toBuffer();

  return sharp(bg)
    .composite([
      { input: shadow, left: shLeft, top: shTop, blend: 'multiply' },
      { input: pieceAlpha, left, top },
    ])
    .toBuffer();
}

async function view(master, W, H, opts, grade, cfg) {
  const composed = await composeOnStudio(master, W, H, opts);
  return sharp(composed)
    .sharpen((grade && grade.sharpen) || { sigma: 0.9, m1: 0.7, m2: 0.45 })
    .toBuffer();
}


/* --------------------------------- build --------------------------------- */
async function build(cfg) {
  const cap = QUICK ? 900 : 2600;
  const { buf, W, H } = await correct(cfg, cap);
  const src = sharp(buf, { raw: { width: W, height: H, channels: 3 } });
  const master = await grade(src, cfg).png().toBuffer();

  const cardW = cfg.cardWidth || CARD.width;
  const cardH = Math.round(cardW / CARD.aspect);
  const style = {
    light: cfg.light || { cx: 0.5, cy: 0.40, r: 0.62 },
    padTop: Math.round(cardH * 0.075),
    padBottom: Math.round(cardH * 0.075),
    padSide: Math.round(cardW * 0.11),
  };

  const writes = [];
  const render = async (w, h, name, o) => {
    const b = await view(master, w, h, { ...style, ...(o && o.style) }, cfg.grade, cfg);
    writes.push({ name, buf: b, ...o });
  };

  await render(cardW, cardH, cfg.id, { jpg: true, webp: true });
  await render(1200, 1200, `${cfg.id}-square`, { jpg: true });
  await render(1600, 900, `${cfg.id}-wide`, { jpg: true });
  await render(700, 600, `${cfg.id}-700`, { jpg: true, webp: true,
    style: { padTop: 26, padBottom: 26, padSide: 60 } });

  // closer "detail" view: tighten onto the centre panels, then studio it
  const dm = await sharp(master)
    .resize(Math.round(W * 0.66), Math.round(H * 0.66), { fit: 'cover', position: 'centre' })
    .png().toBuffer();
  const detail = await view(dm, 1200, 1200, style, cfg.grade, cfg);
  writes.push({ name: `${cfg.id}-detail`, buf: detail, jpg: true });

  // master on the sweep, up to 2000 px on the long edge, no letterboxing
  const fullW = 2000;
  const fullH = Math.max(1200, Math.round(fullW * (H / W)));
  const full = await view(master, fullW, fullH,
    { ...style, padTop: Math.round(fullW * 0.02), padBottom: Math.round(fullW * 0.02), padSide: 0 },
    cfg.grade, cfg);
  writes.push({ name: `${cfg.id}-full`, buf: full, jpg: true });

  fs.mkdirSync(SITE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const o of writes) {
    if (o.jpg) {
      const b = await sharp(o.buf)
        .jpeg({ quality: 91, chromaSubsampling: '4:4:4', mozjpeg: true })
        .withMetadata({ density: 72 }).toBuffer();
      fs.writeFileSync(path.join(SITE, `${o.name}.jpg`), b);
      fs.writeFileSync(path.join(OUT, `${o.name}.jpg`), b);
    }
    if (o.webp) {
      await sharp(o.buf).webp({ quality: 88, effort: 5 }).toFile(path.join(SITE, `${o.name}.webp`));
    }
  }
  console.log(`${cfg.id.padEnd(26)} master ${W}x${H}  views: ` +
    writes.map((w) => w.name.replace(cfg.id, '')).join(' '));
}

(async () => {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const cfg of PHOTOS) {
    if (want.length && !want.includes(cfg.id)) continue;
    await build(cfg);
  }
})();

