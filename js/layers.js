// ═══════════════════════════════════════════════════════════
//  LAYERS
//  Layer management: add, delete, duplicate, merge, flatten,
//  opacity, blend mode, panel rendering.
// ═══════════════════════════════════════════════════════════

function addLayer() {
  var layer = createLayer('Layer ' + (state.layers.length + 1), state.docW, state.docH);
  state.layers.unshift(layer);
  state.activeLayer = 0;
  renderAll();
  updateLayersPanel();
  pushHistory('New Layer');
}

function duplicateLayer() {
  var src = state.layers[state.activeLayer];
  var dup = createLayer(src.name + ' copy', state.docW, state.docH);
  dup.canvas.getContext('2d').drawImage(src.canvas, 0, 0);
  dup.opacity = src.opacity;
  dup.blendMode = src.blendMode;
  state.layers.splice(state.activeLayer, 0, dup);
  renderAll();
  updateLayersPanel();
  pushHistory('Duplicate Layer');
}

function deleteLayer() {
  if (state.layers.length <= 1) return;
  state.layers.splice(state.activeLayer, 1);
  state.activeLayer = Math.min(state.activeLayer, state.layers.length - 1);
  renderAll();
  updateLayersPanel();
  pushHistory('Delete Layer');
}

function mergeDown() {
  if (state.activeLayer >= state.layers.length - 1) return;
  var top    = state.layers[state.activeLayer];
  var bottom = state.layers[state.activeLayer + 1];
  var bctx = bottom.canvas.getContext('2d');
  bctx.globalAlpha = top.opacity;
  bctx.globalCompositeOperation = top.blendMode;
  bctx.drawImage(top.canvas, 0, 0);
  bctx.globalAlpha = 1;
  bctx.globalCompositeOperation = 'source-over';
  state.layers.splice(state.activeLayer, 1);
  state.activeLayer = Math.min(state.activeLayer, state.layers.length - 1);
  renderAll();
  updateLayersPanel();
  pushHistory('Merge Down');
}

function flattenImage() {
  var flat = createLayer('Background', state.docW, state.docH);
  var fctx = flat.canvas.getContext('2d');
  fctx.fillStyle = state.bgColor;
  fctx.fillRect(0, 0, state.docW, state.docH);
  for (var i = state.layers.length - 1; i >= 0; i--) {
    var l = state.layers[i];
    if (!l.visible) continue;
    fctx.globalAlpha = l.opacity;
    fctx.globalCompositeOperation = l.blendMode;
    fctx.drawImage(l.canvas, 0, 0);
  }
  fctx.globalAlpha = 1;
  fctx.globalCompositeOperation = 'source-over';
  state.layers = [flat];
  state.activeLayer = 0;
  renderAll();
  updateLayersPanel();
  pushHistory('Flatten Image');
}

function setBlendMode(mode) {
  state.layers[state.activeLayer].blendMode = mode;
  renderAll();
}

function setLayerOpacity(val) {
  state.layers[state.activeLayer].opacity = Math.max(0, Math.min(100, +val)) / 100;
  renderAll();
}

// ── Panel rendering ───────────────────────────────────────
function updateLayersPanel() {
  var list = document.getElementById('layers-list');
  list.innerHTML = '';
  state.layers.forEach(function(layer, i) {
    var row = document.createElement('div');
    row.className = 'layer-row' + (i === state.activeLayer ? ' active' : '');
    row.onclick = function() { state.activeLayer = i; updateLayersPanel(); updateLayerProps(); };

    var vis = document.createElement('div');
    vis.className = 'layer-vis ' + (layer.visible ? 'visible' : '');
    vis.textContent = layer.visible ? '\uD83D\uDC41' : '\uD83D\uDEAB';
    vis.onclick = function(e) {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderAll();
      updateLayersPanel();
    };

    var thumb = document.createElement('canvas');
    thumb.className = 'layer-thumb';
    thumb.width = 28; thumb.height = 20;
    thumb.getContext('2d').drawImage(layer.canvas, 0, 0, 28, 20);

    var name = document.createElement('div');
    name.className = 'layer-name';
    name.textContent = layer.name;
    name.ondblclick = function(e) {
      e.stopPropagation();
      var newName = prompt('Layer name:', layer.name);
      if (newName) { layer.name = newName; updateLayersPanel(); }
    };

    row.appendChild(vis);
    row.appendChild(thumb);
    row.appendChild(name);
    list.appendChild(row);
  });
  document.getElementById('info-layers').textContent = state.layers.length;
  updateLayerProps();
}

function updateLayerProps() {
  var layer = state.layers[state.activeLayer];
  if (!layer) return;
  document.getElementById('blend-mode').value  = layer.blendMode;
  document.getElementById('layer-opacity').value = Math.round(layer.opacity * 100);
}

function updateLayerThumbs() {
  document.querySelectorAll('.layer-thumb').forEach(function(thumb, i) {
    thumb.getContext('2d').clearRect(0, 0, 28, 20);
    if (state.layers[i]) {
      thumb.getContext('2d').drawImage(state.layers[i].canvas, 0, 0, 28, 20);
    }
  });
}
