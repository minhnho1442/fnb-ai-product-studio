'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaletteEngine = require('../palette-engine.js');

function buildRgbaBuffer(blocks) {
  const totalPixels = blocks.reduce((sum, b) => sum + b.count, 0);
  const buf = new Uint8ClampedArray(totalPixels * 4);
  let offset = 0;
  for (const b of blocks) {
    for (let i = 0; i < b.count; i++) {
      buf[offset++] = b.r;
      buf[offset++] = b.g;
      buf[offset++] = b.b;
      buf[offset++] = b.a;
    }
  }
  return buf;
}

test('hex & color conversions round-trip accurately', () => {
  assert.equal(PaletteEngine.normalizeHex('#ABC'), '#aabbcc');
  assert.equal(PaletteEngine.normalizeHex('112233'), '#112233');
  assert.equal(PaletteEngine.normalizeHex('invalid'), null);

  const rgb = PaletteEngine.hexToRgb('#e05a2b');
  assert.deepEqual(rgb, { r: 224, g: 90, b: 43 });
  assert.equal(PaletteEngine.rgbToHex(224, 90, 43), '#e05a2b');

  const hsl = PaletteEngine.rgbToHsl(224, 90, 43);
  const back = PaletteEngine.hslToRgb(hsl.h, hsl.s, hsl.l);
  assert.ok(Math.abs(back.r - 224) <= 2);
  assert.ok(Math.abs(back.g - 90) <= 2);
  assert.ok(Math.abs(back.b - 43) <= 2);
});

test('extractPaletteFromPixels ignores transparent background pixels', () => {
  // Simulate a rembg cutout: 75% transparent black background, 20% terracotta cup, 5% matcha logo.
  const pixels = buildRgbaBuffer([
    { r: 0, g: 0, b: 0, a: 0, count: 1500 },
    { r: 210, g: 95, b: 52, a: 255, count: 400 },
    { r: 88, g: 145, b: 78, a: 255, count: 100 }
  ]);

  const swatches = PaletteEngine.extractPaletteFromPixels(pixels, { maxColors: 5 });
  assert.ok(swatches.length >= 2);
  assert.equal(swatches[0].role, 'Chủ đạo');
  // Dominant must be terracotta (~#d25f34), never black (#000000) from transparent region.
  assert.notEqual(swatches[0].hex, '#000000');
  const domRgb = PaletteEngine.hexToRgb(swatches[0].hex);
  assert.ok(domRgb.r > 180 && domRgb.g < 120);

  const hasGreenAccent = swatches.some((s) => {
    const rgb = PaletteEngine.hexToRgb(s.hex);
    return rgb.g > rgb.r && rgb.g > rgb.b;
  });
  assert.ok(hasGreenAccent, 'Expected green accent swatch to be preserved');
});

test('extractPaletteFromPixels returns empty array for fully transparent buffer', () => {
  const empty = buildRgbaBuffer([{ r: 255, g: 255, b: 255, a: 0, count: 200 }]);
  assert.deepEqual(PaletteEngine.extractPaletteFromPixels(empty), []);
});

test('generateStudioBackdrops produces 6 valid harmonies including for neutral colors', () => {
  const neutralBackdrops = PaletteEngine.generateStudioBackdrops('#1c1e22');
  assert.equal(neutralBackdrops.length, 6);
  for (const bd of neutralBackdrops) {
    assert.match(bd.top, /^#[0-9a-f]{6}$/);
    assert.match(bd.bottom, /^#[0-9a-f]{6}$/);
    assert.match(bd.glow, /^rgba\(/);
    assert.ok(bd.css.includes('linear-gradient'));
  }

  // Neutral clean tint should stay restrained (low saturation), never turn bright red.
  const cleanRgb = PaletteEngine.hexToRgb(neutralBackdrops[0].top);
  const cleanHsl = PaletteEngine.rgbToHsl(cleanRgb.r, cleanRgb.g, cleanRgb.b);
  assert.ok(cleanHsl.s < 25, `Expected restrained saturation for neutral tint, got ${cleanHsl.s}`);
});

test('WCAG contrast calculation and suggestTextColors rank readable colors first', () => {
  const bw = PaletteEngine.getContrastRatio('#ffffff', '#000000');
  assert.ok(Math.abs(bw - 21) < 0.05);
  assert.equal(PaletteEngine.getWcagInfo(bw).level, 'AAA');
  assert.equal(PaletteEngine.getWcagInfo(4.6).level, 'AA');
  assert.equal(PaletteEngine.getWcagInfo(3.2).level, 'AA+');
  assert.equal(PaletteEngine.getWcagInfo(1.8).pass, false);

  const lightBgSuggestions = PaletteEngine.suggestTextColors('#faf5f0', ['#f2e5d7', '#8b4a2b']);
  assert.ok(lightBgSuggestions.length >= 4);
  assert.ok(lightBgSuggestions[0].wcag.pass);
  assert.ok(lightBgSuggestions[0].ratio >= 7);
});

test('FNB_MOODS contains valid studio mood presets', () => {
  assert.equal(PaletteEngine.FNB_MOODS.length, 6);
  for (const m of PaletteEngine.FNB_MOODS) {
    assert.ok(PaletteEngine.normalizeHex(m.top));
    assert.ok(PaletteEngine.normalizeHex(m.bottom));
    assert.ok(Array.isArray(m.swatches) && m.swatches.length === 4);
    assert.ok(PaletteEngine.getContrastRatio(m.textColor, m.bottom) >= 4.5);
  }
});
