// ═══════════════════════════════════════════════════════════
//  AGENT TOOLS
//  The operations the agent may call. Each tool is
//  { name, description, input_schema, run(input) } and run
//  returns { ok: true, text, image? } or { ok: false, text }.
//
//  Rules (see README › Agent):
//  - Layers are addressed by NAME, never by index (index 0 is the top).
//  - Validate everything before changing anything.
//  - Every success returns the current layer list.
//  - Make the change, then pushHistory('Agent · …') exactly once.
//  - No prompt(), alert(), modals or slider UI in any code path.
//  - The agent may delete only layers it created this run.
// ═══════════════════════════════════════════════════════════

// Thrown for problems with the model's input or the document state that the
// model can fix. Anything else a tool throws is a bug in PixelForge.
function AgentInputError(message) {
  this.name = 'AgentInputError';
  this.message = message;
}
AgentInputError.prototype = Object.create(Error.prototype);
AgentInputError.prototype.constructor = AgentInputError;

// Layer objects (not names, so renames can't confuse it) created by
// the agent during the current run. agent.js clears it at run start.
var runCreatedLayers = new Set();

var AGENT_FONTS = {
  'Shrikhand':        'heavy, rounded, 1970s groovy display',
  'Bebas Neue':       'tall condensed caps, concert and film posters',
  'Playfair Display': 'elegant high-contrast serif, editorial',
  'Space Mono':       'monospace, technical or typewriter feel',
  'Inter':            'neutral modern sans',
  'Press Start 2P':   '8-bit pixel type, pairs with pixelate'
};

var AGENT_BLEND_MODES = [
  'source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
  'exclusion', 'hue', 'saturation', 'color', 'luminosity'
];

// ── Helpers ───────────────────────────────────────────────
function agentBlendLabel(mode) {
  return mode === 'source-over' ? 'normal' : mode;
}

function agentLayerList() {
  var rows = state.layers.map(function(l) {
    return '- ' + l.name + ' | ' + (l.visible ? 'visible' : 'hidden') + ' | ' +
      Math.round(l.opacity * 100) + '% | ' + agentBlendLabel(l.blendMode);
  });
  return 'Layers (top to bottom): name | visible | opacity | blend\n' + rows.join('\n');
}

function agentLayerNames() {
  return state.layers.map(function(l) { return l.name; }).join(', ');
}

// Returns the layer object, or throws an error the model can act on
function agentFindLayer(name) {
  if (typeof name !== 'string' || !name) {
    throw new AgentInputError("'layer' must be a layer name. Layers are: " + agentLayerNames() + '.');
  }
  var matches = state.layers.filter(function(l) { return l.name === name; });
  if (matches.length === 0) {
    throw new AgentInputError("no layer named '" + name + "'. Layers are: " + agentLayerNames() + '.');
  }
  if (matches.length > 1) {
    throw new AgentInputError("" + matches.length + " layers are named '" + name +
      "', so the name is ambiguous. Layers are: " + agentLayerNames() + '.');
  }
  return matches[0];
}

function agentUniqueName(base) {
  var taken = function(n) { return state.layers.some(function(l) { return l.name === n; }); };
  if (!taken(base)) return base;
  for (var i = 2; ; i++) {
    if (!taken(base + ' ' + i)) return base + ' ' + i;
  }
}

// Throws unless `v` is undefined or a number in [min, max]
function agentCheckRange(input, key, min, max) {
  var v = input[key];
  if (v === undefined || v === null) return;
  if (typeof v !== 'number' || isNaN(v)) throw new AgentInputError("'" + key + "' must be a number.");
  if (v < min || v > max) {
    throw new AgentInputError("'" + key + "' is " + v + '; it must be between ' + min + ' and ' + max + '.');
  }
}

function agentHas(input, key) {
  return input[key] !== undefined && input[key] !== null;
}

// Throws unless input[key] is #rrggbb (or absent, when optional)
function agentCheckHex(input, key, required) {
  if (!agentHas(input, key)) {
    if (required) throw new AgentInputError("'" + key + "' is required, as #rrggbb.");
    return;
  }
  if (typeof input[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input[key])) {
    throw new AgentInputError("'" + key + "' is '" + input[key] + "'; it must be #rrggbb, e.g. #1a3c5e.");
  }
}

function agentRequireName(input, key) {
  if (typeof input[key] !== 'string' || !input[key].trim()) {
    throw new AgentInputError("'" + key + "' must be a non-empty string.");
  }
  return input[key].trim();
}

// Find a layer for a destructive pixel edit. Only layers the agent created
// this run qualify; the person's own layers must be duplicated first.
function agentFindEditableLayer(name) {
  var layer = agentFindLayer(name);
  if (!runCreatedLayers.has(layer)) {
    throw new AgentInputError('This layer existed before the run; duplicate it first and edit the copy.');
  }
  return layer;
}

// Add a new layer at the top, record it as created this run
function agentAddTopLayer(name, paint) {
  var layer = createLayer(name, state.docW, state.docH);
  if (paint) paint(layer);
  agentKeepActive(function() { state.layers.unshift(layer); });
  runCreatedLayers.add(layer);
  return layer;
}

// Run a change that may shift layer indices, keeping the same layer active
function agentKeepActive(fn) {
  var active = state.layers[state.activeLayer];
  fn();
  var idx = state.layers.indexOf(active);
  state.activeLayer = idx >= 0 ? idx : 0;
}

function agentCommit(historyLabel) {
  renderAll();
  updateLayersPanel();
  pushHistory('Agent · ' + historyLabel);
}

// Composite visible layers onto white offscreen, like flattenImage(),
// without touching the document. Returns a canvas scaled to maxSide.
function agentComposite(maxSide) {
  var scale = Math.min(1, maxSide / Math.max(state.docW, state.docH));
  var w = Math.round(state.docW * scale), h = Math.round(state.docH * scale);
  var full = document.createElement('canvas');
  full.width = state.docW; full.height = state.docH;
  var fc = full.getContext('2d');
  fc.fillStyle = '#ffffff';
  fc.fillRect(0, 0, state.docW, state.docH);
  for (var i = state.layers.length - 1; i >= 0; i--) {
    var l = state.layers[i];
    if (!l.visible) continue;
    fc.globalAlpha = l.opacity;
    fc.globalCompositeOperation = l.blendMode;
    fc.drawImage(l.canvas, 0, 0);
  }
  if (scale === 1) return full;
  var out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(full, 0, 0, w, h);
  return out;
}

// ── Tools ─────────────────────────────────────────────────
var AGENT_TOOLS = [

  {
    name: 'get_document_info',
    description: 'Get the document size and the full layer stack, top to bottom. Call this first.',
    input_schema: { type: 'object', properties: {} },
    run: function() {
      var active = state.layers[state.activeLayer];
      return { ok: true, text:
        'Document ' + state.docW + '×' + state.docH + ' px.\n' +
        agentLayerList() + '\n' +
        'Active layer (the one a human has selected): ' + (active ? active.name : 'none') + '.' };
    }
  },

  {
    name: 'get_canvas',
    description: 'See the current composited image. Call after any change you need to judge, ' +
      'and always before you finish.',
    input_schema: { type: 'object', properties: {} },
    run: function() {
      var c = agentComposite(800);
      var dataUrl = c.toDataURL('image/jpeg', 0.8);
      return {
        ok: true,
        text: 'Canvas ' + state.docW + '×' + state.docH + ', shown at ' + c.width + '×' + c.height + '.\n' +
          agentLayerList(),
        image: { media_type: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl: dataUrl }
      };
    }
  },

  {
    name: 'duplicate_layer',
    description: 'Copy a layer. Work on a copy to keep the original untouched. The copy keeps ' +
      "the source's pixels, opacity and blend mode, and is placed directly above the source. " +
      'If new_name is already taken, a number is added to make it unique.',
    input_schema: {
      type: 'object',
      properties: {
        layer:    { type: 'string', description: 'Name of the layer to copy.' },
        new_name: { type: 'string', description: 'Name for the copy.' }
      },
      required: ['layer', 'new_name']
    },
    run: function(input) {
      var src = agentFindLayer(input.layer);
      if (typeof input.new_name !== 'string' || !input.new_name.trim()) {
        throw new AgentInputError("'new_name' must be a non-empty string.");
      }
      var name = agentUniqueName(input.new_name.trim());
      agentKeepActive(function() {
        var dup = createLayer(name, state.docW, state.docH);
        dup.canvas.getContext('2d').drawImage(src.canvas, 0, 0);
        dup.opacity = src.opacity;
        dup.blendMode = src.blendMode;
        dup.text = src.text;
        dup.visible = src.visible;
        state.layers.splice(state.layers.indexOf(src), 0, dup);
        runCreatedLayers.add(dup);
      });
      agentCommit('duplicate ' + src.name + ' → ' + name);
      return { ok: true, text: "Duplicated '" + src.name + "' as '" + name + "'.\n" + agentLayerList() };
    }
  },

  {
    name: 'add_layer',
    description: 'Add a new layer at the top of the stack. With fill_color, it becomes a solid ' +
      'color layer, which combined with a blend mode tints everything below it: ' +
      "'color' recolors while keeping shading, 'multiply' darkens, 'screen' lightens, " +
      "'overlay' adds contrast and tint. Without fill_color the layer is transparent. " +
      'If name is already taken, a number is added to make it unique.',
    input_schema: {
      type: 'object',
      properties: {
        name:       { type: 'string', description: 'Name for the new layer.' },
        fill_color: { type: 'string', description: 'Optional solid fill, as #rrggbb.' }
      },
      required: ['name']
    },
    run: function(input) {
      var name = agentUniqueName(agentRequireName(input, 'name'));
      agentCheckHex(input, 'fill_color', false);
      agentAddTopLayer(name, function(layer) {
        if (!input.fill_color) return;
        var lc = layer.canvas.getContext('2d');
        lc.fillStyle = input.fill_color;
        lc.fillRect(0, 0, state.docW, state.docH);
      });
      agentCommit('add layer ' + name + (input.fill_color ? ' ' + input.fill_color : ''));
      return { ok: true, text: "Added '" + name + "'" +
        (input.fill_color ? ' filled with ' + input.fill_color : ' (transparent)') + ' at the top.\n' +
        agentLayerList() };
    }
  },

  {
    name: 'set_layer_props',
    description: 'Change how a layer combines with the layers below it. Cheap and fully ' +
      'reversible; prefer it over destructive pixel edits.',
    input_schema: {
      type: 'object',
      properties: {
        layer:      { type: 'string', description: 'Name of the layer to change.' },
        blend_mode: { type: 'string', enum: ['normal'].concat(AGENT_BLEND_MODES),
                      description: "'normal' and 'source-over' are the same mode." },
        opacity:    { type: 'number', minimum: 0, maximum: 100, description: 'Percent, 0–100.' },
        visible:    { type: 'boolean' }
      },
      required: ['layer']
    },
    run: function(input) {
      var layer = agentFindLayer(input.layer);
      var mode = input.blend_mode === 'normal' ? 'source-over' : input.blend_mode;
      if (agentHas(input, 'blend_mode') && AGENT_BLEND_MODES.indexOf(mode) < 0) {
        throw new AgentInputError("unknown blend_mode '" + input.blend_mode + "'. Use one of: normal, " +
          AGENT_BLEND_MODES.slice(1).join(', ') + '.');
      }
      agentCheckRange(input, 'opacity', 0, 100);
      if (agentHas(input, 'visible') && typeof input.visible !== 'boolean') {
        throw new AgentInputError("'visible' must be true or false.");
      }
      if (!agentHas(input, 'blend_mode') && !agentHas(input, 'opacity') && !agentHas(input, 'visible')) {
        throw new AgentInputError('give at least one of blend_mode, opacity, visible.');
      }

      var changes = [];
      if (agentHas(input, 'blend_mode')) { layer.blendMode = mode; changes.push('blend ' + agentBlendLabel(mode)); }
      if (agentHas(input, 'opacity'))    { layer.opacity = input.opacity / 100; changes.push('opacity ' + Math.round(input.opacity) + '%'); }
      if (agentHas(input, 'visible'))    { layer.visible = input.visible; changes.push(input.visible ? 'shown' : 'hidden'); }
      agentCommit(layer.name + ' ' + changes.join(', '));
      return { ok: true, text: "Set '" + layer.name + "': " + changes.join(', ') + '.\n' + agentLayerList() };
    }
  },

  {
    name: 'apply_adjustments',
    description: "Adjust a layer's pixels. Hue and saturation shift color while keeping light " +
      'and dark values, so shadows stay shadows. This changes pixels permanently, so it only ' +
      'works on layers you created this run: duplicate an existing layer and adjust the copy. ' +
      'All given values apply in one step, ' +
      'in this order: hue/saturation, brightness/contrast, blur, sharpen. Acts on the whole ' +
      'layer (selections are ignored).',
    input_schema: {
      type: 'object',
      properties: {
        layer:      { type: 'string', description: 'Name of the layer to adjust.' },
        hue:        { type: 'number', minimum: -180, maximum: 180, description: 'Hue rotation in degrees.' },
        saturation: { type: 'number', minimum: 0, maximum: 200, description: 'Percent; 100 = unchanged, 0 = gray.' },
        brightness: { type: 'number', minimum: -100, maximum: 100, description: '0 = unchanged.' },
        contrast:   { type: 'number', minimum: -100, maximum: 100, description: '0 = unchanged.' },
        blur:       { type: 'number', minimum: 0, maximum: 20, description: 'Box blur radius in px.' },
        sharpen:    { type: 'number', minimum: 0, maximum: 10, description: 'Sharpen strength.' }
      },
      required: ['layer']
    },
    run: function(input) {
      var layer = agentFindEditableLayer(input.layer);
      agentCheckRange(input, 'hue', -180, 180);
      agentCheckRange(input, 'saturation', 0, 200);
      agentCheckRange(input, 'brightness', -100, 100);
      agentCheckRange(input, 'contrast', -100, 100);
      agentCheckRange(input, 'blur', 0, 20);
      agentCheckRange(input, 'sharpen', 0, 10);

      var hue  = agentHas(input, 'hue') ? input.hue : 0;
      var sat  = agentHas(input, 'saturation') ? input.saturation : 100;
      var bri  = agentHas(input, 'brightness') ? input.brightness : 0;
      var con  = agentHas(input, 'contrast') ? input.contrast : 0;
      var blur = agentHas(input, 'blur') ? Math.round(input.blur) : 0;
      var shp  = agentHas(input, 'sharpen') ? input.sharpen : 0;
      if (hue === 0 && sat === 100 && bri === 0 && con === 0 && blur === 0 && shp === 0) {
        throw new AgentInputError('no change requested; every value is at its neutral setting.');
      }
      if ((hue !== 0 || sat !== 100) && typeof document.createElement('canvas').getContext('2d').filter !== 'string') {
        throw new AgentInputError('this browser cannot bake hue/saturation (no canvas filter support). ' +
          'Use a color layer with a blend mode instead.');
      }

      var w = layer.canvas.width, h = layer.canvas.height;
      var lctx = layer.canvas.getContext('2d');
      var changes = [];
      if (hue !== 0 || sat !== 100) {
        hueSaturationCore(layer, hue, sat);
        if (hue !== 0) changes.push('hue ' + hue);
        if (sat !== 100) changes.push('sat ' + sat);
      }
      if (bri !== 0 || con !== 0) {
        brightnessContrastCore(layer, bri * 2.55, con * 2.55);
        if (bri !== 0) changes.push('bri ' + bri);
        if (con !== 0) changes.push('con ' + con);
      }
      if (blur > 0) { applyBoxBlur(lctx, w, h, blur); changes.push('blur ' + blur); }
      if (shp > 0)  { applySharpen(lctx, w, h, shp);  changes.push('sharpen ' + shp); }

      agentCommit('adjust ' + layer.name + ' ' + changes.join(' '));
      return { ok: true, text: "Adjusted '" + layer.name + "': " + changes.join(', ') + '.\n' + agentLayerList() };
    }
  },

  {
    name: 'apply_effect',
    description: 'Stylize a layer. pixelate = blocky pixel-art cells (amount = cell size, 2–64; ' +
      '6–12 reads as pixel art on a 1280px image). posterize = flat color bands (amount = levels ' +
      'per channel, 2–16; 4–6 is poster-like). grain = film-style noise (amount 1–50; 8–20 reads ' +
      'as film; 30+ is heavy). grayscale and invert take no amount. ' +
      'Destructive, so it only works on layers you created this run: duplicate an existing ' +
      'layer and edit the copy. Acts on the whole layer (selections are ignored).',
    input_schema: {
      type: 'object',
      properties: {
        layer:  { type: 'string', description: 'Name of the layer to stylize.' },
        effect: { type: 'string', enum: ['pixelate', 'posterize', 'grain', 'grayscale', 'invert'] },
        amount: { type: 'number', description: 'pixelate: cell size 2–64. posterize: levels 2–16. grain: strength 1–50.' }
      },
      required: ['layer', 'effect']
    },
    run: function(input) {
      var layer = agentFindEditableLayer(input.layer);
      var effect = input.effect;
      var amount;
      var limits = { pixelate: [2, 64], posterize: [2, 16], grain: [1, 50] };
      if (limits[effect]) {
        var lim = limits[effect];
        if (!agentHas(input, 'amount')) {
          throw new AgentInputError(effect + " needs 'amount' (" + lim[0] + '–' + lim[1] + ').');
        }
        agentCheckRange(input, 'amount', lim[0], lim[1]);
        amount = Math.round(input.amount);
      } else if (effect === 'grayscale' || effect === 'invert') {
        if (agentHas(input, 'amount')) {
          throw new AgentInputError(effect + " takes no 'amount'; call it again without one.");
        }
      } else {
        throw new AgentInputError("unknown effect '" + effect + "'. Use pixelate, posterize, grain, grayscale or invert.");
      }

      if (effect === 'pixelate')  pixelateCore(layer, amount);
      if (effect === 'posterize') posterizeCore(layer, amount);
      if (effect === 'grain')     grainCore(layer, amount);
      if (effect === 'grayscale') grayscaleCore(layer);
      if (effect === 'invert')    invertCore(layer);

      var label = effect + (amount ? ' ' + amount : '');
      agentCommit(label + ' ' + layer.name);
      return { ok: true, text: "Applied " + label + " to '" + layer.name + "'.\n" + agentLayerList() };
    }
  },

  {
    name: 'delete_layer',
    description: "Remove a layer you created this run that didn't work out. Prefer this over " +
      'leaving failed attempts hidden in the stack. Layers that existed before the run cannot be ' +
      'deleted; hide them instead.',
    input_schema: {
      type: 'object',
      properties: { layer: { type: 'string', description: 'Name of a layer you created this run.' } },
      required: ['layer']
    },
    run: function(input) {
      var layer = agentFindLayer(input.layer);
      if (!runCreatedLayers.has(layer)) {
        throw new AgentInputError("'" + layer.name + "' existed before this run; you can only delete layers " +
          'you created. Hide it instead.');
      }
      if (state.layers.length <= 1) throw new AgentInputError("'" + layer.name + "' is the only layer left.");
      agentKeepActive(function() { state.layers.splice(state.layers.indexOf(layer), 1); });
      runCreatedLayers.delete(layer);
      agentCommit('delete ' + layer.name);
      return { ok: true, text: "Deleted '" + layer.name + "'.\n" + agentLayerList() };
    }
  },

  {
    name: 'add_gradient_layer',
    description: 'Add a layer filled with a gradient, at the top of the stack. Recipes: vignette = ' +
      'radial, start color black at opacity 0, end color black at opacity 70, blend mode multiply. ' +
      'Sky or background fade = linear, angle 90. Combine with set_layer_props blend modes for ' +
      'tints that vary across the image. Radial gradients center on the document.',
    input_schema: {
      type: 'object',
      properties: {
        name:          { type: 'string' },
        type:          { type: 'string', enum: ['radial', 'linear'] },
        color_start:   { type: 'string', description: '#rrggbb. Radial: the center. Linear: the start side.' },
        color_end:     { type: 'string', description: '#rrggbb. Radial: the edges. Linear: the end side.' },
        opacity_start: { type: 'number', minimum: 0, maximum: 100, description: 'Default 100.' },
        opacity_end:   { type: 'number', minimum: 0, maximum: 100, description: 'Default 100.' },
        angle:         { type: 'number', minimum: 0, maximum: 360,
                         description: 'Linear only. 0 = left→right, 90 = top→bottom. Default 0.' },
        inner_radius:  { type: 'number', minimum: 0, maximum: 100,
                         description: 'Radial only. % of the half-diagonal where the fade starts. Default 40.' }
      },
      required: ['name', 'type', 'color_start', 'color_end']
    },
    run: function(input) {
      var name = agentUniqueName(agentRequireName(input, 'name'));
      if (input.type !== 'radial' && input.type !== 'linear') {
        throw new AgentInputError("'type' must be 'radial' or 'linear'.");
      }
      agentCheckHex(input, 'color_start', true);
      agentCheckHex(input, 'color_end', true);
      agentCheckRange(input, 'opacity_start', 0, 100);
      agentCheckRange(input, 'opacity_end', 0, 100);
      agentCheckRange(input, 'angle', 0, 360);
      agentCheckRange(input, 'inner_radius', 0, 100);
      if (input.type === 'radial' && agentHas(input, 'angle')) {
        throw new AgentInputError("'angle' applies to linear gradients only; leave it out for radial.");
      }
      if (input.type === 'linear' && agentHas(input, 'inner_radius')) {
        throw new AgentInputError("'inner_radius' applies to radial gradients only; leave it out for linear.");
      }
      var opts = {
        type: input.type, colorStart: input.color_start, colorEnd: input.color_end,
        opacityStart: agentHas(input, 'opacity_start') ? input.opacity_start : 100,
        opacityEnd:   agentHas(input, 'opacity_end')   ? input.opacity_end   : 100,
        angle:        agentHas(input, 'angle')         ? input.angle         : 0,
        innerRadius:  agentHas(input, 'inner_radius')  ? input.inner_radius  : 40
      };
      agentAddTopLayer(name, function(layer) { gradientFillCore(layer, opts); });
      agentCommit('gradient ' + name + ' ' + input.type);
      return { ok: true, text: "Added " + input.type + " gradient layer '" + name + "' at the top.\n" +
        agentLayerList() };
    }
  },

  {
    name: 'color_balance',
    description: 'Tint dark areas and bright areas separately, the classic film color grade. ' +
      'Teal/orange = shadows #1f5f6b, highlights #f2a65a, strength 25–40. Keeps shading. ' +
      'Destructive, so it only works on layers you created this run: duplicate an existing ' +
      'layer and edit the copy. Acts on the whole layer (selections are ignored).',
    input_schema: {
      type: 'object',
      properties: {
        layer:           { type: 'string', description: 'Name of the layer to grade.' },
        shadows_tint:    { type: 'string', description: '#rrggbb that dark areas move toward.' },
        highlights_tint: { type: 'string', description: '#rrggbb that bright areas move toward.' },
        strength:        { type: 'number', minimum: 0, maximum: 100, description: 'Default 30.' }
      },
      required: ['layer']
    },
    run: function(input) {
      var layer = agentFindEditableLayer(input.layer);
      agentCheckHex(input, 'shadows_tint', false);
      agentCheckHex(input, 'highlights_tint', false);
      agentCheckRange(input, 'strength', 0, 100);
      if (!agentHas(input, 'shadows_tint') && !agentHas(input, 'highlights_tint')) {
        throw new AgentInputError('give shadows_tint, highlights_tint, or both.');
      }
      var strength = agentHas(input, 'strength') ? input.strength : 30;
      if (strength === 0) throw new AgentInputError('strength 0 changes nothing.');
      colorBalanceCore(layer, input.shadows_tint || null, input.highlights_tint || null, strength);
      var parts = [];
      if (input.shadows_tint)    parts.push('shadows ' + input.shadows_tint);
      if (input.highlights_tint) parts.push('highlights ' + input.highlights_tint);
      parts.push('strength ' + strength);
      agentCommit('color balance ' + layer.name + ' ' + parts.join(' '));
      return { ok: true, text: "Color balanced '" + layer.name + "': " + parts.join(', ') + '.\n' + agentLayerList() };
    }
  },

  {
    name: 'add_text',
    description: 'Add a line of text on its own layer, named "Text: <first 20 chars>". Position is ' +
      'the anchor point as a percentage of the canvas: x is the left edge, center or right edge ' +
      'depending on align; y is the vertical middle of the text. Call get_canvas afterward to ' +
      'check size and placement. Fonts: ' +
      Object.keys(AGENT_FONTS).map(function(f) { return f + ' (' + AGENT_FONTS[f] + ')'; }).join('; ') + '.',
    input_schema: {
      type: 'object',
      properties: {
        text:  { type: 'string', maxLength: 80 },
        font:  { type: 'string', enum: Object.keys(AGENT_FONTS) },
        size:  { type: 'number', minimum: 8, maximum: 400, description: 'Font size in px at document size.' },
        color: { type: 'string', description: '#rrggbb' },
        x:     { type: 'number', minimum: 0, maximum: 100, description: '% of document width.' },
        y:     { type: 'number', minimum: 0, maximum: 100, description: '% of document height.' },
        align: { type: 'string', enum: ['left', 'center', 'right'], description: 'Default center.' }
      },
      required: ['text', 'font', 'size', 'color', 'x', 'y']
    },
    run: async function(input) {
      if (typeof input.text !== 'string' || !input.text.trim()) throw new AgentInputError("'text' must be a non-empty string.");
      if (input.text.length > 80) throw new AgentInputError("'text' is " + input.text.length + ' characters; the limit is 80.');
      if (!AGENT_FONTS[input.font]) {
        throw new AgentInputError("unknown font '" + input.font + "'. Use one of: " + Object.keys(AGENT_FONTS).join(', ') + '.');
      }
      ['size', 'x', 'y'].forEach(function(k) {
        if (!agentHas(input, k)) throw new AgentInputError("'" + k + "' is required.");
      });
      agentCheckRange(input, 'size', 8, 400);
      agentCheckRange(input, 'x', 0, 100);
      agentCheckRange(input, 'y', 0, 100);
      agentCheckHex(input, 'color', true);
      var align = agentHas(input, 'align') ? input.align : 'center';
      if (['left', 'center', 'right'].indexOf(align) < 0) throw new AgentInputError("'align' must be left, center or right.");

      // Draw only once the real font is ready; a fallback font would be a silent failure
      var spec = input.size + 'px "' + input.font + '"';
      var faces;
      try { faces = await document.fonts.load(spec, input.text); }
      catch (e) { throw new AgentInputError("font '" + input.font + "' failed to load (" + e.message + ').'); }
      if (!faces.length || !document.fonts.check(spec, input.text)) {
        throw new AgentInputError("font '" + input.font + "' failed to load (is the network down?). Try again or pick another font.");
      }

      var name = agentUniqueName('Text: ' + input.text.slice(0, 20));
      var box;
      agentAddTopLayer(name, function(layer) {
        box = renderTextLayer(layer, {
          content: input.text, font: input.font, size: input.size, color: input.color,
          x: state.docW * input.x / 100, y: state.docH * input.y / 100, align: align, baseline: 'middle'
        });
      });
      agentCommit('text ' + JSON.stringify(input.text.slice(0, 20)) + ' ' + input.font);

      var warnings = [];
      if (box.left < 0)            warnings.push('Warning: text extends past the left edge.');
      if (box.right > state.docW)  warnings.push('Warning: text extends past the right edge.');
      if (box.top < 0)             warnings.push('Warning: text extends past the top edge.');
      if (box.bottom > state.docH) warnings.push('Warning: text extends past the bottom edge.');
      return { ok: true, text: "Added text layer '" + name + "' in " + input.font + ' ' + input.size + 'px, ' +
        'about ' + Math.round(box.right - box.left) + '×' + Math.round(box.bottom - box.top) + ' px.\n' +
        (warnings.length ? warnings.join('\n') + '\n' : '') + agentLayerList() };
    }
  }

];

// ── Dispatch ──────────────────────────────────────────────
function agentToolSchemas() {
  return AGENT_TOOLS.map(function(t) {
    return { name: t.name, description: t.description, input_schema: t.input_schema };
  });
}

// Never throws: exceptions become { ok: false } so the model can recover.
// Input errors say what to fix; anything unexpected is reported as a bug so
// the model doesn't spend steps retrying it.
// Async because some tools (add_text) wait for resources.
async function runAgentTool(name, input) {
  var tool = AGENT_TOOLS.filter(function(t) { return t.name === name; })[0] ||
             AGENT_TOOLS.filter(function(t) { return t.name.toLowerCase() === String(name).toLowerCase(); })[0];
  if (!tool) {
    return { ok: false, text: "Error: no tool named '" + name + "'. Tools are: " +
      AGENT_TOOLS.map(function(t) { return t.name; }).join(', ') + '.' };
  }
  try {
    return await tool.run(input || {});
  } catch (e) {
    if (e instanceof AgentInputError) return { ok: false, text: 'Error: ' + e.message };
    console.error('PixelForge agent tool ' + tool.name + ' crashed:', e);
    return { ok: false, text: 'Internal error in this tool: ' + (e && e.message || e) +
      ". This is a bug, not a problem with your input; don't retry this tool." };
  }
}
