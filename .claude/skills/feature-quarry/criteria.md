# PixelForge — Product Criteria

**DRAFT. Dan edits this.** The feature-quarry judge reads this file on every run. It's the
definition of "better" for PixelForge. If a judgment comes back wrong, the fix usually belongs here.

---

## What PixelForge is

A lean image editor for **adjusting and compositing**: combining images, matching them, and finishing
them into one piece (key art, posters, social graphics, product shots).

## The thesis

Photoshop is powerful but bloated for this work. Much of it is built on darkroom and photo-lab
techniques (dodge and burn, channel math, levels jargon) and decades of overlapping ways to do the
same thing. You can only use it well if you already know Photoshop, or the darkroom it imitates.

Modern tools are pulling ahead by doing the same jobs with less complexity and better results.
PixelForge should be built from the **jobs people do** in Photoshop, not from Photoshop's feature list.

## Principles a feature must serve

1. **Job first.** It does something people actually need when adjusting or compositing. Name the
   job ("make two photos look shot in the same light"), not the tool ("Match Color dialog").
2. **One good way.** If PixelForge can already do the job, a second way is bloat, unless it replaces
   the first.
3. **Expert control, plain language.** Full control for someone who knows what they want, without
   darkroom vocabulary to get there. Controls named for what they do.
4. **Non-destructive by default.** Adjustments, masks and effects stay editable. Nothing is
   baked in unless the user chooses to bake it.
5. **Customizable.** Settings can be saved and reused (presets, defaults), because experts repeat
   themselves.
6. **Composite-first.** Priority goes to selecting, masking, blending, and matching color, light,
   grain and focus between images.
7. **Human and agent.** Every feature has a menu and panel version and an agent tool version
   (see the agent spec).

## Never

- Add a feature only because Photoshop has it.
- Copy a darkroom-era workflow when a modern tool does the job more simply.
- Add a feature the current code can't support cleanly without first proposing the foundation it
  needs (e.g. masks before anything that depends on masks).

## What "expert level" means here

Not more options. Fewer, better ones: fast for a professional, clear enough to learn without a
Photoshop background, and editable later.
