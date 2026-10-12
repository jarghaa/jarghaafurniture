'use strict';
/**
 * Wires the retouched wardrobe photography into the wardrobe-shaped slots.
 *
 *   node tools/wire-images.js
 *
 * Structure-aware and idempotent: it locates slots by the product label and
 * by the accordion category name rather than by line number, so it can be
 * re-run safely. Every slot it knows about is normalised to its desired
 * state, so a slot deliberately left as a placeholder is reset if it was
 * previously overwritten.
 *
 * Only slots that actually depict wardrobes are given real photography. The
 * Beds, Dining Tables, Sofas and Kitchens slots keep their placeholders,
 * because there is no photography for those yet.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const PLACEHOLDER =
  '<img loading="lazy" decoding="async" src="images/slider-img.png" ' +
  'alt="Handmade wooden chair built by Jarghaa Furniture in Lalitpur">';

const PHOTO = {
  espresso: { file: 'wardrobe-espresso', w: 1400, h: 1200,
    alt: 'Four-door espresso wardrobe with top cabinets, made to measure by Jarghaa Furniture in Lalitpur' },
  teak: { file: 'wardrobe-teak-workshop', w: 1400, h: 1200,
    alt: 'Solid teak four-door wardrobe with top cabinets, built in the Jarghaa Furniture workshop' },
  laminate: { file: 'wardrobe-laminate-sliding', w: 1400, h: 1200,
    alt: 'Laminate sliding-door wardrobe with a matching dresser unit by Jarghaa Furniture' },
  walnut: { file: 'wardrobe-walnut-mirror', w: 1400, h: 1200,
    alt: 'Walnut wall wardrobe with mirror and dresser unit by Jarghaa Furniture' },
  hero: { file: 'wardrobe-espresso-700', w: 700, h: 600,
    alt: 'Four-door espresso wardrobe with top cabinets, made to measure by Jarghaa Furniture in Lalitpur' },
};

/** Desired state, keyed by product-card label and accordion category. */
const PLAN = {
  'index.html': {
    products: { Beds: null, Wardrobes: 'espresso', 'Dining Tables': null, Sofas: null },
    panel: { category: 'Wardrobes & Drawers', tiles: ['espresso', 'teak', 'laminate', 'walnut'] },
    slider: { 'Beds & Wardrobes': 'hero' },
  },
  'shop.html': {
    products: { Beds: null, Wardrobes: 'espresso', 'Dining Tables': null, Sofas: null },
  },
  'furniture.html': {
    panel: { category: 'Wardrobes & Drawers', tiles: ['espresso', 'teak', 'laminate', 'walnut'] },
  },
};

/* --------------------------- tiny HTML helpers --------------------------- */

/** Index just past the </div> that closes the <div ...> starting at `open`. */
function matchDiv(html, open) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = open;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') { depth--; if (depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  throw new Error('unbalanced <div> at ' + open);
}

/** All [start,end) spans of `<div class="img-box">...</div>` inside `html`. */
function imgBoxes(html) {
  const spans = [];
  const re = /<div class="img-box">/g;
  let m;
  while ((m = re.exec(html))) spans.push([m.index, matchDiv(html, m.index)]);
  return spans;
}

function indentOf(html, at) {
  const lineStart = html.lastIndexOf('\n', at) + 1;
  return html.slice(lineStart, at).match(/^[ \t]*/)[0];
}

/** Inner markup for an img-box at `indent` + two spaces. */
function inner(key, indent) {
  const pad = indent + '  ';
  if (!key) return '\n' + pad + PLACEHOLDER + '\n' + indent;
  const p = PHOTO[key];
  return '\n' + pad + '<picture>\n' +
    pad + '  <source type="image/webp" srcset="images/products/' + p.file + '.webp">\n' +
    pad + '  <img loading="lazy" decoding="async" src="images/products/' + p.file + '.jpg" ' +
    'width="' + p.w + '" height="' + p.h + '" alt="' + p.alt + '">\n' +
    pad + '</picture>\n' + indent;
}

/** Replace the contents of the img-box starting at `start`. */
function rewrite(html, start, key) {
  const end = matchDiv(html, start);
  const openTag = '<div class="img-box">';
  const indent = indentOf(html, start);
  const innerStart = start + openTag.length;
  const innerEnd = html.lastIndexOf('</div>', end);
  return html.slice(0, innerStart) + inner(key, indent) + html.slice(innerEnd);
}

/* ------------------------------- passes -------------------------------- */

let applied = 0;

function wireProducts(html, plan) {
  const marker = '<div class="brand_container';
  const at = html.indexOf(marker);
  if (at < 0) return html;
  const end = matchDiv(html, at);
  let block = html.slice(at, end);
  const base = at;
  // walk the child .box blocks, matching the label to the plan
  const boxRe = /<div class="box">/g;
  let m; const edits = [];
  while ((m = boxRe.exec(block))) {
    const bEnd = matchDiv(block, m.index);
    const inner = block.slice(m.index, bEnd);
    const label = (inner.match(/<h6>\s*([^<]*?)\s*<\/h6>/) || [])[1];
    if (label === undefined) continue;
    const want = plan[label];
    const boxes = imgBoxes(inner);
    if (!boxes.length) continue;
    edits.push([m.index + boxes[0][0], want]);
  }
  edits.reverse().forEach(([pos, want]) => {
    block = rewrite(block, pos, want);
    applied++;
  });
  return html.slice(0, base) + block + html.slice(end);
}

function wirePanel(html, plan) {
  // map category name -> collapse id via the tab links
  const linkRe = /<div class="t-link-box[^"]*"[^>]*data-target="#(["]+?)"|/g;
  const map = {};
  const re = /data-target="#(collapse\w+)"([\s\S]{0,600}?)<div class="t-name">\s*<h5>\s*([^<]*?)\s*<\/h5>/g;
  let m;
  while ((m = re.exec(html))) map[m[3].replace(/&amp;/g, '&')] = m[1];
  const id = map[plan.category];
  if (!id) throw new Error('no accordion panel named ' + plan.category);
  const at = html.search(new RegExp('<div class="collapse[^"]*" id="' + id + '"'));
  if (at < 0) throw new Error('no collapse block ' + id);
  const end = matchDiv(html, at);
  let block = html.slice(at, end);
  const spans = imgBoxes(block);
  if (spans.length !== plan.tiles.length) {
    throw new Error(`${id}: expected ${plan.tiles.length} tiles, found ${spans.length}`);
  }
  spans.slice().reverse().forEach(([start], i) => {
    block = rewrite(block, start, plan.tiles[i]);
    applied++;
  });
  return html.slice(0, at) + block + html.slice(end);
}

function wireSlider(html, plan) {
  const at = html.indexOf('<section class="slider_section');
  if (at < 0) return html;
  const end = html.indexOf('</section>', at);
  let block = html.slice(at, end);
  const items = [];
  const re = /<div class="carousel-item[^"]*">/g;
  let m;
  while ((m = re.exec(block))) items.push(m.index);
  const edits = [];
  items.forEach((start, i) => {
    const stop = i + 1 < items.length ? items[i + 1] : block.length;
    const seg = block.slice(start, stop);
    const heading = (seg.match(/<h1>\s*([\s\S]*?)<\/h1>/) || [])[1];
    if (!heading) return;
    const text = heading.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const want = plan[text];
    if (want === undefined) return;
    const boxes = imgBoxes(seg);
    if (!boxes.length) return;
    edits.push([start + boxes[0][0], want]);
  });
  edits.reverse().forEach(([pos, want]) => {
    block = rewrite(block, pos, want);
    applied++;
  });
  return html.slice(0, at) + block + html.slice(end);
}

for (const [file, plan] of Object.entries(PLAN)) {
  const p = path.join(ROOT, file);
  let html = fs.readFileSync(p, 'utf8');
  if (plan.products) html = wireProducts(html, plan.products);
  if (plan.panel) html = wirePanel(html, plan.panel);
  if (plan.slider) html = wireSlider(html, plan.slider);
  fs.writeFileSync(p, html);
  console.log(file + ': normalised');
}
console.log(applied + ' slots written');
