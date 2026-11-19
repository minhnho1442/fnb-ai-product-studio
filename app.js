/* F&B Product Studio v0.2 | Local-first image compositing & palette studio */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('artboard');
  const overlay = $('overlay');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');

  const presets = [
    { id: 'cream', name: 'Kem studio', css: 'linear-gradient(150deg,#f6f0e9,#d7bdac)', top: '#faf5f0', bottom: '#d0b6a5' },
    { id: 'sky', name: 'Xanh Co&Co', css: 'linear-gradient(150deg,#b5e8ff,#76bfed)', top: '#c7ebf8', bottom: '#83c7e6' },
    { id: 'coffee', name: 'Nâu cà phê', css: 'linear-gradient(150deg,#6b422c,#1b1515)', top: '#65452f', bottom: '#1c1617' },
    { id: 'marble', name: 'Đá trắng', css: 'linear-gradient(150deg,#fafaf7,#d7dcd9)', top: '#fefcf8', bottom: '#dadddb' },
    { id: 'mint', name: 'Tropical', css: 'linear-gradient(150deg,#c1ebd2,#428b85)', top: '#c2ecd4', bottom: '#3e837d' },
    { id: 'black', name: 'Đen premium', css: 'linear-gradient(150deg,#4e5661,#0c1118)', top: '#48525c', bottom: '#111720' },
    { id: 'transparent', name: 'Trong suốt', css: 'repeating-conic-gradient(#f1f1f1 0 25%,#d1d1d1 0 50%) 50% / 15px 15px', top: null, bottom: null }
  ];

  const slidersSpec = [
    { key: 'brightness', label: 'Độ sáng', min: 40, max: 180, step: 1, default: 100, suffix: '%' },
    { key: 'contrast', label: 'Tương phản', min: 40, max: 180, step: 1, default: 100, suffix: '%' },
    { key: 'saturation', label: 'Độ bão hòa', min: 0, max: 200, step: 1, default: 100, suffix: '%' },
    { key: 'warmth', label: 'Nhiệt độ màu', min: -100, max: 100, step: 1, default: 0, suffix: '' },
    { key: 'blur', label: 'Làm mờ', min: 0, max: 12, step: 0.1, default: 0, suffix: 'px' },
    { key: 'opacity', label: 'Độ trong suốt', min: 0, max: 100, step: 1, default: 100, suffix: '%' }
  ];

  const makeId = () => 'layer_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const initial = () => ({
    width: 1080,
    height: 1350,
    bg: { preset: 'cream', src: null, custom: null },
    palette: { baseColor: '#d2a679', sourceName: '', swatches: [], activeTab: 'photo' },
    layers: [],
    selectedId: null,
    compare: false,
    projectName: 'Dự án sản phẩm mới'
  });

  let state = initial();
  let fitScale = 1;
  let zoomFactor = 1;
  let drag = null;
  let toastTimer = null;
  let history = [];
  let redoStack = [];
  const imgCache = new Map();
  const bgSampleCache = new Map();
  const DEFAULT_API = 'http://127.0.0.1:8000';

  function notify(message, isError = false) {
    const t = $('toast');
    t.textContent = message;
    t.style.background = isError ? '#ffc9bd' : '#dcfba7';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
    $('statusText').textContent = message;
  }

  function snap() {
    return JSON.stringify({
      width: state.width,
      height: state.height,
      bg: state.bg,
      palette: state.palette,
      layers: state.layers,
      selectedId: state.selectedId,
      projectName: state.projectName
    });
  }

  function checkpoint() {
    const s = snap();
    if (history.at(-1) !== s) {
      history.push(s);
      if (history.length > 30) history.shift();
      redoStack = [];
    }
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    $('btnUndo').disabled = history.length < 2;
    $('btnRedo').disabled = redoStack.length === 0;
  }

  function restore(serial) {
    const saved = JSON.parse(serial);
    const def = initial();
    state = {
      ...def,
      ...saved,
      bg: { ...def.bg, ...(saved.bg || {}) },
      palette: { ...def.palette, ...(saved.palette || {}) }
    };
    $('projectName').textContent = state.projectName;
    syncAll();
  }

  function undo() {
    if (history.length < 2) return;
    redoStack.push(history.pop());
    restore(history.at(-1));
    updateHistoryButtons();
    notify('Đã hoàn tác');
  }

  function redo() {
    if (!redoStack.length) return;
    const s = redoStack.pop();
    history.push(s);
    restore(s);
    updateHistoryButtons();
    notify('Đã làm lại');
  }

  function activeLayer() {
    return state.layers.find((l) => l.id === state.selectedId) || null;
  }

  function cacheImage(src) {
    if (!src) return null;
    const cached = imgCache.get(src);
    if (cached) return cached.complete && cached.naturalWidth ? cached : null;
    const im = new Image();
    im.onload = () => {
      render();
      if (state.bg.src === src) syncTextContrastUI();
    };
    im.onerror = () => {
      notify('Không tải được nguồn ảnh', true);
    };
    im.src = src;
    imgCache.set(src, im);
    return null;
  }

  function loadImageElement(src) {
    const cached = imgCache.get(src);
    if (cached && cached.complete && cached.naturalWidth) {
      return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Không đọc được dữ liệu ảnh'));
      im.src = src;
    });
  }

  function sampleImagePixels(img, maxDim = 96) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const c = tmp.getContext('2d');
    c.drawImage(img, 0, 0, w, h);
    return c.getImageData(0, 0, w, h).data;
  }

  function resolveBackdropColors() {
    if (state.bg.preset === 'palette' && state.bg.custom) {
      return {
        id: state.bg.custom.id,
        top: state.bg.custom.top,
        bottom: state.bg.custom.bottom,
        glow: state.bg.custom.glow || 'rgba(255,255,255,.23)'
      };
    }
    const p = presets.find((item) => item.id === state.bg.preset) || presets[0];
    if (p.id === 'transparent') return null;
    return {
      id: p.id,
      top: p.top,
      bottom: p.bottom,
      glow: 'rgba(255,255,255,.23)'
    };
  }

  function fillBackground(g) {
    if (state.bg.src) {
      const im = cacheImage(state.bg.src);
      if (im) {
        const s = Math.max(state.width / im.width, state.height / im.height);
        const w = im.width * s;
        const h = im.height * s;
        g.drawImage(im, (state.width - w) / 2, (state.height - h) / 2, w, h);
        return;
      }
    }
    const bd = resolveBackdropColors();
    if (!bd) return;
    const grad = g.createLinearGradient(0, 0, state.width, state.height);
    grad.addColorStop(0, bd.top);
    grad.addColorStop(0.58, bd.top);
    grad.addColorStop(1, bd.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, state.width, state.height);
    // A soft sweep that reads as an actual studio backdrop rather than a flat wallpaper.
    const glow = g.createRadialGradient(state.width * 0.35, state.height * 0.25, 0, state.width * 0.35, state.height * 0.3, state.width * 0.85);
    glow.addColorStop(0, bd.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, state.width, state.height);
    const floor = g.createLinearGradient(0, state.height * 0.71, 0, state.height);
    floor.addColorStop(0, 'rgba(255,255,255,0)');
    floor.addColorStop(1, 'rgba(255,255,255,.19)');
    g.fillStyle = floor;
    g.fillRect(0, state.height * 0.71, state.width, state.height * 0.29);
  }

  function applyImageFilter(l) {
    if (state.compare) return 'none';
    let f = `brightness(${l.brightness ?? 100}%) contrast(${l.contrast ?? 100}%) saturate(${l.saturation ?? 100}%) blur(${l.blur ?? 0}px)`;
    const warm = l.warmth || 0;
    if (warm > 0) f += ` sepia(${(warm * 0.4).toFixed(1)}%)`;
    if (warm < 0) f += ` hue-rotate(${(warm * 0.12).toFixed(1)}deg)`;
    return f;
  }

  function drawLayer(g, l) {
    if (l.hidden) return;
    g.save();
    g.globalAlpha = (l.opacity ?? 100) / 100;
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    g.translate(cx, cy);
    g.rotate(((l.rotation || 0) * Math.PI) / 180);
    if (l.type === 'image') {
      const im = cacheImage(l.src);
      if (im) {
        g.filter = applyImageFilter(l);
        if (l.shadow) {
          g.shadowColor = 'rgba(0,0,0,.28)';
          g.shadowBlur = Math.max(18, l.w * 0.05);
          g.shadowOffsetY = Math.max(12, l.h * 0.028);
        }
        g.drawImage(im, -l.w / 2, -l.h / 2, l.w, l.h);
      }
    } else if (l.type === 'text') {
      const fontSize = l.fontSize || 72;
      g.font = `800 ${fontSize}px system-ui,sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = l.color || '#ffffff';
      g.shadowColor = 'rgba(0,0,0,.22)';
      g.shadowBlur = fontSize * 0.11;
      g.shadowOffsetY = fontSize * 0.07;
      String(l.text || '').split('\n').forEach((line, i, arr) => {
        g.fillText(line, 0, (i - (arr.length - 1) / 2) * fontSize * 1.15, l.w);
      });
    }
    g.restore();
  }

  function render() {
    canvas.width = overlay.width = state.width;
    canvas.height = overlay.height = state.height;
    ctx.clearRect(0, 0, state.width, state.height);
    fillBackground(ctx);
    state.layers.forEach((l) => drawLayer(ctx, l));
    drawOverlay();
    $('canvasDimensions').textContent = `${state.width} × ${state.height} px`;
    const divisor = gcd(state.width, state.height);
    $('canvasFormat').textContent = `${state.width / divisor}:${state.height / divisor}`;
    $('emptyState').classList.toggle('hidden', state.layers.length > 0);
  }

  function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
  }

  function cornerCoords(l) {
    const rad = ((l.rotation || 0) * Math.PI) / 180;
    return [[-l.w / 2, -l.h / 2], [l.w / 2, -l.h / 2], [l.w / 2, l.h / 2], [-l.w / 2, l.h / 2]].map(([x, y]) => ({
      x: l.x + l.w / 2 + x * Math.cos(rad) - y * Math.sin(rad),
      y: l.y + l.h / 2 + x * Math.sin(rad) + y * Math.cos(rad)
    }));
  }

  function drawOverlay() {
    octx.clearRect(0, 0, state.width, state.height);
    const l = activeLayer();
    if (!l || l.hidden) return;
    const c = cornerCoords(l);
    octx.save();
    octx.strokeStyle = '#d2fc76';
    octx.lineWidth = Math.max(2, 2 / Math.max(fitScale * zoomFactor, 0.2));
    octx.setLineDash([12, 8]);
    octx.beginPath();
    c.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
    octx.closePath();
    octx.stroke();
    octx.setLineDash([]);
    c.forEach((p) => {
      octx.beginPath();
      octx.fillStyle = '#d2fc76';
      octx.strokeStyle = '#19231b';
      octx.lineWidth = 3;
      octx.arc(p.x, p.y, Math.max(5, 7 / Math.max(fitScale * zoomFactor, 0.3)), 0, Math.PI * 2);
      octx.fill();
      octx.stroke();
    });
    octx.restore();
  }

  function fitStage() {
    const wrap = $('stageWrap');
    const maxW = Math.max(100, wrap.clientWidth - 70);
    const maxH = Math.max(100, wrap.clientHeight - 70);
    fitScale = Math.min(maxW / state.width, maxH / state.height, 1);
    applyZoom();
  }

  function applyZoom() {
    const scale = fitScale * zoomFactor;
    $('stageInner').style.width = `${Math.round(state.width * scale)}px`;
    $('stageInner').style.height = `${Math.round(state.height * scale)}px`;
    $('zoomText').textContent = Math.round(scale * 100) + '%';
    drawOverlay();
  }

  function pointerPosition(ev) {
    const r = overlay.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) * state.width) / r.width, y: ((ev.clientY - r.top) * state.height) / r.height };
  }

  function hitTest(l, p) {
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    const ang = (-(l.rotation || 0) * Math.PI) / 180;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const x = dx * Math.cos(ang) - dy * Math.sin(ang);
    const y = dx * Math.sin(ang) + dy * Math.cos(ang);
    return Math.abs(x) <= l.w / 2 && Math.abs(y) <= l.h / 2;
  }

  function onPointerDown(ev) {
    const p = pointerPosition(ev);
    const current = activeLayer();
    if (current && !current.hidden) {
      const corners = cornerCoords(current);
      const hitRadius = Math.max(17, 13 / Math.max(fitScale * zoomFactor, 0.2));
      if (corners.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < hitRadius)) {
        drag = {
          type: 'scale',
          id: current.id,
          original: { ...current },
          center: { x: current.x + current.w / 2, y: current.y + current.h / 2 },
          startDist: Math.max(1, Math.hypot(p.x - (current.x + current.w / 2), p.y - (current.y + current.h / 2)))
        };
        overlay.setPointerCapture(ev.pointerId);
        return;
      }
    }
    const selected = [...state.layers].reverse().find((l) => !l.hidden && !l.locked && hitTest(l, p));
    if (selected) {
      state.selectedId = selected.id;
      drag = { type: 'move', id: selected.id, start: p, original: { x: selected.x, y: selected.y } };
      overlay.setPointerCapture(ev.pointerId);
    } else {
      state.selectedId = null;
      drag = null;
    }
    syncInspector();
    syncLayers();
    render();
  }

  function onPointerMove(ev) {
    if (!drag) return;
    const p = pointerPosition(ev);
    const l = state.layers.find((item) => item.id === drag.id);
    if (!l) return;
    if (drag.type === 'move') {
      l.x = drag.original.x + (p.x - drag.start.x);
      l.y = drag.original.y + (p.y - drag.start.y);
    } else {
      const ratio = Math.min(4, Math.max(0.08, Math.hypot(p.x - drag.center.x, p.y - drag.center.y) / drag.startDist));
      l.w = drag.original.w * ratio;
      l.h = drag.original.h * ratio;
      l.x = drag.center.x - l.w / 2;
      l.y = drag.center.y - l.h / 2;
    }
    if (l.type === 'image') {
      const pct = Math.round((100 * l.w) / (l.baseW || l.w));
      $('scaleRange').value = Math.min(220, Math.max(10, pct));
      $('scaleValue').textContent = pct + '%';
    }
    render();
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    checkpoint();
    syncLayers();
    syncTextContrastUI();
    notify('Đã cập nhật vị trí/kích thước');
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được ảnh'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageDimensions(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = reject;
      im.src = src;
    });
  }

  async function addPhotoFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    for (const file of images) {
      const src = await readAsDataURL(file);
      await addImage(src, file.name, false);
    }
    checkpoint();
    notify(`Đã thêm ${images.length} ảnh`);
  }

  async function addImage(src, name, save = true) {
    const d = await loadImageDimensions(src);
    const s = Math.min((state.width * 0.67) / d.w, (state.height * 0.66) / d.h, 2);
    const w = d.w * s;
    const h = d.h * s;
    const l = {
      id: makeId(),
      type: 'image',
      name,
      src,
      x: (state.width - w) / 2,
      y: (state.height - h) / 2,
      w,
      h,
      baseW: w,
      baseH: h,
      rotation: 0,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      blur: 0,
      opacity: 100,
      shadow: true,
      hidden: false,
      locked: false
    };
    state.layers.push(l);
    state.selectedId = l.id;
    if (state.palette.swatches.length === 0) {
      await extractPaletteFromLayer(l, { saveCheckpoint: false, silent: true });
    }
    syncAll();
    if (save) checkpoint();
    return l;
  }

  async function addBgFile(file) {
    if (!file) return;
    state.bg = { preset: 'custom', src: await readAsDataURL(file), custom: null };
    bgSampleCache.delete(state.bg.src);
    refreshPresets();
    renderPalettePanel();
    render();
    syncTextContrastUI();
    checkpoint();
    notify('Đã thay bằng nền tham chiếu');
  }

  function changePreset(id) {
    state.bg = { preset: id, src: null, custom: null };
    refreshPresets();
    renderPalettePanel();
    render();
    syncTextContrastUI();
    checkpoint();
    notify(`Nền ${presets.find((p) => p.id === id)?.name || ''}`);
  }

  function refreshPresets() {
    const root = $('presetGrid');
    root.replaceChildren();
    for (const p of presets) {
      const b = document.createElement('button');
      b.className = 'preset-btn' + (state.bg.preset === p.id ? ' active' : '');
      b.title = p.name;
      const sw = document.createElement('span');
      sw.className = 'preset-swatch';
      sw.style.background = p.css;
      const title = document.createElement('span');
      title.textContent = p.name;
      b.append(sw, title);
      b.addEventListener('click', () => changePreset(p.id));
      root.appendChild(b);
    }
  }

  function getPaletteHexes() {
    return (state.palette?.swatches || []).map((s) => s.hex).filter(Boolean);
  }

  function copyHex(hex) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).catch(() => {});
    }
  }

  function setPaletteTab(tab) {
    state.palette.activeTab = tab === 'mood' ? 'mood' : 'photo';
    const isPhoto = state.palette.activeTab === 'photo';
    $('tabPalettePhoto').classList.toggle('active', isPhoto);
    $('tabPaletteMood').classList.toggle('active', !isPhoto);
    $('tabPalettePhoto').setAttribute('aria-selected', String(isPhoto));
    $('tabPaletteMood').setAttribute('aria-selected', String(!isPhoto));
    $('palettePhotoPane').classList.toggle('hidden', !isPhoto);
    $('paletteMoodPane').classList.toggle('hidden', isPhoto);
  }

  function applyCustomBackdrop(backdrop, mood = null) {
    state.bg = {
      preset: 'palette',
      src: null,
      custom: {
        id: backdrop.id,
        name: backdrop.name,
        top: backdrop.top,
        bottom: backdrop.bottom,
        glow: backdrop.glow || 'rgba(255,255,255,0.23)'
      }
    };
    if (mood) {
      const roles = ['Trầm', 'Chủ đạo', 'Phụ trợ', 'Sáng'];
      state.palette = {
        ...state.palette,
        baseColor: mood.swatches[1] || mood.swatches[0],
        sourceName: mood.name,
        swatches: mood.swatches.map((hex, i) => ({ hex, role: roles[i] || 'Mood', percent: null }))
      };
    }
    refreshPresets();
    renderPalettePanel();
    render();
    syncTextContrastUI();
    checkpoint();
    notify(`Đã áp dụng nền ${backdrop.name}`);
  }

  function renderPalettePanel() {
    if (typeof PaletteEngine === 'undefined') return;
    setPaletteTab(state.palette.activeTab || 'photo');

    const swatches = state.palette.swatches || [];
    const baseColor = PaletteEngine.normalizeHex(state.palette.baseColor) || '#d2a679';
    state.palette.baseColor = baseColor;
    $('paletteBasePicker').value = baseColor;

    const badge = $('paletteSourceBadge');
    if (swatches.length) {
      badge.textContent = state.palette.sourceName || 'Đã quét';
      badge.classList.add('connected');
    } else {
      badge.textContent = 'Sẵn sàng';
      badge.classList.remove('connected');
    }

    const swatchRoot = $('extractedSwatches');
    swatchRoot.replaceChildren();
    if (!swatches.length) {
      const empty = document.createElement('div');
      empty.className = 'swatch-empty';
      empty.textContent = 'Thêm ảnh rồi bấm "Lấy màu sản phẩm" để gợi ý nền hài hòa.';
      swatchRoot.appendChild(empty);
    } else {
      for (const sw of swatches) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'swatch-chip' + (sw.hex.toLowerCase() === baseColor ? ' active' : '');
        btn.title = `${sw.hex} • ${sw.role}${sw.percent ? ` (${sw.percent}%)` : ''} — Nhấp để dùng làm màu gốc & copy HEX`;
        const box = document.createElement('span');
        box.className = 'swatch-color';
        box.style.background = sw.hex;
        const meta = document.createElement('span');
        meta.className = 'swatch-meta';
        meta.textContent = sw.percent ? `${sw.percent}%` : sw.role;
        btn.append(box, meta);
        btn.addEventListener('click', () => {
          state.palette.baseColor = sw.hex;
          copyHex(sw.hex);
          renderPalettePanel();
          checkpoint();
          notify(`Màu gốc ${sw.hex} (${sw.role}) • Đã copy`);
        });
        swatchRoot.appendChild(btn);
      }
    }

    const backdropsRoot = $('generatedBackdrops');
    backdropsRoot.replaceChildren();
    const generated = PaletteEngine.generateStudioBackdrops(baseColor, getPaletteHexes());
    for (const bd of generated) {
      const b = document.createElement('button');
      b.type = 'button';
      const isActive = state.bg.preset === 'palette' && state.bg.custom?.id === bd.id;
      b.className = 'preset-btn' + (isActive ? ' active' : '');
      b.title = `${bd.name} (${bd.rule})`;
      const preview = document.createElement('span');
      preview.className = 'preset-swatch';
      preview.style.background = bd.css;
      const label = document.createElement('span');
      label.textContent = bd.name;
      b.append(preview, label);
      b.addEventListener('click', () => applyCustomBackdrop(bd));
      backdropsRoot.appendChild(b);
    }

    const moodRoot = $('moodGrid');
    moodRoot.replaceChildren();
    for (const mood of PaletteEngine.FNB_MOODS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = state.bg.preset === 'palette' && state.bg.custom?.id === mood.id;
      btn.className = 'mood-btn' + (isActive ? ' active' : '');
      const preview = document.createElement('div');
      preview.className = 'mood-preview';
      preview.style.background = `linear-gradient(150deg, ${mood.top}, ${mood.bottom})`;
      const dots = document.createElement('div');
      dots.className = 'mood-dots';
      mood.swatches.slice(0, 3).forEach((hex) => {
        const dot = document.createElement('span');
        dot.style.background = hex;
        dots.appendChild(dot);
      });
      preview.appendChild(dots);
      const title = document.createElement('strong');
      title.textContent = mood.name;
      const sub = document.createElement('small');
      sub.textContent = mood.subtitle;
      btn.append(preview, title, sub);
      btn.addEventListener('click', () => applyCustomBackdrop(mood, mood));
      moodRoot.appendChild(btn);
    }
  }

  async function extractPaletteFromLayer(explicitLayer = null, options = {}) {
    if (typeof PaletteEngine === 'undefined') return;
    const { saveCheckpoint = true, silent = false } = options;
    let target = explicitLayer;
    if (!target) {
      const current = activeLayer();
      if (current && current.type === 'image') target = current;
      else target = [...state.layers].reverse().find((l) => l.type === 'image' && !l.hidden) || null;
    }
    if (!target && state.bg.src) {
      target = { src: state.bg.src, name: 'Nền tham chiếu' };
    }
    if (!target || !target.src) {
      if (!silent) notify('Hãy thêm hoặc chọn một ảnh sản phẩm trước', true);
      return;
    }
    try {
      const im = await loadImageElement(target.src);
      const pixels = sampleImagePixels(im, 96);
      const swatches = PaletteEngine.extractPaletteFromPixels(pixels, { maxColors: 5 });
      if (!swatches.length) {
        if (!silent) notify('Ảnh không có vùng màu đục để trích xuất', true);
        return;
      }
      state.palette = {
        ...state.palette,
        baseColor: swatches[0].hex,
        sourceName: (target.name || 'Sản phẩm').slice(0, 18),
        swatches,
        activeTab: 'photo'
      };
      renderPalettePanel();
      syncTextContrastUI();
      if (saveCheckpoint) checkpoint();
      if (!silent) notify(`Đã trích ${swatches.length} màu chủ đạo (${swatches[0].hex})`);
    } catch (e) {
      if (!silent) notify('Không thể phân tích màu ảnh: ' + e.message, true);
    }
  }

  function getCachedBgSample(src) {
    const cached = bgSampleCache.get(src);
    if (cached) return cached;
    const im = cacheImage(src);
    if (!im) return null;
    const sample = document.createElement('canvas');
    sample.width = 48;
    sample.height = 48;
    sample.getContext('2d').drawImage(im, 0, 0, 48, 48);
    bgSampleCache.set(src, sample);
    return sample;
  }

  function estimateBackgroundHexAtLayer(layer) {
    if (typeof PaletteEngine === 'undefined') return '#242d38';
    const nx = Math.min(0.99, Math.max(0, (layer.x + (layer.w || 0) / 2) / Math.max(1, state.width)));
    const ny = Math.min(0.99, Math.max(0, (layer.y + (layer.h || 0) / 2) / Math.max(1, state.height)));
    if (state.bg.src) {
      const sample = getCachedBgSample(state.bg.src);
      if (sample) {
        const px = sample.getContext('2d').getImageData(Math.floor(nx * 48), Math.floor(ny * 48), 1, 1).data;
        return PaletteEngine.rgbToHex(px[0], px[1], px[2]);
      }
      return '#242d38';
    }
    const bd = resolveBackdropColors();
    if (!bd) return '#242d38';
    return PaletteEngine.mixHex(bd.top, bd.bottom, ny);
  }

  function syncTextContrastUI() {
    if (typeof PaletteEngine === 'undefined') return;
    const l = activeLayer();
    if (!l || l.type !== 'text') return;
    const bgHex = estimateBackgroundHexAtLayer(l);
    const currentHex = PaletteEngine.normalizeHex(l.color) || '#ffffff';
    const ratio = PaletteEngine.getContrastRatio(currentHex, bgHex);
    const wcag = PaletteEngine.getWcagInfo(ratio);

    const badge = $('textContrastBadge');
    badge.textContent = `${ratio.toFixed(1)}:1 • ${wcag.level}`;
    badge.className = 'contrast-badge ' + (ratio >= 4.5 ? 'good' : ratio >= 3 ? 'warn' : 'bad');

    const suggestions = PaletteEngine.suggestTextColors(bgHex, getPaletteHexes());
    const root = $('textColorSuggestions');
    root.replaceChildren();
    for (const item of suggestions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-swatch-btn' + (item.hex === currentHex ? ' active' : '');
      btn.style.background = item.hex;
      btn.style.color = PaletteEngine.getContrastRatio('#ffffff', item.hex) >= 4.5 ? '#ffffff' : '#111827';
      btn.textContent = item.wcag.level;
      btn.title = `${item.label} (${item.hex}) • Tương phản ${item.ratio}:1 (${item.wcag.label})`;
      btn.addEventListener('click', () => {
        l.color = item.hex;
        $('textColor').value = item.hex;
        render();
        syncTextContrastUI();
        checkpoint();
      });
      root.appendChild(btn);
    }
  }

  function addText() {
    const l = {
      id: makeId(),
      type: 'text',
      name: 'Tiêu đề mới',
      text: 'SẢN PHẨM MỚI',
      color: '#ffffff',
      fontSize: 80,
      x: state.width * 0.1,
      y: state.height * 0.13,
      w: state.width * 0.8,
      h: 125,
      opacity: 100,
      rotation: 0,
      hidden: false,
      locked: false
    };
    if (typeof PaletteEngine !== 'undefined') {
      const bgHex = estimateBackgroundHexAtLayer(l);
      const best = PaletteEngine.suggestTextColors(bgHex, getPaletteHexes())[0];
      if (best) l.color = best.hex;
    }
    state.layers.push(l);
    state.selectedId = l.id;
    syncAll();
    checkpoint();
    notify('Đã thêm layer chữ');
  }

  function selectLayer(id) {
    state.selectedId = id;
    syncInspector();
    syncLayers();
    render();
  }

  function syncAll() {
    const str = `${state.width}x${state.height}`;
    $('sizePreset').value = str;
    $('btnCompare').classList.toggle('active', state.compare);
    refreshPresets();
    renderPalettePanel();
    syncInspector();
    syncLayers();
    render();
    requestAnimationFrame(fitStage);
  }

  function syncLayers() {
    const list = $('layerList');
    list.replaceChildren();
    $('layerCount').textContent = `${state.layers.length} đối tượng`;
    if (!state.layers.length) {
      const e = document.createElement('div');
      e.className = 'empty-layers';
      e.textContent = 'Chưa có layer';
      list.appendChild(e);
      return;
    }
    for (const l of [...state.layers].reverse()) {
      const row = document.createElement('div');
      row.className = 'layer-item' + (l.id === state.selectedId ? ' active' : '');
      row.addEventListener('click', () => selectLayer(l.id));
      const icon = document.createElement('span');
      icon.className = 'layer-thumb';
      icon.textContent = l.type === 'text' ? 'T' : '▧';
      const txt = document.createElement('span');
      txt.className = 'layer-name';
      txt.textContent = l.name;
      const meta = document.createElement('small');
      meta.className = 'layer-meta';
      meta.textContent = l.type === 'text' ? 'Text layer' : 'Image layer';
      txt.appendChild(meta);
      const show = document.createElement('button');
      show.className = 'layer-toggle';
      show.title = l.hidden ? 'Hiện layer' : 'Ẩn layer';
      show.textContent = l.hidden ? '◌' : '◉';
      show.addEventListener('click', (e) => {
        e.stopPropagation();
        l.hidden = !l.hidden;
        checkpoint();
        syncLayers();
        render();
      });
      row.append(icon, txt, show);
      list.appendChild(row);
    }
  }

  function initSliders() {
    const root = $('sliders');
    for (const s of slidersSpec) {
      const node = document.createElement('div');
      node.className = 'slider-control';
      const label = document.createElement('label');
      label.className = 'control-label';
      label.textContent = s.label;
      const output = document.createElement('output');
      output.id = `out-${s.key}`;
      output.textContent = s.default + s.suffix;
      label.appendChild(output);
      const input = document.createElement('input');
      input.id = `slider-${s.key}`;
      input.type = 'range';
      input.min = s.min;
      input.max = s.max;
      input.step = s.step;
      input.value = s.default;
      input.addEventListener('input', () => {
        const l = activeLayer();
        if (!l || l.type !== 'image') return;
        l[s.key] = Number(input.value);
        output.textContent = input.value + s.suffix;
        render();
      });
      input.addEventListener('change', checkpoint);
      node.append(label, input);
      root.appendChild(node);
    }
  }

  function syncInspector() {
    const l = activeLayer();
    $('noSelection').classList.toggle('hidden', !!l);
    $('selectedInfo').classList.toggle('hidden', !l);
    $('imageControls').classList.toggle('hidden', !l || l.type !== 'image');
    $('textControls').classList.toggle('hidden', !l || l.type !== 'text');
    $('selectedInfo').textContent = l ? l.name : '';
    if (!l) return;
    if (l.type === 'image') {
      slidersSpec.forEach((s) => {
        const value = l[s.key] ?? s.default;
        $(`slider-${s.key}`).value = value;
        $(`out-${s.key}`).textContent = value + s.suffix;
      });
      const pct = Math.round((l.w / (l.baseW || l.w)) * 100);
      $('scaleRange').value = pct;
      $('scaleValue').textContent = pct + '%';
      $('rotateRange').value = l.rotation || 0;
      $('rotateValue').textContent = (l.rotation || 0) + '°';
      $('shadowToggle').checked = !!l.shadow;
    }
    if (l.type === 'text') {
      $('textContent').value = l.text;
      $('textColor').value = l.color;
      $('textSize').value = l.fontSize;
      syncTextContrastUI();
    }
  }

  function resizeCanvas(value) {
    const [w, h] = value.split('x').map(Number);
    if (!w || !h) return;
    const sx = w / state.width;
    const sy = h / state.height;
    state.layers.forEach((l) => {
      l.x *= sx;
      l.y *= sy;
      l.w *= sx;
      l.h *= sy;
      if (l.baseW) l.baseW *= sx;
      if (l.baseH) l.baseH *= sy;
      if (l.type === 'text') l.fontSize *= Math.min(sx, sy);
    });
    state.width = w;
    state.height = h;
    zoomFactor = 1;
    syncAll();
    checkpoint();
    notify(`Đã chọn canvas ${w} × ${h}`);
  }

  function changeLayerOrder(direction) {
    const i = state.layers.findIndex((l) => l.id === state.selectedId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= state.layers.length) return;
    [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]];
    syncLayers();
    render();
    checkpoint();
  }

  function deleteLayer() {
    if (!state.selectedId) return;
    state.layers = state.layers.filter((l) => l.id !== state.selectedId);
    state.selectedId = state.layers.at(-1)?.id || null;
    syncAll();
    checkpoint();
    notify('Đã xóa layer');
  }

  function duplicateLayer() {
    const l = activeLayer();
    if (!l) return;
    const copy = { ...l, id: makeId(), name: l.name + ' (bản sao)', x: l.x + 35, y: l.y + 35 };
    state.layers.push(copy);
    state.selectedId = copy.id;
    syncAll();
    checkpoint();
    notify('Đã nhân bản');
  }

  function downloadFile(data, filename) {
    const a = document.createElement('a');
    a.href = data;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (data.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(data), 20000);
  }

  function exportImage() {
    const format = $('exportFormat').value;
    const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
    let source = canvas;
    if (format === 'jpeg') {
      const temp = document.createElement('canvas');
      temp.width = state.width;
      temp.height = state.height;
      const c = temp.getContext('2d');
      c.fillStyle = '#fff';
      c.fillRect(0, 0, temp.width, temp.height);
      c.drawImage(canvas, 0, 0);
      source = temp;
    }
    source.toBlob(
      (b) => {
        if (!b) return notify('Không thể xuất ảnh', true);
        downloadFile(URL.createObjectURL(b), `${safeFile(state.projectName)}.${format === 'jpeg' ? 'jpg' : format}`);
        notify(`Đã xuất ảnh ${state.width}×${state.height}`);
      },
      mime,
      0.94
    );
  }

  function safeFile(value) {
    return (
      (value || 'product-studio')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'product-studio'
    );
  }

  function saveProject() {
    state.projectName = $('projectName').textContent.trim() || 'Dự án sản phẩm';
    const payload = { type: 'FNB_PRODUCT_STUDIO', version: 2, savedAt: new Date().toISOString(), document: JSON.parse(snap()) };
    downloadFile('data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload)), `${safeFile(state.projectName)}.studio.json`);
    notify('Đã lưu dự án .studio.json');
  }

  async function loadProject(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json.type !== 'FNB_PRODUCT_STUDIO' || !json.document) throw Error('Không phải định dạng dự án Studio');
      restore(JSON.stringify(json.document));
      history = [];
      redoStack = [];
      checkpoint();
      notify('Đã mở dự án');
    } catch (e) {
      notify('Không mở được dự án: ' + e.message, true);
    }
  }

  function resetAdjust() {
    const l = activeLayer();
    if (!l || l.type !== 'image') return;
    slidersSpec.forEach((s) => (l[s.key] = s.default));
    syncInspector();
    render();
    checkpoint();
    notify('Đã đặt lại bộ lọc');
  }

  async function detectAI() {
    try {
      const c = new AbortController();
      const timeout = setTimeout(() => c.abort(), 1600);
      const response = await fetch(DEFAULT_API + '/api/health', { signal: c.signal });
      clearTimeout(timeout);
      if (!response.ok) throw Error('API không sẵn sàng');
      $('aiStatus').textContent = 'Đã kết nối';
      $('aiStatus').classList.add('connected');
    } catch {
      $('aiStatus').textContent = 'Chưa kết nối';
      $('aiStatus').classList.remove('connected');
    }
  }

  async function removeBackground() {
    const layer = activeLayer();
    if (!layer || layer.type !== 'image') {
      notify('Hãy chọn một layer ảnh trước', true);
      return;
    }
    const b = $('btnRemoveBg');
    const oldText = b.querySelector('strong').textContent;
    b.disabled = true;
    b.querySelector('strong').textContent = 'Đang tách nền...';
    notify('Đang xử lý ảnh trên máy, lần đầu có thể cần tải model AI');
    try {
      const blob = await (await fetch(layer.src)).blob();
      const fd = new FormData();
      fd.append('file', new File([blob], 'product.png', { type: blob.type || 'image/png' }));
      const r = await fetch(DEFAULT_API + '/api/remove-background', { method: 'POST', body: fd });
      if (!r.ok) {
        const message = await r.text();
        throw Error(message.slice(0, 250));
      }
      const out = await r.blob();
      layer.src = await readAsDataURL(out);
      layer.name = layer.name.replace(/\s*\[đã tách nền\]$/, '') + ' [đã tách nền]';
      await extractPaletteFromLayer(layer, { saveCheckpoint: false, silent: true });
      syncAll();
      checkpoint();
      notify('Đã tách nền AI & cập nhật bảng màu sản phẩm');
    } catch (e) {
      notify('Tách nền chưa hoạt động. Hãy chạy Python backend theo README.', true);
      console.warn(e);
    } finally {
      b.disabled = false;
      b.querySelector('strong').textContent = oldText;
      detectAI();
    }
  }

  function initEvents() {
    $('btnAddPhoto').onclick = $('btnEmptyAdd').onclick = () => $('photoInput').click();
    $('photoInput').onchange = (e) => addPhotoFiles(e.target.files).catch((err) => notify(err.message, true));
    $('btnAddBackground').onclick = () => $('bgInput').click();
    $('bgInput').onchange = (e) => addBgFile(e.target.files[0]).catch((err) => notify(err.message, true));
    $('btnDemo').onclick = async () => {
      try {
        const response = await fetch('assets/demo-binh-giu-nhiet.jpeg');
        if (!response.ok) throw Error('Không tải được ảnh mẫu');
        const src = await readAsDataURL(await response.blob());
        await addImage(src, 'Bình giữ nhiệt • Demo');
        notify('Đã tải ảnh bình giữ nhiệt & trích màu');
      } catch {
        notify('Mở bằng localhost để sử dụng ảnh demo, hoặc tải ảnh từ máy.', true);
      }
    };

    $('tabPalettePhoto').onclick = () => setPaletteTab('photo');
    $('tabPaletteMood').onclick = () => setPaletteTab('mood');
    $('btnExtractPalette').onclick = () => extractPaletteFromLayer(null, { saveCheckpoint: true, silent: false });
    $('paletteBasePicker').addEventListener('input', (e) => {
      state.palette.baseColor = e.target.value;
      renderPalettePanel();
    });
    $('paletteBasePicker').addEventListener('change', checkpoint);
    $('btnAutoTextColor').onclick = () => {
      const l = activeLayer();
      if (!l || l.type !== 'text' || typeof PaletteEngine === 'undefined') return;
      const bgHex = estimateBackgroundHexAtLayer(l);
      const best = PaletteEngine.suggestTextColors(bgHex, getPaletteHexes())[0];
      if (!best) return;
      l.color = best.hex;
      $('textColor').value = best.hex;
      render();
      syncTextContrastUI();
      checkpoint();
      notify(`Đã chọn màu chữ ${best.hex} (${best.ratio}:1 ${best.wcag.level})`);
    };

    $('btnAddText').onclick = addText;
    $('btnUndo').onclick = undo;
    $('btnRedo').onclick = redo;
    $('btnSave').onclick = saveProject;
    $('btnExport').onclick = $('btnExportAside').onclick = exportImage;
    $('btnOpenProject').onclick = () => $('openProjectInput').click();
    $('openProjectInput').onchange = (e) => {
      if (e.target.files[0]) loadProject(e.target.files[0]);
    };
    $('btnRemoveBg').onclick = removeBackground;
    $('btnResetAdjust').onclick = resetAdjust;
    $('btnDuplicate').onclick = duplicateLayer;
    $('btnLayerUp').onclick = () => changeLayerOrder(1);
    $('btnLayerDown').onclick = () => changeLayerOrder(-1);
    $('btnDeleteLayer').onclick = deleteLayer;
    $('btnCompare').onclick = () => {
      state.compare = !state.compare;
      $('btnCompare').classList.toggle('active', state.compare);
      render();
    };
    $('sizePreset').onchange = (e) => resizeCanvas(e.target.value);
    $('btnFit').onclick = () => {
      zoomFactor = 1;
      fitStage();
    };
    $('btnZoomIn').onclick = () => {
      zoomFactor = Math.min(3, zoomFactor * 1.25);
      applyZoom();
    };
    $('btnZoomOut').onclick = () => {
      zoomFactor = Math.max(0.3, zoomFactor / 1.25);
      applyZoom();
    };
    $('scaleRange').addEventListener('input', (e) => {
      const l = activeLayer();
      if (!l || l.type !== 'image') return;
      const cx = l.x + l.w / 2;
      const cy = l.y + l.h / 2;
      const factor = Number(e.target.value) / 100;
      l.w = l.baseW * factor;
      l.h = l.baseH * factor;
      l.x = cx - l.w / 2;
      l.y = cy - l.h / 2;
      $('scaleValue').textContent = e.target.value + '%';
      render();
    });
    $('scaleRange').addEventListener('change', checkpoint);
    $('rotateRange').addEventListener('input', (e) => {
      const l = activeLayer();
      if (!l) return;
      l.rotation = Number(e.target.value);
      $('rotateValue').textContent = l.rotation + '°';
      render();
    });
    $('rotateRange').addEventListener('change', checkpoint);
    $('shadowToggle').addEventListener('change', (e) => {
      const l = activeLayer();
      if (!l) return;
      l.shadow = e.target.checked;
      render();
      checkpoint();
    });
    $('textContent').addEventListener('input', (e) => {
      const l = activeLayer();
      if (!l || l.type !== 'text') return;
      l.text = e.target.value;
      l.name = e.target.value.slice(0, 22) || 'Chữ';
      render();
      syncLayers();
    });
    $('textContent').addEventListener('change', checkpoint);
    $('textColor').addEventListener('input', (e) => {
      const l = activeLayer();
      if (!l || l.type !== 'text') return;
      l.color = e.target.value;
      render();
      syncTextContrastUI();
    });
    $('textColor').addEventListener('change', checkpoint);
    $('textSize').addEventListener('input', (e) => {
      const l = activeLayer();
      if (!l || l.type !== 'text') return;
      l.fontSize = Number(e.target.value);
      render();
    });
    $('textSize').addEventListener('change', checkpoint);
    $('projectName').addEventListener('blur', () => {
      state.projectName = $('projectName').textContent.trim() || 'Dự án mới';
      checkpoint();
    });
    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('pointercancel', onPointerUp);

    const stage = $('stageWrap');
    stage.addEventListener('dragover', (e) => {
      e.preventDefault();
      stage.classList.add('drag-over');
    });
    stage.addEventListener('dragleave', () => stage.classList.remove('drag-over'));
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      stage.classList.remove('drag-over');
      addPhotoFiles(e.dataTransfer.files).catch((err) => notify(err.message, true));
    });

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (editing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteLayer();
        e.preventDefault();
      }
      const l = activeLayer();
      if (l && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') l.x -= step;
        if (e.key === 'ArrowRight') l.x += step;
        if (e.key === 'ArrowUp') l.y -= step;
        if (e.key === 'ArrowDown') l.y += step;
        render();
        syncTextContrastUI();
        checkpoint();
        e.preventDefault();
      }
    });
    new ResizeObserver(() => fitStage()).observe(stage);
  }

  initSliders();
  initEvents();
  syncAll();
  checkpoint();
  detectAI();
})();
