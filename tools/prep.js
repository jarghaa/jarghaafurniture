'use strict';
/**
 * Per-photo configuration for the furniture retouch pipeline.
 *
 *  quad      four source points (TL,TR,BR,BL) of the piece's front face,
 *            measured with tools/edges.js and verified with tools/overlay.js
 *  piece     size of that front face once straightened (keeps true aspect)
 *  margins   extra room around the face, as a fraction of piece size
 *  grade     tone / colour work
 *  vignette  optional radial settle of the background
 */

const BRAND = {
  emerald: '#0b7d54',
  emeraldDeep: '#12251d',
  gold: '#c9a24b',
};

// Product-card shape: matches the template's existing 293x252 tiles.
const CARD = { width: 1400, aspect: 7 / 6 };

const PHOTOS = [
  {
    id: 'wardrobe-espresso',
    title: 'Four-door espresso wardrobe with top cabinets',
    src: 'uploads/original-1.jpg',
    quad: [[1084, 447], [3152, 447], [3097, 2512], [1161, 2545]],
    piece: [2002, 2082],
    margins: { l: 0, r: 0, t: 0, b: 0 },
    vignette: { r: 0.80, edge: '#a6a6a6' },
    grade: {
      wb: [1.0, 1.0, 1.02],
      linear: [1.05, -5],
      modulate: { brightness: 1.0, saturation: 1.04 },
      clahe: { width: 96, height: 96, maxSlope: 3 },
      sharpen: { sigma: 1.0, m1: 0.75, m2: 0.45 },
    },
  },
  {
    id: 'wardrobe-teak-workshop',
    title: 'Solid teak four-door wardrobe, fresh from the workshop',
    src: 'uploads/original-2.jpg',
    quad: [[392, 792], [2596, 1074], [2704, 3238], [470, 3272]],
    piece: [2284, 2631],
    margins: { l: 0, r: 0, t: 0, b: 0 },
    vignette: { r: 0.70, edge: '#6d6d6d' },
    grade: {
      wb: [1.02, 1.0, 0.95],
      linear: [1.04, -4],
      modulate: { brightness: 1.0, saturation: 1.06 },
      clahe: { width: 96, height: 96, maxSlope: 2 },
      sharpen: { sigma: 1.0, m1: 0.75, m2: 0.45 },
    },
  },
  {
    id: 'wardrobe-laminate-sliding',
    title: 'Laminate sliding-door wardrobe with matching dresser',
    src: 'uploads/original-3.jpg',
    quad: [[40, 272], [668, 262], [670, 780], [52, 800]],
    piece: [625, 525],
    margins: { l: 0, r: 0, t: 0, b: 0 },
    vignette: { r: 0.85, edge: '#9c9c9c' },
    grade: {
      median: 3,
      linear: [1.09, -9],
      modulate: { brightness: 1.0, saturation: 1.12 },
      clahe: { width: 64, height: 64, maxSlope: 2 },
      sharpen: { sigma: 1.2, m1: 1.5, m2: 0.8 },
    },
  },
  {
    id: 'wardrobe-walnut-mirror',
    title: 'Walnut wall wardrobe with mirror and dresser unit',
    src: 'uploads/original-4.jpg',
    quad: [[58, 958], [2229, 499], [2282, 3164], [247, 3338]],
    piece: [2131, 2527],
    margins: { l: 0, r: 0, t: 0, b: 0 },
    vignette: { r: 0.80, edge: '#9a9a9a' },
    grade: {
      wb: [1.03, 1.0, 0.94],
      linear: [1.05, -5],
      modulate: { brightness: 1.0, saturation: 1.08 },
      clahe: { width: 96, height: 96, maxSlope: 2 },
      sharpen: { sigma: 1.0, m1: 0.75, m2: 0.45 },
    },
  },
];

module.exports = { PHOTOS, CARD, BRAND };
