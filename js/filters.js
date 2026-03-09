// ═══════════════════════════════════════════════════════════
//  FILTERS
//  Real-time preview via CSS filter (hue/saturation) and
//  canvas ImageData manipulation (blur/sharpen).
//  Operates on the currently active layer.
// ═══════════════════════════════════════════════════════════

// Current filter slider values
var filterState = {
  blur:       0,   // 0–20 px
  sharpen:    0,   // 0–10
  hue:        0,   // 0–360 deg
  saturation: 100  // 0–200 %
};

// ── Slider sync helpers ───────────────────────────────────
function initFilterSliders() {
  var sliders = ['blur', 'sharpen', 'hue', 'saturation'];
  sliders.forEach(function(id) {
    var slider = document.getElementById('filter-' + id);
    var valEl  = document.getElementById('filter-' + id + '-val');
    if (!slider) return;
    slider.addEventListener('input', function() {
      filterState[id] = +slider.value;
      valEl.textContent = slider.value + (id === 'hue' ? '\u00B0' : (id === 'saturation' ? '%' : (id === 'blur' ? 'px' : '')));
      previewFilters();
    });
  });
}

// ── Live preview using CSS filter on the active layer canvas ─
function previewFilters() {
  var layer = state.layers[state.activeLayer];
  if (!layer) return;
  var parts = [];
  if (filterState.blur > 0)              parts.push('blur(' + filterState.blur + 'px)');
  if (filterState.hue !== 0)             parts.push('hue-rotate(' + filterState.hue + 'deg)');
  if (filterState.saturation !== 100)    parts.push('saturate(' + filterState.saturation + '%)');
  layer.canvas.style.filter = parts.length ? parts.join(' ') : '';
  renderAll();
}

// ── Apply: bake filters into ImageData, then reset CSS filter ─
function applyFilters() {
  var layer = state.layers[state.activeLayer];
  if (!layer) return;

  // Reset any live CSS preview first
  layer.canvas.style.filter = '';

  pushHistory('Apply Filters');
  var lctx = layer.canvas.getContext('2d');
  var w = layer.canvas.width, h = layer.canvas.height;

  // 1. Hue rotation + saturation via offscreen canvas + CSS filter bake
  if (filterState.hue !== 0 || filterState.saturation !== 100) {
    var parts = [];
    if (filterState.hue !== 0)          parts.push('hue-rotate(' + filterState.hue + 'deg)');
    if (filterState.saturation !== 100) parts.push('saturate(' + filterState.saturation + '%)');

    var tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    var tc = tmp.getContext('2d');
    tc.filter = parts.join(' ');
    tc.drawImage(layer.canvas, 0, 0);
    tc.filter = 'none';

    lctx.clearRect(0, 0, w, h);
    lctx.drawImage(tmp, 0, 0);
  }

  // 2. Box blur via ImageData
  if (filterState.blur > 0) {
    applyBoxBlur(lctx, w, h, Math.round(filterState.blur));
  }

  // 3. Sharpen via convolution
  if (filterState.sharpen > 0) {
    applySharpen(lctx, w, h, filterState.sharpen);
  }

  renderAll();
  resetFilterSliders();
}

// ── Reset sliders and remove CSS preview ─────────────────
function resetFilters() {
  var layer = state.layers[state.activeLayer];
  if (layer) layer.canvas.style.filter = '';
  resetFilterSliders();
  renderAll();
}

function resetFilterSliders() {
  filterState = { blur: 0, sharpen: 0, hue: 0, saturation: 100 };

  var defs = { blur: '0px', sharpen: '', hue: '0\u00B0', saturation: '100%' };
  var vals = { blur: 0, sharpen: 0, hue: 0, saturation: 100 };

  ['blur', 'sharpen', 'hue', 'saturation'].forEach(function(id) {
    var sl = document.getElementById('filter-' + id);
    var vl = document.getElementById('filter-' + id + '-val');
    if (sl) sl.value = vals[id];
    if (vl) vl.textContent = defs[id];
  });
}

// ── Box blur (multi-pass for larger radii) ────────────────
function applyBoxBlur(lctx, w, h, radius) {
  if (radius <= 0) return;
  var passes = Math.min(radius, 3); // up to 3 passes for performance
  var r = Math.max(1, Math.round(radius / passes));
  for (var p = 0; p < passes; p++) {
    var imgData = lctx.getImageData(0, 0, w, h);
    var src = imgData.data;
    var dst = new Uint8ClampedArray(src.length);
    boxBlurH(src, dst, w, h, r);
    boxBlurV(dst, src, w, h, r);
    // src now holds result
    var out = lctx.createImageData(w, h);
    out.data.set(src);
    lctx.putImageData(out, 0, 0);
  }
}

function boxBlurH(src, dst, w, h, r) {
  var iarr = 1 / (r + r + 1);
  for (var i = 0; i < h; i++) {
    var ti = i * w, li = ti, ri = ti + r;
    var fv0 = src[ti*4], fv1 = src[ti*4+1], fv2 = src[ti*4+2], fv3 = src[ti*4+3];
    var lv0 = src[(ti+w-1)*4], lv1 = src[(ti+w-1)*4+1], lv2 = src[(ti+w-1)*4+2], lv3 = src[(ti+w-1)*4+3];
    var val0 = (r+1)*fv0, val1 = (r+1)*fv1, val2 = (r+1)*fv2, val3 = (r+1)*fv3;
    for (var j = 0; j < r; j++) {
      val0 += src[(ti+j)*4]; val1 += src[(ti+j)*4+1]; val2 += src[(ti+j)*4+2]; val3 += src[(ti+j)*4+3];
    }
    for (var j = 0; j <= r; j++) {
      val0 += src[ri*4] - fv0; val1 += src[ri*4+1] - fv1; val2 += src[ri*4+2] - fv2; val3 += src[ri*4+3] - fv3;
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      ri++; ti++;
    }
    for (var j = r+1; j < w-r; j++) {
      val0 += src[ri*4] - src[li*4]; val1 += src[ri*4+1] - src[li*4+1]; val2 += src[ri*4+2] - src[li*4+2]; val3 += src[ri*4+3] - src[li*4+3];
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      ri++; li++; ti++;
    }
    for (var j = w-r; j < w; j++) {
      val0 += lv0 - src[li*4]; val1 += lv1 - src[li*4+1]; val2 += lv2 - src[li*4+2]; val3 += lv3 - src[li*4+3];
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      li++; ti++;
    }
  }
}

function boxBlurV(src, dst, w, h, r) {
  var iarr = 1 / (r + r + 1);
  for (var i = 0; i < w; i++) {
    var ti = i, li = ti, ri = ti + r*w;
    var fv0 = src[ti*4], fv1 = src[ti*4+1], fv2 = src[ti*4+2], fv3 = src[ti*4+3];
    var lv0 = src[(ti+(h-1)*w)*4], lv1 = src[(ti+(h-1)*w)*4+1], lv2 = src[(ti+(h-1)*w)*4+2], lv3 = src[(ti+(h-1)*w)*4+3];
    var val0 = (r+1)*fv0, val1 = (r+1)*fv1, val2 = (r+1)*fv2, val3 = (r+1)*fv3;
    for (var j = 0; j < r; j++) {
      val0 += src[(ti+j*w)*4]; val1 += src[(ti+j*w)*4+1]; val2 += src[(ti+j*w)*4+2]; val3 += src[(ti+j*w)*4+3];
    }
    for (var j = 0; j <= r; j++) {
      val0 += src[ri*4] - fv0; val1 += src[ri*4+1] - fv1; val2 += src[ri*4+2] - fv2; val3 += src[ri*4+3] - fv3;
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      ri += w; ti += w;
    }
    for (var j = r+1; j < h-r; j++) {
      val0 += src[ri*4] - src[li*4]; val1 += src[ri*4+1] - src[li*4+1]; val2 += src[ri*4+2] - src[li*4+2]; val3 += src[ri*4+3] - src[li*4+3];
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      ri += w; li += w; ti += w;
    }
    for (var j = h-r; j < h; j++) {
      val0 += lv0 - src[li*4]; val1 += lv1 - src[li*4+1]; val2 += lv2 - src[li*4+2]; val3 += lv3 - src[li*4+3];
      dst[ti*4] = val0*iarr; dst[ti*4+1] = val1*iarr; dst[ti*4+2] = val2*iarr; dst[ti*4+3] = val3*iarr;
      li += w; ti += w;
    }
  }
}

// ── Unsharp-mask style sharpen via convolution ────────────
function applySharpen(lctx, w, h, strength) {
  // Clamp strength to reasonable range for the kernel weight
  var s = Math.min(strength / 10, 1.0); // 0.0 – 1.0
  // Sharpening kernel: identity + (identity - blur) * s
  // Expressed as a single kernel: center = 1 + 4s, neighbours = -s
  var c = 1 + 4 * s;
  var k = [-s, -s, -s, -s, c, -s, -s, -s, -s]; // 3x3 laplacian sharpen

  var imgData = lctx.getImageData(0, 0, w, h);
  var src  = imgData.data;
  var dst  = new Uint8ClampedArray(src.length);

  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      var idx = (y * w + x) * 4;
      for (var ch = 0; ch < 3; ch++) {
        var v = 0;
        for (var ky = -1; ky <= 1; ky++) {
          for (var kx = -1; kx <= 1; kx++) {
            var si = ((y + ky) * w + (x + kx)) * 4 + ch;
            v += src[si] * k[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[idx + ch] = Math.min(255, Math.max(0, v));
      }
      dst[idx + 3] = src[idx + 3]; // preserve alpha
    }
  }

  // Copy border pixels unchanged
  for (var x = 0; x < w; x++) {
    for (var ch = 0; ch < 4; ch++) {
      dst[x * 4 + ch]               = src[x * 4 + ch];
      dst[((h-1)*w + x)*4 + ch]     = src[((h-1)*w + x)*4 + ch];
    }
  }
  for (var y = 0; y < h; y++) {
    for (var ch = 0; ch < 4; ch++) {
      dst[y*w*4 + ch]               = src[y*w*4 + ch];
      dst[(y*w + w-1)*4 + ch]       = src[(y*w + w-1)*4 + ch];
    }
  }

  var out = lctx.createImageData(w, h);
  out.data.set(dst);
  lctx.putImageData(out, 0, 0);
}
