// ═══════════════════════════════════════════════════════════
//  CANVAS SETUP & RENDERING
// ═══════════════════════════════════════════════════════════
const mainCanvas   = document.getElementById('main-canvas');
const overlayCanvas = document.getElementById('overlay-canvas');
const cursorCanvas  = document.getElementById('cursor-canvas');
const ctx   = mainCanvas.getContext('2d');
const octx  = overlayCanvas.getContext('2d');
const ccctx = cursorCanvas.getContext('2d');

// ── Document initialisation ──────────────────────────────
function initDocument(w, h, bgColor) {
  bgColor = bgColor || '#ffffff';
  state.docW = w; state.docH = h;
  mainCanvas.width = w;   mainCanvas.height = h;
  overlayCanvas.width = w; overlayCanvas.height = h;
  cursorCanvas.width = w;  cursorCanvas.height = h;
  state.layers = [];
  state.history = []; state.historyIndex = -1;
  state.selection = null;

  // Background layer
  var bgLayer = createLayer('Background', w, h);
  var bgCtx = bgLayer.canvas.getContext('2d');
  bgCtx.fillStyle = bgColor;
  bgCtx.fillRect(0, 0, w, h);
  state.layers.push(bgLayer);
  state.activeLayer = 0;

  fitToView();
  renderAll();
  updateLayersPanel();
  updateHistoryPanel();
  pushHistory('New Document');
  updateInfoPanel();
  document.getElementById('status-size').textContent = w + ' \u00D7 ' + h + ' px';
  document.getElementById('status-doc').textContent = 'Untitled-1';
}

function createLayer(name, w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { canvas: c, name: name, visible: true, opacity: 1.0, blendMode: 'source-over' };
}

// ── Viewport ─────────────────────────────────────────────
function fitToView() {
  var area = document.getElementById('canvas-area');
  var aw = area.clientWidth - 40, ah = area.clientHeight - 40;
  var zoomW = aw / state.docW, zoomH = ah / state.docH;
  state.zoom = Math.min(zoomW, zoomH, 1);
  applyTransform();
}

function applyTransform() {
  var wrapper = document.getElementById('canvas-wrapper');
  var z = state.zoom;
  wrapper.style.width  = (state.docW * z) + 'px';
  wrapper.style.height = (state.docH * z) + 'px';
  mainCanvas.style.width    = (state.docW * z) + 'px';
  mainCanvas.style.height   = (state.docH * z) + 'px';
  overlayCanvas.style.width  = (state.docW * z) + 'px';
  overlayCanvas.style.height = (state.docH * z) + 'px';
  cursorCanvas.style.width  = (state.docW * z) + 'px';
  cursorCanvas.style.height = (state.docH * z) + 'px';
  document.getElementById('zoom-indicator').textContent = Math.round(state.zoom * 100) + '%';
  document.getElementById('status-zoom').textContent    = Math.round(state.zoom * 100) + '%';
}

function initCanvasSize(w, h) {
  state.docW = w; state.docH = h;
  mainCanvas.width = w;    mainCanvas.height = h;
  overlayCanvas.width = w; overlayCanvas.height = h;
  cursorCanvas.width = w;  cursorCanvas.height = h;
  applyTransform();
  document.getElementById('status-size').textContent = w + ' \u00D7 ' + h + ' px';
}

// ── Compositing / render ─────────────────────────────────
function renderAll() {
  ctx.clearRect(0, 0, state.docW, state.docH);
  drawCheckerboard(ctx, state.docW, state.docH);
  for (var i = state.layers.length - 1; i >= 0; i--) {
    var layer = state.layers[i];
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blendMode;
    ctx.drawImage(layer.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  updateLayerThumbs();
}

function drawCheckerboard(c, w, h) {
  var size = 8;
  for (var y = 0; y < h; y += size) {
    for (var x = 0; x < w; x += size) {
      c.fillStyle = ((x / size + y / size) % 2 === 0) ? '#ccc' : '#fff';
      c.fillRect(x, y, size, size);
    }
  }
}

// ── Canvas position helper ───────────────────────────────
function getCanvasPos(e) {
  var wrapper = document.getElementById('canvas-wrapper');
  var rect = wrapper.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - rect.left) / state.zoom),
    y: Math.floor((e.clientY - rect.top)  / state.zoom)
  };
}
