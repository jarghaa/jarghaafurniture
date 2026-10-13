'use strict';
/**
 * Builds Facebook-ready marketing assets from the retouched product photos.
 *
 *   node tools/social.js
 *
 * Output (in social/):
 *   fb-cover-1640x856.jpg        page cover
 *   fb-post-<piece>-1080.jpg     square product post (after)
 *   fb-before-<piece>-1080.jpg   the original upload, for before/after carousels
 *   fb-story-<piece>-1080x1920.jpg  vertical story
 *   fb-profile-1024.jpg          square profile crop of the logo
 *
 * No live text is drawn (the build image has no fonts), so everything is
 * composed from the photography and the existing logo artwork.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'social');
const p = (...a) => path.join(ROOT, ...a);

const EMERALD = '#0e231b';
const EMERALD_MID = '#12402e';
const GOLD = '#c9a24b';

const PIECES = [
  { key: 'espresso', id: 'wardrobe-espresso', src: 'uploads/original-1.jpg' },
  { key: 'teak', id: 'wardrobe-teak-workshop', src: 'uploads/original-2.jpg' },
  { key: 'laminate', id: 'wardrobe-laminate-sliding', src: 'uploads/original-3.jpg' },
  { key: 'walnut', id: 'wardrobe-walnut-mirror', src: 'uploads/original-4.jpg' },
];

async function logo(file, width) {
  const buf = await sharp(p(file)).resize({ width }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, w: meta.width, h: meta.height };
}

/** Emerald sweep with a soft radial lift, used behind the story/profile art. */
function sweep(W, H) {
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<linearGradient id="b" x1="0" y1="0" x2="0.4" y2="1">` +
    `<stop offset="0" stop-color="${EMERALD_MID}"/>` +
    `<stop offset="1" stop-color="${EMERALD}"/>` +
    `</linearGradient>` +
    `<radialGradient id="r" cx="28%" cy="30%" r="80%">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>` +
    `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient>` +
    `</defs>` +
    `<rect width="100%" height="100%" fill="url(#b)"/>` +
    `<rect width="100%" height="100%" fill="url(#r)"/>` +
    `<rect x="0" y="0" width="${W}" height="6" fill="${GOLD}"/>` +
    `</svg>`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  /* ------------------------------- cover -------------------------------- */
  {
    const W = 1640, H = 856;
    const base = await sharp(p('images/products/wardrobe-espresso-wide.jpg'))
      .resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();
    const shade = Buffer.from(
      `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${EMERALD}" stop-opacity="0.97"/>` +
      `<stop offset="0.32" stop-color="${EMERALD}" stop-opacity="0.86"/>` +
      `<stop offset="0.60" stop-color="${EMERALD}" stop-opacity="0.18"/>` +
      `<stop offset="1" stop-color="${EMERALD}" stop-opacity="0.12"/>` +
      `</linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#s)"/>` +
      `<rect x="0" y="0" width="${W}" height="7" fill="${GOLD}"/></svg>`);
    const lg = await logo('images/logo-horizontal-light.svg', 520);
    await sharp(base)
      .composite([
        { input: shade, top: 0, left: 0 },
        { input: lg.buf, top: Math.round((H - lg.h) / 2), left: 130 },
      ])
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(path.join(OUT, 'fb-cover-1640x856.jpg'));
    console.log('fb-cover-1640x856.jpg');
  }

  /* --------------------------- square posts ----------------------------- */
  for (const pc of PIECES) {
    await sharp(p('images/products', `${pc.id}-square.jpg`))
      .resize(1080, 1080, { fit: 'cover' })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(path.join(OUT, `fb-post-${pc.key}-1080.jpg`));

    await sharp(p(pc.src), { failOn: 'none' })
      .rotate()
      .resize(1080, 1080, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(path.join(OUT, `fb-before-${pc.key}-1080.jpg`));
    console.log(`fb-post-${pc.key}-1080.jpg  fb-before-${pc.key}-1080.jpg`);
  }

  /* ------------------------------- story -------------------------------- */
  {
    const W = 1080, H = 1920;
    const bg = await sharp(sweep(W, H)).png().toBuffer();
    const shot = await sharp(p('images/products/wardrobe-walnut-mirror-square.jpg'))
      .resize(900, 900, { fit: 'cover' }).png().toBuffer();
    const mark = await logo('images/logo-symbol-light.svg', 132);
    await sharp(bg)
      .composite([
        { input: shot, top: 430, left: Math.round((W - 900) / 2) },
        { input: mark.buf, top: 60, left: Math.round((W - mark.w) / 2) },
      ])
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(path.join(OUT, 'fb-story-1080x1920.jpg'));
    console.log('fb-story-1080x1920.jpg');
  }

  /* ------------------------------ profile ------------------------------- */
  {
    const W = 1024, H = 1024;
    const bg = await sharp(sweep(W, H)).png().toBuffer();
    const mark = await logo('images/logo-stacked-light.svg', 620);
    await sharp(bg)
      .composite([{ input: mark.buf, top: Math.round((H - mark.h) / 2), left: Math.round((W - mark.w) / 2) }])
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toFile(path.join(OUT, 'fb-profile-1024.jpg'));
    console.log('fb-profile-1024.jpg');
  }

  console.log('\ndone -> ' + path.relative(ROOT, OUT) + '/');
})();
