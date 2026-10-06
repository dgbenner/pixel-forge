// ═══════════════════════════════════════════════════════════
//  AGENT
//  Hand-written tool-use loop against the Anthropic Messages API,
//  through the pixelforge-agent proxy (which holds the API key).
//  The model only asks for tools; the browser runs them.
// ═══════════════════════════════════════════════════════════

var AGENT_ENDPOINT = 'https://pixelforge-agent.vercel.app/api/agent';
var AGENT_MAX_STEPS = 15;
var AGENT_KEEP_IMAGES = 2;
var AGENT_MAX_REVIEWS = 3;
var AGENT_PASS_SCORE  = 7;

// Tools that don't change the document; anything else marks the image as
// changed since the last review
var AGENT_READ_ONLY_TOOLS = ['get_document_info', 'get_canvas', 'request_review', 'get_reference'];

// USD per million tokens. Fill these from https://www.anthropic.com/pricing
// for the model the proxy pins; cost stays hidden while either is null.
var PRICE_IN  = null;
var PRICE_OUT = null;
// Same, for the critic model (claude-haiku-4-5, pinned in the proxy)
var PRICE_CRITIC_IN  = null;
var PRICE_CRITIC_OUT = null;

var AGENT_SYSTEM_BASE = [
  'You are an image retoucher working inside PixelForge, a layer-based editor. You edit only by',
  'calling tools; you cannot paint pixels directly.',
  '',
  'Work like a careful designer:',
  '- Start with get_document_info and get_canvas.',
  '- Keep the original intact: duplicate a layer before destructive edits.',
  '- Prefer reversible moves (blend modes, opacity, color layers) over destructive ones.',
  "- After any change you can't predict confidently, call get_canvas and judge the result.",
  '- If a result is worse, undo it by hiding or adjusting the layer, not by stacking fixes.',
  "- If an attempt doesn't work, delete that layer rather than leaving it hidden.",
  "- If a request needs something your tools can't do, say so plainly and do the closest honest",
  '  version.'
];

// How to finish depends on whether the critic is on for this run
var AGENT_FINISH_WITH_CRITIC = [
  '- When you believe the request is met, call get_canvas, then request_review. A separate critic',
  '  scores the result 1–10 against the original request; ' + AGENT_PASS_SCORE + ' or higher passes. If it fails,',
  '  address its critique and request review again (at most ' + AGENT_MAX_REVIEWS + ' reviews per run). After a pass,',
  '  finish with 2–3 sentences: what you did and why.'
];
var AGENT_FINISH_ALONE = [
  '- Stop when the request is met. Before stopping, call get_canvas one last time and finish with',
  '  2–3 sentences: what you did and why.'
];

// Added when the run has a style reference image
var AGENT_REFERENCE_LINES = [
  '- A style reference image is attached to the request. Match its color palette, contrast, tone',
  "  and mood, while keeping this document's subject and composition. Don't copy the reference's",
  '  content. Call get_reference to look at it again; it is not in the document and cannot be edited.'
];

function agentSystemPrompt(criticOn, hasReference) {
  return AGENT_SYSTEM_BASE
    .concat(hasReference ? AGENT_REFERENCE_LINES : [])
    .concat(criticOn ? AGENT_FINISH_WITH_CRITIC : AGENT_FINISH_ALONE).join('\n');
}

var agent = {
  running: false,
  stopRequested: false,
  checkpoint: null,   // { layers, activeLayer, docW, docH, tab }
  run: null,          // the run log record (see README › Run log)
  totals: { input_tokens: 0, output_tokens: 0 },
  // Per-run review state: count, passed (last review passed and nothing
  // changed since), changed (image changed since last review), waived
  // (critic unreachable), limitHit, last, startImage (base64 JPEG)
  review: null,
  // Plain-text copy of the step log, with tool results in full (the panel
  // shows only their first line). Filled by the agentLog* functions.
  logText: [],
  // Style reference from the panel picker: { name, data (base64 JPEG ≤800px),
  // dataUrl, w, h } or null. Held in memory only; never a layer, never edited.
  reference: null,
  runReference: null,          // the reference used by the current run
  referenceResultIds: new Set() // tool_use ids of get_reference results
};

// ── The loop ──────────────────────────────────────────────
async function runAgent(request, criticOn, reference) {
  var t0 = performance.now();
  agent.checkpoint = {
    layers: snapshotLayers(state.layers), activeLayer: state.activeLayer,
    docW: state.docW, docH: state.docH, tab: activeTab
  };
  agent.run = {
    run_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    started: new Date().toISOString(),
    request: request,
    critic: criticOn,
    reference: reference ? reference.name : null,
    model: null,
    steps: [],
    stop_reason: null,
    reviews: [],
    final_score: null,
    totals: { input_tokens: 0, output_tokens: 0, ms: 0, steps: 0,
              critic_input_tokens: 0, critic_output_tokens: 0, reviews: 0 },
    final_image: null,
    verdict: null       // "up" | "down" once you rate the run
  };
  agent.totals = agent.run.totals;
  agent.review = {
    on: criticOn,
    count: 0, passed: false, changed: true, waived: false, limitHit: false, last: null,
    startImage: agentComposite(800).toDataURL('image/jpeg', 0.8).split(',')[1]
  };
  runCreatedLayers.clear();
  agent.runReference = reference || null;
  agent.referenceResultIds = new Set();

  var system = agentSystemPrompt(criticOn, !!reference);
  var tools = agentToolSchemas().filter(function(t) {
    if (t.name === 'request_review') return criticOn;
    if (t.name === 'get_reference') return !!reference;
    return true;
  });
  var first = reference
    ? [{ type: 'text', text: request },
       { type: 'text', text: "Style reference ('" + reference.name + "'): the target look. Match its color, " +
         "contrast, tone and mood, not its subject. It is not part of the document." },
       { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: reference.data } }]
    : request;
  var messages = [{ role: 'user', content: first }];
  var stopReason = 'step_limit';

  for (var n = 1; n <= AGENT_MAX_STEPS; n++) {
    if (agent.stopRequested) { stopReason = 'user_stop'; break; }
    if (activeTab !== agent.checkpoint.tab) {
      agentLogNote('Stopped: the document tab changed mid-run.', true);
      stopReason = 'error'; break;
    }

    var stepT0 = performance.now();
    var res;
    try {
      res = await agentCall({ system: system, messages: messages, tools: tools });
    } catch (e) {
      agentLogNote('Request failed: ' + e.message, true);
      stopReason = 'error'; break;
    }

    var step = {
      n: n, ms: Math.round(performance.now() - stepT0), usage: res.usage || {},
      text: agentReplyText(res.content), tool_calls: []
    };
    if (res.input_transformations && res.input_transformations.length) {
      step.input_transformations = res.input_transformations;
    }
    agent.run.model = res.model || agent.run.model;
    agent.run.steps.push(step);
    agent.totals.input_tokens  += (res.usage && res.usage.input_tokens)  || 0;
    agent.totals.output_tokens += (res.usage && res.usage.output_tokens) || 0;
    agent.totals.steps = n;
    var row = agentLogStep(step);

    // Pass the assistant turn back unchanged, thinking blocks included
    messages.push({ role: 'assistant', content: res.content });

    // The director wants to finish: allow it only after a passing review of
    // the current image (or if the critic was unreachable)
    if (res.stop_reason === 'end_turn' && agent.review.on && !agent.review.passed && !agent.review.waived) {
      var nudge = agentReviewNudge();
      step.gate = nudge;
      agentLogNote('Not finished: ' + nudge, false);
      messages.push({ role: 'user', content: nudge });
      agentUpdateTotals();
      continue;
    }

    if (res.stop_reason !== 'tool_use') {
      stopReason = res.stop_reason;
      if (res.stop_reason === 'max_tokens') {
        agentLogNote('Reply was cut off at the max_tokens limit set in the proxy.', true);
      } else if (res.stop_reason === 'refusal') {
        agentLogNote('The model declined this request' +
          (res.stop_details && res.stop_details.category ? ' (' + res.stop_details.category + ')' : '') + '.', true);
      }
      break;
    }

    // Run every requested tool in order, then send all results back together
    var results = [];
    for (var b = 0; b < res.content.length; b++) {
      var block = res.content[b];
      if (block.type !== 'tool_use') continue;
      var r = await runAgentTool(block.name, block.input);
      if (block.name === 'get_reference') agent.referenceResultIds.add(block.id);
      if (r.ok && AGENT_READ_ONLY_TOOLS.indexOf(block.name) < 0) {
        agent.review.changed = true;
        agent.review.passed = false;
      }
      var call = { name: block.name, input: block.input, ok: r.ok, result: r.text };
      if (r.review) {
        call.review = r.review;
        agent.run.reviews.push(Object.assign({ step: n }, r.review));
      }
      step.tool_calls.push(call);
      agentLogToolCall(row, block, r);
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: r.image
          ? [{ type: 'text', text: r.text },
             { type: 'image', source: { type: 'base64', media_type: r.image.media_type, data: r.image.data } }]
          : r.text,
        is_error: !r.ok
      });
    }
    messages.push({ role: 'user', content: results });
    trimOldImages(messages);
    agentUpdateTotals();

    if (agent.review.limitHit) {
      var last = agent.review.last;
      agentLogNote('Stopped after ' + AGENT_MAX_REVIEWS + ' reviews. Last score ' + last.score + '/10: ' +
        last.critique, true);
      stopReason = 'review_limit';
      break;
    }
  }

  if (stopReason === 'step_limit') agentLogNote('Stopped at step limit (' + AGENT_MAX_STEPS + ').', false);
  if (stopReason === 'user_stop')  agentLogNote('Stopped by request.', false);

  agent.run.stop_reason = stopReason;
  agent.run.final_score = agent.review.last ? agent.review.last.score : null;
  agent.run.totals.ms = Math.round(performance.now() - t0);
  agent.run.final_image = agentComposite(800).toDataURL('image/jpeg', 0.8);
  agentUpdateTotals();
}

async function agentCall(body) {
  var resp = await fetch(AGENT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-pass': agentPass() },
    body: JSON.stringify(body)
  });
  var data;
  try { data = await resp.json(); } catch (e) { data = null; }
  if (!resp.ok) {
    var msg = data && data.error ? (data.error.message || data.error) : resp.statusText;
    throw new Error(resp.status + ' ' + msg);
  }
  return data;
}

// ── Critic ────────────────────────────────────────────────
// What to tell the director when it tries to finish without a passing review
function agentReviewNudge() {
  var rv = agent.review;
  if (!rv.last) {
    return 'Before finishing, call request_review so the critic can grade the result.';
  }
  if (rv.last.passed) {
    return 'You changed the image after it passed review, so the final image has not been graded. ' +
      'Call request_review again before finishing.';
  }
  return 'Your last review scored ' + rv.last.score + '/10, below the ' + AGENT_PASS_SCORE +
    ' needed. Address the critique ("' + rv.last.critique + '") and call request_review again.';
}

AGENT_TOOLS.push({
  name: 'request_review',
  description: "Ask an independent critic to grade the current image against the user's original " +
    'request. The critic sees only the request, the starting image and the current image, never ' +
    'your reasoning. It returns a score from 1 to 10 and one sentence of critique. Required before ' +
    'you finish: ' + AGENT_PASS_SCORE + ' or higher passes. At most ' + AGENT_MAX_REVIEWS + ' reviews ' +
    'per run; a review with no changes since the last one is refused.',
  input_schema: { type: 'object', properties: {} },
  run: async function() {
    var rv = agent.review;
    if (!rv) throw new AgentInputError('request_review only works during an agent run.');
    if (!rv.on) throw new AgentInputError('the critic is turned off for this run; finish without a review.');
    if (rv.last && !rv.changed) {
      throw new AgentInputError('nothing has changed since the last review (score ' + rv.last.score +
        '/10). Make changes that address the critique first.');
    }
    var t0 = performance.now();
    var verdict;
    try {
      verdict = await agentCall({
        role: 'critic',
        request: agent.run.request,
        start_image: rv.startImage,
        current_image: agentComposite(800).toDataURL('image/jpeg', 0.8).split(',')[1],
        reference_image: agent.runReference ? agent.runReference.data : undefined
      });
      // An older proxy ignores the reference; don't accept a score graded without it
      if (agent.runReference && !verdict.reference_used) {
        throw new Error("the critic didn't receive the style reference (the proxy is out of date)");
      }
    } catch (e) {
      rv.waived = true;
      return { ok: false, text: 'Error: the review service failed (' + e.message + '). You may finish ' +
        'without a review; say in your summary that the result was not reviewed.' };
    }
    rv.count++;
    rv.changed = false;
    rv.passed = verdict.score >= AGENT_PASS_SCORE;
    rv.limitHit = !rv.passed && rv.count >= AGENT_MAX_REVIEWS;
    rv.last = {
      n: rv.count, score: verdict.score, critique: verdict.critique, passed: rv.passed,
      model: verdict.model, usage: verdict.usage || {}, ms: Math.round(performance.now() - t0)
    };
    agent.totals.critic_input_tokens  += rv.last.usage.input_tokens  || 0;
    agent.totals.critic_output_tokens += rv.last.usage.output_tokens || 0;
    agent.totals.reviews = rv.count;

    var head = 'Review ' + rv.count + '/' + AGENT_MAX_REVIEWS + ': score ' + verdict.score + '/10 ';
    var text;
    if (rv.passed) {
      text = head + '(passes). Critique: ' + verdict.critique +
        '\nYou may finish now with your 2–3 sentence summary.';
    } else if (rv.limitHit) {
      text = head + '(needs ' + AGENT_PASS_SCORE + '). Critique: ' + verdict.critique +
        '\nReview limit reached; the run stops here.';
    } else {
      text = head + '(needs ' + AGENT_PASS_SCORE + '). Critique: ' + verdict.critique +
        '\nKeep working to address this, then call request_review again.';
    }
    return { ok: true, text: text, review: rv.last };
  }
});

AGENT_TOOLS.push({
  name: 'get_reference',
  description: 'See the style reference image again: the look to match (color, contrast, tone, mood), ' +
    'not the subject. It is not part of the document and cannot be edited.',
  input_schema: { type: 'object', properties: {} },
  run: function() {
    var ref = agent.runReference;
    if (!ref) throw new AgentInputError('no style reference is set for this run.');
    return {
      ok: true,
      text: "Style reference '" + ref.name + "', shown at " + ref.w + '×' + ref.h + '. This is the target look; ' +
        "it is not in the document.",
      image: { media_type: 'image/jpeg', data: ref.data, dataUrl: ref.dataUrl }
    };
  }
});

// The whole transcript is resent every step, so keep only the newest
// canvas images. (This edits earlier turns; the proxy tells the API to
// drop the affected thinking blocks rather than reject the request.)
// get_reference results are counted separately (newest one kept; the
// reference also stays in the first message, which is never trimmed).
function trimOldImages(messages) {
  var seen = 0, refSeen = 0;
  for (var i = messages.length - 1; i >= 0; i--) {
    var m = messages[i];
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (var j = m.content.length - 1; j >= 0; j--) {
      var block = m.content[j];
      if (block.type !== 'tool_result' || !Array.isArray(block.content)) continue;
      var isRef = agent.referenceResultIds.has(block.tool_use_id);
      for (var k = block.content.length - 1; k >= 0; k--) {
        if (block.content[k].type !== 'image') continue;
        if (isRef) {
          if (++refSeen > 1) block.content[k] = { type: 'text', text: '[earlier reference image removed; it is also in the first message]' };
        } else if (++seen > AGENT_KEEP_IMAGES) {
          block.content[k] = { type: 'text', text: '[earlier canvas image removed]' };
        }
      }
    }
  }
}

// Visible text plus any thinking summaries (Sonnet 5.5 returns most
// between-tool notes as thinking blocks)
function agentReplyText(content) {
  return (content || []).map(function(b) {
    if (b.type === 'text') return b.text;
    if (b.type === 'thinking' && b.thinking) return b.thinking;
    return '';
  }).filter(Boolean).join('\n\n');
}

// ── Panel actions ─────────────────────────────────────────
async function agentRunClicked() {
  if (agent.running) return;
  var request = document.getElementById('agent-request').value.trim();
  var reference = agent.reference;
  if (!request && reference) request = 'Match the style of the reference image.';
  if (!request) { agentLogNote('Type a request or choose a reference image first.', true); return; }
  if (!agentPass()) { agentLogNote('Enter the Agent Password first.', true); return; }

  document.getElementById('agent-log').innerHTML = '';
  agent.logText = ['PixelForge agent run · ' + new Date().toLocaleString(), 'Request: ' + request];
  if (reference) agent.logText.push('Reference: ' + reference.name);
  agentLogNote(document.getElementById('agent-critic').checked
    ? 'Critic on: the result must score ' + AGENT_PASS_SCORE + '+ before finishing.'
    : 'Critic off: the agent judges its own result.', false);
  if (reference) agentLogNote('Style reference: ' + reference.name, false);
  agent.running = true;
  agent.stopRequested = false;
  agentSyncButtons();
  try {
    await runAgent(request, document.getElementById('agent-critic').checked, reference);
  } catch (e) {
    agentLogNote('Run crashed: ' + e.message, true);
    if (agent.run) agent.run.stop_reason = 'error';
  }
  agent.running = false;
  agentSyncButtons();
  if (agent.run) {
    agentCardRunFinished(agent.run);
    agentLogVerdict(agent.run);
  }
}

// Thumbs up/down after a run: would you keep this result? Recorded in the
// run log and the agent card's tally; can be changed until the next run.
function agentLogVerdict(run) {
  var row = agentEl('div', 'agent-verdict');
  row.appendChild(agentEl('span', null, 'Keep this result?'));
  var buttons = [['up', '👍', 'Yes, keep it'], ['down', '👎', 'No']].map(function(v) {
    var b = agentEl('button', null, v[1]);
    b.type = 'button';
    b.setAttribute('aria-label', v[2]);
    b.setAttribute('aria-pressed', 'false');
    b.onclick = function() {
      if (run !== agent.run || run.verdict === v[0]) return;
      var prev = run.verdict || null;
      run.verdict = v[0];
      buttons.forEach(function(x) { x.setAttribute('aria-pressed', String(x === b)); });
      agent.logText.push('— Your verdict: ' + (v[0] === 'up' ? 'keep' : "don't keep"));
      agentCardVerdict(v[0], prev);
    };
    row.appendChild(b);
    return b;
  });
  var log = document.getElementById('agent-log');
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function agentStopClicked() {
  if (!agent.running) return;
  agent.stopRequested = true;
  agentLogNote('Stopping after the current step…', false);
}

function agentRevertClicked() {
  var cp = agent.checkpoint;
  if (!cp || agent.running) return;
  if (activeTab !== cp.tab) {
    agentLogNote('Revert run: switch back to the tab the run edited first.', true);
    return;
  }
  state.layers = snapshotLayers(cp.layers);
  state.activeLayer = Math.min(cp.activeLayer, state.layers.length - 1);
  if (state.docW !== cp.docW || state.docH !== cp.docH) initCanvasSize(cp.docW, cp.docH);
  renderAll();
  updateLayersPanel();
  pushHistory('Agent · revert run');
  agentLogNote('Reverted to the image before the run.', false);
}

function agentSaveClicked() {
  if (!agent.run) return;
  var blob = new Blob([JSON.stringify(agent.run, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.download = 'pixelforge-run-' + agent.run.started.replace(/[:.]/g, '-') + '.json';
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
}

async function agentCopyClicked() {
  if (!agent.logText.length) return;
  var text = agent.logText.join('\n') + '\n\n' + document.getElementById('agent-totals').textContent + '\n';
  var btn = document.getElementById('agent-copy');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Clipboard API unavailable (e.g. not a secure context): copy via a hidden textarea
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var copied = document.execCommand('copy');
    ta.remove();
    if (!copied) { agentLogNote('Could not copy the log: ' + e.message, true); return; }
  }
  btn.textContent = 'Copied';
  setTimeout(function() { btn.textContent = 'Copy log'; }, 1500);
}

// ── Reference image picker ────────────────────────────────
// Downscale to ≤800px JPEG (on white, for transparent images) and keep in memory
function agentReferenceChosen(e) {
  var file = e.target.files[0];
  e.target.value = '';
  if (!file || agent.running) return;
  if (file.type.indexOf('image/') !== 0) { agentLogNote("'" + file.name + "' isn't an image.", true); return; }
  var img = new Image();
  img.onload = function() {
    var scale = Math.min(1, 800 / Math.max(img.width, img.height));
    var c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    var cc = c.getContext('2d');
    cc.fillStyle = '#ffffff';
    cc.fillRect(0, 0, c.width, c.height);
    cc.drawImage(img, 0, 0, c.width, c.height);
    var dataUrl = c.toDataURL('image/jpeg', 0.85);
    agent.reference = { name: file.name, data: dataUrl.split(',')[1], dataUrl: dataUrl, w: c.width, h: c.height };
    URL.revokeObjectURL(img.src);
    agentRenderReference();
  };
  img.onerror = function() {
    URL.revokeObjectURL(img.src);
    agentLogNote("Couldn't read '" + file.name + "' as an image.", true);
  };
  img.src = URL.createObjectURL(file);
}

function agentReferenceCleared() {
  if (agent.running) return;
  agent.reference = null;
  agentRenderReference();
}

function agentRenderReference() {
  var ref = agent.reference;
  document.getElementById('agent-ref-empty').style.display = ref ? 'none' : '';
  document.getElementById('agent-ref-set').style.display = ref ? '' : 'none';
  if (ref) {
    document.getElementById('agent-ref-thumb').src = ref.dataUrl;
    document.getElementById('agent-ref-name').textContent = ref.name;
    document.getElementById('agent-ref-name').title = ref.name;
  }
}

// Kept in the input only; never written to storage
function agentPass() {
  return document.getElementById('agent-pass').value;
}

function agentSyncButtons() {
  document.getElementById('agent-run').classList.toggle('disabled', agent.running);
  document.getElementById('agent-stop').classList.toggle('disabled', !agent.running);
  document.getElementById('agent-revert').classList.toggle('disabled', agent.running || !agent.checkpoint);
  document.getElementById('agent-save').classList.toggle('disabled', agent.running || !agent.run);
  document.getElementById('agent-copy').classList.toggle('disabled', !agent.logText.length);
  document.getElementById('agent-critic').disabled = agent.running;
  document.getElementById('agent-ref').classList.toggle('locked', agent.running);
}

// ── Step log rendering ────────────────────────────────────
function agentEl(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function agentLogStep(step) {
  var log = document.getElementById('agent-log');
  var row = agentEl('div', 'agent-step');
  var u = step.usage || {};
  row.appendChild(agentEl('div', 'agent-step-head',
    'Step ' + step.n + ' · ' + (step.ms / 1000).toFixed(1) + 's · ' +
    (u.input_tokens || 0) + ' in / ' + (u.output_tokens || 0) + ' out'));
  if (step.text) row.appendChild(agentEl('div', 'agent-text', step.text));
  log.appendChild(row);
  agent.logText.push('', row.firstChild.textContent);
  if (step.text) agent.logText.push(step.text);
  log.scrollTop = log.scrollHeight;
  return row;
}

function agentLogToolCall(row, block, r) {
  var call = agentEl('div', 'agent-call');
  call.appendChild(agentEl('div', 'agent-call-name', block.name + ' ' + JSON.stringify(block.input || {})));
  call.appendChild(agentEl('div', 'agent-result' + (r.ok ? '' : ' error'), r.text.split('\n')[0]));
  if (r.review) {
    var badge = agentEl('div', 'agent-review ' + (r.review.passed ? 'pass' : 'fail'),
      'Critic ' + r.review.score + '/10 · ' + (r.review.passed ? 'pass' : 'needs ' + AGENT_PASS_SCORE));
    call.appendChild(badge);
    call.appendChild(agentEl('div', 'agent-critique', r.review.critique));
  }
  if (r.image) {
    var img = agentEl('img', 'agent-thumb');
    img.src = r.image.dataUrl;
    call.appendChild(img);
  }
  row.appendChild(call);
  var log = document.getElementById('agent-log');
  log.scrollTop = log.scrollHeight;

  var indent = function(t) { return t.split('\n').map(function(l) { return '    ' + l; }).join('\n'); };
  agent.logText.push('  → ' + block.name + ' ' + JSON.stringify(block.input || {}));
  agent.logText.push(indent((r.ok ? '' : '[error] ') + r.text));
  if (r.image) agent.logText.push('    [canvas image]');
}

function agentLogNote(text, isError) {
  var log = document.getElementById('agent-log');
  log.appendChild(agentEl('div', 'agent-note' + (isError ? ' error' : ''), text));
  log.scrollTop = log.scrollHeight;
  agent.logText.push((isError ? '[error] ' : '— ') + text);
  agentSyncButtons();
}

function agentUpdateTotals() {
  var t = agent.totals;
  var line = t.steps + ' steps · ' + t.input_tokens.toLocaleString() + ' in / ' +
    t.output_tokens.toLocaleString() + ' out';
  if (PRICE_IN != null && PRICE_OUT != null) {
    line += ' · $' + ((t.input_tokens * PRICE_IN + t.output_tokens * PRICE_OUT) / 1e6).toFixed(3);
  }
  if (t.reviews) {
    line += '\nCritic: ' + t.reviews + ' review' + (t.reviews > 1 ? 's' : '') + ' · ' +
      t.critic_input_tokens.toLocaleString() + ' in / ' + t.critic_output_tokens.toLocaleString() + ' out';
    if (PRICE_CRITIC_IN != null && PRICE_CRITIC_OUT != null) {
      line += ' · $' + ((t.critic_input_tokens * PRICE_CRITIC_IN + t.critic_output_tokens * PRICE_CRITIC_OUT) / 1e6).toFixed(3);
    }
  }
  document.getElementById('agent-totals').textContent = line;
}

function initAgentPanel() {
  document.getElementById('agent-request').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); agentRunClicked(); }
  });
  agentRenderReference();
  agentSyncButtons();
}
