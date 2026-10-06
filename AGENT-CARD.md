# PixelForge Agent — agent card

The in-app version is under **Agent cards › PixelForge Agent** in the editor's menu bar (or the ⓘ
in the Agent panel). The code is the source of truth: the card builds its tool list from `AGENT_TOOLS` and its
limits from the constants in `js/agent.js`. Its wording lives in `js/agent-card-data.js`. When the
agent changes, update that file and this one together, with a changelog line in both.

Edits the open image from a plain-language request, using PixelForge's own tools one step at a time,
and checks its work.

- **Agent model:** Claude Sonnet 5.5 (`MODEL` in `pixelforge-agent/api/agent.js`)
- **Critic model:** Claude Haiku 4.5, temperature 0 (`CRITIC_MODEL`)
- **Step limit:** 15 (`AGENT_MAX_STEPS`)
- **Critic pass mark:** 7/10 (`AGENT_PASS_SCORE`), up to 3 reviews (`AGENT_MAX_REVIEWS`)

## How a run works

1. **Request.** You type what you want and press Run. A snapshot is taken first so the whole run can be reverted.
2. **Look.** It reads the layer list and looks at a shrunken copy of the image before touching anything.
3. **Edit.** It calls PixelForge's tools with specific values. Each change lands as a labeled History entry: "Agent · …".
4. **Check.** It looks at the canvas again and decides whether the change worked.
5. **Review.** With the critic on, a separate model scores the result against your request without seeing the agent's reasoning. Under 7/10 sends it back.
6. **Done.** It finishes with two or three sentences on what it did and anything it couldn't do.

## Hard rules: locked by code (same every run)

- **Layers by name**, never by position.
- **Inputs checked first.** Out-of-range values are refused before anything changes.
- **Errors say what to fix.** Bugs say "don't retry".
- **One History entry per change.**
- **Deletes only its own layers.** Layers that existed before the run can only be hidden.
- **Original pixels untouched.** Adjustments, effects and color balance only work on layers it made this run, so it duplicates yours first. It can still hide your layers or change their opacity or blend mode, which is reversible.
- **15-step limit.**
- **Review before finishing.** With the critic on, it can't finish without 7/10 or better, up to 3 reviews. If the critic can't be reached, it may finish and must say the result wasn't reviewed.
- **Model and key on the server.** The browser can't change the model or see the key.

## Model judgment (can vary)

Which tools and in what order; the numbers it picks; whether a result looks right; when it's done;
the critic's score.

## Run modes

- **Critic on:** a second model scores the result; under 7 sends it back, up to 3 reviews.
- **Critic off:** the agent judges its own result.
- **Style reference:** it matches a reference image's color, contrast, tone and mood; the critic grades against the reference too.

## What it never does

- Paints or generates pixels. It only uses PixelForge's tools.
- Selects an area. Every tool works on whole layers.
- Deletes a layer it didn't create.
- Runs without you pressing Run.
- Keeps your image on a server. The proxy passes copies to Anthropic's API and saves nothing itself.

## Tools (13)

`get_document_info`, `get_canvas`, `get_reference` (only with a style reference), `duplicate_layer`,
`add_layer`, `delete_layer`, `set_layer_props`, `apply_adjustments`, `apply_effect`, `color_balance`,
`add_gradient_layer`, `add_text`, `request_review` (only with the critic on).

## How we know it's good

The card shows the latest run (look / edit / review calls, steps, first review score, cost) and a
running tally kept in the browser (`localStorage` key `pf-agent-stats`): cost per run, first-review
pass rate, your thumbs-up rate, and tool errors per run. Cost shows "—" until `PRICE_IN`, `PRICE_OUT`,
`PRICE_CRITIC_IN` and `PRICE_CRITIC_OUT` are set in `js/agent.js`.

## Changelog

- Oct 6 · Agent card added to the editor, under the Agent cards menu
- Oct 5 · Gradient tool fixed (cached file); unexpected errors now say "don't retry"
- Oct 4 · Text, style reference, critic on/off and the duplicate-first guard added
- Oct 4 · Critic added (Haiku, 7/10, max 3 reviews)
- Oct 4 · Delete, grain, gradients, color balance added
- Oct 4 · Sharpen math fixed (images went dark at high strength)
- Oct 4 · First live runs
