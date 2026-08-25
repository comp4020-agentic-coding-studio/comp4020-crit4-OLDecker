# COMP4020 prototype

Your starter repo for a COMP4020 prototype: a static site in HTML/CSS/TypeScript
that builds to plain HTML/CSS/JS and deploys to GitHub Pages. The deployed site
is what gets marked, not this repo.

The
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec, and this repo's name tells you
which deliverable applies. Read both before you plan or build.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Run `pnpm check` before you push.
- Open the page in a browser and look at it. The rendered page is the truth;
  your mental model of it isn't.
- When a check fails, read its output before you change anything.
- Never commit a red state.

## The link-preview card

`public/card.png` (1200x630) is the image a shared link shows; `index.html`'s
head points at it. Replace it and the `description` meta, and copy the head
block into any new page. The card URL resolves against the page that names it,
like any link --- `./card.png` is wrong one directory down, and nothing in CI
checks it, so look at the deployed head when you add pages.

## The checks

`pnpm check` runs them (`pnpm check:evidence` is the extra gate before you
ship); CI runs the same plus links, secrets and the deploy. Read the failure.

`spec/README.md`, `PROCESS.md` and `reflections/README.md` are in this repo and
say what they are for.

## This file is yours

A starting point, not a rulebook. As you learn what your prototype needs --- a
convention the work has to hold to, a sensor that keeps catching you out (a
linter, say), a fact about the stack that is easy to get wrong --- write it down
here and wire it into `check`. Growing this file is the work.

## Stack gotchas found so far

- **Vite only rewrites asset paths in recognized HTML attributes** (`<img
  src>`, `<link href>`, etc). A path used elsewhere — a custom `data-*`
  attribute, a plain string in a `.ts` array/object — is invisible to Vite's
  bundler and 404s in `dist/` even though it works in `pnpm dev`. Use
  `new URL("./relative/path.ext", import.meta.url).href`; Vite's bundler
  statically detects that pattern, copies the file into `dist/assets/`
  (hashed), or inlines it as a `data:` URI if it's under the default 4KB
  threshold. Confirm with `find dist -iname "*.<ext>"` after a build, not
  just by trusting a green `pnpm build`.
- **Three.js: `camera.lookAt()` does not update `camera.matrixWorld` /
  `matrixWorldInverse`.** Those only refresh on the next `renderer.render()`
  call (or an explicit `camera.updateMatrixWorld()`). Any `Vector3.project()`
  or `Raycaster.setFromCamera()` call made *before* the first render uses a
  stale identity matrix and silently produces wrong (but plausible-looking,
  not NaN) coordinates. If a scene has an interactive layer synced to
  world-space positions, call `camera.updateMatrixWorld(true)` right after
  positioning the camera, not just after the first render.
- **oxlint 1.75.0's `--ignore-path` breaks on a relative path** (e.g.
  `.gitignore`), reporting "No files found to lint" — pass an absolute path
  (`"$PWD/.gitignore"`) instead. Reproduces on a clean checkout; unrelated to
  any change made here.
- No headless-browser CLI (`chromium-cli`) is installed in this environment;
  `/private/tmp/node_modules/playwright` has a cached Playwright install that
  works as a fallback for live-verifying pages with a Node driver script.
- **TypeScript's `if (x)` null-narrowing on an outer `const` does not survive
  into a hoisted `function` declaration defined later in the same block** —
  only into inline arrow-function closures. `tsc --noEmit` throws `TS18047`
  only for the function-declaration case. Bind a separate non-null alias
  (`const el = x;`) right after the narrowing `if` and use that alias inside
  any function declarations.
- **A DOM overlay and a WebGL `<canvas>` in the same container, both left at
  default `z-index: auto`, stack by DOM order, not paint order you'd guess
  from CSS alone.** If the overlay has to render on top (e.g. a ripple ring
  that needs to be visible over the canvas), its normal alpha blending will
  read as *the object beneath it fading/going transparent* at the moment they
  cross — especially damning if that crossing is timed to coincide with an
  animation on the object underneath, since the two get mistaken for one
  bug. `mix-blend-mode: screen` (light-only compositing) fixes the visual
  read without touching the underlying z-order or timing.
- **A custom pointer-event drag (`pointerdown`/`pointermove`/`pointerup`) can
  be silently hijacked by the browser's own native text-selection or
  drag-and-drop gesture on a real click-drag over text/emoji content** —
  swallowing the `pointermove` stream before the custom drag threshold ever
  fires. Playwright's synthetic `page.mouse` input does not reliably
  reproduce this, so an automated drag test can pass while the feature is
  broken for a real user. Fix: `event.preventDefault()` in `pointerdown`,
  plus `user-select: none` and `-webkit-user-drag: none` on the draggable
  element and its content.
- **Mobile Safari does not reliably treat a `pointerdown` listener as a "real"
  user gesture for unlocking `AudioContext.resume()`**, even though it fires
  normally and works for every other purpose (drag start, focus). A page that
  only calls `ctx.resume()` from `pointerdown` can render and animate
  correctly on a phone while staying permanently silent, with no error
  thrown — `resume()` just never resolves to `"running"`. `click` is the one
  event every browser (including old WebKit) honours for this, and a tap
  synthesises one after `touchend`, so register `start()` on both
  `pointerdown` (instant feedback on desktop) and `click` (the one mobile
  actually accepts), and make the resume attempt idempotent so retrying it on
  every gesture is cheap. Chromium's touch emulation (Playwright's
  `page.touchscreen`) does not reproduce this gap — it accepts `pointerdown`
  fine — so this class of bug is invisible to automated testing entirely and
  has to be reasoned about from platform behaviour, not caught by a test.
