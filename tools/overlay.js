'use strict';
/**
 * Draws a proposed quad (plus a 10% reference grid) onto a photo so the
 * perspective-correction corners can be verified by eye.
 *
 *   node tools/overlay.js <image> '<quad json>' <out.jpg> [previewWidth]
 */
const sharp = require('sharp');

(async () => {
  const [file, quadJson, out, pwArg] = process.argv.slice(2);
  const quad = JSON.parse(quadJson);
  const meta = await sharp(file, { failOn: 'none' }).metadata();
  const W = (meta.orientation || 1) >= 5 ? meta.height : meta.width;
  const H = (meta.orientation || 1) >= 5 ? meta.width : meta.height;
  const pw = Number(pwArg) || 900;
  const s = pw / W;
  const p = ([x, y]) => [x * s, y * s];
  const q = quad.map(p);
  const h = Math.round(H * s);

  const names = ['TL', 'TR', 'BR', 'BL'];
  let svg = `<svg width="${pw}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  // reference grid
  for (let i = 1; i < 10; i++) {
    svg += `<line x1="${(pw * i) / 10}" y1="0" x2="${(pw * i) / 10}" y2="${h}" stroke="#00b0ff" stroke-width="1" opacity="0.35"/>`;
    svg += `<line x1="0" y1="${(h * i) / 10}" x2="${pw}" y2="${(h * i) / 10}" stroke="#00b0ff" stroke-width="1" opacity="0.35"/>`;
  }
  svg += `<polygon points="${q.map(c => c.join(',')).join(' ')}" fill="none" stroke="#ff2bd6" stroke-width="3"/>`;
  // extended verticals / horizontals to judge straightness
  svg += `<line x1="${q[0][0]}" y1="0" x2="${q[3][0]}" y2="${h}" stroke="#ff2bd6" stroke-width="1" opacity="0.6" stroke-dasharray="6 6"/>`;
  svg += `<line x1="${q[1][0]}" y1="0" x2="${q[2][0]}" y2="${h}" stroke="#ff2bd6" stroke-width="1" opacity="0.6" stroke-dasharray="6 6"/>`;
  svg += `<line x1="0" y1="${q[0][1]}" x2="${pw}" y2="${q[1][1]}" stroke="#ff2bd6" stroke-width="1" opacity="0.6" stroke-dasharray="6 6"/>`;
  svg += `<line x1="0" y1="${q[3][1]}" x2="${pw}" y2="${q[2][1]}" stroke="#ff2bd6" stroke-width="1" opacity="0.6" stroke-dasharray="6 6"/>`;
  q.forEach((c, i) => {
    svg += `<circle cx="${c[0]}" cy="${c[1]}" r="7" fill="none" stroke="#ffd400" stroke-width="3"/>`;
    svg += `<text x="${c[0] + 10}" y="${c[1] - 8}" font-size="22" font-family="monospace" fill="#ffd400" stroke="#000" stroke-width="0.6">${names[i]} ${Math.round(quad[i][0])},${Math.round(quad[i][1])}</text>`;
  });
  svg += '</svg>';

  await sharp(file, { failOn: 'none' })
    .rotate()
    .resize({ width: pw })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 84 })
    .toFile(out);
  console.log('wrote', out);
})();
