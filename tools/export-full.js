'use strict';
/** Writes the corrected, un-framed photos (no letterbox) for other placements. */
const path = require('path');
const sharp = require('sharp');
const { PHOTOS } = require('./prep');

const SITE = path.join(__dirname, '..', 'images', 'products');

(async () => {
  for (const cfg of PHOTOS) {
    const src = path.join(__dirname, '..', 'out', `${cfg.id}-master.jpg`);
    const out = path.join(SITE, `${cfg.id}-full.jpg`);
    const m = await sharp(src).metadata();
    const scale = Math.min(1, 2000 / Math.max(m.width, m.height));
    await sharp(src)
      .resize(Math.round(m.width * scale), Math.round(m.height * scale), { fit: 'fill' })
      .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
      .withMetadata({ density: 72 })
      .toFile(out);
    const o = await sharp(out).metadata();
    console.log(`${cfg.id}-full.jpg  ${o.width}x${o.height}`);
  }
})();
