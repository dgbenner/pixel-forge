# Agent Stories: PixelForge

The editor shows this file under **Agent Cards › Agent Stories**
(https://dgbenner.github.io/pixel-forge/#agent-stories). It is the single source: edit it here and
the app picks up the change. The code is the source of truth for what each agent does, so check every
story against it; the app warns if the PixelForge Agent's limits stop matching `js/agent.js`.

---

## Agent Story Template

A user story extended for agents. The first line is the concept. The lines after it force the
technical decisions into the open, so they're made on purpose instead of downstream.

> **As** [who], **when** [trigger], **I want** [goal], **so that** [outcome].
> **It may:** [the actions and tools it gets]
> **It must never:** [hard rules, enforced in code]
> **It decides:** [what's left to the model's judgment]
> **It stops when:** [what counts as done, plus limits]
> **I'll know it works when:** [the test and the number]

### How to Use It

- Write the first line before anything else. If you can't, the agent isn't defined yet.
- Ask whether it needs to be an agent at all. If the steps are always the same, a fixed pipeline is
  simpler and more reliable.
- "It must never" and "It decides" are the boundary between code and model. Every "never" should be
  enforced in code, not only stated in the prompt.
- Update the story whenever the agent changes, and add a line to the changelog.

---

## PixelForge Agent

> **As** someone editing an image, **when** I type a request and press Run, **I want** it carried out
> with PixelForge's own tools, **so that** I get a result I can still adjust layer by layer.
> **It may:** read the layers, look at the canvas and any style reference, add, duplicate and delete
> its own layers, add text, hide or show layers and change their blend mode and opacity, apply
> adjustments, effects, color balance and gradients to layers it made, and, with Critic Review on, ask
> the critic for a score.
> **It must never:** paint or generate pixels, change the pixels of a layer it didn't create, delete a
> layer it didn't create, or go past 15 steps.
> **It decides:** which tools to use, in what order, with what values, and whether the result looks right.
> **It stops when:** the request is met and, with Critic Review on, scores 7 or higher; or after 15
> steps, 3 reviews, or when I press Stop. If the critic can't be reached, it finishes and says the
> result wasn't reviewed.
> **I'll know it works when:** I keep the result without redoing it, and most runs pass the critic on
> the first review.

## Feature Quarry Agent

> **As** PixelForge's designer, **when** I run /feature-quarry, **I want** researched options for what
> to build next, **so that** I build what people actually need instead of copying Photoshop.
> **It may:** read PixelForge's code, my criteria and past runs; search documentation, forums and other
> editors; hand its candidates to a separate judge; and write a dated report and add the run to the
> Feature Quarry page.
> **It must never:** change code, rate anything without a source link, or overwrite an earlier run.
> These rules live in the skill's instructions; a Claude Code skill has no code layer to enforce them.
> **It decides:** how to frame each feature as a job, the High/Medium/Low ratings, and which 5 or 6
> make the cut.
> **It stops when:** the report is written and the run is added to the Feature Quarry page.
> **I'll know it works when:** each run shows me something I didn't know and at least one feature I'd build.

---

## Changelog

- October 7, 2026 · Template heading renamed Agent Story Template.
- October 7, 2026 · Stories added to the editor under Agent Cards › Agent Stories. Checked against the
  code: PixelForge Agent gained text, style reference, layer visibility and the duplicate-first rule,
  plus the unreachable-critic stop; Feature Quarry Agent gained writing the report and run, and a note
  that its rules aren't code-enforced.
