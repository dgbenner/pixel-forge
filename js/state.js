// ═══════════════════════════════════════════════════════════
//  STATE
//  Central application state object shared by all modules.
// ═══════════════════════════════════════════════════════════
const state = {
  // Document dimensions
  docW: 1280, docH: 720,

  // Viewport
  zoom: 1, panX: 0, panY: 0,

  // Active tool & brush settings
  currentTool: 'brush',
  brushSize: 20, brushOpacity: 1.0, brushHardness: 0.8,

  // Colors
  fgColor: '#000000', bgColor: '#ffffff',

  // Layers
  layers: [], activeLayer: 0,

  // History (undo/redo)
  history: [], historyIndex: -1,

  // Painting state
  painting: false, lastX: 0, lastY: 0,

  // Selection state
  selection: null, selecting: false, selStart: null,
  lassoPoints: [],

  // Move tool state
  moving: false, moveStart: null, moveLayerCopy: null,

  // Pan state
  panning: false, panStart: null,

  // Crop tool state
  cropStart: null, cropRect: null,
};

// ═══════════════════════════════════════════════════════════
//  DOCUMENT TABS
//  Multi-document support — max 3 tabs.
// ═══════════════════════════════════════════════════════════
const MAX_TABS = 3;
let docTabs = [];   // Array of saved document states
let activeTab = 0;  // Index of active tab
let tabCounter = 1; // For naming Untitled-2, Untitled-3, etc.

function snapshotLayers(layers) {
  return layers.map(function(l) {
    var c = document.createElement('canvas');
    c.width = l.canvas.width; c.height = l.canvas.height;
    c.getContext('2d').drawImage(l.canvas, 0, 0);
    return { canvas: c, name: l.name, visible: l.visible, opacity: l.opacity, blendMode: l.blendMode };
  });
}

function snapshotHistory(history) {
  return history.map(function(h) {
    return {
      name: h.name,
      activeLayer: h.activeLayer,
      layers: h.layers.map(function(l) {
        var c = document.createElement('canvas');
        c.width = l.canvas.width; c.height = l.canvas.height;
        c.getContext('2d').drawImage(l.canvas, 0, 0);
        return { canvas: c, name: l.name, visible: l.visible, opacity: l.opacity, blendMode: l.blendMode };
      })
    };
  });
}

function saveCurrentTab() {
  docTabs[activeTab] = {
    title: docTabs[activeTab] ? docTabs[activeTab].title : 'Untitled-1',
    docW: state.docW, docH: state.docH,
    zoom: state.zoom, panX: state.panX, panY: state.panY,
    fgColor: state.fgColor, bgColor: state.bgColor,
    layers: snapshotLayers(state.layers),
    activeLayer: state.activeLayer,
    history: snapshotHistory(state.history),
    historyIndex: state.historyIndex,
    selection: state.selection
  };
}

function restoreTab(idx) {
  var doc = docTabs[idx];
  state.docW = doc.docW; state.docH = doc.docH;
  state.zoom = doc.zoom; state.panX = doc.panX; state.panY = doc.panY;
  state.fgColor = doc.fgColor; state.bgColor = doc.bgColor;
  state.layers = snapshotLayers(doc.layers);
  state.activeLayer = doc.activeLayer;
  state.history = snapshotHistory(doc.history);
  state.historyIndex = doc.historyIndex;
  state.selection = doc.selection;

  // Reset interaction state
  state.painting = false;
  state.selecting = false;
  state.moving = false;
  state.panning = false;
  state.cropStart = null;
  state.cropRect = null;

  // Resize canvases
  var mainCanvas = document.getElementById('main-canvas');
  var overlayCanvas = document.getElementById('overlay-canvas');
  var cursorCanvas = document.getElementById('cursor-canvas');
  mainCanvas.width = state.docW; mainCanvas.height = state.docH;
  overlayCanvas.width = state.docW; overlayCanvas.height = state.docH;
  cursorCanvas.width = state.docW; cursorCanvas.height = state.docH;

  // Update UI
  renderAll();
  updateLayersPanel();
  updateHistoryPanel();
  updateInfoPanel();
  document.getElementById('status-size').textContent = state.docW + ' \u00D7 ' + state.docH + ' px';
  document.getElementById('status-doc').textContent = doc.title;
  document.getElementById('fg-color-swatch').style.backgroundColor = state.fgColor;
  document.getElementById('bg-color-swatch').style.backgroundColor = state.bgColor;
  fitToView();
}

function renderTabs() {
  var bar = document.getElementById('tabsbar');
  bar.innerHTML = '';
  docTabs.forEach(function(doc, i) {
    var tab = document.createElement('div');
    tab.className = 'canvas-tab' + (i === activeTab ? ' active' : '');
    tab.setAttribute('data-tab', i);
    tab.textContent = doc.title;
    tab.style.paddingRight = docTabs.length > 1 ? '24px' : '14px';
    tab.onclick = function() { switchTab(i); };
    tab.ondblclick = function(e) { e.stopPropagation(); renameTab(i); };

    if (docTabs.length > 1) {
      var close = document.createElement('span');
      close.className = 'tab-close';
      close.innerHTML = '&times;';
      close.onclick = function(e) { e.stopPropagation(); closeTab(i); };
      tab.appendChild(close);
    }

    bar.appendChild(tab);
  });

  // Add "+" button if under max
  if (docTabs.length < MAX_TABS) {
    var addBtn = document.createElement('div');
    addBtn.id = 'tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'New document (max ' + MAX_TABS + ')';
    addBtn.onclick = newTab;
    bar.appendChild(addBtn);
  }
}

function switchTab(idx) {
  if (idx === activeTab) return;
  saveCurrentTab();
  activeTab = idx;
  restoreTab(idx);
  renderTabs();
}

function newTab() {
  if (docTabs.length >= MAX_TABS) return;
  saveCurrentTab();
  tabCounter++;
  var title = 'Untitled-' + tabCounter;

  // Push the new tab entry BEFORE setting activeTab so docTabs[activeTab] exists
  docTabs.push({ title: title });
  activeTab = docTabs.length - 1;

  // Initialize a fresh document
  initDocument(1280, 720, '#ffffff');
  document.getElementById('status-doc').textContent = title;

  saveCurrentTab();
  renderTabs();
}

function closeTab(idx) {
  if (docTabs.length <= 1) return; // Can't close last tab
  docTabs.splice(idx, 1);
  if (activeTab >= docTabs.length) activeTab = docTabs.length - 1;
  else if (idx < activeTab) activeTab--;
  restoreTab(activeTab);
  renderTabs();
}

function renameTab(idx) {
  var currentName = docTabs[idx].title;
  document.getElementById('modal-title').textContent = 'Rename Document';
  document.getElementById('modal-ok').textContent = 'OK';
  document.getElementById('modal-body').innerHTML =
    '<div class="modal-field"><label>Name</label><input type="text" id="rename-input" value="' +
    currentName.replace(/"/g, '&quot;') + '"></div>';
  modalCallback = function() {
    var newName = document.getElementById('rename-input').value.trim();
    if (newName) {
      docTabs[idx].title = newName;
      document.getElementById('status-doc').textContent = newName;
      renderTabs();
    }
  };
  document.getElementById('modal-overlay').classList.add('open');
  // Focus and select the input
  var inp = document.getElementById('rename-input');
  inp.focus();
  inp.select();
}

// Initialize first tab after document is ready
function initTabs() {
  docTabs = [{ title: 'Untitled-1' }];
  activeTab = 0;
  saveCurrentTab();
  renderTabs();
}
