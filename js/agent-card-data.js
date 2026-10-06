// ═══════════════════════════════════════════════════════════
//  AGENT CARD: CONTENT
//  Everything the agent card says lives here; js/agent-card.js renders
//  it. When the agent changes, update this file and AGENT-CARD.md
//  together, and add a changelog line to both.
//
//  {STEPS}, {PASS} and {REVIEWS} are filled in from the constants in
//  js/agent.js when the card renders. The tool list is built from
//  AGENT_TOOLS at render time, so it always matches the code; TOOL_NOTES
//  only adds a short description per tool. Model names must match the
//  proxy (pixelforge-agent/api/agent.js: MODEL, CRITIC_MODEL).
// ═══════════════════════════════════════════════════════════

var AGENT_CARD = {
  title: 'PixelForge Agent',
  summary: "Edits the open image from a plain-language request, using PixelForge's own tools one step at a time, and checks its work.",
  chips: ['Claude Sonnet 5.5', 'Critic: Haiku 4.5', 'Updated Oct 6'],

  glance: [
    ['{STEPS}', 'Step Limit'],
    ['{PASS}/10', 'Critic Pass Mark'],
    ['1', 'Click Reverts a Run'],
    ['0', 'Pixels It Paints Itself']
  ],

  steps: [
    { k: 'req', t: 'Request', d: 'You type what you want, like <b>"make this feel lonelier"</b>, and press Run. A snapshot is taken first so the whole run can be reverted.' },
    { k: 'look', t: 'Look', d: 'It reads the layer list and looks at a shrunken copy of the image before touching anything.' },
    { k: 'act', t: 'Edit', d: 'It calls PixelForge\'s tools with specific values, like saturation 35. <b>Each change lands as a labeled History entry: "Agent · …".</b>' },
    { k: 'check', t: 'Check', d: 'It looks at the canvas again and decides whether the change worked, then adjusts or moves on.' },
    { k: 'review', t: 'Review', d: 'With the critic on, a separate model scores the result against your request without seeing the agent\'s reasoning. <b>Under {PASS}/10 sends it back.</b>' },
    { k: 'done', t: 'Done', d: 'It finishes with two or three sentences on what it did and anything it couldn\'t do.' }
  ],

  // [title, detail]
  locked: [
    ['Layers by Name', "Never by position, so it can't grab the wrong one."],
    ['Inputs Checked First', 'Out-of-range values are refused before anything changes.'],
    ['Errors Say What to Fix', '"No layer named \'Sky\'. Layers are: …" Bugs say "don\'t retry".'],
    ['One History Entry per Change', 'Every edit is labeled and undoable.'],
    ['Deletes Only Its Own Layers', 'Layers that existed before the run can only be hidden.'],
    ['Original Pixels Untouched', 'Adjustments, effects and color balance only work on layers it made this run, so it duplicates yours first. It can still hide your layers or change their opacity or blend mode, which is reversible.'],
    ['{STEPS}-Step Limit', 'Stops a confused run from spending.'],
    ['Review Before Finishing', "With the critic on, it can't finish without a score of {PASS}/10 or better, up to {REVIEWS} reviews. If the critic can't be reached, it may finish and must say the result wasn't reviewed."],
    ['Model and Key on the Server', "The browser can't change the model or see the key."]
  ],

  judged: [
    ['Which Tools, in What Order', 'Its plan for the request.'],
    ['The Numbers', '"A lot" becomes saturation 30; "a little" around 75.'],
    ['Whether It Looks Right', 'Looking at its own result and deciding to adjust.'],
    ["When It's Done", 'Stopping when the request seems met.'],
    ["The Critic's Score", "A second model's judgment. Watch for scores that land right on the pass mark."]
  ],

  // [name, description, true to show the robot landmark before the name]
  modes: [
    ['Critic On', 'A second model scores the result against your request. Under {PASS} sends it back to work, up to {REVIEWS} reviews.'],
    ['Critic Off', "The agent judges its own result and finishes when it's satisfied."],
    ['Style Reference', 'Pick a reference image and it matches its color, contrast, tone and mood. The critic grades against the reference too.']
  ],

  never: [
    "Paints or generates pixels. It only uses PixelForge's tools.",
    'Selects an area. Every tool works on whole layers.',
    "Deletes a layer it didn't create.",
    'Runs without you pressing Run.',
    "Keeps your image on a server. The proxy passes copies to Anthropic's API and saves nothing itself."
  ],

  // Short description per tool; the list itself comes from AGENT_TOOLS.
  toolNotes: {
    get_document_info: 'size and layer stack',
    get_canvas: 'sees the image (800px max)',
    get_reference: 'sees the style reference (only when one is set)',
    duplicate_layer: 'copies a layer',
    add_layer: 'new empty or solid-color layer',
    delete_layer: 'removes a layer it made this run',
    set_layer_props: 'blend mode, opacity, visibility',
    apply_adjustments: 'hue, saturation, brightness, contrast, blur, sharpen',
    apply_effect: 'pixelate, posterize, grain, grayscale, invert',
    color_balance: 'tint shadows and highlights',
    add_gradient_layer: 'vignettes and fades',
    add_text: 'a line of text on its own layer',
    request_review: 'asks the critic (only with the critic on)'
  },

  // Shown under "A real run" until a run happens in this session.
  // From the Oct 5 run log: 9 tool calls, ~$0.066 director + ~$0.002 critic.
  exampleRun: {
    label: 'Example · Oct 5',
    request: 'Make this feel lonelier',
    look: 3, edit: 4, review: 1, steps: 5, firstReview: '7/10', cost: '≈ 7¢'
  },

  changelog: [
    'Oct 6 · Agent card added to the editor',
    'Oct 5 · Gradient tool fixed (cached file); unexpected errors now say "don\'t retry"',
    'Oct 4 · Text, style reference, critic on/off and the duplicate-first guard added',
    'Oct 4 · Critic added (Haiku, 7/10, max 3 reviews)',
    'Oct 4 · Delete, grain, gradients, color balance added',
    'Oct 4 · Sharpen math fixed (images went dark at high strength)',
    'Oct 4 · First live runs'
  ],

  foot: ['Spec: pixelforge-agent-build-spec.md', 'Owner: Dan Benner']
};

// ── Feature Quarry ────────────────────────────────────────
// Source of truth: .claude/skills/feature-quarry/SKILL.md (process and
// rules) and quarry/runs/index.json (runs). Run count, latest run and its
// counts are read live from the run index; the wording below must match
// the skill. Mirror: FEATURE-QUARRY-CARD.md (update both, with a
// changelog line).
var FEATURE_QUARRY_CARD = {
  title: 'Feature Quarry',
  summary: 'Researches what PixelForge should build next and recommends 5–6 features, with evidence and a build plan for each.',
  chips: ['Claude Code skill', 'Researcher + judge', 'Updated Oct 6'],
  trigger: 'Dan types <code>/feature-quarry</code> in Claude Code, in the pixel-forge folder. Use the repo version, not the account copy.',
  reads: [
    "PixelForge's code: what exists, what's partial, what's broken.",
    '<code>criteria.md</code>: Dan\'s definition of "better" for PixelForge.',
    "Earlier runs in <code>quarry/runs/</code>, so it doesn't re-propose what's built or rejected.",
    'Photoshop documentation, forums (Adobe Community, PhotoshopGurus) and modern editors (Photopea, Affinity, Pixelmator).'
  ],
  agents: [
    ['Researcher', 'Inventories the code, searches, scores 15–25 candidates.'],
    ['Judge (separate)', "Picks 5–6 using only the criteria, inventory and evidence. Never sees the researcher's reasoning."]
  ],
  locked: [
    ['Research Only', "Never changes PixelForge's code."],
    ['Real Links', 'Every rating needs at least one real link from this run.'],
    ['Foundations First', 'At least one missing foundation is picked, if any exist.'],
    ['Every Rejection Explained', 'Every rejected candidate gets a reason.'],
    ['Runs Kept', 'Each run is saved as its own file; earlier runs are never overwritten.']
  ],
  judged: [
    ['Framing', 'Each feature as a job ("hide part of a layer without erasing it"), not a menu item.'],
    ['Ratings', 'Weight, Demand, Pain (High / Medium / Low). Proxies from public writing, not usage data.'],
    ['The Picks', 'How each candidate fits the criteria, and which win.']
  ],
  output: [
    'A dated report in <code>quarry/</code>.',
    'The run added to the Feature Quarry page: a board of picked, waiting, later and rejected features. Each opens into overview, approach, evidence and build tabs, plus <b>Export spec</b> (copy or download a build spec for Claude Code).'
  ],
  never: [
    "Measures real usage. Adobe doesn't publish it.",
    "Decides whether a feature is worth having. That's Dan's call.",
    'Builds anything. Dan exports a spec and gives it to Claude Code.'
  ],
  good: [
    "Did it show something Dan didn't know?",
    'Would Dan build at least one card?',
    'Did it save time versus researching by hand?'
  ],
  goodNote: 'Fix the weak spot in <code>criteria.md</code> first; change the skill only if the process is wrong.',
  changelog: [
    'Oct 6 · Card added to the editor\'s Agent cards menu',
    'Oct 5 · Run history and Export spec added to the page',
    'Oct 4 · First run: 21 candidates, 6 picked (masks, editable adjustments, transform, background removal, edge refinement, color matching)',
    'Open · "Never" rule misused for blocked ideas; add "Waiting on: <foundation>" to criteria.md'
  ],
  files: [
    ['Skill', '.claude/skills/feature-quarry/SKILL.md'],
    ['Criteria', '.claude/skills/feature-quarry/criteria.md'],
    ['Runs', 'quarry/runs/'],
    ['Page', 'quarry/index.html']
  ],
  foot: ['Owner: Dan Benner']
};
