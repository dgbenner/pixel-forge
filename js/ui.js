// ═══════════════════════════════════════════════════════════
//  UI
//  Menu bar, panel toggles, keyboard shortcuts, file I/O,
//  image adjustments, modals, brush controls, info panel.
// ═══════════════════════════════════════════════════════════

// ── Warn before closing ──────────────────────────────────
window.addEventListener('beforeunload', function(e) {
  e.preventDefault();
  e.returnValue = 'You have unsaved work in PixelForge. Use File > Save Project to save a .pfg file to your computer.';
});

// ── Menu bar ─────────────────────────────────────────────
function closeMenus() {
  document.querySelectorAll('.menu-item').forEach(function(m) {
    m.classList.remove('active');
  });
}

document.querySelectorAll('#menubar .menu-item').forEach(function(item) {
  item.addEventListener('click', function(e) {
    e.stopPropagation();
    var wasActive = item.classList.contains('active');
    closeMenus();
    if (!wasActive) item.classList.add('active');
  });
});
document.addEventListener('click', closeMenus);

// ── Panel collapse toggle ─────────────────────────────────
function togglePanel(name) {
  document.getElementById('panel-' + name).classList.toggle('collapsed');
}

// ── Brush / tool option controls ─────────────────────────
function updateBrushSize(v) {
  state.brushSize = +v;
  document.getElementById('brush-size').value     = v;
  document.getElementById('brush-size-num').value = v;
}

function updateOpacity(v) {
  state.brushOpacity = Math.max(0.01, Math.min(1, +v / 100));
  document.getElementById('brush-opacity').value     = v;
  document.getElementById('brush-opacity-num').value = v;
}

function updateHardness(v) {
  state.brushHardness = +v / 100;
  document.getElementById('brush-hardness').value     = v;
  document.getElementById('brush-hardness-num').value = v;
}

// ── Info panel updates ────────────────────────────────────
function updateInfoXY(x, y) {
  document.getElementById('info-x').textContent = x;
  document.getElementById('info-y').textContent = y;
  if (x >= 0 && y >= 0 && x < state.docW && y < state.docH) {
    var d = ctx.getImageData(x, y, 1, 1).data;
    document.getElementById('info-r').textContent = d[0];
    document.getElementById('info-g').textContent = d[1];
    document.getElementById('info-b').textContent = d[2];
    document.getElementById('info-a').textContent = d[3];
  }
}

function updateInfoPanel() {
  document.getElementById('info-size').textContent   = state.docW + '\u00D7' + state.docH;
  document.getElementById('info-layers').textContent = state.layers.length;
}

// ── Image adjustments ─────────────────────────────────────
// Menu items push history BEFORE changing pixels (existing behaviour, see README).
// The *Core functions do only the pixel math so the agent tools can share it.
function grayscaleCore(layer) {
  var lctx  = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var avg = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    d[i] = d[i+1] = d[i+2] = avg;
  }
  lctx.putImageData(imgData, 0, 0);
}

function invertCore(layer) {
  var lctx  = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2];
  }
  lctx.putImageData(imgData, 0, 0);
}

// brightness and contrast are both -255..255
function brightnessContrastCore(layer, val, cont) {
  var lctx  = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  var factor = (259 * (cont + 255)) / (255 * (259 - cont));
  for (var i = 0; i < d.length; i += 4) {
    d[i]   = Math.min(255, Math.max(0, factor * (d[i]   - 128) + 128 + val));
    d[i+1] = Math.min(255, Math.max(0, factor * (d[i+1] - 128) + 128 + val));
    d[i+2] = Math.min(255, Math.max(0, factor * (d[i+2] - 128) + 128 + val));
  }
  lctx.putImageData(imgData, 0, 0);
}

// Average each size×size cell (alpha-weighted) and fill the cell with it
function pixelateCore(layer, size) {
  var w = layer.canvas.width, h = layer.canvas.height;
  var lctx = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, w, h);
  var d = imgData.data;
  for (var cy = 0; cy < h; cy += size) {
    for (var cx = 0; cx < w; cx += size) {
      var x1 = Math.min(cx + size, w), y1 = Math.min(cy + size, h);
      var r = 0, g = 0, b = 0, a = 0, n = 0, x, y, i;
      for (y = cy; y < y1; y++) for (x = cx; x < x1; x++) {
        i = (y * w + x) * 4;
        r += d[i] * d[i+3]; g += d[i+1] * d[i+3]; b += d[i+2] * d[i+3]; a += d[i+3]; n++;
      }
      if (a > 0) { r /= a; g /= a; b /= a; }
      a /= n;
      for (y = cy; y < y1; y++) for (x = cx; x < x1; x++) {
        i = (y * w + x) * 4;
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = a;
      }
    }
  }
  lctx.putImageData(imgData, 0, 0);
}

// Reduce each channel to `levels` evenly spaced values
function posterizeCore(layer, levels) {
  var lctx = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data, n = levels - 1;
  for (var i = 0; i < d.length; i += 4) {
    d[i]   = Math.round(d[i]   / 255 * n) / n * 255;
    d[i+1] = Math.round(d[i+1] / 255 * n) / n * 255;
    d[i+2] = Math.round(d[i+2] / 255 * n) / n * 255;
  }
  lctx.putImageData(imgData, 0, 0);
}

// Monochrome film grain: the same random offset on R, G and B, up to ±amount×2
function grainCore(layer, amount) {
  var lctx = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data, range = amount * 2;
  for (var i = 0; i < d.length; i += 4) {
    var n = (Math.random() * 2 - 1) * range;
    d[i] += n; d[i+1] += n; d[i+2] += n; // Uint8ClampedArray clamps to 0–255
  }
  lctx.putImageData(imgData, 0, 0);
}

// Pull shadows toward one tint and highlights toward another.
// Shadow weight (1-L)², highlight weight L², each × strength/100.
// Either tint may be null.
function colorBalanceCore(layer, shadowsTint, highlightsTint, strength) {
  var sh = shadowsTint ? hexToRgb(shadowsTint) : null;
  var hi = highlightsTint ? hexToRgb(highlightsTint) : null;
  var k = strength / 100;
  var lctx = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var L = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255;
    var r = d[i], g = d[i+1], b = d[i+2], w;
    if (sh) { w = (1 - L) * (1 - L) * k; r += (sh.r - r) * w; g += (sh.g - g) * w; b += (sh.b - b) * w; }
    if (hi) { w = L * L * k;             r += (hi.r - r) * w; g += (hi.g - g) * w; b += (hi.b - b) * w; }
    d[i] = r; d[i+1] = g; d[i+2] = b;
  }
  lctx.putImageData(imgData, 0, 0);
}

function applyGrayscale() {
  pushHistory('Grayscale');
  grayscaleCore(state.layers[state.activeLayer]);
  renderAll();
}

function applyInvert() {
  pushHistory('Invert');
  invertCore(state.layers[state.activeLayer]);
  renderAll();
}

function applyBrightness() {
  var val  = +prompt('Brightness (-255 to 255):', '0');
  var cont = +prompt('Contrast (-255 to 255):', '0');
  if (isNaN(val) || isNaN(cont)) return;
  pushHistory('Brightness/Contrast');
  brightnessContrastCore(state.layers[state.activeLayer], val, cont);
  renderAll();
}

// New effects push history AFTER the change, so undo returns to the pre-effect image
function applyPixelate() {
  var size = Math.round(+prompt('Pixelate cell size (2 to 64 px):', '8'));
  if (isNaN(size) || size < 2 || size > 64) return;
  pixelateCore(state.layers[state.activeLayer], size);
  renderAll();
  pushHistory('Pixelate ' + size + 'px');
}

function applyPosterize() {
  var levels = Math.round(+prompt('Posterize levels per channel (2 to 16):', '5'));
  if (isNaN(levels) || levels < 2 || levels > 16) return;
  posterizeCore(state.layers[state.activeLayer], levels);
  renderAll();
  pushHistory('Posterize ' + levels);
}

function applyGrain() {
  var amount = Math.round(+prompt('Grain strength (1 to 50; 8–20 reads as film):', '12'));
  if (isNaN(amount) || amount < 1 || amount > 50) return;
  grainCore(state.layers[state.activeLayer], amount);
  renderAll();
  pushHistory('Grain ' + amount);
}

function colorBalanceDialog() {
  closeMenus();
  document.getElementById('modal-title').textContent = 'Color Balance';
  document.getElementById('modal-ok').textContent    = 'Apply';
  document.getElementById('modal-body').innerHTML = [
    '<div class="modal-field"><label>Shadows</label><input type="color" id="cb-shadows" value="#1f5f6b"></div>',
    '<div class="modal-field"><label>Highlights</label><input type="color" id="cb-highlights" value="#f2a65a"></div>',
    '<div class="modal-field"><label>Strength</label><input type="number" id="cb-strength" value="30" min="0" max="100"></div>'
  ].join('');
  modalCallback = function() {
    var strength = Math.max(0, Math.min(100, +document.getElementById('cb-strength').value || 0));
    colorBalanceCore(state.layers[state.activeLayer],
      document.getElementById('cb-shadows').value, document.getElementById('cb-highlights').value, strength);
    renderAll();
    pushHistory('Color Balance');
  };
  document.getElementById('modal-overlay').classList.add('open');
}

function gradientLayerDialog() {
  closeMenus();
  document.getElementById('modal-title').textContent = 'New Gradient Layer';
  document.getElementById('modal-ok').textContent    = 'Add';
  document.getElementById('modal-body').innerHTML = [
    '<div class="modal-field"><label>Name</label><input type="text" id="gr-name" value="Gradient"></div>',
    '<div class="modal-field"><label>Type</label><select id="gr-type"><option value="radial">Radial</option><option value="linear">Linear</option></select></div>',
    '<div class="modal-field"><label>Start color</label><input type="color" id="gr-c0" value="#000000"></div>',
    '<div class="modal-field"><label>Start opacity</label><input type="number" id="gr-o0" value="0" min="0" max="100"></div>',
    '<div class="modal-field"><label>End color</label><input type="color" id="gr-c1" value="#000000"></div>',
    '<div class="modal-field"><label>End opacity</label><input type="number" id="gr-o1" value="70" min="0" max="100"></div>',
    '<div class="modal-field"><label>Angle</label><input type="number" id="gr-angle" value="90" min="0" max="360"></div>',
    '<div class="modal-field"><label>Inner radius</label><input type="number" id="gr-inner" value="40" min="0" max="100"></div>'
  ].join('');
  modalCallback = function() {
    var num = function(id, lo, hi) { return Math.max(lo, Math.min(hi, +document.getElementById(id).value || 0)); };
    var layer = createLayer(document.getElementById('gr-name').value || 'Gradient', state.docW, state.docH);
    gradientFillCore(layer, {
      type: document.getElementById('gr-type').value,
      colorStart: document.getElementById('gr-c0').value, opacityStart: num('gr-o0', 0, 100),
      colorEnd:   document.getElementById('gr-c1').value, opacityEnd:   num('gr-o1', 0, 100),
      angle: num('gr-angle', 0, 360), innerRadius: num('gr-inner', 0, 100)
    });
    state.layers.unshift(layer);
    state.activeLayer = 0;
    renderAll();
    updateLayersPanel();
    pushHistory('Gradient Layer');
  };
  document.getElementById('modal-overlay').classList.add('open');
}

// ── Edit operations ───────────────────────────────────────
function fillSelection() {
  pushHistory('Fill');
  var layer = state.layers[state.activeLayer];
  var lctx  = layer.canvas.getContext('2d');
  lctx.fillStyle = state.fgColor;
  if (state.selection) {
    lctx.fillRect(state.selection.x, state.selection.y, state.selection.w, state.selection.h);
  } else {
    lctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
  }
  renderAll();
}

function clearLayer() {
  pushHistory('Clear');
  var layer = state.layers[state.activeLayer];
  layer.canvas.getContext('2d').clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  renderAll();
}

// ── File operations ───────────────────────────────────────
function openFile() {
  document.getElementById('file-input').click();
}

function loadImageFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  var img = new Image();
  img.onload = function() {
    initDocument(img.width, img.height, '#ffffff');
    var layer = createLayer(file.name.split('.')[0], img.width, img.height);
    layer.canvas.getContext('2d').drawImage(img, 0, 0);
    state.layers.unshift(layer);
    state.activeLayer = 0;
    renderAll();
    updateLayersPanel();
    pushHistory('Open Image');
  };
  img.src = URL.createObjectURL(file);
  document.getElementById('tab-0').textContent = file.name;
}

// ── Drag & drop an image onto the canvas as a new layer ───
// Centered, scaled down to fit if larger than the document.
function addImageAsLayer(file) {
  var img = new Image();
  img.onload = function() {
    var scale = Math.min(1, state.docW / img.width, state.docH / img.height);
    var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    var layer = createLayer(file.name.replace(/\.[^.]+$/, '') || 'Dropped image', state.docW, state.docH);
    layer.canvas.getContext('2d').drawImage(img,
      Math.round((state.docW - w) / 2), Math.round((state.docH - h) / 2), w, h);
    state.layers.unshift(layer);
    state.activeLayer = 0;
    renderAll();
    updateLayersPanel();
    pushHistory('Drop Image');
    URL.revokeObjectURL(img.src);
  };
  img.onerror = function() { URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(file);
}

(function initDropZone() {
  var area = document.getElementById('canvas-area');
  var depth = 0; // dragenter/leave fire for children too
  var hasFiles = function(e) {
    return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') >= 0;
  };
  area.addEventListener('dragenter', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    area.classList.add('drop-active');
  });
  area.addEventListener('dragover', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  area.addEventListener('dragleave', function(e) {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) area.classList.remove('drop-active');
  });
  area.addEventListener('drop', function(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    area.classList.remove('drop-active');
    Array.prototype.forEach.call(e.dataTransfer.files, function(f) {
      if (f.type.indexOf('image/') === 0) addImageAsLayer(f);
    });
  });
  // A file dropped beside the canvas would otherwise navigate away from the editor
  window.addEventListener('dragover', function(e) { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', function(e) { if (hasFiles(e)) e.preventDefault(); });
})();

function saveAsPNG() {
  var tmp = document.createElement('canvas');
  tmp.width = state.docW; tmp.height = state.docH;
  var tc = tmp.getContext('2d');
  for (var i = state.layers.length - 1; i >= 0; i--) {
    var l = state.layers[i];
    if (!l.visible) continue;
    tc.globalAlpha = l.opacity;
    tc.globalCompositeOperation = l.blendMode;
    tc.drawImage(l.canvas, 0, 0);
  }
  var a = document.createElement('a');
  a.download = 'pixelforge-export.png';
  a.href = tmp.toDataURL('image/png');
  a.click();
}

function saveAsJPEG() {
  var tmp = document.createElement('canvas');
  tmp.width = state.docW; tmp.height = state.docH;
  var tc = tmp.getContext('2d');
  tc.fillStyle = '#ffffff';
  tc.fillRect(0, 0, state.docW, state.docH);
  for (var i = state.layers.length - 1; i >= 0; i--) {
    var l = state.layers[i];
    if (!l.visible) continue;
    tc.globalAlpha = l.opacity;
    tc.globalCompositeOperation = l.blendMode;
    tc.drawImage(l.canvas, 0, 0);
  }
  var a = document.createElement('a');
  a.download = 'pixelforge-export.jpg';
  a.href = tmp.toDataURL('image/jpeg', 0.95);
  a.click();
}

// ── Save / Open Project (.pfg) ───────────────────────────
function saveProject() {
  closeMenus();
  var project = {
    version: 1,
    docW: state.docW,
    docH: state.docH,
    fgColor: state.fgColor,
    bgColor: state.bgColor,
    activeLayer: state.activeLayer,
    title: (docTabs[activeTab] && docTabs[activeTab].title) || 'Untitled-1',
    layers: state.layers.map(function(l) {
      return {
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        blendMode: l.blendMode,
        text: l.text || null,
        data: l.canvas.toDataURL('image/png')
      };
    })
  };
  var json = JSON.stringify(project);
  var blob = new Blob([json], { type: 'application/json' });
  var a = document.createElement('a');
  a.download = (project.title || 'project') + '.pfg';
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

function openProject() {
  closeMenus();
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pfg';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var project = JSON.parse(ev.target.result);
        loadProject(project, file.name);
      } catch (err) {
        alert('Could not read project file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function loadProject(project, filename) {
  var w = project.docW || 1280;
  var h = project.docH || 720;

  // Reset document
  state.docW = w; state.docH = h;
  mainCanvas.width = w;   mainCanvas.height = h;
  overlayCanvas.width = w; overlayCanvas.height = h;
  cursorCanvas.width = w;  cursorCanvas.height = h;
  state.fgColor = project.fgColor || '#000000';
  state.bgColor = project.bgColor || '#ffffff';
  state.layers = [];
  state.history = [];
  state.historyIndex = -1;
  state.selection = null;

  // Load layers from base64 data
  var loaded = 0;
  var total = project.layers.length;

  project.layers.forEach(function(ld, i) {
    var img = new Image();
    img.onload = function() {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0);
      state.layers[i] = {
        canvas: c,
        name: ld.name,
        visible: ld.visible !== false,
        opacity: ld.opacity != null ? ld.opacity : 1.0,
        blendMode: ld.blendMode || 'source-over',
        text: ld.text || null
      };
      loaded++;
      if (loaded === total) finishLoad();
    };
    img.src = ld.data;
  });

  function finishLoad() {
    state.activeLayer = Math.min(project.activeLayer || 0, state.layers.length - 1);
    var title = project.title || filename.replace('.pfg', '');

    // Update current tab
    if (docTabs[activeTab]) docTabs[activeTab].title = title;
    document.getElementById('status-doc').textContent = title;
    document.getElementById('status-size').textContent = w + ' \u00D7 ' + h + ' px';
    document.getElementById('fg-color-swatch').style.backgroundColor = state.fgColor;
    document.getElementById('bg-color-swatch').style.backgroundColor = state.bgColor;
    updateColorUI();

    fitToView();
    renderAll();
    updateLayersPanel();
    pushHistory('Open Project');
    updateInfoPanel();
    saveCurrentTab();
    renderTabs();
  }
}

// ── Modal / New Document / Resize ────────────────────────
var modalCallback = null;

function newDocument() {
  closeMenus();
  document.getElementById('modal-title').textContent  = 'New Document';
  document.getElementById('modal-ok').textContent     = 'Create';
  document.getElementById('modal-body').innerHTML = [
    '<div class="modal-field"><label>Name</label><input type="text" id="new-name" value="Untitled-1"></div>',
    '<div class="modal-field"><label>Width</label><input type="number" id="new-w" value="1280" min="1"></div>',
    '<div class="modal-field"><label>Height</label><input type="number" id="new-h" value="720" min="1"></div>',
    '<div class="modal-field"><label>Background</label>',
    '<select id="new-bg">',
    '<option value="#ffffff">White</option>',
    '<option value="transparent">Transparent</option>',
    '<option value="#000000">Black</option>',
    '</select></div>'
  ].join('');
  modalCallback = function() {
    var w  = +document.getElementById('new-w').value || 1280;
    var h  = +document.getElementById('new-h').value || 720;
    var bg = document.getElementById('new-bg').value;
    initDocument(w, h, bg);
    var name = document.getElementById('new-name').value || 'Untitled-1';
    document.getElementById('tab-0').textContent   = name;
    document.getElementById('status-doc').textContent = name;
  };
  document.getElementById('modal-overlay').classList.add('open');
}

function resizeCanvas() {
  closeMenus();
  document.getElementById('modal-title').textContent = 'Resize Canvas';
  document.getElementById('modal-ok').textContent    = 'Resize';
  document.getElementById('modal-body').innerHTML = [
    '<div class="modal-field"><label>Width</label><input type="number" id="new-w" value="' + state.docW + '" min="1"></div>',
    '<div class="modal-field"><label>Height</label><input type="number" id="new-h" value="' + state.docH + '" min="1"></div>'
  ].join('');
  modalCallback = function() {
    var w = +document.getElementById('new-w').value || state.docW;
    var h = +document.getElementById('new-h').value || state.docH;
    state.layers.forEach(function(layer) {
      var tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      tmp.getContext('2d').drawImage(layer.canvas, 0, 0);
      layer.canvas.width = w; layer.canvas.height = h;
      layer.canvas.getContext('2d').drawImage(tmp, 0, 0);
    });
    initCanvasSize(w, h);
    renderAll();
    pushHistory('Resize Canvas');
  };
  document.getElementById('modal-overlay').classList.add('open');
}

function modalOK() {
  if (modalCallback) modalCallback();
  closeModal();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  modalCallback = null;
}

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  var key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && key === 'z') { e.shiftKey ? redo() : undo(); e.preventDefault(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 's') { e.preventDefault(); saveProject(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 'n') { e.preventDefault(); newDocument(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 'o') { e.preventDefault(); openFile(); return; }
  var toolKeys = { b:'brush', e:'eraser', g:'fill', m:'select-rect', v:'move', t:'text', i:'eyedropper', c:'crop', z:'zoom', h:'hand' };
  if (toolKeys[key] && !e.metaKey && !e.ctrlKey) setTool(toolKeys[key]);
  if (key === '[') updateBrushSize(Math.max(1,   state.brushSize - 5));
  if (key === ']') updateBrushSize(Math.min(200, state.brushSize + 5));
  if (key === 'x') swapColors();
  if (key === 'delete' || key === 'backspace') clearLayer();
});

// ── Resizable right panels ────────────────────────────────
// The handle on the sidebar's left edge widens all panels together.
// Width lives in the --panel-w CSS variable and is remembered per browser.
var PANELS_MIN_W = 220, PANELS_MAX_W = 400, PANELS_W_KEY = 'pf-panels-w';

function setPanelsWidth(w, save) {
  w = Math.round(Math.max(PANELS_MIN_W, Math.min(PANELS_MAX_W, w)));
  document.documentElement.style.setProperty('--panel-w', w + 'px');
  var h = document.getElementById('panels-resize');
  h.setAttribute('aria-valuenow', w);
  if (save) { try { localStorage.setItem(PANELS_W_KEY, String(w)); } catch (e) {} }
  return w;
}

function initPanelsResize() {
  var handle = document.getElementById('panels-resize');
  handle.setAttribute('aria-valuemin', PANELS_MIN_W);
  handle.setAttribute('aria-valuemax', PANELS_MAX_W);
  handle.title = 'Drag to widen the panels (double-click to reset)';
  var saved = null;
  try { saved = +localStorage.getItem(PANELS_W_KEY); } catch (e) {}
  setPanelsWidth(saved || PANELS_MIN_W, false);

  var current = function() { return document.getElementById('panels').getBoundingClientRect().width; };
  handle.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    var startX = e.clientX, startW = current();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-panels');
    var move = function(ev) { setPanelsWidth(startW + (startX - ev.clientX), false); };
    var up = function() {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-panels');
      setPanelsWidth(current(), true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft')  { setPanelsWidth(current() + 10, true); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setPanelsWidth(current() - 10, true); e.preventDefault(); }
  });
  handle.addEventListener('dblclick', function() { setPanelsWidth(PANELS_MIN_W, true); });
}
