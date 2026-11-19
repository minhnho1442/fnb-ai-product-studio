/* F&B Product Studio v0.2 | Pure JS Palette Engine (DOM-free) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PaletteEngine = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function normalizeHex(hex) {
    if (typeof hex !== 'string') return null;
    const raw = hex.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(raw)) {
      return '#' + raw.split('').map((c) => c + c).join('').toLowerCase();
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) {
      return '#' + raw.toLowerCase();
    }
    return null;
  }

  function hexToRgb(hex) {
    const clean = normalizeHex(hex);
    if (!clean) return null;
    const num = parseInt(clean.slice(1), 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbToHex(r, g, b) {
    const toByte = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return '#' + toByte(r) + toByte(g) + toByte(b);
  }

  function rgbaCss(rgb, alpha) {
    return `rgba(${clamp(Math.round(rgb.r), 0, 255)}, ${clamp(Math.round(rgb.g), 0, 255)}, ${clamp(Math.round(rgb.b), 0, 255)}, ${clamp(alpha, 0, 1).toFixed(2)})`;
  }

  function rgbToHsl(r, g, b) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    const hn = ((h % 360) + 360) % 360;
    const sn = clamp(s, 0, 100) / 100;
    const ln = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = ln - c / 2;
    let r = 0, g = 0, b = 0;
    if (hn < 60) [r, g, b] = [c, x, 0];
    else if (hn < 120) [r, g, b] = [x, c, 0];
    else if (hn < 180) [r, g, b] = [0, c, x];
    else if (hn < 240) [r, g, b] = [0, x, c];
    else if (hn < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  function srgbToLinear(c) {
    const v = clamp(c, 0, 255) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(v) {
    const c = clamp(v, 0, 1);
    const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255);
  }

  // Convert sRGB to CIE L*a*b* (D65) so color clustering & deduplication match human perception.
  function rgbToLab(r, g, b) {
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);
    const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
    const y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) / 1.00000;
    const z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x), fy = f(y), fz = f(z);
    return {
      L: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  function labDistSq(p, q) {
    const dL = p.L - q.L;
    const da = p.a - q.a;
    const db = p.b - q.b;
    return dL * dL + da * da + db * db;
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
  }

  function getContrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(hex1);
    const l2 = relativeLuminance(hex2);
    const bright = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (bright + 0.05) / (dark + 0.05);
  }

  function getWcagInfo(ratio) {
    if (ratio >= 7) return { level: 'AAA', label: 'Xuất sắc (AAA)', pass: true };
    if (ratio >= 4.5) return { level: 'AA', label: 'Đạt chuẩn (AA)', pass: true };
    if (ratio >= 3) return { level: 'AA+', label: 'Chữ lớn (AA+)', pass: true };
    return { level: 'Thấp', label: 'Tương phản thấp', pass: false };
  }

  function mixHex(hexA, hexB, weightB = 0.5) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return normalizeHex(hexA) || normalizeHex(hexB) || '#808080';
    const t = clamp(weightB, 0, 1);
    return rgbToHex(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t
    );
  }

  // Deterministic farthest-point K-Means++ initialization avoids random color flicker on repeated extraction.
  function initCentroids(samples, k) {
    const centroids = [samples[0]];
    const minDist = new Float64Array(samples.length).fill(Infinity);
    while (centroids.length < k && centroids.length < samples.length) {
      const latest = centroids[centroids.length - 1];
      let bestIdx = -1;
      let bestDist = -1;
      for (let i = 0; i < samples.length; i++) {
        const d = labDistSq(samples[i].lab, latest.lab);
        if (d < minDist[i]) minDist[i] = d;
        if (minDist[i] > bestDist) {
          bestDist = minDist[i];
          bestIdx = i;
        }
      }
      if (bestIdx === -1 || bestDist === 0) break;
      centroids.push(samples[bestIdx]);
    }
    return centroids.map((c) => ({ ...c.lab }));
  }

  function runKMeansLab(samples, k, maxIterations = 12) {
    let centroids = initCentroids(samples, k);
    const clusterCount = centroids.length;
    const assignments = new Int32Array(samples.length);

    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;
      const sums = Array.from({ length: clusterCount }, () => ({ L: 0, a: 0, b: 0, r: 0, g: 0, bl: 0, n: 0 }));

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < clusterCount; c++) {
          const d = labDistSq(s.lab, centroids[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (assignments[i] !== best) {
          assignments[i] = best;
          moved = true;
        }
        const acc = sums[best];
        acc.L += s.lab.L;
        acc.a += s.lab.a;
        acc.b += s.lab.b;
        acc.r += s.r;
        acc.g += s.g;
        acc.bl += s.b;
        acc.n += 1;
      }

      for (let c = 0; c < clusterCount; c++) {
        const acc = sums[c];
        if (acc.n > 0) {
          centroids[c] = { L: acc.L / acc.n, a: acc.a / acc.n, b: acc.b / acc.n };
        }
      }
      if (!moved && iter > 0) break;
    }

    const clusters = Array.from({ length: clusterCount }, () => ({ r: 0, g: 0, b: 0, L: 0, a: 0, lb: 0, count: 0 }));
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const cl = clusters[assignments[i]];
      cl.r += s.r;
      cl.g += s.g;
      cl.b += s.b;
      cl.L += s.lab.L;
      cl.a += s.lab.a;
      cl.lb += s.lab.b;
      cl.count += 1;
    }

    return clusters
      .filter((cl) => cl.count > 0)
      .map((cl) => {
        const r = Math.round(cl.r / cl.count);
        const g = Math.round(cl.g / cl.count);
        const b = Math.round(cl.b / cl.count);
        const lab = { L: cl.L / cl.count, a: cl.a / cl.count, b: cl.lb / cl.count };
        return {
          r, g, b,
          hex: rgbToHex(r, g, b),
          hsl: rgbToHsl(r, g, b),
          lab,
          chroma: Math.hypot(lab.a, lab.b),
          count: cl.count
        };
      });
  }

  function mergeCloseClusters(clusters, minDeltaE = 11) {
    const sorted = [...clusters].sort((a, b) => b.count - a.count);
    const merged = [];
    const thresholdSq = minDeltaE * minDeltaE;
    for (const item of sorted) {
      const target = merged.find((m) => labDistSq(m.lab, item.lab) < thresholdSq);
      if (!target) {
        merged.push({ ...item });
      } else {
        const total = target.count + item.count;
        target.r = Math.round((target.r * target.count + item.r * item.count) / total);
        target.g = Math.round((target.g * target.count + item.g * item.count) / total);
        target.b = Math.round((target.b * target.count + item.b * item.count) / total);
        target.lab = rgbToLab(target.r, target.g, target.b);
        target.hex = rgbToHex(target.r, target.g, target.b);
        target.hsl = rgbToHsl(target.r, target.g, target.b);
        target.chroma = Math.hypot(target.lab.a, target.lab.b);
        target.count = total;
      }
    }
    return merged;
  }

  function assignSwatchRoles(swatches) {
    if (!swatches.length) return [];
    let accentIdx = -1;
    let maxAccentScore = -1;
    for (let i = 1; i < swatches.length; i++) {
      const dist = Math.sqrt(labDistSq(swatches[0].lab, swatches[i].lab));
      const score = swatches[i].chroma * 0.7 + dist * 0.4;
      if (swatches[i].chroma >= 18 && score > maxAccentScore) {
        maxAccentScore = score;
        accentIdx = i;
      }
    }

    let darkIdx = -1;
    let minL = Infinity;
    for (let i = 1; i < swatches.length; i++) {
      if (i === accentIdx) continue;
      if (swatches[i].lab.L < minL) {
        minL = swatches[i].lab.L;
        darkIdx = i;
      }
    }

    return swatches.map((s, idx) => {
      let role = 'Phụ trợ';
      if (idx === 0) role = 'Chủ đạo';
      else if (idx === accentIdx) role = 'Điểm nhấn';
      else if (idx === darkIdx && s.lab.L < 38) role = 'Trầm';
      else if (s.lab.L > 78) role = 'Sáng';
      return {
        hex: s.hex,
        ratio: s.ratio,
        percent: Math.max(1, Math.round(s.ratio * 100)),
        role,
        chroma: Math.round(s.chroma),
        hsl: {
          h: Math.round(s.hsl.h),
          s: Math.round(s.hsl.s),
          l: Math.round(s.hsl.l)
        }
      };
    });
  }

  /**
   * Extract representative product swatches from RGBA pixel data.
   * Ignores transparent pixels (alpha < 128) so rembg cutouts yield true product colors.
   */
  function extractPaletteFromPixels(rgbaData, options = {}) {
    if (!rgbaData || rgbaData.length < 4) return [];
    const maxColors = clamp(options.maxColors ?? 5, 1, 8);
    const alphaThreshold = options.alphaThreshold ?? 128;
    const maxSamples = options.maxSamples ?? 3200;

    const totalPixels = Math.floor(rgbaData.length / 4);
    const stride = Math.max(1, Math.floor(totalPixels / maxSamples));
    const samples = [];

    for (let p = 0; p < totalPixels; p += stride) {
      const idx = p * 4;
      const a = rgbaData[idx + 3];
      if (a < alphaThreshold) continue;
      const r = rgbaData[idx];
      const g = rgbaData[idx + 1];
      const b = rgbaData[idx + 2];
      samples.push({ r, g, b, lab: rgbToLab(r, g, b) });
    }

    if (!samples.length) return [];

    // Cluster with slightly higher k so vivid small brand labels/accents aren't swallowed by body color.
    const k = Math.min(samples.length, Math.max(maxColors + 3, 8));
    const rawClusters = runKMeansLab(samples, k);
    const merged = mergeCloseClusters(rawClusters, 11);
    const totalCount = merged.reduce((acc, c) => acc + c.count, 0) || 1;

    // Score preserves dominant body color first while letting vivid accent details enter top-N.
    const withStats = merged.map((c) => {
      const ratio = c.count / totalCount;
      const accentBoost = 1 + Math.min(c.chroma, 75) / 90;
      return { ...c, ratio, score: ratio * accentBoost };
    });

    const sortedByCount = [...withStats].sort((a, b) => b.count - a.count);
    const chosen = [sortedByCount[0]];
    const rest = sortedByCount.slice(1).sort((a, b) => b.score - a.score);
    for (const candidate of rest) {
      if (chosen.length >= maxColors) break;
      chosen.push(candidate);
    }

    return assignSwatchRoles(chosen);
  }

  function makeBackdrop(id, name, rule, top, bottom, glowRgb, glowAlpha = 0.23) {
    return {
      id: 'palette-' + id,
      name,
      rule,
      top,
      bottom,
      glow: glowRgb ? rgbaCss(glowRgb, glowAlpha) : 'rgba(255,255,255,0.23)',
      css: `linear-gradient(150deg, ${top}, ${bottom})`
    };
  }

  /**
   * Generate 6 studio backdrop harmonies tailored for F&B product photography.
   * Handles neutral base colors (white/black/silver packaging) gracefully without artificial red hue bias.
   */
  function generateStudioBackdrops(baseHex, paletteHexes = []) {
    const clean = normalizeHex(baseHex) || '#d2a679';
    const rgb = hexToRgb(clean);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const isNeutral = hsl.s < 10;

    // Neutral products use refined warm-ivory or cool-slate base hues instead of hsl.h=0 (red).
    const h = isNeutral ? 34 : hsl.h;
    const baseSat = isNeutral ? 14 : hsl.s;

    const cleanTop = hslToHex(h, clamp(baseSat * 0.32, 6, 26), 95);
    const cleanBottom = hslToHex(h, clamp(baseSat * 0.45, 10, 34), 84);

    const monoSoftTop = hslToHex(h, clamp(baseSat * 0.65, 14, 52), 84);
    const monoSoftBottom = hslToHex(h, clamp(baseSat * 0.85, 18, 62), 63);

    const monoDeepTop = hslToHex(h, clamp(baseSat * 0.55, 12, 46), 27);
    const monoDeepBottom = hslToHex(h, clamp(baseSat * 0.45, 10, 36), 10);
    const deepGlowRgb = isNeutral ? { r: 225, g: 215, b: 198 } : hslToRgb(h, clamp(baseSat, 30, 75), 62);

    const analogHue = (h + 28) % 360;
    const analogTop = hslToHex(h, clamp(baseSat * 0.55, 16, 48), 86);
    const analogBottom = hslToHex(analogHue, clamp(baseSat * 0.72, 20, 56), 66);

    const compHue = isNeutral ? 205 : (h + 180) % 360;
    const compTop = hslToHex(compHue, clamp(isNeutral ? 24 : baseSat * 0.5, 18, 44), 84);
    const compBottom = hslToHex(compHue, clamp(isNeutral ? 34 : baseSat * 0.65, 22, 56), 59);
    const compGlowRgb = hslToRgb(compHue, 45, 85);

    const isWarm = h < 65 || h >= 320;
    const editTop = isWarm ? hslToHex(162, 24, 88) : hslToHex(34, 34, 92);
    const editBottom = isWarm ? hslToHex(172, 32, 66) : hslToHex(28, 36, 75);

    const backdrops = [
      makeBackdrop('clean-tint', 'Sạch tinh tế', 'Clean Tint', cleanTop, cleanBottom, { r: 255, g: 255, b: 255 }, 0.25),
      makeBackdrop('mono-soft', 'Cùng tông êm', 'Monochrome', monoSoftTop, monoSoftBottom, { r: 255, g: 255, b: 255 }, 0.22),
      makeBackdrop('mono-deep', 'Sang trọng sâu', 'Deep Studio', monoDeepTop, monoDeepBottom, deepGlowRgb, 0.24),
      makeBackdrop('analogous', 'Tương đồng F&B', 'Analogous', analogTop, analogBottom, { r: 255, g: 250, b: 242 }, 0.22),
      makeBackdrop('complementary', 'Tương phản nổi', 'Complementary', compTop, compBottom, compGlowRgb, 0.22),
      makeBackdrop('editorial', isWarm ? 'Cân bằng mát' : 'Studio ấm áp', 'Editorial', editTop, editBottom, { r: 255, g: 255, b: 255 }, 0.24)
    ];

    // If a distinct accent color exists in the extracted palette, add subtle glow flavor to complementary.
    const normalizedOthers = (paletteHexes || []).map(normalizeHex).filter((x) => x && x !== clean);
    if (normalizedOthers.length) {
      const accentRgb = hexToRgb(normalizedOthers[0]);
      if (accentRgb) {
        backdrops[0].glow = rgbaCss(accentRgb, 0.14);
      }
    }

    return backdrops;
  }

  /**
   * Suggest readable text colors ranked/annotated with WCAG contrast ratio against bgHex.
   */
  function suggestTextColors(bgHex, paletteHexes = []) {
    const safeBg = normalizeHex(bgHex) || '#242d38';
    const candidates = new Map();

    const addCandidate = (hex, label) => {
      const clean = normalizeHex(hex);
      if (!clean || candidates.has(clean)) return;
      const ratio = getContrastRatio(clean, safeBg);
      const wcag = getWcagInfo(ratio);
      candidates.set(clean, {
        hex: clean,
        label,
        ratio: Number(ratio.toFixed(1)),
        wcag
      });
    };

    addCandidate('#ffffff', 'Trắng tinh');
    addCandidate('#fdf6ea', 'Kem sáng');
    addCandidate('#161b22', 'Than đậm');
    addCandidate('#241812', 'Espresso');

    for (const raw of paletteHexes || []) {
      const clean = normalizeHex(raw);
      if (!clean) continue;
      addCandidate(clean, 'Màu sản phẩm');
      const rgb = hexToRgb(clean);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const bgLum = relativeLuminance(safeBg);
      const tuned = bgLum > 0.35
        ? hslToHex(hsl.h, clamp(hsl.s, 18, 65), 18)
        : hslToHex(hsl.h, clamp(hsl.s, 20, 75), 90);
      addCandidate(tuned, bgLum > 0.35 ? 'Tông sản phẩm đậm' : 'Tông sản phẩm sáng');
    }

    const list = Array.from(candidates.values());
    list.sort((a, b) => {
      if (a.wcag.pass !== b.wcag.pass) return a.wcag.pass ? -1 : 1;
      return b.ratio - a.ratio;
    });
    return list.slice(0, 8);
  }

  const FNB_MOODS = [
    {
      id: 'mood-coffee',
      name: 'Cà phê rang xay',
      subtitle: 'Espresso • Caramel',
      top: '#5c3b28',
      bottom: '#1b120e',
      glow: 'rgba(235, 178, 120, 0.22)',
      swatches: ['#3d2518', '#a66d46', '#e6c39c', '#faf1e6'],
      textColor: '#faf1e6'
    },
    {
      id: 'mood-matcha',
      name: 'Matcha & Trà sữa',
      subtitle: 'Trà xanh • Sữa kem',
      top: '#e7f0dc',
      bottom: '#93b479',
      glow: 'rgba(255, 255, 245, 0.28)',
      swatches: ['#3d5c32', '#7ba05b', '#dce8cd', '#fffdf6'],
      textColor: '#21341b'
    },
    {
      id: 'mood-citrus',
      name: 'Trái cây nhiệt đới',
      subtitle: 'Cam đào • Tươi mát',
      top: '#ffe6cb',
      bottom: '#f0945d',
      glow: 'rgba(255, 244, 214, 0.30)',
      swatches: ['#c84c1b', '#f28b49', '#ffdcb8', '#fff8ef'],
      textColor: '#3d1908'
    },
    {
      id: 'mood-bakery',
      name: 'Bakery & Kem bơ',
      subtitle: 'Vani • Bánh ngọt',
      top: '#fbf3e4',
      bottom: '#d9b589',
      glow: 'rgba(255, 252, 244, 0.28)',
      swatches: ['#5b3c27', '#c5925c', '#efe1c9', '#fffcf7'],
      textColor: '#3c2516'
    },
    {
      id: 'mood-iced',
      name: 'Đồ uống mát lạnh',
      subtitle: 'Băng xanh • Soda',
      top: '#d9f3ff',
      bottom: '#5da9de',
      glow: 'rgba(255, 255, 255, 0.32)',
      swatches: ['#103e63', '#3f93cf', '#cceeff', '#ffffff'],
      textColor: '#0e324f'
    },
    {
      id: 'mood-minimal',
      name: 'Tối giản sang trọng',
      subtitle: 'Đá mờ • Fine F&B',
      top: '#444a53',
      bottom: '#11151b',
      glow: 'rgba(218, 228, 240, 0.18)',
      swatches: ['#171c24', '#5b6472', '#cfd6df', '#f7f9fb'],
      textColor: '#f7f9fb'
    }
  ];

  return {
    normalizeHex,
    hexToRgb,
    rgbToHex,
    rgbToHsl,
    hslToRgb,
    hslToHex,
    rgbToLab,
    mixHex,
    getContrastRatio,
    getWcagInfo,
    extractPaletteFromPixels,
    generateStudioBackdrops,
    suggestTextColors,
    FNB_MOODS
  };
});
