---
name: feature-quarry
description: Research which features PixelForge should add next. Mines documentation, tutorials and forums about Photoshop and modern editors, checks them against PixelForge's code and criteria, and produces 5–6 scored option cards plus a rejected list. Research only; never changes code. Use when Dan runs /feature-quarry or asks what to build next for PixelForge.
---

# Feature Quarry

Produce a report of the 5–6 best next features for PixelForge, with evidence. **Do not change any
code.** This skill researches and recommends; Dan decides and builds separately.

Read `criteria.md` in this folder first. It defines what "better" means for PixelForge, and every
judgment in this run is made against it.

## Step 1: Inventory PixelForge

Read the PixelForge code (`index.html`, `js/`, the agent tools). List what exists, with a status for each:

- **Working:** does its job
- **Partial:** exists but limited (e.g. selections that can't be used as masks)
- **Broken:** known bugs (check the README's notes too)

Note the **foundations**: selections, masks, adjustment layers, non-destructive editing, presets.
Many features depend on these, so they matter more than individual tools.

## Step 2: Read past reports

Read any earlier reports in `quarry/`. Don't re-propose features Dan already built or rejected unless
the evidence has changed, and say what changed if you do.

## Step 3: Quarry candidates

Use web search to collect 15–25 candidate features. Sources:

- **Photoshop documentation** (helpx.adobe.com): which tools and jobs get deep documentation
- **Forums** (community.adobe.com, Reddit r/photoshop and r/photoshopRequest): recurring "how do I…"
  questions and complaints
- **Modern editors:** Photopea, Affinity Photo, Pixelmator Pro, and others that come up. Look
  specifically at how they do the same job with less complexity than Photoshop.

Frame each candidate as a **job**, not a Photoshop menu item. "Make a pasted-in person match the
background's light," not "Match Color."

## Step 4: Score the evidence

For each candidate, rate these signals **High / Medium / Low** with 1–3 links each. These are
proxies, not real usage numbers, and the report must say so. Never invent figures.

| Signal | What it measures |
|---|---|
| **Weight** | Documentation and tutorial depth: how central the job is |
| **Demand** | Forum question volume: how often people need it |
| **Pain** | Complaints, workarounds, confusion: where Photoshop's way is bad |
| **Leaner path** | Whether a modern tool does it more simply, and how |
| **Composite fit** | How much it serves compositing and adjusting (criteria principle 6) |
| **Feasibility** | Effort in PixelForge (S/M/L) and which foundations it needs first |

## Step 5: Judge (separate agent)

Launch a **separate subagent** as the judge. Give it only `criteria.md`, the PixelForge inventory from
Step 1, and the scored candidate list from Step 4. Don't include your own reasoning or preferences;
the judge grades the evidence, not the researcher's enthusiasm.

The judge:

1. Checks each candidate against every principle and "Never" rule in `criteria.md`.
2. Picks the **top 5–6**. At least one should be a **foundation** (e.g. masks) if any foundation is
   missing, because foundations unlock the most.
3. For each pick, writes a one-line verdict naming the principle it serves best.
4. For every candidate not picked, writes a one-line rejection with the reason, citing the
   criteria where it applies ("Never: copies Photoshop's darkroom workflow; Pixelmator's version is
   simpler").

## Step 6: Write the report

Write `quarry/YYYY-MM-DD-report.md`, and a styled `quarry/YYYY-MM-DD-report.html` with the same content
that Dan can open in a browser.

**Opening:** a 3-sentence summary of what PixelForge is missing most and why.

**One card per pick:**

```
## <Title — named for the job>
Judge's verdict: <one line, naming the principle>

Evidence
- Weight: H/M/L — <links>
- Demand: H/M/L — <links>
- Pain:   H/M/L — <links>
- Leaner path: <how a modern tool does it, with link>

Photoshop's way vs the lean way
<2–3 sentences: what's bloated about the Photoshop version, and the simpler model>

Approach
- Minimal:   <smallest useful version>
- Effective: <what most people need>
- Powerful:  <the full version>

Outcome
<what Dan can do afterward that he can't now>

Build plan (rough)
- Files: <which files change>
- Effort: S/M/L for each approach level
- Needs first: <foundations, or "nothing">
- Agent tool: <the tool name and inputs it would add>

Risks
<what could go wrong; anything that needs an AI model or a server>
```

**Then:** "Considered and rejected": every other candidate, one line each, with the judge's reason.

**Last:** a "Signals note" saying the evidence ratings are proxies from public writing, not usage
data.

## Rules

- No code changes, no branches, no commits except the report files.
- Every evidence rating needs at least one real link from this run's searches.
- If the evidence for a candidate is thin, say so and rate it Low. Don't fill gaps from memory.
- Name things for what they do. No darkroom jargon in titles.
- Finish with a one-paragraph summary in the conversation and the path to the HTML report.
