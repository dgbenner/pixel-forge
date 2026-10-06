// ═══════════════════════════════════════════════════════════
//  COLOR
//  Foreground / background colors, the Color panel's sliders in a
//  choice of models (RGB, HSL, HSB, CMYK), and the hex field.
//  state.fgColor / state.bgColor stay #rrggbb; the sliders are a view.
// ═══════════════════════════════════════════════════════════

// Each model: channel letters, maxima, and conversion to/from RGB (0–255)
var COLOR_MODELS = {
  RGB:  { ch: ['R', 'G', 'B'],      max: [255, 255, 255],
          from: function(c) { return [c.r, c.g, c.b]; },
          to:   function(v) { return { r: v[0], g: v[1], b: v[2] }; } },
  HSL:  { ch: ['H', 'S', 'L'],      max: [360, 100, 100], from: rgbToHsl, to: hslToRgb },
  HSB:  { ch: ['H', 'S', 'B'],      max: [360, 100, 100], from: rgbToHsb, to: hsbToRgb },
  // Simple device CMYK, no color profile: a guide for picking, not print-accurate
  CMYK: { ch: ['C', 'M', 'Y', 'K'], max: [100, 100, 100, 100], from: rgbToCmyk, to: cmykToRgb }
};
var COLOR_MODEL_KEY = 'pf-color-model';
var colorModel = 'RGB';
var colorValues = null;   // current slider values in colorModel; kept while dragging

// ── Model sliders ─────────────────────────────────────────
function buildColorSliders() {
  try { var saved = localStorage.getItem(COLOR_MODEL_KEY); if (COLOR_MODELS[saved]) colorModel = saved; } catch (e) {}
  var tabs = document.getElementById('color-models');
  tabs.innerHTML = '';
  Object.keys(COLOR_MODELS).forEach(function(name) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = name;
    b.setAttribute('aria-pressed', String(name === colorModel));
    b.onclick = function() { setColorModel(name); };
    tabs.appendChild(b);
  });
  renderColorSliders();
}

function setColorModel(name) {
  colorModel = name;
  try { localStorage.setItem(COLOR_MODEL_KEY, name); } catch (e) {}
  document.querySelectorAll('#color-models button').forEach(function(b) {
    b.setAttribute('aria-pressed', String(b.textContent === name));
  });
  renderColorSliders();
}

function renderColorSliders() {
  var m = COLOR_MODELS[colorModel];
  var box = document.getElementById('color-sliders');
  box.innerHTML = '';
  m.ch.forEach(function(ch, i) {
    var row = document.createElement('div');
    row.className = 'color-row';
    var label = document.createElement('label');
    label.textContent = ch;
    label.htmlFor = 'color-ch-' + i;
    var range = document.createElement('input');
    range.type = 'range'; range.id = 'color-ch-' + i; range.min = 0; range.max = m.max[i];
    var num = document.createElement('input');
    num.type = 'number'; num.min = 0; num.max = m.max[i];
    num.setAttribute('aria-label', ch);
    range.oninput = function() { colorChannelChanged(i, +range.value); };
    num.oninput = function() { if (num.value !== '') colorChannelChanged(i, +num.value); };
    row.appendChild(label); row.appendChild(range); row.appendChild(num);
    box.appendChild(row);
  });
  colorValues = null;   // re-read from the current color
  updateColorUI();
}

function colorChannelChanged(i, v) {
  var m = COLOR_MODELS[colorModel];
  v = Math.max(0, Math.min(m.max[i], Math.round(v)));
  if (!colorValues) colorValues = m.from(hexToRgb(state.fgColor));
  colorValues[i] = v;
  var rgb = m.to(colorValues);
  state.fgColor = rgbToHex(rgb);
  showColor(true);
}

// Push state.fgColor into the panel. keepValues = the sliders are the source (dragging)
function showColor(keepValues) {
  var m = COLOR_MODELS[colorModel];
  if (!keepValues || !colorValues) colorValues = m.from(hexToRgb(state.fgColor));
  document.querySelectorAll('#color-sliders .color-row').forEach(function(row, i) {
    var inputs = row.querySelectorAll('input');
    inputs[0].value = colorValues[i];
    if (document.activeElement !== inputs[1]) inputs[1].value = colorValues[i];
  });
  if (document.activeElement !== document.getElementById('hex-input')) {
    document.getElementById('hex-input').value = state.fgColor.replace('#', '');
  }
  document.getElementById('fg-color-swatch').style.background = state.fgColor;
  document.getElementById('cp-fg').style.background = state.fgColor;
}

function updateColorUI() {
  if (!document.querySelector('#color-sliders .color-row')) return;
  colorValues = null;
  showColor(false);
  document.getElementById('bg-color-swatch').style.background = state.bgColor;
  document.getElementById('cp-bg').style.background = state.bgColor;
}

function hexToColor() {
  var h = document.getElementById('hex-input').value.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(h)) {
    state.fgColor = '#' + h.toLowerCase();
    updateColorUI();
  }
}

function pickFgColor() {
  var input = document.getElementById('fg-color-input');
  input.value = state.fgColor;
  input.click();
}

function pickBgColor() {
  var input = document.getElementById('bg-color-input');
  input.value = state.bgColor;
  input.click();
}

function fgColorChanged(v) {
  state.fgColor = v;
  updateColorUI();
}

function bgColorChanged(v) {
  state.bgColor = v;
  document.getElementById('bg-color-swatch').style.background = v;
  document.getElementById('cp-bg').style.background = v;
}

function swapColors() {
  var tmp = state.fgColor;
  state.fgColor = state.bgColor;
  state.bgColor = tmp;
  updateColorUI();
}

// ── Conversions (RGB 0–255; H 0–360; everything else 0–100) ──
function rgbToHsl(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(v) {
  var h = v[0], s = v[1] / 100, l = v[2] / 100;
  var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  return hueParts(h, c, x, m);
}

function rgbToHsb(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [Math.round(h), Math.round(max ? d / max * 100 : 0), Math.round(max * 100)];
}

function hsbToRgb(v) {
  var h = v[0], s = v[1] / 100, b = v[2] / 100;
  var c = b * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = b - c;
  return hueParts(h, c, x, m);
}

function hueParts(h, c, x, m) {
  var p = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
          h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((p[0] + m) * 255), g: Math.round((p[1] + m) * 255), b: Math.round((p[2] + m) * 255) };
}

function rgbToCmyk(c) {
  var r = c.r / 255, g = c.g / 255, b = c.b / 255, k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [Math.round((1 - r - k) / (1 - k) * 100), Math.round((1 - g - k) / (1 - k) * 100),
          Math.round((1 - b - k) / (1 - k) * 100), Math.round(k * 100)];
}

function cmykToRgb(v) {
  var k = v[3] / 100;
  return { r: Math.round(255 * (1 - v[0] / 100) * (1 - k)),
           g: Math.round(255 * (1 - v[1] / 100) * (1 - k)),
           b: Math.round(255 * (1 - v[2] / 100) * (1 - k)) };
}

// ── Utility colour helpers ────────────────────────────────
function hexToRgb(hex) {
  var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function rgbToHex(c) {
  return '#' + [c.r, c.g, c.b].map(function(n) {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  }).join('');
}

function hexToRgba(hex) {
  var rgb = hexToRgb(hex);
  return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b, a: 255 } : { r: 0, g: 0, b: 0, a: 255 };
}
