// ═══════════════════════════════════════════════════════════
//  TOOLS
//  Drawing tools: brush, eraser, fill, selection, move,
//  eyedropper, text, crop, zoom, hand.
// ═══════════════════════════════════════════════════════════

// ── Tool selection ───────────────────────────────────────
function setTool(tool) {
  state.currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
  document.getElementById('tool-name').textContent = toolLabel(tool);
  updateOptionsBar(tool);
  cursorCanvas.style.cursor = toolCursor(tool);
}

function toolLabel(t) {
  var labels = {
    brush: 'Brush', eraser: 'Eraser', fill: 'Fill',
    'select-rect': 'Rect Select', 'select-ellipse': 'Ellipse Select',
    lasso: 'Lasso', move: 'Move', text: 'Type',
    eyedropper: 'Eyedropper', crop: 'Crop', zoom: 'Zoom', hand: 'Hand'
  };
  return labels[t] || t;
}

function toolCursor(t) {
  var map = {
    move: 'move', hand: 'grab', zoom: 'zoom-in', eyedropper: 'crosshair',
    crop: 'crosshair', 'select-rect': 'crosshair', 'select-ellipse': 'crosshair', lasso: 'crosshair'
  };
  return map[t] || 'crosshair';
}

function updateOptionsBar(tool) {
  var hardnessLabel  = document.getElementById('hardness-label');
  var hardnessSlider = document.getElementById('brush-hardness');
  var showBrush = (tool === 'brush' || tool === 'eraser');
  hardnessLabel.style.display  = showBrush ? '' : 'none';
  hardnessSlider.style.display = showBrush ? '' : 'none';
}

// ── Canvas event handlers ────────────────────────────────
function canvasMouseDown(e) {
  var pos = getCanvasPos(e);
  closeMenus();

  if (e.button === 1 || state.currentTool === 'hand') {
    state.panning = true;
    state.panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
    return;
  }

  var tool = state.currentTool;
  if (tool === 'brush' || tool === 'eraser') {
    state.painting = true;
    state.lastX = pos.x; state.lastY = pos.y;
    pushHistory(tool === 'brush' ? 'Brush' : 'Eraser');
    paintAt(pos.x, pos.y, pos.x, pos.y);
    renderAll();
  } else if (tool === 'fill') {
    pushHistory('Fill');
    floodFill(pos.x, pos.y, hexToRgba(state.fgColor));
    renderAll();
  } else if (tool === 'eyedropper') {
    pickColor(pos.x, pos.y);
  } else if (tool === 'select-rect' || tool === 'select-ellipse') {
    state.selecting = true;
    state.selStart = pos;
    state.selection = { x: pos.x, y: pos.y, w: 0, h: 0, type: tool };
  } else if (tool === 'lasso') {
    state.selecting = true;
    state.lassoPoints = [pos];
  } else if (tool === 'move') {
    state.moving = true;
    state.moveStart = pos;
    var layer = state.layers[state.activeLayer];
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = layer.canvas.width;
    tmpCanvas.height = layer.canvas.height;
    tmpCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);
    state.moveLayerCopy = tmpCanvas;
    pushHistory('Move');
  } else if (tool === 'zoom') {
    if (e.shiftKey) {
      state.zoom = Math.max(0.05, state.zoom / 1.5);
    } else {
      state.zoom = Math.min(32, state.zoom * 1.5);
    }
    applyTransform();
  } else if (tool === 'text') {
    var text = prompt('Enter text:');
    if (text) {
      pushHistory('Text');
      var layer = state.layers[state.activeLayer];
      var lctx = layer.canvas.getContext('2d');
      lctx.fillStyle = state.fgColor;
      lctx.font = (state.brushSize * 1.5) + 'px sans-serif';
      lctx.fillText(text, pos.x, pos.y);
      renderAll();
    }
  } else if (tool === 'crop') {
    state.cropStart = pos;
    state.cropRect = null;
    state.selecting = true;
  }
}

function canvasMouseMove(e) {
  var pos = getCanvasPos(e);
  updateInfoXY(pos.x, pos.y);
  document.getElementById('status-pos').textContent = pos.x + ', ' + pos.y;
  drawCursor(pos.x, pos.y);

  if (state.panning) {
    var dx = e.clientX - state.panStart.x;
    var dy = e.clientY - state.panStart.y;
    var area = document.getElementById('canvas-area');
    area.scrollLeft = state.panStart.panX - dx;
    area.scrollTop  = state.panStart.panY - dy;
    return;
  }

  if (state.painting) {
    paintAt(state.lastX, state.lastY, pos.x, pos.y);
    state.lastX = pos.x; state.lastY = pos.y;
    renderAll();
  } else if (state.selecting && (state.currentTool === 'select-rect' || state.currentTool === 'select-ellipse')) {
    var x = Math.min(pos.x, state.selStart.x);
    var y = Math.min(pos.y, state.selStart.y);
    var w = Math.abs(pos.x - state.selStart.x);
    var h = Math.abs(pos.y - state.selStart.y);
    state.selection = { x: x, y: y, w: w, h: h, type: state.currentTool };
    drawSelectionOverlay();
  } else if (state.selecting && state.currentTool === 'lasso') {
    state.lassoPoints.push(pos);
    drawLassoOverlay();
  } else if (state.moving && state.moveStart) {
    var dx = pos.x - state.moveStart.x;
    var dy = pos.y - state.moveStart.y;
    var layer = state.layers[state.activeLayer];
    var lctx = layer.canvas.getContext('2d');
    lctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    lctx.drawImage(state.moveLayerCopy, dx, dy);
    renderAll();
  } else if (state.selecting && state.currentTool === 'crop') {
    var x = Math.min(pos.x, state.cropStart.x);
    var y = Math.min(pos.y, state.cropStart.y);
    var w = Math.abs(pos.x - state.cropStart.x);
    var h = Math.abs(pos.y - state.cropStart.y);
    state.cropRect = { x: x, y: y, w: w, h: h };
    drawCropOverlay();
  }
}

function canvasMouseUp() {
  if (state.panning) { state.panning = false; return; }
  if (state.painting) {
    state.painting = false;
    updateLayerThumbs();
  }
  if (state.selecting) {
    state.selecting = false;
    if (state.currentTool === 'lasso' && state.lassoPoints.length > 2) {
      // finalize lasso selection
    }
    if (state.currentTool === 'crop' && state.cropRect && state.cropRect.w > 10 && state.cropRect.h > 10) {
      applyCrop(state.cropRect);
    }
  }
  if (state.moving) {
    state.moving = false;
    state.moveLayerCopy = null;
  }
}

function canvasWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.05, Math.min(32, state.zoom * delta));
    applyTransform();
  }
}

// ── Painting ─────────────────────────────────────────────
function paintAt(x0, y0, x1, y1) {
  var layer = state.layers[state.activeLayer];
  if (!layer) return;
  var lctx = layer.canvas.getContext('2d');

  if (state.currentTool === 'eraser') {
    lctx.globalCompositeOperation = 'destination-out';
    lctx.globalAlpha = state.brushOpacity;
  } else {
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = state.brushOpacity;
  }

  var size     = state.brushSize;
  var hardness = state.brushHardness;
  var steps    = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));

  for (var i = 0; i <= steps; i++) {
    var t = steps === 0 ? 0 : i / steps;
    var x = x0 + (x1 - x0) * t;
    var y = y0 + (y1 - y0) * t;

    var grad = lctx.createRadialGradient(x, y, size * hardness / 2, x, y, size / 2);
    if (state.currentTool === 'eraser') {
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      var rgb = hexToRgb(state.fgColor);
      grad.addColorStop(0, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',1)');
      grad.addColorStop(1, 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0)');
    }

    lctx.beginPath();
    lctx.fillStyle = grad;
    lctx.arc(x, y, size / 2, 0, Math.PI * 2);
    lctx.fill();
  }

  lctx.globalAlpha = 1;
  lctx.globalCompositeOperation = 'source-over';
}

// ── Flood fill ────────────────────────────────────────────
function floodFill(startX, startY, fillColor) {
  var layer = state.layers[state.activeLayer];
  if (!layer) return;
  var lctx = layer.canvas.getContext('2d');
  var imgData = lctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
  var data = imgData.data;
  var W = layer.canvas.width, H = layer.canvas.height;

  var idx = function(x, y) { return (y * W + x) * 4; };

  var tx = Math.max(0, Math.min(W - 1, startX));
  var ty = Math.max(0, Math.min(H - 1, startY));
  var si = idx(tx, ty);
  var targetR = data[si], targetG = data[si+1], targetB = data[si+2], targetA = data[si+3];

  if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b && targetA === fillColor.a) return;

  var tolerance = 30;
  var matches = function(i) {
    return Math.abs(data[i]   - targetR) <= tolerance &&
           Math.abs(data[i+1] - targetG) <= tolerance &&
           Math.abs(data[i+2] - targetB) <= tolerance &&
           Math.abs(data[i+3] - targetA) <= tolerance;
  };

  var stack = [[tx, ty]];
  var visited = new Uint8Array(W * H);
  visited[ty * W + tx] = 1;

  while (stack.length) {
    var pt = stack.pop();
    var px = pt[0], py = pt[1];
    var i = idx(px, py);
    data[i] = fillColor.r; data[i+1] = fillColor.g; data[i+2] = fillColor.b; data[i+3] = fillColor.a;

    [[px-1,py],[px+1,py],[px,py-1],[px,py+1]].forEach(function(np) {
      var nx = np[0], ny = np[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      var ni = ny * W + nx;
      if (!visited[ni] && matches(idx(nx, ny))) {
        visited[ni] = 1;
        stack.push([nx, ny]);
      }
    });
  }
  lctx.putImageData(imgData, 0, 0);
}

// ── Selection overlays ────────────────────────────────────
function drawSelectionOverlay() {
  if (!state.selection) return;
  var sel = document.getElementById('selection-overlay');
  var s = state.selection;
  var z = state.zoom;
  sel.style.display = 'block';
  sel.style.left   = (s.x * z) + 'px';
  sel.style.top    = (s.y * z) + 'px';
  sel.style.width  = (s.w * z) + 'px';
  sel.style.height = (s.h * z) + 'px';
  sel.style.borderRadius = (s.type === 'select-ellipse') ? '50%' : '0';
}

function drawLassoOverlay() {
  octx.clearRect(0, 0, state.docW, state.docH);
  if (state.lassoPoints.length < 2) return;
  octx.beginPath();
  octx.strokeStyle = 'white';
  octx.lineWidth = 1;
  octx.setLineDash([4, 4]);
  octx.moveTo(state.lassoPoints[0].x, state.lassoPoints[0].y);
  state.lassoPoints.forEach(function(p) { octx.lineTo(p.x, p.y); });
  octx.stroke();
  octx.setLineDash([]);
}

function drawCropOverlay() {
  if (!state.cropRect) return;
  octx.clearRect(0, 0, state.docW, state.docH);
  octx.fillStyle = 'rgba(0,0,0,0.4)';
  octx.fillRect(0, 0, state.docW, state.docH);
  octx.clearRect(state.cropRect.x, state.cropRect.y, state.cropRect.w, state.cropRect.h);
  octx.strokeStyle = 'white';
  octx.lineWidth = 1;
  octx.strokeRect(state.cropRect.x, state.cropRect.y, state.cropRect.w, state.cropRect.h);
}

function applyCrop(r) {
  var newW = Math.floor(r.w), newH = Math.floor(r.h);
  state.layers.forEach(function(layer) {
    var tmp = document.createElement('canvas');
    tmp.width = newW; tmp.height = newH;
    var tc = tmp.getContext('2d');
    tc.drawImage(layer.canvas, -r.x, -r.y);
    layer.canvas.width = newW; layer.canvas.height = newH;
    layer.canvas.getContext('2d').drawImage(tmp, 0, 0);
  });
  initCanvasSize(newW, newH);
  octx.clearRect(0, 0, state.docW, state.docH);
  state.cropRect = null;
  renderAll();
  pushHistory('Crop');
}

// ── Cursor preview ────────────────────────────────────────
function drawCursor(x, y) {
  ccctx.clearRect(0, 0, state.docW, state.docH);
  var tool = state.currentTool;
  if (tool === 'brush' || tool === 'eraser') {
    var r = state.brushSize / 2;
    ccctx.beginPath();
    ccctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ccctx.lineWidth = 1;
    ccctx.arc(x, y, r, 0, Math.PI * 2);
    ccctx.stroke();
    ccctx.beginPath();
    ccctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ccctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ccctx.stroke();
  }
}

// ── Eyedropper ────────────────────────────────────────────
function pickColor(x, y) {
  var imgData = ctx.getImageData(x, y, 1, 1).data;
  var hex = '#' + [imgData[0], imgData[1], imgData[2]].map(function(v) {
    return v.toString(16).padStart(2, '0');
  }).join('');
  state.fgColor = hex;
  updateColorUI();
}
