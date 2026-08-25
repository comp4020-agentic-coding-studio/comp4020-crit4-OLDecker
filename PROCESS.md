# Process overview

This file is the shape; the course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement, and its
[word counts](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#word-counts)
cover every deliverable.

## What I built

A pond you play like an instrument: a windmill sets the tempo, a ripple pulses
outward on every beat, and each pad it crosses — lily pads, flowers,
mushrooms, a rock, a stump — fires its own note and bobs, with distance from
the centre mapping to pitch and a pentatonic scale so nothing you place can
sound wrong. Pads can be dragged into position, dragged off the rim (or
deleted with the keyboard) to remove them, and added back from a palette
whose icons can be dropped directly onto the spot in the pond you want them.

## The moments that mattered

1. **The 2D pond didn't read as a real place.** A flat sprite-based layout
   looked static and the pads' relative distance from the ripple's centre —
   the whole mechanic — was hard to judge by eye. Instead of tweaking the 2D
   art further, I rebuilt the scene in Three.js so the pond is an actual
   disc in 3D space, and hit two non-obvious stack issues doing it (a Vite
   asset-path bundling gotcha, and `camera.lookAt()` not updating the matrix
   used by screen-to-world projection). Rather than just patching around
   them, I wrote both into `CLAUDE.md` so they wouldn't cost a second debug
   session, which is what told me the fix had actually generalised: the next
   features built on that camera code without re-hitting either issue.
   ([`f57d691`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-OLDecker/commit/f57d691))

2. **A visual bug that looked like the wrong cause.** Pads looked like they
   went partly transparent right as they pulsed, which pointed straight at
   the bob animation or the glTF materials. Instead of patching either, I
   checked the material flags directly (both are opaque, non-transparent)
   and caught the actual moment on a screenshot burst: a DOM ripple ring has
   to paint above the WebGL canvas to be visible at all, and by design it
   reaches each pad at almost the exact moment that pad triggers — so its
   ordinary alpha blending read as the pad itself fading. `mix-blend-mode:
   screen` fixed the read without touching that timing, and I wrote the
   stacking interaction into `CLAUDE.md` since it's exactly the kind of bug
   that gets mis-attributed to the wrong layer.
   ([`19bc89a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-OLDecker/commit/19bc89a))

3. **A feature that passed its own test and still didn't work.** I'd
   Playwright-verified a drop-off-the-pond "falls away" animation for the
   palette drag feature before shipping it, then got told it wasn't visible
   in real use. Rather than trust the same synthetic test again, I asked why
   it could pass and still be broken: a real click-drag over the button's
   emoji can arm the browser's own text-selection/drag gesture and swallow
   the pointer events my code depends on, which Playwright's synthetic mouse
   input doesn't reproduce. I re-verified with many small incremental
   pointer moves instead of one jump — closer to a real gesture — and only
   trusted the fix once that test showed the ghost actually falling.
   ([`19bc89a`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-OLDecker/commit/19bc89a))

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file. It checks that
your map is traceable, not that it is good: the marker judges whether your
small, deliberately chosen set of moments shows real judgement and reflection. A
green check is not a substitute for that curation.

Images aren't checked: whether one renders is visible the moment you look. Open
this file on GitHub and look at it before you ship.
