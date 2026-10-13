'use strict';
/* Preview: warp each piece to a clean rectangle (no margins) so we can judge
 * whether the measured quad isolates the furniture from its room background. */
const path = require('path');
const sharp = require('sharp');
const { warpQuads, loadRaw } = require('./lib/image');
const { PHOTOS } = require('./prep');

const OUT = path.join(__dirname, '..', 'work');
const MAX = 700;

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  for (const cfg of PHOTOS) {
    const { data, W, H, C } = await loadRaw(cfg.src, '#ffffff');
    const [pw, ph] = cfg.piece;
    const scale = Math.min(1, MAX / Math.max(pw, ph));
    const cw = Math.round(pw * scale), ch = Math.round(ph * scale);
    const dst = [[0, 0], [cw, 0], [cw, ch], [0, ch]];
    const buf = warpQuads(data, W, H, C, dst, cfg.quad, cw, ch, [255, 0, 255]);
    await sharp(buf, { raw: { width: cw, height: ch, channels: 3 } })
      .png().toFile(path.join(OUT, `piece-${cfg.id}.png`));
    console.log(cfg.id, `src ${W}x${H}`, `piece ${pw}x${ph}`, '->', `${cw}x${ch}`);
  }
})();
