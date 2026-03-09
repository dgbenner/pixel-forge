// ═══════════════════════════════════════════════════════════
//  UI
//  Menu bar, panel toggles, keyboard shortcuts, file I/O,
//  image adjustments, modals, brush controls, info panel.
// ═══════════════════════════════════════════════════════════

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
  document.getElementById('brush-hardness').value = v;
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
function applyGrayscale() {
  pushHistory('Grayscale');
  var layer = state.layers[state.activeLayer];
  var lctx  = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var avg = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    d[i] = d[i+1] = d[i+2] = avg;
  }
  lctx.putImageData(imgData, 0, 0);
  renderAll();
}

function applyInvert() {
  pushHistory('Invert');
  var layer = state.layers[state.activeLayer];
  var lctx  = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i]; d[i+1] = 255 - d[i+1]; d[i+2] = 255 - d[i+2];
  }
  lctx.putImageData(imgData, 0, 0);
  renderAll();
}

function applyBrightness() {
  var val  = +prompt('Brightness (-255 to 255):', '0');
  var cont = +prompt('Contrast (-255 to 255):', '0');
  if (isNaN(val) || isNaN(cont)) return;
  pushHistory('Brightness/Contrast');
  var layer = state.layers[state.activeLayer];
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
  renderAll();
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
  if ((e.metaKey || e.ctrlKey) && key === 's') { e.preventDefault(); saveAsPNG(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 'n') { e.preventDefault(); newDocument(); return; }
  if ((e.metaKey || e.ctrlKey) && key === 'o') { e.preventDefault(); openFile(); return; }
  var toolKeys = { b:'brush', e:'eraser', g:'fill', m:'select-rect', v:'move', t:'text', i:'eyedropper', c:'crop', z:'zoom', h:'hand' };
  if (toolKeys[key] && !e.metaKey && !e.ctrlKey) setTool(toolKeys[key]);
  if (key === '[') updateBrushSize(Math.max(1,   state.brushSize - 5));
  if (key === ']') updateBrushSize(Math.min(200, state.brushSize + 5));
  if (key === 'x') swapColors();
  if (key === 'delete' || key === 'backspace') clearLayer();
});
