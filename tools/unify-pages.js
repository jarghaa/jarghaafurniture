'use strict';
/**
 * Brings every page up to the same standard as the revamped contact page.
 *
 *   node tools/unify-pages.js
 *
 * Three jobs:
 *   1. gives each sub-page a page banner (breadcrumb + h1 + lead), the same
 *      header treatment the contact page uses
 *   2. replaces the placeholder-only enquiry form that was duplicated on
 *      index/about/shop/furniture with the labelled, inline-validated version
 *   3. swaps the alert()-based form script for the accessible one
 *
 * Idempotent: blocks are located by their comment markers and re-running
 * rewrites them to the same content.
 *
 * The home page keeps its hero slider instead of a banner - it already has a
 * page-level h1 and a full-height hero.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ */
/* page banners                                                        */
/* ------------------------------------------------------------------ */

const BANNERS = {
  'about.html': {
    crumb: 'About',
    title: 'About Jarghaa Furniture',
    lead: 'A family woodworking business in Lalitpur. The people who measure, cut, join and finish your piece are the people whose name is on it.',
  },
  'shop.html': {
    crumb: 'Products',
    title: 'Our Products',
    lead: 'These are the pieces we are asked for most. Every one can be made in a different size, wood or finish, so use them as a starting point rather than a fixed catalogue.',
  },
  'furniture.html': {
    crumb: 'Furniture',
    title: 'Our Furniture',
    lead: 'Everything here is made in our own workshop and sized to your room. Tell us the piece, the wood and the measurement, and we will build it.',
  },
};

function banner(crumb, title, lead) {
  return `  <!-- page banner -->

  <section class="page_banner">
    <div class="container">
      <nav class="crumb" aria-label="Breadcrumb">
        <a href="index.html">Home</a>
        <span aria-hidden="true">&rsaquo;</span>
        <span aria-current="page">${crumb}</span>
      </nav>
      <h1>${title}</h1>
      <p class="banner_lead">
        ${lead}
      </p>
    </div>
  </section>

  <!-- end page banner -->`;
}

/* ------------------------------------------------------------------ */
/* shared enquiry block (same markup the contact page now uses)         */
/* ------------------------------------------------------------------ */

const CONTACT_STRIP = `  <!-- contact strip -->

  <section class="quote_section layout_padding">
    <div class="container">
      <div class="heading_container">
        <h2>
          Contact Us
        </h2>
      </div>
      <p class="section_lead">
        Tell us what you need and we will build it to fit your space. Send a WhatsApp message, call us, or drop into the showroom with a photo or a rough size.
      </p>
      <div class="row">
        <div class="col-lg-7">
          <h3 class="enquiry_heading">Request a free quote</h3>
          <form class="enquiry_form" id="enquiryForm" novalidate>
            <div class="row">
              <div class="col-md-6">
                <label for="eqName">Your name <span class="req">*</span></label>
                <input type="text" id="eqName" name="name" autocomplete="name" required>
              </div>
              <div class="col-md-6">
                <label for="eqPhone">Phone / WhatsApp <span class="req">*</span></label>
                <input type="tel" id="eqPhone" name="phone" autocomplete="tel" required>
              </div>
              <div class="col-md-6">
                <label for="eqItem">What do you need?</label>
                <input type="text" id="eqItem" name="item" placeholder="Bed, wardrobe, dining table...">
              </div>
              <div class="col-md-6">
                <label for="eqPlace">Where are you?</label>
                <input type="text" id="eqPlace" name="area" placeholder="Area or town (optional)">
              </div>
              <div class="col-12">
                <label for="eqMsg">Details</label>
                <textarea id="eqMsg" name="details" placeholder="Size, wood, finish, budget, deadline..."></textarea>
              </div>
              <div class="col-12">
                <button type="submit" class="brand-btn">Send on WhatsApp</button>
                <p class="form_status" id="formStatus" role="status" aria-live="polite"></p>
                <p class="form-note">
                  Prefer to talk? Call <a href="tel:9763603482">976-3603482</a>. We are open Sunday to Friday, 7 AM to 7 PM.
                </p>
              </div>
            </div>
          </form>
        </div>
        <div class="col-lg-5">
          <div class="showroom_panel">
            <h3>Find the showroom</h3>
            <address>
              Jarghaa Furniture<br>
              Gyan Marg, Lalitpur<br>
              Bagmati Province 44700, Nepal
            </address>
            <ul class="showroom_meta">
              <li><span>Sunday &ndash; Friday</span><span>7 AM &ndash; 7 PM</span></li>
              <li><span>Saturday</span><span>Closed</span></li>
            </ul>
            <div class="map_container">
              <iframe title="Map showing the Jarghaa Furniture showroom on Gyan Marg, Lalitpur"
                src="https://www.google.com/maps?q=Jarghaa+Furniture+Gyan+Marg+Lalitpur&amp;output=embed"
                width="600" height="300" frameborder="0" style="border:0; width: 100%; height:100%"
                loading="lazy" allowfullscreen></iframe>
            </div>
            <a class="brand-btn"
              href="https://www.google.com/maps/dir/?api=1&amp;destination=Jarghaa+Furniture+Gyan+Marg+Lalitpur"
              target="_blank" rel="noopener">Get directions</a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- end contact strip -->`;

/* ------------------------------------------------------------------ */
/* the accessible form script (same as the contact page)               */
/* ------------------------------------------------------------------ */

const FORM_JS = `  <script>
    (function () {
      var form = document.getElementById('enquiryForm');
      if (!form) return;
      var status = document.getElementById('formStatus');
      var field = function (id) { return document.getElementById(id); };

      function setError(el, on) {
        el.classList.toggle('field_error', on);
        el.setAttribute('aria-invalid', on ? 'true' : 'false');
      }
      function say(message, ok) {
        status.textContent = message;
        status.classList.toggle('is_error', !ok);
        status.classList.toggle('is_ok', !!ok);
      }

      form.addEventListener('input', function (e) {
        if (e.target && e.target.classList) setError(e.target, false);
        say('', true);
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = field('eqName').value.trim();
        var phone = field('eqPhone').value.trim();
        var item = field('eqItem').value.trim();
        var area = field('eqPlace').value.trim();
        var details = field('eqMsg').value.trim();

        var bad = [];
        if (!name) { setError(field('eqName'), true); bad.push(field('eqName')); }
        if (!phone) { setError(field('eqPhone'), true); bad.push(field('eqPhone')); }
        if (bad.length) {
          say('Please add your name and a phone number so we can reply.', false);
          bad[0].focus();
          return;
        }

        var lines = ['Hello Jarghaa Furniture, I would like a quote.', 'Name: ' + name, 'Phone: ' + phone];
        if (item) lines.push('Item: ' + item);
        if (area) lines.push('Area: ' + area);
        if (details) lines.push('Details: ' + details);

        var url = 'https://wa.me/9779851062357?text=' + encodeURIComponent(lines.join('\\n'));
        var win = window.open(url, '_blank');
        say(win
          ? 'WhatsApp is opening with your details - press send there to reach us.'
          : 'Please allow pop-ups for this site, or message us directly on WhatsApp.', !!win);
      });
    })();
  </script>`;

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

/** Insert (or refresh) the page banner just after the header block. */
function applyBanner(html, cfg) {
  const built = banner(cfg.crumb, cfg.title, cfg.lead);
  const existing = html.indexOf('  <!-- page banner -->');
  if (existing >= 0) {
    const end = html.indexOf('  <!-- end page banner -->') + '  <!-- end page banner -->'.length;
    return html.slice(0, existing) + built + html.slice(end);
  }
  const anchor = html.indexOf('  <!-- end header section -->');
  if (anchor < 0) throw new Error('header end marker not found');
  const close = html.indexOf('</div>', anchor) + '</div>'.length;
  return html.slice(0, close) + '\n\n' + built + html.slice(close);
}

/** Swap the old placeholder-only enquiry block for the shared strip. */
function applyContactStrip(html) {
  // accept the original markers or the ones this script writes, so that a
  // second run rewrites the block instead of failing
  const pairs = [
    ['  <!-- contact strip -->', '  <!-- end contact strip -->'],
    ['  <!-- contact section -->', '  <!-- end contact section -->'],
  ];
  for (const [open, close] of pairs) {
    const s = html.indexOf(open);
    if (s < 0) continue;
    const e = html.indexOf(close, s);
    if (e < 0) continue;
    return html.slice(0, s) + CONTACT_STRIP + html.slice(e + close.length);
  }
  throw new Error('contact block markers not found');
}

/** Swap the alert()-based form script for the accessible one. */
function applyFormJs(html) {
  const start = "  <script>\n    (function () {\n      var form = document.getElementById('enquiryForm');";
  const s = html.indexOf(start);
  if (s < 0) throw new Error('enquiry form script not found');
  const endMarker = '    })();\n  </script>';
  const e = html.indexOf(endMarker, s);
  if (e < 0) throw new Error('closing script tag not found');
  return html.slice(0, s) + FORM_JS + html.slice(e + endMarker.length);
}

/** Remove a section heading that merely repeats the new banner title. */
function dropRepeatedHeading(html, needle) {
  if (!html.includes(needle)) return html; // already removed on an earlier run
  return html.replace(needle, '');
}

const SHOP_INTRO = `      <div class="heading_container">
        <h2>
          Our Products
        </h2>
      </div>
      <p class="section_lead">
        These are the pieces we are asked for most. Every one can be made in a different size, wood or finish, so use them as a starting point rather than a fixed catalogue.
      </p>
`;

const ABOUT_INTRO = `            <div class="heading_container">
              <h2>
                About Us
              </h2>

            </div>
`;

const TARGETS = ['index.html', 'about.html', 'shop.html', 'furniture.html'];

for (const page of TARGETS) {
  const p = path.join(ROOT, page);
  let html = fs.readFileSync(p, 'utf8');
  const before = html;

  if (BANNERS[page]) {
    const b = BANNERS[page];
    html = applyBanner(html, b);
  }
  if (page === 'shop.html') html = dropRepeatedHeading(html, SHOP_INTRO);
  if (page === 'about.html') html = dropRepeatedHeading(html, ABOUT_INTRO);
  html = applyContactStrip(html);
  html = applyFormJs(html);

  fs.writeFileSync(p, html);
  console.log(`${page}: ${BANNERS[page] ? 'banner + ' : ''}contact strip + form script` +
    (html === before ? ' (unchanged)' : ''));
}
