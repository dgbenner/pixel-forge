# PixelForge — Image Editor

A browser-based raster image editor built with plain HTML, CSS, and vanilla JavaScript. No build step, no frameworks, no modules — just open `index.html`.

---

## File Structure

```
pixel-forge/
├── index.html          Entry point; wires HTML, CSS, and all JS together
├── css/
│   └── style.css       All application styles (UI chrome, panels, filters)
├── js/
│   ├── state.js        Shared application state object
│   ├── canvas.js       Canvas setup, rendering, compositing, viewport
│   ├── tools.js        All drawing tools and canvas mouse event handlers
│   ├── layers.js       Layer CRUD, blend mode, opacity, panel rendering
│   ├── history.js      Undo/redo stack with full canvas snapshots
│   ├── color.js        Color picker, RGB sliders, hex input, swatches
│   ├── filters.js      Filters panel: blur, sharpen, hue, saturation
│   ├── ui.js           Menus, keyboard shortcuts, file I/O, image adjustments
│   ├── agent-tools.js  Tools the agent can call (definitions + the code that runs them)
│   └── agent.js        Agent loop, Agent panel, run log
└── image-editor.html   Original single-file source (kept for reference)
```

### Script load order

Scripts are loaded via `<script>` tags at the bottom of `index.html` in dependency order:

| Order | File | Depends on |
|-------|------|------------|
| 1 | `state.js` | — |
| 2 | `canvas.js` | state |
| 3 | `tools.js` | state, canvas |
| 4 | `layers.js` | state, canvas, history |
| 5 | `history.js` | state, canvas, layers |
| 6 | `color.js` | state |
| 7 | `filters.js` | state, canvas, history |
| 8 | `ui.js` | everything |
| 9 | `agent-tools.js` | everything above |
| 10 | `agent.js` | agent-tools |

All files use plain global functions and the single shared `state` object — no ES modules, no bundler required.

---

## Module Responsibilities

### `js/state.js`
Declares the single `state` object used by every other module. Contains document dimensions, zoom, active tool, brush settings, layer array, history stack, and all transient interaction flags (painting, selecting, moving, etc.).

### `js/canvas.js`
- Grabs the three canvas elements (`main-canvas`, `overlay-canvas`, `cursor-canvas`) and their 2D contexts, exported as globals (`ctx`, `octx`, `ccctx`).
- `initDocument(w, h, bgColor)` — creates a fresh document with a background layer.
- `createLayer(name, w, h)` — factory for layer objects `{ canvas, name, visible, opacity, blendMode }`.
- `renderAll()` — composites all visible layers onto `main-canvas` with correct blend modes and opacity.
- `applyTransform()` / `fitToView()` — handle zoom and pan by resizing canvas CSS dimensions.
- `getCanvasPos(e)` — converts a mouse event to document-space pixel coordinates.

### `js/tools.js`
- `setTool(tool)` — activates a tool, updates the toolbar highlight, options bar, and cursor.
- `canvasMouseDown/Move/Up/Wheel` — main interaction loop; dispatches to the correct tool behaviour.
- `paintAt(x0, y0, x1, y1)` — soft-edged radial-gradient brush stroke (supports eraser via `destination-out`).
- `floodFill(x, y, color)` — 4-connected scanline flood fill with tolerance.
- `drawSelectionOverlay()`, `drawLassoOverlay()`, `drawCropOverlay()`, `applyCrop()` — selection and crop tool rendering.
- `drawCursor(x, y)` — draws the brush size preview ring on `cursor-canvas`.
- `pickColor(x, y)` — eyedropper: samples the composited canvas and sets `state.fgColor`.

### `js/layers.js`
`addLayer`, `duplicateLayer`, `deleteLayer`, `mergeDown`, `flattenImage`, `setBlendMode`, `setLayerOpacity` — all layer CRUD operations. `updateLayersPanel()` re-renders the layers list in the right panel. `updateLayerThumbs()` redraws the small thumbnail canvases.

### `js/history.js`
`pushHistory(name)` snapshots all layer canvases (deep copy). `undo()` / `redo()` step through the stack. `restoreHistory(idx)` clones the snapshot back into `state.layers`. Maximum 30 history states.

### `js/color.js`
`updateColorUI()` syncs the foreground color to the swatch, RGB sliders, and hex field. `sliderToColor()` / `hexToColor()` update `state.fgColor` from the controls. `buildSwatches()` populates the palette grid. `hexToRgb()` / `hexToRgba()` are utility helpers used by tools.

### `js/filters.js`
New module added during modularisation (see Filters Panel section below).

### `js/ui.js`
- Menu bar toggle and `closeMenus()`.
- `togglePanel(name)` — collapses/expands a right panel.
- `updateBrushSize`, `updateOpacity`, `updateHardness` — sync brush sliders ↔ state.
- `updateInfoXY`, `updateInfoPanel` — live pixel info display.
- `applyGrayscale`, `applyInvert`, `applyBrightness` — ImageData-based pixel operations.
- `fillSelection`, `clearLayer` — edit operations.
- `openFile`, `loadImageFile`, `saveAsPNG`, `saveAsJPEG` — file I/O.
- `newDocument`, `resizeCanvas`, `modalOK`, `closeModal` — modal dialog management.
- Global `keydown` listener for keyboard shortcuts (B/E/G/M/V/T/I/C/Z/H, ⌘Z, ⌘S, ⌘N, ⌘O, [ ], X, Delete).

---

## Agent

The Agent panel (top of the right sidebar) takes a request such as "make this a moody film
still". A model edits the open image by calling PixelForge's own operations as tools; it
never generates pixels. The browser runs every tool. The model only asks for them.

```
request → model asks for a tool → browser runs it → result (text or canvas image) goes back
        → model asks for the next tool … → model says it's done
```

- **Proxy.** Requests go to `AGENT_ENDPOINT` (top of `js/agent.js`), a separate Vercel
  project at `Sites/pixelforge-agent`. It holds the API key, checks the passphrase typed into
  the panel, and pins the model (`claude-sonnet-5-5`), `max_tokens` and effort. No key is in
  this repo.
- **Tools** (`js/agent-tools.js`): `get_document_info`, `get_canvas`, `duplicate_layer`,
  `add_layer`, `add_gradient_layer`, `add_text`, `set_layer_props`, `apply_adjustments`,
  `apply_effect` (pixelate, posterize, grain, grayscale, invert), `color_balance`,
  `delete_layer`. They address layers by name, validate before changing anything, return the
  layer list on success, return plain errors otherwise, and ignore selections. Each pixel
  operation is a `*Core` function shared with the menus.
- **Your layers are protected.** `apply_adjustments`, `color_balance` and `apply_effect` only
  edit layers the agent created this run. On any other layer they return "This layer existed
  before the run; duplicate it first and edit the copy."
- **Style reference.** The Agent panel's "Reference image…" picker holds an image in memory
  (downscaled to 800px). It's sent with the first message as the style target, the agent can
  call `get_reference` to see it again, and the critic scores how closely color, contrast,
  tone and mood match it while the subject stays the same. It is never edited or added as a
  layer. With a reference set, the request can be left empty. The run log records its
  filename (`reference`).
- **Delete permission.** `delete_layer` works only on layers the agent created in the current
  run (tracked as layer objects in `runCreatedLayers`, so renaming can't get around it).
  Your own layers can only be hidden.
- **Fonts.** `add_text` uses six Google Fonts loaded in `index.html` and waits for the font
  before drawing. If a font can't load, the tool returns an error instead of drawing in a
  fallback font.
- **History.** Every agent change is one History entry labelled `Agent · …`, pushed after
  the change.
- **Critic.** Before finishing, the agent must call `request_review`. A second model call
  (`claude-haiku-4-5`, temperature 0, prompt pinned in the proxy) sees only the original
  request, the starting image and the current image, never the agent's reasoning, and returns
  a score from 1 to 10 plus one sentence of critique. 7 or higher passes. Below 7, the critique
  goes back to the agent. The loop holds the agent to this: finishing without a passing review
  of the current image sends it back. Max 3 reviews per run; then the run stops with the last
  score. If the critic can't be reached, the agent may finish unreviewed and says so. Scores,
  critiques and critic tokens appear in the step log and the run log (`reviews`,
  `final_score`).
- **Revert run** restores a snapshot taken when the run started (not from History, which is
  capped at 30 entries).
- **Save run** downloads the run log as JSON: per-step timing, token usage, model text, tool
  calls and results, stop reason, totals, and the final image.
- **Limits.** 15 steps per run. Only the 2 most recent canvas images are resent to the model.
- **Cost.** Set `PRICE_IN` / `PRICE_OUT` (USD per million tokens) in `js/agent.js` to show
  cost in the panel.

### Known inconsistency: history ordering

The original menu adjustments (`applyGrayscale`, `applyInvert`, `applyBrightness`,
`fillSelection`, `clearLayer`, `applyFilters`) call `pushHistory` *before* changing pixels.
`addLayer` and the layer operations call it *after*. `setBlendMode` and `setLayerOpacity`
don't call it at all. Agent tools and the new Pixelate / Posterize menu items push *after*.
The old functions are left as they are for now.

---

## Filters Panel

The Filters panel appears in the right sidebar between the Color and History panels. It provides four real-time sliders that preview changes live and bake them into the active layer's `ImageData` on Apply.

| Slider | Range | Implementation |
|--------|-------|----------------|
| Blur | 0–20 px | Multi-pass box blur on `ImageData` (separable H + V passes) |
| Sharpen | 0–10 | 3×3 unsharp-mask convolution kernel baked into `ImageData` |
| Hue | 0–360° | CSS `hue-rotate()` baked via offscreen canvas |
| Saturation | 0–200% | CSS `saturate()` baked via offscreen canvas |

**Preview** — While dragging sliders the `canvas.style.filter` property is set on the active layer's backing canvas for an instant CSS-based preview. This does not modify pixel data.

**Apply** — Removes the CSS preview, then bakes each filter into the layer's `ImageData` in order: hue/saturation (CSS bake via offscreen canvas), blur (box blur), sharpen (convolution). Pushes a history entry.

**Reset** — Removes the CSS preview without modifying pixel data and returns all sliders to their default positions.

---

## Tools

| Key | Tool |
|-----|------|
| B | Brush |
| E | Eraser |
| G | Fill (flood) |
| M | Rectangular Select |
| V | Move |
| T | Text |
| I | Eyedropper |
| C | Crop |
| Z | Zoom |
| H | Hand (pan) |
| [ / ] | Decrease / increase brush size |
| X | Swap foreground/background |
| Delete | Clear active layer |
| ⌘Z / ⇧⌘Z | Undo / Redo |
| ⌘S | Export PNG |
| ⌘N | New document |
| ⌘O | Open image |

---

## Running

Open `index.html` directly in any modern browser. No server required for local use. For file-open / export a browser (not `file://` iframe restriction) is needed; a simple local HTTP server works:

```
cd pixel-forge
python3 -m http.server 8080
# then open http://localhost:8080
```
