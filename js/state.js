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
