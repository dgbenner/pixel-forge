# Agent Card: Feature Quarry

**Project:** PixelForge · **Owner:** Dan Benner · **Last updated:** 2026-10-06
**Status:** Live. The in-app card (**Agent cards › Feature Quarry** in the editor's menu bar) reads
the run count and latest run from `quarry/runs/index.json`. Its wording lives in
`js/agent-card-data.js` (`FEATURE_QUARRY_CARD`); update it and this file together, with a changelog
line in both. The skill (`.claude/skills/feature-quarry/SKILL.md`) is the source of truth.

## Job
Researches what PixelForge should build next and recommends 5–6 features, with evidence and a build plan for each.

## Trigger
Dan types `/feature-quarry` in Claude Code, in the pixel-forge folder. Use the repo version, not the account copy.

## Researcher reads
- PixelForge's code: what exists, what's partial, what's broken.
- `criteria.md`: Dan's definition of "better" for PixelForge.
- Earlier runs in `quarry/runs/`, so it doesn't re-propose what's built or rejected.
- Photoshop documentation, forums (Adobe Community, PhotoshopGurus) and modern editors (Photopea, Affinity, Pixelmator).

## Agents
| Agent | Role |
|---|---|
| Researcher | Inventories the code, searches, scores 15–25 candidates |
| Judge (separate) | Picks 5–6 using only the criteria, inventory and evidence. Never sees the researcher's reasoning. |

## Hard rules (always)
- Research only. Never changes PixelForge's code.
- Every rating needs at least one real link from this run.
- At least one missing foundation is picked, if any exist.
- Every rejected candidate gets a reason.
- Each run is saved as its own file; earlier runs are never overwritten.

## Model judgment (can vary run to run)
- Framing each feature as a job ("hide part of a layer without erasing it"), not a menu item.
- Ratings: Weight, Demand, Pain (High / Medium / Low). These are proxies from public writing, not usage data.
- How each candidate fits the criteria, and which win.

## Output
- A dated report in `quarry/`.
- The run added to the Feature Quarry page (`quarry/index.html`): board of picked, waiting, later and rejected features. Each opens into overview, approach, evidence and build tabs, plus **Export spec** (copy or download a build spec for Claude Code).

## Can't / won't
- Can't measure real usage; Adobe doesn't publish it.
- Can't judge whether a feature is worth having; that's Dan's call.
- Doesn't build anything. Dan exports a spec and gives it to Claude Code.

## How we know it's good
After each run:
- Did it show something Dan didn't know?
- Would Dan build at least one card?
- Did it save time versus researching by hand?
Fix the weak spot in `criteria.md` first; change the skill only if the process is wrong.

## Changelog
- 2026-10-06: Card added to the editor's Agent cards menu.
- 2026-10-04: First run. 21 candidates, 6 picked (masks, editable adjustments, transform, background removal, edge refinement, color matching).
- 2026-10-05: Run history and Export spec added to the page.
- Open: "Never" rule misused for blocked ideas; add "Waiting on: <foundation>" to `criteria.md`.

## Files
Skill: `.claude/skills/feature-quarry/SKILL.md` · Criteria: `.claude/skills/feature-quarry/criteria.md` · Runs: `quarry/runs/` · Page: `quarry/index.html`
