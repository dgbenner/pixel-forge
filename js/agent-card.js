// ═══════════════════════════════════════════════════════════
//  AGENT CARDS: PANEL
//  One panel, two cards: the PixelForge Agent and Feature Quarry. Opened
//  from the "Agent cards" menu (or the ⓘ in the Agent panel for the
//  PixelForge card); closed by ✕, Esc, or choosing the open card again.
//  Wording comes from js/agent-card-data.js; everything that can be read
//  from the code is: tools, limits, models, runs. The PixelForge card's
//  live numbers come from the latest run and a tally in localStorage
//  ('pf-agent-stats'); Feature Quarry's from quarry/runs/index.json.
// ═══════════════════════════════════════════════════════════

var AGENT_STATS_KEY = 'pf-agent-stats';
var agentCardOpen = false;
var agentCardWhich = 'pixelforge';   // 'pixelforge' | 'quarry'
var agentCardQuarry = null;          // quarry/runs/index.json once loaded, or { error }
var agentCardStep = 0;   // "How a run works" opens on Request, the first step
var agentCardOpener = null;

// Tools that only read; everything else in a run counts as an edit
var AGENT_LOOK_TOOLS = ['get_document_info', 'get_canvas', 'get_reference'];

var AC_ICONS = {
  req: '<path d="M4 5h16v11H8l-4 4z"/>',
  look: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  act: '<path d="M14 4l6 6-10 10H4v-6z"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  review: '<path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6L12 16.4 6.6 19.3l1.3-6-4.5-4 6-.7z"/>',
  done: '<path d="M5 12l5 5 9-10"/>'
};
// Offsite links: the arrow-out-of-a-box icon is part of the link
var AC_EXT = '<svg class="ac-ext" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
function acLink(href, label) {
  return '<a href="' + acEsc(href) + '" target="_blank" rel="noopener">' + acEsc(label) + AC_EXT +
    '<span class="ac-sr"> (opens in a new tab)</span></a>';
}

// Landmark: a small round robot wherever the card talks about an agent
var AC_AGENT_MARK = '<span class="ac-agent-mark" aria-hidden="true"><img src="img/agent-card-pixelforge.png" alt="" width="38" height="40"></span>';

var AC_X = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ── Text helpers ──────────────────────────────────────────
function acEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Fill {STEPS}, {PASS}, {REVIEWS} from the agent's constants
function acFill(s) {
  return String(s)
    .replace(/\{STEPS\}/g, AGENT_MAX_STEPS)
    .replace(/\{PASS\}/g, AGENT_PASS_SCORE)
    .replace(/\{REVIEWS\}/g, AGENT_MAX_REVIEWS);
}

// "claude-sonnet-5-5" -> "Claude Sonnet 5.5"
function acModelName(id) {
  var m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(id || '');
  if (!m) return id;
  return 'Claude ' + m[1].charAt(0).toUpperCase() + m[1].slice(1) + ' ' + m[2] + (m[3] ? '.' + m[3] : '');
}

// Model chips: what the API reported in the latest run beats the written
// default, so the card shows the models that actually ran
function acChips() {
  var chips = AGENT_CARD.chips.slice();
  var run = agent.run;
  if (run && run.model) chips[0] = acModelName(run.model);
  var reviewed = run && run.reviews && run.reviews.filter(function(r) { return r.model; })[0];
  if (reviewed) chips[1] = 'Critic: ' + acModelName(reviewed.model).replace(/^Claude /, '');
  return chips;
}

function acCents(usd) {
  var c = usd * 100;
  return '≈ ' + (c < 1 ? c.toFixed(1) : Math.round(c)) + '¢';
}

// ── Run cost (null until the PRICE_* constants are set) ───
function agentRunCost(run) {
  if (!run || PRICE_IN == null || PRICE_OUT == null) return null;
  var t = run.totals;
  var usd = (t.input_tokens * PRICE_IN + t.output_tokens * PRICE_OUT) / 1e6;
  if (t.critic_input_tokens || t.critic_output_tokens) {
    if (PRICE_CRITIC_IN == null || PRICE_CRITIC_OUT == null) return null;
    usd += (t.critic_input_tokens * PRICE_CRITIC_IN + t.critic_output_tokens * PRICE_CRITIC_OUT) / 1e6;
  }
  return usd;
}

// ── Stats tally (localStorage; every access may fail) ─────
function agentStatsLoad() {
  var blank = { runs: 0, costTotal: 0, costRuns: 0, reviewedRuns: 0, firstPass: 0, toolErrors: 0, verdictUp: 0, verdictDown: 0 };
  try {
    var raw = localStorage.getItem(AGENT_STATS_KEY);
    if (!raw) return blank;
    var s = JSON.parse(raw);
    Object.keys(blank).forEach(function(k) { if (typeof s[k] !== 'number') s[k] = blank[k]; });
    return s;
  } catch (e) {
    return blank;
  }
}

function agentStatsSave(s) {
  try { localStorage.setItem(AGENT_STATS_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: tally stays per-page */ }
}

// Called once when a run ends (from agentRunClicked)
function agentCardRunFinished(run) {
  if (!run) return;
  var s = agentStatsLoad();
  s.runs++;
  var cost = agentRunCost(run);
  if (cost != null) { s.costTotal += cost; s.costRuns++; }
  if (run.reviews && run.reviews.length) {
    s.reviewedRuns++;
    if (run.reviews[0].passed) s.firstPass++;
  }
  run.steps.forEach(function(st) {
    st.tool_calls.forEach(function(c) { if (!c.ok) s.toolErrors++; });
  });
  agentStatsSave(s);
  agentCardRender();
}

// Called when you rate a run; vote is 'up' | 'down', prev is the earlier vote or null
function agentCardVerdict(vote, prev) {
  var s = agentStatsLoad();
  if (prev === 'up') s.verdictUp--;
  if (prev === 'down') s.verdictDown--;
  if (vote === 'up') s.verdictUp++;
  if (vote === 'down') s.verdictDown++;
  agentStatsSave(s);
  agentCardRender();
}

// ── Rendering ─────────────────────────────────────────────
function acTools() {
  var notes = AGENT_CARD.toolNotes;
  return AGENT_TOOLS.map(function(t) {
    return '<li><code>' + acEsc(t.name) + '</code>' + (notes[t.name] ? ' · ' + acEsc(notes[t.name]) : '') + '</li>';
  }).join('');
}

function acItems(rows) {
  return rows.map(function(r) {
    return '<button class="ac-it" type="button" aria-expanded="false"><span>' + acFill(r[0]) + '</span>' +
      '<span class="ac-plus" aria-hidden="true">+</span><span class="ac-more" hidden>' + acFill(r[1]) + '</span></button>';
  }).join('');
}

// The latest run this session, or the example
function acRunData() {
  var run = agent.run;
  if (!run || !run.steps.length) {
    var ex = AGENT_CARD.exampleRun;
    return { label: ex.label, request: ex.request, look: ex.look, edit: ex.edit, review: ex.review,
             steps: ex.steps, firstReview: ex.firstReview, cost: ex.cost, example: true };
  }
  var d = { look: 0, edit: 0, review: 0 };
  run.steps.forEach(function(st) {
    st.tool_calls.forEach(function(c) {
      if (c.name === 'request_review') d.review++;
      else if (AGENT_LOOK_TOOLS.indexOf(c.name) >= 0) d.look++;
      else d.edit++;
    });
  });
  var cost = agentRunCost(run);
  d.label = 'Latest run · ' + new Date(run.started).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
    (agent.running ? ' · running' : '');
  d.request = run.request;
  d.steps = run.steps.length;
  d.firstReview = run.reviews && run.reviews.length ? run.reviews[0].score + '/10' : (run.critic ? '—' : 'off');
  d.cost = cost == null ? '—' : acCents(cost);
  return d;
}

function acRunHTML() {
  var r = acRunData();
  var total = r.look + r.edit + r.review;
  var seg = function(n, color, word) {
    return n ? '<div class="ac-seg" style="flex:' + n + ';background:var(' + color + ')">' + n + ' ' + word + '</div>' : '';
  };
  var bar = total
    ? '<div class="ac-bar" role="img" aria-label="Of ' + total + ' tool calls: ' + r.look + ' looking, ' + r.edit + ' editing, ' + r.review + ' critic reviews">' +
      seg(r.look, '--lock', 'look') + seg(r.edit, '--accent', 'edit') + seg(r.review, '--judge', 'review') + '</div>'
    : '<p class="ac-dim">No tool calls in this run.</p>';
  return '<div class="ac-sh"><h2>A real run</h2><small>' + acEsc(r.label) + '</small></div>' +
    '<p class="ac-req">"' + acEsc(r.request) + '"</p>' + bar +
    '<div class="ac-legend"><span><i style="background:var(--lock)"></i>Reads the canvas</span>' +
    '<span><i style="background:var(--accent)"></i>Changes layers</span><span><i style="background:var(--judge)"></i>Critic scores it</span></div>' +
    '<div class="ac-runmeta"><div class="ac-rm"><b>' + r.steps + '</b><span>steps</span></div>' +
    '<div class="ac-rm"><b>' + acEsc(r.firstReview) + '</b><span>first review</span></div>' +
    '<div class="ac-rm"><b>' + acEsc(r.cost) + '</b><span>cost</span></div></div>';
}

function acHealthHTML() {
  var s = agentStatsLoad();
  var pct = function(a, b) { return Math.round(100 * a / b) + '%'; };
  var cell = function(value, label, note) {
    return '<div class="ac-h' + (value === '—' ? ' ac-empty' : '') + '"><b>' + value + '</b><span>' + label + '</span><small>' + note + '</small></div>';
  };
  var rated = s.verdictUp + s.verdictDown;
  return cell(s.costRuns ? acCents(s.costTotal / s.costRuns) : '—', 'Cost per run',
              s.costRuns ? 'average of ' + s.costRuns + ' run' + (s.costRuns > 1 ? 's' : '') : (s.runs ? 'set the prices in js/agent.js' : 'no runs yet')) +
    cell(s.reviewedRuns ? pct(s.firstPass, s.reviewedRuns) : '—', 'First-review pass rate',
         s.reviewedRuns ? s.firstPass + ' of ' + s.reviewedRuns + ' reviewed runs' : 'passes critic without rework') +
    cell(rated ? pct(s.verdictUp, rated) : '—', 'Your verdict',
         rated ? s.verdictUp + ' of ' + rated + ' rated runs kept' : 'runs you’d keep ÷ runs') +
    cell(s.runs ? (s.toolErrors / s.runs).toFixed(1) : '—', 'Tool errors',
         s.runs ? s.toolErrors + ' in ' + s.runs + ' run' + (s.runs > 1 ? 's' : '') : 'per run');
}

function agentCardRender() {
  var root = document.getElementById('agent-card-body');
  if (!root) return;
  document.getElementById('agent-card-label').textContent =
    'Agent card · ' + (agentCardWhich === 'quarry' ? FEATURE_QUARRY_CARD.title : AGENT_CARD.title);
  if (agentCardWhich === 'quarry') { acRenderQuarry(root); acWireItems(root); return; }
  var c = AGENT_CARD;
  var step = c.steps[agentCardStep];
  root.innerHTML =
    '<header class="ac-head">' +
      '<div class="ac-badge" aria-hidden="true"><img src="img/agent-card-pixelforge.png" alt="" width="38" height="40"></div>' +
      '<div><h1 id="agent-card-title">' + acEsc(c.title) + '</h1><p>' + acEsc(c.summary) + '</p></div>' +
      '<div class="ac-chips"><span class="ac-chip ac-live">Live</span>' + acChips().map(function(t) { return '<span class="ac-chip">' + acEsc(t) + '</span>'; }).join('') + '</div>' +
    '</header>' +
    '<div class="ac-glance">' + c.glance.map(function(g) { return '<div class="ac-g"><b>' + acFill(g[0]) + '</b><span>' + acEsc(g[1]) + '</span></div>'; }).join('') + '</div>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>How a run works</h2><small>Click a step</small></div>' +
      // Tabs: the selected step joins the detail panel below it
      '<div class="ac-steps" role="tablist" aria-label="How a run works">' + c.steps.map(function(s, i) {
        var on = i === agentCardStep;
        return '<button class="ac-st" type="button" role="tab" id="ac-step-' + i + '" data-i="' + i + '" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" aria-controls="agent-card-detail">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' + AC_ICONS[s.k] + '</svg><b>' + acEsc(s.t) + '</b></button>';
      }).join('') + '</div>' +
      '<div class="ac-detail" id="agent-card-detail" role="tabpanel" aria-labelledby="ac-step-' + agentCardStep + '"><b class="ac-detail-label">' + acEsc(step.t) + ':</b> ' + acFill(step.d) + '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Locked vs Judged <span class="ac-paren ac-paren-mixed">(Hard Rules vs Model Judgment)</span></h2></div><div class="ac-split">' +
      '<div class="ac-col ac-lock"><div class="ac-ch"><h3>Hard Rules</h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><small>same every run</small></div>' +
        '<p>The tools refuse anything that breaks these, and say why.</p><div class="ac-items">' + acItems(c.locked) + '</div></div>' +
      '<div class="ac-col ac-judge"><div class="ac-ch"><h3>Model Judgment</h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><small>can vary</small></div>' +
        '<p>Taste and interpretation. Every call and its reasoning shows in the step log.</p><div class="ac-items">' + acItems(c.judged) + '</div></div>' +
    '</div></section>' +
    '<section class="ac-sect" id="agent-card-run">' + acRunHTML() + '</section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Run Modes</h2></div><div class="ac-modes">' +
      c.modes.map(function(m) { return '<div class="ac-mode"><b class="ac-agent-name">' + (m[2] ? AC_AGENT_MARK : '') + acEsc(m[0]) + '</b><span>' + acEsc(acFill(m[1])) + '</span></div>'; }).join('') + '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>What It Never Does</h2></div><div class="ac-nevers">' +
      c.never.map(function(n) { return '<div class="ac-nv">' + AC_X + '<span>' + acEsc(n) + '</span></div>'; }).join('') + '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>How we know it’s good</h2><small>Fills in from run logs</small></div>' +
      '<div class="ac-health">' + acHealthHTML() + '</div></section>' +
    '<div><details><summary>Tools (' + AGENT_TOOLS.length + ')</summary><ul class="ac-list">' + acTools() + '</ul></details>' +
      '<details><summary>Changelog</summary><ul class="ac-list">' + c.changelog.map(function(l) { return '<li>' + acEsc(l) + '</li>'; }).join('') + '</ul></details></div>' +
    '<div class="ac-foot">' + c.foot.map(function(f) { return '<span>' + acEsc(f) + '</span>'; }).join('') + '</div>';

  var pickStep = function(i) {
    agentCardStep = (i + c.steps.length) % c.steps.length;
    agentCardRender();
    root.querySelector('.ac-st[data-i="' + agentCardStep + '"]').focus();
  };
  root.querySelectorAll('.ac-st').forEach(function(b) {
    b.onclick = function() { pickStep(+b.dataset.i); };
    b.onkeydown = function(e) {   // tab keys: arrows move, Home/End jump
      var i = +b.dataset.i;
      if (e.key === 'ArrowRight') pickStep(i + 1);
      else if (e.key === 'ArrowLeft') pickStep(i - 1);
      else if (e.key === 'Home') pickStep(0);
      else if (e.key === 'End') pickStep(c.steps.length - 1);
      else return;
      e.preventDefault();
    };
  });
  acWireItems(root);
}

// Expandable rows in "Locked vs judged"
function acWireItems(root) {
  root.querySelectorAll('.ac-it').forEach(function(b) {
    b.onclick = function() {
      var m = b.querySelector('.ac-more'), opening = m.hidden;
      m.hidden = !opening;
      b.setAttribute('aria-expanded', opening);
      b.querySelector('.ac-plus').textContent = opening ? '−' : '+';
    };
  });
}

// ── Feature Quarry card ───────────────────────────────────
// Run facts come from quarry/runs/index.json, the file each run adds itself to
function acLoadQuarryRuns() {
  return fetch('quarry/runs/index.json', { cache: 'no-store' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(idx) {
      var runs = (idx.runs || []).slice().sort(function(a, b) { return a.run < b.run ? 1 : -1; });
      agentCardQuarry = { runs: runs };
    })
    .catch(function(e) { agentCardQuarry = { error: e.message }; })
    .then(function() { if (agentCardOpen && agentCardWhich === 'quarry') agentCardRender(); });
}

function acFmtRunDate(id) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(id || '');
  if (!m) return id;
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function acQuarryLive() {
  var q = agentCardQuarry;
  var empty = function(v) { return [[v, 'Runs'], [v, 'Latest Run'], [v, 'Candidates'], [v, 'Picked']]; };
  if (!q) return { status: [['Status', 'Loading runs…']], glance: empty('…'), latest: null };
  if (q.error) return { status: [['Status', "Couldn't read quarry/runs/index.json (" + q.error + ')']], glance: empty('—'), latest: null };
  var latest = q.runs[0];
  if (!latest) return { status: [['Status', 'Live, ready to run with /feature-quarry'], ['Runs Completed', '0']], glance: [['0', 'Runs'], ['—', 'Latest Run'], ['—', 'Candidates'], ['—', 'Picked']], latest: null };
  var n = q.runs.length;
  return {
    // "Live" = the skill is installed in this repo; runs come from the run history in quarry/runs/
    status: [['Status', 'Live, ready to run with /feature-quarry'], ['Runs Completed', String(n)], ['Latest Run', acFmtRunDate(latest.run)]],
    glance: [[String(n), n === 1 ? 'Run' : 'Runs'], [acFmtRunDate(latest.run).replace(/, \d{4}$/, ''), 'Latest Run'],
             [String(latest.candidates_considered), 'Candidates'], [String(latest.counts ? latest.counts.picked : '—'), 'Picked']],
    latest: latest
  };
}

function acRenderQuarry(root) {
  var c = FEATURE_QUARRY_CARD, live = acQuarryLive(), L = live.latest;
  var list = function(rows) { return '<ul class="ac-list">' + rows.map(function(r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'; };
  var counts = L && L.counts
    ? '<div class="ac-bar" role="img" aria-label="Latest run: ' + L.counts.picked + ' picked, ' + L.counts.waiting + ' waiting, ' + L.counts.later + ' later, ' + L.counts.rejected + ' rejected">' +
        ['picked:--accent', 'waiting:--lock', 'later:--judge', 'rejected:--no'].map(function(k) {
          var key = k.split(':')[0], n = L.counts[key];
          return n ? '<div class="ac-seg" style="flex:' + n + ';background:var(' + k.split(':')[1] + ')">' + n + ' ' + key + '</div>' : '';
        }).join('') + '</div>'
    : '';
  root.innerHTML =
    '<header class="ac-head">' +
      '<div class="ac-badge" aria-hidden="true"><img src="img/agent-card-pixelforge.png" alt="" width="38" height="40"></div>' +
      '<div><h1 id="agent-card-title">' + acEsc(c.title) + '</h1><p>' + acEsc(c.summary) + '</p></div>' +
      '<div class="ac-chips"><span class="ac-chip ac-live">Live</span>' + c.chips.map(function(t) { return '<span class="ac-chip">' + acEsc(t) + '</span>'; }).join('') + '</div>' +
    '</header>' +
    '<div class="ac-glance">' + live.glance.map(function(g) { return '<div class="ac-g"><b>' + acEsc(g[0]) + '</b><span>' + acEsc(g[1]) + '</span></div>'; }).join('') + '</div>' +
    '<p class="ac-status">' + live.status.map(function(s) { return '<span class="ac-pair"><b>' + acEsc(s[0]) + ':</b> ' + acEsc(s[1]) + '</span>'; }).join(' · ') + '</p>' +
    (L ? '<section class="ac-sect"><div class="ac-sh"><h2>Latest run</h2><small>' + acEsc(acFmtRunDate(L.run)) + '</small></div>' + counts +
      '<div class="ac-links">' + acLink('quarry/index.html#' + encodeURIComponent(L.run), 'Open the Board') +
      (L.report ? acLink(L.report.replace(/\.md$/, '.html'), 'Read the Report') : '') + '</div></section>' : '') +
    '<section class="ac-sect"><div class="ac-sh"><h2>Trigger</h2></div><p class="ac-dim" style="color:var(--text)">' + c.trigger + '</p></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Agents</h2></div><div class="ac-agents">' +
      c.agents.map(function(a) { return '<div class="ac-mode"><b class="ac-agent-name">' + AC_AGENT_MARK + acEsc(a[0]) + '</b><span>' + acEsc(a[1]) + '</span></div>'; }).join('') + '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Researcher Reads</h2></div>' + list(c.reads) + '</section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Locked vs Judged <span class="ac-paren ac-paren-mixed">(Hard Rules vs Model Judgment)</span></h2></div><div class="ac-split">' +
      '<div class="ac-col ac-lock"><div class="ac-ch"><h3>Hard Rules</h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><small>every run</small></div>' +
        '<div class="ac-items">' + acItems(c.locked) + '</div></div>' +
      '<div class="ac-col ac-judge"><div class="ac-ch"><h3>Model Judgment</h3><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><small>can vary</small></div>' +
        '<div class="ac-items">' + acItems(c.judged) + '</div></div>' +
    '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>Output</h2></div>' + list(c.output) + '</section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>What It Never Does</h2></div><div class="ac-nevers">' +
      c.never.map(function(n) { return '<div class="ac-nv">' + AC_X + '<span>' + acEsc(n) + '</span></div>'; }).join('') + '</div></section>' +
    '<section class="ac-sect"><div class="ac-sh"><h2>How we know it’s good</h2><small>after each run</small></div>' + list(c.good.map(acEsc)) +
      '<p class="ac-dim">' + c.goodNote + '</p></section>' +
    '<div><details><summary>Changelog</summary>' + list(c.changelog.map(acEsc)) + '</details>' +
      '<details><summary>Files</summary><ul class="ac-list">' + c.files.map(function(f) { return '<li>' + acEsc(f[0]) + ': <code>' + acEsc(f[1]) + '</code></li>'; }).join('') + '</ul></details></div>' +
    '<div class="ac-foot">' + c.foot.map(function(f) { return '<span>' + acEsc(f) + '</span>'; }).join('') + '</div>';
}

// ── Open / close ──────────────────────────────────────────
// ⓘ in the Agent panel: the PixelForge card
function agentCardToggle(e) {
  if (e) e.stopPropagation();           // the ⓘ sits inside a collapsible panel header
  agentCardShow('pixelforge', e && e.currentTarget);
}

// From the menu or the ⓘ: open that card; choosing the open card again closes it
// (The menu closes itself: the click bubbles to its .menu-item toggle, like every other menu item.)
function agentCardShow(which, opener) {
  if (agentCardOpen && agentCardWhich === which) { agentCardSetOpen(false); return; }
  agentCardWhich = which;
  if (which === 'quarry') acLoadQuarryRuns();
  agentCardSetOpen(true, opener);
}

function agentCardSetOpen(open, opener) {
  agentCardOpen = open;
  var card = document.getElementById('agent-card');
  card.classList.toggle('open', open);
  card.setAttribute('aria-hidden', String(!open));
  card.inert = !open;
  document.getElementById('agent-card-info').setAttribute('aria-expanded', String(open && agentCardWhich === 'pixelforge'));
  document.querySelectorAll('#menu-agents .dd-item').forEach(function(el) {
    el.setAttribute('aria-current', String(open && el.dataset.card === agentCardWhich));
  });
  if (open) {
    agentCardOpener = opener || document.getElementById('menu-agents');
    agentCardRender();
    document.getElementById('agent-card-body').scrollTop = 0;
    document.getElementById('agent-card-close').focus();
  } else if (agentCardOpener && card.contains(document.activeElement)) {
    agentCardOpener.focus();
  }
}

function initAgentCard() {
  agentCardRender();
  agentCardSetOpen(false);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && agentCardOpen && !document.getElementById('modal-overlay').classList.contains('open')) {
      agentCardSetOpen(false);
    }
  });
}
