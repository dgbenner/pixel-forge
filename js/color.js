// ═══════════════════════════════════════════════════════════
//  COLOR
//  Color picker, RGB sliders, hex input, swatches,
//  foreground / background color management.
// ═══════════════════════════════════════════════════════════

function updateColorUI() {
  document.getElementById('fg-color-swatch').style.background = state.fgColor;
  document.getElementById('cp-fg').style.background = state.fgColor;
  var rgb = hexToRgb(state.fgColor);
  if (rgb) {
    document.getElementById('sl-r').value  = rgb.r;
    document.getElementById('num-r').value = rgb.r;
    document.getElementById('sl-g').value  = rgb.g;
    document.getElementById('num-g').value = rgb.g;
    document.getElementById('sl-b').value  = rgb.b;
    document.getElementById('num-b').value = rgb.b;
    document.getElementById('hex-input').value = state.fgColor.replace('#', '');
  }
  document.getElementById('bg-color-swatch').style.background = state.bgColor;
  document.getElementById('cp-bg').style.background = state.bgColor;
}

function sliderToColor() {
  var r = +document.getElementById('sl-r').value;
  var g = +document.getElementById('sl-g').value;
  var b = +document.getElementById('sl-b').value;
  document.getElementById('num-r').value = r;
  document.getElementById('num-g').value = g;
  document.getElementById('num-b').value = b;
  state.fgColor = '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0');
  document.getElementById('hex-input').value = state.fgColor.replace('#', '');
  document.getElementById('fg-color-swatch').style.background = state.fgColor;
  document.getElementById('cp-fg').style.background = state.fgColor;
}

function hexToColor() {
  var h = document.getElementById('hex-input').value.trim().replace('#', '');
  if (h.length === 6) {
    state.fgColor = '#' + h;
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
  document.getElementById('bg-color-swatch').style.background = state.bgColor;
  document.getElementById('cp-bg').style.background = state.bgColor;
}

function buildSwatches() {
  var colors = [
    '#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff',
    '#ff8800','#8800ff','#0088ff','#ff0088','#88ff00','#00ff88','#888888','#444444'
  ];
  var grid = document.getElementById('swatches-grid');
  colors.forEach(function(c) {
    var s = document.createElement('div');
    s.style.cssText = 'background:' + c + ';height:14px;border-radius:2px;border:1px solid #555;cursor:pointer';
    s.onclick = function() { state.fgColor = c; updateColorUI(); };
    grid.appendChild(s);
  });
}

// ── Utility colour helpers ────────────────────────────────
function hexToRgb(hex) {
  var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
}

function hexToRgba(hex) {
  var rgb = hexToRgb(hex);
  return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b, a: 255 } : { r: 0, g: 0, b: 0, a: 255 };
}
