// ═══════════════════════════════════════════════════════════
//  HISTORY
//  Undo / redo stack with canvas snapshot serialisation.
// ═══════════════════════════════════════════════════════════

function pushHistory(name) {
  // Serialize current layer state as off-screen canvas copies
  var snapshot = state.layers.map(function(layer) {
    var c = document.createElement('canvas');
    c.width  = layer.canvas.width;
    c.height = layer.canvas.height;
    c.getContext('2d').drawImage(layer.canvas, 0, 0);
    return {
      canvas:    c,
      name:      layer.name,
      visible:   layer.visible,
      opacity:   layer.opacity,
      blendMode: layer.blendMode
    };
  });

  // Truncate redo history
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push({ name: name, layers: snapshot, activeLayer: state.activeLayer });
  if (state.history.length > 30) state.history.shift();
  state.historyIndex = state.history.length - 1;
  updateHistoryPanel();
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  restoreHistory(state.historyIndex);
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  restoreHistory(state.historyIndex);
}

function restoreHistory(idx) {
  var snap = state.history[idx];
  state.layers = snap.layers.map(function(sl) {
    var c = document.createElement('canvas');
    c.width  = sl.canvas.width;
    c.height = sl.canvas.height;
    c.getContext('2d').drawImage(sl.canvas, 0, 0);
    return {
      canvas:    c,
      name:      sl.name,
      visible:   sl.visible,
      opacity:   sl.opacity,
      blendMode: sl.blendMode
    };
  });
  state.activeLayer = snap.activeLayer;
  renderAll();
  updateLayersPanel();
  updateHistoryPanel();
}

function updateHistoryPanel() {
  var list = document.getElementById('history-list');
  list.innerHTML = '';
  state.history.forEach(function(item, i) {
    var el = document.createElement('div');
    el.className = 'hist-item' +
      (i === state.historyIndex ? ' current' : '') +
      (i > state.historyIndex  ? ' future'  : '');
    el.textContent = item.name;
    el.onclick = function() { state.historyIndex = i; restoreHistory(i); };
    list.appendChild(el);
  });
  list.scrollTop = list.scrollHeight;
}
