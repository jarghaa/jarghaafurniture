'use strict';
/**
 * Replaces the small Google Maps iframe in the site footer with opening hours
 * and a directions link.
 *
 *   node tools/trim-footer-map.js
 *
 * The contact page already carries a full-width, interactive map, so the
 * footer copy was a duplicate there. It was also the heaviest thing on every
 * page - an embedded Maps iframe. The footer is identical on all five pages,
 * so all five are updated together to keep it that way.
 *
 * Idempotent: pages that no longer contain the footer map are skipped.
 */
const fs = require('fs');
const path = require('path')

const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'about.html', 'shop.html', 'furniture.html', 'contact.html'];

const REPLACEMENT = [
  '            <ul class="footer_hours">',
  '              <li><span>Sunday &ndash; Friday</span><span>7 AM &ndash; 7 PM</span></li>',
  '              <li><span>Saturday</span><span>Closed</span></li>',
  '            </ul>',
  '            <p class="footer_more">',
  '              <a href="https://www.google.com/maps/dir/?api=1&amp;destination=Jarghaa+Furniture+Gyan+Marg+Lalitpur" target="_blank" rel="noopener">Get directions &rarr;</a>',
  '            </p>',
].join('\n');

let touched = 0;
for (const page of PAGES) {
  const p = path.join(ROOT, page);
  let html = fs.readFileSync(p, 'utf8');

  const start = html.indexOf('<section class="info_section');
  const end = html.indexOf('<!-- end info_section -->');
  if (start < 0 || end < 0) { console.log(`${page}: no info_section, skipped`); continue; }

  const section = html.slice(start, end);
  const mapStart = section.indexOf('<div class="map_container">');
  if (mapStart < 0) { console.log(`${page}: footer map already gone, skipped`); continue; }

  // find the </div> that closes it
  const re = /<div\b|<\/div>/g;
  re.lastIndex = mapStart;
  let depth = 0, m, mapEnd = -1;
  while ((m = re.exec(section))) {
    if (m[0] === '</div>') { depth--; if (depth === 0) { mapEnd = m.index + m[0].length; break; } }
    else depth++;
  }
  if (mapEnd < 0) throw new Error(page + ': unbalanced footer map div');

  const headingFrom = section.lastIndexOf('<h5>', mapStart);
  let updated = section.slice(0, mapStart) + REPLACEMENT + section.slice(mapEnd);
  // rename the column heading: it no longer holds a map
  if (headingFrom >= 0) {
    const before = updated.slice(0, headingFrom);
    const after = updated.slice(headingFrom);
    updated = before + after.replace(/<h5>\s*Find us\s*<\/h5>/, '<h5>\n              Opening hours\n            </h5>');
  }

  fs.writeFileSync(p, html.slice(0, start) + updated + html.slice(end));
  touched++;
  console.log(`${page}: footer map replaced`);
}
console.log(touched + ' page(s) updated');
